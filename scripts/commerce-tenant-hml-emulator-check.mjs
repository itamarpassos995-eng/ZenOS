/* Teste real com 2 usuarios e emuladores — NUNCA usar Firebase de producao.
GCLOUD_PROJECT=demo-zenos-local ZENOS_COMMERCE_MEDIA_ENABLED=false firebase emulators:exec --project demo-zenos-local \
 --config firebase.commerce.homologacao.json --only auth,firestore,functions,storage \
 'node scripts/commerce-tenant-hml-emulator-check.mjs'
*/
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp:initAdmin}=require('firebase-admin/app');
const {getFirestore:adminFirestore}=require('firebase-admin/firestore');
const {getAuth:adminAuth}=require('firebase-admin/auth');
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInAnonymously,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getStorage,connectStorageEmulator,ref,uploadBytes,getBytes} from 'firebase/storage';

const local=s=>/^(127\.0\.0\.1|localhost):\d+$/.test(String(s||''));
if(process.env.GCLOUD_PROJECT!=='demo-zenos-local' ||
 !local(process.env.FIRESTORE_EMULATOR_HOST) ||
 !local(process.env.FIREBASE_AUTH_EMULATOR_HOST) ||
 !local(process.env.FIREBASE_STORAGE_EMULATOR_HOST))
 throw Error('Ambiente inseguro: teste aceita apenas emuladores locais demo-zenos-local.');
const cfg={apiKey:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com',
 projectId:'demo-zenos-local',storageBucket:'demo-zenos-local.appspot.com',appId:'1:000000000000:web:zenoscommerce'};
const apps=[];
async function client(name,credentials){
 const app=initializeApp(cfg,name);apps.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const fns=getFunctions(app,'southamerica-east1');connectFunctionsEmulator(fns,'127.0.0.1',5001);
 const storage=getStorage(app);connectStorageEmulator(storage,'127.0.0.1',9199);
 const uid=(await (credentials?signInWithEmailAndPassword(auth,credentials.email,credentials.password):signInAnonymously(auth))).user.uid;
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
  await setDoc(doc(x.db,'lojas',x.uid,'dados','operacao'),{produtos:[{id:'P-1',nome:'Produto demo',estoque:2,imagem:'data:image/webp;base64,ORIGINAL_PRESERVADO'}]});
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
 const admin=initAdmin({projectId:cfg.projectId},'commerce-test-admin');
 const adb=adminFirestore(admin);
 const identities=[];
 for(const shop of [a,b]){
  const email=`admin-${shop.uid}@commerce.invalid`,password='Hml-'+crypto.randomUUID();
  const user=await adminAuth(admin).createUser({email,password,emailVerified:true});
  const operator=await client('operator-'+shop.uid,{email,password});
  await adb.doc(`commerce_operator_access/${user.uid}`).set({ativo:true,papel:'admin',lojaId:shop.uid});
  identities.push(operator);
 }
 const [operatorA,operatorB]=identities;
 await forbid(httpsCallable(a.fns,'commerceStudio')({action:'consultar'}));
 await forbid(httpsCallable(a.fns,'commerceMidia')({action:'enviarFotoProduto'}));
 await forbid(getDoc(doc(operatorA.db,'commerce_operator_access',operatorA.uid)));
 await forbid(setDoc(doc(operatorA.db,'commerce_operator_access',operatorA.uid),{ativo:true,papel:'admin',lojaId:b.uid}));
 await forbid(setDoc(doc(a.db,'commerce_operator_access',a.uid),{ativo:true,papel:'admin',lojaId:a.uid}));
 const fnA=httpsCallable(operatorA.fns,'commerceStudio'),fnB=httpsCallable(operatorB.fns,'commerceStudio');
 const grant=adb.doc(`commerce_operator_access/${operatorA.uid}`);
 await grant.update({papel:'operador'});
 await forbid(fnA({action:'consultar',papel:'admin'}));
 await forbid(httpsCallable(operatorA.fns,'commerceMidia')({action:'enviarFotoProduto'}));
 await grant.update({papel:'admin',ativo:false});
 await forbid(fnA({action:'consultar'}));
 await grant.update({ativo:true});
 const init=(await fnA({action:'consultar'})).data;
 assert.equal(init.publicacaoHabilitada,false);assert.equal(init.licenca.ativo,false);
 await assert.rejects(fnA({action:'consultar',lojaId:b.uid}),e=>/invalid-argument/.test(String(e.code)));
 const saved=(await fnA({action:'salvarRascunho',expectedRevision:0,rascunho:{aparencia:{nomeLoja:'A'},regras:{}}})).data;
 assert.equal(saved.revision,1);
 assert.equal((await fnA({action:'consultar'})).data.revision,1);
 assert.equal((await fnB({action:'consultar'})).data.revision,0);
 // Duas abas disputando a mesma revisão: apenas uma pode persistir.
 const concorrentes=await Promise.allSettled(['A-aba-1','A-aba-2'].map(nomeLoja=>
  fnA({action:'salvarRascunho',expectedRevision:1,rascunho:{aparencia:{nomeLoja},regras:{}}})));
 assert.equal(concorrentes.filter(r=>r.status==='fulfilled').length,1);
 const rejeitada=concorrentes.find(r=>r.status==='rejected');
 assert.match(String(rejeitada?.reason?.code),/aborted/);
 assert.equal((await fnA({action:'consultar'})).data.revision,2);
 assert.equal((await fnB({action:'consultar'})).data.revision,0);

 await forbid(getDoc(doc(b.db,'lojas',a.uid,'commerce_private','rascunho')));
 if(process.env.ZENOS_COMMERCE_MEDIA_ENABLED==='true'){
  const webp='UklGRmIAAABXRUJQVlA4IFYAAACwBgCdASp4AHgAPm02mUmkIyKhIIgAgA2JaW7hdJlwAAE9tiLxBUc9sReIKjntiLxBUc9sReIKjntiLxBNgAD+/paf//tTBJGUv//dBlnDdIAAAAAAAA==';
  const media=httpsCallable(operatorA.fns,'commerceMidia');
  const payload={action:'enviarFotoProduto',produtoId:'P-1',principalBase64:webp,miniaturaBase64:webp};
  const uploaded=(await media(payload)).data;
  assert.equal(uploaded.status,'privado');
  assert.ok(uploaded.storagePath.startsWith('commerce/'+a.uid+'/'));
  assert.equal((await media(payload)).data.storagePath,uploaded.storagePath);
  assert.ok(Date.parse(uploaded.expiraEm)>Date.now()+29*60_000);
  assert.ok(Date.parse(uploaded.expiraEm)<=Date.now()+30*60_000);
  await forbid(getBytes(ref(a.storage,uploaded.storagePath)));
  await forbid(getBytes(ref(b.storage,uploaded.storagePath)));
  await assert.rejects(media({...payload,produtoId:'produto-ausente'}),e=>/permission-denied/.test(e.code));
  await assert.rejects(media({...payload,principalBase64:'AAAA'}),e=>/invalid-argument/.test(e.code));
  const rule={publicado:true,galeriaImagens:[{...uploaded,ordem:0}]};
  await fnA({action:'salvarRascunho',expectedRevision:2,rascunho:{aparencia:{nomeLoja:'Galeria A'},regras:{'P-1':rule}}});
  const restored=(await fnA({action:'consultar'})).data;
  assert.equal(restored.regras['P-1'].galeriaImagens[0].storagePath,uploaded.storagePath);
  assert.match(restored.regras['P-1'].galeriaImagens[0].miniaturaUrl,/Signature=/);
  await assert.rejects(fnB({action:'salvarRascunho',expectedRevision:0,rascunho:{aparencia:{},regras:{'P-1':rule}}}),e=>/invalid-argument|permission-denied/.test(e.code));
  const original=(await media({...payload,origem:'cadastro'})).data;
  await fnA({action:'salvarRascunho',expectedRevision:3,rascunho:{aparencia:{},regras:{'P-1':{...rule,fotoCadastroStoragePath:original.storagePath}}}});
  assert.match((await fnA({action:'consultar'})).data.regras['P-1'].fotoCadastroPreviewUrl,/Signature=/);
  assert.equal((await getDoc(doc(a.db,'lojas',a.uid,'dados','operacao'))).data().produtos[0].imagem,'data:image/webp;base64,ORIGINAL_PRESERVADO');
  console.log('PASSOU: upload/miniatura privados, retry, persistência, foto cadastro, URLs com prazo e rejeição cruzada. IAM/expiração GCS real não simulados.');
 }
 console.log('PASSOU: autorização individual, papel de operador negado, revogação imediata e autoautorização bloqueada.');
 console.log('PASSOU: lojas A/B isoladas, Store privado, Storage negado e callable com revisao.');
}finally{for(const app of apps)await deleteApp(app);}
