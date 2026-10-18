// Real backup, real application repository, real productionSync entry points.
// All writes are confined to local demo Firebase Emulator, never production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc,getDocs,collection,writeBatch,Timestamp} from 'firebase/firestore';
import {getOperationalSnapshot,subscribeOperationalSnapshot,peekV2Session,clearOperationalSession,getShadowReadStatus} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe,persistV1OperationFieldSafe} from '../../src/core/productionSync.js';
import {assinaturaFinanceiraSessao} from '../../src/core/cashSession.js';
import {V2_COLLECTIONS,encodeV2Id,stableV2Json} from '../../src/core/operationalV2Schema.js';
import {loadPilotFixtureRules} from './pilot_fixture.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Local demo required');
const backup=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const plan=JSON.parse(execFileSync('python3',['-c','import json,sys;sys.path.insert(0,"scripts/recovery");from v2_plan import plan_v2;print(json.dumps(plan_v2(json.load(open(sys.argv[1])))))',process.argv[2]],{maxBuffer:20e6}).toString());
const admin=async writes=>{
 const response=await fetch('http://127.0.0.1:8080/v1/projects/demo-zenos-local/databases/(default)/documents:commit',{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({writes})});
 if(!response.ok)throw Error(`Local fixture seeding failed: ${response.status}`);
};
const typed=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(typed)}}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?(Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}):{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,typed(x)]))}};
const adminSet=(path,value)=>admin([{update:{name:'projects/demo-zenos-local/databases/(default)/documents/'+path,fields:typed(value).mapValue.fields}}]);
const cache=new Map();globalThis.localStorage={getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k)};
function decode(v){
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
 if('integerValue'in v){const n=Number(v.integerValue);assert(Number.isSafeInteger(n));return n;}
 if('doubleValue'in v)return Number(v.doubleValue);if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;
 if('timestampValue'in v)return Timestamp.fromDate(new Date(v.timestampValue));throw Error('Unsupported fixture type');
}
const appConfig={apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'};
const apps=[initializeApp(appConfig,`v2app-a-${Date.now()}`),initializeApp(appConfig,`v2app-b-${Date.now()}`)];
const dbs=apps.map(a=>{const db=getFirestore(a);connectFirestoreEmulator(db,'127.0.0.1',8080);connectAuthEmulator(getAuth(a),'http://127.0.0.1:9099',{disableWarnings:true});return db;});
const email=`v2app-${Date.now()}@example.test`,password='EmulatorOnly!1248';
let stop=null;const passed=[];const test=async(name,fn)=>{await fn();passed.push(name);console.log('PASS',name);};
const tickNow=Date.now;let offset=0;
// Advance only the anti-loop clock between independent simulated customer actions.
const tick=()=>{offset+=61000;Date.now=()=>tickNow()+offset;};
try{
 const userId=(await createUserWithEmailAndPassword(getAuth(apps[0]),email,password)).user.uid;
 await loadPilotFixtureRules(userId);
 await signInWithEmailAndPassword(getAuth(apps[1]),email,password);
 const db=dbs[0],op=decode({mapValue:{fields:backup.documents.find(d=>d.name.endsWith('/dados/operacao')).fields}});
 const root=['lojas',userId,'v2_generations',plan.generation],opRef=doc(db,'lojas',userId,'dados','operacao');
 if(process.env.ZENOS_PILOT_RULES==='1'){
  // Preserve the existing non-pilot baseline and owner module paths without
  // accidentally granting the catch-all permission to the pilot control.
  for(const path of ['lojas/non-pilot-store/dados/operacao','lojas/non-pilot-store/v2_generations/unchanged','legacy_admin/example',`lojas/${userId}/fiscal_solicitacoes/test`,`lojas/${userId}/dados/approved-extra`]){
   const ref=doc(db,...path.split('/'));await setDoc(ref,{compatibilityOnly:true});assert.equal((await getDoc(ref)).data().compatibilityOnly,true);
  }
 }
 await admin([{update:{name:'projects/demo-zenos-local/databases/(default)/documents/'+opRef.path,fields:backup.documents.find(d=>d.name.endsWith('/dados/operacao')).fields}}]);const v1Before=(await getDoc(opRef)).data();
 const documents=plan.documents.map(d=>({update:{name:'projects/demo-zenos-local/databases/(default)/documents/'+root.join('/')+d.name.slice(plan.targetRoot.length),fields:d.fields},currentDocument:{exists:false}}));
 for(let i=0;i<documents.length;i+=100)await admin(documents.slice(i,i+100));
 await adminSet(root.join('/'),{schema:2,state:'ready',sequence:0,sourceChecksum:backup.checksum,fieldManifest:plan.fieldManifest,fieldRevisions:op._syncMeta.fieldRevisions});
 const control={mode:'v2',generation:plan.generation,sourceChecksum:backup.checksum,certificate:{sourceChecksum:backup.checksum,productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true}};
 await adminSet(`lojas/${userId}/dados/storage_control`,{...control,mode:'shadow'});
 await test('Shadow read compares all fields and detects divergence without selecting V2',async()=>{
  const snap=await getOperationalSnapshot(db,userId);assert(snap.exists());assert.equal(peekV2Session(db,userId),null);assert.equal(getShadowReadStatus(db,userId).equal,true);
  await adminSet(`lojas/${userId}/dados/operacao`,{...op,regrasDesconto:{...op.regrasDesconto,emulatorDifference:true}});
  await getOperationalSnapshot(db,userId);assert.equal(getShadowReadStatus(db,userId).equal,false);assert(getShadowReadStatus(db,userId).differences.includes('regrasDesconto'));
  await admin([{update:{name:'projects/demo-zenos-local/databases/(default)/documents/'+opRef.path,fields:backup.documents.find(d=>d.name.endsWith('/dados/operacao')).fields}}]);
  clearOperationalSession(db,userId);
 });
 await adminSet(`lojas/${userId}/dados/storage_control`,control);
 const snapshots=await Promise.all(dbs.map(d=>getOperationalSnapshot(d,userId)));
 const session=i=>peekV2Session(dbs[i],userId),state=i=>session(i).materialize();
 const change=(base,field,value)=>({field,baseValue:base[field],value});
 const commit=async(i,args)=>persistV1BusinessOperationSafe({db:dbs[i],userId,...args});
 const ok=result=>assert.equal(result.cloudOk,true,result.error?.stack||'cloud confirmation missing');
 await test('Real backup read through application repository: all entities and IDs preserved',async()=>{
  for(const snap of snapshots)for(const f of Object.keys(V2_COLLECTIONS))assert.equal(stableV2Json(snap.data()[f]),stableV2Json(op[f]||[]),f);
 });
 let lastSnapshot;stop=subscribeOperationalSnapshot(dbs[1],userId,s=>{lastSnapshot=s.data();},e=>{throw e;});
 const saleId='EMULATOR-ONLY-SALE',product=op.produtos.find(p=>Number(p.estoqueVitrine)>3),cash=op.sessoesCaixa.find(s=>s.status==='aberta');
 assert(product&&cash);const pid=product.id;
 const saleArgs=base=>({operationKey:`pdv:${saleId}`,changes:[
  change(base,'historicoVendas',[{id:saleId,estado:'concluida',totalBRL:10,sessaoId:cash.id,itens:[],observacao:'X'.repeat(2000)},...base.historicoVendas]),
  change(base,'produtos',base.produtos.map(p=>p.id===pid?{...p,estoqueVitrine:p.estoqueVitrine-1,estoque:p.estoque-1}:p))],
  guards:[{type:'cash_session_open',sessionId:cash.id}],stockEvents:[{id:`stock-${saleId}`,produtoId:pid,sku:product.sku||'',tipo:'venda',detalhes:{vitrine:1}}],
  financialEntries:[{id:`ledger-${saleId}`,tipo:'venda',referenciaId:saleId,valor:10,createdAt:'2026-10-17T00:00:00.000Z',sessaoId:cash.id}]});
 const saleRequest=saleArgs(state(0));let saleResult;
 await test('PDV sale exceeds V1 headroom and commits stock + sale + canonical finance atomically',async()=>{
  tick();saleResult=await commit(0,saleRequest);ok(saleResult);assert.equal(saleResult.writes,6);assert(saleResult.reads<15);
  assert.equal(state(0).produtos.find(p=>p.id===pid).estoqueVitrine,product.estoqueVitrine-1);
  assert((await getDoc(doc(db,'lojas',userId,'financeiro_livro',`ledger-${saleId}`))).exists());
  assert((await getDoc(doc(db,'lojas',userId,'estoque_auditoria',`${pid}-${product.sku||''}`.replaceAll('/','_'),'movimentos',`stock-${saleId}`))).exists());
 });
 await test('Permanent receipt replay does not double stock or finance',async()=>{
  tick();const replay=await commit(0,saleRequest);ok(replay);assert(replay.alreadyCommitted);assert.equal(session(0).sequence,1);
 });
 await test('Reusing operation ID with another payload is rejected',async()=>{
  tick();const r=await commit(0,{...saleRequest,financialEntries:[{...saleRequest.financialEntries[0],valor:11}]});assert.equal(r.error.code,'V2_IDEMPOTENCY_CONFLICT');
 });
 await test('Two terminals sell concurrently without losing stock deltas or history',async()=>{
  tick();await Promise.all(dbs.map(d=>peekV2Session(d,userId).catchUp()));const base=state(0);
  const requests=[0,1].map(i=>({operationKey:`parallel-sale-${i}`,changes:[
   change(base,'produtos',base.produtos.map(p=>p.id===pid?{...p,estoqueVitrine:p.estoqueVitrine-1,estoque:p.estoque-1}:p)),
   change(base,'historicoVendas',[{id:`parallel-${i}`,estado:'concluida',totalBRL:1,itens:[]},...base.historicoVendas])],
   guards:[{type:'cash_session_open',sessionId:cash.id}],stockEvents:[{id:`parallel-${i}`,produtoId:pid,tipo:'venda',detalhes:{vitrine:1}}]}));
  const results=await Promise.all(requests.map((r,i)=>commit(i,r)));results.forEach(ok);await session(0).catchUp();
  assert.equal(state(0).produtos.find(p=>p.id===pid).estoqueVitrine,product.estoqueVitrine-3);
  for(let i=0;i<2;i++)assert(state(0).historicoVendas.some(v=>v.id===`parallel-${i}`));
 });
 await test('Fiado uses original credit guard and preserves other clients',async()=>{
  tick();const b=state(0),client=b.clientes.find(c=>Number(c.limiteCreditoBRL)>Number(c.saldoDevedorBRL||0)+1);assert(client);
  const result=await commit(0,{operationKey:'fiado-test',changes:[change(b,'clientes',b.clientes.map(c=>c.id===client.id?{...c,saldoDevedorBRL:Number(c.saldoDevedorBRL||0)+1}:c))],guards:[{type:'client_credit_capacity',clientId:client.id,amount:1}]});ok(result);
  tick();const rejected=await commit(0,{operationKey:'fiado-over-limit',changes:[change(state(0),'clientes',state(0).clientes)],guards:[{type:'client_credit_capacity',clientId:client.id,amount:Number(client.limiteCreditoBRL)+1}]});assert.equal(rejected.error.code,'ZENOS_CREDIT_LIMIT_CONFLICT');
 });
 await test('Purchase preserves approved inventory merge and weighted cost contract',async()=>{
  tick();const b=state(0),p=b.produtos.find(p=>p.id===pid);
  const r=await commit(0,{operationKey:'purchase-test',changes:[change(b,'historicoCompras',[{id:'EMULATOR-PURCHASE',totalBRL:2,itens:[]},...b.historicoCompras]),change(b,'produtos',b.produtos.map(x=>x.id===pid?{...x,estoqueGalpao:Number(x.estoqueGalpao||0)+2,estoque:Number(x.estoque||0)+2}:x))]});ok(r);
  assert.equal(state(0).produtos.find(x=>x.id===pid).estoqueGalpao,Number(p.estoqueGalpao||0)+2);
 });
 await test('Negative inventory rolls back all fields and creates no receipt',async()=>{
  tick();const b=state(0),before=session(0).sequence;
  const r=await commit(0,{operationKey:'invalid-negative',changes:[change(b,'produtos',b.produtos.map(x=>x.id===pid?{...x,estoqueVitrine:-100,estoque:-100}:x)),change(b,'historicoVendas',[{id:'MUST-NOT-EXIST'},...b.historicoVendas])]});
  assert.equal(r.error.code,'ZENOS_NEGATIVE_STOCK_BLOCKED');assert.equal(session(0).sequence,before);assert(!state(0).historicoVendas.some(s=>s.id==='MUST-NOT-EXIST'));
 });
 await test('Competing terminals cannot sell the last unit twice',async()=>{
  tick();let b=state(0);ok(await commit(0,{operationKey:'last-unit-fixture',changes:[change(b,'produtos',b.produtos.map(p=>p.id===pid?{...p,estoque:1,estoqueVitrine:1,estoqueGalpao:0}:p))]}));
  await session(1).catchUp();b=state(0);tick();
  const requests=[0,1].map(i=>({operationKey:`last-unit-${i}`,changes:[change(b,'produtos',b.produtos.map(p=>p.id===pid?{...p,estoque:0,estoqueVitrine:0}:p)),change(b,'historicoVendas',[{id:`last-unit-${i}`,estado:'concluida',totalBRL:1,itens:[]},...b.historicoVendas])],stockEvents:[{id:`last-unit-${i}`,produtoId:pid,tipo:'venda',detalhes:{vitrine:1}}]}));
  const results=await Promise.all(requests.map((r,i)=>commit(i,r)));assert.equal(results.filter(r=>r.cloudOk).length,1);assert.equal(results.find(r=>!r.cloudOk).error.code,'ZENOS_STOCK_CONFLICT');await session(0).catchUp();assert.equal(state(0).produtos.find(p=>p.id===pid).estoqueVitrine,0);
 });
 await test('Guarded pending-order conversion preserves tombstoned original and all other sales',async()=>{
  tick();const b=state(0),pending=b.historicoVendas.find(v=>v.estado==='pendente');assert(pending);
  const r=await commit(0,{operationKey:'convert-pending',changes:[{...change(b,'historicoVendas',[{...pending,id:'EMULATOR-CONVERTED',estado:'concluida'},...b.historicoVendas.filter(v=>v.id!==pending.id)]),removeEntityIds:[pending.id]}],guards:[{type:'entity_field_equals',field:'historicoVendas',entityId:pending.id,property:'estado',expected:'pendente'}]});ok(r);
  const old=(await getDoc(doc(db,...root,'vendas',encodeV2Id(pending.id)))).data();assert.equal(old.deleted,true);assert.equal(stableV2Json(old.data),stableV2Json(pending));assert(!state(0).historicoVendas.some(v=>v.id===pending.id));
 });
 await test('V2 ignores unchanged tombstone in stale sale history and preserves new sale',async()=>{
  // Reproduces the V2_REUSE_ID incident: another terminal converted a pending
  // order, while this terminal still holds the pre-conversion history in memory.
  tick();const latest=state(0);
  const removed=(await getDoc(doc(db,...root,'vendas',encodeV2Id('EMULATOR-CONVERTED')))).data();
  assert(removed&&!removed.deleted);
  // The tombstoned source is taken directly from the V2 records (kept for audit).
  const pendingRecord=[...session(0).records.get('historicoVendas').values()]
    .find(r=>r.deleted&&r.data?.estado==='pendente');
  assert(pendingRecord,'A fixture must contain a converted/tombstoned pending order');
  const pending=pendingRecord.data;
  const oldBase=[pending,...latest.historicoVendas];
  const novaVenda={id:'EMULATOR-STABLE-POST-TOMBSTONE',estado:'concluida',totalBRL:3,itens:[]};
  const clean=await commit(0,{operationKey:'post-tombstone-stale-sale',
    changes:[{field:'historicoVendas',baseValue:oldBase,value:[novaVenda,...oldBase]}]});
  ok(clean);
  assert(state(0).historicoVendas.some(v=>v.id===novaVenda.id));
  assert(!state(0).historicoVendas.some(v=>v.id===pending.id));
  const tombstone=(await getDoc(doc(db,...root,'vendas',encodeV2Id(pending.id)))).data();
  assert.equal(tombstone.deleted,true);
  const previousSequence=session(0).sequence;
  const localEdit={...pending,estado:'concluida'};
  const invalid=await commit(0,{operationKey:'do-not-revive-pending',
    changes:[{field:'historicoVendas',baseValue:oldBase,value:[localEdit,...oldBase.filter(v=>v.id!==pending.id)]}]});
  assert.equal(invalid.cloudOk,false);
  assert.equal(invalid.error.code,'ZENOS_ENTITY_DELETED_REMOTE');
  assert.equal(session(0).sequence,previousSequence);
  assert.equal((await getDoc(doc(db,...root,'vendas',encodeV2Id(pending.id)))).data().deleted,true);
 });
 await test('Expense, cash movement and canonical finance share a single atomic commit',async()=>{
  tick();const b=state(0);ok(await commit(0,{operationKey:'expense-test',changes:[change(b,'despesas',[{id:'EMULATOR-EXPENSE',valor:1},...b.despesas]),change(b,'caixaMovimentos',[{id:'EMULATOR-MOV',valor:1,sessaoId:cash.id,tipo:'sangria'},...b.caixaMovimentos])],guards:[{type:'cash_session_open',sessionId:cash.id}],financialEntries:[{id:'expense-ledger',tipo:'despesa',referenciaId:'EMULATOR-EXPENSE',valor:1,direcao:'saida',createdAt:'2026-10-17T00:00:00.000Z'}]}));
  assert((await getDoc(doc(db,'lojas',userId,'financeiro_livro','expense-ledger'))).exists());
  tick();const seq=session(0).sequence,c=state(0);const r=await commit(0,{operationKey:'expense-collision',changes:[change(c,'despesas',[{id:'MUST-NOT-BE-SAVED'},...c.despesas])],financialEntries:[{id:'expense-ledger',tipo:'despesa',referenciaId:'different',valor:1}]});assert.equal(r.error.code,'V2_HISTORY_COLLISION');assert.equal(session(0).sequence,seq);assert(!state(0).despesas.some(d=>d.id==='MUST-NOT-BE-SAVED'));
 });
 await test('Original cash-close signature rejects stale sale history',async()=>{
  tick();const b=state(0),before=session(0).sequence;
  const r=await commit(0,{operationKey:'close-stale',changes:[change(b,'sessoesCaixa',b.sessoesCaixa.map(s=>s.id===cash.id?{...s,status:'fechada'}:s))],guards:[{type:'cash_close_snapshot_matches',sessionId:cash.id,assinatura:'stale'}]});assert.equal(r.error.code,'ZENOS_CASH_CLOSE_STALE');assert.equal(session(0).sequence,before);
 });
 await test('Close actual open Central Motos cash session using existing signature guard',async()=>{
  tick();const b=state(0),c=b.sessoesCaixa.find(s=>s.id===cash.id);
  const r=await commit(0,{operationKey:`fechar-caixa:${c.id}`,changes:[change(b,'sessoesCaixa',b.sessoesCaixa.map(s=>s.id===c.id?{...s,status:'fechada'}:s))],guards:[{type:'cash_session_open',sessionId:c.id},{type:'cash_close_snapshot_matches',sessionId:c.id,assinatura:assinaturaFinanceiraSessao({sessao:c,historicoVendas:b.historicoVendas,caixaMovimentos:b.caixaMovimentos})}]});ok(r);assert.equal(state(0).sessoesCaixa.find(s=>s.id===c.id).status,'fechada');
  tick();const rejected=await commit(0,{operationKey:'sale-after-close',changes:[change(state(0),'historicoVendas',[{id:'CLOSED-NOT-SAVED'},...state(0).historicoVendas])],guards:[{type:'cash_session_open',sessionId:c.id}]});assert.equal(rejected.error.code,'ZENOS_CASH_SESSION_NOT_OPEN');
 });
 await test('Reactive single-field App saves also route to V2',async()=>{
  tick();const b=state(0);const r=await persistV1OperationFieldSafe({db,userId,field:'fornecedores',baseValue:b.fornecedores,value:[...b.fornecedores,{id:'EMULATOR-SUPPLIER',nome:'Test'}]});ok(r);assert(r.value.some(s=>s.id==='EMULATOR-SUPPLIER'));
 });
 await test('Firestore native timestamp and unknown legacy fields survive a real write and reload',async()=>{
  tick();const b=state(0),time=new Timestamp(1700000000,123456789);
  ok(await commit(0,{operationKey:'native-types',changes:[change(b,'fornecedores',[...b.fornecedores,{id:'NATIVE-TYPES',nome:'Test',unknown:{time,originalIdType:42}}])]}));
  const stored=(await getDoc(doc(db,...root,'fornecedores','NATIVE-TYPES'))).data();assert(stored.data.unknown.time instanceof Timestamp);assert.equal(stored.data.unknown.time.nanoseconds,123456000);
 });
 await test('Read failure after confirmed commit cannot turn a saved operation into a failed sale',async()=>{
  tick();const b=state(0),s=session(0),original=s.catchUp.bind(s);let calls=0;
  s.catchUp=async()=>{if(++calls===2)throw Error('Simulated read failure after confirmed write');return original();};
  const r=await commit(0,{operationKey:'confirmed-then-read-failed',changes:[change(b,'fornecedores',[...b.fornecedores,{id:'CONFIRMED-BEFORE-READ-FAILURE'}])]});
  ok(r);assert.equal(r.requiresReload,true);assert((await getDoc(doc(db,...root,'fornecedores','CONFIRMED-BEFORE-READ-FAILURE'))).exists());
  clearOperationalSession(db,userId);await getOperationalSnapshot(db,userId);assert(state(0).fornecedores.some(v=>v.id==='CONFIRMED-BEFORE-READ-FAILURE'));
 });
 await test('V1 complete document remains untouched after all integrated operations',async()=>assert.deepEqual((await getDoc(opRef)).data(),v1Before));
 await test('Realtime terminal catches all committed operations without V1 fallback',async()=>{
  await session(1).catchUp();assert.equal(session(1).sequence,session(0).sequence);assert.equal(stableV2Json(state(1)),stableV2Json(state(0)));assert(lastSnapshot);
 });
 await test('Fresh application reload reconstructs all operations and unchanged legacy records',async()=>{
  stop?.();stop=null;const before=state(1);clearOperationalSession(dbs[1],userId);
  const loaded=await getOperationalSnapshot(dbs[1],userId);assert.equal(stableV2Json(loaded.data()),stableV2Json(before));
 });
 await test('Server refuses stale V1 writer, control tampering, receipt overwrite and orphan V2 writes',async()=>{
  if(process.env.ZENOS_FENCED_RULES!=='1')return;
  await assert.rejects(setDoc(opRef,{sentinel:'must-not-save'},{merge:true}),e=>e.code==='permission-denied');
  await assert.rejects(setDoc(doc(db,'lojas',userId,'dados','storage_control'),{...control,mode:'legacy'}),e=>e.code==='permission-denied');
  const receipts=await getDocs(collection(db,...root,'operations'));
  await assert.rejects(setDoc(receipts.docs[0].ref,{...receipts.docs[0].data(),key:'tampered'}),e=>e.code==='permission-denied');
  await assert.rejects(setDoc(doc(db,...root,'produtos','ORPHAN'),{data:{id:'ORPHAN'},legacyField:'produtos',legacyIndex:0,version:session(0).sequence+1,deleted:false,commandId:'a'.repeat(64)}),e=>e.code==='permission-denied');
  await assert.rejects(setDoc(doc(db,'lojas',userId,'financeiro_livro','ORPHAN'),{id:'ORPHAN',valor:1}),e=>e.code==='permission-denied');
 });
 await test('Other account and unauthenticated client cannot read this store or its collections',async()=>{
  if(process.env.ZENOS_FENCED_RULES!=='1')return;
  const otherApps=[initializeApp(appConfig,`outsider-${tickNow()}`),initializeApp(appConfig,`anonymous-${tickNow()}`)];
  try{
   const otherDbs=otherApps.map(a=>{connectAuthEmulator(getAuth(a),'http://127.0.0.1:9099',{disableWarnings:true});const d=getFirestore(a);connectFirestoreEmulator(d,'127.0.0.1',8080);return d;});
   await createUserWithEmailAndPassword(getAuth(otherApps[0]),`outsider-${tickNow()}@example.test`,password);
   for(const d of otherDbs){await assert.rejects(getDoc(doc(d,'lojas',userId,'dados','operacao')),e=>e.code==='permission-denied');await assert.rejects(getDocs(collection(d,...root,'vendas')),e=>e.code==='permission-denied');}
  }finally{await Promise.all(otherApps.map(deleteApp));}
 });
 await test('Maintenance control blocks new writes',async()=>{
  stop?.();stop=null;await adminSet(`lojas/${userId}/dados/storage_control`,{...control,mode:'maintenance'});tick();const b=state(0);
  const r=await commit(0,{operationKey:'blocked-maintenance',changes:[change(b,'fornecedores',b.fornecedores)]});assert.equal(r.error.code,'V2_ROUTE_CHANGED');
 });
 await test('Maintenance reload preserves complete data and remains read-only',async()=>{
  clearOperationalSession(dbs[1],userId);const snap=await getOperationalSnapshot(dbs[1],userId);assert.equal(snap.data().historicoVendas.length,state(0).historicoVendas.length);
  tick();const r=await commit(1,{operationKey:'maintenance-new-session',changes:[change(snap.data(),'fornecedores',snap.data().fornecedores)]});assert.equal(r.error.code,'V2_READ_ONLY');
 });
 await test('Broken V2 destination fails closed instead of falling back to frozen V1',async()=>{
  clearOperationalSession(dbs[1],userId);await adminSet(`lojas/${userId}/dados/storage_control`,{...control,generation:'0'.repeat(24)});
  await assert.rejects(getOperationalSnapshot(dbs[1],userId),e=>e.code==='V2_NOT_READY');
 });
 const report={fencedRules:process.env.ZENOS_FENCED_RULES==='1',pilotRules:process.env.ZENOS_PILOT_RULES==='1',suite:'actual-app-v2-central-motos',backupChecksum:backup.checksum,passed:passed.length,tests:passed,productionRequests:0,firstSaleReads:saleResult.reads,firstSaleWrites:saleResult.writes,finalSequence:session(0).sequence,originalV1Preserved:true};
 console.log(JSON.stringify(report,null,2));
 if(process.env.ZENOS_REPORT_PATH)fs.writeFileSync(process.env.ZENOS_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
}finally{Date.now=tickNow;stop?.();await Promise.all(apps.map(deleteApp));}
