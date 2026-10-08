import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { zenosStorage } from './storage.js';
import { getV1OperationPath, notifyPersistenceStatus, safeSetLocalJson } from './persistenceSafety.js';
import { cloneSyncValue, mergeV1FieldThreeWay, syncValuesEqual } from './syncMerge.js';
import { criarLancamentoFinanceiro } from './financialLedgerCore.js';
import { calcularResumoSessao } from './cashSession.js';

// ATT 10.2: proteção local contra loops/eco. Os limites são deliberadamente
// conservadores: uma operação real pode alterar muitos campos, mas deve gerar
// apenas UM commit operacional por ação do usuário.
const WRITE_WINDOW_MS = 60_000;
const MAX_WRITES_GLOBAL_PER_WINDOW = 30;
const MAX_WRITES_FIELD_PER_WINDOW = 12;
const QUOTA_COOLDOWN_MS = 10 * 60_000;
const V1_DOC_WARN_BYTES = 700_000;
const V1_DOC_HARD_BYTES = 930_000;
const RECENT_OPERATION_KEYS_LIMIT = 120;

const writeAttempts = [];
const writeAttemptsByField = new Map();
let quotaBlockedUntil = 0;

const pruneWriteWindow = (now) => {
  while (writeAttempts.length && writeAttempts[0] < now - WRITE_WINDOW_MS) writeAttempts.shift();
  for (const [field, list] of writeAttemptsByField.entries()) {
    while (list.length && list[0] < now - WRITE_WINDOW_MS) list.shift();
    if (list.length === 0) writeAttemptsByField.delete(field);
  }
};

const quotaError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('resource-exhausted') || message.includes('quota exceeded') || message.includes('resource exhausted');
};

const consumeWriteBudget = (field) => {
  const now = Date.now();
  if (quotaBlockedUntil > now) {
    const error = new Error('Proteção de quota ativa: o Firestore rejeitou gravações recentemente. Aguarde alguns minutos ou verifique o plano/uso antes de tentar novamente.');
    error.code = 'ZENOS_FIRESTORE_QUOTA_COOLDOWN';
    return { ok: false, error };
  }
  pruneWriteWindow(now);
  const byField = writeAttemptsByField.get(field) || [];
  if (writeAttempts.length >= MAX_WRITES_GLOBAL_PER_WINDOW || byField.length >= MAX_WRITES_FIELD_PER_WINDOW) {
    const error = new Error(`Proteção anti-loop ativada: excesso de gravações no campo "${field}" em menos de 1 minuto.`);
    error.code = 'ZENOS_SYNC_CIRCUIT_OPEN';
    return { ok: false, error };
  }
  writeAttempts.push(now);
  byField.push(now);
  writeAttemptsByField.set(field, byField);
  return { ok: true, error: null };
};

const metricKey = () => `zenos_sync_metrics_${new Date().toISOString().slice(0, 10)}`;
export const recordSyncMetric = (kind, field = 'global', amount = 1) => {
  try {
    const key = metricKey();
    const current = JSON.parse(zenosStorage.getItem(key) || '{}');
    current[kind] = (Number(current[kind]) || 0) + amount;
    current.byField = current.byField || {};
    current.byField[field] = current.byField[field] || {};
    current.byField[field][kind] = (Number(current.byField[field][kind]) || 0) + amount;
    current.updatedAt = new Date().toISOString();
    zenosStorage.setItem(key, JSON.stringify(current));
  } catch (_) {}
};

export const getTodaySyncMetrics = () => {
  try { return JSON.parse(zenosStorage.getItem(metricKey()) || '{}'); }
  catch (_) { return {}; }
};

const estimateJsonBytes = (value) => {
  try {
    const json = JSON.stringify(value ?? null);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).byteLength;
    return unescape(encodeURIComponent(json)).length;
  } catch (_) {
    return 0;
  }
};

const assertV1DocumentSize = (data, payload, syncMeta) => {
  const estimated = estimateJsonBytes({ ...(data || {}), ...(payload || {}), _syncMeta: { ...(syncMeta || {}), updatedAtServer: null } });
  if (estimated > 0) {
    recordSyncMetric('operationDocBytesObserved', 'operacao_v1', estimated);
    try { zenosStorage.setItem('zenos_v1_operation_doc_last_bytes', String(estimated)); } catch (_) {}
  }
  if (estimated >= V1_DOC_HARD_BYTES) {
    const error = new Error(`Documento operacional V1 próximo do limite técnico do Firestore (${Math.round(estimated / 1024)} KiB). Operação bloqueada para evitar corrupção/falha de gravação; migração V2 é obrigatória.`);
    error.code = 'ZENOS_V1_DOC_NEAR_LIMIT';
    throw error;
  }
  if (estimated >= V1_DOC_WARN_BYTES) recordSyncMetric('operationDocNearLimit', 'operacao_v1');
  return estimated;
};

const findEntity = (items, entityId, key = null) => {
  const target = String(entityId ?? '');
  return (Array.isArray(items) ? items : []).find(item => {
    if (!item || typeof item !== 'object') return false;
    if (key) return String(item?.[key] ?? '') === target;
    return [item.id, item.uid, item.codigo, item.sku, item.email].some(v => v !== undefined && v !== null && String(v) === target);
  }) || null;
};

const failGuard = (message, code = 'ZENOS_CONCURRENT_CONFLICT') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const assertBusinessGuards = (data, guards = []) => {
  for (const guard of guards || []) {
    if (!guard?.type) continue;
    if (guard.type === 'entity_field_equals') {
      const entity = findEntity(data?.[guard.field], guard.entityId, guard.entityKey);
      const actual = entity?.[guard.property];
      if (!entity || !syncValuesEqual(actual, guard.expected)) {
        failGuard(guard.message || `O registro ${guard.entityId} mudou em outro terminal. Atualize a tela e tente novamente.`);
      }
    } else if (guard.type === 'entity_unchanged') {
      const entity = findEntity(data?.[guard.field], guard.entityId, guard.entityKey);
      if (!entity || !syncValuesEqual(entity, guard.expected)) {
        failGuard(guard.message || `O registro ${guard.entityId} foi alterado em outro terminal. Atualize a tela antes de continuar.`, 'ZENOS_ENTITY_CHANGED_REMOTE');
      }
    } else if (guard.type === 'numeric_at_least') {
      const entity = findEntity(data?.[guard.field], guard.entityId, guard.entityKey);
      const actual = Number(entity?.[guard.property] || 0);
      const required = Number(guard.amount || 0);
      if (!entity || !Number.isFinite(actual) || actual + 0.000001 < required) {
        failGuard(guard.message || `Saldo/quantidade de ${guard.entityId} mudou em outro terminal.`, 'ZENOS_CONCURRENT_INSUFFICIENT_VALUE');
      }
    } else if (guard.type === 'cash_session_open') {
      const session = findEntity(data?.sessoesCaixa, guard.sessionId, 'id');
      if (!session || session.status !== 'aberta') {
        failGuard(guard.message || 'O turno de caixa foi fechado ou alterado em outro terminal.', 'ZENOS_CASH_SESSION_NOT_OPEN');
      }
    } else if (guard.type === 'cash_balance_at_least') {
      const session = findEntity(data?.sessoesCaixa, guard.sessionId, 'id');
      if (!session || session.status !== 'aberta') {
        failGuard(guard.message || 'O turno de caixa foi fechado ou alterado em outro terminal.', 'ZENOS_CASH_SESSION_NOT_OPEN');
      }
      const resumo = calcularResumoSessao({ sessao:session, historicoVendas:data?.historicoVendas || [], caixaMovimentos:data?.caixaMovimentos || [] });
      const disponivel = Number(resumo?.saldoEsperado || 0);
      const necessario = Number(guard.amount || 0);
      if (!Number.isFinite(disponivel) || disponivel + 0.000001 < necessario) {
        failGuard(guard.message || `Saldo físico do caixa mudou em outro terminal. Disponível: ${disponivel.toFixed(2)}.`, 'ZENOS_CASH_BALANCE_CONFLICT');
      }
    } else if (guard.type === 'no_open_cash_session_for_operator') {
      const hasOpen = (Array.isArray(data?.sessoesCaixa) ? data.sessoesCaixa : []).some(s => String(s?.operadorId) === String(guard.operatorId) && s?.status === 'aberta');
      if (hasOpen) failGuard(guard.message || 'Já existe um turno de caixa aberto para este operador.', 'ZENOS_CASH_SESSION_ALREADY_OPEN');
    } else if (guard.type === 'sale_return_capacity') {
      const sale = findEntity(data?.historicoVendas, guard.saleId, 'id');
      if (!sale) failGuard('A venda não existe mais no histórico remoto.', 'ZENOS_SALE_NOT_FOUND');
      if (sale.estado === 'cancelada') failGuard('A venda já foi totalmente devolvida em outro terminal.', 'ZENOS_SALE_ALREADY_RETURNED');
      for (const requested of guard.items || []) {
        const item = findEntity(sale.itens, requested.itemId, 'id') || findEntity(sale.itens, requested.produtoOriginalId, 'produtoOriginalId');
        const remaining = Math.max(0, Number(item?.qtd || 0) - Number(item?.qtdDevolvida || 0));
        if (!item || remaining + 0.000001 < Number(requested.quantity || 0)) {
          failGuard(`A quantidade disponível para devolução de "${requested.name || requested.itemId}" mudou em outro terminal.`, 'ZENOS_RETURN_QUANTITY_CONFLICT');
        }
      }
    } else if (guard.type === 'client_credit_capacity') {
      const client = findEntity(data?.clientes, guard.clientId, 'id');
      if (!client) failGuard('O cliente não existe mais na nuvem.', 'ZENOS_CLIENT_NOT_FOUND');
      const saldo = Number(client.saldoDevedorBRL || 0);
      const limite = Number(client.limiteCreditoBRL || 0);
      const delta = Number(guard.amount || 0);
      if (!(limite > 0) || saldo + delta > limite + 0.000001) {
        failGuard(guard.message || `O limite de crédito do cliente mudou em outro terminal. Saldo atual: ${saldo.toFixed(2)}.`, 'ZENOS_CREDIT_LIMIT_CONFLICT');
      }
    } else if (guard.type === 'voucher_balance_at_least') {
      const voucher = findEntity(data?.vouchers, guard.code, 'codigo');
      const saldo = Number(voucher?.saldoBRL || 0);
      if (!voucher || voucher.status !== 'ativo' || saldo + 0.000001 < Number(guard.amount || 0)) {
        failGuard(guard.message || `O voucher ${guard.code} foi usado ou não possui mais saldo suficiente.`, 'ZENOS_VOUCHER_CONFLICT');
      }
    }
  }
};

const assertStockEventsAgainstRemote = (data, stockEvents = []) => {
  for (const event of stockEvents || []) {
    if (event?.tipo !== 'venda') continue;
    const product = findEntity(data?.produtos, event.produtoId, 'id') || findEntity(data?.produtos, event.sku, 'sku');
    if (!product) failGuard(`Produto da venda não existe mais no catálogo: ${event?.produtoNome || event?.produtoId || event?.sku || 'produto'}.`, 'ZENOS_PRODUCT_NOT_FOUND_REMOTE');
    const needShowcase = Math.max(0, Number(event?.detalhes?.vitrine || 0));
    const needWarehouse = Math.max(0, Number(event?.detalhes?.deposito || event?.detalhes?.galpao || 0));
    const show = Number(product?.estoqueVitrine ?? 0);
    const warehouse = Number(product?.estoqueGalpao ?? product?.estoque ?? 0);
    if (show + 0.000001 < needShowcase || warehouse + 0.000001 < needWarehouse) {
      failGuard(`Estoque de "${product?.nome || event?.produtoNome || event?.produtoId}" mudou em outro terminal. Venda não finalizada.`, 'ZENOS_STOCK_CONFLICT');
    }
  }
};

const assertUniqueEntities = (field, list) => {
  if (!Array.isArray(list)) return;
  const seen = new Set();
  for (const item of list) {
    const raw = field === 'vouchers' ? item?.codigo : item?.id;
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const key = String(raw).trim().toUpperCase();
    if (seen.has(key)) failGuard(`Identificador duplicado detectado em ${field}: ${raw}.`, 'ZENOS_DUPLICATE_ENTITY_ID');
    seen.add(key);
  }
};

const assertMergedFieldInvariants = ({ field, mergedValue, baseValue, localValue }) => {
  assertUniqueEntities(field, mergedValue);
  if (!Array.isArray(mergedValue)) return;

  if (field === 'produtos') {
    const locallyChanged = new Set((Array.isArray(localValue) ? localValue : []).filter((item, index) => {
      const base = findEntity(baseValue, item?.id, 'id') || findEntity(baseValue, item?.sku, 'sku');
      return !base || !syncValuesEqual(base, item);
    }).map(item => String(item?.id ?? item?.sku ?? '')));
    for (const product of mergedValue) {
      const id = String(product?.id ?? product?.sku ?? '');
      if (!locallyChanged.has(id)) continue;
      for (const prop of ['estoque', 'estoqueVitrine', 'estoqueGalpao']) {
        if (product?.[prop] !== undefined && Number(product[prop]) < -0.000001) {
          failGuard(`Estoque negativo bloqueado em "${product?.nome || id}" (${prop}).`, 'ZENOS_NEGATIVE_STOCK_BLOCKED');
        }
      }
    }
  }

  if (field === 'clientes') {
    for (const client of mergedValue) {
      if (Number(client?.saldoDevedorBRL || 0) < -0.000001) failGuard(`Saldo devedor negativo bloqueado para ${client?.nome || client?.id}.`, 'ZENOS_NEGATIVE_CLIENT_BALANCE');
    }
  }
  if (field === 'vouchers') {
    for (const voucher of mergedValue) {
      if (Number(voucher?.saldoBRL || 0) < -0.000001) failGuard(`Saldo negativo bloqueado no voucher ${voucher?.codigo || ''}.`, 'ZENOS_NEGATIVE_VOUCHER_BALANCE');
    }
  }
};

const normalizeRecentOperationKeys = (syncMeta) => Array.isArray(syncMeta?.recentOperationKeys) ? syncMeta.recentOperationKeys.map(String) : [];
const appendOperationKey = (syncMeta, operationKey) => {
  if (!operationKey) return syncMeta;
  const current = normalizeRecentOperationKeys(syncMeta).filter(k => k !== String(operationKey));
  current.push(String(operationKey));
  return { ...syncMeta, recentOperationKeys: current.slice(-RECENT_OPERATION_KEYS_LIMIT) };
};

const persistConfirmedLocalCache = (changes, values) => {
  const results = new Map();
  for (const change of changes || []) {
    const confirmed = values?.[change.field] === undefined ? change.value : values[change.field];
    const localResult = change.localStorageKey ? safeSetLocalJson(change.localStorageKey, confirmed) : { ok: true, error: null };
    results.set(change.field, localResult);
  }
  return results;
};

/**
 * ATT 10.2 — commit atômico de um ou mais campos sobre o schema V1 existente.
 * A nuvem é confirmada ANTES do cache local para evitar falso sucesso quando há
 * quota/rede indisponível. Este caminho é usado para alterações reativas simples.
 */
export const persistV1OperationFieldsSafe = async ({ db, userId, changes = [] }) => {
  const valid = (changes || []).filter(c => c?.field);
  if (!db || !userId || valid.length === 0) {
    const error = new Error('Persistência V1 segura chamada sem db, userId ou alterações.');
    notifyPersistenceStatus({ status: 'ERRO', field: 'operacao_batch', error: error.message });
    return { ok: false, cloudOk: false, error, values: {}, revisions: {} };
  }

  const dirty = [];
  for (const change of valid) {
    if (change.baseValue !== undefined && syncValuesEqual(change.value, change.baseValue)) recordSyncMetric('writesSkipped', change.field);
    else dirty.push(change);
  }

  if (dirty.length === 0) {
    const values = Object.fromEntries(valid.map(c => [c.field, cloneSyncValue(c.value)]));
    const locals = persistConfirmedLocalCache(valid, values);
    return { ok: [...locals.values()].every(r => r.ok), cloudOk: true, skipped: true, values, revisions: {} };
  }

  const budget = consumeWriteBudget('operacao_batch');
  if (!budget.ok) {
    dirty.forEach(c => recordSyncMetric('circuitBlocks', c.field));
    notifyPersistenceStatus({ status: 'PENDENTE', field: 'operacao_batch', cloudOk: false, error: budget.error.message });
    return { ok: false, cloudOk: false, error: budget.error, circuitOpen: true, values: {}, revisions: {} };
  }

  notifyPersistenceStatus({ status: 'SALVANDO', field: 'operacao_batch' });
  recordSyncMetric('writeAttempts', 'operacao_batch');

  try {
    const persisted = await runTransaction(db, async (tx) => {
      const ref = doc(db, ...getV1OperationPath(userId));
      const snap = await tx.get(ref);
      const data = snap.exists() ? (snap.data() || {}) : {};
      const payload = {};
      let syncMeta = data?._syncMeta || {};
      const revisions = { ...(syncMeta.fieldRevisions || {}) };
      const values = {};

      for (const change of dirty) {
        const mergedValue = mergeV1FieldThreeWay({ field: change.field, baseValue: change.baseValue, localValue: change.value, remoteValue: data[change.field] });
        assertMergedFieldInvariants({ field: change.field, mergedValue, baseValue: change.baseValue, localValue: change.value });
        payload[change.field] = mergedValue;
        values[change.field] = cloneSyncValue(mergedValue);
        revisions[change.field] = (Number(revisions[change.field]) || 0) + 1;
      }

      syncMeta = {
        ...syncMeta,
        lastField: dirty.length === 1 ? dirty[0].field : 'operacao_batch',
        fieldRevisions: revisions,
        updatedAtClient: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      };
      const estimatedBytes = assertV1DocumentSize(data, payload, syncMeta);
      tx.set(ref, { ...payload, _syncMeta: syncMeta }, { merge: true });
      return { values, revisions, estimatedBytes };
    });

    const localResults = persistConfirmedLocalCache(valid, persisted.values);
    recordSyncMetric('writesOk', 'operacao_batch');
    recordSyncMetric('estimatedBilledWrites', 'operacao_batch', 1);
    const localOk = [...localResults.values()].every(r => r.ok);
    notifyPersistenceStatus({ status: localOk ? 'SINCRONIZADO' : 'ERRO', field: 'operacao_batch', cloudOk: true, localOk });
    return { ok: localOk, localOk, cloudOk: true, values: persisted.values, revisions: persisted.revisions, estimatedBytes: persisted.estimatedBytes };
  } catch (error) {
    console.error('[ZenOS ATT10.2] Falha no commit operacional:', error);
    if (quotaError(error)) {
      quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      recordSyncMetric('quotaErrors', 'operacao_batch');
    }
    recordSyncMetric('writeErrors', 'operacao_batch');
    notifyPersistenceStatus({ status: 'PENDENTE', field: 'operacao_batch', cloudOk: false, error: error?.message || String(error) });
    return { ok: false, cloudOk: false, error, values: {}, revisions: {} };
  }
};

export const persistV1OperationFieldSafe = async ({ db, userId, field, value, baseValue, localStorageKey }) => {
  const result = await persistV1OperationFieldsSafe({ db, userId, changes: [{ field, value, baseValue, localStorageKey }] });
  return { ...result, value: result.values?.[field], revision: result.revisions?.[field] ?? null };
};

const sanitizeDocId = (value) => String(value ?? 'sem-id').replaceAll('/', '_');

/**
 * Commit atômico de operação comercial crítica.
 * Documento operacional + Livro Financeiro + auditoria de estoque avançam juntos.
 * Guards são verificados DENTRO da transação contra o valor remoto mais recente.
 * operationKey fornece idempotência recente sem write extra: a chave fica em _syncMeta.
 */
export const persistV1BusinessOperationSafe = async ({
  db,
  userId,
  changes = [],
  financialEntries = [],
  stockEvents = [],
  guards = [],
  operationKey = null,
}) => {
  const valid = (changes || []).filter(c => c?.field);
  const financialWriteCount = (financialEntries || []).filter(x => Number(x?.valor) > 0).length;
  const stockWriteCount = (stockEvents || []).filter(x => x?.id && x?.produtoId != null).length;
  const estimatedAtomicWrites = 1 + financialWriteCount + stockWriteCount;
  if (estimatedAtomicWrites > 450) {
    const error = new Error(`Operação muito grande para confirmação atômica (${estimatedAtomicWrites} gravações). Divida em lotes menores.`);
    error.code = 'ZENOS_ATOMIC_WRITE_LIMIT';
    notifyPersistenceStatus({ status:'ERRO', field:'operacao_critica', error:error.message });
    return { ok:false, cloudOk:false, error, values:{}, revisions:{} };
  }
  if (!db || !userId || valid.length === 0) {
    const error = new Error('Operação crítica sem loja ou alterações operacionais.');
    notifyPersistenceStatus({ status:'ERRO', field:'operacao_critica', error:error.message });
    return { ok:false, cloudOk:false, error, values:{}, revisions:{} };
  }

  const budget = consumeWriteBudget('operacao_critica');
  if (!budget.ok) {
    recordSyncMetric('circuitBlocks', 'operacao_critica');
    notifyPersistenceStatus({ status:'PENDENTE', field:'operacao_critica', cloudOk:false, error:budget.error.message });
    return { ok:false, cloudOk:false, error:budget.error, circuitOpen:true, values:{}, revisions:{} };
  }

  notifyPersistenceStatus({ status:'SALVANDO', field:'operacao_critica' });
  recordSyncMetric('writeAttempts', 'operacao_critica');

  try {
    const result = await runTransaction(db, async tx => {
      const operationRef = doc(db, ...getV1OperationPath(userId));
      const snap = await tx.get(operationRef);
      const data = snap.exists() ? (snap.data() || {}) : {};
      const existingSyncMeta = data?._syncMeta || {};
      const recentKeys = normalizeRecentOperationKeys(existingSyncMeta);

      if (operationKey && recentKeys.includes(String(operationKey))) {
        const values = Object.fromEntries(valid.map(change => [change.field, cloneSyncValue(data?.[change.field] ?? change.value)]));
        return {
          values,
          revisions: { ...(existingSyncMeta.fieldRevisions || {}) },
          financeiroNormalizado: [],
          alreadyCommitted: true,
          estimatedBytes: estimateJsonBytes(data),
        };
      }

      assertBusinessGuards(data, guards);
      assertStockEventsAgainstRemote(data, stockEvents);

      const payload = {};
      const revisions = { ...(existingSyncMeta.fieldRevisions || {}) };
      const values = {};
      for (const change of valid) {
        const mergedValue = mergeV1FieldThreeWay({ field: change.field, baseValue: change.baseValue, localValue: change.value, remoteValue: data[change.field] });
        assertMergedFieldInvariants({ field: change.field, mergedValue, baseValue: change.baseValue, localValue: change.value });
        payload[change.field] = mergedValue;
        values[change.field] = cloneSyncValue(mergedValue);
        revisions[change.field] = (Number(revisions[change.field]) || 0) + 1;
      }

      let syncMeta = {
        ...existingSyncMeta,
        lastField: 'operacao_critica',
        fieldRevisions: revisions,
        updatedAtClient: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      };
      syncMeta = appendOperationKey(syncMeta, operationKey);
      const estimatedBytes = assertV1DocumentSize(data, payload, syncMeta);
      tx.set(operationRef, { ...payload, _syncMeta: syncMeta }, { merge:true });

      const financeiroNormalizado = [];
      for (const entry of financialEntries || []) {
        if (!entry || !(Number(entry.valor) > 0)) continue;
        const normalized = criarLancamentoFinanceiro({ ...entry, lojaId: userId });
        financeiroNormalizado.push(normalized);
        tx.set(doc(db, 'lojas', String(userId), 'financeiro_livro', sanitizeDocId(normalized.id)), { ...normalized, serverRecordedAt: serverTimestamp() }, { merge:true });
      }

      for (const evento of stockEvents || []) {
        if (!evento?.id || evento?.produtoId == null) continue;
        const auditKey = sanitizeDocId(evento.produtoAuditKey || `${evento.produtoId}-${evento.sku || ''}`);
        tx.set(doc(db, 'lojas', String(userId), 'estoque_auditoria', auditKey, 'movimentos', sanitizeDocId(evento.id)), { ...evento, serverRecordedAt: serverTimestamp() }, { merge:false });
      }

      return { values, revisions, financeiroNormalizado, alreadyCommitted:false, estimatedBytes };
    });

    const localResults = persistConfirmedLocalCache(valid, result.values);
    const localOk = [...localResults.values()].every(r => r.ok);
    if (result.alreadyCommitted) recordSyncMetric('idempotentReplays', 'operacao_critica');
    else {
      recordSyncMetric('writesOk', 'operacao_critica');
      recordSyncMetric('estimatedBilledWrites', 'operacao_critica', estimatedAtomicWrites);
    }
    notifyPersistenceStatus({ status: localOk ? 'SINCRONIZADO' : 'ERRO', field:'operacao_critica', cloudOk:true, localOk });
    return {
      ok:localOk,
      localOk,
      cloudOk:true,
      values:result.values,
      revisions:result.revisions,
      financialEntries:result.financeiroNormalizado,
      alreadyCommitted:!!result.alreadyCommitted,
      estimatedBytes:result.estimatedBytes,
    };
  } catch (error) {
    console.error('[ZenOS ATT10.2] Operação crítica não confirmada:', error);
    if (quotaError(error)) {
      quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      recordSyncMetric('quotaErrors', 'operacao_critica');
    }
    recordSyncMetric('writeErrors', 'operacao_critica');
    notifyPersistenceStatus({ status:'PENDENTE', field:'operacao_critica', cloudOk:false, error:error?.message || String(error) });
    return { ok:false, cloudOk:false, error, values:{}, revisions:{} };
  }
};
