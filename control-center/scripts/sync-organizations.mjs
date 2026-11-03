// One-time import of existing organizations. Uses Node built-ins and the existing pg dependency.
// No Firestore writes, no new package, no production database access.
import {createSign} from 'node:crypto';
import pg from 'pg';
const {Pool}=pg;
const env=process.env;
const project='zenos-ac6b2';
const url=env.CONTROL_CENTER_DATABASE_URL;
if(!url||new URL(url).pathname!=='/zenos_control_center_homologacao')throw Error('HOMOLOGATION_DATABASE_REQUIRED');
if(!env.FIREBASE_SERVICE_ACCOUNT_JSON)throw Error('FIREBASE_SERVICE_ACCOUNT_JSON_REQUIRED');
const key=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
if(key.project_id!==project||!key.private_key||!key.client_email)throw Error('INVALID_FIREBASE_CREDENTIAL');
const apply=env.CONTROL_CENTER_SYNC_APPLY==='true';
if(apply&&env.CONTROL_CENTER_SYNC_CONFIRM!=='IMPORTAR_LOJAS_HOMOLOGACAO')throw Error('EXPLICIT_CONFIRMATION_REQUIRED');
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const jwtHead=encode({alg:'RS256',typ:'JWT'});
const jwtBody=encode({iss:key.client_email,sub:key.client_email,aud:'https://oauth2.googleapis.com/token',scope:'https://www.googleapis.com/auth/datastore',iat:now,exp:now+3600});
const signature=createSign('RSA-SHA256').update(jwtHead+'.'+jwtBody).sign(key.private_key,'base64url');
const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwtHead+'.'+jwtBody+'.'+signature})});
if(!auth.ok)throw Error('GOOGLE_TOKEN_REQUEST_FAILED_'+auth.status);
const token=(await auth.json()).access_token;
const pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:true},max:2});
let pageToken='',scanned=0,eligible=0,inserted=0,updated=0,skipped=0,unnamed=0,pages=0;
const field=(fields,name)=>fields?.[name]?.stringValue??'';
try{
 do{
  const endpoint=new URL('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/lojas');
  endpoint.searchParams.set('pageSize','100');
  for(const key of ['nomeLoja','nome','razaoSocial','nomeFantasia','emailAdmin'])endpoint.searchParams.append('mask.fieldPaths',key);
  if(pageToken)endpoint.searchParams.set('pageToken',pageToken);
  const response=await fetch(endpoint,{headers:{authorization:'Bearer '+token}});
  if(!response.ok)throw Error('FIRESTORE_READ_FAILED_'+response.status);
  const data=await response.json();pages++;
  const items=[];
  for(const doc of data.documents||[]){
   scanned++;
   const uid=doc.name.split('/').at(-1);
   if(!uid){skipped++;continue;}
   const name=String(field(doc.fields,'nomeLoja')||field(doc.fields,'nomeFantasia')||field(doc.fields,'razaoSocial')||field(doc.fields,'nome')||field(doc.fields,'emailAdmin')||'Empresa sem nome · '+uid.slice(0,8)).trim();
   if(!field(doc.fields,'nomeLoja'))unnamed++;
   eligible++;items.push({uid,name});
  }
  if(apply&&items.length){
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    for(const item of items){
     const result=await client.query(`INSERT INTO organizations(firebase_uid,display_name) VALUES($1,$2)
       ON CONFLICT(firebase_uid) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=now()
       RETURNING (xmax=0) AS inserted`,[item.uid,item.name]);
     if(result.rows[0].inserted)inserted++;else updated++;
    }
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  pageToken=data.nextPageToken||'';
 }while(pageToken);
 const dbCount=apply?(await pool.query('SELECT COUNT(*)::integer AS total FROM organizations')).rows[0].total:null;
 console.log(JSON.stringify({source:'lojas',project,pages,scanned,eligible,skipped,unnamed,inserted,updated,postgres_total:dbCount,mode:apply?'applied':'dry-run'}));
}finally{await pool.end();}
