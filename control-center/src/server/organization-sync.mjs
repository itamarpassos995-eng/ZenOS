import {spawn} from 'node:child_process';
import {createHmac,timingSafeEqual} from 'node:crypto';
let current={state:'idle',result:null,at:null};
export const syncStatus=()=>({...current,configured:Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)});
export const syncCsrf=(token)=>createHmac('sha256',process.env.CONTROL_CENTER_AUTH_KEY||'').update('sync-organizations:'+token).digest('hex');
export function verifySyncCsrf(token,provided){
 if(!token||typeof provided!=='string'||provided.length!==64)return false;
 return timingSafeEqual(Buffer.from(syncCsrf(token)),Buffer.from(provided));
}
export function startSync(){
 if(current.state==='running')return false;
 if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON){current={state:'missing-credential',result:null,at:new Date().toISOString()};return false;}
 current={state:'running',result:null,at:new Date().toISOString()};
 const child=spawn(process.execPath,['scripts/sync-organizations.mjs'],{
  cwd:process.cwd(),env:{...process.env,CONTROL_CENTER_SYNC_APPLY:'true',CONTROL_CENTER_SYNC_CONFIRM:'IMPORTAR_LOJAS_HOMOLOGACAO'},
  stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';
 child.stdout.on('data',b=>{stdout=(stdout+b.toString()).slice(-4096)});
 child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-1024)});
 const timeout=setTimeout(()=>child.kill('SIGTERM'),180000);timeout.unref();
 child.on('error',()=>{clearTimeout(timeout);current={state:'failed',result:'Falha ao iniciar rotina',at:new Date().toISOString()}});
 child.on('close',code=>{clearTimeout(timeout);current={state:code===0?'completed':'failed',result:code===0?stdout.trim():('Falha de sincronização: '+stderr.replace(/private_key|access_token/gi,'[redacted]').slice(0,160)),at:new Date().toISOString()}});
 return true;
}
