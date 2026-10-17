// Same generated policy used by the owner-run executor, loaded only in demo.
import {execFileSync} from 'node:child_process';
export async function loadPilotFixtureRules(uid){
 if(process.env.ZENOS_PILOT_RULES!=='1')return;
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Local demo required');
 const source=execFileSync('python3',['-c','import sys;sys.path.insert(0,"scripts/recovery");from pilot_rules import generate,BASELINE;print(generate(BASELINE,sys.argv[1]),end="")',uid],{encoding:'utf8'});
 const r=await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-zenos-local:securityRules',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:source}]}})});
 if(!r.ok)throw Error(`Pilot policy failed to compile: ${r.status}`);
}
