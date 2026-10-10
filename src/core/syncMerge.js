const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export const cloneSyncValue = (value) => {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch (_) {}
  }
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; }
};

export const syncValuesEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
  catch (_) { return false; }
};

export const hasLocalSyncChange = (value, baseValue) => {
  if (baseValue === undefined) return true;
  return !syncValuesEqual(value, baseValue);
};

const entityKey = (item, index = 0, field = '') => {
  if (!item || typeof item !== 'object') return `__primitive__${index}:${String(item)}`;
  if (field === 'produtos') {
    const id = item.id !== undefined && item.id !== null ? String(item.id).trim() : '';
    const sku = item.sku !== undefined && item.sku !== null ? String(item.sku).trim().toUpperCase() : '';
    if (id) return `produto:id:${id}`;
    if (sku) return `produto:sku:${sku}`;
  }
  if (field === 'vouchers' && item.codigo) return `voucher:${String(item.codigo).trim().toUpperCase()}`;
  const candidates = [item.id, item.uid, item.codigo, item.sku, item.key, item.email];
  const selected = candidates.find(v => v !== undefined && v !== null && String(v).trim() !== '');
  return selected !== undefined ? String(selected) : `__index__${index}`;
};

const NUMERIC_DELTA_FIELDS = Object.freeze({
  produtos: new Set(['estoque', 'estoqueVitrine', 'estoqueGalpao']),
  clientes: new Set(['saldoDevedorBRL']),
  vouchers: new Set(['saldoBRL']),
  // Duas devoluções simultâneas da mesma venda não podem perder o valor já
  // devolvido pelo outro terminal. Esses acumuladores avançam por delta.
  historicoVendas: new Set(['valorDevolvidoBRL', 'custoDevolvidoBRL']),
  historicoVendasItens: new Set(['qtdDevolvida']),
});

const numericFinite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const mergeObjectThreeWay = ({ field, base = {}, local = {}, remote = {} }) => {
  const deltaFields = NUMERIC_DELTA_FIELDS[field] || new Set();
  const result = { ...(isObject(remote) ? remote : {}) };
  const keys = new Set([
    ...Object.keys(isObject(base) ? base : {}),
    ...Object.keys(isObject(local) ? local : {}),
    ...Object.keys(isObject(remote) ? remote : {}),
  ]);

  for (const key of keys) {
    const b = base?.[key];
    const l = local?.[key];
    const r = remote?.[key];
    const localChanged = !syncValuesEqual(l, b);
    if (!localChanged) continue;

    if (deltaFields.has(key)) {
      const nb = numericFinite(b);
      const nl = numericFinite(l);
      const nr = numericFinite(r);
      if (nb !== null && nl !== null && nr !== null) {
        const merged = nr + (nl - nb);
        result[key] = Math.abs(merged) < 1e-9 ? 0 : merged;
        continue;
      }
    }

    if (l === undefined) delete result[key];
    else result[key] = cloneSyncValue(l);
  }
  return result;
};

const arrayMap = (items = [], field = '') => {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => map.set(entityKey(item, index, field), item));
  return map;
};

const mergeArrayGeneric = ({ field, base = [], local = [], remote = [], entityMerger = null }) => {
  const baseMap = arrayMap(base, field);
  const localMap = arrayMap(local, field);
  const remoteMap = arrayMap(remote, field);
  const keys = [];
  const seen = new Set();
  const pushKey = (key) => { if (!seen.has(key)) { seen.add(key); keys.push(key); } };

  (Array.isArray(local) ? local : []).forEach((item, index) => pushKey(entityKey(item, index, field)));
  (Array.isArray(remote) ? remote : []).forEach((item, index) => pushKey(entityKey(item, index, field)));
  (Array.isArray(base) ? base : []).forEach((item, index) => pushKey(entityKey(item, index, field)));

  const result = [];
  for (const key of keys) {
    const hasBase = baseMap.has(key);
    const hasLocal = localMap.has(key);
    const hasRemote = remoteMap.has(key);
    const b = baseMap.get(key);
    const l = localMap.get(key);
    const r = remoteMap.get(key);

    // Entidade criada localmente.
    if (!hasBase && hasLocal) {
      if (hasRemote && isObject(l) && isObject(r)) {
        result.push(entityMerger
          ? entityMerger({ base: {}, local: l, remote: r })
          : mergeObjectThreeWay({ field, base: {}, local: l, remote: r }));
      } else result.push(cloneSyncValue(l));
      continue;
    }

    // Entidade existente foi removida localmente. Só remove se a nuvem não mudou
    // desde a BASE. Se outro terminal alterou, preserva para evitar perda silenciosa.
    if (hasBase && !hasLocal) {
      if (!hasRemote) continue;
      if (syncValuesEqual(r, b)) continue;
      result.push(cloneSyncValue(r));
      continue;
    }

    // Entidade removida remotamente, sem mudança local: respeita remoção remota.
    if (hasBase && hasLocal && !hasRemote) {
      if (syncValuesEqual(l, b)) continue;
      result.push(cloneSyncValue(l));
      continue;
    }

    if (hasBase && hasLocal && hasRemote && isObject(b) && isObject(l) && isObject(r)) {
      result.push(entityMerger
        ? entityMerger({ base: b, local: l, remote: r })
        : mergeObjectThreeWay({ field, base: b, local: l, remote: r }));
      continue;
    }

    if (hasLocal) result.push(cloneSyncValue(l));
    else if (hasRemote) result.push(cloneSyncValue(r));
  }

  return result;
};

const quantidadeProduto = (produto) => {
  const total = numericFinite(produto?.estoque);
  if (total !== null) return Math.max(0, total);
  const vitrine = numericFinite(produto?.estoqueVitrine) ?? 0;
  const galpao = numericFinite(produto?.estoqueGalpao) ?? 0;
  return Math.max(0, vitrine) + Math.max(0, galpao);
};

const mergeProdutoEntity = ({ base = {}, local = {}, remote = {} }) => {
  const merged = mergeObjectThreeWay({ field:'produtos', base, local, remote });
  const custoBase = numericFinite(base?.custoBRL);
  const custoLocal = numericFinite(local?.custoBRL);
  const custoRemote = numericFinite(remote?.custoBRL);
  const quantidadeBase = quantidadeProduto(base);
  const quantidadeLocal = quantidadeProduto(local);
  const quantidadeRemota = quantidadeProduto(remote);
  const quantidadeMesclada = quantidadeProduto(merged);

  // Merge inventory value deltas, then derive the unit average to preserve concurrent purchases/sales.
  if ([custoBase, custoLocal, custoRemote].every(custo => custo !== null) && quantidadeMesclada > 0) {
    const valorRemoto = quantidadeRemota * custoRemote;
    const deltaValorLocal = (quantidadeLocal * custoLocal) - (quantidadeBase * custoBase);
    const valorMesclado = valorRemoto + deltaValorLocal;
    if (Number.isFinite(valorMesclado) && valorMesclado >= 0) {
      merged.custoBRL = Math.round((valorMesclado / quantidadeMesclada + Number.EPSILON) * 1e8) / 1e8;
    }
  }
  return merged;
};

const mergeHistoricoVendaEntity = ({ base = {}, local = {}, remote = {} }) => {
  const merged = mergeObjectThreeWay({ field: 'historicoVendas', base, local, remote });

  // Itens da venda possuem um acumulador próprio (qtdDevolvida). Sem esse merge
  // duas devoluções concorrentes poderiam sobrescrever a quantidade uma da outra.
  if (Array.isArray(local?.itens) || Array.isArray(remote?.itens) || Array.isArray(base?.itens)) {
    merged.itens = mergeArrayGeneric({
      field: 'historicoVendasItens',
      base: Array.isArray(base?.itens) ? base.itens : [],
      local: Array.isArray(local?.itens) ? local.itens : [],
      remote: Array.isArray(remote?.itens) ? remote.itens : [],
    });
  }

  // Eventos de devolução são aditivos e têm ID próprio.
  if (Array.isArray(local?.devolucoes) || Array.isArray(remote?.devolucoes) || Array.isArray(base?.devolucoes)) {
    merged.devolucoes = mergeArrayGeneric({
      field: 'historicoVendasDevolucoes',
      base: Array.isArray(base?.devolucoes) ? base.devolucoes : [],
      local: Array.isArray(local?.devolucoes) ? local.devolucoes : [],
      remote: Array.isArray(remote?.devolucoes) ? remote.devolucoes : [],
    });
  }

  // Recalcula derivados financeiros/estado depois do merge concorrente.
  const valorDev = Number(merged.valorDevolvidoBRL || 0);
  const custoDev = Number(merged.custoDevolvidoBRL || 0);
  const bruto = Number(merged.totalBrutoBRL ?? merged.totalBRL ?? 0);
  const lucroBruto = Number(merged.lucroBrutoBRL ?? merged.lucroBRL ?? 0);
  if (Number.isFinite(bruto) && bruto >= 0 && (merged.valorDevolvidoBRL !== undefined || valorDev > 0)) {
    merged.valorDevolvidoBRL = Math.max(0, Math.min(bruto, Math.round(valorDev * 100) / 100));
    merged.totalLiquidoBRL = Math.max(0, Math.round((bruto - merged.valorDevolvidoBRL) * 100) / 100);
  }
  if (Number.isFinite(lucroBruto) && (merged.custoDevolvidoBRL !== undefined || custoDev > 0)) {
    merged.custoDevolvidoBRL = Math.max(0, Math.round(custoDev * 100) / 100);
    merged.lucroLiquidoBRL = Math.round((lucroBruto - (Number(merged.valorDevolvidoBRL || 0) - merged.custoDevolvidoBRL)) * 100) / 100;
  }

  if (Array.isArray(merged.itens) && merged.itens.length > 0) {
    const mercadorias = merged.itens.filter(it => Number(it?.qtd || 0) > 0);
    const alguma = mercadorias.some(it => Number(it?.qtdDevolvida || 0) > 0);
    const todas = mercadorias.length > 0 && mercadorias.every(it => Number(it?.qtdDevolvida || 0) >= Number(it?.qtd || 0));
    if (todas) merged.estado = 'cancelada';
    else if (alguma) merged.estado = 'parcial';
  }

  return merged;
};

/**
 * Merge de três vias para listas V1.
 * - BASE: último valor confirmado/aplicado da nuvem neste terminal.
 * - LOCAL: estado atual após a ação do usuário.
 * - REMOTE: valor mais recente lido dentro da transação Firestore.
 *
 * Preserva entidades criadas por outros terminais e aplica apenas a diferença local.
 * Campos monetários/estoque críticos usam delta quando apropriado para evitar perda
 * por "last write wins" em alterações concorrentes.
 */
export const mergeArrayThreeWay = ({ field, base = [], local = [], remote = [] }) => {
  return mergeArrayGeneric({
    field,
    base,
    local,
    remote,
    entityMerger: field === 'historicoVendas'
      ? mergeHistoricoVendaEntity
      : field === 'produtos'
        ? mergeProdutoEntity
        : null,
  });
};

export const mergeV1FieldThreeWay = ({ field, baseValue, localValue, remoteValue }) => {
  if (Array.isArray(localValue)) {
    return mergeArrayThreeWay({
      field,
      base: Array.isArray(baseValue) ? baseValue : [],
      local: localValue,
      remote: Array.isArray(remoteValue) ? remoteValue : [],
    });
  }

  if (isObject(localValue) && isObject(remoteValue)) {
    return mergeObjectThreeWay({
      field,
      base: isObject(baseValue) ? baseValue : {},
      local: localValue,
      remote: remoteValue,
    });
  }

  // Escalares: se o local não mudou desde a BASE, mantém a nuvem; caso contrário,
  // a ação local explícita vence.
  return syncValuesEqual(localValue, baseValue) ? cloneSyncValue(remoteValue) : cloneSyncValue(localValue);
};
