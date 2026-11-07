// Strictly synthetic V2 native write test. Never connects to production.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,setDoc} from 'firebase/firestore';
import {getOperationalSnapshot,clearOperationalSession} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';
import {pdvCreditLink,validateFinanceLink} from '../../src/core/distribution/phase31NativeFinanceLinks.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw Error('B3_NATIVE_REFUSES_PRODUCTION');
const application=initializeApp({apiKey:'demo-key',projectId:'demo-zenos-local',
 authDomain:'demo-zenos-local.firebaseapp.com'},'b3-native-'+Date.now());
const auth=getAuth(application),db=getFirestore(application);
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8080);
const uid=(await createUserWithEmailAndPassword(auth,
 'b3-native-'+Date.now()+'@example.test','EmulatorOnly!1248')).user.uid;
const generation='0123456789abcdef01234567',root=['lojas',uid,'v2_generations',generation];
const client={id:'C1',nome:'Cliente sintético B3',limiteCreditoBRL:2000,saldoDevedorBRL:0};
const sale={id:'V1',clienteId:'C1',clienteNome:client.nome,tipoDocumento:'venda',
 estado:'concluida',moedaDocumento:'BRL',totalOriginal:1000,totalBRL:1000,itens:[],
 createdAt:'2026-11-07T02:00:00.000Z',
 pagamentos:[{id:'CR1',formaId:'crediario',moedaOrigem:'BRL',valorOriginal:1000,
  valorConvertidoBRL:1000,taxaCambioAplicada:1}]};
const manifest={clientes:{kind:'array',collection:'clientes',count:1},
 historicoVendas:{kind:'array',collection:'vendas',count:0}};
try{
 await setDoc(doc(db,'lojas',uid,'dados','operacao'),{
  marker:'B3_V1_UNTOUCHED',clientes:[client],historicoVendas:[]});
 await setDoc(doc(db,...root),{
  schema:2,state:'ready',sequence:0,sourceChecksum:'b3-native-synthetic',
  fieldManifest:manifest,fieldCounts:{clientes:1,historicoVendas:0},
  fieldRevisions:{clientes:0,historicoVendas:0}});
 await setDoc(doc(db,...root,'clientes','C1'),{
  data:client,legacyField:'clientes',legacyIndex:0,version:0,deleted:false});
 await setDoc(doc(db,'lojas',uid,'dados','storage_control'),{
  mode:'v2',generation,sourceChecksum:'b3-native-synthetic',
  certificate:{sourceChecksum:'b3-native-synthetic',productionReady:true,
   v1WritersFenced:true,finalReconciliationPassed:true,
   pdvIntegrationPassed:true,rollbackPrepared:true}});
 const initial=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(initial.historicoVendas.length,0);
 const obligation={
  id:'VENDA-V1-FIADO',tipo:'venda_fiada',origem:'pdv',referenciaId:'V1',
  valor:1000,clienteId:'C1',clienteNome:client.nome,formaPagamento:'crediario',
  createdAt:'2026-11-07T02:00:00.000Z',financeLink:pdvCreditLink({
   vendaId:'V1',clienteId:'C1',lojaId:uid,valorFiadoBRL:1000,
   moedaDocumento:'BRL',pagamentos:sale.pagamentos})
 };
 const first=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[
   {field:'historicoVendas',baseValue:initial.historicoVendas,value:[sale]},
   {field:'clientes',baseValue:initial.clientes,
    value:[{...client,saldoDevedorBRL:1000}]}
  ],financialEntries:[obligation],operationKey:'pdv:V1'});
 assert.equal(first.cloudOk,true,first.error?.message);
 const bill=(await getDoc(doc(db,'lojas',uid,'financeiro_livro',obligation.id))).data();
 assert.equal(bill.valor,1000);
 assert.equal(bill.moeda,'BRL');
 assert.equal(bill.financeLink.financeEventType,'OBLIGATION');
 assert.equal(bill.financeLink.saleId,'V1');
 assert.equal(bill.financeLink.statusLiquidacao,'DEBT_REGISTERED');
 const before=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(before.clientes[0].saldoDevedorBRL,1000);
 assert.equal(before.historicoVendas.length,1);
 const receipt={
  id:'REC1',tipo:'recebimento_fiado',origem:'clientes',referenciaId:'REC1',valor:250,
  clienteId:'C1',clienteNome:client.nome,formaPagamento:'dinheiro_brl',
  createdAt:'2026-11-07T03:00:00.000Z',
  saldoClienteAntes:1000,saldoClienteDepois:750,
  financeLink:validateFinanceLink({
   financeLinkVersion:2,financeEventType:'RECEIPT',
   saleId:'V1',paymentId:'REC1',sourceEventId:'VENDA-V1-FIADO',
   receivableId:'REC-V1',installmentId:'INST-V1-AGGREGATE',clienteId:'C1',
   lojaId:uid,moedaOrigem:'BRL',valorOriginal:250,
   statusLiquidacao:'REGISTERED_UNVERIFIED'
  },{lojaId:uid,referenciaId:'REC1',clienteId:'C1',ledgerId:'REC1'})
 };
 const received=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[{field:'clientes',baseValue:before.clientes,
   value:[{...before.clientes[0],saldoDevedorBRL:750}]}],
  financialEntries:[receipt],
  guards:[{type:'client_receipt_snapshot',clientId:'C1',
   clientName:client.nome,balanceBRL:1000}],
  operationKey:'recebimento-fiado:REC1'});
 assert.equal(received.cloudOk,true,received.error?.message);
 const saved=(await getDoc(doc(db,'lojas',uid,'financeiro_livro','REC1'))).data();
 assert.equal(saved.referenciaId,'REC1');
 assert.equal(saved.valor,250);
 assert.equal(saved.financeLink.saleId,'V1');
 assert.equal(saved.financeLink.statusLiquidacao,'REGISTERED_UNVERIFIED');
 assert.equal(saved.financeLink.sourceEventId,'VENDA-V1-FIADO');
 const after=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(after.clientes[0].saldoDevedorBRL,750);
 const again=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[{field:'clientes',baseValue:before.clientes,
   value:[{...before.clientes[0],saldoDevedorBRL:750}]}],
  financialEntries:[receipt],
  guards:[{type:'client_receipt_snapshot',clientId:'C1',
   clientName:client.nome,balanceBRL:1000}],
  operationKey:'recebimento-fiado:REC1'});
 assert.equal(again.cloudOk,true,again.error?.message);
 assert.equal(again.alreadyCommitted,true);
 const v1=(await getDoc(doc(db,'lojas',uid,'dados','operacao'))).data();
 assert.equal(v1.marker,'B3_V1_UNTOUCHED');
 assert.equal(v1.clientes[0].saldoDevedorBRL,0);
 console.log('PHASE31_B3_NATIVE_V2_SUCCESS');
}finally{
 clearOperationalSession(db,uid);
 await deleteApp(application);
}
