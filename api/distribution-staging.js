import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {Firestore} from '@google-cloud/firestore';
import {GoogleAuth,IdentityPoolClient} from 'google-auth-library';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {createDistributionHandler} from '../operational-functions/src/distribution/httpHandler.js';
import {distributionService} from '../operational-functions/src/distribution/service.js';

const projectId='zenos-distribution-staging';
const team='itamarpassos995-4355';
const issuer=`https://oidc.vercel.com/${team}`;
const subject=`owner:${team}:project:${projectId}:environment:preview`;
const keys=createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
const accountPattern=/^[a-z][a-z0-9-]+@zenos-distribution-staging\.iam\.gserviceaccount\.com$/;
const audiencePattern=/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[\w-]+\/providers\/[\w-]+$/;

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(process.env.VERCEL_ENV!=='preview'||process.env.ZENOS_ENV!=='staging'){
  res.statusCode=404;res.end();return;
 }
 const {FIREBASE_PROJECT_ID,FIRESTORE_DATABASE_ID,STAGING_WIF_AUDIENCE,STAGING_SERVICE_ACCOUNT}=process.env;
 const oidc=req.headers['x-vercel-oidc-token'];
 const operation=req.query?.operation;
 const health=req.method==='GET'&&operation==='health';
 if(!health&&(req.method!=='POST'||typeof operation!=='string'||!/^[a-z-]+$/.test(operation))){
  res.statusCode=404;res.end();return;
 }
 if(!health&&!/^Bearer [^ ]+$/.test(req.headers.authorization||'')){
  res.statusCode=401;res.end(JSON.stringify({error:'UNAUTHENTICATED'}));return;
 }
 if(FIREBASE_PROJECT_ID!==projectId||FIRESTORE_DATABASE_ID!=='(default)'||
    !audiencePattern.test(STAGING_WIF_AUDIENCE||'')||!accountPattern.test(STAGING_SERVICE_ACCOUNT||'')||
    typeof oidc!=='string'||process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST){
  res.statusCode=503;res.end(JSON.stringify({error:'STAGING_CONFIGURATION_REQUIRED'}));return;
 }
 let app,db;
 try{
  let claims;
  try{({payload:claims}=await jwtVerify(oidc,keys,{issuer,audience:`https://vercel.com/${team}`,algorithms:['RS256']}));}
  catch{res.statusCode=403;res.end(JSON.stringify({error:'STAGING_OIDC_REJECTED'}));return;}
  if(claims.sub!==subject){
   res.statusCode=403;res.end(JSON.stringify({error:'STAGING_SUBJECT_REJECTED',...(health?{subject:claims.sub}:{})}));return;
  }
  const identity=new IdentityPoolClient({
   audience:STAGING_WIF_AUDIENCE,
   subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
   token_url:'https://sts.googleapis.com/v1/token',
   service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${STAGING_SERVICE_ACCOUNT}:generateAccessToken`,
   subject_token_supplier:{getSubjectToken:async()=>oidc}
  });
  const credential={async getAccessToken(){
   const {token}=await identity.getAccessToken();
   const expires_in=Math.floor((identity.credentials.expiry_date-Date.now())/1000);
   if(!token||!Number.isFinite(expires_in)||expires_in<=0)throw Error('STAGING_IDENTITY_UNAVAILABLE');
   return {access_token:token,expires_in};
  }};
  app=initializeApp({projectId,credential},randomUUID());
  db=new Firestore({projectId,preferRest:true,auth:new GoogleAuth({authClient:identity,projectId})});
  if(health){
   try{await identity.getAccessToken();}
   catch(error){
    const upstream=String(error.response?.config?.url||'');
    const step=upstream.startsWith('https://iamcredentials.googleapis.com/')?'iamcredentials':
     upstream.startsWith('https://sts.googleapis.com/')?'sts':'unknown';
    const reason=error.response?.data?.error?.details?.find(detail=>detail.reason==='SERVICE_DISABLED')?.reason;
    res.statusCode=503;res.end(JSON.stringify({subject,error:'STAGING_FEDERATION_UNAVAILABLE',step,reason}));return;
   }
   try{await db.doc('distribution_staging_health/connectivity').get();}
   catch{res.statusCode=503;res.end(JSON.stringify({subject,error:'STAGING_FIRESTORE_UNAVAILABLE'}));return;}
   res.end(JSON.stringify({subject,projectId,firestore:'reachable'}));return;
  }
  req.url=`/${operation}`;
  const service=distributionService(db,{staging:true});
  await createDistributionHandler({auth:getAuth(app),service,attachments:false,staging:true})(req,res);
 }catch{
  if(!res.headersSent){res.statusCode=503;res.end(JSON.stringify({error:'STAGING_UNAVAILABLE'}));}
 }finally{
  await Promise.allSettled([db?.terminate(),app&&deleteApp(app)]);
 }
}
