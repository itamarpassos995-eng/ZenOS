// Private backup input is mandatory. This helper has no production transport.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,Timestamp} from 'firebase/firestore';
import {getOperationalSnapshot} from '../../src/core/operationalRepository.js';
import {loadPilotFixtureRules} from './pilot_fixture.mjs';
const typed=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(typed)}}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?(Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}):{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typed(x)]))}};
export function decodeFixture(v){
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decodeFixture(x)]));
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decodeFixture);
 if('integerValue'in v){const n=Number(v.integerValue);if(!Number.isSafeInteger(n))throw Error('Unsafe integer');return n;}
 if('doubleValue'in v)return Number(v.doubleValue);if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;
 if('timestampValue'in v)return new Timestamp(Math.floor(Date.parse(v.timestampValue)/1000),Number((v.timestampValue.match(/\.(\d+)Z$/)?.[1]||'').padEnd(9,'0')));
 throw Error('Unsupported fixture type');
}
export async function createRealFixture(){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Loopback demo required');
 const input=process.env.ZENOS_BACKUP_PATH;if(!input)throw Error('ZENOS_BACKUP_PATH is required');
 const backup=JSON.parse(fs.readFileSync(input,'utf8'));
 const plan=JSON.parse(execFileSync('python3',['-c','import json,sys;sys.path.insert(0,"scripts/recovery");from v2_plan import plan_v2;print(json.dumps(plan_v2(json.load(open(sys.argv[1])))))',input],{maxBuffer:20e6}));
 const app=initializeApp({apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'},`ui-${Date.now()}`);
 connectAuthEmulator(getAuth(app),'http://127.0.0.1:9099',{disableWarnings:true});const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const userId=(await createUserWithEmailAndPassword(getAuth(app),`ui-${Date.now()}@example.test`,'EmulatorOnly!1248')).user.uid;
 await loadPilotFixtureRules(userId);
 const root=`lojas/${userId}`,generationRoot=`${root}/v2_generations/${plan.generation}`;
 const commit=async writes=>{const r=await fetch('http://127.0.0.1:8080/v1/projects/demo-zenos-local/databases/(default)/documents:commit',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({writes})});if(!r.ok)throw Error(`Local fixture setup ${r.status}`);};
 const sourceRoot=`projects/${backup.project}/databases/(default)/documents/lojas/${backup.store}`;
 const prefix='projects/demo-zenos-local/databases/(default)/documents/';
 const documents=[...backup.documents.map(d=>({name:prefix+root+d.name.slice(sourceRoot.length),fields:d.fields})),...plan.documents.map(d=>({name:prefix+generationRoot+d.name.slice(plan.targetRoot.length),fields:d.fields}))];
 for(let i=0;i<documents.length;i+=100)await commit(documents.slice(i,i+100).map(update=>({update,currentDocument:{exists:false}})));
 const operation=decodeFixture({mapValue:{fields:backup.documents.find(d=>d.name.endsWith('/dados/operacao')).fields}});
 const control={mode:'v2',generation:plan.generation,sourceChecksum:backup.checksum,certificate:{sourceChecksum:backup.checksum,productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true}};
 await commit([{name:prefix+generationRoot,fields:typed({schema:2,state:'ready',sequence:0,sourceChecksum:backup.checksum,fieldManifest:plan.fieldManifest,fieldRevisions:operation._syncMeta.fieldRevisions}).mapValue.fields},{name:prefix+root+'/dados/storage_control',fields:typed(control).mapValue.fields}].map(update=>({update,currentDocument:{exists:false}})));
 const snapshot=await getOperationalSnapshot(db,userId);
 return {db,userId,root: generationRoot,backupChecksum:backup.checksum,operation:snapshot.data(),close:()=>deleteApp(app)};
}
