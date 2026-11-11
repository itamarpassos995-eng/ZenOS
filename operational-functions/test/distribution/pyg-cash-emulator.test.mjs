import {planPygReturnCompensation} from '../../src/distribution/trips.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setupTrip,dispatched,route,trip,db,service,signature} from './trip-fixture.mjs';

test('two PYG trips reconcile one native cash receipt and preserve the original debt',async()=>{
 const f=await setupTrip({orders:1,stock:10});
 await db.doc(`${f.root}/distribution_config/module`).update({pilotProfile:'PYG_CREDIT_CASH_V1',nativePygCashEnabled:true});
 const saleRef=db.doc(`${f.base}/vendas/O001`);
 const sale=(await saleRef.get()).data().data;
 const nativeAmount={currency:'PYG',amountMinor:1000000,historicalRate:'1250'};
 await saleRef.update({data:{...sale,tipoDocumento:'venda',estado:'concluida',moedaDocumento:'PYG',
  taxasCambio:{BRL:1,PYG:1250},totalOriginal:1000000,totalBRL:800,
  pagamentos:[{formaId:'crediario',moedaOrigem:'BRL',valorOriginal:800,valorConvertidoBRL:800}],
  itens:[{...sale.itens[0],precoPraticadoBRL:160,totalBRL:800,movimentoEstoqueVenda:{total:5,galpao:5,vitrine:0}}],
  financeCreditV2:{schema:1,receivableId:'REC-O001',originalBRL:800,nativeAmount,
   installments:[{id:'P1',amountBRL:800,nativeAmount}]},creditAllocationsV2:[]}});
 const client=db.doc(`${f.base}/clientes/C1`);
 await client.update({'data.saldoDevedorBRL':800});
 const ledger=db.collection(`${f.root}/financeiro_livro`);
 await ledger.doc('VENDA-O001-FIADO').set({tipo:'venda_fiada',clienteId:'C1',valor:800,
  _v2:{generation:f.base.split('/').at(-1)},financeLink:{financeEventType:'OBLIGATION',saleId:'O001',receivableId:'REC-O001'}});
 await route(f,'manager','SAVE_VEHICLE','V1',0,{plate:'HML-2026',name:'Vehículo sintético'});
 await route(f,'manager','SAVE_ROUTE','R1',0,{name:'Ruta sintética'});
 await dispatched(f,'L1','O001',3);
 await dispatched(f,'L2','O001',2);
 for(const [tripId,loadId,quantity,amount] of [['T1','L1',3,250000],['T2','L2',2,0]]){
  await route(f,'manager','CREATE_TRIP',tripId,0,{loadIds:[loadId],driverId:'driver',vehicleId:'V1',routeId:'R1'});
  await route(f,'driver','START',tripId,1);
  await route(f,'driver','DELIVER',tripId,2,{stopId:'O001',quantities:[quantity],outcome:'TOTAL',receiver:'Sintético',identification:'TEST',signature});
  let revision=3;
  if(amount){
   const payment={stopId:'O001',method:'dinheiro_pyg',currency:'PYG'};
   await assert.rejects(route(f,'driver','COLLECT',tripId,revision,{...payment,amount:'600001'}),{code:'AMOUNT_EXCEEDS_DUE'});
   await assert.rejects(route(f,'driver','COLLECT',tripId,revision,{...payment,amount:'250000.1'}),{code:'INVALID_PAYMENT'});
   const collect=()=>route(f,'driver','COLLECT',tripId,revision,{...payment,amount:String(amount)});
   const attempts=await Promise.allSettled([collect(),collect()]);
   assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
   assert.equal(attempts.find(result=>result.status==='rejected').reason.code,'REVISION_CONFLICT');
   revision++;
  }
  await route(f,'driver','ARRIVE',tripId,revision++);
  await route(f,'manager','CLOSE_PHYSICAL',tripId,revision++);
  assert.deepEqual((await trip(f,tripId)).trip.physicalClosure.deliveredByCurrency,{PYG:String(quantity*200000)});
  await route(f,'manager','BEGIN_CLOSE',tripId,revision++,{cashSessionId:'CASH1',counted:{PYG:String(amount)}});
  await assert.rejects(service.routePost(f.uid,f.driver.sessionToken,{tripId,orderId:'O001'}),{code:'FORBIDDEN'});
  const post=()=>service.routePost(f.uid,f.manager.sessionToken,{tripId,orderId:'O001'});
  const results=await Promise.all([post(),post()]);
  assert.equal(results.filter(result=>result.replayed).length,1);
  const persisted=(await trip(f,tripId)).trip;
  assert.equal(persisted.postedOrders.O001.receivedPYG,amount);
  assert.equal(persisted.postedOrders.O001.remainingCreditPYG,750000);
  await route(f,'manager','CLOSE',tripId,revision+1);
 }
 const saved=(await saleRef.get()).data().data;
 assert.equal(saved.creditAllocationsV2.length,1);
 assert.equal(saved.creditAllocationsV2[0].allocations[0].amountPYG,250000);
 assert.equal((await client.get()).data().data.saldoDevedorBRL,600);
 const cash=(await db.collection(`${f.base}/movimentosCaixa`).get()).docs;
 assert.equal(cash.length,1);
 assert.deepEqual(cash[0].data().data.detalhesMoedasNativas,{PYG:250000});
 const entries=(await ledger.get()).docs.map(doc=>doc.data());
 assert.equal(entries.length,2);
 assert.equal(entries.find(entry=>entry.tipo==='recebimento_fiado').financeLink.valorOriginal,250000);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,10);
});

test('PYG pilot carries three customers through one manifest, custody and physical closure',async()=>{
 const f=await setupTrip({orders:3,stock:30});
 await db.doc(`${f.root}/distribution_config/module`).update({pilotProfile:'PYG_CREDIT_CASH_V1',nativePygCashEnabled:true});
 const nativeAmount={currency:'PYG',amountMinor:199950,historicalRate:'1333'};
 const clientRef=db.doc(`${f.base}/clientes/C1`);
 const client=(await clientRef.get()).data();
 for(const [i,city] of ['Ponta Porã','Dourados','Campo Grande'].entries()){
  const customerId=`C${i+1}`,orderId=`O00${i+1}`;
  await db.doc(`${f.base}/clientes/${customerId}`).set({...client,data:{...client.data,id:customerId,nome:`Cliente ${i+1}`,cidade:city,saldoDevedorBRL:i?0:150}});
  const ref=db.doc(`${f.base}/vendas/${orderId}`);
  const order=(await ref.get()).data().data;
  await ref.update({data:{...order,clienteId:customerId,clienteNome:`Cliente ${i+1}`,moedaDocumento:'PYG',totalOriginal:199950,
   ...(i?{}:{tipoDocumento:'venda',estado:'concluida',
    itens:[{...order.itens[0],movimentoEstoqueVenda:{total:5,galpao:5,vitrine:0}}],
    pagamentos:[{formaId:'crediario',moedaOrigem:'BRL',valorOriginal:150,valorConvertidoBRL:150}],
    financeCreditV2:{schema:1,receivableId:'REC-O001',originalBRL:150,nativeAmount,installments:[{id:'P1',amountBRL:150,nativeAmount}]},creditAllocationsV2:[]})}});
 }
 const ledger=db.collection(`${f.root}/financeiro_livro`);
 await ledger.doc('VENDA-O001-FIADO').set({tipo:'venda_fiada',clienteId:'C1',valor:150,_v2:{generation:f.base.split('/').at(-1)},
  financeLink:{financeEventType:'OBLIGATION',saleId:'O001',receivableId:'REC-O001'}});
 const load=(type,revision,payload={})=>service.command(f.uid,f.manager.sessionToken,{type,loadId:'PILOT',expectedRevision:revision,payload,key:randomUUID()});
 await load('CREATE',0,{selections:['O001','O002','O003'].map(orderId=>({orderId,lineIndex:0,quantity:5}))});
 await load('RESERVE',1);await load('START_PICK',2);await load('CHECK',3,{quantities:[5,5,5]});await load('APPROVE',4);
 await load('CONFIRM_LOADING',5,{quantities:[5,5,5]});await load('MANIFEST',6,{vehicle:'PILOT',driver:'Sintético',route:'PYG'});
 const {document}=await service.query(f.uid,f.manager.sessionToken,{type:'manifest',loadId:'PILOT',version:1});
 await load('DISPATCH',7);
 await route(f,'manager','SAVE_VEHICLE','V1',0,{plate:'PILOT',name:'Veículo sintético'});
 await route(f,'manager','SAVE_ROUTE','R1',0,{name:'Rota sintética'});
 await route(f,'manager','CREATE_TRIP','T1',0,{loadIds:['PILOT'],driverId:'driver',vehicleId:'V1',routeId:'R1'});
 await route(f,'driver','START','T1',1);
 for(const [i,quantity,condition,outcome] of [[0,5,'GOOD','TOTAL'],[1,3,'GOOD','PARTIAL'],[2,0,'DAMAGED','REFUSED']]){
  await route(f,'driver','DELIVER','T1',i+2,{stopId:`O00${i+1}`,quantities:[quantity],outcome,condition,
   receiver:'Sintético',identification:'TEST',signature,note:'Resultado sintético'});
 }
 const cash={stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'66650'};
 await assert.rejects(route(f,'driver','COLLECT','T1',5,{...cash,method:'dinheiro_brl',currency:'BRL'}),{code:'PILOT_PAYMENT_DISABLED'});
 await assert.rejects(route(f,'driver','RECORD_CHEQUE','T1',5,{stopId:'O001'}),{code:'PILOT_PYG_CREDIT_UNAVAILABLE'});
 await route(f,'driver','COLLECT','T1',5,cash);
 const lineId=(await trip(f)).trip.stops[0].lines[0].id;
 const returnKey=randomUUID(),returnPayload={stopId:'O001',lineId,quantity:1,condition:'GOOD',note:'Retorno de prueba'};
 await route(f,'driver','CUSTOMER_RETURN','T1',6,returnPayload,returnKey);
 assert.equal((await route(f,'driver','CUSTOMER_RETURN','T1',6,returnPayload,returnKey)).replayed,true);
 await route(f,'driver','ARRIVE','T1',7);
 const returned=(await trip(f)).trip;
 assert.deepEqual(returned.stops.map(stop=>stop.lines[0].id),document.lines.map(line=>`PILOT:${line.id}`));
 assert.deepEqual(returned.stops.map(stop=>stop.customerId),['C1','C2','C3']);
 await route(f,'manager','CHECK_RETURN','T1',8,{lineId:returned.stops[1].lines[0].id,quantity:2,disposition:'REINTEGRATE'});
 await route(f,'manager','CHECK_RETURN','T1',9,{lineId:returned.stops[2].lines[0].id,quantity:5,disposition:'QUARANTINE'});
 const checkKey=randomUUID(),checkPayload={lineId,quantity:1,disposition:'REINTEGRATE'};
 await route(f,'manager','CHECK_RETURN','T1',10,checkPayload,checkKey);
 assert.equal((await route(f,'manager','CHECK_RETURN','T1',10,checkPayload,checkKey)).replayed,true);
 await route(f,'manager','CLOSE_PHYSICAL','T1',11);
 await route(f,'manager','BEGIN_CLOSE','T1',12,{cashSessionId:'CASH1',counted:{PYG:'66650'}});
 const post=()=>service.routePost(f.uid,f.manager.sessionToken,{tripId:'T1',orderId:'O001'});
 assert.equal((await Promise.all([post(),post()])).filter(result=>result.replayed).length,1);
 const final=(await trip(f)).trip;
 assert.equal(final.state,'SETTLING');
 const checked=final.stops[0].lines[0];
 const [collection,verification]=await Promise.all([checked.customerReturnEventIds[0],checked.returnCheckEventId].map(id=>db.doc(f.root+'/distribution_trip_events/'+id).get()));
 assert.equal(collection.data().returnEvidence.amountMinor,'39990');
 assert.equal(collection.data().returnEvidence.deliveryEventId,final.stops[0].proofId);
 assert.deepEqual(verification.data().returnEvidence.customerReturnEventIds,[collection.id]);
 assert.equal(verification.data().returnEvidence.reintegrated,1);
 const preview=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'pyg-return-preview',tripId:'T1',stopId:'O001',lineId});
 assert.equal(preview.returnCheckEventId,verification.id);
 assert.equal(preview.eligibleMinor,39990);
 assert.equal(preview.postedMinor,0);
 assert.equal(final.physicalClosure.deliveredByCurrency.PYG,'279930');
 assert.equal(final.stops[2].lines[0].quarantined,5);
 assert.equal(final.postedOrders.O001.remainingCreditPYG,133300);
 assert.equal(final.postedOrders.O002,undefined);
 assert.equal((await clientRef.get()).data().data.saldoDevedorBRL,100);
 assert.equal((await ledger.get()).size,2);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,23);
 const other=await setupTrip({orders:1});
 await assert.rejects(service.routeQuery(other.uid,f.driver.sessionToken,{type:'detail',view:'driver',tripId:'T1'}),{code:'SESSION_EXPIRED'});
 const history=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'events',tripId:'T1'});
 assert.ok(history.items.some(event=>event.type==='CLOSE_PHYSICAL'&&event.hasDocument));
});

test('three native PYG installments allocate two receipts across trips without duplicate cash',async()=>{
 const f=await setupTrip({orders:1,stock:10});
 await db.doc(`${f.root}/distribution_config/module`).update({pilotProfile:'PYG_CREDIT_CASH_V1',nativePygCashEnabled:true});
 const saleRef=db.doc(`${f.base}/vendas/O001`);
 const sale=(await saleRef.get()).data().data;
 const nativeAmount={currency:'PYG',amountMinor:1000000,historicalRate:'1250'};
 await saleRef.update({data:{...sale,tipoDocumento:'venda',estado:'concluida',moedaDocumento:'PYG',
  taxasCambio:{BRL:1,PYG:1250},totalOriginal:1000000,totalBRL:800,
  pagamentos:[{formaId:'crediario',moedaOrigem:'BRL',valorOriginal:800,valorConvertidoBRL:800}],
  itens:[{...sale.itens[0],precoPraticadoBRL:160,totalBRL:800,movimentoEstoqueVenda:{total:5,galpao:5,vitrine:0}}],
  financeCreditV2:{schema:1,receivableId:'REC-O001',originalBRL:800,nativeAmount,
   installments:[{id:'AGGREGATE',amountBRL:800,kind:'AGGREGATE_NO_SCHEDULE',dueAt:null,nativeAmount}]},creditAllocationsV2:[]}});
 const client=db.doc(`${f.base}/clientes/C1`);
 await client.update({'data.saldoDevedorBRL':800});
 const ledger=db.collection(`${f.root}/financeiro_livro`);
 await ledger.doc('VENDA-O001-FIADO').set({tipo:'venda_fiada',clienteId:'C1',valor:800,
  _v2:{generation:f.base.split('/').at(-1)},financeLink:{financeEventType:'OBLIGATION',saleId:'O001',receivableId:'REC-O001'}});
 const schedule={installments:[{id:'A',amountPYG:300000,dueAt:'2026-12-01'},{id:'B',amountPYG:300000,dueAt:'2027-01-01'},{id:'C',amountPYG:400000,dueAt:'2027-02-01'}]};
 const sourceVersion=(await saleRef.get()).data().version;
 await assert.rejects(route(f,'driver','SET_PYG_INSTALLMENTS','O001',sourceVersion,schedule),{code:'FORBIDDEN'});
 await assert.rejects(route(f,'manager','SET_PYG_INSTALLMENTS','O001',sourceVersion,{installments:schedule.installments.slice(0,2)}),{code:'CREDIT_INSTALLMENT_SUM_MISMATCH'});
 const scheduleKey=randomUUID();
 await route(f,'manager','SET_PYG_INSTALLMENTS','O001',sourceVersion,schedule,scheduleKey);
 assert.equal((await route(f,'manager','SET_PYG_INSTALLMENTS','O001',sourceVersion,schedule,scheduleKey)).replayed,true);
 await route(f,'manager','SAVE_VEHICLE','V1',0,{plate:'HML-2026',name:'Vehículo sintético'});
 await route(f,'manager','SAVE_ROUTE','R1',0,{name:'Ruta sintética'});
 await dispatched(f,'L1','O001',3);
 await dispatched(f,'L2','O001',2);
 for(const [tripId,loadId,quantity,amount] of [['T1','L1',3,250000],['T2','L2',2,200000]]){
  await route(f,'manager','CREATE_TRIP',tripId,0,{loadIds:[loadId],driverId:'driver',vehicleId:'V1',routeId:'R1'});
  await route(f,'driver','START',tripId,1);
  await route(f,'driver','DELIVER',tripId,2,{stopId:'O001',quantities:[quantity],outcome:'TOTAL',receiver:'Sintético',identification:'TEST',signature});
  let revision=3;
  if(amount){
   const payment={stopId:'O001',method:'dinheiro_pyg',currency:'PYG'};
   await assert.rejects(route(f,'driver','COLLECT',tripId,revision,{...payment,amount:'600001'}),{code:'AMOUNT_EXCEEDS_DUE'});
   await assert.rejects(route(f,'driver','COLLECT',tripId,revision,{...payment,amount:'250000.1'}),{code:'INVALID_PAYMENT'});
   await route(f,'driver','COLLECT',tripId,revision++,{...payment,amount:'1250'});
   const heldReceipt=(await trip(f,tripId)).trip.receipts.at(-1);
   await route(f,'manager','VOID_RECEIPT',tripId,revision++,{receiptId:heldReceipt.id,note:'Cobro de prueba anulado antes del acierto'});
   const collect=()=>route(f,'driver','COLLECT',tripId,revision,{...payment,amount:String(amount)});
   const attempts=await Promise.allSettled([collect(),collect()]);
   assert.equal(attempts.filter(result=>result.status==='fulfilled').length,1);
   assert.equal(attempts.find(result=>result.status==='rejected').reason.code,'REVISION_CONFLICT');
   revision++;
  }
  const lineId=(await trip(f,tripId)).trip.stops[0].lines[0].id;
  if(tripId==='T2')await route(f,'driver','CUSTOMER_RETURN',tripId,revision++,{stopId:'O001',lineId,quantity:1,condition:'GOOD',note:'Retorno de prueba'});
  await route(f,'driver','ARRIVE',tripId,revision++);
  if(tripId==='T2')await route(f,'manager','CHECK_RETURN',tripId,revision++,{lineId,quantity:1,disposition:'REINTEGRATE'});
  await route(f,'manager','CLOSE_PHYSICAL',tripId,revision++);
  assert.deepEqual((await trip(f,tripId)).trip.physicalClosure.deliveredByCurrency,{PYG:String((tripId==='T2'?quantity-1:quantity)*200000)});
  await route(f,'manager','BEGIN_CLOSE',tripId,revision++,{cashSessionId:'CASH1',counted:{PYG:String(amount)}});
  await assert.rejects(service.routePost(f.uid,f.driver.sessionToken,{tripId,orderId:'O001'}),{code:'FORBIDDEN'});
  const post=()=>service.routePost(f.uid,f.manager.sessionToken,{tripId,orderId:'O001'});
  const results=await Promise.all([post(),post()]);
  assert.equal(results.filter(result=>result.replayed).length,1);
  const persisted=(await trip(f,tripId)).trip;
  assert.equal(persisted.postedOrders.O001.receivedPYG,amount);
  assert.equal(persisted.postedOrders.O001.remainingCreditPYG,tripId==='T1'?750000:550000);
  if(tripId==='T1')await route(f,'manager','CLOSE',tripId,revision+1);
  else await assert.rejects(route(f,'manager','CLOSE',tripId,revision+1),{code:'PYG_RETURN_FINANCE_PENDING'});
 }
 await assert.rejects(route(f,'manager','REFUND','T2',(await trip(f,'T2')).trip.revision,{method:'credito_fiado'}),{code:'PILOT_PYG_CREDIT_UNAVAILABLE'});
 const saved=(await saleRef.get()).data().data;
 assert.equal(saved.creditAllocationsV2.length,2);
 assert.equal(saved.creditAllocationsV2[0].allocations[0].amountPYG,250000);
 assert.equal((await client.get()).data().data.saldoDevedorBRL,440);
 const cash=(await db.collection(`${f.base}/movimentosCaixa`).get()).docs;
 assert.equal(cash.length,2);
 assert.equal(cash.reduce((total,doc)=>total+doc.data().data.detalhesMoedasNativas.PYG,0),450000);
 assert.deepEqual(saved.creditAllocationsV2[1].allocations.map(row=>[row.installmentId,row.amountPYG]),[['A',50000],['B',150000]]);
 const entries=(await ledger.get()).docs.map(doc=>doc.data());
 assert.equal(entries.length,3);
 assert.equal(entries.find(entry=>entry.tipo==='recebimento_fiado').financeLink.valorOriginal,250000);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,11);
 const settled=(await trip(f,'T2')).trip;
 const returned=settled.stops[0].lines[0];
 const input={type:'pyg-return-preview',tripId:'T2',stopId:'O001',lineId:returned.id};
 const preview=()=>service.routeQuery(f.uid,f.manager.sessionToken,input);
 await assert.rejects(service.routeQuery(f.uid,f.driver.sessionToken,{...input,view:'driver'}),{code:'FORBIDDEN'});
 const [first,repeated]=await Promise.all([preview(),preview()]);
 assert.deepEqual(first,repeated);
 assert.equal(first.executable,false);
 assert.equal(first.returnedValue,200000);
 assert.equal(first.outstanding,550000);
 assert.equal(first.maximum,200000);
 assert.equal(first.projectedMinimum,350000);
 const contract=first.compensationContract;
 assert.equal(contract.executable,false);
 assert.equal(contract.policy,'REVERSE_INSTALLMENT_SCHEDULE');
 assert.equal(contract.eligibleMinor,200000);
 assert.equal(contract.outstandingAfter,350000);
 assert.equal(contract.amountBRLCents,16000);
 assert.deepEqual(contract.allocations,[{installmentId:'C',paidMinor:0,amountMinor:200000,amountBRLCents:16000}]);
 assert.equal(contract.restitutionPendingMinor,0);
 assert.equal(first.postedMinor,0);
 await assert.rejects(route(f,'manager','VOID_RECEIPT','T2',settled.revision,{receiptId:settled.receipts.find(r=>r.posted).id,note:'Estorno de prueba'}),{code:'TRIP_LOCKED'});
 assert.equal((await client.get()).data().data.saldoDevedorBRL,440);
 assert.equal((await ledger.get()).size,3);
 assert.equal((await db.collection(`${f.base}/movimentosCaixa`).get()).size,2);

});

test('PYG compensation contract caps the proposed offset and preserves historical cent rounding',()=>{
 const sale={id:'O001',financeCreditV2:{receivableId:'REC-O001'}};
 const source={tenantId:'test',generation:'v2',tripId:'T2',lineId:'L1',returnCheckEventId:'CHECK',saleRevision:7};
 const credit={rate:'1333',remaining:100,balances:new Map([['A',{start:0,original:1000,paid:900}]])};
 const plan=planPygReturnCompensation({sale,credit,source,returnedValue:200,operatorId:'admin'});
 assert.equal(plan.eligibleMinor,100);
 assert.equal(plan.restitutionPendingMinor,100);
 assert.equal(plan.amountBRLCents,7);
 assert.equal(plan.outstandingAfter,0);
 const changed=planPygReturnCompensation({sale,credit:{...credit,remaining:50,balances:new Map([['A',{start:0,original:1000,paid:950}]])},source:{...source,saleRevision:8},returnedValue:200,operatorId:'other'});
 assert.equal(changed.idempotencyKey,plan.idempotencyKey);
 assert.notEqual(changed.sourceDigest,plan.sourceDigest);
 assert.equal(changed.eligibleMinor,50);
 assert.equal(changed.restitutionPendingMinor,150);
});
