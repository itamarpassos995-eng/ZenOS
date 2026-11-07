import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatabasePool,databaseHealth} from '../src/server/database.mjs';
import {createSessionVerifier} from '../src/server/session.mjs';
import {bootstrapControlCenter} from '../src/server/bootstrap.mjs';
test('DB sem segredo não inicia',async()=>{await assert.rejects(()=>createDatabasePool({connectionString:''}),/DATABASE_NOT_CONFIGURED/)});
test('sem provedor de autenticação não inicia',()=>assert.throws(()=>createSessionVerifier(),/AUTH_PROVIDER_NOT_CONFIGURED/));
test('não aceita perfil administrativo por cabeçalhos falsos',async()=>{const verify=createSessionVerifier({verifyProviderToken:async()=>null});assert.equal(await verify({'x-admin':'owner','x-mfa':'true'}),null)});
test('nega token sem verificação real do provedor',async()=>{const verify=createSessionVerifier({verifyProviderToken:async()=>({subject:'admin',roles:['owner'],active:true,mfaVerified:true})});assert.equal(await verify({cookie:'zenos_admin_session=fake'}),null)});
test('nega token sem MFA',async()=>{const verify=createSessionVerifier({verifyProviderToken:async()=>({subject:'admin',roles:['owner'],active:true,issuerVerified:true,mfaVerified:false})});assert.equal(await verify({cookie:'zenos_admin_session=fake'}),null)});
test('integra sessão verificada e SQL parametrizado por adaptadores simulados',async()=>{
  const calls=[];class Pool{async query(sql,params){calls.push({sql,params});if(sql.includes('COUNT('))return {rows:[{organizations:3,active_subscriptions:2,trials:1,overdue_invoices:0}]};return {rows:[{id:'org-1',display_name:'Empresa de teste'}]}}async end(){}}
  const app=await bootstrapControlCenter({connectionString:'postgresql://fake.invalid/demo',pgModule:{Pool},verifyProviderToken:async token=>token==='valid'?{issuerVerified:true,mfaVerified:true,subject:'admin-1',roles:['owner'],active:true}:null});
  assert.equal((await app.handle({path:'/api/organizations'})).status,401);
  const res=await app.handle({path:'/api/organizations',headers:{cookie:'zenos_admin_session=valid'}});
  assert.equal(res.status,200);assert.deepEqual(calls[0].params,[25]);
  assert.equal((await app.handle({path:'/api/overview',headers:{cookie:'zenos_admin_session=invalid'}})).status,401);
  assert.equal((await app.handle({path:'/api/overview',headers:{cookie:'zenos_admin_session=valid'}})).body.organizations,3);
  await app.close();
});
test('health responde ao banco de teste',async()=>assert.equal(await databaseHealth({query:async()=>({rows:[{ok:1}]})}),true));
