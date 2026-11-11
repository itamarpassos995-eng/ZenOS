import {distributionService} from '../../src/distribution/service.js';
import {planPygReturnCompensation} from '../../src/distribution/trips.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setupTrip,dispatched,route,trip,db,service,signature,PIN} from './trip-fixture.mjs';

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

for(const closeAfterCompensation of [false,true])test(closeAfterCompensation?'Closes the second PYG trip after recorded compensation':'Reconciles PYG compensation and reversals without duplicate cash',async()=>{
 const f=await setupTrip({orders:1,stock:10});
 const engine=distributionService(db,{emulatorPygCompensationUid:f.uid});
 await db.doc(`${f.root}/distribution_config/module`).update({pilotProfile:'PYG_CREDIT_CASH_V1',nativePygCashEnabled:true});
 const grantRef=db.doc(f.root+'/distribution_config/delivery_c_grant');
 const grant={enabled:true,projectId:db.projectId,uid:f.uid,generation:f.base.split('/').at(-1),operatorId:'admin',
  commands:['COMPENSATE_PYG_RETURN','REVERSE_PYG_COMPENSATION','REVERSE_PYG_RECEIPT'],expiresAt:Date.now()+300000};
 await grantRef.set(grant);
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
  if(tripId==='T2'){
   const beforePost=(await trip(f,tripId)).trip;
   const offer=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'pyg-return-preview',tripId,stopId:'O001',lineId});
   const race=await Promise.allSettled([post(),engine.routeCommand(f.uid,f.manager.sessionToken,{
    type:'COMPENSATE_PYG_RETURN',tripId,expectedRevision:beforePost.revision,key:randomUUID(),
    payload:{stopId:'O001',lineId,sourceDigest:offer.compensationContract.sourceDigest,reason:'Concurrencia sintética'}
   })]);
   assert.equal(race[0].status,'fulfilled');
   assert.equal(race[1].status,'rejected');
   assert.ok(['REVISION_CONFLICT','COMPENSATION_HAS_PENDING_RECEIPTS'].includes(race[1].reason.code));
  }
  const results=await Promise.all([post(),post()]);
  assert.equal(results.filter(result=>result.replayed).length,tripId==='T2'?2:1);
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
 const command={type:'COMPENSATE_PYG_RETURN',tripId:'T2',expectedRevision:settled.revision,
  key:randomUUID(),payload:{stopId:'O001',lineId:returned.id,sourceDigest:contract.sourceDigest,reason:'Compensación sintética'}};
 const execute=(input,actor=f.manager)=>engine.routeCommand(f.uid,actor.sessionToken,input);
 await assert.rejects(service.routeCommand(f.uid,f.manager.sessionToken,command),{code:'DELIVERY_C_EXECUTION_BLOCKED'});
 await assert.rejects(execute(command,f.driver),{code:'FORBIDDEN'});
 await grantRef.update({projectId:'foreign-project'});
 await assert.rejects(execute(command),{code:'DELIVERY_C_EXECUTION_BLOCKED'});
 await grantRef.update({projectId:grant.projectId,expiresAt:Date.now()-1});
 await assert.rejects(execute(command),{code:'DELIVERY_C_EXECUTION_BLOCKED'});
 await grantRef.update({expiresAt:grant.expiresAt,generation:'old'});
 await assert.rejects(execute(command),{code:'DELIVERY_C_EXECUTION_BLOCKED'});
 await grantRef.update({generation:grant.generation,commands:['REVERSE_PYG_COMPENSATION']});
 await assert.rejects(execute(command),{code:'DELIVERY_C_EXECUTION_BLOCKED'});
 await grantRef.update({commands:grant.commands});
 const other=await setupTrip({orders:1});
 await assert.rejects(engine.routeCommand(other.uid,f.manager.sessionToken,command),{code:'SESSION_EXPIRED'});
 await assert.rejects(execute({...command,expectedRevision:settled.revision-1}),{code:'REVISION_CONFLICT'});
 await assert.rejects(execute({...command,payload:{...command.payload,sourceDigest:'stale'}}),{code:'REVISION_CONFLICT'});
 const applications=await Promise.all([execute(command),execute(command)]);
 assert.equal(applications.filter(x=>x.replayed).length,1);
 const applied=(await trip(f,'T2')).trip;
 assert.equal(applied.installmentBalances[0].remaining,350000);
 assert.equal(applied.installmentBalances[0].installments[2].remaining,200000);
 assert.equal(applied.installmentBalances[0].received,450000);
 assert.equal((await client.get()).data().data.saldoDevedorBRL,280);
 const compensationId=applied.stops[0].lines[0].pygCompensation.operationId;
 const applyEvent=(await db.doc(f.root+'/distribution_trip_events/'+compensationId).get()).data();
 assert.equal(applyEvent.financialContract.eligibleMinor,200000);
 const adjustmentId='PYG-RETURN-RECON';
 await db.doc(f.root+'/distribution_adjustments/'+adjustmentId).set({id:adjustmentId,tenantId:f.uid,generation:grant.generation,
  saleId:'O001',customerId:'C1',revision:0,value:{currency:'PYG',minor:'200000'}});
 const reconcile=async(expected,brl)=>{
  await service.reconciliationCommand(f.uid,f.manager.sessionToken,{adjustmentId,key:randomUUID(),expectedRevision:0});
  const session=await service.login(f.uid,{operatorId:'admin',pin:PIN,scope:'trip'});
  const result=await service.reconciliationQuery(f.uid,session.sessionToken,{type:'detail',adjustmentId});
  assert.equal(result.reconciliation.state,'RECONCILED');
  assert.equal(result.reconciliation.verifiedOpen.minor,String(expected));
  assert.equal(result.reconciliation.outstandingBRLCents,brl);
  return result.reconciliation;
 };
 const reconciled=await reconcile(350000,28000);
 assert.equal(reconciled.verifiedReceived.minor,'450000');
 assert.equal(reconciled.installments[2].compensated.minor,'200000');
 assert.equal(reconciled.payments.find(event=>event.kind==='COMPENSATION').affectsCash,false);
 if(closeAfterCompensation){
  await grantRef.update({enabled:false});
  await assert.rejects(execute(command),{code:'DELIVERY_C_EXECUTION_BLOCKED'});
  await route(f,'manager','CLOSE','T2',applied.revision);
  assert.equal((await trip(f,'T2')).trip.state,'CLOSED');
  const history=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'events',tripId:'T2'});
  const closure=history.items.find(event=>event.type==='CLOSE');
  assert.equal(closure.hasDocument,true);
  const document=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'document',tripId:'T2',eventId:closure.id});
  assert.equal(document.document.state,'CLOSED');
  assert.equal(document.document.stops[0].remainingCreditPYG,350000);
  assert.equal(document.document.stops[0].lines[0].compensatedPYG,200000);
  assert.equal((await reconcile(350000,28000)).previousCompensations.minor,'200000');
  return;
 }
 await assert.rejects(execute({...command,key:randomUUID(),expectedRevision:applied.revision}),{code:'COMPENSATION_ALREADY_APPLIED'});
 const reverse={type:'REVERSE_PYG_COMPENSATION',tripId:'T2',expectedRevision:applied.revision,key:randomUUID(),
  payload:{stopId:'O001',lineId:returned.id,compensationId,reason:'Reversión sintética'}};
 await assert.rejects(execute(reverse,f.driver),{code:'FORBIDDEN'});
 const reversals=await Promise.all([execute(reverse),execute(reverse)]);
 assert.equal(reversals.filter(x=>x.replayed).length,1);
 const restored=(await trip(f,'T2')).trip;
 assert.equal(restored.installmentBalances[0].remaining,550000);
 assert.equal(restored.installmentBalances[0].installments[2].remaining,400000);
 assert.equal(restored.installmentBalances[0].received,450000);
 assert.equal((await reconcile(550000,44000)).previousCompensations.minor,'0');
 await assert.rejects(execute({...reverse,key:randomUUID(),expectedRevision:restored.revision}),{code:'COMPENSATION_NOT_ACTIVE'});
 await assert.rejects(execute({...command,key:randomUUID(),expectedRevision:restored.revision,payload:{...command.payload,sourceDigest:(await preview()).compensationContract.sourceDigest}}),{code:'COMPENSATION_ALREADY_APPLIED'});
 const financialEvents=(await ledger.get()).docs.map(doc=>doc.data()).filter(entry=>['compensacao_devolucao','reversao_compensacao'].includes(entry.tipo));
 assert.equal(financialEvents.length,2);
 assert.ok(financialEvents.every(entry=>entry.valor===160&&!entry.afetaCaixaFisico&&entry.financeLink.valorOriginal===200000));
 assert.equal(financialEvents.find(entry=>entry.tipo==='reversao_compensacao').financeLink.reversalOf,financialEvents.find(entry=>entry.tipo==='compensacao_devolucao').id);

 await assert.rejects(route(f,'manager','VOID_RECEIPT','T2',restored.revision,{receiptId:settled.receipts.find(r=>r.posted).id,note:'Estorno de prueba'}),{code:'TRIP_LOCKED'});
 assert.equal((await client.get()).data().data.saldoDevedorBRL,440);
 assert.equal((await ledger.get()).size,5);
 assert.equal((await db.collection(`${f.base}/movimentosCaixa`).get()).size,2);
 const postedReceipt=restored.receipts.find(receipt=>receipt.posted);
 const voidCommand={type:'REVERSE_PYG_RECEIPT',tripId:'T2',expectedRevision:restored.revision,key:randomUUID(),
  payload:{receiptId:postedReceipt.id,saleRevision:(await saleRef.get()).data().version,reason:'Devolución de efectivo sintético'}};
 const cashSession=db.doc(f.base+'/sessoesCaixa/CASH1');
 await cashSession.update({'data.status':'fechada'});
 await assert.rejects(execute(voidCommand),{code:'CASH_SESSION_CLOSED'});
 assert.equal((await ledger.get()).size,5);
 await cashSession.update({'data.status':'aberta'});
 const cashReversals=await Promise.all([execute(voidCommand),execute(voidCommand)]);
 assert.equal(cashReversals.filter(x=>x.replayed).length,1);
 const corrected=(await trip(f,'T2')).trip;
 assert.equal(corrected.installmentBalances[0].remaining,750000);
 assert.equal(corrected.installmentBalances[0].received,250000);
 assert.equal((await reconcile(750000,60000)).verifiedReceived.minor,'250000');
 assert.equal((await client.get()).data().data.saldoDevedorBRL,600);
 assert.equal((await saleRef.get()).data().data.creditAllocationsV2.length,2);
 assert.equal(corrected.receipts.find(receipt=>receipt.id===postedReceipt.id).posted,true);
 const movements=(await db.collection(f.base+'/movimentosCaixa').get()).docs.map(doc=>doc.data().data);
 assert.equal(movements.length,3);
 const refund=movements.find(movement=>movement.direcao==='saida');
 assert.equal(refund.detalhesMoedasNativas.PYG,200000);
 assert.equal(refund.valorBRL,160);
 assert.ok(movements.some(movement=>movement.id===refund.reversaoDe&&movement.direcao==='entrada'));
 const journal=(await ledger.get()).docs.map(doc=>doc.data());
 const receiptReversal=journal.find(entry=>entry.tipo==='estorno_recebimento_fiado');
 assert.ok(journal.some(entry=>entry.id===receiptReversal.financeLink.reversalOf&&entry.tipo==='recebimento_fiado'));
 assert.equal(receiptReversal.detalhes.reversalMovementId,refund.id);
 await assert.rejects(execute({...voidCommand,key:randomUUID(),expectedRevision:corrected.revision}),{code:'RECEIPT_ALREADY_REVERSED'});
 await assert.rejects(route(f,'manager','CLOSE','T2',corrected.revision),{code:'SETTLEMENT_PENDING'});


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
