/** Pure A.3 semantic-claim guard. One source fact, many explicitly linked portions.
 * Persist one ledger document per fact in the SAME Firestore transaction as
 * occurrence, receipt and audit. This is NOT a financial/stock ledger.
 */
const fail = code => {throw Object.assign(new Error(code),{code});};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
const safe=n=>Number.isSafeInteger(n)&&n>=0;
export const IMPACT_REASONS=Object.freeze([
 'PICKING_SHORTAGE','DELIVERY_SHORTAGE','PARTIAL_DELIVERY','DAMAGED',
 'TOTAL_REFUSAL','PARTIAL_REFUSAL','LATER_RETURN','WRONG_PRODUCT',
 'REPLACEMENT','LOSS'
]);
export function sourceFact({tenantId,establishmentId,saleId,lineIndex,tripId,proofId,kind='MANUAL',family='PHYSICAL'}) {
 if(![tenantId,establishmentId,saleId].every(id)||!safe(lineIndex))fail('INVALID_FACT_ORIGIN');
 if(kind==='TRIP'&&(!id(tripId)||!id(proofId)))fail('PROOF_REQUIRED');
 if(!['MANUAL','TRIP'].includes(kind))fail('INVALID_FACT_ORIGIN');
 if(!['PHYSICAL','INFORMATIONAL'].includes(family))fail('INVALID_FACT_ORIGIN');
 // No amount, day, free text or client-generated occurrence ID in identity.
 return [tenantId,establishmentId,saleId,String(lineIndex),kind,family,
  kind==='TRIP'?tripId:'',kind==='TRIP'?proofId:''].join('|');
}
export function reserveFact(fact,{factId,occurrenceId,quantity,capacity,continuationOf=null,actorId,at}) {
 if(!id(factId)||!id(occurrenceId)||!id(actorId)||!safe(quantity)||quantity===0||
   !safe(capacity)||capacity===0||!Number.isFinite(Date.parse(at)))fail('INVALID_FACT_CLAIM');
 const old=fact?structuredClone(fact):{id:factId,capacity,active:0,claims:{},revision:0};
 if(old.id!==factId||old.capacity!==capacity||!safe(old.active))fail('FACT_SOURCE_CHANGED');
 if(Object.hasOwn(old.claims,occurrenceId))fail('DUPLICATE_FACT');
 const existing=Object.values(old.claims).filter(c=>c.state==='ACTIVE');
 if(existing.length){
  // A different request key cannot silently become another physical event.
  // A deliberate, linked partial claim is required and is audit-visible.
  if(!id(continuationOf)||!old.claims[continuationOf]||
    old.claims[continuationOf].state!=='ACTIVE')fail('DUPLICATE_FACT');
 }else if(continuationOf!==null)fail('INVALID_CONTINUATION');
 if(old.active+quantity>old.capacity)fail('FACT_CAPACITY_EXCEEDED');
 if(Object.keys(old.claims).length>=60)fail('FACT_HISTORY_LIMIT');
 old.claims[occurrenceId]={quantity,state:'ACTIVE',continuationOf,actorId,at};
 old.active+=quantity;old.revision++;
 return old;
}
export function releaseFact(fact,{occurrenceId,actorId,at}) {
 if(!fact||!id(occurrenceId)||!id(actorId)||!Number.isFinite(Date.parse(at)))fail('INVALID_FACT_CLAIM');
 const next=structuredClone(fact),claim=next.claims?.[occurrenceId];
 if(!claim||claim.state!=='ACTIVE')fail('FACT_CLAIM_NOT_ACTIVE');
 claim.state='RELEASED';claim.releasedBy=actorId;claim.releasedAt=at;
 next.active-=claim.quantity;next.revision++;
 if(next.active<0)fail('FACT_LEDGER_CORRUPTED');
 return next;
}
