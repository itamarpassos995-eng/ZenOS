import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../../api/distribution-staging.js';
import {createDistributionHandler} from '../../operational-functions/src/distribution/httpHandler.js';

function response(){
 return {statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},
  writeHead(code){this.statusCode=code;},end(body){this.body=body;}};
}
test('staging function stays closed on production or incorrect Firebase project',async()=>{
 const old={...process.env};
 try{
  process.env.VERCEL_ENV='production';
  process.env.ZENOS_ENV='staging';
  const req={method:'POST',query:{operation:'query'},headers:{authorization:'Bearer dummy'}};
  const production=response();
  await handler(req,production);
  assert.equal(production.statusCode,404);
  process.env.VERCEL_ENV='preview';
  process.env.FIREBASE_PROJECT_ID='other-project';
  const wrongProject=response();
  await handler(req,wrongProject);
  assert.equal(wrongProject.statusCode,503);
  assert.equal(JSON.parse(wrongProject.body).error,'STAGING_CONFIGURATION_REQUIRED');
  const missingToken=response();
  await handler({...req,headers:{}},missingToken);
  assert.equal(missingToken.statusCode,401);
  assert.equal(missingToken.headers['Cache-Control'],'no-store');
 }finally{
  for(const key of ['VERCEL_ENV','ZENOS_ENV','FIREBASE_PROJECT_ID']){
   if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];
  }
 }
});

test('shared handler uses authenticated UID and operator header with parsed Vercel body',async()=>{
 const h=createDistributionHandler({
  auth:{async verifyIdToken(token,revoked){assert.equal(revoked,true);if(token!=='staging-token')throw Object.assign(Error(),{code:'auth/argument-error'});return {uid:'synthetic-tenant'};}},
  service:{async query(uid,operator,input){
   assert.equal(uid,'synthetic-tenant');assert.equal(operator,'operator-session');assert.deepEqual(input,{tenantId:'untrusted'});return {ok:true};
  }},attachments:false,staging:true
 });
 const req={method:'POST',url:'/query',headers:{authorization:'Bearer staging-token','x-operator-session':'operator-session'},body:{tenantId:'untrusted'}};
 const valid=response();await h(req,valid);
 assert.deepEqual(JSON.parse(valid.body),{ok:true});
 const invalid=response();await h({...req,headers:{authorization:'Bearer foreign-token'}},invalid);
 assert.equal(JSON.parse(invalid.body).error,'UNAUTHENTICATED');
 const financial=response();await h({...req,url:'/finalize'},financial);
 assert.equal(JSON.parse(financial.body).error,'PILOT_PYG_CREDIT_UNAVAILABLE');
 const attachment=response();await h({...req,url:'/occurrence-evidence-upload'},attachment);
 assert.equal(attachment.statusCode,404);
});
import {distributionService} from '../../operational-functions/src/distribution/service.js';
import {hash,credentialFingerprint} from '../../operational-functions/src/distribution/security.js';

test('Delivery C verification is read-only and requires the matching recent financial session',async()=>{
 const uid='acceptance-tenant',root='lojas/'+uid,base=root+'/v2_generations/g1',token='a'.repeat(64);
 const operator={id:'admin',patente:'admin',permissoes:{admin:true}};
 const now=1700000000000;
 const docs=new Map([
  [root,{synthetic:true}],
  [root+'/dados/storage_control',{mode:'v2',generation:'g1',sourceChecksum:'s',entitlements:{distribution:{enabled:true}}}],
  [base,{schema:2,state:'ready',sourceChecksum:'s'}],
  [root+'/distribution_config/module',{enabled:true,pilotProfile:'PYG_CREDIT_CASH_V1',nativePygCashEnabled:true}],
  [root+'/distribution_sessions/'+hash(token),{uid,generation:'g1',operatorId:'admin',expiresAt:now+60000,credential:credentialFingerprint(operator)}],
  [base+'/operadores/admin',{data:operator}],
 ]);
 const db={projectId:'zenos-distribution-staging',doc:path=>path,runTransaction(fn,options){
  assert.deepEqual(options,{readOnly:true});
  return fn({get:async path=>({data:()=>docs.get(path)})});
 }};
 const original=process.env.STAGING_ACCEPTANCE_UID;
 process.env.STAGING_ACCEPTANCE_UID=uid;
 try{
  const service=distributionService(db,{staging:true,now:()=>now});
  const identity={uid,auth_time:now/1000,firebase:{sign_in_provider:'password'}};
  assert.deepEqual(await service.verifyDeliveryCAcceptance(identity,token),{matches:true,eligible:true});
  assert.deepEqual(await service.verifyDeliveryCAcceptance({...identity,uid:'other'},token),{matches:false,eligible:false});
  assert.deepEqual(await service.verifyDeliveryCAcceptance({...identity,auth_time:now/1000-301},token),{matches:false,eligible:false});
  await assert.rejects(service.verifyDeliveryCAcceptance(identity,'bad'),{code:'UNAUTHENTICATED'});
  docs.set(root+'/distribution_config/delivery_c_grant',{enabled:true,expiresAt:now+1000});
  assert.deepEqual(await service.verifyDeliveryCAcceptance(identity,token),{matches:true,eligible:false});
  docs.delete(root+'/distribution_config/delivery_c_grant');
  docs.set(root,{synthetic:false});
  assert.deepEqual(await service.verifyDeliveryCAcceptance(identity,token),{matches:true,eligible:false});
 }finally{
  if(original===undefined)delete process.env.STAGING_ACCEPTANCE_UID;else process.env.STAGING_ACCEPTANCE_UID=original;
 }
});
test('PDV pre-order endpoint is Preview-only and derives the tenant from Firebase Auth',async()=>{
 const auth={verifyIdToken:async token=>{
  if(token!=='staging-token')throw Object.assign(Error(),{code:'auth/argument-error'});
  return {uid:'synthetic',firebase:{sign_in_provider:'password'}};
 }};
 const calls=[];
 const service={stagingPreorder:async (...args)=>{calls.push(args);return {ok:true};}};
 const req={method:'POST',url:'/staging-preorder',headers:{authorization:'Bearer staging-token','x-operator-session':'pdv-session'},body:{type:'catalog',uid:'untrusted'}};
 const ordinary=response();await createDistributionHandler({auth,service})(req,ordinary);
 assert.equal(ordinary.statusCode,404);
 const preview=createDistributionHandler({auth,service,staging:true});
 const invalid=response();await preview({...req,headers:{authorization:'Bearer foreign-token'}},invalid);
 assert.equal(JSON.parse(invalid.body).error,'UNAUTHENTICATED');
 const valid=response();await preview(req,valid);
 assert.deepEqual(calls,[['synthetic','pdv-session',req.body]]);
});

test('staging catalog projects canonical PYG sale price for native PDV without mutating original money',async()=>{
 const {projectStagingCatalogProduct}=await import('../../operational-functions/src/distribution/stagingPreorders.js');
 const {valorProdutoBRL}=await import('../../src/core/productMoney.js');
 const source={id:'P1',sku:'PY-001',nome:'Papel de prueba',valoresMonetarios:{versao:1,campos:{precoVenda:{valor:39990,moeda:'PYG'}}}};
 const mapped=projectStagingCatalogProduct(source,1333);
 assert.equal(mapped.precoBRL,30);
 assert.equal(valorProdutoBRL(mapped,'precoBRL',(value,moeda)=>moeda==='PYG'?value/1333:value),30);
 assert.equal(mapped.valoresMonetarios.campos.precoVenda.valor,39990);
 assert.equal(source.precoBRL,undefined);
 assert.equal(projectStagingCatalogProduct(source,0),null);
});
