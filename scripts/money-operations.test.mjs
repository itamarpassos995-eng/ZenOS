import test from 'node:test';
import assert from 'node:assert/strict';
import { money, add } from '../src/core/money.js';
import { createPriceBook, changePriceCurrency, createCommercialSnapshot, reconcilePayment, nativeBalances, assertNativeWithdrawal, aggregateNative } from '../src/core/moneyOperations.js';
const m = (a, c = 'PYG') => money(a, c, 'synthetic');
const createdAt = '2026-11-04T12:00:00.000Z';
const identity = { tenantId: 'fixture-shop', id: 'sale-1', actor: 'fixture-manager', createdAt };
const quotes = [
  { id: 'usd-pyg-1', from: 'USD', to: 'PYG', rate: '7000', quotedAt: createdAt, expiresAt: '2026-11-05T12:00:00.000Z' },
  { id: 'brl-pyg-1', from: 'BRL', to: 'PYG', rate: '230', quotedAt: createdAt, expiresAt: '2026-11-05T12:00:00.000Z' },
];
const product = { id: 'massa', quantity: '1', unitPrice: m('39990'), unitCost: m('3', 'USD') };
const sale = () => createCommercialSnapshot({ ...identity, kind: 'sale', currency: 'PYG', items: [product], quotes });
test('39990 PYG sale with USD cost: original price, CMV, profit and reload preserved', () => {
  const doc = sale();
  assert.equal(doc.total.amount, '39990');
  assert.equal(doc.cmv.amount, '21000');
  assert.equal(doc.profit.amount, '18990');
  assert.equal(doc.items[0].unitCostOriginal.currency, 'USD');
  assert.equal(doc.conversions[0].quote.rate, '7000');
  const reloaded = JSON.parse(JSON.stringify(doc));
  const changed = quotes.map(q => ({ ...q, rate: '1' }));
  assert.equal(reloaded.total.amount, '39990');
  assert.equal(reloaded.cmv.amount, '21000');
  assert.notEqual(changed[0].rate, reloaded.conversions[0].quote.rate);
  assert.throws(() => { doc.items[0].unitPrice.amount = '999'; }, TypeError);
});
test('BRL regression, fractional quantities, discounts and fees', () => {
  const doc = createCommercialSnapshot({ ...identity, kind: 'sale', currency: 'BRL',
    items: [{ id: 'p', quantity: '2.5', unitPrice: m('10.10', 'BRL'), unitCost: m('5.05', 'BRL') }],
    discount: m('1', 'BRL'), surcharge: m('0.5', 'BRL') });
  assert.equal(doc.subtotal.amount, '25.25'); assert.equal(doc.total.amount, '24.75');
  assert.equal(doc.cmv.amount, '12.63'); assert.equal(doc.profit.amount, '12.12');
});
test('cash and cards in multiple currencies settle without mixing accounts', () => {
  const result = reconcilePayment({ document: sale(), appliedAt: createdAt, quotes,
    payments: [
      { id: 'p1', method: 'card', accountId: 'py-terminal', amount: m('20000') },
      { id: 'p2', method: 'cash', accountId: 'cash-drawer', amount: m('100', 'BRL') },
    ], change: [{ id: 'change1', accountId: 'cash-drawer', amount: m('3010') }] });
  assert.equal(result.status, 'settled');
  assert.equal(result.outstanding.amount, '0');
  assert.equal(result.payments[1].amount.amount, '100');
  assert.equal(result.payments[1].amount.currency, 'BRL');
  assert.equal(result.change[0].amount.amount, '3010');
  assert.equal(result.conversions[0].quote.rate, '230');
});
test('part payment preserves debt in contracted currency', () => {
  const result = reconcilePayment({ document: sale(), appliedAt: createdAt, quotes,
    payments: [{ id: 'p1', method: 'bank', accountId: 'br-bank', amount: m('100', 'BRL') }] });
  assert.equal(result.status, 'partial');
  assert.equal(result.outstanding.currency, 'PYG');
  assert.equal(result.outstanding.amount, '16990');
});
test('opening/in/out and card balances stay in each native currency', () => {
  const entry = (id, amount, accountId = 'drawer', direction = 'in') => ({ id, amount, accountId, direction, tenantId: identity.tenantId });
  const balances = nativeBalances({ tenantId: identity.tenantId,
    opening: [entry('o1', m('10')), entry('o2', m('10', 'BRL'))],
    entries: [entry('s1', m('20')), entry('w1', m('5'), 'drawer', 'out'), entry('c1', m('100000'), 'card-terminal')] });
  assert.equal(balances.find(b => b.accountId === 'drawer' && b.balance.currency === 'PYG').balance.amount, '25');
  assert.equal(balances.find(b => b.balance.currency === 'BRL').balance.amount, '10');
  assert.throws(() => assertNativeWithdrawal({ balances, accountId: 'drawer', amount: m('26') }), { code: 'MONEY_INSUFFICIENT_NATIVE' });
  assert.doesNotThrow(() => assertNativeWithdrawal({ balances, accountId: 'drawer', amount: m('25') }));
  assert.throws(() => nativeBalances({ tenantId: 'other', entries: [entry('x', m('1'))] }), { code: 'MONEY_LEDGER' });
  assert.throws(() => nativeBalances({ tenantId: identity.tenantId, entries: [entry('x', m('1')), entry('x', m('1'))] }), { code: 'MONEY_LEDGER' });
});
test('reports group native values; no mixed total', () => {
  const result = aggregateNative([m('39990'), m('10', 'BRL'), m('10')]);
  assert.equal(result.PYG.amount, '40000'); assert.equal(result.BRL.amount, '10');
  assert.throws(() => add(result.PYG, result.BRL), { code: 'MONEY_MIXED_CURRENCIES' });
});
test('new price book freezes currencies; explicit change increments revision with audit', () => {
  const book = createPriceBook({ ...identity, values: { cost: m('3', 'USD'), sale: m('39990'), wholesale: m('38000') } });
  const updated = changePriceCurrency({ previous: book, field: 'sale', replacement: m('180', 'BRL'),
    actor: identity.actor, createdAt, reason: 'Preço revisado explicitamente', expectedRevision: 1 });
  assert.equal(book.values.sale.amount, '39990'); assert.equal(book.values.sale.currency, 'PYG');
  assert.equal(updated.values.sale.currency, 'BRL'); assert.equal(updated.revision, 2);
  assert.equal(updated.lastChange.before.currency, 'PYG');
  assert.throws(() => changePriceCurrency({ previous: updated, field: 'sale', replacement: m('1'),
    actor: identity.actor, createdAt, reason: 'test', expectedRevision: 1 }), { code: 'MONEY_CONFLICT' });
});
test('invalid prices, quantities, methods, duplicate payments and missing FX rejected', () => {
  for (const quantity of ['0', '-1', 'abc']) assert.throws(() => createCommercialSnapshot({ ...identity, kind: 'sale', currency: 'PYG', items: [{ ...product, quantity }], quotes }));
  assert.throws(() => createCommercialSnapshot({ ...identity, kind: 'sale', currency: 'PYG', items: [product] }), { code: 'MONEY_QUOTE' });
  assert.throws(() => createCommercialSnapshot({ ...identity, kind: 'sale', currency: 'PYG', items: [product, product], quotes }), { code: 'MONEY_ITEM' });
  const p = { id: 'p1', amount: m('1'), accountId: 'drawer', method: 'cash' };
  assert.throws(() => reconcilePayment({ document: sale(), appliedAt: createdAt, payments: [p, p] }), { code: 'MONEY_PAYMENT' });
  assert.throws(() => reconcilePayment({ document: sale(), appliedAt: createdAt, payments: [{ ...p, method: '' }] }), { code: 'MONEY_PAYMENT' });
});
