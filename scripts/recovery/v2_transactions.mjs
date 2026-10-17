import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,getDoc} from 'firebase/firestore';
import {commitV2Pilot} from '../../src/core/v2TransactionPilot.js';
import {resolveV2ReadMode} from '../../src/core/v2ReadMode.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.GCLOUD_PROJECT!=='demo-zenos-local')throw Error('Local demo Emulator required');
const stamp=Date.now(), config={apiKey:'demo-key',projectId:'demo-zenos-local',authDomain:'demo-zenos-local.firebaseapp.com'};
const apps=['A','B','other','anon'].map(n=>initializeApp(config,`${n}-${stamp}`));
let checks=0;
const check=async(name,fn)=>{await fn();checks++;console.log(`[OK] ${name}`);};
try{
 const auths=apps.map(app=>getAuth(app)),dbs=apps.map(app=>getFirestore(app));
 auths.forEach(a=>connectAuthEmulator(a,'http://127.0.0.1:9099',{disableWarnings:true}));
 dbs.forEach(d=>connectFirestoreEmulator(d,'127.0.0.1',8080));
 const email=`pilot-${stamp}@example.test`,password='EmulatorOnly!4937';
 const user=await createUserWithEmailAndPassword(auths[0],email,password);
 await signInWithEmailAndPassword(auths[1],email,password);
 await createUserWithEmailAndPassword(auths[2],`other-${stamp}@example.test`,password);
 const storeId=user.user.uid,generation='isolated-pilot';
 const root=['lojas',storeId,'v2_generations',generation];
 const ref=(db,c,id)=>doc(db,...root,c,encodeURIComponent(id).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()));
 await setDoc(doc(dbs[0],...root),{schema:2,mode:'pilot',sequence:0});
 await setDoc(ref(dbs[0],'produtos','P1'),{data:{id:'P1',estoque:1,estoqueGalpao:1,estoqueVitrine:0,legacyUnknown:'preservar'},version:0});
 await setDoc(ref(dbs[0],'clientes','C1'),{data:{id:'C1',saldoDevedorBRL:0},version:0});
 await setDoc(ref(dbs[0],'sessoesCaixa','S1'),{data:{id:'S1',status:'aberta'},version:0});
 const commit=(db,key,kind,mutations,extra={})=>commitV2Pilot({db,storeId,generation,operationKey:key,kind,mutations,...extra});
 const guard=[{collection:'sessoesCaixa',id:'S1',equals:{status:'aberta'}}];
 const sale=(db,key)=>commit(db,key,'venda',[
  {collection:'produtos',id:'P1',increments:{estoque:-1,estoqueGalpao:-1}},
  {collection:'vendas',id:key,create:true,patch:{id:key,totalBRL:10,sessaoId:'S1'}},
  {collection:'financeiro',id:key,create:true,patch:{id:key,valor:10,sessaoId:'S1'}},
  {collection:'auditoria',id:key,create:true,patch:{id:key,produtoId:'P1',qtd:-1}}],{guards:guard});
 let winner;
 await check('Dois terminais disputam ultima unidade: somente uma venda e um financeiro',async()=>{
  const results=await Promise.allSettled([sale(dbs[0],'V-A'),sale(dbs[1],'V-B')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  winner=results[0].status==='fulfilled'?'V-A':'V-B';
  const loser=winner==='V-A'?'V-B':'V-A';
  assert.equal((await getDoc(ref(dbs[0],'produtos','P1'))).data().data.estoque,0);
  assert.equal((await getDoc(ref(dbs[0],'vendas',loser))).exists(),false);
  assert.equal((await getDoc(ref(dbs[0],'financeiro',loser))).exists(),false);
  assert.equal((await getDoc(ref(dbs[0],'produtos','P1'))).data().data.legacyUnknown,'preservar');
 });
 await check('Replay permanente nao duplica baixa, venda ou financeiro',async()=>{
  assert.equal((await sale(dbs[1],winner)).replayed,true);
  assert.equal((await getDoc(ref(dbs[0],'produtos','P1'))).data().data.estoque,0);
 });
 await check('Mesma chave com outro conteudo e bloqueada',async()=>{
  await assert.rejects(commit(dbs[0],winner,'venda',[{collection:'clientes',id:'C1',increments:{saldoDevedorBRL:1}}]),e=>e.code==='V2_IDEMPOTENCY_CONFLICT');
 });
 await check('Compra fracionada atualiza estoque e obrigacao atomicamente',async()=>{
  await commit(dbs[0],'COMPRA-1','compra',[
   {collection:'produtos',id:'P1',increments:{estoque:2.5,estoqueGalpao:2.5}},
   {collection:'compras',id:'COMPRA-1',create:true,patch:{id:'COMPRA-1',totalBRL:25}},
   {collection:'contasPagar',id:'AP1',create:true,patch:{id:'AP1',saldoBRL:25}}]);
  assert.equal((await getDoc(ref(dbs[0],'produtos','P1'))).data().data.estoque,2.5);
  assert.equal((await getDoc(ref(dbs[0],'contasPagar','AP1'))).data().data.saldoBRL,25);
 });
 await check('Fiado concorrente preserva os dois deltas e registros',async()=>{
  await Promise.all(dbs.slice(0,2).map((db,i)=>commit(db,`FIADO-${i}`,'fiado',[
   {collection:'clientes',id:'C1',increments:{saldoDevedorBRL:10}},
   {collection:'contasReceber',id:`AR${i}`,create:true,patch:{id:`AR${i}`,saldoBRL:10}}])));
  assert.equal((await getDoc(ref(dbs[0],'clientes','C1'))).data().data.saldoDevedorBRL,20);
 });
 await check('Recebimento excessivo e rollback atomico nao deixam financeiro orfao',async()=>{
  await assert.rejects(commit(dbs[0],'RECEBER-X','recebimento',[
   {collection:'clientes',id:'C1',increments:{saldoDevedorBRL:-21}},
   {collection:'financeiro',id:'RECEBER-X',create:true,patch:{id:'RECEBER-X',valor:21}}]),e=>e.code==='V2_NEGATIVE');
  assert.equal((await getDoc(ref(dbs[0],'financeiro','RECEBER-X'))).exists(),false);
 });
 await check('Devolucoes concorrentes com versao guardada nao duplicam reestoque',async()=>{
  const refund=(db,key)=>commit(db,key,'devolucao',[
   {collection:'vendas',id:winner,expectedVersion:1,patch:{valorDevolvidoBRL:10,estado:'cancelada'}},
   {collection:'produtos',id:'P1',increments:{estoque:1,estoqueGalpao:1}},
   {collection:'devolucoes',id:key,create:true,patch:{id:key,vendaId:winner,valorBRL:10}},
   {collection:'financeiro',id:key,create:true,patch:{id:key,valor:10,tipo:'saida'}}]);
  const results=await Promise.allSettled([refund(dbs[0],'DEV-A'),refund(dbs[1],'DEV-B')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await getDoc(ref(dbs[0],'produtos','P1'))).data().data.estoque,3.5);
 });
 await check('Despesa cria movimento e financeiro no mesmo commit',async()=>{
  await commit(dbs[0],'DESPESA-1','despesa',[
   {collection:'despesas',id:'D1',create:true,patch:{id:'D1',valorBRL:5,status:'paga'}},
   {collection:'movimentosCaixa',id:'M1',create:true,patch:{id:'M1',valorBRL:5,direcao:'saida',sessaoId:'S1'}},
   {collection:'financeiro',id:'D1',create:true,patch:{id:'D1',valor:5,tipo:'saida'}}],{guards:guard});
  assert.equal((await getDoc(ref(dbs[0],'despesas','D1'))).exists(),true);
  assert.equal((await getDoc(ref(dbs[0],'movimentosCaixa','M1'))).exists(),true);
 });
 await check('Fechamento com snapshot antigo e bloqueado',async()=>{
  await assert.rejects(commit(dbs[0],'FECHAR-OLD','caixa',[{collection:'sessoesCaixa',id:'S1',patch:{status:'fechada'}}],{expectedSequence:0}),e=>e.code==='V2_STALE');
 });
 await check('Dois fechamentos do mesmo caixa confirmam somente um',async()=>{
  const close=(db,key)=>commit(db,key,'caixa',[{collection:'sessoesCaixa',id:'S1',patch:{status:'fechada'},expectedVersion:0}],{guards:guard});
  const results=await Promise.allSettled([close(dbs[0],'FECHAR-A'),close(dbs[1],'FECHAR-B')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await getDoc(ref(dbs[0],'sessoesCaixa','S1'))).data().data.status,'fechada');
 });
 await check('Venda em caixa fechado nao baixa estoque',async()=>{
  await assert.rejects(sale(dbs[0],'VENDA-FECHADO'),e=>e.code==='V2_GUARD_CHANGED');
  assert.equal((await getDoc(ref(dbs[0],'produtos','P1'))).data().data.estoque,3.5);
 });
 await check('Outra loja e visitante sem login nao acessam V2',async()=>{
  for(const db of [dbs[2],dbs[3]]) {
   await assert.rejects(getDoc(ref(db,'produtos','P1')),e=>e.code==='permission-denied');
   await assert.rejects(setDoc(ref(db,'produtos','P1'),{data:{estoque:0}}),e=>e.code==='permission-denied');
  }
 });
 await check('Orcamento bloqueia operacao grande antes da transacao',async()=>{
  await assert.rejects(commit(dbs[0],'BIG','venda',Array.from({length:151},(_,i)=>({collection:'produtos',id:`P${i}`,patch:{nome:'x'}}))),e=>e.code==='V2_BUDGET');
 });
 await check('Piloto recusa projeto de producao antes de qualquer chamada',async()=>{
  await assert.rejects(commitV2Pilot({db:{app:{options:{projectId:'zenos-ac6b2'}}}}),e=>e.code==='V2_PILOT_ONLY');
 });
 await check('Flag ausente preserva legado; shadow nao ativa V2; certificado incompleto bloqueia',async()=>{
  assert.deepEqual(resolveV2ReadMode(null),{primary:'v1',shadow:false});
  const generation='a'.repeat(24);
  assert.equal(resolveV2ReadMode({mode:'shadow',generation}).primary,'v1');
  assert.throws(()=>resolveV2ReadMode({mode:'v2',generation,certificate:{productionReady:true}}));
  assert.equal(resolveV2ReadMode({mode:'maintenance',generation}).readOnly,true);
 });
 console.log(JSON.stringify({emulatorPilotChecks:checks,productionWrites:0,uiIntegrationCertified:false}));
} finally { await Promise.all(apps.map(deleteApp)); }
