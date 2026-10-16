/* Teste real com 2 usuarios e emuladores — NUNCA usar Firebase de producao.
GCLOUD_PROJECT=demo-zenos-local ZENOS_COMMERCE_MEDIA_ENABLED=false firebase emulators:exec --project demo-zenos-local \
 --config firebase.commerce.homologacao.json --only auth,firestore,functions,storage \
 'node scripts/commerce-tenant-hml-emulator-check.mjs'
*/
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getStorage,connectStorageEmulator,ref,uploadBytes} from 'firebase/storage';

const local=s=>/^(127\.0\.0\.1|localhost):\d+$/.test(String(s||''));
if(process.env.GCLOUD_PROJECT!=='demo-zenos-local' ||
 !local(process.env.FIRESTORE_EMULATOR_HOST) ||
 !local(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
 !local(process.env.FIREBASE_STORAGE_EMULATOR_HOST))
 throw Error('Ambiente inseguro: teste aceita apenas emuladores locais demo-zenos-local.');
const cfg={apiKey:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com',
 projectId:'demo-zenos-local',storageBucket:'demo-zenos-local.appspot.com',appId:'1:000000000000:web:zenoscommerce'};
const apps=[];
async function client(name){
 const app=initializeApp(cfg,name);apps.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const fns=getFunctions(app,'southamerica-east1');connectFunctionsEmulator(fns,'127.0.0.1',5001);
 const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9199);
 const uid=(await signInAnonymously(auth)).user.uid;
 return {uid,db,fns,storage};
}
async function forbid(p){
 await assert.rejects(p,e=>/permission-denied|unauthorized|PERMISSION_DENIED|storage\/unauthorized/.test(String(e?.code||'')+' '+String(e?.message||'')));
}
try{
 const a=await client('commerce-loja-A'),b=await client('commerce-loja-B');
 assert.notEqual(a.uid,b.uid);
 for(const x of [a,b]){
  await setDoc(doc(x.db,'lojas',x.uid),{tipo:'homologacao'});
  await setDoc(doc(x.db,'lojas',x.uid,'dados','operacao'),{produtos:[{id:'P-1',nome:'Produto demo',estoque:2}]});
  assert.equal((await getDoc(doc(x.db,'lojas',x.uid,'dados','operacao'))).data().produtos[0].id,'P-1');
 }
 await forbid(getDoc(doc(a.db,'lojas',b.uid,'dados','operacao')));
 await forbid(setDoc(doc(a.db,'lojas',b.uid,'dados','operacao'),{produtos:[]}));
 await forbid(getDoc(doc(b.db,'lojas',a.uid)));
 await forbid(setDoc(doc(b.db,'lojas',a.uid),{status:'alterado'}));
 await forbid(getDoc(doc(a.db,'lojas',a.uid,'commerce_private','rascunho')));
 await forbid(setDoc(doc(a.db,'lojas',a.uid,'commerce_private','licenca'),{status:'ativo',ativacaoConfirmadaServidor:true}));
 await forbid(uploadBytes(ref(a.storage,'commerce/'+a.uid+'/produtos/P-1/galeria/a.webp'),new Uint8Array([0,1,2]),{contentType:'image/webp'}));
 await forbid(uploadBytes(ref(a.storage,'commerce/'+b.uid+'/produtos/P-1/galeria/a.webp'),new Uint8Array([0,1,2]),{contentType:'image/webp'}));
 const fnA=httpsCallable(a.fns,'commerceStudio'),fnB=httpsCallable(b.fns,'commerceStudio');
 const init=(await fnA({action:'consultar'})).data;
 assert.equal(init.publicacaoHabilitada,false);assert.equal(init.licenca.ativo,false);
 await assert.rejects(fnA({action:'consultar',lojaId:b.uid}),e=>/invalid-argument/.test(String(e.code)));
 const saved=(await fnA({action:'salvarRascunho',expectedRevision:0,rascunho:{aparencia:{nomeLoja:'A'},regras:{}}})).data;
 assert.equal(saved.revision,1);
 assert.equal((await fnA({action:'consultar'})).data.revision,1);
 assert.equal((await fnB({action:'consultar'})).data.revision,0);
 await forbid(getDoc(doc(b.db,'lojas',a.uid,'commerce_private','rascunho')));
 console.log('PASSOU: lojas A/B isoladas, Store privado, Storage negado e callable com revisao.');
}finally{for(const app of apps)await deleteApp(app);}
