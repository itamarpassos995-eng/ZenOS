import {error,hash,id} from './security.js';
import {makeCommercialDraft,transitionCommercialDraft,internalAdjustmentRepresentation} from '../../../src/core/distribution/phase31Commercial.js';
/** Phase 3.1 B — emulator-only commercial proposals, no writers for fiscal issuance, debt, cash or stock. */
const good=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const size=v=>Buffer.byteLength(JSON.stringify(v));
const safe=v=>{if(!Number.isSafeInteger(v)||v<0)error('INVALID_QUANTITY');return v;};
const access=Object.freeze({CREATE:'returns',TRANSITION_COMMERCIAL:'manage',TRANSITION_FISCAL:'fiscalReview'});
export function buildCommercialAdjustments({db,ctx,authorize,now=()=>Date.now()}) {
 const rootDoc=(c,coll,key)=>db.doc(`${c.root}/${coll}/${id(key)}`);
 const saleDoc=(c,key)=>db.doc(`${c.base}/vendas/${id(key)}`);
 async function adjustmentCommand(uid,sessionToken,command) {
  if(!command||!good(command.key)||!good(command.id)||!good(command.occurrenceId)||
    !Object.hasOwn(access,command.type)||!Number.isSafeInteger(command.expectedRevision)||
    command.expectedRevision<0||size(command)>18000)error('INVALID_ADJUSTMENT_COMMAND');
  // Identity is derived only from authenticated Firebase user, not frontend claims.
  const identity=hash(stable({uid,...command}));
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid);
   const actor=await authorize(tx,uid,sessionToken,c,access[command.type]);
   const adjustmentRef=rootDoc(c,'distribution_adjustments',command.id);
   const occRef=rootDoc(c,'distribution_occurrences',command.occurrenceId);
   const lockRef=rootDoc(c,'distribution_adjustment_reservations',hash(uid+':'+command.occurrenceId));
   const receiptRef=rootDoc(c,'distribution_adjustment_receipts',hash(uid+':'+command.key));
   const [prior,occSnap,adjustmentSnap,lockSnap]=await Promise.all([
    tx.get(receiptRef),tx.get(occRef),tx.get(adjustmentRef),tx.get(lockRef)
   ]);
   if(prior.exists){
    const r=prior.data();
    if(r.generation!==c.generation||r.operatorId!==actor.operatorId||r.identity!==identity)
     error('IDEMPOTENCY_CONFLICT');
    return {...r.result,replayed:true};
   }
   const occurrence=occSnap.data();
   if(!occurrence||occurrence.tenantId!==uid||occurrence.generation!==c.generation||
      occurrence.id!==command.occurrenceId)error('OCCURRENCE_NOT_FOUND');
   const old=adjustmentSnap.exists?adjustmentSnap.data():null;
   if(old&&(old.tenantId!==uid||old.generation!==c.generation))error('ADJUSTMENT_NOT_FOUND');
   const locked=lockSnap.exists?lockSnap.data():{tenantId:uid,occurrenceId:occurrence.id,
    generation:c.generation,active:0,claims:{},revision:0};
   if(locked.tenantId!==uid||locked.occurrenceId!==occurrence.id||locked.generation!==c.generation)
    error('RESERVATION_SOURCE_CHANGED');
   let updated,release=false,quantity=0;
   if(command.type==='CREATE'){
    if(old||command.expectedRevision!==0)error('ADJUSTMENT_ALREADY_EXISTS');
    const payload=command.payload||{};
    if(payload.amount!=null||payload.currency!=null||payload.tenantId!=null||
       payload.saleSnapshot!=null||payload.fiscalAuthorized!=null||
       payload.financialSnapshot!=null)error('CLIENT_SOURCE_FORBIDDEN');
    const saleSnap=await tx.get(saleDoc(c,occurrence.refs.saleId));
    const envelope=saleSnap.data();
    if(!envelope||envelope.deleted)error('ORDER_NOT_FOUND');
    const sale=envelope.data;
    if(String(sale.id)!==occurrence.refs.saleId||
       String(sale.clienteId)!==occurrence.refs.customerId)error('SOURCE_REFERENCE_MISMATCH');
    if(String(c.config.establishmentId||uid)!==occurrence.establishmentId||
       (c.config.fiscalCountry||c.config.issuer?.country||'').toUpperCase()!==occurrence.country)
      error('FISCAL_COUNTRY_NOT_CONFIGURED');
    quantity=safe(Number(payload.quantity));
    if(quantity===0||quantity>occurrence.quantity)error('ADJUSTMENT_QUANTITY_EXCEEDED');
    if(locked.active+quantity>occurrence.quantity)error('ADJUSTMENT_QUANTITY_EXCEEDED');
    if(Object.keys(locked.claims).length>=60)error('ADJUSTMENT_HISTORY_LIMIT');
    // No trusted payment/receivable subledger is joined here; never infer amounts due
    // from sale.totalOriginal, pagamentOS array or customer's current balance.
    updated=makeCommercialDraft({id:command.id,tenantId:uid,
     establishmentId:occurrence.establishmentId,occurrence,sale,
     type:payload.type,quantity,actorId:actor.operatorId,
     at:new Date(now()).toISOString(),fiscalCandidate:payload.fiscalCandidate??null});
    if(updated.value.minor==='0')error('ADJUSTMENT_ZERO_VALUE');
    locked.claims[command.id]={quantity,state:'ACTIVE',createdBy:actor.operatorId};
    locked.active+=quantity;locked.revision++;
   }else{
    if(!old||old.occurrenceId!==occurrence.id)error('ADJUSTMENT_NOT_FOUND');
    if(command.type==='TRANSITION_COMMERCIAL'&&
      !['COMMERCIAL_REVIEW','FISCAL_REVIEW','REJECTED','CANCELLED','DRAFT'].includes(command.payload?.next))
     error('ADJUSTMENT_TRANSITION_FORBIDDEN');
    if(command.type==='TRANSITION_FISCAL'&&
      !['LEGAL_REVIEW_REQUIRED','REJECTED','COMMERCIAL_REVIEW'].includes(command.payload?.next))
     error('ADJUSTMENT_TRANSITION_FORBIDDEN');
    updated=transitionCommercialDraft(old,{eventId:command.payload?.eventId,
      actorId:actor.operatorId,next:command.payload?.next,
      reason:command.payload?.reason,at:new Date(now()).toISOString(),
      expectedRevision:command.expectedRevision});
    if(['CANCELLED','REJECTED'].includes(updated.status)&&locked.claims[command.id]?.state==='ACTIVE'){
     // Only internal never-issued draft: no fiscal or finance execution is available here.
     if(old.fiscalDocument?.authorized||old.fiscalDocument?.transmitted)error('RESERVATION_RELEASE_BLOCKED');
     locked.claims[command.id]={...locked.claims[command.id],state:'RELEASED',
       releasedBy:actor.operatorId,releasedAt:now()};
     locked.active-=old.quantity;
     if(locked.active<0)error('RESERVATION_CORRUPTED');
     locked.revision++;release=true;
    }
   }
   const out={...updated,generation:c.generation,
    createdAtMs:old?.createdAtMs??now(),updatedAtMs:now(),updatedBy:actor.operatorId};
   if(size(out)>600000)error('REQUEST_TOO_LARGE');
   const eventId=hash('adjustment:'+uid+':'+command.key);
   const representation=internalAdjustmentRepresentation(updated,'pt');
   const result={id:updated.id,occurrenceId:occurrence.id,revision:updated.revision,
    status:updated.status,reserved:!release};
   tx.set(adjustmentRef,out);
   tx.set(lockRef,{...locked,updatedAtMs:now()});
   tx.create(receiptRef,{identity,operatorId:actor.operatorId,generation:c.generation,result,createdAtMs:now()});
   tx.create(rootDoc(c,'distribution_adjustment_events',eventId),{eventId,tenantId:uid,
    adjustmentId:updated.id,occurrenceId:occurrence.id,operatorId:actor.operatorId,
    revision:updated.revision,at:now(),transition:updated.history.at(-1)});
   tx.create(rootDoc(c,'distribution_adjustment_representations',hash(updated.id+':'+updated.revision)),
    {...representation,generation:c.generation,adjustmentId:updated.id,revision:updated.revision,
     createdAtMs:now()});
   tx.create(rootDoc(c,'distribution_outbox',eventId),{id:eventId,tenantId:uid,
    schema:1,type:'distribution.adjustment.internal.v1',entityId:updated.id,
    state:'LOCAL_ONLY',occurredAt:new Date(now()).toISOString(),payload:{
     adjustmentId:updated.id,occurrenceId:occurrence.id,revision:updated.revision,status:updated.status}});
   return result;
  },{maxAttempts:15});
 }
 async function adjustmentQuery(uid,sessionToken,input={}) {
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid);
   await authorize(tx,uid,sessionToken,c,'tripView');
   if(input.type==='detail'){
    if(!good(input.id))error('INVALID_ADJUSTMENT_ID');
    const s=await tx.get(rootDoc(c,'distribution_adjustments',input.id));
    if(!s.exists||s.data().tenantId!==uid||s.data().generation!==c.generation)
     error('ADJUSTMENT_NOT_FOUND');
    return {adjustment:s.data()};
   }
   if(input.type==='representation'){
    if(!good(input.id)||!Number.isSafeInteger(input.revision)||input.revision<0)
     error('INVALID_ADJUSTMENT_ID');
    const ref=rootDoc(c,'distribution_adjustment_representations',hash(input.id+':'+input.revision));
    const d=await tx.get(ref);
    if(!d.exists||d.data().tenantId!==uid||d.data().generation!==c.generation||
       d.data().adjustmentId!==input.id)error('ADJUSTMENT_NOT_FOUND');
    return {representation:d.data()};
   }
   if(input.type!=='list'||!good(input.occurrenceId))error('INVALID_QUERY');
   const limit=Number(input.limit??12);
   if(!Number.isSafeInteger(limit)||limit<1||limit>30)error('INVALID_LIMIT');
   const occ=await tx.get(rootDoc(c,'distribution_occurrences',input.occurrenceId));
   if(!occ.exists||occ.data().tenantId!==uid||occ.data().generation!==c.generation)
    error('OCCURRENCE_NOT_FOUND');
   let q=db.collection(`${c.root}/distribution_adjustments`)
    .where('occurrenceId','==',input.occurrenceId).orderBy('createdAtMs').orderBy('__name__');
   if(input.cursor){
    if(!good(input.cursor.id)||!Number.isSafeInteger(input.cursor.at))error('INVALID_CURSOR');
    q=q.startAfter(input.cursor.at,rootDoc(c,'distribution_adjustments',input.cursor.id));
   }
   const page=await tx.get(q.limit(limit+1)),docs=page.docs.slice(0,limit);
   const items=docs.filter(d=>d.data().tenantId===uid&&d.data().generation===c.generation)
    .map(d=>({id:d.id,occurrenceId:d.data().occurrenceId,revision:d.data().revision,
     createdAtMs:d.data().createdAtMs,status:d.data().status,type:d.data().type,
     quantity:d.data().quantity,value:d.data().value,fiscalCandidate:d.data().fiscalCandidate}));
   const last=docs.at(-1);
   return {items,next:page.size>limit&&last?{id:last.id,at:last.data().createdAtMs}:null};
  });
 }
 return {adjustmentCommand,adjustmentQuery};
}
