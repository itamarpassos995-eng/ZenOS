import test from 'node:test';
import assert from 'node:assert/strict';
import {createDistributionOccurrence,transitionOccurrence,createFiscalAdjustmentDraft} from '../../src/core/distribution/phase31Foundation.js';
import {executeOccurrenceCommand} from '../../operational-functions/src/distribution/occurrences.js';

const time='2026-11-07T01:00:00.000Z';
const input=(extra={})=>({
 id:'occ1',tenantId:'tenant1',establishmentId:'store1',country:'PY',
 reason:'DELIVERY_SHORTAGE',description:'Duas unidades faltantes na entrega',
 quantity:2,refs:{saleId:'sale1',orderId:'order1',customerId:'client1',orderLineId:'1',productId:'p1',invoiceId:'invoice1'},
 originalAmount:{currency:'PYG',precision:0,minor:'200000'},reportedAt:time,reportedBy:'operator1',
 evidence:[{id:'ev1',kind:'PHOTO',reference:'private-proof-1'}],...extra
});
const event=(domain,next,revision,extra={})=>({domain,next,eventId:'evt'+(revision+1),actorId:'operator1',at:time,expectedRevision:revision,note:'Conferencia',...extra});
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);
function reviewed(country='PY') {
 let occ=createDistributionOccurrence(input({country,originalAmount:country==='BR'?{currency:'BRL',precision:2,minor:'20000'}:input().originalAmount}));
 occ=transitionOccurrence(occ,event('logistics','UNDER_REVIEW',0));
 occ=transitionOccurrence(occ,event('logistics','CONFIRMED',1));
 occ=transitionOccurrence(occ,event('fiscal','DRAFT',2));
 return occ;
}
test('occurrence preserves identifiers, original PYG amount and three independent states',()=>{
 const occ=createDistributionOccurrence(input());
 assert.equal(occ.states.logistics,'REPORTED');
 assert.equal(occ.states.fiscal,'NOT_REQUESTED');
 assert.equal(occ.states.financial,'NOT_REQUESTED');
 assert.deepEqual(occ.originalAmount,{currency:'PYG',precision:0,minor:'200000'});
 assert.equal(Object.isFrozen(occ),true);
 assert.equal(occ.refs.saleId,'sale1');
 assert.equal(occ.history.length,1);
});
test('rejects invalid currency precision, reason, quantity and source references',()=>{
 rejects(()=>createDistributionOccurrence(input({originalAmount:{currency:'PYG',precision:2,minor:'200000'}})),'INVALID_MONEY');
 rejects(()=>createDistributionOccurrence(input({reason:'OTHER'})),'INVALID_OCCURRENCE_REASON');
 rejects(()=>createDistributionOccurrence(input({quantity:0})),'INVALID_QUANTITY');
 rejects(()=>createDistributionOccurrence(input({refs:{saleId:'sale1'}})),'SOURCE_REFERENCE_REQUIRED');
});
test('logistics approval does not automatically create fiscal or financial approval',()=>{
 const occ=reviewed();
 assert.equal(occ.states.logistics,'CONFIRMED');
 assert.equal(occ.states.fiscal,'DRAFT');
 assert.equal(occ.states.financial,'NOT_REQUESTED');
 rejects(()=>transitionOccurrence(occ,event('financial','SETTLED',3)),'INVALID_TRANSITION');
 rejects(()=>transitionOccurrence(occ,event('fiscal','AUTHORIZED',3)),'INVALID_TRANSITION');
});
test('fiscal draft requires confirmed logistics and keeps real issuance blocked',()=>{
 const occ=createDistributionOccurrence(input());
 rejects(()=>createFiscalAdjustmentDraft(occ,{id:'draft1',type:'NOTA_CREDITO_ELECTRONICA',originalDocument:{id:'i',reference:'CDC1',country:'PY'},eventId:'f1',actorId:'operator1',at:time,expectedRevision:0}),'LOGISTICS_REVIEW_REQUIRED');
 const reviewedOcc=reviewed();
 const draft=createFiscalAdjustmentDraft(reviewedOcc,{
  id:'draft1',type:'NOTA_CREDITO_ELECTRONICA',
  originalDocument:{id:'invoice1',reference:'CDC-ORIGINAL',country:'PY'},
  eventId:'draft-event1',actorId:'operator1',at:time,expectedRevision:3
 });
 assert.equal(draft.fiscalDocuments[0].authorized,false);
 assert.equal(draft.fiscalDocuments[0].transmitted,false);
 assert.equal(draft.fiscalDocuments[0].status,'REVIEW_REQUIRED');
 assert.equal(draft.states.financial,'NOT_REQUESTED');
 assert.equal(draft.revision,4);
 rejects(()=>createFiscalAdjustmentDraft(reviewedOcc,{
  id:'draft2',type:'NFE_DEVOLUCAO',originalDocument:{id:'invoice1',reference:'CDC-ORIGINAL',country:'PY'},
  eventId:'draft-event2',actorId:'operator1',at:time,expectedRevision:3
 }),'FISCAL_TYPE_COUNTRY_MISMATCH');
});
test('Brazil document contract and country isolation, no fabricated legal eligibility',()=>{
 const occ=reviewed('BR');
 const next=createFiscalAdjustmentDraft(occ,{
  id:'br-draft',type:'NFE_NOTA_CREDITO',
  originalDocument:{id:'br-nfe',reference:'CHAVE-ORIGINAL',country:'BR'},
  eventId:'br-event',actorId:'operator1',at:time,expectedRevision:3,legalRuleRef:'PENDING_COUNTRY_RULE_VALIDATION'
 });
 assert.equal(next.fiscalDocuments[0].country,'BR');
 assert.equal(next.fiscalDocuments[0].eligibilityVerified,false);
 rejects(()=>createFiscalAdjustmentDraft(occ,{
  id:'bad',type:'NFE_DEVOLUCAO',originalDocument:{id:'br-nfe',reference:'CHAVE-ORIGINAL',country:'PY'},
  eventId:'bad-event',actorId:'operator1',at:time,expectedRevision:3
 }),'ORIGINAL_DOCUMENT_REQUIRED');
});
test('revision conflicts and duplicate event are rejected without mutation',()=>{
 const occ=createDistributionOccurrence(input());
 rejects(()=>transitionOccurrence(occ,event('logistics','UNDER_REVIEW',99)),'REVISION_CONFLICT');
 rejects(()=>transitionOccurrence(occ,event('logistics','UNDER_REVIEW',0,{eventId:'occ1'})),'DUPLICATE_EVENT');
 assert.equal(occ.revision,0);
});
function host() {
 let occurrence=null;const receipts=new Map();const events=[];let tail=Promise.resolve();
 return {events,get occurrence(){return occurrence;},
  transaction:async (scope,callback)=>{
   const next=tail.then(async()=>{
    const value=await callback({occurrence:occurrence?structuredClone(occurrence):null,receipt:receipts.get(scope.key)});
    if(!value.replay){occurrence=structuredClone(value.occurrence);receipts.set(scope.key,structuredClone(value.receipt));events.push(value.outbox);}
    return value.result;
   });tail=next.catch(()=>{});return next;
  }
 };
}
const auth=async()=>({tenantId:'tenant1',operatorId:'operator1',moduleEnabled:true,permissions:['distribution.occurrence.create']});
const command={tenantId:'tenant1',occurrenceId:'occ1',key:'unique1',type:'CREATE',expectedRevision:0,payload:input()};
test('server host contract idempotently persists one occurrence/event on repeated command',async()=>{
 const h=host();const run=()=>executeOccurrenceCommand({command,authorize:auth,transaction:h.transaction});
 const [a,b]=await Promise.all([run(),run()]);
 assert.deepEqual(a,b);assert.equal(h.events.length,1);assert.equal(h.occurrence.id,'occ1');
 await assert.rejects(()=>executeOccurrenceCommand({command:{...command,payload:input({quantity:3})},authorize:auth,transaction:h.transaction}),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('server contract fails closed on cross-tenant actor and missing permission',async()=>{
 const h=host();
 await assert.rejects(()=>executeOccurrenceCommand({command,authorize:async()=>({...await auth(),tenantId:'tenant2'}),transaction:h.transaction}),e=>e.code==='FORBIDDEN');
 await assert.rejects(()=>executeOccurrenceCommand({command,authorize:async()=>({...await auth(),permissions:[]}),transaction:h.transaction}),e=>e.code==='FORBIDDEN');
 assert.equal(h.events.length,0);
});
