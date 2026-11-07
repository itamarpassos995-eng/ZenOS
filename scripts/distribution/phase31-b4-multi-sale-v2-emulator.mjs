// B.4 independent multi-sale, three-installment synthetic integration fixture.
// The original B.3 emulator proof is intentionally left unchanged.
// Strictly synthetic V2 native write test. Never connects to production.
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
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
 throw Error('B3_NATIVE_REFUSES_PRODUCTION');
const application=initializeApp({apiKey:'demo-key',projectId:'demo-zenos-local',
 authDomain:'demo-zenos-local.firebaseapp.com'},'b4-multi-'+Date.now());
const auth=getAuth(application),db=getFirestore(application);
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8080);
// Admin SDK is used ONLY for privileged synthetic migration fixture setup.
// All actual business transactions below MUST use the signed-in client SDK and rules.
const fixtureAdmin=initializeAdminApp({projectId:'demo-zenos-local'},'b4-seed-'+Date.now());
const fixtureDb=adminFirestore(fixtureAdmin);
const uid=(await createUserWithEmailAndPassword(auth,
 'b4-multi-'+Date.now()+'@example.test','EmulatorOnly!1248')).user.uid;
const generation='0123456789abcdef01234567',root=['lojas',uid,'v2_generations',generation];
const client={id:'C1',nome:'Cliente sintético B3',limiteCreditoBRL:2000,saldoDevedorBRL:0};
const sale={id:'V1',clienteId:'C1',clienteNome:client.nome,tipoDocumento:'venda',
 estado:'concluida',moedaDocumento:'BRL',totalOriginal:1000,totalBRL:1000,itens:[],
 createdAt:'2026-11-07T02:00:00.000Z',
 pagamentos:[{id:'CR1',formaId:'crediario',moedaOrigem:'BRL',valorOriginal:1000,
  valorConvertidoBRL:1000,taxaCambioAplicada:1}],
 financeCreditV2:{schema:1,receivableId:'REC-V1',originalBRL:1000,
  installments:[{id:'INST-V1-AGGREGATE',amountBRL:1000,kind:'AGGREGATE_NO_SCHEDULE',dueAt:null}]},
 creditAllocationsV2:[]};
const sale2={...sale,id:'V2',totalOriginal:600,totalBRL:600,
 pagamentos:[{id:'CR2',formaId:'crediario',moedaOrigem:'BRL',valorOriginal:600,
  valorConvertidoBRL:600,taxaCambioAplicada:1}],
 financeCreditV2:{schema:1,receivableId:'REC-V2',originalBRL:600,
  installments:[{id:'INST-V2-1',amountBRL:250,dueAt:'2026-12-01'},
   {id:'INST-V2-2',amountBRL:350,dueAt:'2027-01-01'}]},creditAllocationsV2:[]};
const manifest={clientes:{kind:'array',collection:'clientes',count:1},
 historicoVendas:{kind:'array',collection:'vendas',count:0}};
try{
 console.log('[B4] SEED V1 START');
 await setDoc(doc(db,'lojas',uid,'dados','operacao'),{
  marker:'B3_V1_UNTOUCHED',clientes:[client],historicoVendas:[]});
 console.log('[B4] SEED V1 OK / HEAD START');
 await fixtureDb.doc(root.join('/')).set({
  schema:2,state:'ready',sequence:0,lastReceipt:'0'.repeat(64),updatedAtServer:new Date(),sourceChecksum:'b3-native-synthetic',
  fieldManifest:manifest,fieldCounts:{clientes:1,historicoVendas:0},
  fieldRevisions:{clientes:0,historicoVendas:0}});
 console.log('[B4] HEAD OK / CLIENT START');
 await fixtureDb.doc([...root,'clientes','C1'].join('/')).set({
  data:client,legacyField:'clientes',legacyIndex:0,version:0,deleted:false});
 console.log('[B4] CLIENT OK / ROUTE START');
 await fixtureDb.doc(['lojas',uid,'dados','storage_control'].join('/')).set({
  mode:'v2',generation,sourceChecksum:'b3-native-synthetic',
  certificate:{sourceChecksum:'b3-native-synthetic',productionReady:true,
   v1WritersFenced:true,finalReconciliationPassed:true,
   pdvIntegrationPassed:true,rollbackPrepared:true}});
 console.log('[B4] ROUTE OK / SESSION START');
 const initial=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(initial.historicoVendas.length,0);
 const obligation={
  id:'VENDA-V1-FIADO',tipo:'venda_fiada',origem:'pdv',referenciaId:'V1',
  valor:1000,clienteId:'C1',clienteNome:client.nome,formaPagamento:'crediario',
  createdAt:'2026-11-07T02:00:00.000Z',financeLink:pdvCreditLink({
   vendaId:'V1',clienteId:'C1',lojaId:uid,valorFiadoBRL:1000,
   moedaDocumento:'BRL',pagamentos:sale.pagamentos})
 };
 const obligation2={...obligation,id:'VENDA-V2-FIADO',referenciaId:'V2',valor:600,
 financeLink:pdvCreditLink({vendaId:'V2',clienteId:'C1',lojaId:uid,
  valorFiadoBRL:600,moedaDocumento:'BRL',pagamentos:sale2.pagamentos})};
 console.log('[B4] SESSION OK / NATIVE SALE COMMIT START');
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
 // The native PDV intentionally allows only ONE new sale per pdv:* command.
 // Create V2 as a second independently authenticated business transaction.
 const afterFirst=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(afterFirst.historicoVendas.length,1);
 assert.equal(afterFirst.clientes[0].saldoDevedorBRL,1000);
 const second=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[
   {field:'historicoVendas',baseValue:afterFirst.historicoVendas,
    value:[...afterFirst.historicoVendas,sale2]},
   {field:'clientes',baseValue:afterFirst.clientes,
    value:[{...afterFirst.clientes[0],saldoDevedorBRL:1600}]}
  ],financialEntries:[obligation2],operationKey:'pdv:V2'});
 assert.equal(second.cloudOk,true,second.error?.message);
 const before=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(before.clientes[0].saldoDevedorBRL,1600);
 assert.equal(before.historicoVendas.length,2);
 const plan=prepareVerifiedCreditAllocations({sales:before.historicoVendas,clientId:'C1',
  receiptId:'REC1',receivedBRL:450,allocations:[
   {saleId:'V1',installmentId:'INST-V1-AGGREGATE',amountBRL:100},
   {saleId:'V2',installmentId:'INST-V2-1',amountBRL:150},
   {saleId:'V2',installmentId:'INST-V2-2',amountBRL:200}]});
 const receipt={
  id:'REC1',tipo:'recebimento_fiado',origem:'clientes',referenciaId:'REC1',valor:450,
  clienteId:'C1',clienteNome:client.nome,formaPagamento:'dinheiro_brl',
  createdAt:'2026-11-07T03:00:00.000Z',
  saldoClienteAntes:1600,saldoClienteDepois:1150,
  financeLink:validateFinanceLink({
   financeLinkVersion:2,financeEventType:'RECEIPT',
   saleId:'V1',paymentId:'REC1',sourceEventId:'VENDA-V1-FIADO',
   receivableId:'REC-V1',installmentId:'INST-V1-AGGREGATE',clienteId:'C1',
   lojaId:uid,moedaOrigem:'BRL',valorOriginal:450,
   statusLiquidacao:'REGISTERED_UNVERIFIED',allocations:plan.allocations,
   saleIds:['V1','V2'],currencyEvidence:{valorAtribuidoBRL:450}
  },{lojaId:uid,referenciaId:'REC1',clienteId:'C1',ledgerId:'REC1'})
 };
 console.log('[B4] SALE OK / NATIVE RECEIPT COMMIT START');
 const received=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[{field:'clientes',baseValue:before.clientes,
   value:[{...before.clientes[0],saldoDevedorBRL:1150}]},
   {field:'historicoVendas',baseValue:before.historicoVendas,
    value:plan.patches.map(x=>x.nextSale)}],
  financialEntries:[receipt],
  guards:[{type:'client_receipt_snapshot',clientId:'C1',
   clientName:client.nome,balanceBRL:1600},
   {type:'entity_field_equals',field:'historicoVendas',entityId:'V1',
    entityKey:'id',property:'creditAllocationsV2',expected:[]},
   {type:'entity_field_equals',field:'historicoVendas',entityId:'V2',
    entityKey:'id',property:'creditAllocationsV2',expected:[]}],
  operationKey:'recebimento-fiado:REC1'});
 assert.equal(received.cloudOk,true,received.error?.message);
 const saved=(await getDoc(doc(db,'lojas',uid,'financeiro_livro','REC1'))).data();
 assert.equal(saved.referenciaId,'REC1');
 assert.equal(saved.valor,450);
 assert.equal(saved.financeLink.saleId,'V1');
 assert.equal(saved.financeLink.statusLiquidacao,'REGISTERED_UNVERIFIED');
 assert.equal(saved.financeLink.sourceEventId,'VENDA-V1-FIADO');
 assert.equal(saved.financeLink.allocations.length,3);
 assert.equal(saved.financeLink.allocations.reduce((n,x)=>n+x.amountBRL,0),450);
 assert.deepEqual(saved.financeLink.saleIds,['V1','V2']);
 assert.equal(saved.financeLink.saleIds[0],'V1');
 const after=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(after.clientes[0].saldoDevedorBRL,1150);
 assert.equal(after.historicoVendas.find(v=>v.id==='V1').creditAllocationsV2[0].receiptId,'REC1');
 assert.equal(after.historicoVendas.find(v=>v.id==='V1').creditAllocationsV2[0].allocations[0].amountBRL,100);
 assert.deepEqual(after.historicoVendas.find(v=>v.id==='V2').creditAllocationsV2[0].allocations.map(x=>x.amountBRL),[150,200]);
 assert.equal((await getDoc(doc(db,'lojas',uid,'financeiro_livro','VENDA-V2-FIADO'))).data().valor,600);
 const again=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[{field:'clientes',baseValue:before.clientes,
   value:[{...before.clientes[0],saldoDevedorBRL:1150}]},
   {field:'historicoVendas',baseValue:before.historicoVendas,
    value:plan.patches.map(x=>x.nextSale)}],
  financialEntries:[receipt],
  guards:[{type:'client_receipt_snapshot',clientId:'C1',
   clientName:client.nome,balanceBRL:1600},
   {type:'entity_field_equals',field:'historicoVendas',entityId:'V1',
    entityKey:'id',property:'creditAllocationsV2',expected:[]},
   {type:'entity_field_equals',field:'historicoVendas',entityId:'V2',
    entityKey:'id',property:'creditAllocationsV2',expected:[]}],
  operationKey:'recebimento-fiado:REC1'});
 assert.equal(again.cloudOk,true,again.error?.message);
 assert.equal(again.alreadyCommitted,true);
 // Same operation key with different payload must fail closed, not overwrite
 // the original receipt or create a second book entry.
 const conflict=await persistV1BusinessOperationSafe({db,userId:uid,
  changes:[{field:'clientes',baseValue:before.clientes,
   value:[{...before.clientes[0],saldoDevedorBRL:1149}]},
   {field:'historicoVendas',baseValue:before.historicoVendas,
    value:plan.patches.map(x=>x.nextSale)}],
  financialEntries:[receipt],
  guards:[{type:'client_receipt_snapshot',clientId:'C1',
   clientName:client.nome,balanceBRL:1600},
   {type:'entity_field_equals',field:'historicoVendas',entityId:'V1',
    entityKey:'id',property:'creditAllocationsV2',expected:[]},
   {type:'entity_field_equals',field:'historicoVendas',entityId:'V2',
    entityKey:'id',property:'creditAllocationsV2',expected:[]}],
  operationKey:'recebimento-fiado:REC1'});
 assert.equal(conflict.cloudOk,false,'Conflicting replay must be rejected');
 const stillSaved=(await getDoc(doc(db,'lojas',uid,'financeiro_livro','REC1'))).data();
 assert.equal(stillSaved.valor,450);
 const afterRetry=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(afterRetry.clientes[0].saldoDevedorBRL,1150);
 assert.equal(afterRetry.historicoVendas.find(v=>v.id==='V1').creditAllocationsV2.length,1);
 assert.equal(afterRetry.historicoVendas.find(v=>v.id==='V2').creditAllocationsV2.length,1);
 const v1=(await getDoc(doc(db,'lojas',uid,'dados','operacao'))).data();
 assert.equal(v1.marker,'B3_V1_UNTOUCHED');
 assert.equal(v1.clientes[0].saldoDevedorBRL,0);
 console.log('PHASE31_B4_MULTI_SALE_V2_SUCCESS');
}finally{
 clearOperationalSession(db,uid);
 await deleteApp(application);
 await deleteAdminApp(fixtureAdmin);
}
