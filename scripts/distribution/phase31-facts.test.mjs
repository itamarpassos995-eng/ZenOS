import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFact,reserveFact,releaseFact} from '../../operational-functions/src/distribution/occurrenceFacts.js';
const at='2026-11-07T01:00:00.000Z',actorId='admin';
const origin={tenantId:'distribution-one',establishmentId:'store1',saleId:'O001',lineIndex:0};
const claim=(id,quantity,continuationOf=null)=>({
 factId:'fact001',occurrenceId:id,quantity,capacity:3,continuationOf,actorId,at
});
test('A3 fact identity uses trusted sale, item and delivery proof rather than reason, amount or date',()=>{
 assert.equal(sourceFact(origin),sourceFact({...origin}));
 assert.notEqual(sourceFact(origin),sourceFact({...origin,saleId:'O002'}));
 assert.notEqual(sourceFact(origin),sourceFact({...origin,tenantId:'other-company'}));
 assert.notEqual(sourceFact({...origin,kind:'TRIP',tripId:'T1',proofId:'P1'}),
  sourceFact({...origin,kind:'TRIP',tripId:'T1',proofId:'P2'}));
 assert.throws(()=>sourceFact({...origin,kind:'TRIP',tripId:'T1'}),{code:'PROOF_REQUIRED'});
});
test('A3 semantic lock rejects new independent ID, allows explicit 2+1 continuation, forbids overclaim',()=>{
 const first=reserveFact(null,claim('occ1',2));
 assert.equal(first.active,2);
 assert.throws(()=>reserveFact(first,claim('occ2',1)),{code:'DUPLICATE_FACT'});
 const second=reserveFact(first,claim('occ2',1,'occ1'));
 assert.equal(second.active,3);
 assert.throws(()=>reserveFact(second,claim('occ3',1,'occ1')),{code:'FACT_CAPACITY_EXCEEDED'});
 assert.equal(first.active,2);
});
test('A3 dismissed claim frees capacity without deleting audit',()=>{
 const first=reserveFact(null,claim('occ1',2));
 const dismissed=releaseFact(first,{occurrenceId:'occ1',actorId,at});
 assert.equal(dismissed.active,0);
 assert.equal(dismissed.claims.occ1.state,'RELEASED');
 const next=reserveFact(dismissed,claim('occ2',3));
 assert.equal(next.active,3);
 assert.equal(Object.keys(next.claims).length,2);
 assert.throws(()=>releaseFact(next,{occurrenceId:'occ1',actorId,at}),{code:'FACT_CLAIM_NOT_ACTIVE'});
});
test('A3 refuses corrupted source capacity and foreign claim ID',()=>{
 const first=reserveFact(null,claim('occ1',2));
 assert.throws(()=>reserveFact(first,{...claim('occ2',1,'occ1'),capacity:5}),{code:'FACT_SOURCE_CHANGED'});
 assert.throws(()=>reserveFact(first,claim('occ1',1,'occ1')),{code:'DUPLICATE_FACT'});
 assert.throws(()=>reserveFact(null,{...claim('occ4',1),factId:'../bad'}),{code:'INVALID_FACT_CLAIM'});
});
