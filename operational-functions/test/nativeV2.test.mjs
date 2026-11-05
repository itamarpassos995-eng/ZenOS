import {test} from 'node:test';
import assert from 'node:assert/strict';
import {provisionNativeV2,nativeSeed} from '../src/nativeV2.js';

const stamp=n=>({toMillis:()=>n});
function fixture(overrides={}){
  const records=new Map(Object.entries({
    'lojas/company':{createdAtServer:stamp(200)},
    'system/storage_policy':{newStoreSchema:2,nativeProtectionReady:true,enabledAt:stamp(100),frontendCommit:'a'.repeat(40),rulesSha256:'b'.repeat(64)},
    ...overrides,
  }));
  const writes=[];
  return {records,writes,db:{doc:path=>path,runTransaction:async action=>{
    const pending=[];
    const result=await action({get:async path=>({exists:records.has(path),data:()=>records.get(path)}),
      create:(path,value)=>{if(records.has(path))throw Error('already exists');pending.push([path,value]);}});
    for(const [path,value] of pending){records.set(path,value);writes.push(path);}return result;
  }}};
}
const request={auth:{uid:'company',token:{firebase:{sign_in_provider:'password'}}},data:{}};

test('new account creates only six native documents, with deterministic complete manifest',async()=>{
  const f=fixture();const result=await provisionNativeV2(f.db,request);
  assert.equal(result.status,'created');assert.equal(f.writes.length,6);
  assert.equal(f.records.has('lojas/company/dados/operacao'),false);
  const seed=nativeSeed('company','a'.repeat(40));
  assert.equal(seed.generation,result.generation);
  assert.equal(Object.keys(seed.head.fieldManifest).length,13);
  assert.equal(seed.head.fieldCounts.vendedores,1);
  assert.equal(seed.admin.pinTrocaObrigatoria,true);
  const again=await provisionNativeV2(f.db,request);
  assert.equal(again.status,'existing-control');assert.equal(f.writes.length,6);
});
test('legacy data and existing controls are never migrated or overwritten',async()=>{
  for(const override of [
    {'lojas/company/dados/operacao':{produtos:[{id:'keep'}]}},
    {'lojas/company/dados/storage_control':{mode:'maintenance',generation:'keep'}},
  ]){const f=fixture(override);await provisionNativeV2(f.db,request);assert.equal(f.writes.length,0);}
});
test('missing policy, missing timestamp and old accounts cannot become empty stores',async()=>{
  for(const override of [
    {'system/storage_policy':{}},
    {'lojas/company':{}},
    {'lojas/company':{createdAtServer:stamp(99)}},
  ]){const f=fixture(override);await assert.rejects(provisionNativeV2(f.db,request),{code:'failed-precondition'});assert.equal(f.writes.length,0);}
});
test('requires authentication and rejects destination/data injection',async()=>{
  for(const req of [{data:{}},{auth:{uid:'company',token:{firebase:{sign_in_provider:'anonymous'}}}},
    {...request,data:{uid:'victim'}},{...request,data:[]},{...request,auth:{uid:'../victim'}}]){
    const f=fixture();await assert.rejects(provisionNativeV2(f.db,req));assert.equal(f.writes.length,0);
  }
});
