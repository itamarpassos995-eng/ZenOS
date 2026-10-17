import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,Timestamp} from 'firebase/firestore';
import {calcularResumoSessao,calcularConciliacaoEletronicaSessao,assinaturaFinanceiraSessao} from '../../src/core/cashSession.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';

if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Local demo Emulator required');
const backup=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
// Local-only browser storage substitute for exercising the unchanged production
// motor in Node; it is never installed in the actual application.
const localCache=new Map();
globalThis.localStorage={getItem:key=>localCache.get(key)??null,setItem:(key,value)=>localCache.set(key,String(value)),removeItem:key=>localCache.delete(key)};
function decode(v){
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
 if('integerValue'in v){const n=Number(v.integerValue);if(!Number.isSafeInteger(n))throw Error('Unsafe integer for application compatibility');return n;}
 if('doubleValue'in v)return Number(v.doubleValue);
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('nullValue'in v)return null;
 if('timestampValue'in v){const ms=Date.parse(v.timestampValue), seconds=Math.floor(ms/1000);
  const fraction=(v.timestampValue.match(/\.(\d+)Z$/)?.[1]||'').padEnd(9,'0');return new Timestamp(seconds,Number(fraction));}
 throw Error('Unsupported application field type; explicit adapter required');
}
const opDoc=backup.documents.find(d=>d.name.endsWith('/dados/operacao'));
const operation=decode({mapValue:{fields:opDoc.fields}});
const ledger=backup.documents.filter(d=>/\/financeiro_livro\/[^/]+$/.test(d.name)).map(d=>decode({mapValue:{fields:d.fields}}));
const stamp=Date.now(),app=initializeApp({apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'},`real-check-${stamp}`);
try{
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
 const db=getFirestore(app);connectFirestoreEmulator(db,'127.0.0.1',8080);
 const user=await createUserWithEmailAndPassword(auth,`real-${stamp}@example.test`,'EmulatorOnly!1248');
 const userId=user.user.uid,ref=doc(db,'lojas',userId,'dados','operacao');
 await setDoc(ref,operation);
 const before=(await getDoc(ref)).data();
 const estimatedGuardBytes=new TextEncoder().encode(JSON.stringify({...before,_syncMeta:{...before._syncMeta,updatedAtServer:null}})).length;
 const result=await persistV1BusinessOperationSafe({db,userId,operationKey:'recovery-only-block-test',
  changes:[{field:'historicoVendas',baseValue:before.historicoVendas,value:[...before.historicoVendas,
   {id:'EMULATOR-ONLY-NOT-A-REAL-SALE',estado:'pendente',totalBRL:0,observacao:'X'.repeat(1000)}]}]});
 assert.equal(result.cloudOk,false);
 assert.equal(result.error.code,'ZENOS_V1_DOC_NEAR_LIMIT');
 assert.deepEqual((await getDoc(ref)).data(),before);
 // Reconstruct each business array using the typed V2 entity values themselves,
 // rather than normalized defaults or new ID generation.
 const individual=Object.fromEntries(Object.entries(opDoc.fields).map(([field,typed])=>[field,
  'arrayValue'in typed ? (typed.arrayValue.values||[]).map(value=>({data:decode(value)})) : {value:decode(typed)}]));
 const reconstructed=Object.fromEntries(Object.entries(individual).map(([field,entries])=>[field,
  Array.isArray(entries)?entries.map(e=>e.data):entries.value]));
 assert.deepEqual(reconstructed,operation);
 const summaries=data=>data.sessoesCaixa.map(sessao=>({
  resumo:calcularResumoSessao({sessao,historicoVendas:data.historicoVendas,caixaMovimentos:data.caixaMovimentos}),
  eletronico:calcularConciliacaoEletronicaSessao({sessao,livroFinanceiro:ledger}),
  assinatura:assinaturaFinanceiraSessao({sessao,historicoVendas:data.historicoVendas,caixaMovimentos:data.caixaMovimentos})}));
 assert.deepEqual(summaries(reconstructed),summaries(operation));
 const sum=(items,key)=>items.reduce((a,v)=>a+(Number(v[key])||0),0);
 const states=Object.fromEntries([...new Set(operation.historicoVendas.map(v=>v.estado))].map(s=>[s,operation.historicoVendas.filter(v=>v.estado===s).length]));
 console.log(JSON.stringify({backupChecksum:backup.checksum,estimatedGuardBytes,
  preventiveThresholdBytes:930000,guardHeadroomBytes:930000-estimatedGuardBytes,
  v1BlockReproduced:true,failedOperationLeftV1Untouched:true,realCashSessionsCompared:operation.sessoesCaixa.length,
  allCashSummariesElectronicReconciliationAndSignaturesEqual:true,
  productCount:operation.produtos.length,saleRecordCount:operation.historicoVendas.length,saleStates:states,
  stockTotal:sum(operation.produtos,'estoque'),stockWarehouse:sum(operation.produtos,'estoqueGalpao'),
  stockShowcase:sum(operation.produtos,'estoqueVitrine'),clientDebtBRL:sum(operation.clientes,'saldoDevedorBRL'),
  ledgerCount:ledger.length,productionWrites:0,fullPdvIntegrationCertified:false},null,2));
}finally{await deleteApp(app);}
