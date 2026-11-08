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
