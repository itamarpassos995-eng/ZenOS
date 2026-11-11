import {reconcilePygTripJournal} from './trips.js';
import {hash,id,error} from './security.js';
import {calculateFinancialOrigin,canonicalFinancialSource} from '../../../src/core/distribution/phase31Reconciliation.js';
import {reconcileLinkedObligations} from '../../../src/core/distribution/phase31FinancialLinks.js';
import {classifySaleReturnHistory} from '../../../src/core/distribution/phase31ReturnLineage.js';
/** Emulator-only read-audit host. Reads V2 sale and existing financeiro_livro.
 * No writes to sales, receivables, cash, customer, payments or stock.
 */
const keyOk=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
export function buildFinancialReconciliation({db,ctx,authorize,now=()=>Date.now()}){
 const document=(c,collection,key)=>db.doc(`${c.root}/${collection}/${id(key)}`);
 async function sources(tx,c,adjustment){
  const saleRef=db.doc(`${c.base}/vendas/${id(adjustment.saleId)}`);
  const [saleSnap,customerSnap]=await Promise.all([
   tx.get(saleRef),
   tx.get(db.doc(`${c.base}/clientes/${id(adjustment.customerId)}`))
  ]);
  // B.2 cursor pagination avoids downloading a whole collection. A bounded scan
  // that cannot prove completeness must fail closed; never silently truncate.
  // c.root = lojas/{tenant}; c.base = native V2 generation. Ledger is tenant-scoped.
  const financial=db.collection(`${c.root}/financeiro_livro`);
  // PDV sale journal references saleId; native client receipts keep their own
  // receiptId as referenciaId and link to the sale through financeLink.saleId.
  const queries=[
   financial.where('referenciaId','==',adjustment.saleId).orderBy('__name__'),
   financial.where('financeLink.saleId','==',adjustment.saleId).orderBy('__name__'),
   financial.where('financeLink.saleIds','array-contains',adjustment.saleId).orderBy('__name__'),
   financial.where('detalhes.vendaId','==',adjustment.saleId).orderBy('__name__')
  ];
  const docs=new Map();let sourceComplete=true,readCount=2;
  for(const financialQuery of queries){
   let cursor=null,complete=false;
   for(let p=0;p<10;p++){
    const query=cursor?financialQuery.startAfter(cursor).limit(31):financialQuery.limit(31);
    const page=await tx.get(query);readCount+=page.size;
    if(page.size===0){complete=true;break;}
    const take=page.docs.slice(0,30);
    for(const item of take)docs.set(item.ref.path,item);
    if(page.size<=30){complete=true;break;}
    cursor=take.at(-1);
   }
   if(!complete)sourceComplete=false;
  }
  const pages=[...docs.values()].sort((a,b)=>a.id.localeCompare(b.id));
  if(!saleSnap.exists||saleSnap.data().deleted||!customerSnap.exists||
     customerSnap.data().deleted)error('SOURCE_NOT_FOUND');
  const sale=saleSnap.data().data;
  if(String(sale.id)!==adjustment.saleId||String(sale.clienteId)!==adjustment.customerId)
   error('SOURCE_REFERENCE_MISMATCH');
  const ledger=pages.map(doc=>{
   const raw=doc.data(),meta=raw.financeLink?.financeLinkVersion===2?raw.financeLink:null;
   // Metadata complements the existing BRL journal entry; it never overwrites
   // its booked amount, currency or external settlement state.
   const chosen=meta?.allocations?.find(row=>String(row.saleId)===String(adjustment.saleId));
   return {...raw,...(meta?{
    financeLinkVersion:meta.financeLinkVersion,financeEventType:meta.financeEventType,
    receivableId:chosen?`REC-${adjustment.saleId}`:meta.receivableId,
    installmentId:chosen?.installmentId||meta.installmentId,
    paymentId:meta.paymentId,
    sourceEventId:chosen?`VENDA-${adjustment.saleId}-FIADO`:meta.sourceEventId,
    nativeReferenciaId:raw.referenciaId,
    ...(chosen?{valor:chosen.amountBRL,moeda:'BRL'}:{}),
    referenciaId:meta.saleIds?.includes(adjustment.saleId)?adjustment.saleId:meta.saleId
   }:{}),id:doc.id};
  });
  if(ledger.some(e=>e.lojaId&&String(e.lojaId)!==adjustment.tenantId))
   error('FOREIGN_LEDGER_RECORD');
  const hasV2Links=ledger.some(e=>e.financeLinkVersion===2);
  // Do not mix verified V2 credit with unlinked legacy entries.
  const nativePyg=sale.moedaDocumento==='PYG'&&sale.financeCreditV2?.nativeAmount?.currency==='PYG';
  const computed=nativePyg?
   reconcilePygTripJournal({sale,journal:pages.map(doc=>({...doc.data(),id:doc.id})),tenantId:adjustment.tenantId,
    generation:c.generation,complete:sourceComplete,adjustment}):
   hasV2Links?reconcileLinkedObligations({sale,adjustment,ledger,complete:sourceComplete}):
   calculateFinancialOrigin({sale,adjustment,ledger,sourceComplete});
  const returnLineage=classifySaleReturnHistory({
   sale,ledger,tenantId:adjustment.tenantId
  });
  computed.returnLineage=returnLineage;
  if(returnLineage.items.length>0){
   computed.issues=[...new Set([...(computed.issues||[]),
    'PREVIOUS_RETURN_EXTERNAL_SETTLEMENT_UNVERIFIED'])].sort();
   computed.state='RECONCILIATION_REQUIRED';
   computed.eligibility&&(computed.eligibility.preconditions=[
    ...new Set([...(computed.eligibility.preconditions||[]),
     'PREVIOUS_RETURN_EXTERNAL_SETTLEMENT_UNVERIFIED'])]);
  }
  const sourceFingerprint=hash(canonicalFinancialSource({
   sale,ledger,sourceComplete,customerId:customerSnap.data().data?.id,
   saleVersion:saleSnap.data().version,customerVersion:customerSnap.data().version
  }));
  return {computed,sourceFingerprint,readCount};
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
   if(!record&&input.type==='detail')return {reconciliation:null,missing:true};
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
