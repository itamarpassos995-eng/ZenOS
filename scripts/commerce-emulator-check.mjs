import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Local signing identity only: no cloud account, token or production credentials.
// Do not skip real getSignedUrl logic or make Storage rules permissive for tests.
if(process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Commerce integration requires demo-zenos-local.');
const dir=mkdtempSync(join(tmpdir(),'zenos-commerce-test-signer-'));
try{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const file=join(dir,'signer.json');
 writeFileSync(file,JSON.stringify({type:'service_account',project_id:'demo-zenos-local',private_key_id:'emulator-only',private_key:privateKey,client_email:'commerce-test@demo-zenos-local.iam.gserviceaccount.com',client_id:'000000000000000000000',token_uri:'https://oauth2.googleapis.com/token'}),{mode:0o600});
 const env={...process.env,GOOGLE_APPLICATION_CREDENTIALS:file,ZENOS_COMMERCE_MEDIA_ENABLED:'true',ZENOS_COMMERCE_HOMOLOGACAO:'true',ZENOS_COMMERCE_STORAGE_BUCKET:'demo-zenos-local.appspot.com'};
 const r=spawnSync('npx',['--yes','firebase-tools@15.34.0','emulators:exec','--project','demo-zenos-local','--config','firebase.commerce.homologacao.json','--only','auth,firestore,functions,storage','node scripts/commerce-tenant-hml-emulator-check.mjs'],{env,stdio:'inherit'});
 if(r.error)throw r.error;
 process.exitCode=r.status??1;
}finally{rmSync(dir,{recursive:true,force:true});}
