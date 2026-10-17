import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autorizarOperadorCommerce} from '../src/commerceAuthorization.js';
const auth={uid:'admin-individual',token:{email_verified:true,firebase:{sign_in_provider:'google.com'}}};
const record={ativo:true,papel:'admin',lojaId:'loja-A'};
const db=value=>({doc:path=>{assert.equal(path,'commerce_operator_access/admin-individual');return {get:async()=>({exists:value!==undefined,data:()=>value})};}});
const denied=(identity,record)=>assert.rejects(autorizarOperadorCommerce(identity,db(record)),e=>/permission-denied|unauthenticated/.test(e.code));
test('exige identidade individual verificada e vínculo administrativo persistido',async()=>{
 assert.deepEqual(await autorizarOperadorCommerce(auth,db(record)),{lojaId:'loja-A',operadorUid:'admin-individual'});
 for(const value of [undefined,{...record,ativo:false},{...record,papel:'operador'},{...record,lojaId:'admin-individual'},{...record,lojaId:'lojas/A'},{...record,lojaId:''}])await denied(auth,value);
 await denied(null,record);
 await denied({...auth,token:{...auth.token,email_verified:false}},record);
 for(const provider of ['anonymous','custom',undefined])await denied({...auth,token:{...auth.token,firebase:{sign_in_provider:provider}}},record);
});
test('revogação no servidor vale na próxima chamada e papel do cliente é ignorado',async()=>{
 const value={...record};const firestore=db(value);
 await autorizarOperadorCommerce(auth,firestore);
 value.ativo=false;
 await assert.rejects(autorizarOperadorCommerce({...auth,papel:'admin'},firestore),e=>e.code==='permission-denied');
});
