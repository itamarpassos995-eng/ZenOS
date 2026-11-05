import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,terminate} from 'firebase/firestore';

assert.equal(process.env.GCLOUD_PROJECT,'demo-zenos-local');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
const project='demo-zenos-local',origin='http://127.0.0.1:8080';
const apps=[],dbs=[],uids=[];
async function adminSet(path,fields){
 const response=await fetch(`${origin}/v1/projects/${project}/databases/(default)/documents:commit`,{
  method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
  body:JSON.stringify({writes:[{update:{name:`projects/${project}/databases/(default)/documents/${path}`,fields}}]})});
 assert.equal(response.ok,true,`Fixture failed: ${response.status}`);
}
try{
 for(let index=0;index<2;index++){
  const app=initializeApp({apiKey:'demo-key',projectId:project},`rollout-${index}-${Date.now()}`);apps.push(app);
  const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  const user=await createUserWithEmailAndPassword(auth,`rollout-${index}-${Date.now()}@example.test`,'EmulatorOnly!12345');
  uids.push(user.user.uid);
  const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);dbs.push(db);
 }
 const source=execFileSync('python3',['-c',
  'import sys;sys.path.insert(0,"scripts/recovery");from pilot_rules import generate,BASELINE;print(generate(generate(BASELINE,sys.argv[1]),sys.argv[2]),end="")',...uids],{encoding:'utf8'});
 const loaded=await fetch(`${origin}/emulator/v1/projects/${project}:securityRules`,{
  method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},
  body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:source}]}})});
 assert.equal(loaded.ok,true,`Rules compilation failed: ${loaded.status}`);
 let passed=0;
 for(let index=0;index<2;index++){
  const db=dbs[index],uid=uids[index],other=dbs[1-index];
  const operation=doc(db,'lojas',uid,'dados','operacao');
  await setDoc(operation,{produtos:[],clientes:[]});passed++;
  await assert.rejects(getDoc(doc(other,operation.path)),e=>e.code==='permission-denied');passed++;
  await assert.rejects(setDoc(doc(other,operation.path),{produtos:[]}),e=>e.code==='permission-denied');passed++;
  await adminSet(`lojas/${uid}/dados/storage_control`,{mode:{stringValue:'maintenance'},generation:{stringValue:'test'}});
  assert.equal((await getDoc(operation)).exists(),true);passed++;
  await assert.rejects(setDoc(operation,{produtos:[]}),e=>e.code==='permission-denied');passed++;
  await assert.rejects(setDoc(doc(db,'lojas',uid,'dados','storage_control'),{mode:'legacy'}),e=>e.code==='permission-denied');passed++;
  await setDoc(doc(db,'lojas',uid,'dados','configuracoes'),{perfilLoja:{nome:'Emulator'}});passed++;
 }
 console.log(JSON.stringify({passed,rulesCompiled:true,stores:2,productionRequests:0}));
}finally{
 await Promise.all(dbs.map(db=>terminate(db)));
 await Promise.all(apps.map(app=>deleteApp(app)));
}
