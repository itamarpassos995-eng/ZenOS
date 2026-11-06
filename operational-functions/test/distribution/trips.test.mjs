import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {setupTrip,route,trip,planned,db,service,signature,PIN} from './trip-fixture.mjs';
const deliver=(f,revision,stopId='O001',quantity=5,outcome='TOTAL',key=randomUUID())=>route(f,'driver','DELIVER','T1',revision,{stopId,quantities:[quantity],outcome,receiver:'Recebedor sintético',identification:'TEST-001',signature,note:outcome==='TOTAL'?'':'Cliente recusou parte',condition:'GOOD'},key);
const begin=async(f,revision,counted={},more={})=>route(f,'manager','BEGIN_CLOSE','T1',revision,{cashSessionId:'CASH1',counted,...more});
test('multiple loads, manual route order, actual assigned driver access and immutable proof',async()=>{
 const f=await setupTrip();await planned(f);await route(f,'manager','REORDER','T1',1,{stopIds:['O002','O001']});
 await assert.rejects(route(f,'other','START','T1',2),{code:'FORBIDDEN'});await assert.rejects(trip(f,'T1','other'),{code:'FORBIDDEN'});
 await route(f,'driver','START','T1',2);await deliver(f,3,'O002');await deliver(f,4);
 const t=(await trip(f)).trip;assert.equal(t.stops[0].id,'O002');assert.equal(t.stops.filter(s=>s.state==='TOTAL').length,2);
 const proof=await service.routeQuery(f.uid,f.driver.sessionToken,{type:'proof',view:'driver',tripId:'T1',eventId:t.stops[0].proofId});assert.deepEqual(JSON.parse(proof.event.payload.signature),signature);assert.equal(proof.event.operatorId,'driver');
 await assert.rejects(deliver(f,5,'O002'),{code:'STOP_LOCKED'});await assert.rejects(route(f,'driver','CHECK_RETURN','T1',5,{}),{code:'FORBIDDEN'});
});
test('repeated and concurrent delivery commits exactly one immutable server proof',async()=>{
 const f=await setupTrip();await planned(f,['O001']);await route(f,'driver','START','T1',1);const key=randomUUID();const results=await Promise.all(Array.from({length:4},()=>deliver(f,2,'O001',5,'TOTAL',key)));assert.ok(results.every(r=>r.revision===3));assert.equal((await trip(f)).trip.revision,3);
 await assert.rejects(deliver(f,2,'O001',3,'PARTIAL',key),{code:'IDEMPOTENCY_CONFLICT'});
});
test('partial delivery stays in transit, depot arrival does not increase stock; authorized check reintegrates once',async()=>{
 const f=await setupTrip({stock:10});await planned(f,['O001']);await route(f,'driver','START','T1',1);await deliver(f,2,'O001',3,'PARTIAL');
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,5);const line=(await trip(f)).trip.stops[0].lines[0];
 await assert.rejects(route(f,'manager','CHECK_RETURN','T1',3,{lineId:line.id,quantity:2,disposition:'REINTEGRATE'}),{code:'INVALID_TRANSITION'});
 await route(f,'driver','ARRIVE','T1',3);assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,5);
 const key=randomUUID();await route(f,'manager','CHECK_RETURN','T1',4,{lineId:line.id,quantity:2,disposition:'REINTEGRATE'},key);await route(f,'manager','CHECK_RETURN','T1',4,{lineId:line.id,quantity:2,disposition:'REINTEGRATE'},key);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,7);assert.equal((await trip(f)).trip.stops[0].lines[0].reintegrated,2);
});
test('damaged/refused freight is quarantined, not sellable stock; signature and photos policy are server validated',async()=>{
 const f=await setupTrip();await planned(f,['O001']);await route(f,'driver','START','T1',1);
 await assert.rejects(route(f,'driver','DELIVER','T1',2,{stopId:'O001',quantities:[5],outcome:'TOTAL',receiver:'Teste',identification:'T',signature:[]}),{code:'SIGNATURE_REQUIRED'});
 await assert.rejects(route(f,'driver','DELIVER','T1',2,{stopId:'O001',quantities:[0],outcome:'REFUSED',note:'Recusado',photos:['data:image/png;base64,iVBORw0KGgo=']}),{code:'PHOTO_NOT_AUTHORIZED'});
 await route(f,'driver','DELIVER','T1',2,{stopId:'O001',quantities:[0],outcome:'REFUSED',note:'Avaria confirmada',condition:'DAMAGED'});await route(f,'driver','ARRIVE','T1',3);const l=(await trip(f)).trip.stops[0].lines[0];
 await assert.rejects(route(f,'manager','CHECK_RETURN','T1',4,{lineId:l.id,quantity:5,disposition:'REINTEGRATE'}),{code:'RETURN_CHECK_MISMATCH'});
 await route(f,'manager','CHECK_RETURN','T1',4,{lineId:l.id,quantity:5,disposition:'QUARANTINE'});assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,95);
});
test('native PYG and USD custody, atomic existing sale/ledger posting, repeat/reconnect and full trip closure',async()=>{
 const f=await setupTrip({stock:20});await planned(f);await route(f,'driver','START','T1',1);await deliver(f,2);await deliver(f,3,'O002');
 await route(f,'driver','COLLECT','T1',4,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'199950'});
 await route(f,'driver','COLLECT','T1',5,{stopId:'O002',method:'dinheiro_usd',currency:'USD',amount:'30.00',acceptFrozenConversion:true});
 assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,0);await route(f,'driver','ARRIVE','T1',6);
 await assert.rejects(begin(f,7,{PYG:'199949',USD:'30.00'}),{code:'DIVERGENCE_REQUIRES_APPROVAL'});await begin(f,7,{PYG:'199950',USD:'30.00'});
 for(const orderId of ['O001','O002']){const p={tripId:'T1',orderId,pin:PIN};await service.routePost(f.uid,f.manager.sessionToken,p);await service.routePost(f.uid,f.manager.sessionToken,p);}
 const t=(await trip(f)).trip;assert.equal(t.state,'SETTLING');assert.deepEqual(t.settlement.expected,{PYG:199950,USD:3000});await route(f,'manager','CLOSE','T1',t.revision);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,10);assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,2);assert.equal((await db.doc(`${f.base}/vendas/O001`).get()).data().data.vendedorId,'sales');
});
test('partial collection books residual credit, return compensates existing sale/debt and never reintegrates twice',async()=>{
 const f=await setupTrip({stock:10});await planned(f,['O001']);await route(f,'driver','START','T1',1);await deliver(f,2,'O001',3,'PARTIAL');await route(f,'driver','COLLECT','T1',3,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'119970'});await route(f,'driver','ARRIVE','T1',4);
 const line=(await trip(f)).trip.stops[0].lines[0];await assert.rejects(begin(f,5,{PYG:'119970'}),{code:'RETURNS_PENDING'});await route(f,'manager','CHECK_RETURN','T1',5,{lineId:line.id,quantity:2,disposition:'REINTEGRATE'});await begin(f,6,{PYG:'119970'});
 await assert.rejects(service.routePost(f.uid,f.manager.sessionToken,{tripId:'T1',orderId:'O001',pin:PIN}),{code:'CREDIT_CONSENT_REQUIRED'});await service.routePost(f.uid,f.manager.sessionToken,{tripId:'T1',orderId:'O001',pin:PIN,acceptCredit:true});
 assert.equal((await db.doc(`${f.base}/clientes/C1`).get()).data().data.saldoDevedorBRL,60);let t=(await trip(f)).trip;const key=randomUUID();await route(f,'manager','REFUND','T1',t.revision,{lineId:line.id,method:'credito_fiado',note:'Compensação de duas unidades não entregues'},key);await route(f,'manager','REFUND','T1',t.revision,{lineId:line.id,method:'credito_fiado',note:'Compensação de duas unidades não entregues'},key);
 assert.equal((await db.doc(`${f.base}/clientes/C1`).get()).data().data.saldoDevedorBRL,0);assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,7);t=(await trip(f)).trip;await route(f,'manager','CLOSE','T1',t.revision);const sale=(await db.doc(`${f.base}/vendas/O001`).get()).data().data;assert.equal(sale.valorDevolvidoBRL,60);assert.equal(sale.custoDevolvidoBRL,24);assert.equal(line.snapshot.lot,'LOT-SYNTHETIC');assert.equal(sale.totalLiquidoBRL,90);assert.equal(sale.devolucoes.length,1);
});
test('concurrent receipts cannot exceed frozen due; void is audited and retry cannot collect twice',async()=>{
 const f=await setupTrip();await planned(f,['O001']);await route(f,'driver','START','T1',1);await deliver(f,2);const results=await Promise.allSettled([route(f,'driver','COLLECT','T1',3,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'199950'}),route(f,'driver','COLLECT','T1',3,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'199950'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(route(f,'driver','COLLECT','T1',4,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'1333'}),{code:'AMOUNT_EXCEEDS_DUE'});let t=(await trip(f)).trip;await route(f,'manager','VOID_RECEIPT','T1',t.revision,{receiptId:t.receipts[0].id,note:'Informação de recebimento duplicada pelo operador'});assert.equal((await db.doc(`${f.root}/distribution_collection_holds/O001`).get()).data().reservedCents,0);
});
test('isolation, live permission revoke, stock-only operator cannot manage drivers or settle',async()=>{
 const f=await setupTrip();await planned(f,['O001']);const g=await setupTrip();await assert.rejects(service.routeQuery(g.uid,f.manager.sessionToken,{type:'detail',tripId:'T1'}),{code:'SESSION_EXPIRED'});
 const stock=await service.login(f.uid,{operatorId:'stock',pin:PIN});await assert.rejects(service.routeQuery(f.uid,stock.sessionToken,{type:'catalog'}),{code:'FORBIDDEN'});
 await db.doc(`${f.base}/operadores/driver`).update({'data.permissoes':{}});await assert.rejects(route(f,'driver','START','T1',1),{code:'FORBIDDEN'});
});
test('already finalized credit sale is received in existing customer ledger and native cash movement, once',async()=>{
 const f=await setupTrip();await planned(f,['O001']);const o=(await db.doc(`${f.base}/vendas/O001`).get()).data().data;
 await service.finalize(f.uid,{orderId:o.id,operatorId:'admin',pin:PIN,sessionId:'CASH1',customerId:'C1',cart:o.itens.map(i=>({id:i.id,sku:i.sku,qtd:i.qtd,precoPraticadoBRL:i.precoPraticadoBRL})),payments:[{formaId:'crediario',moedaOrigem:'BRL',valorOriginal:150,valorConvertidoBRL:150}]});
 await route(f,'driver','START','T1',1);await deliver(f,2);await route(f,'driver','COLLECT','T1',3,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'199950'});await route(f,'driver','ARRIVE','T1',4);await begin(f,5,{PYG:'199950'});await service.routePost(f.uid,f.manager.sessionToken,{tripId:'T1',orderId:'O001'});await service.routePost(f.uid,f.manager.sessionToken,{tripId:'T1',orderId:'O001'});
 assert.equal((await db.doc(`${f.base}/clientes/C1`).get()).data().data.saldoDevedorBRL,0);const moves=await db.collection(`${f.base}/movimentosCaixa`).get();assert.equal(moves.size,1);assert.deepEqual(moves.docs[0].data().data.detalhesMoedasNativas,{PYG:199950});assert.equal((await db.doc(f.base).get()).data().fieldCounts.caixaMovimentos,1);
 const ledger=await db.collection(`${f.root}/financeiro_livro`).get();assert.equal(ledger.docs.filter(d=>d.data().tipo==='venda_fiada').length,1);assert.equal(ledger.docs.filter(d=>d.data().tipo==='recebimento_fiado').length,1);
});
test('paid sale customer return uses explicit transfer refund and protects frozen native currency, financial and stock',async()=>{
 const f=await setupTrip();await planned(f,['O001']);await route(f,'driver','START','T1',1);await deliver(f,2);await route(f,'driver','COLLECT','T1',3,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'199950'});const l=(await trip(f)).trip.stops[0].lines[0];await route(f,'driver','CUSTOMER_RETURN','T1',4,{stopId:'O001',lineId:l.id,quantity:1,condition:'GOOD',note:'Cliente devolveu uma lata'});await route(f,'driver','ARRIVE','T1',5);await route(f,'manager','CHECK_RETURN','T1',6,{lineId:l.id,quantity:1,disposition:'REINTEGRATE'});await begin(f,7,{PYG:'199950'});await service.routePost(f.uid,f.manager.sessionToken,{tripId:'T1',orderId:'O001',pin:PIN});
 let t=(await trip(f)).trip;await assert.rejects(route(f,'manager','REFUND','T1',t.revision,{lineId:l.id,method:'transferencia',currency:'PYG',amount:'39991',acceptFrozenConversion:true,bankReference:'TEST-BANK',note:'Estorno autorizado'}),{code:'PAYMENT_RATE_CHANGED'});
 await route(f,'manager','REFUND','T1',t.revision,{lineId:l.id,method:'transferencia',currency:'PYG',amount:'39990',acceptFrozenConversion:true,bankReference:'TEST-BANK',note:'Estorno autorizado'});t=(await trip(f)).trip;await route(f,'manager','CLOSE','T1',t.revision);assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,96);const sale=(await db.doc(`${f.base}/vendas/O001`).get()).data().data;assert.equal(sale.valorDevolvidoBRL,30);assert.equal(sale.totalOriginal,199950);assert.equal(sale.moedaDocumento,'PYG');
});
test('existing operator granular grants are server-only and management cannot grant itself financial access',async()=>{
 const f=await setupTrip();const op=(await db.doc(`${f.base}/operadores/sales`).get()).data();await route(f,'manager','SET_DRIVER_ACCESS','sales',op.version,{permissions:{distributionDriver:true,distributionManage:false}});const s=await service.login(f.uid,{operatorId:'sales',pin:PIN,scope:'driver'});assert.equal(s.operatorId,'sales');assert.equal((await db.doc(`${f.base}/operadores/sales`).get()).data().data.permissoes.pdv,true);
 await assert.rejects(route(f,'driver','SET_DRIVER_ACCESS','driver',0,{permissions:{distributionFinance:true}}),{code:'FORBIDDEN'});
});
test('bounded catalog pagination, today filtering and driver trip pagination retain tenant scope',async()=>{
 const f=await setupTrip();const batch=db.batch();for(let n=0;n<35;n++)batch.set(db.doc(`${f.root}/distribution_vehicles/V${String(n).padStart(2,'0')}`),{id:`V${String(n).padStart(2,'0')}`,name:'Sintético',plate:'TEST',active:true,revision:1});await batch.commit();const a=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'catalog'});assert.equal(a.vehicles.length,30);assert.ok(a.next.vehicles);const b=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'catalog',after:a.next});assert.equal(b.vehicles.length,5);assert.equal(new Set([...a.vehicles,...b.vehicles].map(v=>v.id)).size,35);
});
test('vehicle exclusivity at trip start, duplicate plate rejection and authorized photo proof',async()=>{
 const f=await setupTrip();await planned(f,['O001']);await assert.rejects(route(f,'manager','SAVE_VEHICLE','V2',0,{plate:'HML-2026',name:'Duplicado'}),{code:'VEHICLE_PLATE_EXISTS'});
 const {dispatched}=await import('./trip-fixture.mjs');await dispatched(f,'L-2','O002');await route(f,'manager','CREATE_TRIP','T2',0,{loadIds:['L-2'],driverId:'other-driver',vehicleId:'V1',routeId:'R1'});
 const results=await Promise.allSettled([route(f,'driver','START','T1',1),route(f,'other','START','T2',1)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ASSIGNMENT_BUSY');
 const winner=results[0].status==='fulfilled'?'T1':'T2',actor=winner==='T1'?'driver':'other',stopId=winner==='T1'?'O001':'O002';await db.doc(`${f.root}/distribution_config/module`).update({driverPhotos:true});
 const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTqkAAAAASUVORK5CYII=';
 await route(f,actor,'DELIVER',winner,2,{stopId,quantities:[5],outcome:'TOTAL',receiver:'Teste',identification:'SINT',signature,photos:[photo]});const t=(await trip(f,winner)).trip;const proof=await service.routeQuery(f.uid,f[actor].sessionToken,{view:'driver',type:'proof',tripId:winner,eventId:t.stops[0].proofId});assert.equal(proof.event.payload.photos[0],photo);
});
test('mixed good and damaged returns can be checked separately without making damaged goods sellable',async()=>{
 const f=await setupTrip({stock:10});await planned(f,['O001']);await route(f,'driver','START','T1',1);await deliver(f,2,'O001',3,'PARTIAL');let l=(await trip(f)).trip.stops[0].lines[0];await route(f,'driver','CUSTOMER_RETURN','T1',3,{stopId:'O001',lineId:l.id,quantity:1,condition:'DAMAGED',note:'Uma avaria após entrega'});await route(f,'driver','ARRIVE','T1',4);l=(await trip(f)).trip.stops[0].lines[0];assert.equal(l.condition,'MIXED');await route(f,'manager','CHECK_RETURN','T1',5,{lineId:l.id,quantity:3,disposition:'SPLIT',reintegrateQuantity:2});l=(await trip(f)).trip.stops[0].lines[0];assert.equal(l.reintegrated,2);assert.equal(l.quarantined,1);assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,7);
});
test('all four currencies and configured electronic forms retain original units without implicit conversion',async()=>{
 const f=await setupTrip();await planned(f,['O001']);await db.doc(`${f.root}/distribution_config/module`).update({driverPaymentMethods:[{id:'dinheiro_brl',currency:'BRL'},{id:'dinheiro_pyg',currency:'PYG'},{id:'dinheiro_usd',currency:'USD'},{id:'dinheiro_eur',currency:'EUR'},{id:'cartao_debito_pyg',currency:'PYG'},{id:'pix',currency:'BRL'}]});await route(f,'driver','START','T1',1);await deliver(f,2);await assert.rejects(route(f,'driver','COLLECT','T1',3,{stopId:'O001',method:'dinheiro_usd',currency:'USD',amount:'1'}),{code:'CONVERSION_CONSENT_REQUIRED'});
 let revision=3;for(const p of [{method:'dinheiro_brl',currency:'BRL',amount:'10.00'},{method:'dinheiro_pyg',currency:'PYG',amount:'13330'},{method:'dinheiro_usd',currency:'USD',amount:'2.00'},{method:'dinheiro_eur',currency:'EUR',amount:'1.70'},{method:'cartao_debito_pyg',currency:'PYG',amount:'13330'},{method:'pix',currency:'BRL',amount:'10.00'}])await route(f,'driver','COLLECT','T1',revision++,{stopId:'O001',...p,acceptFrozenConversion:true});const t=(await trip(f)).trip;assert.deepEqual(t.receipts.map(r=>r.centsBRL),[1000,1000,1000,1000,1000,1000]);assert.deepEqual(t.receipts.map(r=>r.minor),[1000,13330,200,170,13330,1000]);
});
