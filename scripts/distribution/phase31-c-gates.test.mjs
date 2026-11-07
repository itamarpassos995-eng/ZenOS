import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePreparationOfC,B3_GATES} from '../../src/core/distribution/phase31CGates.js';
const sha='a'.repeat(40),all=Object.fromEntries(Object.keys(B3_GATES).map(k=>[k,{status:'PASS',sha,evidence:['https://example.test/verified-'+k]}]));
test('B3 cannot release C with any incomplete gate',()=>{
 const raw={...all,G4:{status:'BLOCKED',reason:'Historical reversals not fully linked'}};
 const r=evaluatePreparationOfC(raw);
 assert.equal(r.PREPARATION_OF_C_ALLOWED,false);
 assert.equal(r.EXECUTION_OF_C_ALLOWED,false);
 assert.equal(r.gates.G4.status,'BLOCKED');
});
test('B3 rejects unevidenced PASS and preserves technical-only distinction',()=>{
 const r=evaluatePreparationOfC({...all,G1:{status:'PASS'}});
 assert.equal(r.PREPARATION_OF_C_ALLOWED,false);
 assert.equal(r.gates.G1.status,'PARTIAL');
 const complete=evaluatePreparationOfC(all);
 assert.equal(complete.PREPARATION_OF_C_ALLOWED,true);
 assert.equal(complete.EXECUTION_OF_C_ALLOWED,false);
});

test('each gate independently blocks preparation when its evidence is incomplete', () => {
 for (const gate of Object.keys(B3_GATES)) {
  const incomplete = [
   {status:'PARTIAL', sha, evidence:all[gate].evidence},
   {status:'BLOCKED', sha, evidence:all[gate].evidence},
   {status:'PASS', sha:'invalid', evidence:all[gate].evidence},
   {status:'PASS', sha, evidence:[' ', null]},
  ];
  for (const [index, entry] of incomplete.entries()) {
   const result = evaluatePreparationOfC({...all, [gate]:entry});
   assert.equal(result.PREPARATION_OF_C_ALLOWED, false, `${gate} case ${index}`);
   assert.equal(result.EXECUTION_OF_C_ALLOWED, false, `${gate} case ${index}`);
  }
 }
});
