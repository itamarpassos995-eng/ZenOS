import {executeOccurrenceCommand} from './occurrences.js';
import {error,hash,id} from './security.js';
import {PRECISION} from '../../../src/core/distribution/domain.js';
import {sourceFact,reserveFact,releaseFact} from './occurrenceFacts.js';

/** Phase 3.1 A.2: Firestore V2, emulator-only service host.
 * All source verification, authorization and writes occur in one transaction.
 * No fiscal provider, inventory writer, finance writer or Connect send is mounted.
 */
const validKey=v=>typeof v==='string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(v);
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const integer=(v,min=0)=>{if(!Number.isSafeInteger(v)||v<min)error('INVALID_QUANTITY');return v;};
const decimalMinor=(value,precision)=>{
 const m=String(value).match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);if(!m)error('MONEY_SOURCE_REQUIRED');
 const fraction=(m[2]||'').padEnd(precision+1,'0');
 return BigInt(m[1])*10n**BigInt(precision)+BigInt(fraction.slice(0,precision)||0)+BigInt(Number(fraction[precision]||0)>=5);
};
const permissions={
 'distribution.occurrence.create':'returns',
 'distribution.occurrence.review':'returns',
 'distribution.fiscal.review':'fiscalReview',
 'distribution.finance.review':'finance',
 'distribution.fiscal.draft':'fiscalReview'
};
function fiscalSource(sale,country){
 // An approved existing fiscal reference is required before drafting an adjustment.
 const f=sale.fiscalOriginal || sale.documentoFiscalEmitido || null;
 if(!f || f.status!=='autorizado' || f.country!==country ||
   !validKey(String(f.id||'')) || typeof f.reference!=='string' || !f.reference.trim())return null;
 return {id:String(f.id),reference:f.reference,country,verified:true};
}
function saleAmount(sale,index,quantity,currency) {
 const precision=PRECISION[currency];if(precision===undefined)error('INVALID_CURRENCY');
 const lines=sale.itens;if(!Array.isArray(lines)||!lines.length)error('SALE_INVALID');
 const weights=lines.map(i=>{
  if(i.totalBRL!=null)return decimalMinor(i.totalBRL,2);
  return decimalMinor(i.precoPraticadoBRL,2)*BigInt(integer(Number(i.qtd),1));
 });
 const weightTotal=weights.reduce((a,b)=>a+b,0n);if(weightTotal<=0n)error('MONEY_SOURCE_REQUIRED');
 const total=decimalMinor(sale.totalOriginal,precision);
 const before=weights.slice(0,index).reduce((a,b)=>a+b,0n);
 const lineValue=total*(before+weights[index])/weightTotal-total*before/weightTotal;
 const ordered=BigInt(integer(Number(lines[index].qtd),1));
 const cents=lineValue*BigInt(quantity)/ordered;
 if(cents<=0n)error('MONEY_SOURCE_REQUIRED');
 return {currency,precision,minor:cents.toString()};
}
export function buildOccurrences({db,ctx,authorize,now=()=>Date.now()}) {
 const rootDoc=(c,collection,key)=>db.doc(`${c.root}/${collection}/${id(key)}`);
 const entityDoc=(c,collection,key)=>db.doc(`${c.base}/${collection}/${id(key)}`);
 async function verifiedPayload(tx,c,uid,actor,type,payload,occurrence,occurrenceId) {
  if(type==='DRAFT_FISCAL'){
   if(!occurrence?.fiscalOriginal?.verified)error('FISCAL_SOURCE_NOT_VERIFIED');
   const saleRef=entityDoc(c,'vendas',occurrence.refs.saleId);
   const saleSnap=await tx.get(saleRef);
   if(!saleSnap.exists||saleSnap.data().deleted)error('ORDER_NOT_FOUND');
   const sale=saleSnap.data().data;
   const confirmed=fiscalSource(sale,occurrence.country);
   if(!confirmed||confirmed.id!==occurrence.fiscalOriginal.id||
     confirmed.reference!==occurrence.fiscalOriginal.reference)error('FISCAL_SOURCE_NOT_VERIFIED');
   if(payload?.originalDocument!=null)error('CLIENT_FISCAL_ORIGIN_FORBIDDEN');
   return {id:payload?.id,type:payload?.type,eventId:payload?.eventId,
    at:new Date(now()).toISOString(),legalRuleRef:null,
    originalDocument:{id:confirmed.id,reference:confirmed.reference,country:confirmed.country}};
  }
  if(type!=='CREATE'){
   if(!validKey(payload?.eventId)||typeof payload.note!=='string'||!payload.note.trim()||
      payload.note.length>1000)error('INVALID_OCCURRENCE_EVENT');
   return {next:payload.next,eventId:payload.eventId,note:payload.note,
    at:new Date(now()).toISOString()};
  }
  const refs=payload?.refs;if(!refs||!validKey(refs.saleId)||!validKey(refs.productId)||
    !validKey(refs.customerId)||!validKey(refs.orderId)||
    !/^\d+$/.test(String(refs.orderLineId||'')))error('SOURCE_REFERENCE_REQUIRED');
  if(payload.tenantId!=null&&payload.tenantId!==uid||payload.id!==occurrenceId||
    payload.reportedBy!=null&&payload.reportedBy!==actor.operatorId)error('OCCURRENCE_CONTEXT_MISMATCH');
  if(payload.originalAmount!=null||payload.fiscalOriginal!=null||payload.country!=null)
    error('CLIENT_SNAPSHOT_FORBIDDEN');
  const index=integer(Number(refs.orderLineId));
  const [saleSnap,clientSnap,productSnap]=await Promise.all([
   tx.get(entityDoc(c,'vendas',refs.saleId)),
   tx.get(entityDoc(c,'clientes',refs.customerId)),
   tx.get(entityDoc(c,'produtos',refs.productId))
  ]);
  if(!saleSnap.exists||saleSnap.data().deleted||!clientSnap.exists||clientSnap.data().deleted||
     !productSnap.exists||productSnap.data().deleted)error('SOURCE_NOT_FOUND');
  const sale=saleSnap.data().data,item=sale.itens?.[index],product=productSnap.data().data;
  if(!['venda','pre_pedido'].includes(sale.tipoDocumento)||
    !item||String(sale.id)!==refs.saleId||refs.orderId!==refs.saleId||
    String(sale.clienteId)!==refs.customerId||
    String(item.produtoOriginalId??item.id)!==refs.productId||
    String(product.sku)!==String(item.produtoOriginalSku??item.sku))error('SOURCE_REFERENCE_MISMATCH');
  const quantity=integer(Number(payload.quantity),1);
  if(quantity>integer(Number(item.qtd),1))error('RETURN_EXCEEDED');
  const physical=integer(Number(sale._distribution?.dispatched?.[index]??item.movimentoEstoqueVenda?.total??item.qtd),0);
  if(quantity>physical)error('QUANTITY_NOT_DISPATCHED');
  // Source fact capacity is the maximum possible adjustment, never an amount from the client.
  let factCapacity=physical,sourceKind='MANUAL',sourceProof=null;
  let tripId=null,loadId=null,manifestId=null;
  if(refs.tripId!=null){
   if(!validKey(refs.tripId))error('INVALID_REFERENCE');
   const trip=await tx.get(rootDoc(c,'distribution_trips',refs.tripId)),value=trip.data();
   if(!value||value.generation!==c.generation)error('TRIP_SOURCE_MISMATCH');
   const match=value.stops?.flatMap(stop=>stop.lines
      .filter(line=>stop.orderId===refs.saleId &&
        String(line.orderLineId)===String(index) &&
        String(line.productId)===refs.productId)
      .map(line=>({stop,line})))||[];
   if(match.length!==1)error('TRIP_SOURCE_MISMATCH');
   const {stop,line}=match[0];
   if(!stop.proofId||!['TOTAL','PARTIAL','REFUSED','FAILED'].includes(stop.state))
      error('DELIVERY_PROOF_REQUIRED');
   if(payload?.proofId!=null&&payload.proofId!==stop.proofId)error('PROOF_MISMATCH');
   const evidence=await tx.get(rootDoc(c,'distribution_trip_events',stop.proofId));
   if(!evidence.exists||evidence.data().type!=='DELIVER'||
      evidence.data().tripId!==refs.tripId)error('DELIVERY_PROOF_REQUIRED');
   factCapacity=integer(Number(line.returning),0);
   if(factCapacity===0||quantity>factCapacity)error('FACT_CAPACITY_EXCEEDED');
   sourceKind='TRIP';sourceProof=stop.proofId;tripId=refs.tripId;
  }
  if(refs.loadId!=null){
   if(!validKey(refs.loadId))error('INVALID_REFERENCE');
   const load=await tx.get(rootDoc(c,'distribution_loads',refs.loadId)),value=load.data();
   if(!value||value.tenantId!==uid||value.generation!==c.generation||
     !value.lines.some(line=>line.orderId===refs.saleId&&line.orderLineId===String(index)&&line.productId===refs.productId))
      error('LOAD_SOURCE_MISMATCH');
   loadId=refs.loadId;
  }
  if(refs.manifestId!=null)error('MANIFEST_VERIFICATION_REQUIRED');
  const country=(c.config.fiscalCountry||c.config.issuer?.country||'').toUpperCase();
  if(!['BR','PY'].includes(country))error('FISCAL_COUNTRY_NOT_CONFIGURED');
  const currency=sale.moedaDocumento,amount=saleAmount(sale,index,quantity,currency);
  const original=fiscalSource(sale,country);
  if(refs.invoiceId!=null&&(!original||original.id!==refs.invoiceId))error('FISCAL_SOURCE_NOT_VERIFIED');
  const establishedId=String(c.config.establishmentId||uid);
  if(!validKey(establishedId))error('INVALID_ESTABLISHMENT');
  if(payload?.evidence?.length)error('EVIDENCE_UPLOAD_NOT_CONFIGURED');
  const factOrigin=sourceFact({tenantId:uid,establishmentId:establishedId,
    saleId:refs.saleId,lineIndex:index,kind:sourceKind,tripId,proofId:sourceProof});
  const factId=hash(factOrigin);
  return {
   id:occurrenceId,tenantId:uid,establishmentId:establishedId,country,
   reason:payload.reason,description:payload.description,quantity,
   reportedAt:new Date(now()).toISOString(),reportedBy:actor.operatorId,
   refs:{saleId:refs.saleId,orderId:refs.orderId,customerId:refs.customerId,
    orderLineId:String(index),productId:refs.productId,
    sellerId:String(sale.vendedorId||''),...(tripId?{tripId}:{}),
    ...(loadId?{loadId}:{}),...(manifestId?{manifestId}:{}),
    ...(original?{invoiceId:original.id}:{})},
   originalAmount:amount,fiscalOriginal:original,evidence:[],
   factId,sourceKind,sourceProofId:sourceProof, factCapacity,
   continuationOf:payload.continuationOf||null,
  };
 }
 async function occurrenceCommand(uid,sessionToken,input) {
  if(!input||!validKey(input.occurrenceId)||!validKey(input.key)||
    !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||
    Buffer.byteLength(JSON.stringify(input))>45000)error('INVALID_COMMAND');
  const tenantCommand={...input,tenantId:uid};
  return executeOccurrenceCommand({
   command:tenantCommand,
   transaction:({tenantId,occurrenceId,key,permission,type,payload},apply)=>db.runTransaction(async tx=>{
    const c=await ctx(tx,uid);
    const actor=await authorize(tx,uid,sessionToken,c,permissions[permission]);
    const principal={tenantId:uid,operatorId:actor.operatorId,moduleEnabled:true,permissions:[permission]};
    const receiptId=hash(`occurrence:${uid}:${key}`);
    const receiptRef=rootDoc(c,'distribution_occurrence_receipts',receiptId);
    const occurrenceRef=rootDoc(c,'distribution_occurrences',occurrenceId);
    const [receiptSnap,snap]=await Promise.all([tx.get(receiptRef),tx.get(occurrenceRef)]);
    const receipt=receiptSnap.exists?receiptSnap.data():null;
    if(receipt&&receipt.generation!==c.generation)error('V2_ROUTE_CHANGED');
    const saved=receipt?{identity:receipt.identity,operatorId:receipt.operatorId,result:receipt.result}:null;
    const current=snap.exists?snap.data():null;
    const verified=receipt?null:await verifiedPayload(tx,c,uid,actor,type,payload,current,occurrenceId);
    // Semantic fact lock is read in the same transaction as idempotency and occurrence.
    const factId=type==='CREATE'?verified?.factId:current?.factId;
    const factRef=factId?rootDoc(c,'distribution_occurrence_facts',factId):null;
    const factSnap=!receipt&&factRef?await tx.get(factRef):null;
    const factBefore=factSnap?.exists?factSnap.data():null;
    if(factBefore&&factBefore.generation!==c.generation)error('V2_ROUTE_CHANGED');
    let factAfter=null;
    if(!receipt&&type==='CREATE'){
     if(!verified?.factId)error('FACT_SOURCE_REQUIRED');
     if(verified.continuationOf&&actor.operatorId!=='admin'&&actor.permissions?.distributionManage!==true)
       error('CONTINUATION_APPROVAL_REQUIRED');
     factAfter=reserveFact(factBefore,{factId,occurrenceId,quantity:verified.quantity,
      capacity:verified.factCapacity,continuationOf:verified.continuationOf,
      actorId:actor.operatorId,at:verified.reportedAt});
    }
    if(!receipt&&type==='TRANSITION_LOGISTICS'&&payload?.next==='CONFIRMED'&&
      current?.sourceKind==='MANUAL'&&actor.operatorId!=='admin'&&
      actor.permissions?.distributionManage!==true)error('MANUAL_REVIEW_MANAGER_REQUIRED');
    if(!receipt&&type==='TRANSITION_LOGISTICS'&&payload?.next==='DISMISSED'&&factRef){
     factAfter=releaseFact(factBefore,{occurrenceId,actorId:actor.operatorId,at:verified.at});
    }
    const result=await apply({occurrence:current,receipt:saved,actor:principal,validatedPayload:verified});
    if(result.replay)return {...result.result,replayed:true};
    const opId=hash(`occ:${uid}:${key}`),sequence=integer(c.head.sequence)+1;
    const event={id:opId,tenantId:uid,occurrenceId,revision:result.occurrence.revision,
      actorId:actor.operatorId,type,createdAt:now(),event:result.occurrence.history.at(-1)};
    const doc={...result.occurrence,generation:c.generation,createdAt:
      current?.createdAt??now(),updatedAt:now(),updatedBy:actor.operatorId};
    if(Buffer.byteLength(JSON.stringify(doc))>650000)error('REQUEST_TOO_LARGE');
    tx.set(occurrenceRef,doc);
    if(factAfter&&factRef)tx.set(factRef,{...factAfter,generation:c.generation,updatedAt:now()});
    tx.create(receiptRef,{generation:c.generation,identity:JSON.stringify(stable(tenantCommand)),
      operatorId:actor.operatorId,result:result.result,createdAt:now()});
    tx.create(rootDoc(c,'distribution_occurrence_events',opId),event);
    tx.create(rootDoc(c,'distribution_outbox',opId),{...result.outbox,id:opId,occurredAt:new Date(now()).toISOString(),entityId:occurrenceId,payload:{occurrenceId,revision:doc.revision,states:doc.states}});
    tx.create(entityDoc(c,'operations',opId),{schema:2,key:`occurrence:${key}`,
      sequence,commandId:opId,createdAtClient:new Date(now()).toISOString(),
      revisions:{...c.head.fieldRevisions},patches:[],financialEntries:[]});
    tx.update(db.doc(c.base),{sequence,lastReceipt:opId});
    return result.result;
   },{maxAttempts:15}),
   // Authorization is resolved inside transaction by server host above.
  });
 }
 async function occurrenceQuery(uid,sessionToken,input={}) {
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid);
   await authorize(tx,uid,sessionToken,c,'tripView');
   if(input.type==='detail'){
    const s=await tx.get(rootDoc(c,'distribution_occurrences',input.occurrenceId));
    if(!s.exists||s.data().generation!==c.generation)error('OCCURRENCE_NOT_FOUND');
    return {occurrence:s.data()};
   }
   if(input.type!=='list'&&input.type!=='sourceOrders')error('INVALID_QUERY');
   if(input.type==='sourceOrders')await authorize(tx,uid,sessionToken,c,'returns');
   const from=Number(input.from),to=Number(input.to),limit=Number(input.limit??12);
   if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<=from||
     to-from>370*86400000||!Number.isSafeInteger(limit)||limit<1||limit>30)error('INVALID_PERIOD');
   if(input.type==='sourceOrders'){
    let q=db.collection(`${c.base}/vendas`).where('data.createdAt','>=',new Date(from).toISOString())
      .where('data.createdAt','<',new Date(to).toISOString()).orderBy('data.createdAt').orderBy('__name__');
    if(input.cursor){
     if(!validKey(input.cursor.id)||!Number.isFinite(Date.parse(input.cursor.at)))error('INVALID_CURSOR');
     q=q.startAfter(input.cursor.at,entityDoc(c,'vendas',input.cursor.id));
    }
    const page=await tx.get(q.limit(limit+1)),docs=page.docs.slice(0,limit);
    const items=docs.filter(d=>!d.data().deleted&&['venda','pre_pedido'].includes(d.data().data?.tipoDocumento))
      .map(d=>{const o=d.data().data;return {id:String(o.id),clienteId:String(o.clienteId||''),
       clienteNome:o.clienteNome||'',moedaDocumento:o.moedaDocumento,
       itens:(o.itens||[]).map(i=>({nome:i.nome,qtd:i.qtd,
        produtoOriginalId:String(i.produtoOriginalId??i.id),sku:i.produtoOriginalSku??i.sku}))};});
    const last=docs.at(-1);
    return {items,next:page.size>limit&&last?{id:last.id,at:last.data().data.createdAt}:null};
   }
   let q=db.collection(`${c.root}/distribution_occurrences`)
    .where('createdAt','>=',from).where('createdAt','<',to).orderBy('createdAt').orderBy('__name__');
   if(input.cursor){
    if(!validKey(input.cursor.id)||!Number.isSafeInteger(input.cursor.at))error('INVALID_CURSOR');
    q=q.startAfter(input.cursor.at,rootDoc(c,'distribution_occurrences',input.cursor.id));
   }
   const page=await tx.get(q.limit(limit+1)),docs=page.docs.slice(0,limit);
   const items=docs.filter(d=>d.data().generation===c.generation).map(d=>{
    const o=d.data();return {id:o.id,createdAt:o.createdAt,reason:o.reason,quantity:o.quantity,
     country:o.country,refs:o.refs,originalAmount:o.originalAmount,states:o.states,revision:o.revision};
   });
   const last=docs.at(-1);
   return {items,next:page.size>limit&&last?{id:last.id,at:last.data().createdAt}:null};
  });
 }
 return {occurrenceCommand,occurrenceQuery};
}
