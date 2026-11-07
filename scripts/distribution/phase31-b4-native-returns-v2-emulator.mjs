// Strictly synthetic B.4 internal return proof, without any external settlement.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {createRequire} from 'node:module';
const requireAdmin=createRequire(new URL('../../operational-functions/package.json',import.meta.url));
const {initializeApp:initializeAdminApp,deleteApp:deleteAdminApp}=requireAdmin('firebase-admin/app');
const {getFirestore:adminFirestore}=requireAdmin('firebase-admin/firestore');
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc} from 'firebase/firestore';
import {getOperationalSnapshot,clearOperationalSession} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';
import {pdvCreditLink,validateFinanceLink} from '../../src/core/distribution/phase31NativeFinanceLinks.js';
import {prepareVerifiedCreditAllocations} from '../../src/core/distribution/phase31CreditAllocation.js';
import {nativeReturnLineageLink} from '../../src/core/distribution/phase31NativeFinanceLinks.js';
import {classifySaleReturnHistory} from '../../src/core/distribution/phase31ReturnLineage.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw Error('B3_NATIVE_REFUSES_PRODUCTION');
const application=initializeApp({apiKey:'demo-key',projectId:'demo-zenos-local',
 authDomain:'demo-zenos-local.firebaseapp.com'},'b4-return-'+Date.now());
const auth=getAuth(application),db=getFirestore(application);
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8080);
// Admin SDK is used ONLY for privileged synthetic migration fixture setup.
// All actual business transactions below MUST use the signed-in client SDK and rules.
const fixtureAdmin=initializeAdminApp({projectId:'demo-zenos-local'},'b4-seed-'+Date.now());
const fixtureDb=adminFirestore(fixtureAdmin);
const uid=(await createUserWithEmailAndPassword(auth,
 'b4-return-'+Date.now()+'@example.test','EmulatorOnly!1248')).user.uid;
const generation='0123456789abcdef01234567',root=['lojas',uid,'v2_generations',generation];
const client={id:'C1',nome:'Cliente sintético B3',limiteCreditoBRL:2000,saldoDevedorBRL:0};
const sale={id:'V1',clienteId:'C1',clienteNome:client.nome,tipoDocumento:'venda',
 estado:'concluida',moedaDocumento:'BRL',totalOriginal:1000,totalBRL:1000,itens:[{id:'IT1',produtoOriginalId:'P1',qtd:2,qtdDevolvida:0}],
 createdAt:'2026-11-07T02:00:00.000Z',
 pagamentos:[{id:'CR1',formaId:'crediario',moedaOrigem:'BRL',valorOriginal:1000,
  valorConvertidoBRL:1000,taxaCambioAplicada:1}],
 financeCreditV2:{schema:1,receivableId:'REC-V1',originalBRL:1000,
  installments:[{id:'INST-V1-AGGREGATE',amountBRL:1000,kind:'AGGREGATE_NO_SCHEDULE',dueAt:null}]},
 creditAllocationsV2:[],devolucoes:[]};
const manifest={clientes:{kind:'array',collection:'clientes',count:1},
 historicoVendas:{kind:'array',collection:'vendas',count:0}};
try{
 console.log('[B4] SEED V1 START');
 await setDoc(doc(db,'lojas',uid,'dados','operacao'),{
  marker:'B3_V1_UNTOUCHED',clientes:[client],historicoVendas:[]});
 console.log('[B4] SEED V1 OK / HEAD START');
 await fixtureDb.doc(root.join('/')).set({
  schema:2,state:'ready',sequence:0,lastReceipt:'0'.repeat(64),updatedAtServer:new Date(),sourceChecksum:'b4-return-synthetic',
  fieldManifest:manifest,fieldCounts:{clientes:1,historicoVendas:0},
  fieldRevisions:{clientes:0,historicoVendas:0}});
 console.log('[B4] HEAD OK / CLIENT START');
 await fixtureDb.doc([...root,'clientes','C1'].join('/')).set({
  data:client,legacyField:'clientes',legacyIndex:0,version:0,deleted:false});
 console.log('[B4] CLIENT OK / ROUTE START');
 await fixtureDb.doc(['lojas',uid,'dados','storage_control'].join('/')).set({
  mode:'v2',generation,sourceChecksum:'b4-return-synthetic',
  certificate:{sourceChecksum:'b4-return-synthetic',productionReady:true,
   v1WritersFenced:true,finalReconciliationPassed:true,
   pdvIntegrationPassed:true,rollbackPrepared:true}});
 console.log('[B4] ROUTE OK / SESSION START');
 const initial=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(initial.historicoVendas.length,0);

 const obligation={id:'VENDA-V1-FIADO',tipo:'venda_fiada',origem:'pdv',referenciaId:'V1',
  valor:1000,clienteId:'C1',formaPagamento:'crediario',
  financeLink:pdvCreditLink({vendaId:'V1',clienteId:'C1',lojaId:uid,
   valorFiadoBRL:1000,moedaDocumento:'BRL',pagamentos:sale.pagamentos})};
 const savedSale=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[{field:'historicoVendas',baseValue:initial.historicoVendas,value:[sale]},
   {field:'clientes',baseValue:initial.clientes,value:[{...client,saldoDevedorBRL:1000}]}],
  financialEntries:[obligation],operationKey:'pdv:V1'});
 assert.equal(savedSale.cloudOk,true,savedSale.error?.message);
 const event=(id,amount)=>({id,valorBRL:amount,metodoReembolso:'registro_interno',
  itens:[{itemVendaId:'IT1',quantidade:1}]});
 const journal=(id,amount)=>({id:`DEVOLUCAO-${id}`,tipo:'devolucao',
  origem:'historico_vendas',referenciaId:id,lojaId:uid,clienteId:'C1',
  valor:amount,formaPagamento:'registro_interno',detalhes:{vendaId:'V1'},
  financeLink:nativeReturnLineageLink({saleId:'V1',returnId:id,
   clientId:'C1',tenantId:uid,amountBRL:amount,
   method:'registro_interno',operatorId:'synthetic'})});
 const commitReturn=async(id,amount,base,quantity)=>{
  const current=base.historicoVendas.find(s=>s.id==='V1');
  const next={...current,estado:quantity===2?'cancelada':'parcial',
   itens:current.itens.map(i=>({...i,qtdDevolvida:quantity})),
   devolucoes:[...(current.devolucoes||[]),event(id,amount)]};
  const changes=[{field:'historicoVendas',baseValue:base.historicoVendas,
   value:base.historicoVendas.map(x=>x.id==='V1'?next:x)}];
  const financialEntries=[journal(id,amount)];
  const guards=[{type:'sale_return_capacity',saleId:'V1',
   items:[{itemId:'IT1',produtoOriginalId:'P1',quantity:1,name:'Synthetic item'}]}];
  const outcome=await persistV1BusinessOperationSafe({db,userId:uid,
   changes,financialEntries,guards,operationKey:`devolucao:${id}`});
  assert.equal(outcome.cloudOk,true,outcome.error?.message);
  return {changes,financialEntries,guards};
 };
 const afterSale=(await getOperationalSnapshot(db,uid)).data();
 await commitReturn('D1',400,afterSale,1);
 const afterPartial=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(afterPartial.historicoVendas[0].estado,'parcial');
 assert.equal(afterPartial.historicoVendas[0].itens[0].qtdDevolvida,1);
 const second=await commitReturn('D2',600,afterPartial,2);
 const afterTotal=(await getOperationalSnapshot(db,uid)).data();
 const returnedSale=afterTotal.historicoVendas.find(x=>x.id==='V1');
 assert.equal(returnedSale.estado,'cancelada');
 assert.equal(returnedSale.itens[0].qtdDevolvida,2);
 assert.equal(afterTotal.clientes[0].saldoDevedorBRL,1000);
 const ledger=[];
 for(const id of ['D1','D2']){
  const snap=await getDoc(doc(db,'lojas',uid,'financeiro_livro',`DEVOLUCAO-${id}`));
  assert.equal(snap.exists(),true);
  ledger.push({id:snap.id,...snap.data()});
 }
 const audit=classifySaleReturnHistory({sale:returnedSale,ledger,tenantId:uid});
 assert.equal(audit.classification,'VERIFIED',JSON.stringify(audit));
 assert.equal(audit.limitsVerified,true,JSON.stringify(audit));
 assert.equal(audit.externalSettlement,'UNVERIFIED');
 assert.equal(audit.fiscalAuthorization,'UNVERIFIED');
 assert.equal(audit.eligibleForExecution,false);
 const replay=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:second.changes,financialEntries:second.financialEntries,
  guards:second.guards,operationKey:'devolucao:D2'});
 assert.equal(replay.cloudOk,true,replay.error?.message);
 assert.equal(replay.alreadyCommitted,true);
 const stale=(await getOperationalSnapshot(db,uid)).data();
 const bad=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[{field:'historicoVendas',baseValue:stale.historicoVendas,
   value:stale.historicoVendas.map(x=>x.id==='V1'?{...x,
    devolucoes:[...x.devolucoes,event('D3',100)]}:x)}],
  financialEntries:[journal('D3',100)],
  guards:[{type:'sale_return_capacity',saleId:'V1',
   items:[{itemId:'IT1',produtoOriginalId:'P1',quantity:1,name:'Synthetic item'}]}],
  operationKey:'devolucao:D3'});
 assert.equal(bad.cloudOk,false,'Over-return must be rejected by authenticated SDK');
 assert.equal((await getDoc(doc(db,'lojas',uid,'financeiro_livro','DEVOLUCAO-D3'))).exists(),false);
 assert.equal((await getOperationalSnapshot(db,uid)).data().clientes[0].saldoDevedorBRL,1000);
 console.log('PHASE31_B4_NATIVE_RETURN_LIMITS_SUCCESS');
}finally{
 clearOperationalSession(db,uid);
 await deleteApp(application);
 await deleteAdminApp(fixtureAdmin);
}
