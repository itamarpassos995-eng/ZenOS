import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc,deleteDoc} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {persistV1BusinessOperationSafe} from '../src/core/productionSync.js';
import {getOperationalSnapshot} from '../src/core/operationalRepository.js';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp:adminApp}=require('firebase-admin/app');
const {getFirestore:adminDb}=require('firebase-admin/firestore');
const {getAuth:adminAuth}=require('firebase-admin/auth');
const local=v=>/^(127\.0\.0\.1|localhost):\d+$/.test(v||'');
if(process.env.GCLOUD_PROJECT!=='demo-zenos-local'||!local(process.env.FIRESTORE_EMULATOR_HOST)||!local(process.env.FIREBASE_AUTH_EMULATOR_HOST))throw Error('Only local demo emulators allowed.');
const admin=adminApp({projectId:'demo-zenos-local'},'commerce-pdv-tests'),adb=adminDb(admin),apps=[];
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
async function client(name,credentials){
 const app=initializeApp({projectId:'demo-zenos-local',apiKey:'demo-key',authDomain:'demo-zenos-local.firebaseapp.com'},name);apps.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 await signInWithEmailAndPassword(auth,credentials.email,credentials.password);
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const fns=getFunctions(app,'southamerica-east1');connectFunctionsEmulator(fns,'127.0.0.1',5001);
 return {db,uid:auth.currentUser.uid,api:async data=>(await httpsCallable(fns,'commercePedidosAdmin')(data)).data};
}
try{
 for(const mode of ['legacy','v2']){
  const credentials={email:`pdv-${mode}-${crypto.randomUUID()}@example.test`,password:'EmulatorOnly!1248'};
  const user=await adminAuth(admin).createUser({...credentials,emailVerified:true});
  const a=await client('pdv-a-'+mode,credentials),b=await client('pdv-b-'+mode,credentials),root=`lojas/${user.uid}`;
  await adb.doc(`commerce_operator_access/${user.uid}`).set({ativo:true,papel:'admin',lojaId:user.uid});
  await adb.doc(`${root}/commerce_private/licenca`).set({status:'ativo',ativacaoConfirmadaServidor:true});
  const id=(mode==='legacy'?'ab':'cd').repeat(16),vendaId=`COMMERCE-${id}`;
  await adb.doc(`${root}/commerce_pedidos/${id}`).set({status:'recebido',cliente:{nome:'Teste'},itens:[{produtoId:'P1',quantidade:2,precoUnitarioCentavos:1250}]});
  const product={id:'P1',sku:'S1',nome:'Produto de teste',estoque:5,estoqueVitrine:0,estoqueGalpao:5,precoBRL:12.5};
  const operation={produtos:[product],historicoVendas:[]};
  await adb.doc(`${root}/dados/operacao`).set(operation);
  let generationRoot;
  if(mode==='v2'){
   const generation='ef'.repeat(12),sourceChecksum='fixture-only';generationRoot=`${root}/v2_generations/${generation}`;
   await adb.doc(`${root}/dados/storage_control`).set({mode,generation,sourceChecksum,certificate:{sourceChecksum,productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true}});
   await adb.doc(generationRoot).set({schema:2,state:'ready',sequence:0,sourceChecksum,fieldManifest:{produtos:{kind:'array',collection:'produtos',count:1},historicoVendas:{kind:'array',collection:'vendas',count:0}},fieldRevisions:{produtos:0,historicoVendas:0}});
   await adb.doc(`${generationRoot}/produtos/P1`).set({legacyField:'produtos',legacyIndex:0,version:0,deleted:false,data:product});
  }
  const draft=await a.api({action:'prepararPDV',id});assert.equal(draft.vendaId,vendaId);
  assert.deepEqual((await adb.doc(`${root}/dados/operacao`).get()).data(),operation);
  await assert.rejects(setDoc(doc(a.db,root,'commerce_faturamentos',id),{pedidoId:id,vendaId,criadoEm:draft.preparadoEm}));
  await assert.rejects(getDoc(doc(a.db,'lojas','other-shop','commerce_faturamentos',id)));
  await assert.rejects(a.api({action:'confirmarFaturamento',id}));
  const sale={id:vendaId,estado:'concluida',tipoDocumento:'venda',origem:'commerce',commercePedidoId:id,createdAt:draft.preparadoEm,totalBRL:25};
  const changes=[{field:'produtos',baseValue:[product],value:[{...product,estoque:3,estoqueGalpao:3}]},
   {field:'historicoVendas',baseValue:[],value:[sale]}];
  const guards=[{type:'commerce_order_once',orderId:id,saleId:vendaId}];
  const financialEntries=[{id:`VENDA-${vendaId}-DINHEIRO`,tipo:'venda',referenciaId:vendaId,valor:25,afetaCaixaFisico:true}];
  const stockEvents=[{id:`EST-${vendaId}`,produtoId:'P1',sku:'S1',tipo:'venda',detalhes:{deposito:2}}];
  // Both terminals begin from the same confirmed base.
  await Promise.all([getOperationalSnapshot(a.db,user.uid),getOperationalSnapshot(b.db,user.uid)]);
  const run=x=>persistV1BusinessOperationSafe({db:x.db,userId:user.uid,changes,guards,financialEntries,stockEvents,operationKey:`pdv:${vendaId}`});
  const results=await Promise.all([run(a),run(b)]);
  assert.equal(results.filter(r=>r.cloudOk).length,1);
  assert.equal(results.find(r=>!r.cloudOk).error.code,'ZENOS_COMMERCE_ALREADY_BILLED');
  const actual=(await getOperationalSnapshot(a.db,user.uid)).data();
  assert.equal(actual.produtos[0].estoque,3);assert.equal(actual.historicoVendas.length,1);
  assert.equal((await adb.collection(`${root}/financeiro_livro`).get()).size,1);
  assert.equal((await adb.doc(`${root}/commerce_faturamentos/${id}`).get()).data().vendaId,vendaId);
  // No deletion or overwrite of durable receipts, even by the owning shop.
  await assert.rejects(deleteDoc(doc(a.db,root,'commerce_faturamentos',id)));
  await assert.rejects(setDoc(doc(a.db,root,'commerce_faturamentos',id),{pedidoId:id,vendaId,criadoEm:draft.preparadoEm}));
  assert.equal((await a.api({action:'confirmarFaturamento',id})).faturado,true);
  assert.equal((await b.api({action:'prepararPDV',id})).faturado,true);
  assert.equal((await run(b)).cloudOk,false);
  // Durable receipt still fences a retry after the sale is tombstoned/removed.
  if(mode==='legacy')await adb.doc(`${root}/dados/operacao`).update({historicoVendas:[],_syncMeta:{}});
  else await adb.doc(`${generationRoot}/vendas/${vendaId}`).update({deleted:true});
  await assert.rejects(a.api({action:'prepararPDV',id}));
  console.log(`PASSOU: Commerce → PDV ${mode}: dois terminais, uma venda/baixa/entrada, trava permanente, recuperação e histórico protegido.`);
 }
}finally{for(const app of apps)await deleteApp(app);}
