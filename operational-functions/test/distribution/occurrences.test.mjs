import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
const service=distributionService(db);
const setup=async country=>{
 const f=await seed('distribution-occ-'+randomUUID().slice(0,8),{stock:100,orders:2});
 await db.doc(`${f.root}/distribution_config/module`).update({fiscalCountry:country});
 const session=await service.login(f.uid,{operatorId:'admin',pin:PIN});
 return {...f,token:session.sessionToken};
};
const createInput=(o,extra={})=>({
 type:'CREATE',occurrenceId:'OCC-'+randomUUID(),expectedRevision:0,key:randomUUID(),
 payload:{id:null,reason:'DELIVERY_SHORTAGE',quantity:2,description:'Duas unidades não entregues',
  refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',productId:'P1'},...extra}
});
async function create(f,extra={}){const cmd=createInput(f,extra);cmd.payload.id=cmd.occurrenceId;
 const result=await service.occurrenceCommand(f.uid,f.token,cmd);
 return {cmd,result};}
const next=(f,o,type,next)=>service.occurrenceCommand(f.uid,f.token,{
 type,occurrenceId:o.occurrenceId,expectedRevision:o.revision,key:randomUUID(),
 payload:{next,eventId:'EV-'+randomUUID(),note:'Conferência de homologação'}
});
const draft=(f,o,type)=>service.occurrenceCommand(f.uid,f.token,{
 type:'DRAFT_FISCAL',occurrenceId:o.occurrenceId,expectedRevision:o.revision,
 key:randomUUID(),payload:{id:'DF-'+randomUUID(),type,eventId:'EV-'+randomUUID()}
});
const detail=(f,id)=>service.occurrenceQuery(f.uid,f.token,{type:'detail',occurrenceId:id});
test('V2 creates bounded occurrence with server-derived PYG amount, receipts, immutable event, zero stock/ledger effects',async()=>{
 const f=await setup('PY');const sale=(await db.doc(`${f.base}/vendas/O001`).get()).data().data;
 const before=(await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque;
 const {cmd,result}=await create(f);
 assert.equal(result.revision,0);const data=(await detail(f,cmd.occurrenceId)).occurrence;
 assert.equal(data.tenantId,f.uid);assert.equal(data.country,'PY');
 assert.equal(data.originalAmount.minor,'79980');assert.equal(data.originalAmount.currency,'PYG');
 assert.equal(data.states.fiscal,'NOT_REQUESTED');assert.equal(data.states.financial,'NOT_REQUESTED');
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,before);
 assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,0);
 assert.equal((await db.collection(`${f.root}/distribution_occurrence_events`).get()).size,1);
 assert.equal((await db.collection(`${f.root}/distribution_outbox`).get()).size,1);
 assert.equal((await db.doc(`${f.base}/vendas/O001`).get()).data().data.totalOriginal,sale.totalOriginal);
 const again=await service.occurrenceCommand(f.uid,f.token,cmd);assert.equal(again.replayed,true);
 await assert.rejects(service.occurrenceCommand(f.uid,f.token,{...cmd,payload:{...cmd.payload,quantity:3}}),{code:'IDEMPOTENCY_CONFLICT'});
});
test('V2 sequence, old revisions and unauthorized operator are rejected',async()=>{
 const f=await setup('PY');const {cmd,result}=await create(f);
 const event={type:'TRANSITION_LOGISTICS',occurrenceId:cmd.occurrenceId,expectedRevision:result.revision,key:randomUUID(),
 payload:{next:'UNDER_REVIEW',eventId:'EV-'+randomUUID(),note:'Conferência'}};
 const [a,b]=await Promise.allSettled([service.occurrenceCommand(f.uid,f.token,event),
  service.occurrenceCommand(f.uid,f.token,{...event,key:randomUUID(),payload:{...event.payload,eventId:'EV-'+randomUUID()}})]);
 assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);
 assert.equal([a,b].find(x=>x.status==='rejected').reason.code,'REVISION_CONFLICT');
 const stock=await service.login(f.uid,{operatorId:'stock',pin:PIN});
 await assert.rejects(service.occurrenceCommand(f.uid,stock.sessionToken,{...event,key:randomUUID()}),{code:'FORBIDDEN'});
});
test('source mismatches, excess quantities and cross-tenant sessions fail closed',async()=>{
 const f=await setup('PY'),other=await setup('PY');
 for(const extra of [{quantity:6},{refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',productId:'alien'}},
  {refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',productId:'P1',invoiceId:'invented'}}]){
  const command=createInput(f,extra);command.payload.id=command.occurrenceId;
  await assert.rejects(service.occurrenceCommand(f.uid,f.token,command));
 }
 const command=createInput(f);command.payload.id=command.occurrenceId;
 await assert.rejects(service.occurrenceCommand(other.uid,f.token,command));
});
test('BR and PY fiscal drafts require verified server references and remain pending without financial movement',async()=>{
 for(const country of ['BR','PY']){
  const f=await setup(country);
  if(country==='BR')await db.doc(`${f.base}/vendas/O001`).update({'data.moedaDocumento':'BRL','data.totalOriginal':150});
  await db.doc(`${f.base}/vendas/O001`).update({'data.fiscalOriginal':{id:'INV1',country,reference:'OFFICIAL-REFERENCE-SYNTHETIC',status:'autorizado'}});
  const {cmd,result}=await create(f);
  let state=await next(f,{occurrenceId:cmd.occurrenceId,revision:result.revision},'TRANSITION_LOGISTICS','UNDER_REVIEW');
  state=await next(f,{occurrenceId:cmd.occurrenceId,revision:state.revision},'TRANSITION_LOGISTICS','CONFIRMED');
  state=await next(f,{occurrenceId:cmd.occurrenceId,revision:state.revision},'TRANSITION_FISCAL','DRAFT');
  state=await draft(f,{occurrenceId:cmd.occurrenceId,revision:state.revision},
   country==='PY'?'NOTA_CREDITO_ELECTRONICA':'NFE_DEVOLUCAO');
  const saved=(await detail(f,cmd.occurrenceId)).occurrence;
  assert.equal(saved.states.fiscal,'REVIEW_REQUIRED');
  assert.equal(saved.states.financial,'NOT_REQUESTED');
  assert.equal(saved.fiscalDocuments.length,1);
  assert.equal(saved.fiscalDocuments[0].authorized,false);
  assert.equal(saved.fiscalDocuments[0].transmitted,false);
  assert.equal(saved.fiscalDocuments[0].eligibilityVerified,false);
  assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,0);
  assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,100);
  await assert.rejects(draft(f,{occurrenceId:cmd.occurrenceId,revision:state.revision},
   country==='PY'?'NFE_DEVOLUCAO':'NOTA_CREDITO_ELECTRONICA'),{code:'FISCAL_TYPE_COUNTRY_MISMATCH'});
 }
});
test('missing verified original fiscal document blocks draft while retaining occurrence',async()=>{
 const f=await setup('PY');const {cmd,result}=await create(f);
 let o=await next(f,{occurrenceId:cmd.occurrenceId,revision:result.revision},'TRANSITION_LOGISTICS','UNDER_REVIEW');
 o=await next(f,{occurrenceId:cmd.occurrenceId,revision:o.revision},'TRANSITION_LOGISTICS','CONFIRMED');
 o=await next(f,{occurrenceId:cmd.occurrenceId,revision:o.revision},'TRANSITION_FISCAL','DRAFT');
 await assert.rejects(draft(f,{occurrenceId:cmd.occurrenceId,revision:o.revision},'NOTA_CREDITO_ELECTRONICA'),{code:'FISCAL_SOURCE_NOT_VERIFIED'});
});
test('query paginates within the tenant and survives service recreation',async()=>{
 const f=await setup('PY');await create(f);await create(f);
 const now=Date.now();
 const page=await service.occurrenceQuery(f.uid,f.token,{type:'list',from:now-86400000,to:now+86400000,limit:1});
 assert.equal(page.items.length,1);assert.ok(page.next);
 const again=distributionService(db);
 const second=await again.occurrenceQuery(f.uid,f.token,{type:'list',from:now-86400000,to:now+86400000,limit:1,cursor:page.next});
 assert.equal(second.items.length,1);assert.notEqual(second.items[0].id,page.items[0].id);
});
