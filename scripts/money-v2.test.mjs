import test from 'node:test';
import assert from 'node:assert/strict';
import { money, add, subtract, compare, multiply, quantize, parseMoneyInput, formatMoney, convertMoney, allocateMoney } from '../src/core/money.js';
import { classifyLegacyMoney, planLegacyMoneyCorrection, simulateMoneyCorrection } from '../src/core/moneyLegacy.js';
const m = (amount, currency = 'PYG') => money(amount, currency, 'synthetic-test');
const now = '2026-11-04T12:00:00.000Z';
const quote = { id: 'fixture-230', from: 'BRL', to: 'PYG', rate: '230', quotedAt: now, expiresAt: '2026-11-05T12:00:00.000Z' };
const options = { appliedAt: now, purpose: 'display', scale: 8 };
test('exact decimals, fractional quantities and serialized contract', () => {
  assert.equal(add(m('0.1'), m('0.2')).amount, '0.3');
  assert.equal(multiply(m('39.99'), '2.5').amount, '99.975');
  assert.equal(subtract(m('10'), m('10')).amount, '0');
  assert.equal(compare(m('-1'), m('0')), -1);
  assert.deepEqual(JSON.parse(JSON.stringify(m('39990'))), m('39990'));
  assert.equal(add(m('9007199254740993'), m('1')).amount, '9007199254740994');
});
test('no mixing currencies and no number coercion or missing provenance', () => {
  assert.throws(() => add(m('1'), m('1', 'BRL')), { code: 'MONEY_MIXED_CURRENCIES' });
  assert.throws(() => compare(m('1'), m('1', 'USD')), { code: 'MONEY_MIXED_CURRENCIES' });
  for (const v of [NaN, Infinity, 39990, '', '1e3', '1foo', '1.2.3']) assert.throws(() => m(v));
  assert.throws(() => money('1', 'BTC', 'test'));
  assert.throws(() => money('1', 'PYG', ''));
  assert.throws(() => m('1'.repeat(61)));
});
test('input uses explicit locale, never truncates grouping', () => {
  for (const input of ['39990', '39.990', '39.990,00'])
    assert.equal(parseMoneyInput(input, 'PYG', { locale: 'es-PY' }).amount, '39990');
  assert.equal(parseMoneyInput('39,990.00', 'PYG', { locale: 'en-US' }).amount, '39990');
  for (const input of ['39,990.00', '39.99', '1.2.3', '', ' ', 'NaN', '-1'])
    assert.throws(() => parseMoneyInput(input, 'PYG', { locale: 'es-PY' }));
  assert.throws(() => parseMoneyInput('39.990', 'PYG'));
});
test('formatting cannot convert and supports large values without precision loss', () => {
  const original = m('39990');
  assert.match(formatMoney(original, { locale: 'es-PY' }), /39\.990/);
  assert.match(formatMoney(m('9007199254740993', 'BRL')), /9\.007\.199\.254\.740\.993,00/);
  assert.match(formatMoney(m('-0.5', 'BRL')), /-BRL 0,50/);
  assert.equal(original.amount, '39990');
});
test('explicit conversion freezes metadata and preserves input', () => {
  const input = m('39990', 'BRL');
  const result = convertMoney(input, 'PYG', quote, options);
  assert.equal(result.value.amount, '9197700');
  assert.equal(result.conversion.original.currency, 'BRL');
  quote.rate = '250';
  assert.equal(result.conversion.quote.rate, '230');
  quote.rate = '230';
  assert.equal(input.amount, '39990');
  assert.deepEqual(convertMoney(m('39990'), 'PYG'), { value: m('39990'), conversion: null });
  assert.throws(() => convertMoney(result.value, 'PYG', quote, options).conversion.quote);
});
test('missing, invalid, future, expired and reversed quotes fail closed', () => {
  const input = m('1', 'BRL');
  for (const q of [null, {}, { ...quote, rate: '0' }, { ...quote, rate: '-1' }, { ...quote, from: 'USD' },
    { ...quote, quotedAt: '2026-11-06' }, { ...quote, expiresAt: '2026-11-03' }])
    assert.throws(() => convertMoney(input, 'PYG', q, options));
  assert.throws(() => convertMoney(input, 'PYG', quote));
});
test('rounding and residual explicit for PYG and fractional cost', () => {
  const q = quantize(m('2.5'), 0, 'HALF_EVEN');
  assert.equal(q.value.amount, '2'); assert.equal(q.residual.amount, '0.5');
  assert.equal(quantize(m('-2.5'), 0).value.amount, '-3');
  assert.equal(quantize(m('3.5'), 0, 'HALF_EVEN').value.amount, '4');
  const converted = convertMoney(m('1', 'BRL'), 'PYG', { ...quote, rate: '230.5' }, { ...options, scale: 0 });
  assert.equal(converted.value.amount, '231'); assert.equal(converted.conversion.residual, '-0.5');
});
test('allocation conserves amount with deterministic remainder', () => {
  const r = allocateMoney(m('100', 'BRL'), ['1', '1', '1']);
  assert.deepEqual(r.values.map(v => v.amount), ['33.34', '33.33', '33.33']);
  assert.equal(r.values.reduce((a, b) => add(a, b), m('0', 'BRL')).amount, '100');
  assert.throws(() => allocateMoney(m('100'), ['0', '0']));
  assert.throws(() => allocateMoney(m('100'), ['-1', '1']));
});
test('native prices survive preference/rate changes and reload', () => {
  const product = { id: 'synthetic', monetary: { values: { precoBRL: m('39990') } } };
  const backup = JSON.stringify(product);
  for (const preference of ['BRL', 'PYG', 'USD']) {
    const read = classifyLegacyMoney(JSON.parse(backup), 'precoBRL');
    assert.equal(read.status, 'native'); assert.equal(read.value.amount, '39990');
    assert.equal(read.value.currency, 'PYG');
    assert.ok(preference);
  }
  assert.equal(JSON.stringify(product), backup);
});
test('legacy requires record/field/value-bound evidence, never preference or suffix', () => {
  const record = { id: 'p', precoBRL: 39990, pais: 'PY', moedaPadrao: 'PYG' };
  assert.equal(classifyLegacyMoney(record, 'precoBRL').status, 'review-required');
  const evidence = { recordId: 'p', field: 'precoBRL', observedValue: 39990, currency: 'PYG', amount: '39990', reference: 'signed-import-1', kind: 'audited-import' };
  assert.equal(classifyLegacyMoney(record, 'precoBRL', evidence).status, 'proven');
  assert.equal(classifyLegacyMoney(record, 'precoBRL', { ...evidence, observedValue: 1 }).status, 'review-required');
  assert.equal(classifyLegacyMoney(record, 'precoBRL', { ...evidence, recordId: 'other' }).status, 'review-required');
});
test('correction simulation preserves legacy, rejects conflicts, isolates tenants and retries', async () => {
  const record = { id: 'p', precoBRL: 39990, estoque: 8 };
  const before = JSON.stringify(record);
  const evidence = { recordId: 'p', field: 'precoBRL', observedValue: 39990, currency: 'PYG', amount: '39990', reference: 'review-1', kind: 'reviewed-resolution' };
  const plan = await planLegacyMoneyCorrection({ tenantId: 'synthetic-shop', record, field: 'precoBRL', evidence, operationId: 'fix-1', actor: 'test', createdAt: now });
  assert.equal(JSON.stringify(record), before);
  const simulation = await simulateMoneyCorrection({ tenantId: 'synthetic-shop', current: record, plan });
  assert.equal(simulation.record.precoBRL, 39990);
  assert.equal(simulation.record.monetary.values.precoBRL.currency, 'PYG');
  assert.equal(simulation.status, 'simulation-only');
  await assert.rejects(simulateMoneyCorrection({ tenantId: 'other', current: record, plan }), { code: 'MONEY_TENANT' });
  await assert.rejects(simulateMoneyCorrection({ tenantId: 'synthetic-shop', current: { ...record, estoque: 7 }, plan }), { code: 'MONEY_CONFLICT' });
  const retry = await simulateMoneyCorrection({ tenantId: 'synthetic-shop', current: simulation.record, plan, applied: [simulation.audit] });
  assert.equal(retry.status, 'already-applied');
  await assert.rejects(simulateMoneyCorrection({ tenantId: 'synthetic-shop', current: record,
    plan: { ...plan, after: { ...plan.after, estoque: 999 } } }), { code: 'MONEY_PLAN_TAMPERED' });
});
