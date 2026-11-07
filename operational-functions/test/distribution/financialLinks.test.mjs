import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
const service=distributionService(db);
async function setup(){
 const f=await seed('distribution-b2-'+randomUUID().slice(0,9),{orders:1});
 await db.doc(`${f.root}/distribution_config/module`).update({fiscalCountry:'PY'});
 await db.doc(`${f.base}/vendas/O001`).update({'data.totalOriginal':1000000,'data.tipoDocumento':'venda','data.estado':'concluida','data.pagamentos':[{id:'PAY1',formaId:'crediario',moedaOrigem:'PYG',valorOriginal:1000000}]});
 const login=await service.login(f.uid,{operatorId:'admin',pin:PIN});
 const id='OCC-'+randomUUID();
 await service.occurrenceCommand(f.uid,login.sessionToken,{type:'CREATE',occurrenceId:id,key:randomUUID(),
  expectedRevision:0,payload:{id,reason:'DELIVERY_SHORTAGE',quantity:3,
  description:'Conferência sintética B2',refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',productId:'P1'}}});
 for(const [state,revision] of [['UNDER_REVIEW',0],['CONFIRMED',1]]){
  await service.occurrenceCommand(f.uid,login.sessionToken,{type:'TRANSITION_LOGISTICS',occurrenceId:id,
   expectedRevision:revision,key:randomUUID(),payload:{next:state,eventId:'EV-'+randomUUID(),note:'Conferência sintética'}});
 }
 const adjustmentId='ADJ-'+randomUUID();
 await service.adjustmentCommand(f.uid,login.sessionToken,{type:'CREATE',id:adjustmentId,
  occurrenceId:id,expectedRevision:0,key:randomUUID(),payload:{type:'SHORTAGE',quantity:2}});

 const prefix={lojaId:f.uid,referenciaId:'O001',clienteId:'C1',financeLinkVersion:2,
  receivableId:'DEBT1',installmentId:'INST1',moeda:'PYG'};
 await db.doc(`${f.root}/financeiro_livro/D1`).set({...prefix,id:'D1',financeEventType:'OBLIGATION',valor:1000000,
  createdAt:'2026-11-01T00:00:00Z'});
 for(const [id,value,day] of [['R1',200000,2],['R2',150000,3],['R3',100000,4]]){
  await db.doc(`${f.root}/financeiro_livro/${id}`).set({...prefix,id,
   financeEventType:'RECEIPT',valor:value,createdAt:`2026-11-0${day}T00:00:00Z`,
   paymentId:id,sourceEventId:'D1',status:'liquidado',liquidacaoConfirmada:true,
   comprovanteId:'SYNTH-'+id});
 }
 return {...f,token:login.sessionToken,adjustmentId};
}
async function write(f,key=randomUUID()){return service.reconciliationCommand(f.uid,f.token,{
 adjustmentId:f.adjustmentId,key,expectedRevision:0});}
async function read(f){return service.reconciliationQuery(f.uid,f.token,{type:'detail',adjustmentId:f.adjustmentId});}
test('B2 Firestore V2 3 partial payments return 450000 received and 550000 open without writes to financial sources',async()=>{
 const f=await setup();
 const saleBefore=(await db.doc(`${f.base}/vendas/O001`).get()).data(),
  clientBefore=(await db.doc(`${f.base}/clientes/C1`).get()).data(),
  stockBefore=(await db.doc(`${f.base}/produtos/P1`).get()).data(),
  receiptBefore=(await db.doc(`${f.root}/financeiro_livro/R1`).get()).data();
 const cmd=await write(f);assert.equal(cmd.state,'RECONCILED');
 const result=(await read(f)).reconciliation;
 assert.equal(result.verifiedReceived.minor,'450000');
 assert.equal(result.verifiedOpen.minor,'550000');
 assert.equal(result.installments[0].state,'PARTIALLY_PAID');
 assert.equal(result.eligibility.executable,false);
 assert.equal(result.financialExecution,'BLOCKED_B2');
 assert.deepEqual((await db.doc(`${f.base}/vendas/O001`).get()).data(),saleBefore);
 assert.deepEqual((await db.doc(`${f.base}/clientes/C1`).get()).data(),clientBefore);
 assert.deepEqual((await db.doc(`${f.base}/produtos/P1`).get()).data(),stockBefore);
 assert.deepEqual((await db.doc(`${f.root}/financeiro_livro/R1`).get()).data(),receiptBefore);
});
test('B2 V2 fingerprint invalidates snapshot if installment payment changes',async()=>{
 const f=await setup();await write(f);
 await db.doc(`${f.root}/financeiro_livro/R2`).update({valor:145000});
 const r=await read(f);
 assert.equal(r.stale,true);assert.equal(r.reconciliation.state,'STALE');
 const h=await service.reconciliationQuery(f.uid,f.token,{type:'history',adjustmentId:f.adjustmentId,revision:0});
 assert.equal(h.reconciliation.verifiedReceived.minor,'450000');
});
test('B2 V2 safe pagination checks more than 30 financial events',async()=>{
 const f=await setup();
 const batch=db.batch();
 for(let i=0;i<35;i++){
  const id='X'+String(i).padStart(3,'0');
  batch.set(db.doc(`${f.root}/financeiro_livro/${id}`),{
   id,lojaId:f.uid,referenciaId:'O001',clienteId:'C1',financeEventType:'RECEIPT',
   financeLinkVersion:1,valor:1,moeda:'PYG'});
 }
 await batch.commit();
 const cmd=await write(f);
 assert.equal(cmd.state,'RECONCILIATION_REQUIRED');
 const r=(await read(f)).reconciliation;
 assert.ok(r.sourceReadCount>30);
 assert.ok(r.issues.includes('LEGACY_LINK_UNVERIFIED'));
});
test('B2 preserves tenant privacy and operator restrictions',async()=>{
 const f=await setup(),other=await setup(),stock=await service.login(f.uid,{operatorId:'stock',pin:PIN});
 await assert.rejects(service.reconciliationQuery(other.uid,other.token,{type:'detail',adjustmentId:f.adjustmentId}),
  {code:'ADJUSTMENT_NOT_FOUND'});
 await assert.rejects(service.reconciliationCommand(f.uid,stock.sessionToken,{
  adjustmentId:f.adjustmentId,expectedRevision:0,key:randomUUID()}),{code:'FORBIDDEN'});
});
