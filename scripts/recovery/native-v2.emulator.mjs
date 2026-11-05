import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,terminate} from 'firebase/firestore';
import {provisionNativeV2} from '../../operational-functions/src/nativeV2.js';
import {getOperationalSnapshot,clearOperationalSession} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';

const require=createRequire(new URL('../../operational-functions/package.json',import.meta.url));
const {initializeApp:initializeAdmin,deleteApp:deleteAdmin}=require('firebase-admin/app');
const {getFirestore:adminFirestore,Timestamp}=require('firebase-admin/firestore');

assert.equal(process.env.GCLOUD_PROJECT,'demo-zenos-local');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
const project='demo-zenos-local',admin=initializeAdmin({projectId:project},'native-v2-test');
const adb=adminFirestore(admin),apps=[],dbs=[],uids=[];
const cache=new Map();globalThis.localStorage={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,String(v))};
try {
 for(let i=0;i<3;i++){
  const app=initializeApp({projectId:project,apiKey:'demo-key'},`native-${i}`);apps.push(app);
  const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  const user=await createUserWithEmailAndPassword(auth,`native-${i}-${Date.now()}@example.test`,'EmulatorOnly!12345');uids.push(user.user.uid);
  const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);dbs.push(db);
 }
 const source=execFileSync('python3',['-c',
  'import sys;sys.path.insert(0,"scripts/recovery");from pilot_rules import generate,BASELINE;print(generate(generate(BASELINE,"central"),"vipe",native=True),end="")'],{encoding:'utf8'});
 const r=await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}:securityRules`,{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content:source}]}})});
 assert(r.ok,await r.text());
 await adb.doc('system/storage_policy').set({newStoreSchema:2,nativeProtectionReady:true,enabledAt:Timestamp.fromMillis(100),frontendCommit:'a'.repeat(40),rulesSha256:'b'.repeat(64)});
 await assert.rejects(setDoc(doc(dbs[0],'system/storage_policy'),{newStoreSchema:2}),e=>e.code==='permission-denied');
 await assert.rejects(getDoc(doc(dbs[0],'system/storage_policy')),e=>e.code==='permission-denied');
 for(const uid of uids)await adb.doc(`lojas/${uid}`).set({createdAtServer:Timestamp.fromMillis(200)});
 const request=uid=>({auth:{uid,token:{firebase:{sign_in_provider:'password'}}},data:{}});
 const concurrent=await Promise.all([provisionNativeV2(adb,request(uids[0])),provisionNativeV2(adb,request(uids[0]))]);
 assert.equal(concurrent.filter(x=>x.status==='created').length,1);
 const control=(await adb.doc(`lojas/${uids[0]}/dados/storage_control`).get()).data();
 const snapshot=await getOperationalSnapshot(dbs[0],uids[0]);
 assert.equal(snapshot.data().vendedores[0].pinTrocaObrigatoria,true);
 assert.deepEqual(snapshot.data().clientes,[]);
 assert.deepEqual(snapshot.data().produtos,[]);
 await assert.rejects(setDoc(doc(dbs[0],'lojas',uids[0],'dados','operacao'),{clientes:[]}),e=>e.code==='permission-denied');
 await assert.rejects(setDoc(doc(dbs[0],'lojas',uids[0],'dados','storage_control'),{mode:'legacy'}),e=>e.code==='permission-denied');
 await assert.rejects(getDoc(doc(dbs[1],'lojas',uids[0],'dados','storage_control')),e=>e.code==='permission-denied');
 await assert.rejects(setDoc(doc(dbs[1],'lojas',uids[0],'v2_generations',control.generation,'clientes','bad'),{data:{id:'bad'}}),e=>e.code==='permission-denied');
 const saved=await persistV1BusinessOperationSafe({db:dbs[0],userId:uids[0],operationKey:'native-first-client',changes:[{field:'clientes',baseValue:[],value:[{id:'first-client',nome:'Native test'}]}]});
 assert.equal(saved.cloudOk,true,saved.error?.message);
 const product=await persistV1BusinessOperationSafe({db:dbs[0],userId:uids[0],operationKey:'native-first-product',changes:[{field:'produtos',baseValue:[],value:[{id:'first-product',nome:'Native product',preco:39990,estoque:20}]}]});
 assert.equal(product.cloudOk,true,product.error?.message);
 clearOperationalSession(dbs[0],uids[0]);
 const reopened=(await getOperationalSnapshot(dbs[0],uids[0])).data();
 assert.equal(reopened.clientes[0].id,'first-client');
 assert.equal(reopened.produtos[0].preco,39990);
 assert.equal((await adb.doc(`lojas/${uids[0]}/dados/operacao`).get()).exists,false);
 // Old active V1 accounts keep their route and writes; callable does not migrate.
 await setDoc(doc(dbs[1],'lojas',uids[1],'dados','operacao'),{produtos:[{id:'preserve'}]});
 assert.equal((await provisionNativeV2(adb,request(uids[1]))).status,'existing-legacy');
 await setDoc(doc(dbs[1],'lojas',uids[1],'dados','operacao'),{produtos:[{id:'preserve'}],clientes:[]});
 assert.equal((await adb.doc(`lojas/${uids[1]}/dados/storage_control`).get()).exists,false);
 // No silent empty reset for an old damaged account.
 await adb.doc(`lojas/${uids[2]}`).set({createdAtServer:Timestamp.fromMillis(99)});
 await assert.rejects(provisionNativeV2(adb,request(uids[2])),{code:'failed-precondition'});
 console.log('PASS native V2: concurrent provisioning, strict rules, first real client save/reload, V1 preservation, old-account refusal; production requests=0');
} finally {
 dbs.forEach((db,i)=>clearOperationalSession(db,uids[i]));
 await Promise.all(dbs.map(db=>terminate(db)));await Promise.all(apps.map(app=>deleteApp(app)));await adb.terminate();await deleteAdmin(admin);
}
