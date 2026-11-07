import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
const service=distributionService(db);
const setup=async country=>{
 const f=await seed('distribution-b-'+randomUUID().slice(0,9),{orders:2});
 await db.doc(`${f.root}/distribution_config/module`).update({fiscalCountry:country});
 const session=await service.login(f.uid,{operatorId:'admin',pin:PIN});
 const stock=(await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque;
 return {...f,session:session.sessionToken,stock};
};
async function occurrence(f,{quantity=3,country='PY',saleId='O001'}={}){
 if(country==='BR')await db.doc(`${f.base}/vendas/${saleId}`).update({
  'data.moedaDocumento':'BRL','data.totalOriginal':150});
 const occId='OCC-'+randomUUID();
 await service.occurrenceCommand(f.uid,f.session,{type:'CREATE',key:randomUUID(),occurrenceId:occId,
  expectedRevision:0,payload:{id:occId,reason:'DELIVERY_SHORTAGE',quantity,
   description:'Falta comprovada na entrega sintética',
   refs:{saleId,orderId:saleId,customerId:'C1',orderLineId:'0',productId:'P1'}}});
 for(const [next,expectedRevision] of [['UNDER_REVIEW',0],['CONFIRMED',1]])
  await service.occurrenceCommand(f.uid,f.session,{type:'TRANSITION_LOGISTICS',key:randomUUID(),
   occurrenceId:occId,expectedRevision,payload:{next,eventId:'EV-'+randomUUID(),note:'Conferência de teste'}});
 return occId;
}
function create(f,occId,extra={}){
 const id='ADJ-'+randomUUID(),key=randomUUID();
 return {id,key,occurrenceId:occId,type:'CREATE',expectedRevision:0,
  payload:{type:'PARTIAL_RETURN',quantity:2,fiscalCandidate:'NOTA_CREDITO_ELECTRONICA',...extra}};
}
const invoke=(f,cmd)=>service.adjustmentCommand(f.uid,f.session,cmd);
const read=(f,id)=>service.adjustmentQuery(f.uid,f.session,{type:'detail',id});
test('B creates PY original-currency proposal with reserved quantity, unchanged stock and accounts',async()=>{
 const f=await setup('PY'),occ=await occurrence(f);
 const beforeSale=(await db.doc(`${f.base}/vendas/O001`).get()).data();
 const beforeClient=(await db.doc(`${f.base}/clientes/C1`).get()).data();
 const cmd=create(f,occ),created=await invoke(f,cmd);
 assert.equal(created.status,'DRAFT');
 const doc=(await read(f,cmd.id)).adjustment;
 assert.deepEqual(doc.value,{currency:'PYG',precision:0,minor:'79980'});
 assert.equal(doc.saleDocumentTotal.minor,'199950');
 assert.equal(doc.financialPreview.state,'RECONCILIATION_REQUIRED');
 assert.equal(doc.fiscalDocument.authorized,false);
 assert.equal(doc.fiscalEligibility,'LEGAL_REVIEW_REQUIRED');
 assert.equal(doc.originalPriceBRL,'30');
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,f.stock);
 assert.deepEqual((await db.doc(`${f.base}/clientes/C1`).get()).data(),beforeClient);
 assert.deepEqual((await db.doc(`${f.base}/vendas/O001`).get()).data(),beforeSale);
 assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,0);
 const replay=await invoke(f,cmd);assert.equal(replay.replayed,true);
 await assert.rejects(invoke(f,{...cmd,payload:{...cmd.payload,quantity:1}}),{code:'IDEMPOTENCY_CONFLICT'});
});
test('B limits total active adjustments, allows released capacity, rejects duplicates',async()=>{
 const f=await setup('PY'),occ=await occurrence(f,{quantity:3});
 const a=create(f,occ),b=create(f,occ,{quantity:1});
 const first=await invoke(f,a);assert.equal(first.revision,0);
 await invoke(f,b);
 const impossible=create(f,occ,{quantity:1});
 await assert.rejects(invoke(f,impossible),{code:'ADJUSTMENT_QUANTITY_EXCEEDED'});
 const conflict=create(f,occ,{quantity:1});
 const both=await Promise.allSettled([invoke(f,impossible),invoke(f,conflict)]);
 assert.equal(both.filter(x=>x.status==='fulfilled').length,0);
 const reject=await invoke(f,{id:a.id,occurrenceId:occ,type:'TRANSITION_COMMERCIAL',
  expectedRevision:0,key:randomUUID(),
  payload:{eventId:'EV-'+randomUUID(),next:'CANCELLED',reason:'Rascunho cancelado pelo gestor'}});
 assert.equal(reject.status,'CANCELLED');assert.equal(reject.reserved,false);
 const newDraft=create(f,occ,{quantity:2});await invoke(f,newDraft);
 const locks=await db.collection(`${f.root}/distribution_adjustment_reservations`).get();
 assert.equal(locks.docs[0].data().active,3);
 assert.equal((await read(f,a.id)).adjustment.status,'CANCELLED');
});
test('B forbids across-country fiscal candidates, fabricated values and unauthorized sessions',async()=>{
 const f=await setup('BR'),occ=await occurrence(f,{country:'BR'});
 const cmd=create(f,occ);
 await assert.rejects(invoke(f,cmd),{code:'FISCAL_TYPE_COUNTRY_MISMATCH'});
 await assert.rejects(invoke(f,{...cmd,key:randomUUID(),payload:{type:'PARTIAL_RETURN',quantity:2,amount:1}}),
 {code:'CLIENT_SOURCE_FORBIDDEN'});
 const onlyStock=await service.login(f.uid,{operatorId:'stock',pin:PIN});
 await assert.rejects(service.adjustmentCommand(f.uid,onlyStock.sessionToken,{
  ...cmd,key:randomUUID(),payload:{type:'PARTIAL_RETURN',quantity:2}}),{code:'FORBIDDEN'});
 const valid=create(f,occ,{fiscalCandidate:'NFE_DEVOLUCAO'});
 await invoke(f,valid);
 const saved=(await read(f,valid.id)).adjustment;
 assert.equal(saved.country,'BR');assert.equal(saved.value.currency,'BRL');
 assert.equal(saved.value.minor,'6000');assert.equal(saved.fiscalDocument.transmitted,false);
});
test('B preserves immutable representation versions and blocks false fiscal authorization',async()=>{
 const f=await setup('PY'),occ=await occurrence(f);
 const cmd=create(f,occ);await invoke(f,cmd);
 const original=await service.adjustmentQuery(f.uid,f.session,{type:'representation',id:cmd.id,revision:0});
 assert.match(original.representation.warning,/SEM VALIDADE FISCAL/);
 const old=structuredClone(original.representation);
 let revision=0;
 for(const next of ['COMMERCIAL_REVIEW','FISCAL_REVIEW','LEGAL_REVIEW_REQUIRED']){
  const type=next==='LEGAL_REVIEW_REQUIRED'?'TRANSITION_FISCAL':'TRANSITION_COMMERCIAL';
  const result=await invoke(f,{id:cmd.id,occurrenceId:occ,type,expectedRevision:revision,
   key:randomUUID(),payload:{next,eventId:'EV-'+randomUUID(),reason:'Conferido para revisão em homologação'}});
  revision=result.revision;
 }
 assert.equal((await read(f,cmd.id)).adjustment.status,'LEGAL_REVIEW_REQUIRED');
 const historical=await service.adjustmentQuery(f.uid,f.session,{type:'representation',id:cmd.id,revision:0});
 assert.deepEqual(historical.representation,old);
 await assert.rejects(invoke(f,{id:cmd.id,occurrenceId:occ,type:'TRANSITION_FISCAL',
  expectedRevision:revision,key:randomUUID(),payload:{next:'INTERNALLY_REVIEWED',
   eventId:'EV-'+randomUUID(),reason:'Forçar aprovação sem parecer'}}),{code:'ADJUSTMENT_TRANSITION_FORBIDDEN'});
});
test('B isolates stores, rejects unconfirmed occurrence and respects optimistic revision',async()=>{
 const f=await setup('PY'),other=await setup('PY'),occ=await occurrence(f);
 const cmd=create(f,occ);
 await assert.rejects(invoke(other,cmd),{code:'OCCURRENCE_NOT_FOUND'});
 await invoke(f,cmd);
 await assert.rejects(invoke(f,{id:cmd.id,occurrenceId:occ,type:'TRANSITION_COMMERCIAL',
  expectedRevision:99,key:randomUUID(),payload:{next:'COMMERCIAL_REVIEW',
   eventId:'EV-'+randomUUID(),reason:'Revisão com versão antiga'}}),{code:'REVISION_CONFLICT'});
 await assert.rejects(service.adjustmentQuery(other.uid,other.session,{type:'detail',id:cmd.id}),
 {code:'ADJUSTMENT_NOT_FOUND'});
});

test('B protects a sale line across two distinct legitimate occurrence facts',async()=>{
 const f=await setup('PY');
 const shortage=await occurrence(f,{quantity:3});
 const mismatchId='OCC-'+randomUUID();
 await service.occurrenceCommand(f.uid,f.session,{type:'CREATE',key:randomUUID(),
  occurrenceId:mismatchId,expectedRevision:0,payload:{id:mismatchId,
   reason:'INVOICE_DELIVERY_MISMATCH',quantity:3,description:'Diferença documental sintética',
   refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',productId:'P1'}}});
 for(const [next,revision] of [['UNDER_REVIEW',0],['CONFIRMED',1]]){
  await service.occurrenceCommand(f.uid,f.session,{type:'TRANSITION_LOGISTICS',key:randomUUID(),
   occurrenceId:mismatchId,expectedRevision:revision,
   payload:{next,eventId:'EV-'+randomUUID(),note:'Conferência sintética'}});
 }
 const first=create(f,shortage,{quantity:3});await invoke(f,first);
 const second=create(f,mismatchId,{type:'INVOICE_DELIVERY_MISMATCH',quantity:3});
 await assert.rejects(invoke(f,second),{code:'SALE_LINE_ADJUSTMENT_EXCEEDED'});
 const line=await db.collection(`${f.root}/distribution_adjustment_sale_lines`).get();
 assert.equal(line.size,1);
 assert.equal(line.docs[0].data().active,3);
});
