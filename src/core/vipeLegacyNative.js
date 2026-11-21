/**
 * VIPE-only operational interpretation authorized by the store:
 * Products without original snapshots preserve the explicitly registered raw
 * PYG number. Historical customer BRL receivables and limits are DIFFERENT:
 * they were converted from PYG at a 1150 PYG/BRL historical bookkeeping rate.
 * Never relabel a BRL credit amount as PYG or use the current FX.
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

/** Fixed VIPE legacy credit bookkeeping conversion. NOT a payment exchange rate. */
export const VIPE_HISTORICAL_PYG_PER_BRL=1150n;
function legacyMoneyBRLMinor(value){
 const n=Number(value);
 if(!Number.isFinite(n)||n<0)return null;
 const rounded=n.toFixed(2);
 if(Math.abs(Number(rounded)-n)>0.0000001)return null;
 const [a,b='00']=rounded.split('.');
 return BigInt(a)*100n+BigInt(b);
}
/** The only allowed fallback for historic BRL customer debts and limits.
 * Example 11706.81 BRL -> (1170681 cents * 1150 + 50)/100
 * = 13,462,832 whole guaranis, regardless of current FX.
 */
export function legacyCreditPYGMinor(value,storeId,currency){
 if(!vipeLegacyPYG(storeId,currency))return null;
 const cents=legacyMoneyBRLMinor(value);
 return cents===null?null:String((cents*VIPE_HISTORICAL_PYG_PER_BRL+50n)/100n);
}
/** Reconcile known native titles plus only the remaining historic BRL ledger.
 * Never multiply the full BRL book if it contains already native-titled debts.
 */
export function vipeReceivableMinor(cliente,carteira,storeId,currency){
 if(!vipeLegacyPYG(storeId,currency))return null;
 if(carteira?.status==='confirmado')return String(Math.round(carteira.totalNativo));
 if(carteira?.status==='legado_pendente'){
   const frozen=cliente?.fiadoLegadoSaldoOriginalMinor;
   let extra=null;
   if(frozen!=null){
     try{
       const n=BigInt(frozen);
       if(n<0n) return null;
       extra=n.toString();
     }catch{return null;}
   }else extra=legacyCreditPYGMinor(carteira.legadoBRL,storeId,currency);
   return extra===null?null:String(BigInt(extra)+BigInt(Math.round(carteira.nativoComprovado)));
 }
 return null;
}
