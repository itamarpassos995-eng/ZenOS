import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,setDoc,terminate} from 'firebase/firestore';
import {getOperationalSnapshot,clearOperationalSession} from '../../src/core/operationalRepository.js';
import {persistV1BusinessOperationSafe} from '../../src/core/productionSync.js';
import {aplicarVendaAoEstoque} from '../../src/core/inventory.js';
import {calcularConciliacaoFisicaMultimoeda} from '../../src/core/cashReconciliation.js';
import {criarEventoEstoque} from '../../src/core/stockAuditCore.js';
import {seed,db as adminDb,PIN,PASSWORD} from '../../operational-functions/test/distribution/fixture.mjs';
import {distributionService} from '../../operational-functions/src/distribution/service.js';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
const service=distributionService(adminDb),apps=[],dbs=[];
let passed=0;const check=(value,msg)=>{assert.ok(value,msg);passed++;};
async function setup(stock=5){
 const f=await seed('distribution-race-'+randomUUID().slice(0,6),{stock});
 const app=initializeApp({projectId:'demo-zenos-local',apiKey:'demo-key'},f.uid);apps.push(app);
 const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});await signInWithEmailAndPassword(auth,f.email,PASSWORD);
 const db=getFirestore(app);dbs.push(db);connectFirestoreEmulator(db,'127.0.0.1',8080);
 await getOperationalSnapshot(db,f.uid);
 const s=await service.login(f.uid,{operatorId:'admin',pin:PIN});return {...f,app,db,s};
}
const command=(f,type,loadId,revision,payload={},key=randomUUID())=>service.command(f.uid,f.s.sessionToken,{type,loadId,expectedRevision:revision,payload,key});
const create=(f,l='L1',q=5,orderId='O001')=>command(f,'CREATE',l,0,{selections:[{orderId,lineIndex:0,quantity:q}]});
async function sell(f,q,key='pdv:RACE-SALE'){
 const state=(await getOperationalSnapshot(f.db,f.uid)).data();
 let plan;try{plan=aplicarVendaAoEstoque(state.produtos,[{id:'P1',sku:'SINT-001',qtd:q,nome:'Teste',precoPraticadoBRL:30}]);}catch(e){return {cloudOk:false,error:e};}
 const sale={id:key.slice(4),tipoDocumento:'venda',estado:'concluida',clienteId:'C1',clienteNome:'Teste',vendedorId:'admin',totalBRL:q*30,itens:plan.itens,createdAt:new Date().toISOString()};
 const events=plan.itens.map(i=>criarEventoEstoque({id:key.replace(':','-'),produto:i,tipo:'venda',quantidade:q,detalhes:{vitrine:i.movimentoEstoqueVenda.vitrine,deposito:i.movimentoEstoqueVenda.galpao}}));
 return persistV1BusinessOperationSafe({db:f.db,userId:f.uid,changes:[{field:'produtos',baseValue:state.produtos,value:plan.produtos},{field:'historicoVendas',baseValue:state.historicoVendas,value:[sale,...state.historicoVendas]}],stockEvents:events,financialEntries:[{id:`PAY-${sale.id}`,tipo:'venda',referenciaId:sale.id,valor:q*30,formaPagamento:'dinheiro_brl',sessaoId:'CASH1',afetaCaixaFisico:true}],guards:[{type:'cash_session_open',sessionId:'CASH1'}],operationKey:key});
}
try{
 const f=await setup();await create(f);
 const raced=await Promise.allSettled([sell(f,5),command(f,'RESERVE','L1',1)]);
 const outcomes=raced.map(r=>r.status==='fulfilled'?(r.value?.cloudOk??true):false);
 check(outcomes.filter(Boolean).length===1,'Exactly one writer can consume the last units');
 const product=(await adminDb.doc(`${f.base}/produtos/P1`).get()).data().data;
 check(product.estoque>=0&&product.estoqueGalpao>=product.estoqueReservadoDistribuicao,'No accidental negative or reservation theft');
 if(outcomes[1]){await command(f,'CANCEL','L1',2);const result=await sell(f,5);check(result.cloudOk,result.error?.message);}
 else check((await adminDb.collection(`${f.root}/financeiro_livro`).get()).size===1,'Single financial posting');
 // Full reload/reconnection uses the real V2 receipts, not an in-memory adapter.
 clearOperationalSession(f.db,f.uid);const reloaded=(await getOperationalSnapshot(f.db,f.uid)).data();
 check(reloaded.produtos[0].estoque===0,'Reconnection reflects confirmed physical stock');
 check(reloaded.historicoVendas.some(s=>s.id==='RACE-SALE'),'Confirmed sale is preserved');
 const g=await setup(10);await create(g,'L1',2);await create(g,'L2',3);await command(g,'RESERVE','L1',1);await command(g,'RESERVE','L2',1);
 const reservedState=(await getOperationalSnapshot(g.db,g.uid)).data();
 const tamper=await persistV1BusinessOperationSafe({db:g.db,userId:g.uid,changes:[{field:'produtos',baseValue:reservedState.produtos,value:reservedState.produtos.map(p=>({...p,estoqueReservadoDistribuicao:0}))}],operationKey:'tamper-reservation'});
 check(!tamper.cloudOk,'Rules reject reservation theft by a client writer');
 const tamperOrder=await persistV1BusinessOperationSafe({db:g.db,userId:g.uid,changes:[{field:'historicoVendas',baseValue:reservedState.historicoVendas,value:reservedState.historicoVendas.map(o=>o.id==='O001'?{...o,_distribution:{stockManaged:false}}:o)}],operationKey:'tamper-commercial-ownership'});
 check(!tamperOrder.cloudOk,'Rules reject client commercial ownership bypass');
 async function ship(loadId,quantity){await command(g,'START_PICK',loadId,2);await command(g,'CHECK',loadId,3,{quantities:[quantity]});await command(g,'APPROVE',loadId,4);await command(g,'MANIFEST',loadId,5,{vehicle:'TEST',driver:'TEST',route:'TEST'});await command(g,'DISPATCH',loadId,6);}
 await ship('L1',2);
 // This calls the actual PDV writer; its logistics guard routes to the trusted finalization backend.
 const state=(await getOperationalSnapshot(g.db,g.uid)).data(),source=state.historicoVendas.find(o=>o.id==='O001');
 const payload={orderId:'O001',operatorId:'admin',pin:PIN,sessionId:'CASH1',customerId:'C1',cart:source.itens.map(i=>({id:String(i.id),sku:i.sku,qtd:Number(i.qtd),precoPraticadoBRL:Number(i.precoPraticadoBRL)})),payments:[{formaId:'dinheiro_pyg',moedaOrigem:'PYG',valorOriginal:199950,valorConvertidoBRL:150}]};
 const nativeFetch=globalThis.fetch;globalThis.fetch=(url,options)=>nativeFetch(typeof url==='string'&&url.startsWith('/__distribution')?url.replace('/__distribution','http://127.0.0.1:8787'):url,options);
 try{
 const results=await Promise.all([persistV1BusinessOperationSafe({db:g.db,userId:g.uid,changes:[],guards:[{type:'distribution_finalize',payload}]}),persistV1BusinessOperationSafe({db:g.db,userId:g.uid,changes:[],guards:[{type:'distribution_finalize',payload}]})]);
 check(results.every(r=>r.cloudOk),results.map(r=>r.error?.message).join(','));
 check((await adminDb.collection(`${g.root}/financeiro_livro`).get()).size===1,'Duplicate finalization has one financial entry');
 check((await adminDb.doc(`${g.base}/produtos/P1`).get()).data().data.estoque===8,'Commercial finalization does not deduct stock');
 await ship('L2',3);
 check((await adminDb.doc(`${g.base}/produtos/P1`).get()).data().data.estoque===5,'Remaining shipment deducts only its quantity');
 const sale=(await adminDb.doc(`${g.base}/vendas/O001`).get()).data().data;
 check(sale.estado==='concluida'&&sale.moedaDocumento==='PYG'&&sale.totalOriginal===199950&&sale.vendedorId==='sales'&&sale.clienteId==='C1','Commercial identity and original money preserved');
 const native=calcularConciliacaoFisicaMultimoeda({sessao:{id:'CASH1',operadorId:'admin',status:'aberta',saldoInicial:0},historicoVendas:[sale],contagem:{PYG:199950},taxas:{BRL:1,PYG:1333}});
 check(native.esperado.PYG===199950&&native.esperado.BRL===0,'Cash reconciliation preserves native PYG without mixing currencies');
 const replay=await persistV1BusinessOperationSafe({db:g.db,userId:g.uid,changes:[],guards:[{type:'distribution_finalize',payload}]});check(replay.cloudOk&&replay.alreadyCommitted,'Reconnect/duplicate returns the confirmed sale');
 }finally{globalThis.fetch=nativeFetch;}
 const h=await setup(5);await create(h);await command(h,'RESERVE','L1',1);await command(h,'START_PICK','L1',2);await command(h,'CHECK','L1',3,{quantities:[5]});await command(h,'APPROVE','L1',4);await command(h,'MANIFEST','L1',5,{vehicle:'TEST',driver:'TEST',route:'TEST'});
 const departure=await Promise.allSettled([sell(h,1,'pdv:CONCURRENT-SALE'),command(h,'DISPATCH','L1',6)]);
 check(departure[1].status==='fulfilled'&&(departure[0].status==='rejected'||!departure[0].value.cloudOk),'Dispatch and real POS writer cannot consume the same reservation');
 check((await adminDb.doc(`${h.base}/produtos/P1`).get()).data().data.estoque===0,'Concurrent dispatch leaves exact stock zero');
 check((await adminDb.doc(`${h.base}/vendas/O001`).get()).exists,'Pending source order is retained after shipment');
 // Real rules reject direct client re-enabling, reservation tampering and commercial mutation.
 await assert.rejects(setDoc(doc(g.db,`${g.root}/dados/storage_control`),{mode:'v2'}),e=>e.code==='permission-denied');passed++;
 await assert.rejects(setDoc(doc(g.db,`${g.root}/distribution_config/module`),{enabled:true}),e=>e.code==='permission-denied');passed++;
 const proof={passed,realPdvWriter:true,realDistributionWriter:true,rules:'fenced-v2-with-reservation-invariants',stock:{initial:10,firstShipment:2,secondShipment:3,remaining:5},financialEntries:1,productionRequests:0};
 const {mkdir,writeFile}=await import('node:fs/promises');await mkdir('tmp/distribution',{recursive:true});await writeFile('tmp/distribution/integrity.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{for(const d of dbs){clearOperationalSession(d, getAuth(d.app).currentUser?.uid);await terminate(d);}for(const a of apps)await deleteApp(a);}
