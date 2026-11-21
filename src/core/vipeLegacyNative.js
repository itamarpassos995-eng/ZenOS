/**
 * VIPE-only operational interpretation authorized by the store:
 * records lacking an original currency snapshot use the existing registered
 * number as PYG. No BRL conversion, no bulk rewrite, no FX revaluation.
 * Explicit native snapshots ALWAYS take precedence. The legacy source field
 * remains intact for traceability; this is not historical reconciliation.
 */
export const VIPE_STORE_ID='QNtFleq9ajNNmU6iwiFSi5w1alu2';
export const vipeLegacyPYG=(storeId,currency)=>String(storeId)===VIPE_STORE_ID&&currency==='PYG';
export function legacyPYGMinor(value,storeId,currency){
 if(!vipeLegacyPYG(storeId,currency))return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)return null;
 // Guaraní has no cents. Round only a legacy numeric value, never a rate.
 return String(Math.round(n));
}
