import {error,hash,id} from './security.js';
import {units,nativeMinor,originalValue,paymentCents,custodyTotals,deliveryQuantities,validateSignature,CURRENCIES} from '../../../src/core/distribution/trips.js';
import {criarEventoEstoque} from '../../../src/core/stockAuditCore.js';
import {criarLancamentoFinanceiro} from '../../../src/core/financialLedgerCore.js';
import {creditObligationForSale,prepareVerifiedCreditAllocations} from '../../../src/core/distribution/phase31CreditAllocation.js';
import {obterCustoSnapshotItem,obterFinanceiroVenda,calcularCmvVenda} from '../../../src/core/salesFinancials.js';
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const text=(v,max=200,required=true)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))error('INVALID_TEXT');return v.trim();};
const cents=v=>{const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||n<0)error('INVALID_PAYMENT');return n;};
const management=new Set(['SAVE_VEHICLE','SAVE_ROUTE','CREATE_TRIP','REORDER','ASSIGN','VOID_RECEIPT','SET_DRIVER_ACCESS']);
const warehouse=new Set(['CHECK_RETURN','CLOSE_PHYSICAL','HANDOVER_CHEQUE']);
const finance=new Set(['BEGIN_CLOSE','CLOSE','REFUND']);
const driverActions=new Set(['START','DELIVER','INCIDENT','COLLECT','RECORD_CHEQUE','CUSTOMER_RETURN','ARRIVE']);
const pilotPYG=c=>c.config.pilotProfile==='PYG_CREDIT_CASH_V1';
const pilotBRL=c=>c.config.pilotProfile==='BRL_CREDIT_CASH_V1';
const deliveredMinor=line=>BigInt(line.amount.minor)*BigInt(line.delivered-(line.customerReturned||0))/BigInt(line.quantity);
function nativeTripCredit(sale){
 const {owed,installments}=creditObligationForSale(sale);
 if(sale.tipoDocumento!=='venda'||sale.moedaDocumento!=='BRL'||owed!==cents(sale.totalBRL)||
  (sale._distribution?.creditRefundedCents||0)||
  (sale._distribution?.driverDebtPaidCents||0)!==(sale._distribution?.nativeTripPaidCents||0))error('CREDIT_SOURCE_UNVERIFIED');
 const balances=new Map(installments.map(item=>[item.id,cents(item.amountBRL)]));
 for(const receipt of sale.creditAllocationsV2||[])for(const allocation of receipt.allocations){
  const balance=balances.get(allocation.installmentId);
  if(balance===undefined||balance<cents(allocation.amountBRL))error('CREDIT_SOURCE_UNVERIFIED');
  balances.set(allocation.installmentId,balance-cents(allocation.amountBRL));
 }
 return balances;
}
function tripCreditAllocation(sale,receiptId,amount){
 let remaining=amount;
 const allocations=[];
 for(const [installmentId,balance] of nativeTripCredit(sale)){
  const portion=Math.min(remaining,balance);
  if(portion)allocations.push({saleId:sale.id,installmentId,amountBRL:portion/100});
  remaining-=portion;
  if(!remaining)break;
 }
 if(remaining)error('CREDIT_LIMIT');
 return prepareVerifiedCreditAllocations({sales:[sale],clientId:sale.clienteId,receiptId,receivedBRL:amount/100,allocations});
}
export function buildTrips({db,ctx,authorize,finalize,now}) {
 const ref=(c,collection,key)=>db.doc(`${c.root}/${collection}/${id(key)}`);
 async function actorFor(tx,uid,token,c,scope){return authorize(tx,uid,token,c,scope);}
 async function routeCommand(uid,token,input){
  const {type,tripId,key,expectedRevision,payload:p={}}=input||{};
  if(![...management,...warehouse,...finance,...driverActions].includes(type)||!/^[\w-]{1,100}$/.test(key||''))error('INVALID_COMMAND');id(tripId);units(expectedRevision);
  if(Buffer.byteLength(JSON.stringify(input))>120000)error('REQUEST_TOO_LARGE');
  if(input.clientAt!=null&&(typeof input.clientAt!=='string'||input.clientAt.length>40||!Number.isFinite(Date.parse(input.clientAt))))error('INVALID_COMMAND');
  const fingerprint=hash(stable(input));
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await actorFor(tx,uid,token,c,management.has(type)?'manage':warehouse.has(type)?'returns':finance.has(type)?'finance':'driver');
   const operationId=hash(`trip:${key}`),receiptRef=ref(c,'distribution_trip_receipts',operationId),tripRef=ref(c,'distribution_trips',tripId);
   const [prior,snap]=await Promise.all([tx.get(receiptRef),tx.get(tripRef)]);
   if(prior.exists){if(prior.data().generation!==c.generation)error('V2_ROUTE_CHANGED');if(prior.data().fingerprint!==fingerprint||prior.data().operatorId!==actor.operatorId)error('IDEMPOTENCY_CONFLICT');return {...prior.data().result,replayed:true};}
   let trip=snap.data(),writes=[],patches=[],stockEvents=[],ledger=[];
   const seq=c.head.sequence+1,revisions={...c.head.fieldRevisions};
   const patch=(s,field,data)=>{revisions[field]=(c.head.fieldRevisions[field]||0)+1;const envelope={...s.data(),data,version:seq,commandId:operationId};patches.push({field,routeId:s.id,...envelope});writes.push([s.ref,envelope]);};
   const getEntity=async(collection,key)=>{const s=await tx.get(db.doc(`${c.base}/${collection}/${id(key)}`));if(!s.exists||s.data().deleted)error('SOURCE_NOT_FOUND');return s;};
   let entityResult;
   if(type==='SET_DRIVER_ACCESS'){
    if(actor.operatorId!=='admin'&&actor.permissions.admin!==true)error('FORBIDDEN');const target=await getEntity('operadores',tripId);if(target.data().version!==expectedRevision)error('REVISION_CONFLICT');if(tripId==='admin'||target.data().data.permissoes?.admin)error('PROTECTED_OPERATOR');
    const allowed=['distributionDriver','distributionManage','distributionReturns','distributionFinance','distributionFiscalReview'];if(!p.permissions||Object.keys(p.permissions).some(k=>!allowed.includes(k)||typeof p.permissions[k]!=='boolean'))error('INVALID_COMMAND');patch(target,'vendedores',{...target.data().data,permissoes:{...target.data().data.permissoes,...p.permissions}});entityResult={id:tripId,revision:expectedRevision+1};
   }else if(type==='SAVE_VEHICLE'||type==='SAVE_ROUTE'){
    const collection=type==='SAVE_VEHICLE'?'distribution_vehicles':'distribution_routes',s=await tx.get(ref(c,collection,tripId));
    if((s.data()?.revision||0)!==expectedRevision)error('REVISION_CONFLICT');
    const value=type==='SAVE_VEHICLE'?{id:tripId,plate:text(p.plate,30).toUpperCase(),name:text(p.name,100),active:p.active!==false}:{id:tripId,name:text(p.name,100),notes:text(p.notes||'',1000,false),active:p.active!==false};
    if(type==='SAVE_VEHICLE'){const plateRef=ref(c,'distribution_vehicle_plates',hash(value.plate)),plate=await tx.get(plateRef);if(plate.exists&&plate.data().vehicleId!==tripId)error('VEHICLE_PLATE_EXISTS');writes.push([plateRef,{vehicleId:tripId}]);}
    writes.push([s.ref,{...value,revision:expectedRevision+1,updatedAt:now(),updatedBy:actor.operatorId}]);entityResult={id:tripId,revision:expectedRevision+1};
   }else if(type==='CREATE_TRIP'){
    if(trip||expectedRevision!==0)error('REVISION_CONFLICT');
    id(p.driverId);id(p.vehicleId);id(p.routeId);
    const [driver,vehicle,route]=await Promise.all([getEntity('operadores',p.driverId),tx.get(ref(c,'distribution_vehicles',p.vehicleId)),tx.get(ref(c,'distribution_routes',p.routeId))]);
    if(driver.data().data.permissoes?.distributionDriver!==true||!vehicle.data()?.active||!route.data()?.active)error('INVALID_ASSIGNMENT');
    if(!Array.isArray(p.loadIds)||!p.loadIds.length||p.loadIds.length>12||new Set(p.loadIds).size!==p.loadIds.length)error('INVALID_SELECTION');
    const loads=[];for(const lid of p.loadIds){const l=await tx.get(ref(c,'distribution_loads',lid));if(!l.exists||l.data().generation!==c.generation||l.data().state!=='DISPATCHED'||l.data().tripId)error('LOAD_NOT_ELIGIBLE');loads.push(l);}
    const stops=new Map();
    for(const l of loads)for(const line of l.data().lines){
     let stop=stops.get(line.orderId);if(!stop){const o=await getEntity('vendas',line.orderId),sale=o.data().data;stop={id:line.orderId,orderId:line.orderId,customerId:line.customerId,customerName:line.customerName,destination:line.destination,state:'PENDING',lines:[],currency:sale.moedaDocumento,totalOriginal:sale.totalOriginal,totalBRLCents:cents(sale.totalBRL),expectedCollectionCents:sale.tipoDocumento==='pre_pedido'?cents(sale.totalBRL):Math.max(0,(sale.pagamentos||[]).filter(p=>p.formaId==='crediario').reduce((a,p)=>a+cents(p.valorConvertidoBRL),0)-(sale._distribution?.driverDebtPaidCents||0)-(sale._distribution?.creditRefundedCents||0))};stops.set(line.orderId,stop);}
     const order=await getEntity('vendas',line.orderId),item=order.data().data.itens[Number(line.orderLineId)];
     stop.lines.push({...line,id:`${l.id}:${line.id}`,loadId:l.id,snapshot:{costBRL:obterCustoSnapshotItem(item),lot:item.lote??null,lots:item.lotes??null,originalItemId:String(item.id)},delivered:0,returning:0,returnChecked:false,reintegrated:0,quarantined:0,refunded:0});
    }
    if(stops.size>30||[...stops.values()].reduce((a,s)=>a+s.lines.length,0)>80)error('REQUEST_TOO_LARGE');
    for(const stop of stops.values()){
     const order=(await getEntity('vendas',stop.orderId)).data().data;
     const loaded=new Map();
     for(const line of stop.lines)loaded.set(line.orderLineId,(loaded.get(line.orderLineId)||0)+line.quantity);
     if(pilotPYG(c)&&order.moedaDocumento!=='PYG')error('PILOT_PAYMENT_DISABLED');
     if(pilotBRL(c)||pilotPYG(c)||order.itens.some((item,i)=>(loaded.get(String(i))||0)!==Number(item.qtd))){
      stop.commercialPending=true;
      stop.expectedCollectionCents=0;
      if(order.tipoDocumento==='venda'&&order.financeCreditV2&&order.moedaDocumento==='BRL'&&stop.lines.every(line=>line.amount.currency==='BRL')){
       stop.nativeSplitCredit=true;
       stop.expectedCollectionCents=units(Number(stop.lines.reduce((total,line)=>total+BigInt(line.amount.minor),0n)));
      }
     }
    }
    trip={schema:1,id:tripId,tenantId:uid,generation:c.generation,createdAt:now(),createdBy:actor.operatorId,revision:0,state:'PLANNED',driverId:p.driverId,driverName:driver.data().data.nome,vehicleId:p.vehicleId,vehiclePlate:vehicle.data().plate,routeId:p.routeId,routeName:route.data().name,stops:[...stops.values()],loadIds:p.loadIds,receipts:[],incidents:[],postedOrders:{}};
    for(const l of loads)writes.push([l.ref,{...l.data(),tripId}]);
   }else{
    if(!trip||trip.generation!==c.generation)error('TRIP_NOT_FOUND');if(trip.revision!==expectedRevision)error('REVISION_CONFLICT');
    if(driverActions.has(type)&&trip.driverId!==actor.operatorId)error('FORBIDDEN');
    if(type==='ASSIGN'){
     if(trip.state!=='PLANNED')error('TRIP_LOCKED');const d=await getEntity('operadores',p.driverId),v=await tx.get(ref(c,'distribution_vehicles',p.vehicleId));
     if(d.data().data.permissoes?.distributionDriver!==true||!v.data()?.active)error('INVALID_ASSIGNMENT');trip={...trip,driverId:p.driverId,driverName:d.data().data.nome,vehicleId:p.vehicleId,vehiclePlate:v.data().plate};
    }
    if(type==='REORDER'){
     if(trip.state!=='PLANNED'||!Array.isArray(p.stopIds)||p.stopIds.length!==trip.stops.length||new Set(p.stopIds).size!==trip.stops.length||p.stopIds.some(k=>!trip.stops.some(s=>s.id===k)))error('INVALID_ROUTE');trip.stops=p.stopIds.map(k=>trip.stops.find(s=>s.id===k));
    }
    if(type==='START'){if(trip.state!=='PLANNED')error('INVALID_TRANSITION');const v=await tx.get(ref(c,'distribution_vehicles',trip.vehicleId));if(!v.data()?.active)error('INVALID_ASSIGNMENT');for(const key of [`vehicle-${trip.vehicleId}`,`driver-${trip.driverId}`]){const lockRef=ref(c,'distribution_trip_locks',key),lock=await tx.get(lockRef);if(lock.data()?.tripId&&lock.data().tripId!==trip.id)error('ASSIGNMENT_BUSY');writes.push([lockRef,{tripId:trip.id}]);}trip.state='IN_TRANSIT';trip.startedAt=now();}
    if(['DELIVER','INCIDENT','COLLECT','RECORD_CHEQUE','CUSTOMER_RETURN'].includes(type)&&trip.state!=='IN_TRANSIT')error('TRIP_LOCKED');
    if(type==='RECORD_CHEQUE'){
     if(pilotPYG(c))error('PILOT_PYG_CREDIT_UNAVAILABLE');
     if(pilotBRL(c))error('PILOT_CHEQUE_DISABLED');
     const stop=trip.stops.find(s=>s.id===p.stopId);
     if(!stop||!['TOTAL','PARTIAL'].includes(stop.state))error('INVALID_DELIVERY');
     if(!['BRL','PYG'].includes(p.currency))error('PAYMENT_METHOD_DISABLED');
     const amount=nativeMinor(p.amount,p.currency);
     if(amount<=0)error('INVALID_PAYMENT');
     const bank=text(p.bank,80),reference=text(p.reference,40);
     if(!/^[A-Za-z0-9-]+$/.test(reference)||!/^\d{4}-\d{2}-\d{2}$/.test(p.presentationDate||'')||
      !Number.isFinite(Date.parse(p.presentationDate))||new Date(p.presentationDate).toISOString().slice(0,10)!==p.presentationDate)error('INVALID_PAYMENT');
     const cheques=trip.cheques??=[];
     if(cheques.length>=60)error('REQUEST_TOO_LARGE');
     const fingerprint=hash(JSON.stringify([bank.toUpperCase(),reference.toUpperCase()]));
     if(cheques.some(cheque=>cheque.fingerprint===fingerprint))error('FINANCIAL_COLLISION');
     cheques.push({id:operationId,orderId:stop.orderId,customerId:stop.customerId,bank,referenceLast4:reference.slice(-4),
      fingerprint,currency:p.currency,minor:amount,presentationDate:p.presentationDate,receivedAt:now(),receivedBy:actor.operatorId,status:'DRIVER_CUSTODY'});
    }
    if(type==='HANDOVER_CHEQUE'){
     if(!['RETURNED','SETTLING'].includes(trip.state))error('TRIP_LOCKED');
     const cheque=trip.cheques?.find(item=>item.id===p.chequeId);
     if(cheque?.status!=='DRIVER_CUSTODY')error('RECEIPT_LOCKED');
     cheque.status='DEPOT_CUSTODY';cheque.handedOverAt=now();cheque.handedOverTo=actor.operatorId;
    }
    if(type==='DELIVER'){
     const stop=trip.stops.find(s=>s.id===p.stopId);if(!stop||stop.state!=='PENDING')error('STOP_LOCKED');
     if(!['TOTAL','PARTIAL','REFUSED','FAILED'].includes(p.outcome)||!Array.isArray(p.quantities)||p.quantities.length!==stop.lines.length)error('INVALID_DELIVERY');
     const total=p.quantities.reduce((a,n)=>a+units(n),0),expected=stop.lines.reduce((a,l)=>a+l.quantity,0);
     if((p.outcome==='TOTAL'&&total!==expected)||(p.outcome==='PARTIAL'&&(total<=0||total>=expected))||(['REFUSED','FAILED'].includes(p.outcome)&&total!==0))error('INVALID_DELIVERY');
     text(p.note||'',1000,false);if(p.outcome!=='TOTAL')text(p.note,1000);
     if(total>0){text(p.receiver,100);text(p.identification,100);validateSignature(p.signature);}
     if((p.photos||[]).length>2||(!c.config.driverPhotos&&(p.photos||[]).length))error('PHOTO_NOT_AUTHORIZED');
     for(const photo of p.photos||[])if(typeof photo!=='string'||photo.length>36000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(photo)||!(photo.includes(';base64,iVBORw0KGgo')||photo.includes(';base64,/9j/')))error('INVALID_PHOTO');
     stop.lines=stop.lines.map((l,i)=>{const q=deliveryQuantities(l,p.quantities[i],p.condition||'GOOD');return {...l,...q,goodReturning:q.condition==='GOOD'?q.returning:0,damagedReturning:q.condition==='DAMAGED'?q.returning:0};});
     stop.state=p.outcome;stop.proofId=operationId;stop.recordedAt=now();stop.receiver=total?text(p.receiver,100):null;
    }
    if(type==='INCIDENT'){if(trip.incidents.length>=50)error('REQUEST_TOO_LARGE');if(p.stopId&&!trip.stops.some(s=>s.id===p.stopId))error('INVALID_ROUTE');trip.incidents.push({id:operationId,stopId:p.stopId||null,note:text(p.note,1000),at:now()});}
    if(type==='CUSTOMER_RETURN'){
     const stop=trip.stops.find(s=>s.id===p.stopId),line=stop?.lines.find(l=>l.id===p.lineId);if(!line||!['TOTAL','PARTIAL'].includes(stop.state))error('INVALID_DELIVERY');
     units(p.quantity,1);if(p.quantity>line.delivered-(line.customerReturned||0))error('RETURN_EXCEEDED');if(!['GOOD','DAMAGED'].includes(p.condition))error('INVALID_DELIVERY');
     line.goodReturning=(line.goodReturning||0)+(p.condition==='GOOD'?p.quantity:0);line.damagedReturning=(line.damagedReturning||0)+(p.condition==='DAMAGED'?p.quantity:0);line.customerReturned=(line.customerReturned||0)+p.quantity;line.returning+=p.quantity;line.condition=line.goodReturning&&line.damagedReturning?'MIXED':p.condition;text(p.note,1000);
    }
    if(type==='COLLECT'){
     if(pilotPYG(c))error('PILOT_PYG_CREDIT_UNAVAILABLE');
     const stop=trip.stops.find(s=>s.id===p.stopId);if(!stop||!['TOTAL','PARTIAL'].includes(stop.state)||trip.receipts.length>=60)error('INVALID_DELIVERY');
     if(stop.commercialPending&&!stop.nativeSplitCredit)error('COMMERCIAL_POST_REQUIRED');
     if(pilotBRL(c)&&(!stop.nativeSplitCredit||p.currency!=='BRL'||p.method!=='dinheiro_brl'))error('PILOT_PAYMENT_DISABLED');
     if(!/^(dinheiro_(brl|pyg|usd|eur)|cartao_(credito|debito)(_(brl|pyg|usd|eur))?|pix|transferencia)$/.test(p.method||'')||(p.method==='pix'&&p.currency!=='BRL'))error('PAYMENT_METHOD_DISABLED');const suffix=p.method.match(/_(brl|pyg|usd|eur)$/)?.[1];if(suffix&&suffix.toUpperCase()!==p.currency)error('PAYMENT_METHOD_DISABLED');
     const methods=c.config.driverPaymentMethods||[];if(!methods.some(m=>m.id===p.method&&m.currency===p.currency))error('PAYMENT_METHOD_DISABLED');
     const minor=nativeMinor(p.amount,p.currency);if(minor<=0)error('INVALID_PAYMENT');const order=await getEntity('vendas',stop.orderId),o=order.data().data;
     if(p.currency!==o.moedaDocumento&&p.acceptFrozenConversion!==true)error('CONVERSION_CONSENT_REQUIRED');
     const amount=paymentCents(minor,p.currency,o.taxasCambio?.[p.currency]);if(!amount)error('INVALID_PAYMENT');
     const heldRef=ref(c,'distribution_collection_holds',stop.orderId),held=await tx.get(heldRef),heldData=held.data()||{reservedCents:0};
     const due=o.tipoDocumento==='pre_pedido'?cents(o.totalBRL):o.pagamentos?.filter(x=>x.formaId==='crediario').reduce((a,x)=>a+cents(x.valorConvertidoBRL),0)||0;
     if(stop.nativeSplitCredit){
      if(!p.method.startsWith('dinheiro_'))error('PAYMENT_METHOD_DISABLED');
      const remaining=[...nativeTripCredit(o).values()].reduce((sum,value)=>sum+value,0);
      const tripReceived=trip.receipts.filter(r=>r.orderId===o.id&&!r.voided).reduce((sum,r)=>sum+r.centsBRL,0);
      const delivered=stop.lines.reduce((sum,line)=>sum+deliveredMinor(line),0n);
      if(amount+heldData.reservedCents>remaining||BigInt(amount+tripReceived)>delivered)error('AMOUNT_EXCEEDS_DUE');
     }else if(amount+heldData.reservedCents+(o._distribution?.driverDebtPaidCents||0)+(o._distribution?.creditRefundedCents||0)>due)error('AMOUNT_EXCEEDS_DUE');
     writes.push([heldRef,{reservedCents:heldData.reservedCents+amount}]);
     trip.receipts.push({id:operationId,orderId:stop.orderId,stopId:stop.id,method:p.method,currency:p.currency,minor,centsBRL:amount,rate:o.taxasCambio[p.currency],posted:false,voided:false,at:now(),operatorId:actor.operatorId,conversionAuthorized:p.acceptFrozenConversion===true});
    }
    if(type==='VOID_RECEIPT'){
     if(!['IN_TRANSIT','RETURNED'].includes(trip.state))error('TRIP_LOCKED');const r=trip.receipts.find(r=>r.id===p.receiptId);if(!r||r.posted||r.voided)error('RECEIPT_LOCKED');text(p.note,1000);r.voided=true;r.voidReason=p.note;
     const heldRef=ref(c,'distribution_collection_holds',r.orderId),held=await tx.get(heldRef);writes.push([heldRef,{reservedCents:units((held.data()?.reservedCents||0)-r.centsBRL)}]);
    }
    if(type==='ARRIVE'){if(trip.state!=='IN_TRANSIT'||trip.stops.some(s=>s.state==='PENDING'))error('STOPS_PENDING');for(const key of [`vehicle-${trip.vehicleId}`,`driver-${trip.driverId}`]){const lockRef=ref(c,'distribution_trip_locks',key),lock=await tx.get(lockRef);if(lock.data()?.tripId!==trip.id)error('ASSIGNMENT_BUSY');writes.push([lockRef,{tripId:null}]);}trip.state='RETURNED';trip.returnedAt=now();}
    if(type==='CHECK_RETURN'){
     if(trip.state!=='RETURNED')error('INVALID_TRANSITION');const line=trip.stops.flatMap(s=>s.lines).find(l=>l.id===p.lineId);if(!line||line.returnChecked||!line.returning)error('RETURN_LOCKED');
     if(units(p.quantity)!==line.returning||!['REINTEGRATE','QUARANTINE','SPLIT'].includes(p.disposition)||(line.condition==='DAMAGED'&&p.disposition!=='QUARANTINE'))error('RETURN_CHECK_MISMATCH');text(p.note||'',1000,false);
     const reintegrate=p.disposition==='REINTEGRATE'?line.returning:p.disposition==='SPLIT'?units(p.reintegrateQuantity):0;if(reintegrate>(line.goodReturning??(line.condition==='GOOD'?line.returning:0)))error('RETURN_CHECK_MISMATCH');
     line.returnChecked=true;line.checkedBy=actor.operatorId;line.checkedAt=now();
     if(reintegrate>0){
      const product=await getEntity('produtos',line.productId),v=structuredClone(product.data().data);if(String(v.sku)!==line.sku)error('PRODUCT_IDENTITY_MISMATCH');
      if(!Number.isFinite(v.estoque)||!Number.isFinite(v.estoqueGalpao))error('STOCK_RECONCILIATION_REQUIRED');const before={...v};v.estoque+=reintegrate;v.estoqueGalpao+=reintegrate;units(v.estoque);units(v.estoqueGalpao);patch(product,'produtos',v);line.reintegrated=reintegrate;
      stockEvents.push(criarEventoEstoque({id:`RET-${operationId}`,produto:v,tipo:'distribuicao_retorno_conferido',origem:'entrega',destino:'deposito',quantidade:reintegrate,saldoAntes:before,saldoDepois:v,operador:{id:actor.operatorId,nome:actor.name},referenciaId:trip.id,createdAt:new Date(now()).toISOString(),detalhes:{pedidoId:line.orderId,linhaId:line.orderLineId,proofId:trip.stops.find(s=>s.lines.some(l=>l.id===line.id)).proofId,snapshot:line.snapshot}}));
     }line.quarantined=line.returning-reintegrate;
    }
    if(type==='CLOSE_PHYSICAL'){
     if(trip.state!=='RETURNED'||trip.physicalClosure)error('INVALID_TRANSITION');
     const deliveredByCurrency={};
     for(const stop of trip.stops)for(const line of stop.lines){
      const delivered=line.delivered-(line.customerReturned||0);
      if(delivered<0||delivered+line.returning!==line.quantity||
       (line.returning>0&&(!line.returnChecked||line.reintegrated+line.quarantined!==line.returning)))error('RETURNS_PENDING');
      const {currency,minor}=line.amount;
      const deliveredMinor=BigInt(minor)*BigInt(delivered)/BigInt(line.quantity);
      deliveredByCurrency[currency]=String(BigInt(deliveredByCurrency[currency]||'0')+deliveredMinor);
     }
     trip.physicalClosure={operatorId:actor.operatorId,at:now(),revision:trip.revision+1,deliveredByCurrency};
    }
    if(type==='BEGIN_CLOSE'){
     if(pilotPYG(c))error('PILOT_PYG_CREDIT_UNAVAILABLE');
     if(trip.state!=='RETURNED'||trip.stops.some(s=>s.lines.some(l=>l.returning&&!l.returnChecked)))error('RETURNS_PENDING');
     const cash=await getEntity('sessoesCaixa',p.cashSessionId);if(cash.data().data.status!=='aberta'||String(cash.data().data.operadorId)!==actor.operatorId)error('CASH_SESSION_CLOSED');
     const expected=custodyTotals(trip.receipts),counted={},differences={};for(const currency of Object.keys(CURRENCIES)){counted[currency]=nativeMinor(p.counted?.[currency]??'0',currency);differences[currency]=counted[currency]-(expected[currency]||0);}
     if(Object.values(differences).some(n=>n!==0)){if(pilotBRL(c)||p.approveDivergence!==true)error('DIVERGENCE_REQUIRES_APPROVAL');text(p.note,1000);}
     trip.state='SETTLING';trip.settlement={expected,counted,differences,note:p.note||'',cashSessionId:p.cashSessionId,operatorId:actor.operatorId,startedAt:now()};
    }
    if(type==='REFUND'){
     if(pilotPYG(c))error('PILOT_PYG_CREDIT_UNAVAILABLE');
     if(pilotBRL(c))error('PILOT_REFUND_DISABLED');
     if(trip.stops.some(stop=>stop.nativeSplitCredit&&stop.lines.some(line=>line.id===p.lineId)))error('CREDIT_PRIOR_RETURN_REVIEW_REQUIRED');
     if(!['SETTLING','CLOSED'].includes(trip.state))error('INVALID_TRANSITION');const line=trip.stops.flatMap(s=>s.lines).find(l=>l.id===p.lineId);if(!line?.returnChecked||line.refunded>=line.returning)error('RETURN_LOCKED');
     const order=await getEntity('vendas',line.orderId),o=structuredClone(order.data().data);if(o.tipoDocumento!=='venda'||!['concluida','parcial'].includes(o.estado))error('COMMERCIAL_POST_REQUIRED');
     const item=o.itens[Number(line.orderLineId)],quantity=line.returning-line.refunded;
     if((item.qtdDevolvida||0)+quantity>item.qtd)error('RETURN_EXCEEDED');
     const totalWeight=o.itens.reduce((a,i)=>a+cents(i.totalBRL??i.precoPraticadoBRL*i.qtd),0);if(!totalWeight)error('MONEY_SOURCE_REQUIRED');
     const weight=cents(item.totalBRL??item.precoPraticadoBRL*item.qtd),priorQty=item.qtdDevolvida||0;
     const before=o.itens.slice(0,Number(line.orderLineId)).reduce((a,i)=>a+cents(i.totalBRL??i.precoPraticadoBRL*i.qtd),0);const total=BigInt(cents(o.totalBRL));const allocated=Number(total*BigInt(before+weight)/BigInt(totalWeight)-total*BigInt(before)/BigInt(totalWeight));
     const amount=Number(BigInt(allocated)*BigInt(priorQty+quantity)/BigInt(item.qtd)-BigInt(allocated)*BigInt(priorQty)/BigInt(item.qtd));if(!amount)error('INVALID_PAYMENT');
     const client=await getEntity('clientes',String(o.clienteId)),balance=cents(client.data().data.saldoDevedorBRL||0);let original,currency,physical=false;
     if(p.method==='credito_fiado'){
      const credit=o.pagamentos.filter(x=>x.formaId==='crediario').reduce((a,x)=>a+cents(x.valorConvertidoBRL),0)-(o._distribution?.driverDebtPaidCents||0)-(o._distribution?.creditRefundedCents||0);
      const held=await tx.get(ref(c,'distribution_collection_holds',o.id));if(balance<amount||credit-(held.data()?.reservedCents||0)<amount)error('CREDIT_LIMIT');patch(client,'clientes',{...client.data().data,saldoDevedorBRL:(balance-amount)/100});o._distribution={...o._distribution,creditRefundedCents:(o._distribution?.creditRefundedCents||0)+amount};if(trip.postedOrders[o.id])trip.postedOrders[o.id].remainingCreditCents=Math.max(0,trip.postedOrders[o.id].remainingCreditCents-amount);currency='BRL';original=amount/100;
     }else{
      if(p.method!=='transferencia'||!c.config.driverPaymentMethods?.some(m=>m.id==='transferencia'&&m.currency===p.currency)||p.acceptFrozenConversion!==true)error('PAYMENT_METHOD_DISABLED');
      currency=p.currency;const refundMinor=nativeMinor(p.amount,currency);if(currency===line.amount.currency&&BigInt(refundMinor)!==(BigInt(line.amount.minor)*BigInt(line.refunded+quantity)/BigInt(line.quantity)-BigInt(line.amount.minor)*BigInt(line.refunded)/BigInt(line.quantity)))error('PAYMENT_RATE_CHANGED');original=originalValue(refundMinor,currency);if(paymentCents(nativeMinor(p.amount,currency),currency,o.taxasCambio?.[currency])!==amount)error('PAYMENT_RATE_CHANGED');text(p.bankReference,120);
      const paid=o.pagamentos.filter(x=>x.formaId!=='crediario').reduce((a,x)=>a+cents(x.valorConvertidoBRL),0)+(o._distribution?.driverDebtPaidCents||0)-cents(o.trocoBRL||0)-(o._distribution?.cashRefundedCents||0);if(paid<amount)error('AMOUNT_EXCEEDS_DUE');o._distribution={...o._distribution,cashRefundedCents:(o._distribution?.cashRefundedCents||0)+amount};
     }
     text(p.note,1000);const cost=Math.round(obterCustoSnapshotItem(item)*quantity*100)/100;const old=obterFinanceiroVenda(o);item.qtdDevolvida=priorQty+quantity;o.valorDevolvidoBRL=(cents(old.valorDevolvidoBRL)+amount)/100;o.custoDevolvidoBRL=Math.round((old.custoDevolvidoBRL+cost)*100)/100;o.totalLiquidoBRL=Math.max(0,o.totalBRL-o.valorDevolvidoBRL);o.lucroLiquidoBRL=Math.round((old.lucroBrutoBRL-o.valorDevolvidoBRL+o.custoDevolvidoBRL)*100)/100;o.estado=o.itens.every(i=>(i.qtdDevolvida||0)>=i.qtd)?'cancelada':'parcial';
     o.devolucoes=[...(o.devolucoes||[]),{id:operationId,createdAt:new Date(now()).toISOString(),valorBRL:amount/100,custoBRL:cost,metodoReembolso:p.method,itens:[{itemVendaId:item.id,produtoOriginalId:line.productId,quantidade:quantity}],tripId:trip.id,stockAlreadyReintegrated:true}];patch(order,'historicoVendas',o);line.refunded+=quantity;
     ledger.push(criarLancamentoFinanceiro({id:`DEV-${operationId}`,lojaId:uid,tipo:'devolucao',origem:'historico_vendas',referenciaId:operationId,valor:amount/100,moeda:'BRL',formaPagamento:p.method,operadorId:actor.operatorId,operadorNome:actor.name,createdAt:new Date(now()).toISOString(),afetaCaixaFisico:physical,afetaResultado:true,direcao:'saida',clienteId:o.clienteId,clienteNome:o.clienteNome,saldoClienteAntes:p.method==='credito_fiado'?balance/100:null,saldoClienteDepois:p.method==='credito_fiado'?(balance-amount)/100:null,detalhes:{vendaId:o.id,tripId:trip.id,moedaOrigem:currency,valorOriginal:original,taxaCambioAplicada:1/o.taxasCambio[currency],bankReference:p.bankReference||null}}));
    }
    if(type==='CLOSE'){
     if(pilotPYG(c))error('PILOT_PYG_CREDIT_UNAVAILABLE');
     if(trip.cheques?.length)error('SETTLEMENT_PENDING');
     if(trip.stops.some(stop=>stop.commercialPending&&(!stop.nativeSplitCredit||!trip.postedOrders[stop.orderId])))error('COMMERCIAL_POST_REQUIRED');
     if(trip.state!=='SETTLING'||trip.receipts.some(r=>!r.voided&&!r.posted)||trip.stops.some(s=>s.lines.some(l=>l.returning>l.refunded)))error('SETTLEMENT_PENDING');
     for(const stop of trip.stops){const order=await getEntity('vendas',stop.orderId);if(!['venda'].includes(order.data().data.tipoDocumento))error('COMMERCIAL_POST_REQUIRED');}
     trip.state='CLOSED';trip.closedAt=now();trip.closedBy=actor.operatorId;
    }
   }
   let result=entityResult;
   if(!entityResult){trip.revision++;trip.updatedAt=now();if(Buffer.byteLength(JSON.stringify(trip))>700000)error('REQUEST_TOO_LARGE');writes.push([tripRef,trip]);result={tripId:trip.id,revision:trip.revision,state:trip.state};}
   for(const e of ledger)if((await tx.get(db.doc(`${c.root}/financeiro_livro/${e.id}`))).exists)error('FINANCIAL_COLLISION');
   const event={schema:1,id:operationId,tenantId:uid,tripId,type,operatorId:actor.operatorId,serverAt:now(),clientAt:input.clientAt||null,generation:c.generation,revision:result.revision,payload:type==='RECORD_CHEQUE'?{chequeId:operationId}:{...p,...(p.signature?{signature:JSON.stringify(p.signature)}:{})}};
   if(['START','ARRIVE','CHECK_RETURN','CLOSE_PHYSICAL','CLOSE'].includes(type)){
    event.document={issuer:c.config.issuer?.name??'',driverId:trip.driverId,driverName:trip.driverName,
     vehiclePlate:trip.vehiclePlate,routeName:trip.routeName,state:trip.state,physicalClosure:trip.physicalClosure??null,
     stops:trip.stops.map(stop=>({orderId:stop.orderId,customerName:stop.customerName,destination:stop.destination,state:stop.state,
      lines:stop.lines.map(line=>({id:line.id,description:line.description,sku:line.sku,unit:line.unit,
       loaded:line.quantity,delivered:line.delivered-(line.customerReturned||0),returning:line.returning,
       damaged:line.damagedReturning||0,reintegrated:line.reintegrated,quarantined:line.quarantined}))}))};
   }
   for(const [r,data]of writes)tx.set(r,data);
   for(const e of ledger)tx.create(db.doc(`${c.root}/financeiro_livro/${e.id}`),{...e,_v2:{generation:c.generation,commandId:operationId,sequence:seq}});
   for(const e of stockEvents)tx.create(db.doc(`${c.root}/estoque_auditoria/${String(e.produtoAuditKey).replaceAll('/','_')}/movimentos/${e.id}`),{...e,_v2:{generation:c.generation,commandId:operationId,sequence:seq}});
   tx.create(ref(c,'distribution_trip_events',operationId),event);
   tx.create(receiptRef,{fingerprint,generation:c.generation,operatorId:actor.operatorId,result});
   tx.create(db.doc(`${c.base}/operations/${operationId}`),{schema:2,key:`trip:${key}`,fingerprint,sequence:seq,revisions,patches,financialEntries:ledger,createdAtClient:new Date(now()).toISOString()});
   tx.update(db.doc(c.base),{sequence:seq,fieldRevisions:revisions,lastReceipt:operationId});
   tx.create(ref(c,'distribution_outbox',operationId),{id:operationId,type:`distribution.trip.${type.toLowerCase()}.v1`,version:1,tenantId:uid,entityId:tripId,revision:result.revision,correlationId:key,occurredAt:new Date(now()).toISOString(),state:'LOCAL_ONLY',payload:{tripId,state:trip?.state||null}});
   return result;
  },{maxAttempts:15});
 }
 // Recoverable posting: each order commits atomically to the existing V2/ledger.
 // The immutable plan survives a lost response between finalization and trip acknowledgement.
 async function routePost(uid,token,input){
  id(input.tripId);id(input.orderId);
  const plan=await db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await authorize(tx,uid,token,c,'finance');
   if(pilotPYG(c))error('PILOT_PYG_CREDIT_UNAVAILABLE');
   const tr=await tx.get(ref(c,'distribution_trips',input.tripId)),t=tr.data();
   if(!t||t.generation!==c.generation||t.state!=='SETTLING'||t.settlement.operatorId!==actor.operatorId||!t.stops.some(s=>s.orderId===input.orderId))error('TRIP_LOCKED');
   const stop=t.stops.find(s=>s.orderId===input.orderId);
   if(pilotBRL(c)&&(!stop.nativeSplitCredit||t.receipts.some(r=>r.orderId===input.orderId&&!r.voided&&(r.currency!=='BRL'||r.method!=='dinheiro_brl'))))error('PILOT_PAYMENT_DISABLED');
   if(stop.commercialPending&&!stop.nativeSplitCredit)error('COMMERCIAL_POST_REQUIRED');
   const pr=ref(c,'distribution_post_plans',`${input.tripId}-${input.orderId}`),previous=await tx.get(pr);
   if(previous.exists)return previous.data();
   const os=await tx.get(db.doc(`${c.base}/vendas/${id(input.orderId)}`)),o=os.data()?.data;if(!o||os.data().deleted)error('ORDER_NOT_FOUND');
   const receipts=t.receipts.filter(r=>r.orderId===o.id&&!r.voided),received=receipts.reduce((a,r)=>a+r.centsBRL,0),pending=o.tipoDocumento==='pre_pedido';
   if(pending&&received<cents(o.totalBRL)&&input.acceptCredit!==true)error('CREDIT_CONSENT_REQUIRED');
   const payments=receipts.map(r=>({formaId:r.method,moedaOrigem:r.currency,valorOriginal:originalValue(r.minor,r.currency),valorConvertidoBRL:r.centsBRL/100}));
   if(pending&&received<cents(o.totalBRL))payments.push({formaId:'crediario',moedaOrigem:'BRL',valorOriginal:(cents(o.totalBRL)-received)/100,valorConvertidoBRL:(cents(o.totalBRL)-received)/100});
   const plan={generation:c.generation,pending,operatorId:actor.operatorId,orderId:o.id,receiptIds:receipts.map(r=>r.id),received,finalizeInput:{orderId:o.id,operatorId:actor.operatorId,sessionId:t.settlement.cashSessionId,customerId:String(o.clienteId),cart:o.itens.map(i=>({id:String(i.produtoOriginalId??i.id),sku:String(i.produtoOriginalSku??i.sku),qtd:Number(i.qtd),precoPraticadoBRL:Number(i.precoPraticadoBRL)})),payments,changeCurrency:o.moedaDocumento}};
   tx.create(pr,plan);return plan;
  });
  if(plan.pending)await finalize(uid,{...plan.finalizeInput,pin:input.pin});
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await authorize(tx,uid,token,c,'finance');
   if(pilotPYG(c))error('PILOT_PYG_CREDIT_UNAVAILABLE');
   const tripRef=ref(c,'distribution_trips',input.tripId),tr=await tx.get(tripRef),t=tr.data();
   if(!t||t.generation!==c.generation||plan.generation!==c.generation||t.state!=='SETTLING'||t.settlement.operatorId!==actor.operatorId)error('TRIP_LOCKED');
   if(t.postedOrders[input.orderId])return {tripId:t.id,revision:t.revision,state:t.state,replayed:true};
   const orderRef=db.doc(`${c.base}/vendas/${id(input.orderId)}`),os=await tx.get(orderRef),o=structuredClone(os.data()?.data);
   const cash=await tx.get(db.doc(`${c.base}/sessoesCaixa/${id(t.settlement.cashSessionId)}`));
   if(!plan.pending&&plan.received&&(cash.data()?.deleted||cash.data()?.data?.status!=='aberta'||String(cash.data().data.operadorId)!==actor.operatorId))error('CASH_SESSION_CLOSED');
   if(!o||os.data().deleted||o.tipoDocumento!=='venda')error('COMMERCIAL_POST_REQUIRED');
   const nativeSplit=t.stops.find(stop=>stop.orderId===o.id)?.nativeSplitCredit;
   if(nativeSplit){
    nativeTripCredit(o);
    const stop=t.stops.find(stop=>stop.orderId===o.id);
    if(BigInt(plan.received)>stop.lines.reduce((sum,line)=>sum+deliveredMinor(line),0n))error('AMOUNT_EXCEEDS_DUE');
    const obligation=(await tx.get(db.doc(`${c.root}/financeiro_livro/VENDA-${o.id}-FIADO`))).data();
    if(!obligation?._v2||obligation._v2.generation!==c.generation||obligation.financeLink?.financeEventType!=='OBLIGATION'||
     obligation.financeLink?.saleId!==o.id||obligation.financeLink?.receivableId!==o.financeCreditV2.receivableId||
     obligation.clienteId!==o.clienteId||cents(obligation.valor)!==cents(o.financeCreditV2.originalBRL))error('CREDIT_SOURCE_UNVERIFIED');
   }
   if(plan.pending&&o._distribution?.commercialOperationId!==hash(`logistics-finalize:${o.id}`))error('COMMERCIAL_POST_REQUIRED');
   const heldRef=ref(c,'distribution_collection_holds',o.id),held=await tx.get(heldRef),remainingHeld=units((held.data()?.reservedCents||0)-plan.received);
   t.cashMovementsAdded=0;
   const operationId=hash(`trip-post:${t.id}:${o.id}`),seq=c.head.sequence+1,revisions={...c.head.fieldRevisions},patches=[],writes=[],ledger=[];
   const patch=(s,field,data)=>{revisions[field]=(c.head.fieldRevisions[field]||0)+1;const value={...s.data(),data,version:seq,commandId:operationId};patches.push({field,routeId:s.id,...value});writes.push([s.ref,value]);};
   if(!plan.pending&&plan.received){
    const remaining=o.pagamentos.filter(p=>p.formaId==='crediario').reduce((a,p)=>a+cents(p.valorConvertidoBRL),0)-(o._distribution?.driverDebtPaidCents||0)-(o._distribution?.creditRefundedCents||0);
    const cs=await tx.get(db.doc(`${c.base}/clientes/${id(String(o.clienteId))}`)),cl=cs.data()?.data,balance=cents(cl?.saldoDevedorBRL||0);if(!cl||cs.data().deleted||balance<plan.received||remaining<plan.received)error('CREDIT_LIMIT');
    let running=balance;
    const receiptLinks=new Map();
    if(nativeSplit){
     for(const r of t.receipts.filter(receipt=>plan.receiptIds.includes(receipt.id))){
      if(!r.method.startsWith('dinheiro_'))error('PAYMENT_METHOD_DISABLED');
      const receiptId=`REC-${operationId}-${r.id.slice(0,12)}`;
      const allocation=tripCreditAllocation(o,receiptId,r.centsBRL);
      o.creditAllocationsV2=allocation.patches[0].nextSale.creditAllocationsV2;
      receiptLinks.set(r.id,{financeLinkVersion:2,financeEventType:'RECEIPT',saleId:o.id,paymentId:receiptId,
       sourceEventId:`VENDA-${o.id}-FIADO`,receivableId:o.financeCreditV2.receivableId,
       installmentId:allocation.allocations[0].installmentId,moedaOrigem:r.currency,valorOriginal:originalValue(r.minor,r.currency),
       allocations:allocation.allocations,saleIds:[o.id],currencyEvidence:{valorAtribuidoBRL:r.centsBRL/100,taxaHistorica:r.rate,tripId:t.id,stopId:r.stopId,sourceRevision:os.data().version}});
     }
     o._distribution={...o._distribution,nativeTripPaidCents:(o._distribution?.nativeTripPaidCents||0)+plan.received};
    }
    for(const r of t.receipts.filter(r=>plan.receiptIds.includes(r.id))){ledger.push(criarLancamentoFinanceiro({id:`REC-${operationId}-${r.id.slice(0,12)}`,lojaId:uid,tipo:'recebimento_fiado',origem:'clientes',referenciaId:o.id,valor:r.centsBRL/100,moeda:'BRL',formaPagamento:r.method,financeLink:receiptLinks.get(r.id),operadorId:actor.operatorId,operadorNome:actor.name,createdAt:new Date(now()).toISOString(),afetaCaixaFisico:r.method.startsWith('dinheiro_'),afetaResultado:false,direcao:'entrada',sessaoId:t.settlement.cashSessionId,clienteId:o.clienteId,clienteNome:o.clienteNome,saldoClienteAntes:running/100,saldoClienteDepois:(running-r.centsBRL)/100,detalhes:{vendaId:o.id,tripId:t.id,driverReceiptId:r.id,moedaOrigem:r.currency,valorOriginal:originalValue(r.minor,r.currency),taxaCambioAplicada:1/r.rate}}));running-=r.centsBRL;}
    let newMovements=0;
    for(const r of t.receipts.filter(r=>plan.receiptIds.includes(r.id)&&r.method.startsWith('dinheiro_'))){
     const moveId=`MOV-${operationId}-${r.id.slice(0,12)}`,moveRef=db.doc(`${c.base}/movimentosCaixa/${moveId}`),existing=await tx.get(moveRef);if(existing.exists)error('FINANCIAL_COLLISION');
     const movement={id:moveId,sessaoId:t.settlement.cashSessionId,createdAt:new Date(now()).toISOString(),tipo:'recebimento_fiado',direcao:'entrada',afetaGaveta:true,valorBRL:r.centsBRL/100,detalhesMoedasNativas:{[r.currency]:originalValue(r.minor,r.currency)},detalhesMoedas:{[r.currency]:originalValue(r.minor,r.currency)},taxaCambioAplicada:r.rate,descricao:`Recebimento de entrega ${o.id}`,clienteId:o.clienteId,operador:actor.name,operadorId:actor.operatorId,tripId:t.id};
     const envelope={data:movement,legacyField:'caixaMovimentos',legacyIndex:-1,deleted:false,version:seq,commandId:operationId};patches.push({field:'caixaMovimentos',routeId:moveId,...envelope});writes.push([moveRef,envelope]);newMovements++;
    }
    if(newMovements){revisions.caixaMovimentos=(c.head.fieldRevisions.caixaMovimentos||0)+1;}
    t.cashMovementsAdded=newMovements;
    patch(cs,'clientes',{...cl,saldoDevedorBRL:running/100});o._distribution={...o._distribution,driverDebtPaidCents:(o._distribution?.driverDebtPaidCents||0)+plan.received};patch(os,'historicoVendas',o);
   }
   t.receipts=t.receipts.map(r=>plan.receiptIds.includes(r.id)?{...r,posted:true,postingOperationId:operationId}:r);t.postedOrders[o.id]={operationId,receivedCents:plan.received,remainingCreditCents:nativeSplit?[...nativeTripCredit(o).values()].reduce((sum,value)=>sum+value,0):Math.max(0,o.pagamentos.filter(p=>p.formaId==='crediario').reduce((a,p)=>a+cents(p.valorConvertidoBRL),0)-(o._distribution?.driverDebtPaidCents||0)-(o._distribution?.creditRefundedCents||0)),at:now()};t.revision++;t.updatedAt=now();
   for(const e of ledger)if((await tx.get(db.doc(`${c.root}/financeiro_livro/${e.id}`))).exists)error('FINANCIAL_COLLISION');
   for(const [r,v]of writes)tx.set(r,v);
   for(const e of ledger)tx.create(db.doc(`${c.root}/financeiro_livro/${e.id}`),{...e,_v2:{generation:c.generation,commandId:operationId,sequence:seq}});
   tx.set(tripRef,t);tx.set(heldRef,{reservedCents:remainingHeld});
   tx.create(db.doc(`${c.base}/operations/${operationId}`),{schema:2,key:`trip-post:${t.id}:${o.id}`,sequence:seq,revisions,patches,financialEntries:ledger,createdAtClient:new Date(now()).toISOString()});tx.update(db.doc(c.base),{sequence:seq,fieldRevisions:revisions,lastReceipt:operationId,fieldCounts:{...c.head.fieldCounts,caixaMovimentos:(c.head.fieldCounts.caixaMovimentos||0)+(t.cashMovementsAdded||0)}});
   tx.create(ref(c,'distribution_trip_events',operationId),{schema:1,id:operationId,tenantId:uid,tripId:t.id,type:'POST_ORDER',operatorId:actor.operatorId,serverAt:now(),revision:t.revision,payload:{orderId:o.id,receiptIds:plan.receiptIds}});
   return {tripId:t.id,revision:t.revision,state:t.state};
  },{maxAttempts:15});
 }
 async function routeQuery(uid,token,input){
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),isDriver=input.view==='driver',actor=await authorize(tx,uid,token,c,isDriver?'driver':'tripView');
   if(input.type==='catalog'){
    if(isDriver)error('FORBIDDEN');
    const page=async(collection,key,filter=null)=>{let q=db.collection(collection).orderBy('__name__');if(filter)q=q.where(filter,'==',true);if(input.after?.[key])q=q.startAfter(db.doc(`${collection}/${id(input.after[key])}`));return tx.get(q.limit(31));};
    const [drivers,vehicles,routes,operators]=await Promise.all([page(`${c.base}/operadores`,'drivers','data.permissoes.distributionDriver'),page(`${c.root}/distribution_vehicles`,'vehicles'),page(`${c.root}/distribution_routes`,'routes'),input.includeOperators?page(`${c.base}/operadores`,'operators'):Promise.resolve({docs:[],size:0})]);
    const docs=s=>s.docs.slice(0,30),next={};for(const [key,result]of Object.entries({drivers,vehicles,routes,operators}))if(result.size>30)next[key]=docs(result).at(-1).id;
    return {next,operators:docs(operators).filter(d=>!d.data().deleted).map(d=>({id:d.data().data.id,name:d.data().data.nome,version:d.data().version,permissions:{distributionDriver:!!d.data().data.permissoes?.distributionDriver,distributionManage:!!d.data().data.permissoes?.distributionManage,distributionReturns:!!d.data().data.permissoes?.distributionReturns,distributionFinance:!!d.data().data.permissoes?.distributionFinance,distributionFiscalReview:!!d.data().data.permissoes?.distributionFiscalReview}})),drivers:docs(drivers).filter(d=>!d.data().deleted).map(d=>({id:d.data().data.id,name:d.data().data.nome})),vehicles:docs(vehicles).map(d=>d.data()),routes:docs(routes).map(d=>d.data()),photosAllowed:!!c.config.driverPhotos,paymentMethods:c.config.driverPaymentMethods||[]};
   }
   if(input.type==='detail'||input.type==='proof'||input.type==='events'||input.type==='document'){
    const tr=await tx.get(ref(c,'distribution_trips',input.tripId)),t=tr.data();if(!t||t.generation!==c.generation)error('TRIP_NOT_FOUND');if(isDriver&&t.driverId!==actor.operatorId)error('FORBIDDEN');
    if(input.type==='detail')return {trip:isDriver?{...t,settlement:t.settlement?{expected:t.settlement.expected,differences:t.settlement.differences}:undefined,stops:t.stops.map(s=>({...s,lines:s.lines.map(({snapshot,...l})=>l)}))}:t,pilotBRL:pilotBRL(c),pilotPYG:pilotPYG(c),paymentMethods:(c.config.driverPaymentMethods||[]).filter(method=>!pilotBRL(c)||(method.id==='dinheiro_brl'&&method.currency==='BRL')),photosAllowed:!!c.config.driverPhotos};
    if(input.type==='document'){
     const event=(await tx.get(ref(c,'distribution_trip_events',input.eventId))).data();
     if(!event?.document||event.tripId!==t.id||event.generation!==c.generation)error('PROOF_NOT_FOUND');
     if(isDriver&&event.document.driverId!==actor.operatorId)error('FORBIDDEN');
     return {document:event.document,tripId:t.id,type:event.type,revision:event.revision,at:event.serverAt,operatorId:event.operatorId};
    }
    if(input.type==='proof'){const s=await tx.get(ref(c,'distribution_trip_events',input.eventId));if(!s.exists||s.data().tripId!==t.id||s.data().type!=='DELIVER')error('PROOF_NOT_FOUND');return {event:s.data(),trip:{id:t.id,driverName:t.driverName,vehiclePlate:t.vehiclePlate},stop:t.stops.find(s=>s.proofId===input.eventId),issuer:c.config.issuer};}
    let q=db.collection(`${c.root}/distribution_trip_events`).where('tripId','==',t.id).orderBy('serverAt').orderBy('__name__');if(input.cursor){units(input.cursor.at);q=q.startAfter(input.cursor.at,ref(c,'distribution_trip_events',input.cursor.id));}const result=await tx.get(q.limit(21));return {items:result.docs.slice(0,20).map(d=>{const e=d.data();return {id:e.id,type:e.type,serverAt:e.serverAt,operatorId:e.operatorId,revision:e.revision,hasDocument:!!e.document};}),next:result.size>20?{id:result.docs[19].id,at:result.docs[19].data().serverAt}:null};
   }
   if(input.type!=='trips')error('INVALID_QUERY');
   const from=Number(input.from),to=Number(input.to);if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||to<=from||to-from>370*86400000)error('INVALID_PERIOD');const limit=input.limit??12;units(limit,1);if(limit>30)error('INVALID_PAGE');
   let q=db.collection(`${c.root}/distribution_trips`);if(isDriver)q=q.where('driverId','==',actor.operatorId);q=q.where('createdAt','>=',from).where('createdAt','<',to).orderBy('createdAt').orderBy('__name__');
   if(input.cursor){units(input.cursor.at);q=q.startAfter(input.cursor.at,ref(c,'distribution_trips',input.cursor.id));}const page=await tx.get(q.limit(limit+1)),docs=page.docs.slice(0,limit);
   return {items:docs.filter(d=>d.data().generation===c.generation).map(d=>{const t=d.data();return {id:t.id,state:t.state,revision:t.revision,createdAt:t.createdAt,driverName:t.driverName,vehiclePlate:t.vehiclePlate,routeName:t.routeName,stops:t.stops.length,completed:t.stops.filter(s=>s.state!=='PENDING').length,incidents:t.incidents.length,returns:t.stops.flatMap(s=>s.lines).reduce((a,l)=>a+l.returning-l.reintegrated-l.quarantined,0),received:custodyTotals(t.receipts)};}),next:page.size>limit?{id:docs.at(-1).id,at:docs.at(-1).data().createdAt}:null};
  });
 }
 return {routeCommand,routeQuery,routePost};
}
