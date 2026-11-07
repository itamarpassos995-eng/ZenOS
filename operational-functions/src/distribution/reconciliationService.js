import {hash,id,error} from './security.js';
import {calculateFinancialOrigin,canonicalFinancialSource} from '../../../src/core/distribution/phase31Reconciliation.js';
/** Emulator-only read-audit host. Reads V2 sale and existing financeiro_livro.
 * No writes to sales, receivables, cash, customer, payments or stock.
 */
const keyOk=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
export function buildFinancialReconciliation({db,ctx,authorize,now=()=>Date.now()}){
 const document=(c,collection,key)=>db.doc(`${c.root}/${collection}/${id(key)}`);
 async function sources(tx,c,adjustment){
  const saleRef=db.doc(`${c.base}/vendas/${id(adjustment.saleId)}`);
  const [saleSnap,customerSnap,ledgerSnap]=await Promise.all([
   tx.get(saleRef),
   tx.get(db.doc(`${c.base}/clientes/${id(adjustment.customerId)}`)),
   tx.get(db.collection(`${c.root}/financeiro_livro`)
    .where('referenciaId','==',adjustment.saleId).limit(31))
  ]);
  if(!saleSnap.exists||saleSnap.data().deleted||!customerSnap.exists||
     customerSnap.data().deleted)error('SOURCE_NOT_FOUND');
  const sale=saleSnap.data().data;
  if(String(sale.id)!==adjustment.saleId||String(sale.clienteId)!==adjustment.customerId)
   error('SOURCE_REFERENCE_MISMATCH');
  const ledger=ledgerSnap.docs.slice(0,30).map(d=>({...d.data(),id:d.id}));
  if(ledger.some(e=>e.lojaId&&String(e.lojaId)!==adjustment.tenantId))
   error('FOREIGN_LEDGER_RECORD');
  const sourceComplete=ledgerSnap.size<=30;
  const sourceFingerprint=hash(canonicalFinancialSource({
   sale,ledger,sourceComplete,customerId:customerSnap.data().data?.id,
   saleVersion:saleSnap.data().version,customerVersion:customerSnap.data().version
  }));
  const computed=calculateFinancialOrigin({sale,adjustment,ledger,sourceComplete});
  return {computed,sourceFingerprint,readCount:2+ledgerSnap.size};
 }
 async function reconciliationCommand(uid,sessionToken,input){
  if(!keyOk(input?.adjustmentId)||!keyOk(input?.key)||
     !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
     JSON.stringify(input).length>4000||
     Object.keys(input).some(k=>!['adjustmentId','key','expectedRevision'].includes(k)))
   error('RECONCILIATION_COMMAND_INVALID');
  const identity=hash(canonicalFinancialSource({uid,...input}));
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await authorize(tx,uid,sessionToken,c,'finance');
   const adjustmentSnap=await tx.get(document(c,'distribution_adjustments',input.adjustmentId));
   const a=adjustmentSnap.data();
   if(!a||a.generation!==c.generation||a.tenantId!==uid||a.id!==input.adjustmentId)
    error('ADJUSTMENT_NOT_FOUND');
   if(a.revision!==input.expectedRevision)error('REVISION_CONFLICT');
   const latestRef=document(c,'distribution_reconciliations',a.id);
   const receiptRef=document(c,'distribution_reconciliation_receipts',hash(uid+':'+input.key));
   const [latestSnap,receiptSnap]=await Promise.all([tx.get(latestRef),tx.get(receiptRef)]);
   if(receiptSnap.exists){
    const r=receiptSnap.data();
    if(r.identity!==identity||r.generation!==c.generation||r.actorId!==actor.operatorId)
     error('IDEMPOTENCY_CONFLICT');
    return {...r.result,replayed:true};
   }
   const {computed,sourceFingerprint,readCount}=await sources(tx,c,a);
   const old=latestSnap.exists?latestSnap.data():null;
   if(old&&(old.tenantId!==uid||old.generation!==c.generation))error('V2_ROUTE_CHANGED');
   const revision=(old?.revision??-1)+1,stamp=now(),at=new Date(stamp).toISOString();
   const result={...computed,tenantId:uid,adjustmentRevision:a.revision,
    sourceFingerprint,revision,computedAt:at,actorId:actor.operatorId,
    generation:c.generation,readonly:true,sourceReadCount:readCount};
   const eventId=hash('reconciliation:'+uid+':'+input.key);
   tx.set(latestRef,result);
   tx.create(document(c,'distribution_reconciliation_history',hash(a.id+':'+revision)),result);
   tx.create(receiptRef,{identity,generation:c.generation,actorId:actor.operatorId,
    result:{adjustmentId:a.id,revision,state:computed.state,sourceFingerprint}});
   tx.create(document(c,'distribution_reconciliation_events',eventId),{
    id:eventId,tenantId:uid,adjustmentId:a.id,revision,actorId:actor.operatorId,
    state:computed.state,at,sourceFingerprint});
   return {adjustmentId:a.id,revision,state:computed.state,sourceFingerprint};
  },{maxAttempts:10});
 }
 async function reconciliationQuery(uid,sessionToken,input){
  if(!keyOk(input?.adjustmentId)||!['detail','history'].includes(input?.type)||
     Object.keys(input).some(k=>!['adjustmentId','type','revision'].includes(k)))
   error('INVALID_QUERY');
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid);await authorize(tx,uid,sessionToken,c,'finance');
   const adjustmentSnap=await tx.get(document(c,'distribution_adjustments',input.adjustmentId));
   const a=adjustmentSnap.data();
   if(!a||a.generation!==c.generation||a.tenantId!==uid)error('ADJUSTMENT_NOT_FOUND');
   const ref=input.type==='history'?
    document(c,'distribution_reconciliation_history',hash(a.id+':'+input.revision)):
    document(c,'distribution_reconciliations',a.id);
   if(input.type==='history'&&(!Number.isSafeInteger(input.revision)||input.revision<0))
    error('INVALID_REVISION');
   const recSnap=await tx.get(ref),record=recSnap.data();
   if(!record||record.tenantId!==uid||record.generation!==c.generation)error('RECONCILIATION_NOT_FOUND');
   if(input.type==='history')return {reconciliation:record,historical:true};
   const current=await sources(tx,c,a);
   const stale=current.sourceFingerprint!==record.sourceFingerprint||
    record.adjustmentRevision!==a.revision;
   return {reconciliation:stale?{...record,state:'STALE',issues:[...new Set([...record.issues,'SOURCE_CHANGED'])]}:record,
    stale,currentSourceReadCount:current.readCount};
  },{maxAttempts:10});
 }
 return {reconciliationCommand,reconciliationQuery};
}
