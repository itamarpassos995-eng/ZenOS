/** Phase 3.1 - pure, fail-closed occurrence/fiscal draft contracts.
 * No Firestore writes, stock mutations, refunds, electronic issuance or provider calls.
 * Server command host MUST validate authenticated tenant/operator permissions.
 */
export const OCCURRENCE_SCHEMA = 1;
export const OCCURRENCE_REASONS = Object.freeze([
  'PICKING_SHORTAGE','DELIVERY_SHORTAGE','PARTIAL_DELIVERY','DAMAGED',
  'TOTAL_REFUSAL','PARTIAL_REFUSAL','LATER_RETURN','WRONG_PRODUCT',
  'REPLACEMENT','LOSS','INVOICE_DELIVERY_MISMATCH'
]);
export const FISCAL_DOCUMENT_TYPES = Object.freeze({
  PY: Object.freeze(['NOTA_CREDITO_ELECTRONICA','NOTA_REMISION_ELECTRONICA','CANCELAMENTO_REQUEST']),
  BR: Object.freeze(['NFE_DEVOLUCAO','NFE_ENTRADA','NFE_NOTA_CREDITO','CANCELAMENTO_REQUEST'])
});
export const OCCURRENCE_TRANSITIONS = Object.freeze({
  logistics: Object.freeze({
    REPORTED:['UNDER_REVIEW','DISMISSED'], UNDER_REVIEW:['CONFIRMED','DISMISSED'],
    CONFIRMED:['RESOLVED'], RESOLVED:[], DISMISSED:[]
  }),
  fiscal: Object.freeze({
    NOT_REQUESTED:['DRAFT'], DRAFT:['REVIEW_REQUIRED','BLOCKED'],
    REVIEW_REQUIRED:['BLOCKED','REJECTED'], BLOCKED:['REVIEW_REQUIRED'],
    REJECTED:[]
  }),
  financial: Object.freeze({
    NOT_REQUESTED:['REVIEW_REQUIRED'], REVIEW_REQUIRED:['BLOCKED'],
    BLOCKED:['REVIEW_REQUIRED']
  })
});
const fail = code => { throw Object.assign(new Error(code), {code}); };
const validId = v => typeof v === 'string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(v);
const validText = (v,max=1000) => typeof v === 'string' && v.trim().length>0 && v.length<=max;
const validTime = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const freeze = v => { if(v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const safeCopy = v => structuredClone(v);
const assert = (ok,code) => { if(!ok) fail(code); };
const CURRENCY_PRECISION = Object.freeze({BRL:2,PYG:0,USD:2,EUR:2});
function checkMoney(v) {
  assert(v && Object.hasOwn(CURRENCY_PRECISION,v.currency),'INVALID_CURRENCY');
  assert(v.precision===CURRENCY_PRECISION[v.currency] && typeof v.minor==='string' && /^(0|[1-9]\d*)$/.test(v.minor),'INVALID_MONEY');
  return {currency:v.currency,precision:v.precision,minor:v.minor};
}
function checkRefs(refs) {
  assert(refs && validId(refs.saleId) && validId(refs.orderId) &&
    validId(refs.customerId) && validId(refs.orderLineId) && validId(refs.productId),'SOURCE_REFERENCE_REQUIRED');
  const clean={};
  for(const key of ['saleId','orderId','customerId','orderLineId','productId','tripId','loadId','manifestId','invoiceId','sellerId']) {
    if(refs[key]!=null) {assert(validId(refs[key]),'INVALID_REFERENCE');clean[key]=refs[key];}
  }
  return clean;
}
function checkEvidence(evidence=[]) {
  assert(Array.isArray(evidence) && evidence.length<=20,'INVALID_EVIDENCE');
  return evidence.map(item=>{
    assert(item && validId(item.id) && ['PHOTO','SIGNATURE','DOCUMENT','NOTE'].includes(item.kind) &&
      validText(item.reference,500),'INVALID_EVIDENCE');
    // Store only opaque evidence reference, never a raw photo/signature or sensitive ID in this event.
    return {id:item.id,kind:item.kind,reference:item.reference};
  });
}
export function createDistributionOccurrence(input) {
  assert(input && validId(input.id) && validId(input.tenantId) && validId(input.establishmentId),'INVALID_OCCURRENCE_ID');
  assert(['BR','PY'].includes(input.country) && OCCURRENCE_REASONS.includes(input.reason),'INVALID_OCCURRENCE_REASON');
  assert(Number.isSafeInteger(input.quantity) && input.quantity>0,'INVALID_QUANTITY');
  assert(validTime(input.reportedAt) && validId(input.reportedBy) && validText(input.description),'INVALID_OCCURRENCE_EVENT');
  const source=checkRefs(input.refs);
  const originalAmount=checkMoney(input.originalAmount);
  const evidence=checkEvidence(input.evidence);
  let fiscalOriginal=null;
  if(input.fiscalOriginal!=null){
    const f=input.fiscalOriginal;
    assert(validId(f.id)&&validText(f.reference,200)&&f.country===input.country&&f.verified===true,
      'FISCAL_SOURCE_NOT_VERIFIED');
    fiscalOriginal={id:f.id,reference:f.reference,country:f.country,verified:true};
  }
  assert(input.factId==null||validId(input.factId),'INVALID_FACT_ORIGIN');
  assert(input.sourceKind==null||['MANUAL','TRIP'].includes(input.sourceKind),'INVALID_FACT_ORIGIN');
  assert(input.sourceProofId==null||validId(input.sourceProofId),'INVALID_PROOF_ID');
  assert(input.impactKind==null||['PHYSICAL','INFORMATIONAL'].includes(input.impactKind),'INVALID_FACT_ORIGIN');
  const now=input.reportedAt;
  return freeze({
    schema:OCCURRENCE_SCHEMA,id:input.id,tenantId:input.tenantId,establishmentId:input.establishmentId,
    country:input.country,reason:input.reason,description:input.description,
    quantity:input.quantity,refs:source,originalAmount,evidence,fiscalOriginal,
    factId:input.factId||null,sourceKind:input.sourceKind||'MANUAL',
    sourceProofId:input.sourceProofId||null,impactKind:input.impactKind||'PHYSICAL',
    states:{logistics:'REPORTED',fiscal:'NOT_REQUESTED',financial:'NOT_REQUESTED'},
    fiscalDocuments:[],revision:0,
    history:[{eventId:input.eventId || input.id,domain:'logistics',from:null,to:'REPORTED',
      actorId:input.reportedBy,at:now,note:'OCCURRENCE_REPORTED'}]
  });
}
export function transitionOccurrence(occurrence,{domain,next,eventId,actorId,at,expectedRevision,note}) {
  assert(occurrence?.schema===OCCURRENCE_SCHEMA && validId(occurrence.tenantId),'INVALID_OCCURRENCE');
  assert(validId(eventId) && validId(actorId) && validTime(at) && validText(note),'INVALID_OCCURRENCE_EVENT');
  assert(Number.isSafeInteger(expectedRevision) && expectedRevision===occurrence.revision,'REVISION_CONFLICT');
  assert(Object.hasOwn(OCCURRENCE_TRANSITIONS,domain) &&
    OCCURRENCE_TRANSITIONS[domain][occurrence.states?.[domain]]?.includes(next),'INVALID_TRANSITION');
  assert(!occurrence.history.some(e=>e.eventId===eventId),'DUPLICATE_EVENT');
  if(domain==='fiscal') assert(occurrence.states.logistics==='CONFIRMED' || occurrence.states.logistics==='RESOLVED','LOGISTICS_REVIEW_REQUIRED');
  if(domain==='financial') assert(occurrence.states.logistics==='CONFIRMED' || occurrence.states.logistics==='RESOLVED','LOGISTICS_REVIEW_REQUIRED');
  const copy=safeCopy(occurrence),from=copy.states[domain];
  copy.states[domain]=next;copy.revision++;
  copy.history.push({eventId,domain,from,to:next,actorId,at,note});
  return freeze(copy);
}
export function createFiscalAdjustmentDraft(occurrence,{id,type,originalDocument,eventId,actorId,at,expectedRevision,legalRuleRef}) {
  assert(occurrence?.schema===OCCURRENCE_SCHEMA,'INVALID_OCCURRENCE');
  assert(occurrence.states.logistics==='CONFIRMED' || occurrence.states.logistics==='RESOLVED','LOGISTICS_REVIEW_REQUIRED');
  assert(occurrence.states.fiscal==='DRAFT' || occurrence.states.fiscal==='REVIEW_REQUIRED','FISCAL_REVIEW_REQUIRED');
  assert(occurrence.revision===expectedRevision,'REVISION_CONFLICT');
  assert(validId(id) && validId(eventId) && validId(actorId) && validTime(at),'INVALID_FISCAL_DRAFT');
  assert(FISCAL_DOCUMENT_TYPES[occurrence.country]?.includes(type),'FISCAL_TYPE_COUNTRY_MISMATCH');
  assert(originalDocument && validId(originalDocument.id) && validText(originalDocument.reference,200) &&
    originalDocument.country===occurrence.country,'ORIGINAL_DOCUMENT_REQUIRED');
  assert(legalRuleRef==null || validText(legalRuleRef,300),'INVALID_LEGAL_REFERENCE');
  assert(!occurrence.fiscalDocuments.some(d=>d.id===id) && !occurrence.history.some(e=>e.eventId===eventId),'DUPLICATE_EVENT');
  const copy=safeCopy(occurrence);
  const draft=freeze({
    id,tenantId:occurrence.tenantId,occurrenceId:occurrence.id,establishmentId:occurrence.establishmentId,
    country:occurrence.country,type,originalDocument:{id:originalDocument.id,reference:originalDocument.reference,
      country:originalDocument.country},originalAmount:safeCopy(occurrence.originalAmount),
    quantity:occurrence.quantity,createdBy:actorId,createdAt:at,legalRuleRef:legalRuleRef||null,
    status:'REVIEW_REQUIRED',authorized:false,transmitted:false,providerProtocol:null,
    eligibilityVerified:false
  });
  copy.fiscalDocuments.push(draft);copy.revision++;
  copy.states.fiscal='REVIEW_REQUIRED';
  copy.history.push({eventId,domain:'fiscal',from:occurrence.states.fiscal,to:'REVIEW_REQUIRED',actorId,at,note:type});
  // No fiscal, financial or inventory mutation is performed by this contract.
  return freeze(copy);
}
