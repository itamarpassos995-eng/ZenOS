// Shared V2 domain contracts. Callers must persist atomically with their stock,
// financial and idempotency guards. Legacy UI is not silently switched to V2.
import { money, assertMoney, add, subtract, compare, multiply, quantize, currencyScale, convertMoney, assertCurrency } from './money.js';
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const clone = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function nonnegative(value) {
  assertMoney(value);
  if (compare(value, money('0', value.currency, 'validation')) < 0) fail('MONEY_NEGATIVE', 'Quantia negativa na operação.');
  return value;
}
function identity({ tenantId, id, actor, createdAt }) {
  if (![tenantId, id, actor].every(v => typeof v === 'string' && v.trim()) || !Number.isFinite(Date.parse(createdAt)))
    fail('MONEY_IDENTITY', 'Empresa, identificação, operador e data obrigatórios.');
}
export function resolveInCurrency(value, currency, { quotes = [], appliedAt, purpose, scale = 8 } = {}) {
  assertMoney(value); assertCurrency(currency);
  if (value.currency === currency) return { value: clone(value), conversion: null };
  const matches = quotes.filter(q => q.from === value.currency && q.to === currency);
  if (matches.length !== 1) fail('MONEY_QUOTE', 'Exige uma cotação inequívoca para o par de moedas.');
  return convertMoney(value, currency, matches[0], { appliedAt, purpose, scale });
}
export function createPriceBook({ tenantId, id, actor, createdAt, values, revision = 1 }) {
  identity({ tenantId, id, actor, createdAt });
  if (!values?.sale || !values?.cost || !Number.isSafeInteger(revision) || revision < 1)
    fail('MONEY_PRICE_BOOK', 'Custo, venda e revisão obrigatórios.');
  for (const v of Object.values(values)) nonnegative(v);
  return freeze({ schemaVersion: 2, tenantId, id, actor, createdAt, revision, values: clone(values) });
}
export function changePriceCurrency({ previous, field, replacement, actor, createdAt, reason, expectedRevision, conversion = null }) {
  if (previous?.schemaVersion !== 2 || previous.revision !== expectedRevision || !previous.values[field])
    fail('MONEY_CONFLICT', 'Tabela de preço mudou ou campo inválido.');
  nonnegative(replacement);
  if (!reason || !actor || !Number.isFinite(Date.parse(createdAt))) fail('MONEY_AUDIT', 'Motivo e autoria obrigatórios.');
  if (conversion && (JSON.stringify(conversion.original) !== JSON.stringify(previous.values[field]) ||
      JSON.stringify(conversion.result) !== JSON.stringify(replacement)))
    fail('MONEY_AUDIT', 'Conversão não corresponde aos valores da alteração.');
  const audit = { field, before: clone(previous.values[field]), after: clone(replacement), actor, createdAt, reason, conversion: clone(conversion) };
  return freeze({ ...clone(previous), revision: previous.revision + 1,
    values: { ...clone(previous.values), [field]: clone(replacement) }, lastChange: audit });
}
export function createCommercialSnapshot({ tenantId, id, actor, createdAt, currency, items,
  discount = money('0', currency, 'discount'), surcharge = money('0', currency, 'surcharge'), quotes = [], kind }) {
  identity({ tenantId, id, actor, createdAt }); assertCurrency(currency);
  if (!['sale', 'purchase', 'quotation', 'preorder', 'online-order'].includes(kind) || !Array.isArray(items) || !items.length)
    fail('MONEY_DOCUMENT', 'Tipo e itens obrigatórios.');
  if (discount.currency !== currency || surcharge.currency !== currency) fail('MONEY_MIXED_CURRENCIES', 'Ajustes devem usar a moeda comercial.');
  nonnegative(discount); nonnegative(surcharge);
  const ids = new Set(), conversions = [];
  const lines = items.map(item => {
    if (!item.id || ids.has(item.id)) fail('MONEY_ITEM', 'Identidade de item ausente ou duplicada.');
    ids.add(item.id); nonnegative(item.unitPrice); nonnegative(item.unitCost);
    // Multiplication parses quantity strictly and supports fractional units.
    const quantityCheck = multiply(money('1', currency, 'quantity-check'), item.quantity);
    if (compare(quantityCheck, money('0', currency, 'quantity-check')) <= 0) fail('MONEY_QUANTITY', 'Quantidade deve ser positiva.');
    const price = resolveInCurrency(item.unitPrice, currency, { quotes, appliedAt: createdAt, purpose: 'commercial-unit-price' });
    const cost = resolveInCurrency(item.unitCost, currency, { quotes, appliedAt: createdAt, purpose: 'cost-at-operation' });
    if (price.conversion) conversions.push(price.conversion);
    if (cost.conversion) conversions.push(cost.conversion);
    const total = quantize(multiply(price.value, item.quantity), currencyScale(currency));
    const costTotal = quantize(multiply(cost.value, item.quantity), currencyScale(currency));
    return { id: item.id, quantity: item.quantity, unitPriceOriginal: clone(item.unitPrice), unitCostOriginal: clone(item.unitCost),
      unitPrice: price.value, unitCost: cost.value, total: total.value, costTotal: costTotal.value,
      roundingResidual: total.residual, costRoundingResidual: costTotal.residual };
  });
  const subtotal = lines.reduce((a, l) => add(a, l.total), money('0', currency, 'subtotal'));
  const cmv = lines.reduce((a, l) => add(a, l.costTotal), money('0', currency, 'cost-at-operation'));
  const total = quantize(add(subtract(subtotal, discount), surcharge), currencyScale(currency));
  nonnegative(total.value);
  return freeze({ schemaVersion: 2, tenantId, id, actor, createdAt, kind, currency, items: lines,
    subtotal, discount: clone(discount), surcharge: clone(surcharge), total: total.value,
    totalRoundingResidual: total.residual, cmv, profit: subtract(total.value, cmv, 'profit-at-operation'), conversions });
}
export function reconcilePayment({ document, payments, change = [], quotes = [], appliedAt }) {
  if (document?.schemaVersion !== 2) fail('MONEY_VERSION', 'Documento monetário incompatível.');
  const { currency } = document;
  const conversions = [], ids = new Set();
  let received = money('0', currency, 'received'), returned = money('0', currency, 'change');
  const normalized = payments.map(payment => {
    if (!payment.id || ids.has(payment.id) || !payment.method || !payment.accountId)
      fail('MONEY_PAYMENT', 'Identificação, forma e conta do pagamento obrigatórias.');
    ids.add(payment.id); nonnegative(payment.amount);
    const r = resolveInCurrency(payment.amount, currency, { quotes, appliedAt, purpose: 'settlement' });
    received = add(received, r.value);
    if (r.conversion) conversions.push(r.conversion);
    return { ...clone(payment), equivalent: r.value };
  });
  const returns = change.map(entry => {
    nonnegative(entry.amount);
    if (!entry.accountId || !entry.id || ids.has(entry.id)) fail('MONEY_PAYMENT', 'Troco exige conta e identificação única.');
    ids.add(entry.id);
    const r = resolveInCurrency(entry.amount, currency, { quotes, appliedAt, purpose: 'change' });
    returned = add(returned, r.value);
    if (r.conversion) conversions.push(r.conversion);
    return { ...clone(entry), equivalent: r.value };
  });
  const net = subtract(received, returned);
  const outstanding = subtract(document.total, net, 'outstanding');
  return freeze({ schemaVersion: 2, documentId: document.id, tenantId: document.tenantId, appliedAt,
    payments: normalized, change: returns, conversions, received, returned, net, outstanding,
    status: compare(outstanding, money('0', currency, 'zero')) === 0 ? 'settled' : compare(outstanding, money('0', currency, 'zero')) > 0 ? 'partial' : 'overpaid' });
}
// Aggregate by account AND currency; cash, cards and bank balances never mingle.
export function nativeBalances({ tenantId, entries, opening = [] }) {
  const balances = new Map(), ids = new Set();
  for (const entry of [...opening, ...entries]) {
    if (entry.tenantId !== tenantId || !entry.accountId || !entry.id || ids.has(entry.id))
      fail('MONEY_LEDGER', 'Empresa, conta ou identidade inválida no livro.');
    ids.add(entry.id); assertMoney(entry.amount);
    if (!['in', 'out'].includes(entry.direction)) fail('MONEY_DIRECTION', 'Direção do lançamento inválida.');
    nonnegative(entry.amount);
    const key = JSON.stringify([entry.accountId, entry.amount.currency]);
    const current = balances.get(key) || money('0', entry.amount.currency, 'account-balance');
    balances.set(key, entry.direction === 'in' ? add(current, entry.amount) : subtract(current, entry.amount));
  }
  return [...balances].map(([key, balance]) => ({ accountId: JSON.parse(key)[0], balance }));
}
export function assertNativeWithdrawal({ balances, accountId, amount }) {
  nonnegative(amount);
  const available = balances.find(b => b.accountId === accountId && b.balance.currency === amount.currency)?.balance || money('0', amount.currency, 'account-balance');
  if (compare(available, amount) < 0) fail('MONEY_INSUFFICIENT_NATIVE', 'Saldo insuficiente na conta e moeda solicitadas.');
}
export function aggregateNative(values) {
  const totals = new Map();
  for (const value of values) {
    assertMoney(value);
    totals.set(value.currency, add(totals.get(value.currency) || money('0', value.currency, 'report-total'), value));
  }
  return Object.fromEntries(totals);
}
