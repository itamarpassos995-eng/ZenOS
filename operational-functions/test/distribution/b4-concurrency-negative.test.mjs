// G5 additional races for *existing* trip and returns transaction engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setupTrip,planned,route,trip,db} from './trip-fixture.mjs';
import {signature} from './trip-fixture.mjs';
test('G5 two different simultaneous returns cannot both commit to same trip revision',async()=>{
 const f=await setupTrip({orders:1,stock:10});await planned(f,['O001']);
 await route(f,'driver','START','T1',1);
 await route(f,'driver','DELIVER','T1',2,{stopId:'O001',quantities:[3],
  outcome:'PARTIAL',receiver:'Test receiver',identification:'TEST',signature,
  condition:'GOOD',note:'Partial delivery'});
 const before=(await trip(f)).trip, line=before.stops[0].lines[0];
 const attempt=()=>route(f,'driver','CUSTOMER_RETURN','T1',3,{
  stopId:'O001',lineId:line.id,quantity:2,condition:'GOOD',
  note:'Synthetic customer return'},randomUUID());
 const settled=await Promise.allSettled([attempt(),attempt()]);
 assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(settled.filter(x=>x.status==='rejected').length,1);
 assert.equal(settled.find(x=>x.status==='rejected').reason.code,'REVISION_CONFLICT');
 const actual=(await trip(f)).trip;
 assert.equal(actual.revision,4);
 assert.equal(actual.stops[0].lines[0].customerReturned,2);
 assert.equal(actual.stops[0].lines[0].returning,4);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,5);
});
test('G5 two competing warehouse checks reintegrate at most once',async()=>{
 const f=await setupTrip({orders:1,stock:10});await planned(f,['O001']);
 await route(f,'driver','START','T1',1);
 await route(f,'driver','DELIVER','T1',2,{stopId:'O001',quantities:[3],
  outcome:'PARTIAL',receiver:'Test receiver',identification:'TEST',signature,
  condition:'GOOD',note:'Partial delivery'});
 await route(f,'driver','ARRIVE','T1',3);
 const line=(await trip(f)).trip.stops[0].lines[0];
 const attempt=()=>route(f,'manager','CHECK_RETURN','T1',4,
  {lineId:line.id,quantity:2,disposition:'REINTEGRATE'},randomUUID());
 const settled=await Promise.allSettled([attempt(),attempt()]);
 assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(settled.filter(x=>x.status==='rejected').length,1);
 assert.equal(settled.find(x=>x.status==='rejected').reason.code,'REVISION_CONFLICT');
 const after=(await trip(f)).trip;
 assert.equal(after.stops[0].lines[0].reintegrated,2);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,7);
});
