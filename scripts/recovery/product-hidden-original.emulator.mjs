import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDocFromServer,updateDoc} from 'firebase/firestore';
import {diagnosticarCadastroOcultoServidor} from '../../src/core/productRecoveryDiagnosis.js';
import {prepararReativacaoOriginal} from '../../src/core/productRecoveryCore.js';
import {verificarRecomposicaoOriginal} from '../../src/core/productOriginalRebuildCheck.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';
import {clearOperationalSession} from '../../src/core/operationalRepository.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw new Error('Apenas Firestore Emulator, não executar em produção.');
const tag=Date.now().toString(),config={apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'};
const a=initializeApp(config,'orig-a-'+tag),b=initializeApp(config,'orig-b-'+tag);
try{
 const authA=getAuth(a),authB=getAuth(b);
 connectAuthEmulator(authA,'http://127.0.0.1:9099',{disableWarnings:true});
 connectAuthEmulator(authB,'http://127.0.0.1:9099',{disableWarnings:true});
 const email='original-'+tag+'@example.test',pass='Test-Only!123';
 const u=(await createUserWithEmailAndPassword(authA,email,pass)).user;
 await signInWithEmailAndPassword(authB,email,pass);
 const dbA=getFirestore(a),dbB=getFirestore(b);
 connectFirestoreEmulator(dbA,'127.0.0.1',8080);
 connectFirestoreEmulator(dbB,'127.0.0.1',8080);
 const uid=u.uid,id='PROD-66346',p={id,sku:'SKU-66346',nome:'Pneu Original',marca:'A',unidadeMedida:'UN',
  ativo:false,estoque:7,estoqueVitrine:2,estoqueGalpao:5,custoBRL:180,precoBRL:325,inativadoEm:'2026-10-19T12:00:00Z'};
 const docRef=doc(dbA,'lojas',uid,'dados','operacao');
 const idx=doc(dbA,'lojas',uid,'produto_indices','sku_test_original');
 const sig=doc(dbA,'lojas',uid,'produto_indices','sig_test_original');
 await setDoc(docRef,{produtos:[p],historicoVendas:[],historicoCompras:[],canary:'preserve'},
  {merge:true});
 await setDoc(idx,{produtoId:id,sku:p.sku,nome:p.nome,ativo:true});
 await setDoc(sig,{produtoId:id,sku:'',nome:p.nome,ativo:true});
 const diagnostic=await diagnosticarCadastroOcultoServidor({db:dbB,userId:uid,ownerId:id});
 assert.equal(diagnostic.status,'original_inativo',JSON.stringify(diagnostic));
 const original=(await getDocFromServer(docRef)).data().produtos[0];
 assert.deepEqual(original,p); // diagnóstico não gravou nem alterou o documento
 const plan=prepararReativacaoOriginal({diagnostico:diagnostic,catalogo:[p],ownerId:id});
 assert.equal(plan.ok,true);
 const confirmed=await persistV1BusinessOperationSafe({
  db:dbB,userId:uid,changes:[{field:'produtos',baseValue:[p],value:plan.lista}],
  guards:[{type:'entity_unchanged',field:'produtos',entityId:id,entityKey:'id',expected:p}],
  operationKey:'reactivation-test:original',
 });
 assert.equal(confirmed.cloudOk,true,confirmed.error?.message);
 const after=(await getDocFromServer(docRef)).data();
 assert.equal(after.produtos[0].ativo,true);
 for(const key of ['id','sku','nome','estoque','estoqueVitrine','estoqueGalpao','custoBRL','precoBRL','inativadoEm'])
  assert.deepEqual(after.produtos[0][key],p[key],key);
 assert.equal(after.canary,'preserve');
 assert.equal((await getDocFromServer(idx)).data().ativo,true);
 assert.equal((await getDocFromServer(sig)).data().ativo,true);
 const replay=await persistV1BusinessOperationSafe({
  db:dbB,userId:uid,changes:[{field:'produtos',baseValue:[p],value:plan.lista}],
  guards:[{type:'entity_unchanged',field:'produtos',entityId:id,entityKey:'id',expected:p}],
  operationKey:'reactivation-test:original',
 });
 assert.equal(replay.cloudOk,true,replay.error?.message);
 assert.equal(replay.alreadyCommitted,true);
 // Depois que outro terminal altera preço, guard deve impedir substituição
 const modified={...after.produtos[0],precoBRL:340};
 await updateDoc(docRef,{produtos:[modified]});
 const stale=await persistV1BusinessOperationSafe({
  db:dbB,userId:uid,changes:[{field:'produtos',baseValue:[p],value:plan.lista}],
  guards:[{type:'entity_unchanged',field:'produtos',entityId:id,entityKey:'id',expected:p}],
  operationKey:'reactivation-test:conflict',
 });
 assert.equal(stale.cloudOk,false,'Conflito remoto não foi bloqueado');
 assert.equal((await getDocFromServer(docRef)).data().produtos[0].precoBRL,340);
 // Caso real: índice registrado pelo Novo Produto, mas cadastro não existe.
 // Outro terminal recompõe usando exatamente o mesmo ID (sem apagar a reserva).
 const missingId='PROD-LEGACY-1X9720V',missingSku='SKU-63346';
 const missingName='Pneu 130/70-17 - KONTROL';
 const missIdx=doc(dbA,'lojas',uid,'produto_indices','sku_orfao_63346');
 const missSig=doc(dbA,'lojas',uid,'produto_indices','sig_orfao_63346');
 await setDoc(missIdx,{produtoId:missingId,sku:missingSku,nome:missingName,ativo:true});
 await setDoc(missSig,{produtoId:missingId,sku:'',nome:missingName,ativo:true});
 const candidate=await verificarRecomposicaoOriginal({db:dbB,userId:uid,ownerId:missingId});
 assert.equal(candidate.ok,true,JSON.stringify(candidate));
 assert.equal(candidate.ownerId,missingId);
 assert.equal(candidate.sku,missingSku);
 const snapshot=(await getDocFromServer(docRef)).data();
 const restored={id:missingId,sku:missingSku,nome:missingName,marca:'',unidadeMedida:'UN',
  ativo:true,estoque:0,estoqueVitrine:0,estoqueGalpao:0,custoBRL:140,precoBRL:240};
 const repaired=await persistV1BusinessOperationSafe({
  db:dbB,userId:uid,changes:[{field:'produtos',baseValue:snapshot.produtos,
    value:[restored,...snapshot.produtos]}],operationKey:'recompor-original:'+missingId
 });
 assert.equal(repaired.cloudOk,true,repaired.error?.message);
 const visible=(await getDocFromServer(docRef)).data();
 assert.equal(visible.produtos.filter(x=>x.id===missingId).length,1);
 assert.equal(visible.produtos.find(x=>x.id===missingId).estoque,0);
 assert.equal(visible.produtos.find(x=>x.id===id).precoBRL,340);
 assert.equal((await getDocFromServer(missIdx)).data().produtoId,missingId);
 const again=await verificarRecomposicaoOriginal({db:dbA,userId:uid,ownerId:missingId});
 assert.equal(again.ok,false,'Não permitir cadastrar novamente após reaparecer no catálogo');
 clearOperationalSession(dbA,uid);clearOperationalSession(dbB,uid);
 console.log('PASS: two-terminals, same-ID reactivation, all inventory untouched, replay idempotent, stale remote blocked');
}finally{await deleteApp(a);await deleteApp(b);}
