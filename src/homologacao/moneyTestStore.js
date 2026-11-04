import { createPriceBook } from '../core/moneyOperations.js';
import { money, assertMoney, compare } from '../core/money.js';
import { moneyHash, stableMoneyJson } from '../core/moneyLegacy.js';
import { projectProductMoney, legacyDecimal } from '../core/moneyProductBridge.js';
export const MONEY_TEST_TENANT = 'synthetic-money-test-only';
export const MONEY_TEST_KEY = 'zenos_money_homologacao_v2';
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const copy = value => structuredClone(value);
export function initialMoneyTestState() {
  const at = new Date().toISOString();
  const native = (amount, currency = 'PYG') => money(amount, currency, 'synthetic-fixture');
  const product = { id: 'fixture-massa-39990', sku: 'TESTE-39990', nome: 'MASSA — TESTE 39.990',
    tipoItem: 'mercadoria', unidadeMedida: 'UN', grupo: 'Massas e Complementos', marca: 'DADOS FICTÍCIOS',
    ativo: true, estoque: 20, estoqueVitrine: 20, estoqueGalpao: 0, habilitarPreco2: true,
    moneyPrices: createPriceBook({ tenantId: MONEY_TEST_TENANT, id: 'fixture-massa-39990', actor: 'admin', createdAt: at,
      values: { cost: native('20000'), sale: native('39990'), wholesale: native('38000'), price3: native('0') } }) };
  const rates = { BRL: 1, PYG: 230, USD: 0.2, EUR: 0.18 };
  return { schemaVersion: 2, revision: 0, moedaPadrao: 'PYG', rates,
    produtos: [projectProductMoney(product, rates, at), { id:'fixture-ambiguous',sku:'TESTE-LEGADO',nome:'LEGADO — MOEDA A CONFERIR',
      tipoItem:'mercadoria',unidadeMedida:'UN',ativo:true,grupo:'Geral',estoque:5,estoqueVitrine:5,estoqueGalpao:0,custoBRL:20000,precoBRL:39990 }],
    clientes: [], historicoVendas: [], vouchers: [], financialEntries: [], stockEvents: [], recentOperations: [],
    sessoesCaixa: [{ id: 'fixture-shift', status: 'aberta', operadorId:'admin', operadorNome:'Administrador de teste', createdAt:at }], preferenceAudit: [] };
}
export function createMoneyTestStore(storage, withLock) {
  const listeners = new Set();
  const read = () => {
    const raw = storage.getItem(MONEY_TEST_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.schemaVersion !== 2 || !Number.isSafeInteger(state.revision) || !Array.isArray(state.produtos)) fail('MONEY_TEST_SCHEMA','Dados de teste incompatíveis.');
      return state;
    }
    return initialMoneyTestState();
  };
  // The first fixture is persisted once. No production data is read or imported.
  if (!storage.getItem(MONEY_TEST_KEY)) storage.setItem(MONEY_TEST_KEY, JSON.stringify(initialMoneyTestState()));
  const subscribe = callback => { listeners.add(callback); return () => listeners.delete(callback); };
  const publish = () => { const current = read(); for (const l of listeners) l(current); };
  const lock = task => {
    if (typeof withLock !== 'function') fail('MONEY_TEST_LOCK', 'Este navegador precisa suportar Web Locks para salvar com segurança na homologação.');
    return withLock(MONEY_TEST_KEY, task);
  };
  const commit = (operation, expectedRevision) => lock(async () => {
    try {
      const current = read();
      const fingerprint = await moneyHash(operation);
      const previous = operation.operationKey && current.recentOperations.find(op => op.key === operation.operationKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('MONEY_TEST_IDEMPOTENCY','A mesma chave contém outra operação.');
        return { cloudOk: true, localTestOnly: true, values: copy(current) };
      }
      if (current.revision !== expectedRevision) fail('MONEY_TEST_CONFLICT','Dados de teste mudaram em outra aba. Recarregue e confira antes de salvar.');
      const next = copy(current);
      for (const guard of operation.guards || []) {
        if (guard.type === 'cash_session_open') {
          if (!current.sessoesCaixa.some(s => s.id === guard.sessionId && s.status === 'aberta')) fail('MONEY_TEST_SHIFT','Turno de teste fechado.');
        } else fail('MONEY_TEST_UNSUPPORTED_GUARD','Este fluxo ainda não está habilitado na homologação multimoeda.');
      }
      for (const change of operation.changes || []) {
        if (!['produtos','historicoVendas','vouchers'].includes(change.field)) fail('MONEY_TEST_SCOPE','Clientes, fiado e demais módulos ainda não estão liberados nesta versão de teste.');
        if (!Array.isArray(change.value)) fail('MONEY_TEST_PAYLOAD','Lista de teste inválida.');
        next[change.field] = copy(change.value);
      }
      // The POS only receives proven/native products. Never drop the legacy
      // records hidden from that search when committing stock or quick entries.
      for(const old of current.produtos) if(!next.produtos.some(p=>p.id===old.id)) next.produtos.push(copy(old));
      const ids = new Set(), skus = new Set();
      next.produtos = next.produtos.map(p => {
        if (!p.id || !p.sku || ids.has(String(p.id)) || skus.has(String(p.sku).toUpperCase())) fail('MONEY_TEST_DUPLICATE','ID ou SKU duplicado.');
        ids.add(String(p.id)); skus.add(String(p.sku).toUpperCase());
        const old = current.produtos.find(v => String(v.id) === String(p.id));
        if (p.moneyPrices) {
          if (p.moneyPrices.tenantId !== MONEY_TEST_TENANT || p.moneyPrices.id !== p.id) fail('MONEY_TEST_TENANT','Cadastro de outra empresa.');
          Object.values(p.moneyPrices.values).forEach(assertMoney);
          if (old?.moneyPrices?.revision === p.moneyPrices.revision) {
            if (stableMoneyJson(old.moneyPrices) !== stableMoneyJson(p.moneyPrices)) fail('MONEY_TEST_PRICE_REVISION','Preço mudou sem revisão.');
            // Stock-only operations must not persist live display projections.
            return { ...p, ...Object.fromEntries(['custoBRL','precoBRL','preco2BRL','preco3BRL','moneyCompatibility'].filter(k=>old[k]!==undefined).map(k=>[k,old[k]])) };
          }
          if (old && p.moneyPrices.revision !== (old.moneyPrices?.revision || 0) + 1) fail('MONEY_TEST_PRICE_REVISION','Revisão inválida.');
        } else if (!old || ['custoBRL','precoBRL','preco2BRL','preco3BRL'].some(k => (p[k]??0) !== (old[k]??0))) fail('MONEY_LEGACY_AMBIGUOUS','Valores legados sem moeda comprovada foram preservados.');
        return p;
      });
      for (const sale of next.historicoVendas) {
        if (sale.moneySnapshot?.tenantId !== MONEY_TEST_TENANT || !sale.moneySnapshot?.total) fail('MONEY_TEST_SNAPSHOT','Documento sem snapshot monetário.');
        if (sale.pagamentos?.some(p => ['crediario','voucher'].includes(p.formaId))) fail('MONEY_TEST_SCOPE','Fiado e vouchers ainda não estão liberados nesta homologação.');
        const old = current.historicoVendas.find(v => v.id === sale.id);
        if (old && stableMoneyJson(old) !== stableMoneyJson(sale)) fail('MONEY_TEST_IMMUTABLE','Documento salvo não pode ser reescrito nesta versão de teste.');
      }
      next.financialEntries.push(...copy(operation.financialEntries || []));
      next.stockEvents.push(...copy(operation.stockEvents || []));
      if (operation.operationKey) next.recentOperations = [...next.recentOperations, { key: operation.operationKey, fingerprint }].slice(-100);
      next.revision++;
      storage.setItem(MONEY_TEST_KEY, JSON.stringify(next)); // throws before ACK on quota failure
      publish();
      return { cloudOk:true,localTestOnly:true,values:copy(next) };
    } catch (error) { return { cloudOk:false, localTestOnly:true, error }; }
  });
  const configure = (patch, expectedRevision) => lock(async () => {
    const current = read();
    if (current.revision !== expectedRevision) fail('MONEY_TEST_CONFLICT','Configuração mudou em outra aba.');
    const next = { ...current, revision: current.revision + 1 };
    if (patch.moedaPadrao) {
      if (!['BRL','PYG','USD','EUR'].includes(patch.moedaPadrao)) fail('MONEY_CURRENCY','Moeda inválida.');
      next.moedaPadrao = patch.moedaPadrao;
      next.preferenceAudit = [...current.preferenceAudit, { before:current.moedaPadrao,after:patch.moedaPadrao,at:new Date().toISOString(),actor:'admin' }];
    }
    if (patch.rates) {
      if(patch.rates.BRL!==1)fail('MONEY_RATE','A base BRL exige taxa 1.');
      for(const code of ['USD','EUR','PYG']) if(compare(money(legacyDecimal(patch.rates[code]),'BRL','test-fx'),money('0','BRL','test-fx'))<=0)fail('MONEY_RATE','Cotação positiva obrigatória.');
      next.rates = copy(patch.rates);
    }
    storage.setItem(MONEY_TEST_KEY, JSON.stringify(next)); publish(); return next;
  });
  return { read, subscribe, publish, commit, configure };
}
