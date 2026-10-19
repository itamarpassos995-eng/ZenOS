import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authoritativeFirestoreRead,isTransientFirestoreReadError} from '../../src/core/authoritativeFirestoreRead.js';

test('erros transitórios em getDocsFromServer: tentativas limitadas e resultado do servidor',async()=>{
 let calls=0;const waits=[];
 const serverValue=Object.freeze({docs:[{id:'p1'}],metadata:{fromCache:false}});
 const result=await authoritativeFirestoreRead(async()=>{
  if(++calls<=2)throw Object.assign(new Error('Failed to get documents from server'),{code:'unavailable'});
  return serverValue;
 },{waitFor:ms=>{waits.push(ms);return Promise.resolve();}});
 assert.equal(result,serverValue);assert.equal(calls,3);assert.deepEqual(waits,[250,750]);
});
test('indisponibilidade persistente bloqueia em vez de aceitar cache',async()=>{
 let calls=0;const error=Object.assign(new Error('server unavailable'),{code:'unavailable'});
 await assert.rejects(authoritativeFirestoreRead(async()=>{calls++;throw error;},{waitFor:()=>Promise.resolve()}),e=>e===error);
 assert.equal(calls,3);
});
test('negativa de autorização não é contornada nem repetida',async()=>{
 let calls=0;const error=Object.assign(new Error('Missing or insufficient permissions'),{code:'permission-denied'});
 await assert.rejects(authoritativeFirestoreRead(async()=>{calls++;throw error;},{waitFor:()=>Promise.resolve()}),e=>e===error);
 assert.equal(calls,1);
});
test('quota e regras estruturais não geram tempestade de consultas',async()=>{
 for(const code of ['resource-exhausted','failed-precondition','unauthenticated','invalid-argument','not-found']){
  let calls=0;await assert.rejects(authoritativeFirestoreRead(async()=>{calls++;throw Object.assign(new Error('erro'),{code});},{waitFor:()=>Promise.resolve()}));
  assert.equal(calls,1,code);
 }
});
test('mensagem literal do Firestore traduzida pelo navegador permite recuperação segura',()=>{
 assert.equal(isTransientFirestoreReadError(new Error('Failed to get documents from server. However, these documents may exist in the local cache.')),true);
 assert.equal(isTransientFirestoreReadError(new Error('permission denied: failed to get documents from server')),false);
 assert.equal(isTransientFirestoreReadError({code:'permission-denied',message:'Failed to get documents from server'}),false);
 assert.equal(isTransientFirestoreReadError({code:'internal',message:'corrupt document size'}),false);
});
