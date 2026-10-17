// 100% local Firebase Emulator. Synthetic IDs, no production credentials/backups.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc} from 'firebase/firestore';
import {getOperationalSnapshot,clearOperationalSession} from '../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from '../src/core/productionSync.js';
import {planejarReconciliacoesFiado} from '../src/core/creditReconciliation.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')
  throw Error('Refusing non-emulator test');
const base={apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'};
const app=initializeApp(base,'p0-credit-'+Date.now());
const auth=getAuth(app),db=getFirestore(app);
connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
connectFirestoreEmulator(db,'127.0.0.1',8080);
const c={id:'C1',nome:'Cliente teste',limiteCreditoBRL:1000,saldoDevedorBRL:0};
const v={id:'V1',clienteId:'C1',clienteNome:'Cliente teste',estado:'concluida',tipoDocumento:'venda',
  pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:200},{formaId:'crediario',valorConvertidoBRL:135}],
  totalBRL:335,itens:[]};
const l={id:'F1',clienteNome:'Cliente teste',tipo:'venda_fiada',clienteId:'C1',formaPagamento:'crediario',referenciaId:'V1',
  createdAt:'2026-10-17T08:00:00Z',valor:135,saldoClienteAntes:0,saldoClienteDepois:135};
const stamp=Date.now();
const user=(await createUserWithEmailAndPassword(auth,'p0-'+stamp+'@example.test','EmulatorOnly!1248')).user;
const uid=user.uid;
const root=['lojas',uid,'v2_generations','0123456789abcdef01234567'];
const opRef=doc(db,'lojas',uid,'dados','operacao');
const financeRef=doc(db,'lojas',uid,'financeiro_livro','F1');
try{
 await setDoc(opRef,{frozenMarker:'never-edit',clientes:[c],historicoVendas:[v]});
 await setDoc(financeRef,l);
 const manifest={clientes:{kind:'array',collection:'clientes',count:1},
    historicoVendas:{kind:'array',collection:'vendas',count:1}};
 await setDoc(doc(db,...root),{schema:2,state:'ready',sequence:0,sourceChecksum:'p0-synthetic',
    fieldManifest:manifest,fieldCounts:{clientes:1,historicoVendas:1},
    fieldRevisions:{clientes:0,historicoVendas:0}});
 await setDoc(doc(db,...root,'clientes','C1'),{data:c,legacyField:'clientes',legacyIndex:0,version:0,deleted:false});
 await setDoc(doc(db,...root,'vendas','V1'),{data:v,legacyField:'historicoVendas',legacyIndex:0,version:0,deleted:false});
 await setDoc(doc(db,'lojas',uid,'dados','storage_control'),{
    mode:'v2',generation:root.at(-1),sourceChecksum:'p0-synthetic',
    certificate:{sourceChecksum:'p0-synthetic',productionReady:true,
      v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true}});
 const initial=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(initial.clientes[0].saldoDevedorBRL,0);
 const proposed=planejarReconciliacoesFiado({clientes:initial.clientes,
    historicoVendas:initial.historicoVendas,livroFinanceiro:[l]});
 assert.equal(proposed.length,1);
 const fix=proposed[0];
 const changes=[{field:'clientes',baseValue:initial.clientes,
    value:initial.clientes.map(x=>x.id===fix.clienteId?{...x,saldoDevedorBRL:fix.saldoNovoBRL}:x)}];
 const guards=[{type:'entity_unchanged',field:'clientes',entityId:c.id,entityKey:'id',expected:c}];
 const result=await persistV1BusinessOperationSafe({db,userId:uid,changes,guards,operationKey:fix.operationKey});
 assert.equal(result.cloudOk,true,result.error?.message);
 let state=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(state.clientes[0].saldoDevedorBRL,135);
 assert.equal(state.historicoVendas.length,1);
 assert.equal((await getDoc(financeRef)).data().valor,135);
 assert.equal((await getDoc(opRef)).data().frozenMarker,'never-edit');
 assert.equal(planejarReconciliacoesFiado({clientes:state.clientes,
   historicoVendas:state.historicoVendas,livroFinanceiro:[l]}).length,0);
 const replay=await persistV1BusinessOperationSafe({db,userId:uid,changes,guards,operationKey:fix.operationKey});
 assert.equal(replay.cloudOk,true,replay.error?.message);
 assert.equal(replay.alreadyCommitted,true);
 // O nome histórico pode mudar sem alterar a identidade persistida da conta.
 // Esta divergência isolada NÃO deve impedir baixa de saldo.
 const {encontrarConflitosIdsRecebimento}=await import('../src/core/clientCreditLinkAudit.js');
 assert.deepEqual(encontrarConflitosIdsRecebimento({
   clienteId:c.id,
   historicoVendas:[{...v,clienteNome:'Nome antigo do mesmo cliente'}],
   livroFinanceiro:[{...l,clienteNome:'Nome antigo do mesmo cliente'}],
 }),[]);
 // Legacy normalizer may add innocuous registration fields absent in V2.
 // Receiving a legitimate account must depend only on unique ID, name and amount.
 const normalizedUi={...state.clientes[0],pais:'BR',tipoDocumento:'CPF',perfilPreco:'preco1'};
 assert.notDeepEqual(normalizedUi,state.clientes[0]);
 const receiptChanges=[{field:'clientes',baseValue:state.clientes,
   value:state.clientes.map(x=>x.id==='C1'?{...x,saldoDevedorBRL:85}:x)}];
 const receiptEntry={id:'RECEIPT-1',tipo:'recebimento_fiado',origem:'clientes',
   referenciaId:'RECEIPT-1',valor:50,clienteId:'C1',clienteNome:'Cliente teste',
   formaPagamento:'pix',saldoClienteAntes:135,saldoClienteDepois:85,createdAt:'2026-10-17T09:00:00Z'};
 const receiptGuard={type:'client_receipt_snapshot',clientId:'C1',
   clientName:normalizedUi.nome,balanceBRL:normalizedUi.saldoDevedorBRL};
 const incorrect=await persistV1BusinessOperationSafe({db,userId:uid,
   changes:receiptChanges,guards:[{...receiptGuard,balanceBRL:134}],
   financialEntries:[receiptEntry],operationKey:'rejected-stale-receipt'});
 assert.equal(incorrect.cloudOk,false);
 assert.equal((await getOperationalSnapshot(db,uid)).data().clientes[0].saldoDevedorBRL,135);
 assert.equal((await getDoc(doc(db,'lojas',uid,'financeiro_livro','RECEIPT-1'))).exists(),false);
 const receipt=await persistV1BusinessOperationSafe({db,userId:uid,
   changes:receiptChanges,guards:[receiptGuard],
   financialEntries:[receiptEntry],operationKey:'confirmed-receipt'});
 assert.equal(receipt.cloudOk,true,receipt.error?.message);
 state=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(state.clientes[0].saldoDevedorBRL,85);
 assert.equal((await getDoc(doc(db,'lojas',uid,'financeiro_livro','RECEIPT-1'))).data().valor,50);
 const duplicate=await persistV1BusinessOperationSafe({db,userId:uid,
   changes:receiptChanges,guards:[receiptGuard],
   financialEntries:[receiptEntry],operationKey:'confirmed-receipt'});
 assert.equal(duplicate.cloudOk,true);
 assert.equal(duplicate.alreadyCommitted,true);
 const wrongName=await persistV1BusinessOperationSafe({db,userId:uid,
   changes:[{field:'clientes',baseValue:state.clientes,
     value:state.clientes.map(x=>x.id==='C1'?{...x,saldoDevedorBRL:80}:x)}],
   guards:[{...receiptGuard,clientName:'Outra Pessoa',balanceBRL:85}],
   operationKey:'rejected-wrong-name'});
 assert.equal(wrongName.cloudOk,false);
 assert.equal((await getOperationalSnapshot(db,uid)).data().clientes[0].saldoDevedorBRL,85);
 // The pre-order must persist and be available after a complete V2 reload.
 const pending={id:'PRE-1',estado:'pendente',tipoDocumento:'pre_pedido',
    clienteNome:'Balcão teste',totalBRL:50,itens:[]};
 const pendingRequest=[{field:'historicoVendas',baseValue:state.historicoVendas,
    value:[pending,...state.historicoVendas]}];
 const queued=await persistV1BusinessOperationSafe({db,userId:uid,
    changes:pendingRequest,operationKey:'p0-pre-1'});
 assert.equal(queued.cloudOk,true,queued.error?.message);
 state=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(state.historicoVendas.filter(x=>x.estado==='pendente').length,1);
 clearOperationalSession(db,uid);
 const loaded=(await getOperationalSnapshot(db,uid)).data();
 assert.equal(loaded.clientes[0].saldoDevedorBRL,85);
 assert.equal(loaded.historicoVendas.filter(x=>x.estado==='pendente').length,1);
 assert.equal(loaded.historicoVendas.find(x=>x.id==='V1').totalBRL,335);
 assert.equal((await getDoc(opRef)).data().frozenMarker,'never-edit');
 console.log('PASS P0: V2 fiado repair + guarded receipt + no double charge + pre-order reload + V1 untouched');
}finally{
 clearOperationalSession(db,uid);
 await deleteApp(app);
}
