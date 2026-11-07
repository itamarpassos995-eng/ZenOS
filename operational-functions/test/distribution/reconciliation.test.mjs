import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
const service=distributionService(db);
async function setup(){
 const f=await seed('distribution-b1-'+randomUUID().slice(0,8),{orders:1});
 await db.doc(`${f.root}/distribution_config/module`).update({fiscalCountry:'PY'});
 const admin=await service.login(f.uid,{operatorId:'admin',pin:PIN});
 const o='OCC-'+randomUUID();
 await service.occurrenceCommand(f.uid,admin.sessionToken,{type:'CREATE',key:randomUUID(),occurrenceId:o,
 expectedRevision:0,payload:{id:o,reason:'DELIVERY_SHORTAGE',quantity:3,description:'Auditoria financeira sintética',
 refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',productId:'P1'}}});
 for(const [next,rev] of [['UNDER_REVIEW',0],['CONFIRMED',1]])
  await service.occurrenceCommand(f.uid,admin.sessionToken,{type:'TRANSITION_LOGISTICS',key:randomUUID(),
  occurrenceId:o,expectedRevision:rev,payload:{next,eventId:'EV-'+randomUUID(),note:'Conferência teste'}});
 const a='ADJ-'+randomUUID();
 await service.adjustmentCommand(f.uid,admin.sessionToken,{type:'CREATE',id:a,occurrenceId:o,
  expectedRevision:0,key:randomUUID(),payload:{type:'SHORTAGE',quantity:2}});
 return {...f,token:admin.sessionToken,adjustmentId:a};
}
async function settlement(f,{state='liquidado',confirmed=true,currency='PYG'}={}){
 await db.doc(`${f.base}/vendas/O001`).update({'data.tipoDocumento':'venda',
  'data.estado':'concluida','data.pagamentos':[{id:'PAY1',formaId:'dinheiro_pyg',
   moedaOrigem:currency,valorOriginal:currency==='PYG'?199950:150}]});
 await db.doc(`${f.base}/financeiro_livro/LED1`).set({
  id:'LED1',lojaId:f.uid,referenciaId:'O001',clienteId:'C1',tipo:'recebimento_venda',
  paymentId:'PAY1',moeda:currency,valor:currency==='PYG'?199950:150,
  status:state,liquidacaoConfirmada:confirmed,comprovanteId:confirmed?'RECEIPT-SYNTHETIC':null});
}
async function command(f,key=randomUUID()){return service.reconciliationCommand(f.uid,f.token,{
 adjustmentId:f.adjustmentId,expectedRevision:0,key});}
async function read(f){return service.reconciliationQuery(f.uid,f.token,{
 type:'detail',adjustmentId:f.adjustmentId});}
test('B1 matches explicit settled source, snapshots receipt and preserves all financial source records',async()=>{
 const f=await setup();await settlement(f);
 const [origSale,origLedger,origClient,origProduct]=await Promise.all([
  db.doc(`${f.base}/vendas/O001`).get(),db.doc(`${f.base}/financeiro_livro/LED1`).get(),
  db.doc(`${f.base}/clientes/C1`).get(),db.doc(`${f.base}/produtos/P1`).get()]);
 const cmd=await command(f);assert.equal(cmd.state,'RECONCILED');
 const data=(await read(f)).reconciliation;
 assert.equal(data.verifiedReceived.minor,'199950');
 assert.equal(data.verifiedOpen.minor,'0');
 assert.equal(data.adjustmentAmount.minor,'79980');
 assert.equal(data.financialExecution,'BLOCKED_B1');
 const [sale,ledger,client,product]=await Promise.all([
  db.doc(`${f.base}/vendas/O001`).get(),db.doc(`${f.base}/financeiro_livro/LED1`).get(),
  db.doc(`${f.base}/clientes/C1`).get(),db.doc(`${f.base}/produtos/P1`).get()]);
 assert.deepEqual(sale.data(),origSale.data());assert.deepEqual(ledger.data(),origLedger.data());
 assert.deepEqual(client.data(),origClient.data());assert.deepEqual(product.data(),origProduct.data());
 assert.equal((await db.collection(`${f.root}/distribution_reconciliations`).get()).size,1);
 assert.equal((await db.collection(`${f.root}/distribution_reconciliation_history`).get()).size,1);
});
test('B1 refuses to classify card authorization as settled, blocks unverified credit debt',async()=>{
 const f=await setup();await settlement(f,{state:'autorizado',confirmed:false});
 assert.equal((await command(f)).state,'EXTERNAL_SETTLEMENT_PENDING');
 const g=await setup();await db.doc(`${g.base}/vendas/O001`).update({
  'data.tipoDocumento':'venda','data.estado':'concluida',
  'data.pagamentos':[{id:'PAY1',formaId:'crediario',moedaOrigem:'PYG',valorOriginal:199950}]});
 await db.doc(`${g.base}/financeiro_livro/LED1`).set({
  id:'LED1',lojaId:g.uid,referenciaId:'O001',clienteId:'C1',paymentId:'PAY1',
  tipo:'venda_fiada',moeda:'PYG',valor:199950,status:'aberto'});
 assert.equal((await command(g)).state,'RECONCILIATION_REQUIRED');
 assert.equal((await read(g)).reconciliation.verifiedOpen,null);
});
test('B1 marks persisted reconciliation STALE after payment mutation, with history retained',async()=>{
 const f=await setup();await settlement(f);await command(f);
 await db.doc(`${f.base}/financeiro_livro/LED1`).update({status:'estornado'});
 const data=await read(f);assert.equal(data.stale,true);
 assert.equal(data.reconciliation.state,'STALE');
 assert.ok(data.reconciliation.issues.includes('SOURCE_CHANGED'));
 const history=await service.reconciliationQuery(f.uid,f.token,{type:'history',
  adjustmentId:f.adjustmentId,revision:0});
 assert.equal(history.reconciliation.state,'RECONCILED');
});
test('B1 idempotent concurrency, tenant isolation and financial permissions',async()=>{
 const f=await setup();await settlement(f);
 const key=randomUUID(),[a,b]=await Promise.all([command(f,key),command(f,key)]);
 assert.equal(a.revision,b.revision);
 const original=await command(f,key);assert.equal(original.replayed,true);
 const another=await setup();
 await assert.rejects(service.reconciliationQuery(another.uid,another.token,{
  type:'detail',adjustmentId:f.adjustmentId}),{code:'ADJUSTMENT_NOT_FOUND'});
 const stock=await service.login(f.uid,{operatorId:'stock',pin:PIN});
 await assert.rejects(service.reconciliationQuery(f.uid,stock.sessionToken,{
  type:'detail',adjustmentId:f.adjustmentId}),{code:'FORBIDDEN'});
});
test('B1 rejects frontend monetary overrides and never trusts synthetic amounts from clients',async()=>{
 const f=await setup();
 await assert.rejects(service.reconciliationCommand(f.uid,f.token,{
  adjustmentId:f.adjustmentId,expectedRevision:0,key:randomUUID(),received:9999999}),
  {code:'RECONCILIATION_COMMAND_INVALID'});
});
