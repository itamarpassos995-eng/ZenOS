import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from 'firebase/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.GCLOUD_PROJECT !== 'demo-zenos-local') {
  throw new Error('Only the local demo Emulator is permitted.');
}
const modulePath = process.argv[2];
if (!modulePath) throw new Error('Supply the reviewed tablesV1.js path.');
const {garantirMesasV1, atualizarMesaV1} = await import(pathToFileURL(modulePath));
const stamp = Date.now();
const cfg = {apiKey:'demo-key', projectId:'demo-zenos-local', authDomain:'demo-zenos-local.firebaseapp.com'};
const apps = [initializeApp(cfg,`mesas-a-${stamp}`), initializeApp(cfg,`mesas-b-${stamp}`)];
try {
  const auths = apps.map(app=>getAuth(app));
  const dbs = apps.map(app=>getFirestore(app));
  auths.forEach(auth=>connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true}));
  dbs.forEach(db=>connectFirestoreEmulator(db,'127.0.0.1',8080));
  const email=`recovery-${stamp}@example.test`, pass='EmulatorOnly!4927';
  const cred = await createUserWithEmailAndPassword(auths[0],email,pass);
  await signInWithEmailAndPassword(auths[1],email,pass);
  const userId=cred.user.uid;
  const initial = await Promise.all(dbs.map(db=>garantirMesasV1({db,userId})));
  assert.equal(initial.filter(Boolean).length,1,'exactly one create-only initialization');
  const increment=(db,mesaId,label)=>atualizarMesaV1({db,userId,mesaId,operador:{id:label,nome:label},
    mutator:m=>({...m,status:'ocupada',itens:[...m.itens,{produtoId:label,qtd:1,preco:10}]})});
  await Promise.all([increment(dbs[0],'M1','A'),increment(dbs[1],'M1','B')]);
  await Promise.all([increment(dbs[0],'M1','C'),increment(dbs[0],'M1','D')]);
  await Promise.all([increment(dbs[0],'M2','E'),increment(dbs[1],'M3','F')]);
  assert.equal(await garantirMesasV1({db:dbs[1],userId,mesasIniciais:[{id:'M1',itens:[]}]}),false);
  const mesas = (await getDoc(doc(dbs[0],'lojas',userId,'dados','mesas'))).data().mesas;
  assert.deepEqual(mesas.find(m=>m.id==='M1').itens.map(i=>i.produtoId).sort(),['A','B','C','D']);
  assert.equal(mesas.find(m=>m.id==='M1').version,4);
  assert.equal(mesas.find(m=>m.id==='M2').itens[0].produtoId,'E');
  assert.equal(mesas.find(m=>m.id==='M3').itens[0].produtoId,'F');
  console.log(JSON.stringify({pr31CreateOnly:true,sameTableTwoTerminals:true,sameBrowserSerialized:true,
    independentTablesPreserved:true,legacyReimportBlocked:true,productionWrites:0}));
} finally {
  await Promise.all(apps.map(deleteApp));
}
