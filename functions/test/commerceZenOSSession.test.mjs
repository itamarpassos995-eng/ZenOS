import {test} from 'node:test';import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {autorizarOperadorCommerce} from '../src/commerceAuthorization.js';
import {conferirPinZenOS,validarIdentidadeZenOS,hashSessaoCommerce} from '../src/commerceZenOSSession.js';
const salt='ab'.repeat(16),pin='839275',secret='cd'.repeat(32),auth={uid:'loja-A',token:{firebase:{sign_in_provider:'password'}}};
const acesso={ativo:true,papel:'admin',versao:1,pinVersion:2,pinSalt:salt,pinHash:pbkdf2Sync(pin,Buffer.from(salt,'hex'),120000,32,'sha256').toString('hex')};
function db(s={operadorId:'caixa-1',versao:1,expiraEm:Date.now()+10000},a=acesso){return {doc:path=>({get:async()=>({exists:true,data:()=>{if(path===`lojas/loja-A/commerce_operator_sessions/${hashSessaoCommerce(secret)}`)return s;if(path==='lojas/loja-A/commerce_operator_credentials/caixa-1')return a;return undefined;}})})};}
test('PIN existente é conferido no servidor com credencial privada, nunca papel do cliente',()=>{
 assert.equal(conferirPinZenOS(acesso,pin),true);assert.equal(conferirPinZenOS(acesso,'839276'),false);assert.equal(conferirPinZenOS({...acesso,pinVersion:1},pin),false);assert.equal(conferirPinZenOS(acesso,{}),false);
 assert.throws(()=>validarIdentidadeZenOS({...auth,token:{firebase:{sign_in_provider:'anonymous'}}}));
});
test('sessão integrada usa loja da identidade, sem outra conta Google',async()=>{
 assert.deepEqual(await autorizarOperadorCommerce(auth,db(),secret),{lojaId:'loja-A',operadorUid:'caixa-1'});
 await assert.rejects(autorizarOperadorCommerce({...auth,uid:'loja-B'},db(),secret));
 for(const a of [{...acesso,ativo:false},{...acesso,papel:'operador'},{...acesso,versao:2}])await assert.rejects(autorizarOperadorCommerce(auth,db(undefined,a),secret));
 await assert.rejects(autorizarOperadorCommerce(auth,db({operadorId:'caixa-1',versao:1,expiraEm:Date.now()-1}),secret));
 await assert.rejects(autorizarOperadorCommerce(auth,db(),'token-forjado'));
});
