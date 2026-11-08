import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN,PASSWORD} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
import {hash} from '../../src/distribution/security.js';
import {setupTrip,route,signature} from './trip-fixture.mjs';
import {baixarEstoqueProduto,preverBaixaEstoqueProduto,transferirEstoqueEntreLocais} from '../../..//src/core/inventory.js';
const service=distributionService(db);
async function setup(options){const f=await seed('distribution-'+randomUUID().slice(0,8),options);const s=await service.login(f.uid,{operatorId:'admin',pin:PIN});return {...f,s};}
const cmd=(f,type,loadId,revision,payload={},key=randomUUID())=>service.command(f.uid,f.s.sessionToken,{type,loadId,expectedRevision:revision,payload,key});
async function create(f,loadId,orderId='O001',quantity=5){return cmd(f,'CREATE',loadId,0,{selections:[{orderId,lineIndex:0,quantity}]});}
async function ready(f,loadId){await create(f,loadId);for(const [type,rev,payload]of [['RESERVE',1,{}],['START_PICK',2,{}],['CHECK',3,{quantities:[5]}],['APPROVE',4,{}],['MANIFEST',5,{vehicle:'TEST-123',driver:'Motorista sintético',route:'Rota teste'}]])await cmd(f,type,loadId,rev,payload);}
const detail=(f,loadId)=>service.query(f.uid,f.s.sessionToken,{type:'detail',loadId});
test('partial dispatch releases the unshipped balance for a second load without duplicating stock',async()=>{
 const fixture=await setupTrip({stock:10,orders:1});
 const f={...fixture,s:fixture.manager};
 await create(f,'PART');
 await cmd(f,'RESERVE','PART',1);
 await cmd(f,'START_PICK','PART',2);
 await cmd(f,'CHECK','PART',3,{quantities:[2],reason:'Três unidades indisponíveis'});
 const stock=await service.login(f.uid,{operatorId:'stock',pin:PIN});
 await assert.rejects(cmd({...f,s:stock},'APPROVE','PART',4,{partial:true}),{code:'FORBIDDEN'});
 const approval=randomUUID();
 await cmd(f,'APPROVE','PART',4,{partial:true},approval);
 assert.equal((await cmd(f,'APPROVE','PART',4,{partial:true},approval)).replayed,true);
 await cmd(f,'MANIFEST','PART',5,{vehicle:'TEST',driver:'Sintético',route:'Teste'});
 const {load}=await detail(f,'PART');
 assert.equal(load.manifestVersions[0].lines[0].quantity,2);
 assert.equal(load.manifestVersions[0].partialApproval.lines[0].authorized,5);
 await cmd(f,'DISPATCH','PART',6);
 await assert.rejects(create(f,'OVER','O001',4),{code:'ORDER_OVERALLOCATED'});
 await create(f,'NEXT','O001',3);
 const product=(await db.doc(`${f.base}/produtos/P1`).get()).data().data;
 assert.equal(product.estoque,8);
 assert.equal(product.estoqueReservadoDistribuicao,0);
 const next=(await detail(f,'NEXT')).load.lines[0];
 assert.equal(BigInt(next.amount.minor)+BigInt(load.lines[0].amount.minor),199950n);
 await route(f,'manager','SAVE_VEHICLE','V1',0,{plate:'HML-2026',name:'Veículo sintético'});
 await route(f,'manager','SAVE_ROUTE','R1',0,{name:'Rota sintética'});
 await route(f,'manager','CREATE_TRIP','T1',0,{loadIds:['PART'],driverId:'driver',vehicleId:'V1',routeId:'R1'});
 await route(f,'driver','START','T1',1);
 await route(f,'driver','DELIVER','T1',2,{stopId:'O001',quantities:[2],outcome:'TOTAL',receiver:'Sintético',identification:'TEST',signature});
 await assert.rejects(route(f,'driver','COLLECT','T1',3,{stopId:'O001',method:'dinheiro_pyg',currency:'PYG',amount:'199950'}),{code:'COMMERCIAL_POST_REQUIRED'});
 const result=await service.routeQuery(f.uid,f.manager.sessionToken,{type:'detail',tripId:'T1'});
 assert.equal(result.trip.stops[0].commercialPending,true);
 assert.equal(result.trip.receipts.length,0);
});
test('records a shortage, blocks dispatch and freezes the successful recheck in the manifest',async()=>{
 const f=await setup({stock:10});
 await create(f,'SHORT');
 await cmd(f,'RESERVE','SHORT',1);
 await cmd(f,'START_PICK','SHORT',2);
 const payload={quantities:[4],reason:'Uma unidade não localizada'};
 const key=randomUUID();
 const check=await cmd(f,'CHECK','SHORT',3,payload,key);
 assert.equal(check.state,'LOADING');
 assert.equal((await cmd(f,'CHECK','SHORT',3,payload,key)).replayed,true);
 const {load}=await detail(f,'SHORT');
 assert.equal(load.loadingCheck.lines[0].checked,4);
 assert.equal(load.loadingCheck.operatorId,'admin');
 assert.equal(load.loadingCheck.reason,payload.reason);
 await assert.rejects(cmd(f,'APPROVE','SHORT',4),{code:'CHECK_REQUIRED'});
 await assert.rejects(cmd(f,'DISPATCH','SHORT',4),{code:'INVALID_TRANSITION'});
 const product=db.doc(`${f.base}/produtos/P1`);
 assert.equal((await product.get()).data().data.estoque,10);
 await cmd(f,'CHECK','SHORT',4,{quantities:[5]});
 await cmd(f,'APPROVE','SHORT',5);
 await cmd(f,'MANIFEST','SHORT',6,{vehicle:'TEST',driver:'Sintético',route:'Teste'});
 const {load:approved}=await detail(f,'SHORT');
 assert.equal(approved.manifestVersions[0].loadingCheck.lines[0].checked,5);
 await cmd(f,'DISPATCH','SHORT',7);
 assert.equal((await product.get()).data().data.estoque,5);
 const audit=(await db.collection(`${f.root}/distribution_audit`).where('loadId','==','SHORT').get()).docs.map(doc=>doc.data());
 assert.ok(audit.some(event=>event.loadingCheck?.reason===payload.reason));
});
test('PIN server verification rejects incorrect/legacy credentials and seller without inventory access',async()=>{
 const f=await setup();
 await assert.rejects(service.login(f.uid,{operatorId:'admin',pin:'wrong'}),{code:'INVALID_CREDENTIAL'});
 await assert.rejects(service.login(f.uid,{operatorId:'sales',pin:PIN}),{code:'INVALID_CREDENTIAL'});
 const stock=await service.login(f.uid,{operatorId:'stock',pin:PIN});assert.equal(stock.operatorId,'stock');
 await db.doc(`${f.base}/operadores/admin`).update({'data.pinVersion':1});
 await assert.rejects(service.login(f.uid,{operatorId:'admin',pin:PIN}),{code:'INVALID_CREDENTIAL'});
});
test('PIN attempts are persisted and throttled after five failures',async()=>{
 const f=await setup();for(let n=0;n<5;n++)await assert.rejects(service.login(f.uid,{operatorId:'admin',pin:'999999'}),{code:'INVALID_CREDENTIAL'});
 await assert.rejects(service.login(f.uid,{operatorId:'admin',pin:PIN}),{code:'RATE_LIMITED'});
});
test('live revocation, credential change, session expiry and module suspension block even replays',async()=>{
 const f=await setup();await create(f,'L1');
 const stock=await service.login(f.uid,{operatorId:'stock',pin:PIN});
 await db.doc(`${f.base}/operadores/stock`).update({'data.permissoes':{}});
 await assert.rejects(service.query(f.uid,stock.sessionToken,{type:'orders'}),{code:'FORBIDDEN'});
 await db.doc(`${f.root}/distribution_sessions/${hash(f.s.sessionToken)}`).update({expiresAt:0});
 await assert.rejects(detail(f,'L1'),{code:'SESSION_EXPIRED'});
 f.s=await service.login(f.uid,{operatorId:'admin',pin:PIN});
 await db.doc(`${f.base}/operadores/admin`).update({'data.pinSalt':'0'.repeat(32)});
 await assert.rejects(detail(f,'L1'),{code:'FORBIDDEN'});
 await db.doc(`${f.root}/distribution_config/module`).update({enabled:false});
 await assert.rejects(detail(f,'L1'),{code:'MODULE_DISABLED'});
});
test('real Firestore transactions: two loads compete for the last available units',async()=>{
 const f=await setup({stock:5});await create(f,'A','O001');await create(f,'B','O002');
 const results=await Promise.allSettled([cmd(f,'RESERVE','A',1),cmd(f,'RESERVE','B',1)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'INSUFFICIENT_STOCK');
 const p=(await db.doc(`${f.base}/produtos/P1`).get()).data().data;assert.equal(p.estoque,5);assert.equal(p.estoqueReservadoDistribuicao,5);
});
test('real concurrent duplicate command commits one stock reservation, operation and outbox',async()=>{
 const f=await setup({stock:5});await create(f,'L1');const key=randomUUID();
 const results=await Promise.all(Array.from({length:5},()=>cmd(f,'RESERVE','L1',1,{},key)));
 assert.ok(results.every(r=>r.revision===2));assert.equal((await db.doc(f.base).get()).data().sequence,2);
 assert.equal((await db.collection(`${f.root}/distribution_outbox`).get()).size,2);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoqueReservadoDistribuicao,5);
 await assert.rejects(cmd(f,'RESERVE','L1',1,{altered:true},key),{code:'IDEMPOTENCY_CONFLICT'});
});
test('duplicate order allocations and concurrent expected revisions are rejected',async()=>{
 const f=await setup();const results=await Promise.allSettled([create(f,'A'),create(f,'B')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ORDER_OVERALLOCATED');
 const lid=results[0].status==='fulfilled'?'A':'B';
 await cmd(f,'RESERVE',lid,1);await assert.rejects(cmd(f,'CANCEL',lid,1),{code:'REVISION_CONFLICT'});
});
test('partial allocations reconcile frozen total without rounding loss or current currency conversion',async()=>{
 const f=await setup();await create(f,'A','O001',2);await create(f,'B','O001',3);
 const a=(await detail(f,'A')).load,b=(await detail(f,'B')).load;
 assert.equal(BigInt(a.lines[0].amount.minor)+BigInt(b.lines[0].amount.minor),199950n);
 assert.equal(a.lines[0].amount.currency,'PYG');
});
test('cancel releases reservations and order allocation atomically; retry is stable',async()=>{
 const f=await setup();await create(f,'L1');await cmd(f,'RESERVE','L1',1);const key=randomUUID();await cmd(f,'CANCEL','L1',2,{},key);await cmd(f,'CANCEL','L1',2,{},key);
 const p=(await db.doc(`${f.base}/produtos/P1`).get()).data().data;assert.equal(p.estoque,100);assert.equal(p.estoqueReservadoDistribuicao,0);
 assert.equal((await db.doc(`${f.base}/vendas/O001`).get()).data().data._distribution.stockManaged,false);
 await create(f,'L2');
});
test('end to end: picking mismatch blocks dispatch; confirmed document is mandatory',async()=>{
 const f=await setup();await create(f,'L1');await cmd(f,'RESERVE','L1',1);await cmd(f,'START_PICK','L1',2);
 await assert.rejects(cmd(f,'CHECK','L1',3,{quantities:[4]}),{code:'CHECK_MISMATCH'});
 await cmd(f,'CHECK','L1',3,{quantities:[5]});await cmd(f,'APPROVE','L1',4);
 await assert.rejects(cmd(f,'DISPATCH','L1',5),{code:'CURRENT_MANIFEST_REQUIRED'});
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,100);
});
test('concurrent dispatch posts physical stock once and never writes financial ledger',async()=>{
 const f=await setup();await ready(f,'L1');const key=randomUUID();
 await Promise.all([cmd(f,'DISPATCH','L1',6,{},key),cmd(f,'DISPATCH','L1',6,{},key)]);
 const p=(await db.doc(`${f.base}/produtos/P1`).get()).data().data;assert.equal(p.estoque,95);assert.equal(p.estoqueGalpao,95);assert.equal(p.estoqueReservadoDistribuicao,0);
 assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,0);
 await assert.rejects(cmd(f,'CANCEL','L1',7),{code:'LOAD_LOCKED'});
});
test('fulfilled PDV sale does not reserve or deduct stock again',async()=>{
 const f=await setup();await db.doc(`${f.base}/vendas/O001`).update({'data.tipoDocumento':'venda','data.estado':'concluida','data.itens':[ {id:'P1',sku:'SINT-001',qtd:5,totalBRL:150,movimentoEstoqueVenda:{total:5,vitrine:0,galpao:5}} ]});
 await ready(f,'L1');await cmd(f,'DISPATCH','L1',6);
 const p=(await db.doc(`${f.base}/produtos/P1`).get()).data().data;assert.equal(p.estoque,100);assert.equal(p.estoqueReservadoDistribuicao,0);
});
test('historical manifests remain unchanged after catalog/customer/currency changes and header revision',async()=>{
 const f=await setup();await ready(f,'L1');const first=(await service.query(f.uid,f.s.sessionToken,{type:'manifest',loadId:'L1',version:1})).document;
 await db.doc(`${f.base}/produtos/P1`).update({'data.nome':'ALTERADO','data.valoresMonetarios':{moeda:'USD'}});
 await db.doc(`${f.base}/clientes/C1`).update({'data.nome':'ALTERADO'});
 await cmd(f,'MANIFEST','L1',6,{vehicle:'NOVO',driver:'Outro motorista',route:'Rota B'});
 const historic=(await service.query(f.uid,f.s.sessionToken,{type:'manifest',loadId:'L1',version:1})).document;
 assert.deepEqual(historic,first);assert.equal((await detail(f,'L1')).load.manifestVersions.length,2);
});
test('V2 operation stream has contiguous sequence, envelopes, revisions and no V1 writes',async()=>{
 const f=await setup();await ready(f,'L1');await cmd(f,'DISPATCH','L1',6);
 const receipts=(await db.collection(`${f.base}/operations`).orderBy('sequence').get()).docs.map(d=>d.data());
 assert.deepEqual(receipts.map(r=>r.sequence),[1,2,3,4,5,6,7]);
 const patches=receipts.flatMap(r=>r.patches),last=patches.filter(p=>p.field==='produtos').at(-1);
 assert.equal(last.data.estoque,95);assert.equal(last.routeId,'P1');assert.equal(last.legacyField,'produtos');
 assert.equal((await db.doc(f.base).get()).data().fieldRevisions.produtos,2);
 assert.equal((await db.doc(`${f.root}/dados/operacao`).get()).exists,false);
});
test('cursor pagination has no gaps and history is not loaded into list projection',async()=>{
 const f=await setup({orders:25});const seen=[];let cursor=null;
 do{const page=await service.query(f.uid,f.s.sessionToken,{type:'orders',limit:7,cursor});seen.push(...page.items.map(i=>i.id));cursor=page.next;}while(cursor);
 assert.equal(seen.length,25);assert.equal(new Set(seen).size,25);
 await create(f,'L1');const page=await service.query(f.uid,f.s.sessionToken,{type:'loads',from:0,to:Date.now()+1000,limit:12}).catch(e=>e);
 assert.equal(page.code,'INVALID_PERIOD');
 const current=await service.query(f.uid,f.s.sessionToken,{type:'loads',from:Date.now()-86400000,to:Date.now()+1000,limit:12});assert.equal(current.items[0].lines,undefined);assert.equal(current.items[0].manifestVersions,undefined);
});
test('tenant isolation rejects a session from another enterprise',async()=>{
 const a=await setup(),b=await setup();await create(a,'L1');
 await assert.rejects(service.query(b.uid,a.s.sessionToken,{type:'detail',loadId:'L1'}),{code:'SESSION_EXPIRED'});
});
test('PDV availability and internal movements cannot consume reserved warehouse units',()=>{
 const p={id:'P1',estoque:10,estoqueVitrine:2,estoqueGalpao:8,estoqueReservadoDistribuicao:6};
 assert.equal(preverBaixaEstoqueProduto(p,5).suficiente,false);
 assert.throws(()=>baixarEstoqueProduto(p,5),{code:'ZENOS_ESTOQUE_INSUFICIENTE'});
 assert.throws(()=>transferirEstoqueEntreLocais(p,'deposito','vitrine',3),{code:'ZENOS_ESTOQUE_LOCAL_INSUFICIENTE'});
 assert.equal(baixarEstoqueProduto(p,4).produto.estoque,6);
});
test('HTTP authenticates company UID, ignores forged tenant and denies direct SDK/REST writes',async()=>{
 const f=await setup();const auth=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email,password:PASSWORD,returnSecureToken:true})}).then(r=>r.json());
 const noAuth=await fetch('http://127.0.0.1:8787/query',{method:'POST',body:'{}'}).then(r=>r.json());assert.equal(noAuth.error,'UNAUTHENTICATED');
 const response=await fetch('http://127.0.0.1:8787/query',{method:'POST',headers:{Authorization:`Bearer ${auth.idToken}`,'X-Operator-Session':f.s.sessionToken,'Content-Type':'application/json'},body:JSON.stringify({type:'orders',tenantId:'other',limit:2})}).then(r=>r.json());assert.equal(response.items.length,2);
 const direct=await fetch(`http://127.0.0.1:8080/v1/projects/demo-zenos-local/databases/(default)/documents/${f.root}/distribution_loads/forged`,{method:'PATCH',headers:{Authorization:`Bearer ${auth.idToken}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{state:{stringValue:'DISPATCHED'}}})});assert.equal(direct.status,403);
 const leak=await fetch(`http://127.0.0.1:8080/v1/projects/demo-zenos-local/databases/(default)/documents/${f.root}/distribution_sessions/${hash(f.s.sessionToken)}`,{headers:{Authorization:`Bearer ${auth.idToken}`}});assert.equal(leak.status,403);
});

test('partial cancellation and reallocation preserve exact discounted money',async()=>{
 const f=await setup();await db.doc(`${f.base}/vendas/O001`).update({'data.totalOriginal':101});
 await create(f,'A','O001',2);await create(f,'B','O001',3);await cmd(f,'CANCEL','A',1);await create(f,'C','O001',2);
 const b=(await detail(f,'B')).load,c=(await detail(f,'C')).load;
 assert.equal(BigInt(b.lines[0].amount.minor)+BigInt(c.lines[0].amount.minor),101n);
});
test('daily summary and period filter exclude old orders and reject unbounded requests',async()=>{
 const f=await setup();await db.doc(`${f.base}/vendas/O001`).update({'data.createdAt':'2000-01-01T12:00:00Z'});
 const page=await service.query(f.uid,f.s.sessionToken,{type:'orders',limit:20});assert.ok(!page.items.some(o=>o.id==='O001'));
 await create(f,'L1','O002');const summary=await service.query(f.uid,f.s.sessionToken,{type:'summary',from:Date.now()-86400000,to:Date.now()+86400000});assert.equal(summary.counts.DRAFT,1);
});
test('server logout revokes token immediately',async()=>{
 const f=await setup();await service.logout(f.uid,f.s.sessionToken);
 await assert.rejects(service.query(f.uid,f.s.sessionToken,{type:'orders'}),{code:'SESSION_EXPIRED'});
});

test('commercial credit settlement is atomic, retains seller/cost snapshot and posts debt once',async()=>{
 const f=await setup();await db.doc(`${f.base}/clientes/C1`).update({'data.saldoDevedorBRL':0,'data.limiteCreditoBRL':500});await ready(f,'L1');await cmd(f,'DISPATCH','L1',6);
 const order=(await db.doc(`${f.base}/vendas/O001`).get()).data().data;
 const input={orderId:'O001',operatorId:'admin',pin:PIN,sessionId:'CASH1',customerId:'C1',cart:order.itens.map(i=>({id:String(i.id),sku:i.sku,qtd:Number(i.qtd),precoPraticadoBRL:Number(i.precoPraticadoBRL)})),payments:[{formaId:'crediario',moedaOrigem:'BRL',valorOriginal:150,valorConvertidoBRL:150}]};
 const a=await service.finalize(f.uid,input),b=await service.finalize(f.uid,input);
 assert.equal(b.alreadyCommitted,true);assert.equal(a.sale.id,'O001');assert.equal(a.sale.vendedorId,'sales');
 assert.equal((await db.doc(`${f.base}/clientes/C1`).get()).data().data.saldoDevedorBRL,150);
 assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,1);
 assert.equal((await db.doc(`${f.base}/produtos/P1`).get()).data().data.estoque,95);
});
test('commercial mixed-currency cash change preserves native drawer amounts',async()=>{
 const f=await setup();await ready(f,'L1');await cmd(f,'DISPATCH','L1',6);const order=(await db.doc(`${f.base}/vendas/O001`).get()).data().data;
 const input={orderId:'O001',operatorId:'admin',pin:PIN,sessionId:'CASH1',customerId:'C1',changeCurrency:'PYG',cart:order.itens.map(i=>({id:String(i.id),sku:i.sku,qtd:Number(i.qtd),precoPraticadoBRL:Number(i.precoPraticadoBRL)})),payments:[{formaId:'dinheiro_brl',moedaOrigem:'BRL',valorOriginal:200,valorConvertidoBRL:200}]};
 const result=await service.finalize(f.uid,input);assert.equal(result.sale.trocoBRL,50);assert.equal(result.sale.trocoOriginal,66650);assert.equal(result.sale.moedaTrocoInfo,'PYG');assert.equal(result.receipt.financialEntries[0].valor,150);
});
test('commercial settlement rejects forged FX, wrong cash session and changed source cart without posting',async()=>{
 const f=await setup();await ready(f,'L1');await cmd(f,'DISPATCH','L1',6);const order=(await db.doc(`${f.base}/vendas/O001`).get()).data().data;
 const input={orderId:'O001',operatorId:'admin',pin:PIN,sessionId:'CASH1',customerId:'C1',cart:order.itens.map(i=>({id:String(i.id),sku:i.sku,qtd:Number(i.qtd),precoPraticadoBRL:Number(i.precoPraticadoBRL)})),payments:[{formaId:'cartao_credito_usd',moedaOrigem:'USD',valorOriginal:30,valorConvertidoBRL:150}]};
 await assert.rejects(service.finalize(f.uid,{...input,cart:[{...input.cart[0],qtd:1}]}),{code:'ORDER_SNAPSHOT_CHANGED'});
 await assert.rejects(service.finalize(f.uid,{...input,payments:[{...input.payments[0],valorConvertidoBRL:100}]}),{code:'PAYMENT_RATE_CHANGED'});
 await db.doc(`${f.base}/sessoesCaixa/CASH1`).update({'data.status':'fechada'});await assert.rejects(service.finalize(f.uid,input),{code:'CASH_SESSION_CLOSED'});
 assert.equal((await db.collection(`${f.root}/financeiro_livro`).get()).size,0);
});
