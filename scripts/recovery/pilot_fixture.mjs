// Same generated policy used by the owner-run executor, loaded only in demo.
import {execFileSync} from 'node:child_process';
import {request} from 'node:http';
// Node transport avoids mixing jsdom AbortSignal/Request globals with native
// fetch. The fixture transport is deliberately restricted to loopback demo.
export function emulatorAdminRequest(path,body,method='POST'){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Local demo required');
 if(!['/emulator/v1/projects/demo-zenos-local:securityRules','/v1/projects/demo-zenos-local/databases/(default)/documents:commit'].includes(path))throw Error('Unexpected emulator fixture endpoint');
 return new Promise((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:8080,path,method,headers:{'Content-Type':'application/json',Authorization:'Bearer owner'}},res=>{
   res.resume();res.on('end',()=>resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode}));
  });
  req.on('error',reject);req.setTimeout(15000,()=>req.destroy(new Error('Local emulator fixture timed out')));req.end(JSON.stringify(body));
 });
}
export async function loadPilotFixtureRules(uid){
 if(process.env.ZENOS_PILOT_RULES!=='1')return;
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Local demo required');
 const source=execFileSync('python3',['-c','import sys;sys.path.insert(0,"scripts/recovery");from pilot_rules import generate,BASELINE;print(generate(BASELINE,sys.argv[1]),end="")',uid],{encoding:'utf8'});
 const r=await emulatorAdminRequest('/emulator/v1/projects/demo-zenos-local:securityRules',{rules:{files:[{name:'firestore.rules',content:source}]}},'PUT');
 if(!r.ok)throw Error(`Pilot policy failed to compile: ${r.status}`);
}
