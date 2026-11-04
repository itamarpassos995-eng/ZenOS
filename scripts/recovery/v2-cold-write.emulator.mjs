import assert from 'node:assert/strict';
import {doc,getDoc} from 'firebase/firestore';
import {createRealFixture} from './real_fixture.mjs';
import {clearOperationalSession,peekV2Session} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe,persistV1OperationFieldSafe} from '../../src/core/productionSync.js';
const cache=new Map();globalThis.localStorage={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k)};
const f=await createRealFixture();
try{
 const original=(await getDoc(doc(f.db,'lojas',f.userId,'dados','operacao'))).data();
 const clients=f.operation.clientes;
 clearOperationalSession(f.db,f.userId);
 assert.equal(peekV2Session(f.db,f.userId),null);
 const result=await persistV1BusinessOperationSafe({db:f.db,userId:f.userId,
  operationKey:'emulator-cold-client-registration',
  changes:[{field:'clientes',baseValue:clients,value:[...clients,{id:'EMULATOR-COLD-CLIENT',nome:'Cold client',saldoDevedorBRL:0}]}]});
 assert.equal(result.cloudOk,true,result.error?.message);
 assert(result.values.clientes.some(c=>c.id==='EMULATOR-COLD-CLIENT'));
 assert(peekV2Session(f.db,f.userId));
 const suppliers=peekV2Session(f.db,f.userId).materialize().fornecedores;
 clearOperationalSession(f.db,f.userId);
 const simple=await persistV1OperationFieldSafe({db:f.db,userId:f.userId,field:'fornecedores',
  baseValue:suppliers,value:[...suppliers,{id:'EMULATOR-COLD-SUPPLIER',nome:'Cold supplier'}]});
 assert.equal(simple.cloudOk,true,simple.error?.message);
 assert(simple.value.some(s=>s.id==='EMULATOR-COLD-SUPPLIER'));
 assert.deepEqual((await getDoc(doc(f.db,'lojas',f.userId,'dados','operacao'))).data(),original);
 console.log('PASS: cold business write and cold single-field write resolve V2; frozen V1 preserved.');
}finally{await f.close();}
