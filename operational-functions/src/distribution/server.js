import {createServer} from 'node:http';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {distributionService} from './service.js';
import {requireEmulators} from './security.js';
requireEmulators();
const app=initializeApp({projectId:'demo-zenos-local'},'distribution-local');
const service=distributionService(getFirestore(app));
const server=createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 try {
  if(req.method!=='POST'||!['/session','/command','/query','/logout','/finalize','/route-command','/route-query','/route-post','/occurrence-command','/occurrence-query','/occurrence-evidence-upload','/occurrence-evidence-read'].includes(req.url)){res.writeHead(404);res.end('{}');return;}
  // Served through the Vite same-origin proxy; no permissive CORS or cookie auth.
  const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!bearer)throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED'});
  const auth=await getAuth(app).verifyIdToken(bearer,true);
  if(auth.firebase?.sign_in_provider==='anonymous')throw Object.assign(new Error('UNAUTHENTICATED'),{code:'UNAUTHENTICATED'});
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>(req.url==='/occurrence-evidence-upload'?1_500_000:130000))throw Object.assign(new Error('REQUEST_TOO_LARGE'),{code:'REQUEST_TOO_LARGE'});}
  const input=JSON.parse(raw||'{}');
  const result=req.url.startsWith('/occurrence-')?await service[{'/occurrence-command':'occurrenceCommand','/occurrence-query':'occurrenceQuery','/occurrence-evidence-upload':'occurrenceEvidenceUpload','/occurrence-evidence-read':'occurrenceEvidenceRead'}[req.url]](auth.uid,String(req.headers['x-operator-session']||''),input):req.url==='/session'?await service.login(auth.uid,input):req.url==='/finalize'?await service.finalize(auth.uid,input):req.url.startsWith('/route-')?await service[{'/route-command':'routeCommand','/route-query':'routeQuery','/route-post':'routePost'}[req.url]](auth.uid,String(req.headers['x-operator-session']||''),input):await service[req.url==='/command'?'command':req.url==='/logout'?'logout':'query'](auth.uid,String(req.headers['x-operator-session']||''),input);
  res.end(JSON.stringify(result));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:typeof e.code==='string'&&!e.code.startsWith('auth/')?e.code:'UNAUTHENTICATED'}));}
});
server.listen(8787,'127.0.0.1',()=>console.log('Distribution homologation API http://127.0.0.1:8787 (demo only)'));
