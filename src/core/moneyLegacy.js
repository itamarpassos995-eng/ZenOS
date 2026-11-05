import { assertMoney, money, assertCurrency } from './money.js';

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
// Deliberately ignores country, locale, current preference and *BRL suffixes.
// Evidence must be supplied by an audited import/snapshot or reviewed resolution.
export function classifyLegacyMoney(record, field, evidence = null) {
  const original = structuredClone(record?.[field] ?? null);
  const native = record?.monetary?.values?.[field];
  if (native) {
    try { return { status: 'native', original, value: assertMoney(native) }; }
    catch (error) { return { status: 'invalid-native', original, code: error.code }; }
  }
  if (!evidence || evidence.recordId !== String(record?.id) || evidence.field !== field ||
      !evidence.reference || !['audited-import', 'original-document', 'reviewed-resolution'].includes(evidence.kind) ||
      evidence.observedValue !== original)
    return { status: 'review-required', original, value: null };
  try {
    assertCurrency(evidence.currency);
    return { status: evidence.correctedAmount != null ? 'affected-proven' : 'proven', original,
      value: money(evidence.correctedAmount ?? evidence.amount, evidence.currency, evidence.reference),
      evidence: structuredClone(evidence) };
  } catch (error) { return { status: 'review-required', original, value: null, code: error.code }; }
}

const canonical = value => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (Object.getPrototypeOf(value) !== Object.prototype) fail('MONEY_BACKUP_TYPE', 'Exporte valores nativos antes de simular a correção.');
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
};
export const stableMoneyJson = value => JSON.stringify(canonical(value));
export async function moneyHash(value) {
  const bytes = new TextEncoder().encode(stableMoneyJson(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function planLegacyMoneyCorrection({ tenantId, record, field, evidence, operationId, actor, createdAt }) {
  if (!tenantId || !operationId || !actor || !Number.isFinite(Date.parse(createdAt)) || !record?.id)
    fail('MONEY_PLAN', 'Identidade e autoria obrigatórias.');
  if (record.monetary?.values?.[field]) fail('MONEY_ALREADY_NATIVE', 'Valor nativo exige operação explícita de alteração de preço.');
  const diagnosis = classifyLegacyMoney(record, field, evidence);
  if (!['proven', 'affected-proven'].includes(diagnosis.status)) fail('MONEY_LEGACY_AMBIGUOUS', 'Moeda não comprovada.');
  const before = structuredClone(record);
  const after = structuredClone(record);
  after.monetary = { ...(after.monetary || {}), schemaVersion: 2,
    revision: (after.monetary?.revision || 0) + 1,
    values: { ...(after.monetary?.values || {}), [field]: diagnosis.value } };
  const beforeHash = await moneyHash(before), afterHash = await moneyHash(after);
  return { schemaVersion: 2, tenantId, recordId: String(record.id), field, operationId, actor, createdAt,
    before, after, beforeHash, afterHash, evidence: diagnosis.evidence,
    compatibilityStatus: 'requires-consumer-integration' };
}
// Pure simulation only. The caller MUST perform hash check + write atomically
// in a trusted persistence transaction. This function does not authorize writes.
export async function simulateMoneyCorrection({ tenantId, current, plan, applied = [] }) {
  if (tenantId !== plan.tenantId || String(current?.id) !== plan.recordId)
    fail('MONEY_TENANT', 'Empresa ou registro incompatível.');
  if (await moneyHash(plan.before) !== plan.beforeHash || await moneyHash(plan.after) !== plan.afterHash)
    fail('MONEY_PLAN_TAMPERED', 'Plano de correção alterado.');
  const existing = applied.find(a => a.operationId === plan.operationId);
  if (existing) {
    if (existing.afterHash !== plan.afterHash || existing.tenantId !== tenantId)
      fail('MONEY_IDEMPOTENCY', 'Chave já utilizada por outra operação.');
    return { status: 'already-applied', record: structuredClone(current) };
  }
  if (await moneyHash(current) !== plan.beforeHash) fail('MONEY_CONFLICT', 'Registro mudou; refaça a conferência.');
  return { status: 'simulation-only', record: structuredClone(plan.after),
    audit: { operationId: plan.operationId, tenantId, actor: plan.actor, createdAt: plan.createdAt,
      beforeHash: plan.beforeHash, afterHash: plan.afterHash } };
}
