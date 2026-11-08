import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoad,replaceLoadLines,transitionLoad,issueManifest,historicalManifest,money,totalsByCurrency,validateQuantities,transition} from '../../src/core/distribution/domain.js';
import {executeLoadCommand} from '../../src/core/distribution/commands.js';
import {manifestForCustomer,summarizeManifest} from '../../src/core/distribution/domain.js';
import {manifestPdf} from '../../src/core/distribution/pdf.js';
const amount = (currency='PYG',minor='39990')=>({currency,minor,precision:currency==='PYG'?0:2,kind:'sale',source:'order-test'});
const line = overrides=>({id:'l1',tenantId:'demo',orderId:'order1',orderLineId:'ol1',productId:'p1',sku:'SKU1',description:'Produto sintético',unit:'UN',customerId:'c1',customerName:'Cliente sintético',destination:'Destino teste',sellerId:'seller1',quantity:2,amount:amount(),...overrides});
const draft=()=>createLoad({id:'load1',tenantId:'demo',warehouseId:'w1',policyVersion:'policy1'});
const filled=()=>replaceLoadLines(draft(),[line()]);
const approved=()=>['PLANNED','LOADING','LOADED','APPROVED'].reduce(transitionLoad,filled());
const header = {documentId:'m1',number:'TEST-001',issuedAt:'2026-11-06T12:00:00Z',issuer:{name:'Empresa sintética',taxId:'TEST'},vehicle:'TEST',driver:'Motorista teste',route:'Teste',verificationCode:'authenticated-only'};
const rejectsCode=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('issued manifest reconciles three clients, separates product dimensions and exports A4',async()=>{
 const quantities=[[10,20],[20,10],[15,5]];
 const lines=quantities.flatMap(([paper,milk],i)=>[
  line({id:`paper-${i}`,customerId:`c${i}`,city:`city-${i}`,quantity:paper,packaging:'pack'}),
  line({id:`milk-${i}`,customerId:`c${i}`,city:`city-${i}`,quantity:milk,productId:'milk',sku:'MILK',unit:'CX'})
 ]);
 const load=['PLANNED','LOADING','LOADED','APPROVED'].reduce(transitionLoad,replaceLoadLines(draft(),lines));
 const document=historicalManifest(issueManifest(load,header),1);
 const summary=summarizeManifest(document);
 assert.deepEqual(summary.products.map(row=>row.quantity),[45,35]);
 const customer=manifestForCustomer(document,summary.customers[0].key);
 assert.deepEqual(customer.lines.map(row=>row.quantity),[10,20]);
 assert.deepEqual(customer.totalsByCurrency,{PYG:'79980'});
 assert.equal(customer.version,document.version);
 assert.deepEqual(summary.customers.map(group=>group.lines.map(row=>row.quantity)),quantities);
 const row=lines[0];
 const distinct=[row,...['sku','unit','packaging','variant','lot','warehouseId','productId'].map(
  (field,i)=>({...row,id:`variant-${i}`,[field]:'other'})
 )];
 assert.equal(summarizeManifest({...document,lines:distinct}).products.length,8);
 rejectsCode(()=>summarizeManifest({...document,lines:[row,row]}),'DUPLICATE_LINE');
 for(const language of ['pt','es']){
  const pdf=await manifestPdf(document,{language});
  assert.equal(Buffer.from(pdf.bytes.slice(0,8)).toString(),'%PDF-1.4');
 }
});
test('money preserves PYG and independent BRL cost; exact integers above Number range',()=>{
 assert.deepEqual(totalsByCurrency([amount(),amount('BRL','1234'),amount('PYG','9007199254740993')]),{PYG:'9007199254780983',BRL:'1234'});
 for(const bad of [amount('PYG','1.1'),amount('XYZ'),{...amount(),precision:2},{...amount(),minor:10}]) rejectsCode(()=>money(bad),'INVALID_'+(bad.currency==='XYZ'||bad.precision===2?'CURRENCY_PRECISION':'MINOR_AMOUNT'));
});
test('consolidates orders from multiple sellers without changing source objects',()=>{
 const input=[line(),line({id:'l2',orderId:'order2',sellerId:'seller2'})];const before=structuredClone(input);
 const load=replaceLoadLines(draft(),input);assert.equal(load.lines.length,2);assert.deepEqual(input,before);
 input[0].description='changed';assert.equal(load.lines[0].description,'Produto sintético');
});
test('rejects cross-tenant, duplicate and fractional lines',()=>{
 rejectsCode(()=>replaceLoadLines(draft(),[line({tenantId:'other'})]),'TENANT_MISMATCH');
 rejectsCode(()=>replaceLoadLines(draft(),[line(),line()]),'DUPLICATE_LINE');
 rejectsCode(()=>replaceLoadLines(draft(),[line({quantity:1.5})]),'INVALID_QUANTITY');
});
test('load transitions require lines, approval and current manifest; dispatch locks edits',()=>{
 rejectsCode(()=>transitionLoad(draft(),'PLANNED'),'EMPTY_LOAD');
 rejectsCode(()=>transitionLoad(filled(),'DISPATCHED'),'INVALID_TRANSITION');
 rejectsCode(()=>transitionLoad(approved(),'DISPATCHED'),'CURRENT_MANIFEST_REQUIRED');
 const dispatched=transitionLoad(issueManifest(approved(),header),'DISPATCHED');
 rejectsCode(()=>replaceLoadLines(dispatched,[line()]),'LOAD_LOCKED');
 rejectsCode(()=>issueManifest(dispatched,{...header,documentId:'m2'}),'LOAD_NOT_APPROVED');
});
test('T06/T34 domain: historical manifests preserve snapshots and version independently',()=>{
 const first=issueManifest(approved(),header);const second=issueManifest(first,{...header,documentId:'m2'});
 assert.equal(second.revision,first.revision+1);assert.equal(historicalManifest(second,1).version,1);
 assert.deepEqual(historicalManifest(second,1),historicalManifest(first,1));
 assert.equal(historicalManifest(second,2).version,2);
 assert.throws(()=>{historicalManifest(second,1).lines[0].description='changed';},TypeError);
 assert.equal(historicalManifest(second,1).totalsByCurrency.PYG,'39990');
});
test('reconciles partial deliveries without stock or payment effects',()=>{
 validateQuantities({authorized:10,dispatched:8,delivered:4,refused:1,returned:1,pending:2});
 rejectsCode(()=>validateQuantities({authorized:7,dispatched:8,delivered:4,refused:1,returned:1,pending:2}),'QUANTITY_NOT_RECONCILED');
 rejectsCode(()=>validateQuantities({authorized:10,dispatched:8,delivered:9,refused:0,returned:0,pending:0}),'QUANTITY_NOT_RECONCILED');
});
test('independent state machines reject accounting shortcuts',()=>{
 assert.equal(transition('delivery','ARRIVED','DELIVERED'),'DELIVERED');
 rejectsCode(()=>transition('settlement','OPEN','POSTED'),'INVALID_TRANSITION');
 rejectsCode(()=>transition('order','IN_FULFILLMENT','CANCELLED'),'INVALID_TRANSITION');
});
// Serialized in-memory adapter exercises the atomic-host contract, not Firestore concurrency.
function host() {
 let load=filled(), receipts=new Map(), events=[], tail=Promise.resolve();
 return {get load(){return load;},events, transaction:async(scope,apply)=>{
  const run=tail.then(async()=>{const output=await apply({load:structuredClone(load),receipt:receipts.get(scope.key)});
   if(!output.replay){load=structuredClone(output.load);receipts.set(scope.key,structuredClone(output.receipt));events.push(output.event);}return output.result;});
  tail=run.catch(()=>{});return run;
 }};
}
const authorize=async()=>({tenantId:'demo',operatorId:'op1',moduleEnabled:true,permissions:['distribution.load.transition','distribution.load.edit','distribution.manifest.issue']});
const command=(overrides={})=>({tenantId:'demo',loadId:'load1',key:'key1',expectedRevision:1,type:'TRANSITION_LOAD',payload:{next:'PLANNED'},...overrides});
test('duplicate concurrent command produces one revision and one outbox event; lost response can retry',async()=>{
 const h=host();const run=()=>executeLoadCommand({command:command(),authorize,transaction:h.transaction});
 const results=await Promise.all([run(),run(),run()]);assert.deepEqual(results[0],results[2]);assert.equal(h.load.revision,2);assert.equal(h.events.length,1);
 assert.deepEqual(await run(),results[0]);
});
test('different commands racing on same revision conflict',async()=>{
 const h=host();const results=await Promise.allSettled(['a','b'].map(key=>executeLoadCommand({command:command({key}),authorize,transaction:h.transaction})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'REVISION_CONFLICT');
});
test('idempotency key cannot be reused for a changed request',async()=>{
 const h=host();await executeLoadCommand({command:command(),authorize,transaction:h.transaction});
 await assert.rejects(executeLoadCommand({command:command({payload:{next:'CANCELLED'}}),authorize,transaction:h.transaction}),{code:'IDEMPOTENCY_CONFLICT'});
});
test('authorization is rechecked even on replay, with zero transaction when revoked',async()=>{
 const h=host();await executeLoadCommand({command:command(),authorize,transaction:h.transaction});
 for(const principal of [null,{tenantId:'other'},{...await authorize(),moduleEnabled:false},{...await authorize(),permissions:[]}]) {
  await assert.rejects(executeLoadCommand({command:command(),authorize:async()=>principal,transaction:()=>assert.fail('must not access storage')}),{code:'FORBIDDEN'});
 }
});
test('server command cannot dispatch without certified stock integration',async()=>{
 const h=host();await assert.rejects(executeLoadCommand({command:command({payload:{next:'DISPATCHED'}}),authorize,transaction:h.transaction}),{code:'STOCK_ADAPTER_REQUIRED'});
 assert.equal(h.load.revision,1);assert.equal(h.events.length,0);
});
test('manifest command increments revision and returns same document on retry',async()=>{
 const load=approved();let receipt=null;let current=load;let writes=0;
 const transaction=async(_,apply)=>{const out=await apply({load:current,receipt});if(!out.replay){current=out.load;receipt=out.receipt;writes++;}return out.result;};
 const cmd=command({type:'ISSUE_MANIFEST',expectedRevision:load.revision,payload:header});
 const run=()=>executeLoadCommand({command:cmd,authorize,transaction});await run();await run();
 assert.equal(writes,1);assert.equal(current.manifestVersions.length,1);assert.equal(current.manifestVersions[0].loadRevision,current.revision);
});
