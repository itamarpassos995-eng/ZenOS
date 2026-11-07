import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
import {setupTrip,planned,route,trip,signature} from './trip-fixture.mjs';
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
 const f=await setup('PY');await create(f);await create(f,{refs:{saleId:'O002',orderId:'O002',customerId:'C1',orderLineId:'0',productId:'P1'}});
 const now=Date.now();
 const page=await service.occurrenceQuery(f.uid,f.token,{type:'list',from:now-86400000,to:now+86400000,limit:1});
 assert.equal(page.items.length,1);assert.ok(page.next);
 const again=distributionService(db);
 const second=await again.occurrenceQuery(f.uid,f.token,{type:'list',from:now-86400000,to:now+86400000,limit:1,cursor:page.next});
 assert.equal(second.items.length,1);assert.notEqual(second.items[0].id,page.items[0].id);
});

test('A3 rejects simultaneous semantic duplicate facts even with unrelated command keys',async()=>{
 const f=await setup('PY');
 const first=createInput(f),second=createInput(f);
 first.payload.id=first.occurrenceId;second.payload.id=second.occurrenceId;
 const results=await Promise.allSettled([
  service.occurrenceCommand(f.uid,f.token,first),
  service.occurrenceCommand(f.uid,f.token,second)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(results.find(x=>x.status==='rejected').reason.code,'DUPLICATE_FACT');
 assert.equal((await db.collection(`${f.root}/distribution_occurrences`).get()).size,1);
 assert.equal((await db.collection(`${f.root}/distribution_occurrence_facts`).get()).size,1);
 assert.equal((await db.collection(`${f.root}/distribution_occurrence_receipts`).get()).size,1);
});
test('A3 accumulates only explicit continuation, enforces capacity and preserves prior claim',async()=>{
 const f=await setup('PY');
 const original=await create(f,{quantity:2});
 const continuation=createInput(f,{quantity:3,continuationOf:original.cmd.occurrenceId});
 continuation.payload.id=continuation.occurrenceId;
 await service.occurrenceCommand(f.uid,f.token,continuation);
 const excessive=createInput(f,{quantity:1,continuationOf:original.cmd.occurrenceId});
 excessive.payload.id=excessive.occurrenceId;
 await assert.rejects(service.occurrenceCommand(f.uid,f.token,excessive),{code:'FACT_CAPACITY_EXCEEDED'});
 const facts=await db.collection(`${f.root}/distribution_occurrence_facts`).get();
 assert.equal(facts.docs[0].data().active,5);
 assert.equal(Object.keys(facts.docs[0].data().claims).length,2);
});
test('A3 dismissal releases a claim atomically without erasing audit history',async()=>{
 const f=await setup('PY');const created=await create(f,{quantity:2});
 const oldId=created.cmd.occurrenceId;
 const discarded=await next(f,{occurrenceId:oldId,revision:0},'TRANSITION_LOGISTICS','DISMISSED');
 assert.equal(discarded.states.logistics,'DISMISSED');
 const replacement=await create(f,{quantity:3});
 assert.equal(replacement.result.revision,0);
 const facts=await db.collection(`${f.root}/distribution_occurrence_facts`).get();
 assert.equal(facts.docs[0].data().active,3);
 assert.equal(facts.docs[0].data().claims[oldId].state,'RELEASED');
 assert.equal((await detail(f,oldId)).occurrence.states.logistics,'DISMISSED');
 assert.equal((await db.collection(`${f.root}/distribution_occurrence_events`).get()).size,3);
});
test('A3 blocks arbitrary private evidence references and fabricated trip proofs',async()=>{
 const f=await setup('PY');
 const arbitrary=createInput(f,{evidence:[{id:'e1',kind:'PHOTO',reference:'another-store/private.jpg'}]});
 arbitrary.payload.id=arbitrary.occurrenceId;
 await assert.rejects(service.occurrenceCommand(f.uid,f.token,arbitrary),{code:'EVIDENCE_UPLOAD_NOT_CONFIGURED'});
 const forged=createInput(f,{refs:{saleId:'O001',orderId:'O001',customerId:'C1',
  orderLineId:'0',productId:'P1',tripId:'fake-trip'}});
 forged.payload.id=forged.occurrenceId;
 await assert.rejects(service.occurrenceCommand(f.uid,f.token,forged),{code:'TRIP_SOURCE_MISMATCH'});
 assert.equal((await db.collection(`${f.root}/distribution_occurrences`).get()).size,0);
});

test('A3 dedicated fiscal reviewer can only prepare fiscal draft, not create logistical occurrence',async()=>{
 const f=await setup('PY'),operatorRef=db.doc(`${f.base}/operadores/stock`);
 await operatorRef.update({'data.permissoes':{distributionFiscalReview:true}});
 const fiscal=await service.login(f.uid,{operatorId:'stock',pin:PIN,scope:'trip'});
 await db.doc(`${f.base}/vendas/O001`).update({'data.fiscalOriginal':{id:'INV1',country:'PY',reference:'CDC-FAKE-TEST-ONLY',status:'autorizado'}});
 const created=await create(f);
 let state=await next(f,{occurrenceId:created.cmd.occurrenceId,revision:0},'TRANSITION_LOGISTICS','UNDER_REVIEW');
 state=await next(f,{occurrenceId:created.cmd.occurrenceId,revision:state.revision},'TRANSITION_LOGISTICS','CONFIRMED');
 const detailRead=await service.occurrenceQuery(f.uid,fiscal.sessionToken,{type:'detail',occurrenceId:created.cmd.occurrenceId});
 assert.equal(detailRead.occurrence.states.logistics,'CONFIRMED');
 state=await service.occurrenceCommand(f.uid,fiscal.sessionToken,{
  type:'TRANSITION_FISCAL',occurrenceId:created.cmd.occurrenceId,
  expectedRevision:state.revision,key:randomUUID(),
  payload:{next:'DRAFT',eventId:'EV-'+randomUUID(),note:'Revisão fiscal'}});
 const drafted=await draft({...f,token:fiscal.sessionToken},{
  occurrenceId:created.cmd.occurrenceId,revision:state.revision},'NOTA_CREDITO_ELECTRONICA');
 assert.equal(drafted.states.fiscal,'REVIEW_REQUIRED');
 const cmd=createInput(f);cmd.payload.id=cmd.occurrenceId;
 await assert.rejects(service.occurrenceCommand(f.uid,fiscal.sessionToken,cmd),{code:'FORBIDDEN'});
 await assert.rejects(service.occurrenceEvidenceUpload(f.uid,fiscal.sessionToken,{
  occurrenceId:created.cmd.occurrenceId,id:'E1',key:randomUUID(),expectedRevision:state.revision,
  kind:'PHOTO',mediaType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/LysAAAAASUVORK5CYII='
 }),{code:'FORBIDDEN'});
});
test('A3 operator permission changes invalidate privileged commands',async()=>{
 const f=await setup('PY');const created=await create(f);
 const operatorRef=db.doc(`${f.base}/operadores/admin`);
 await operatorRef.update({'data.pinTrocaObrigatoria':true});
 await assert.rejects(service.occurrenceQuery(f.uid,f.token,{type:'detail',occurrenceId:created.cmd.occurrenceId}),{code:'FORBIDDEN'});
 const cmd=createInput(f);cmd.payload.id=cmd.occurrenceId;
 await assert.rejects(service.occurrenceCommand(f.uid,f.token,cmd),{code:'FORBIDDEN'});
});

test('A3 trip-bound shortage uses actual signed delivery proof as immutable fact origin',async()=>{
 const f=await setupTrip({stock:100,orders:1});
 await db.doc(`${f.root}/distribution_config/module`).update({fiscalCountry:'PY'});
 await planned(f,['O001']);
 await route(f,'driver','START','T1',1);
 await route(f,'driver','DELIVER','T1',2,{
  stopId:'O001',quantities:[3],outcome:'PARTIAL',receiver:'Recebedor teste',
  identification:'TEST-ID',signature,note:'Faltaram duas unidades no destino',condition:'GOOD'
 });
 const t=(await trip(f)).trip,stop=t.stops[0];
 assert.equal(stop.lines[0].returning,2);
 const cmd=createInput(f,{quantity:2,proofId:stop.proofId,
  refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',
   productId:'P1',tripId:'T1'}});
 cmd.payload.id=cmd.occurrenceId;
 const recorded=await service.occurrenceCommand(f.uid,f.manager.sessionToken,cmd);
 assert.equal(recorded.revision,0);
 const saved=(await service.occurrenceQuery(f.uid,f.manager.sessionToken,{
  type:'detail',occurrenceId:cmd.occurrenceId})).occurrence;
 assert.equal(saved.sourceKind,'TRIP');
 assert.equal(saved.sourceProofId,stop.proofId);
 assert.equal(saved.refs.tripId,'T1');
 const repeat=createInput(f,{quantity:1,proofId:stop.proofId,
  refs:{saleId:'O001',orderId:'O001',customerId:'C1',orderLineId:'0',
   productId:'P1',tripId:'T1'}});
 repeat.payload.id=repeat.occurrenceId;
 await assert.rejects(service.occurrenceCommand(f.uid,f.manager.sessionToken,repeat),{code:'DUPLICATE_FACT'});
 const other=await setup('PY');
 await assert.rejects(service.occurrenceQuery(other.uid,other.token,{
  type:'detail',occurrenceId:cmd.occurrenceId}),{code:'OCCURRENCE_NOT_FOUND'});
});
