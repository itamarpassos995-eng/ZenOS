import {buildTrips} from './trips.js';
import {buildOccurrences} from './occurrenceService.js';
import {buildOccurrenceEvidence} from './evidenceService.js';
import {buildCommercialAdjustments} from './commercialService.js';
import {buildFinancialReconciliation} from './reconciliationService.js';
import {buildSettlement} from './settlement.js';
import {distributionPeriod} from '../../../src/core/distribution/period.js';
import {criarEventoEstoque} from '../../../src/core/stockAuditCore.js';
import {error,hash,id,requireEmulators,credentialFingerprint,verifyPin,canOperate,token,distributionPermission} from './security.js';
import {createLoad,replaceLoadLines,transitionLoad,issueManifest,historicalManifest,PRECISION} from '../../../src/core/distribution/domain.js';

const canonical = v => Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const integer=(v,min=0)=>{if(!Number.isSafeInteger(v)||v<min)error('INVALID_QUANTITY');return v;};
// Converts persisted decimal to minor units without binary arithmetic. No current/default FX.
function minor(value,precision) {
 const m=String(value).match(/^(\d+)(?:\.(\d+))?$/);if(!m)error('MONEY_SOURCE_REQUIRED');
 if(precision===0&&/[1-9]/.test(m[2]||''))error('INVALID_CURRENCY_PRECISION');
 const fraction=(m[2]||'').padEnd(precision+1,'0');
 return BigInt(m[1])*10n**BigInt(precision)+BigInt(fraction.slice(0,precision)||0)+(Number(fraction[precision]||0)>=5?1n:0n);
}
const actions = new Set(['CREATE','RESERVE','START_PICK','CHECK','APPROVE','CONFIRM_LOADING','MANIFEST','DISPATCH','CANCEL']);
export function distributionService(db,{now=()=>Date.now(),staging=false,emulatorPygCompensationUid=null}={}) {
 if(staging){
  if(db.projectId!=='zenos-distribution-staging'||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)error('STAGING_PROJECT_REQUIRED');
 }else requireEmulators();
 const day=(at,timezone)=>new Intl.DateTimeFormat('sv-SE',{timeZone:timezone||'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 const store = uid=>`lojas/${id(uid)}`;
 const ctx = async(tx,uid) => {
  const root=store(uid),control=await tx.get(db.doc(`${root}/dados/storage_control`));
  if(control.data()?.mode!=='v2'||!control.data()?.generation)error('V2_NOT_READY');
  const base=`${root}/v2_generations/${id(control.data().generation)}`;
  const [head,config]=await Promise.all([tx.get(db.doc(base)),tx.get(db.doc(`${root}/distribution_config/module`))]);
  if(head.data()?.schema!==2||head.data()?.state!=='ready'||head.data()?.sourceChecksum!==control.data()?.sourceChecksum)error('V2_NOT_READY');
  const entitlement=control.data().entitlements?.distribution;
  if(config.data()?.enabled!==true||entitlement?.enabled!==true||(entitlement.expiresAt!=null&&entitlement.expiresAt<=now()))error('MODULE_DISABLED');
  if(staging&&config.data()?.pilotProfile!=='PYG_CREDIT_CASH_V1')error('STAGING_PROFILE_REQUIRED');
  return {root,base,head:head.data(),config:config.data(),generation:control.data().generation};
 };
 const authorize = async(tx,uid,sessionToken,c,scope='stock') => {
  if(!/^[a-f0-9]{64}$/.test(sessionToken||''))error('UNAUTHENTICATED');
  const session=await tx.get(db.doc(`${c.root}/distribution_sessions/${hash(sessionToken)}`));
  const s=session.data();
  if(!s||s.expiresAt<=now()||s.uid!==uid||s.generation!==c.generation)error('SESSION_EXPIRED');
  const operator=await tx.get(db.doc(`${c.base}/operadores/${id(s.operatorId)}`));
  const op=operator.data()?.data;
  if(operator.data()?.deleted||!distributionPermission(op,scope)||credentialFingerprint(op)!==s.credential)error('FORBIDDEN');
  return {operatorId:s.operatorId,name:op.nome,permissions:op.permissoes||{}};
 };
 async function login(uid,{operatorId,pin,scope='stock'}) {
  id(uid);id(operatorId);if(!['stock','pdv','driver','trip'].includes(scope))error('FORBIDDEN');
  const secret=token();
  const result=await db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),ref=db.doc(`${c.base}/operadores/${id(operatorId)}`);
   const [operator,attempt]=await Promise.all([tx.get(ref),tx.get(db.doc(`${c.root}/distribution_login_attempts/${hash(operatorId)}`))]);
   const attempts=attempt.data()||{};
   if(attempts.blockedUntil>now())error('RATE_LIMITED');
   const op=operator.data()?.data;
   if(operator.data()?.deleted||!verifyPin(op,pin)||!distributionPermission(op,scope)) {
    const failures=attempts.windowAt>now()-300000?(attempts.failures||0)+1:1;
    tx.set(attempt.ref,{failures,windowAt:attempts.windowAt>now()-300000?attempts.windowAt:now(),blockedUntil:failures>=5?now()+300000:0});
    return {failed:true};
   }
   const expiresAt=now()+1800000;
   tx.set(attempt.ref,{failures:0,windowAt:now(),blockedUntil:0});
   tx.create(db.doc(`${c.root}/distribution_sessions/${hash(secret)}`),{uid,operatorId,generation:c.generation,scope,credential:credentialFingerprint(op),expiresAt});
   return {sessionToken:secret,operatorId,operatorName:op.nome,scope,capabilities:['admin','stock','driver','manage','returns','finance','fiscalReview'].filter(p=>distributionPermission(op,p)),timeZone:c.config.timezone||'America/Asuncion',expiresAt};
  });
  if(result.failed)error('INVALID_CREDENTIAL');return result;
 }
 async function command(uid,sessionToken,input) {
  if(!actions.has(input?.type)||typeof input.key!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(input.key))error('INVALID_COMMAND');
  id(input.loadId);integer(input.expectedRevision);
  if(Buffer.byteLength(JSON.stringify(input))>32000)error('REQUEST_TOO_LARGE');
  const fingerprint=hash(canonical(input));
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await authorize(tx,uid,sessionToken,c);
   if(input.type==='APPROVE'&&input.payload?.partial===true)await authorize(tx,uid,sessionToken,c,'manage');
   const loadRef=db.doc(`${c.root}/distribution_loads/${id(input.loadId)}`),receiptRef=db.doc(`${c.root}/distribution_receipts/${hash(input.key)}`);
   const [loadSnap,prior]=await Promise.all([tx.get(loadRef),tx.get(receiptRef)]);
   if(prior.exists){if(prior.data().generation!==c.generation)error('V2_ROUTE_CHANGED');if(prior.data().fingerprint!==fingerprint||prior.data().operatorId!==actor.operatorId)error('IDEMPOTENCY_CONFLICT');return {...prior.data().result,replayed:true};}
   const headRef=db.doc(c.base),sequence=integer(c.head.sequence)+1,operationId=hash(`distribution:${input.key}`);
   const writes=[],patches=[],orderWrites=new Map(),productWrites=new Map(),audit=[];
   let loadingCheck,partialApproval,truckLoading;
   const orderCache=new Map(),productCache=new Map();
   const readOrder=async orderId=>{
    if(!orderCache.has(orderId)){
     const ref=db.doc(`${c.base}/vendas/${id(orderId)}`),snap=await tx.get(ref),envelope=snap.data();
     if(!envelope||envelope.deleted)error('ORDER_NOT_FOUND');
     if(!['pre_pedido','venda'].includes(envelope.data.tipoDocumento))error('ORDER_NOT_ELIGIBLE');
     orderCache.set(orderId,{ref,envelope,data:structuredClone(envelope.data)});
    }return orderCache.get(orderId);
   };
   const readProduct=async productId=>{
    if(!productCache.has(productId)){
     const ref=db.doc(`${c.base}/produtos/${id(productId)}`),snap=await tx.get(ref),envelope=snap.data();
     if(!envelope||envelope.deleted)error('PRODUCT_NOT_FOUND');
     productCache.set(productId,{ref,envelope,data:structuredClone(envelope.data)});
    }return productCache.get(productId);
   };
   let load=loadSnap.data();const p=input.payload||{};
   if(input.type==='CREATE') {
    if(load||input.expectedRevision!==0)error('REVISION_CONFLICT');
    if(!Array.isArray(p.selections)||!p.selections.length||p.selections.length>40)error('INVALID_SELECTION');
    load=createLoad({id:input.loadId,tenantId:uid,warehouseId:'deposito',policyVersion:'distribution-v1'});
    const lines=[];const selectionIds=new Set();
    for(const selection of p.selections) {
     const orderId=selection.orderId;id(orderId);integer(selection.lineIndex);integer(selection.quantity,1);
     const selectionId=`${orderId}:${selection.lineIndex}`;if(selectionIds.has(selectionId))error('DUPLICATE_LINE');selectionIds.add(selectionId);
     const order=await readOrder(orderId),sale=order.data;
     if(!['pendente','concluida'].includes(sale.estado))error('ORDER_NOT_ELIGIBLE');
     const item=sale.itens?.[selection.lineIndex];if(!item||item.tipoItem==='servico'||item.usoUnicoEncomendado)error('ORDER_NOT_ELIGIBLE');
     const ordered=integer(Number(item.qtd),1),allocated=integer(sale._distribution?.allocated?.[selection.lineIndex]||0);
     if(allocated+selection.quantity>ordered)error('ORDER_OVERALLOCATED');
     const product=await readProduct(String(item.produtoOriginalId??item.id));
     if(String(product.data.sku)!==String(item.produtoOriginalSku??item.sku))error('PRODUCT_IDENTITY_MISMATCH');
     if(!sale.clienteId)error('CUSTOMER_REQUIRED');
     const client=await tx.get(db.doc(`${c.base}/clientes/${id(String(sale.clienteId))}`));
     if(!client.exists||client.data()?.deleted)error('CUSTOMER_REQUIRED');
     if(!sale.vendedorId)error('SELLER_REQUIRED');
     const seller=await tx.get(db.doc(`${c.base}/operadores/${id(String(sale.vendedorId))}`));
     if(!seller.exists||seller.data()?.deleted)error('SELLER_REQUIRED');
     const currency=sale.moedaDocumento,precision=PRECISION[currency];if(precision===undefined)error('MONEY_SOURCE_REQUIRED');
     // Allocate the frozen document total proportionally by recorded BRL weights.
     // This preserves document discounts and uses no live exchange rate.
     const weights=sale.itens.map(i=>i.totalBRL!=null?minor(i.totalBRL,2):minor(i.precoPraticadoBRL,2)*BigInt(integer(Number(i.qtd),1)));
     const totalWeight=weights.reduce((a,b)=>a+b,0n);if(totalWeight<=0n)error('MONEY_SOURCE_REQUIRED');
     const total=minor(sale.totalOriginal,precision),before=weights.slice(0,selection.lineIndex).reduce((a,b)=>a+b,0n);
     const lineTotal=(total*(before+weights[selection.lineIndex])/totalWeight)-(total*before/totalWeight);
     const allocatedMinor=BigInt(sale._distribution?.allocatedMinor?.[selection.lineIndex]||'0');
     const allocation=allocated+selection.quantity===ordered?lineTotal-allocatedMinor:lineTotal*BigInt(selection.quantity)/BigInt(ordered);
     if(allocation<0n||allocatedMinor+allocation>lineTotal)error('MONEY_ALLOCATION_CONFLICT');
     const physical=sale.tipoDocumento==='venda'&&!sale._distribution?.commercialFinalized;
     if(physical&&(!item.movimentoEstoqueVenda||Number(item.movimentoEstoqueVenda.total)!==ordered))error('STOCK_PROOF_REQUIRED');
     const customer=client.data().data;
     lines.push({id:hash(selectionId).slice(0,20),tenantId:uid,orderId,orderLineId:String(selection.lineIndex),productId:String(product.data.id),sku:String(product.data.sku),description:product.data.nome,unit:product.data.unidadeMedida||'UN',city:customer.cidade??customer.ciudad,lot:item.lote??product.data.lote,variant:product.data.variante,packaging:product.data.embalagem,customerId:String(sale.clienteId),customerName:customer.nome,destination:customer.endereco||sale.enderecoEntrega||'',sellerId:String(sale.vendedorId),quantity:selection.quantity,amount:{minor:String(allocation),currency,precision,kind:'sale-allocation',source:orderId}});
     sale._distribution={...(sale._distribution||{}),allocated:{...(sale._distribution?.allocated||{}),[selection.lineIndex]:allocated+selection.quantity},stockManaged:true,allocatedMinor:{...(sale._distribution?.allocatedMinor||{}),[selection.lineIndex]:String(allocatedMinor+allocation)}};
     orderWrites.set(orderId,order);
    }
    load={...replaceLoadLines(load,lines),createdAt:now(),updatedAt:now(),reservationState:'NONE',pickingState:'PENDING',createdBy:actor.operatorId,generation:c.generation};
   } else {
    if(load&&load.generation!==c.generation)error('V2_ROUTE_CHANGED');
    if(!load||load.tenantId!==uid||load.revision!==input.expectedRevision)error('REVISION_CONFLICT');
    // Pre-read all source records so no write occurs before all validation reads.
    for(const line of load.lines){await readOrder(line.orderId);await readProduct(line.productId);}
    if(input.type==='RESERVE') {
     if(load.state!=='DRAFT'||load.reservationState!=='NONE')error('INVALID_TRANSITION');
     for(const line of load.lines) {
      if(orderCache.get(line.orderId).data.tipoDocumento==='venda'&&!orderCache.get(line.orderId).data._distribution?.commercialFinalized)continue;
      const product=productCache.get(line.productId),v=product.data;
      if(!Number.isFinite(v.estoqueGalpao)||!Number.isFinite(v.estoque))error('STOCK_RECONCILIATION_REQUIRED');
      const reserved=integer(v.estoqueReservadoDistribuicao||0);
      if(v.estoqueGalpao-reserved<line.quantity)error('INSUFFICIENT_STOCK');
      v.estoqueReservadoDistribuicao=reserved+line.quantity;productWrites.set(line.productId,product);
     }
     load={...transitionLoad(load,'PLANNED'),reservationState:'RESERVED'};
    }
    if(input.type==='START_PICK')load={...transitionLoad(load,'LOADING'),pickingState:'IN_PROGRESS'};
    if(input.type==='CHECK') {
     if(load.state!=='LOADING'||!Array.isArray(p.quantities)||p.quantities.length!==load.lines.length||p.quantities.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>load.lines[i].quantity))error('CHECK_MISMATCH');
     const lines=load.lines.map((line,i)=>({lineId:line.id,authorized:line.quantity,checked:p.quantities[i]}));
     const shortage=lines.some(line=>line.checked<line.authorized);
     const reason=typeof p.reason==='string'?p.reason.trim():'';
     if((shortage&&!reason)||reason.length>300)error('CHECK_MISMATCH');
     loadingCheck={lines,reason,operatorId:actor.operatorId,at:now(),revision:load.revision+1};
     load=shortage
      ? {...load,revision:load.revision+1,pickingState:'SHORTAGE',loadingCheck}
      : {...transitionLoad(load,'LOADED'),pickingState:'COMPLETED',checkedBy:actor.operatorId,checkedAt:loadingCheck.at,loadingCheck};
    }
    if(input.type==='APPROVE') {
     if(p.partial===true){
      const check=load.loadingCheck;
      if(load.state!=='LOADING'||load.pickingState!=='SHORTAGE'||check?.revision!==load.revision||load.reservationState!=='RESERVED')error('CHECK_REQUIRED');
      if(!check.lines.some(row=>row.checked>0))error('EMPTY_LOAD');
      const lines=[];
      for(const [i,line] of load.lines.entries()){
       const checked=check.lines[i];
       if(checked.lineId!==line.id)error('CHECK_MISMATCH');
       const pending=line.quantity-checked.checked;
       const order=orderCache.get(line.orderId);
       if(pending&&order.data.tipoDocumento!=='pre_pedido')error('ORDER_NOT_ELIGIBLE');
       const retained=BigInt(line.amount.minor)*BigInt(checked.checked)/BigInt(line.quantity);
       if(pending){
        const product=productCache.get(line.productId);
        const reserved=integer(product.data.estoqueReservadoDistribuicao||0);
        if(reserved<pending)error('STOCK_RECONCILIATION_REQUIRED');
        product.data.estoqueReservadoDistribuicao=reserved-pending;
        productWrites.set(line.productId,product);
        const allocation=order.data._distribution;
        allocation.allocated[line.orderLineId]=integer(allocation.allocated[line.orderLineId]-pending);
        const remainingMinor=BigInt(allocation.allocatedMinor[line.orderLineId])-BigInt(line.amount.minor)+retained;
        if(remainingMinor<0n)error('MONEY_ALLOCATION_CONFLICT');
        allocation.allocatedMinor[line.orderLineId]=String(remainingMinor);
        allocation.stockManaged=Object.values(allocation.allocated).some(quantity=>quantity>0);
        orderWrites.set(line.orderId,order);
       }
       if(checked.checked)lines.push({...line,quantity:checked.checked,amount:{...line.amount,minor:String(retained)}});
      }
      partialApproval={operatorId:actor.operatorId,at:now(),revision:load.revision+1,reason:check.reason,
       lines:load.lines.map((line,i)=>({lineId:line.id,orderId:line.orderId,orderLineId:line.orderLineId,
        description:line.description,unit:line.unit,authorized:line.quantity,approved:check.lines[i].checked}))};
      load={...load,lines,state:'APPROVED',revision:load.revision+1,pickingState:'COMPLETED',partialApproval};
     }else{
     if(load.pickingState!=='COMPLETED')error('CHECK_REQUIRED');
     load=transitionLoad(load,'APPROVED');
     }
    }
    if(input.type==='CONFIRM_LOADING') {
     if(load.state!=='APPROVED'||!load.loadingCheck||!Array.isArray(p.quantities)||p.quantities.length!==load.lines.length||p.quantities.some((quantity,i)=>quantity!==load.lines[i].quantity))error('CHECK_MISMATCH');
     truckLoading={operatorId:actor.operatorId,at:now(),revision:load.revision+1,
      lines:load.lines.map((line,i)=>({lineId:line.id,quantity:p.quantities[i]}))};
     load={...load,revision:truckLoading.revision,truckLoading};
    }
    if(input.type==='MANIFEST') {
     if(load.partialApproval&&!load.truckLoading)error('LOADING_CONFIRMATION_REQUIRED');
     const issuer=c.config.issuer;
     const documentId=hash(`${uid}:${input.key}`).slice(0,24);
     for(const k of ['vehicle','driver','route'])if(typeof p[k]!=='string'||!p[k].trim()||p[k].length>100)error('MANIFEST_HEADER_REQUIRED');
     load=issueManifest(load,{documentId,number:`ROM-${load.id}`,issuedAt:new Date(now()).toISOString(),issuer,vehicle:p.vehicle,driver:p.driver,route:p.route,timeZone:c.config.timezone||'America/Asuncion',verificationCode:hash(documentId).slice(0,20)});
     const document=load.manifestVersions.at(-1);
     writes.push([db.doc(`${c.root}/distribution_manifests/${documentId}`),document]);
    }
    if(input.type==='DISPATCH') {
     if(load.state!=='APPROVED'||load.reservationState!=='RESERVED')error('INVALID_TRANSITION');
     if(!load.truckLoading)error('LOADING_CONFIRMATION_REQUIRED');
     load=transitionLoad(load,'DISPATCHED');
     for(const line of load.lines) {
      const order=orderCache.get(line.orderId);
      if(order.data.tipoDocumento==='venda'&&!orderCache.get(line.orderId).data._distribution?.commercialFinalized)continue; // PDV already posted stock: no second movement.
      const product=productCache.get(line.productId),v=product.data;
      if(integer(v.estoqueReservadoDistribuicao||0)<line.quantity||v.estoqueGalpao<line.quantity||v.estoque<line.quantity)error('STOCK_RECONCILIATION_REQUIRED');
      const saldoAntes={...v};
      v.estoqueReservadoDistribuicao-=line.quantity;v.estoqueGalpao-=line.quantity;v.estoque-=line.quantity;
      productWrites.set(line.productId,product);
      audit.push(criarEventoEstoque({id:`DIST-${operationId}-${line.id}`,produto:v,tipo:'distribuicao_expedicao',origem:'deposito',destino:'entrega',quantidade:line.quantity,saldoAntes,saldoDepois:v,operador:{id:actor.operatorId,nome:actor.name},referenciaId:load.id,createdAt:new Date(now()).toISOString(),detalhes:{pedidoId:line.orderId,linhaId:line.orderLineId}}));
      order.data._distribution={...order.data._distribution,dispatched:{...(order.data._distribution?.dispatched||{}),[line.orderLineId]:(order.data._distribution?.dispatched?.[line.orderLineId]||0)+line.quantity}};
      if(order.data._distribution.commercialFinalized){const index=Number(line.orderLineId),shipped=order.data._distribution.dispatched[line.orderLineId];order.data.itens=order.data.itens.map((item,i)=>i===index?{...item,movimentoEstoqueVenda:{vitrine:0,galpao:shipped,total:shipped}}:item);}
      orderWrites.set(line.orderId,order);
     }
     load={...load,reservationState:'CONSUMED',dispatchedAt:now()};
    }
    if(input.type==='CANCEL') {
     if(!['DRAFT','PLANNED','LOADING'].includes(load.state))error('LOAD_LOCKED');
     for(const line of load.lines) {
      const order=orderCache.get(line.orderId),product=productCache.get(line.productId);
      if(load.reservationState==='RESERVED'&&(order.data.tipoDocumento!=='venda'||order.data._distribution?.commercialFinalized)) {
       product.data.estoqueReservadoDistribuicao=integer(product.data.estoqueReservadoDistribuicao)-line.quantity;
       if(product.data.estoqueReservadoDistribuicao<0)error('STOCK_RECONCILIATION_REQUIRED');productWrites.set(line.productId,product);
      }
      const allocated=order.data._distribution.allocated;
      allocated[line.orderLineId]-=line.quantity;
      const allocatedMinor=order.data._distribution.allocatedMinor;
      allocatedMinor[line.orderLineId]=String(BigInt(allocatedMinor[line.orderLineId])-BigInt(line.amount.minor));
      if(allocated[line.orderLineId]<0)error('ORDER_OVERALLOCATED');
      order.data._distribution.stockManaged=Object.values(allocated).some(n=>n>0);orderWrites.set(line.orderId,order);
     }
     load={...load,state:'CANCELLED',revision:load.revision+1,reservationState:'RELEASED'};
    }
    load={...load,updatedAt:now()};
   }
   if(load.manifestVersions.length>10)error('MANIFEST_VERSION_LIMIT');
   const revisions={...(c.head.fieldRevisions||{})};
   for(const [field,records] of [['produtos',productWrites],['historicoVendas',orderWrites]]) {
    if(records.size)revisions[field]=(revisions[field]||0)+1;
    for(const record of records.values()) {
     const envelope={...record.envelope,data:record.data,version:sequence,commandId:operationId};
     patches.push({field,routeId:record.ref.id,...envelope});writes.push([record.ref,envelope]);
    }
   }
   const summaryRef=db.doc(`${c.root}/distribution_daily/${day(load.createdAt,c.config.timezone)}`);
   const summary=await tx.get(summaryRef);
   const counts={...(summary.data()?.counts||{})};
   if(loadSnap.exists)counts[loadSnap.data().state]=Math.max(0,(counts[loadSnap.data().state]||0)-1);
   counts[load.state]=(counts[load.state]||0)+1;
   const result={loadId:load.id,revision:load.revision,state:load.state};
   const receipt={schema:2,key:`distribution:${input.key}`,fingerprint,sequence,revisions,patches,financialEntries:[],createdAtClient:new Date(now()).toISOString()};
   if(Buffer.byteLength(JSON.stringify(load))>700000||Buffer.byteLength(JSON.stringify(receipt))>700000)error('REQUEST_TOO_LARGE');
   for(const event of audit)tx.create(db.doc(`${c.root}/estoque_auditoria/${String(event.produtoAuditKey).replaceAll('/','_')}/movimentos/${event.id}`),{...event,_v2:{generation:c.generation,commandId:operationId,sequence}});
   for(const [ref,value] of writes)tx.set(ref,value);
   tx.set(loadRef,load);
   tx.set(summaryRef,{counts,updatedAt:now()});
   tx.create(receiptRef,{fingerprint,generation:c.generation,operatorId:actor.operatorId,result});
   tx.create(db.doc(`${c.base}/operations/${operationId}`),receipt);
   tx.update(headRef,{sequence,fieldRevisions:revisions,lastReceipt:operationId});
   tx.create(db.doc(`${c.root}/distribution_outbox/${operationId}`),{id:operationId,type:input.type==='DISPATCH'?'distribution.shipment.dispatched.v1':'distribution.load.changed.v1',version:1,tenantId:uid,entityId:load.id,revision:load.revision,correlationId:input.key,occurredAt:new Date(now()).toISOString(),state:'LOCAL_ONLY',payload:{loadId:load.id,state:load.state}});
   tx.create(db.doc(`${c.root}/distribution_audit/${operationId}`),{operatorId:actor.operatorId,type:input.type,loadId:load.id,sequence,at:now(),stockMovements:audit,...(loadingCheck?{loadingCheck}:{}),...(partialApproval?{partialApproval}:{}),...(truckLoading?{truckLoading}:{})});
   return result;
  },{maxAttempts:15});
 }
 async function query(uid,sessionToken,input) {
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid);await authorize(tx,uid,sessionToken,c);
   if(input.type==='detail') {
    const snap=await tx.get(db.doc(`${c.root}/distribution_loads/${id(input.loadId)}`));
    if(!snap.exists)error('LOAD_NOT_FOUND');return {load:snap.data()};
   }
   if(input.type==='manifest') {
    const snap=await tx.get(db.doc(`${c.root}/distribution_loads/${id(input.loadId)}`));
    if(!snap.exists)error('LOAD_NOT_FOUND');return {document:historicalManifest(snap.data(),integer(input.version,1))};
   }
   if(input.type==='summary') {
    // Explicit periods read bounded daily projections, never historical load collections.
    const from=Number(input.from),to=Number(input.to);
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<=from||to-from>370*86400000)error('INVALID_PERIOD');
    const first=day(from,c.config.timezone),last=day(to-1,c.config.timezone);
    const docs=await tx.get(db.collection(`${c.root}/distribution_daily`).where('__name__','>=',first).where('__name__','<=',last).limit(371));
    const counts={};docs.forEach(d=>Object.entries(d.data().counts||{}).forEach(([k,v])=>{counts[k]=(counts[k]||0)+v;}));return {counts};
   }
   const pageSize=Number(input.limit??12);if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>30)error('INVALID_PAGE');
   let q;
   if(input.type==='orders'){
    const fallback=distributionPeriod('hoje',now(),c.config.timezone);
    const from=input.from??Date.parse(fallback.inicio),to=input.to??Date.parse(fallback.fim);
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<=from||to-from>370*86400000)error('INVALID_PERIOD');
    q=db.collection(`${c.base}/vendas`).where('data.createdAt','>=',new Date(from).toISOString()).where('data.createdAt','<',new Date(to).toISOString()).orderBy('data.createdAt').orderBy('__name__');
   }
   else if(input.type==='loads') {
    if(!Number.isSafeInteger(input.from)||!Number.isSafeInteger(input.to)||input.to<=input.from||input.to-input.from>370*86400000)error('INVALID_PERIOD');
    q=db.collection(`${c.root}/distribution_loads`).where('createdAt','>=',input.from).where('createdAt','<',input.to).orderBy('createdAt').orderBy('__name__');
   }else error('INVALID_QUERY');
   if(input.cursor) {
    const cursor=input.cursor;
    if(input.type==='orders'){id(cursor.id);if(!Number.isFinite(Date.parse(cursor.createdAt)))error('INVALID_CURSOR');q=q.startAfter(cursor.createdAt,db.doc(`${c.base}/vendas/${id(cursor.id)}`));}
    else {id(cursor.id);integer(cursor.createdAt);q=q.startAfter(cursor.createdAt,db.doc(`${c.root}/distribution_loads/${id(cursor.id)}`));}
   }
   const page=await tx.get(q.limit(pageSize+1)),docs=page.docs.slice(0,pageSize);
   const items=input.type==='orders'?docs.filter(d=>!d.data().deleted&&['pre_pedido','venda'].includes(d.data().data?.tipoDocumento)).map(d=>{const o=d.data().data;return {id:o.id,tipoDocumento:o.tipoDocumento,estado:o.estado,clienteId:o.clienteId,clienteNome:o.clienteNome,vendedorId:o.vendedorId,moedaDocumento:o.moedaDocumento,itens:(o.itens||[]).map(i=>({nome:i.nome,qtd:i.qtd,produtoOriginalId:String(i.produtoOriginalId??i.id),sku:i.produtoOriginalSku??i.sku})),_distribution:{allocated:o._distribution?.allocated||{}}};}):docs.map(d=>{const l=d.data();return {id:l.id,revision:l.revision,state:l.state,createdAt:l.createdAt,linesCount:l.lines.length,pickingState:l.pickingState,manifestCount:l.manifestVersions.length,tripId:l.tripId||null};});
   const last=docs.at(-1);return {items,next:page.size>pageSize&&last?{id:input.type==='orders'?String(last.data().data.id):String(last.data().id),createdAt:input.type==='loads'?last.data().createdAt:last.data().data.createdAt}:null};
  });
 }
 async function logout(uid,sessionToken){return db.runTransaction(async tx=>{const c=await ctx(tx,uid);await authorize(tx,uid,sessionToken,c,'any');tx.delete(db.doc(`${c.root}/distribution_sessions/${hash(sessionToken)}`));return {ok:true};});}
 const finalize=buildSettlement({db,ctx,authorize,login,now});
 const trips=buildTrips({db,ctx,authorize,finalize,now,deliveryCGrantScope:staging?{projectId:db.projectId,uid:process.env.STAGING_ACCEPTANCE_UID}:emulatorPygCompensationUid?{projectId:db.projectId,uid:emulatorPygCompensationUid}:null});
 const occurrences=buildOccurrences({db,ctx,authorize,now});
 const evidence=staging?{}:buildOccurrenceEvidence({db,ctx,authorize,now});
 const commercial=buildCommercialAdjustments({db,ctx,authorize,now});
 const reconciliations=buildFinancialReconciliation({db,ctx,authorize,now});
 return {login,command,query,logout,finalize,...trips,...occurrences,...evidence,...commercial,...reconciliations};
}
