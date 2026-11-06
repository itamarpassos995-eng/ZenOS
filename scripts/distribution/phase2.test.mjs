import test from 'node:test';
import assert from 'node:assert/strict';
import {createDistributionClient} from '../../src/core/distribution/client.js';
import {validateConnectEnvelope} from '../../src/core/distribution/connect.js';
import {businessOperationChecks} from '../../src/core/productionSync.js';
import {distributionText} from '../../src/core/distribution/i18n.js';
const user={getIdToken:async()=>'synthetic-token'};
const response=body=>({ok:true,json:async()=>body});
test('cache is scoped to client/session, invalidated on commands and bounded to 30 seconds',async()=>{
 let calls=0,now=0;const client=createDistributionClient(user,{now:()=>now,fetcher:async(path)=>{calls++;return response(path.endsWith('/session')?{sessionToken:'demo'}:{items:[{id:'1'}]});}});
 await client.login('admin','pin');await client.query({type:'loads'});await client.query({type:'loads'});assert.equal(calls,2);
 now=30001;await client.query({type:'loads'});assert.equal(calls,3);
 await client.command('CHECK','L1',3,{quantities:[1]});await client.query({type:'loads'});assert.equal(calls,5);
 client.clear();await client.query({type:'loads'});assert.equal(calls,6);
});
test('lost response preserves identical command key and never presents a false confirmation',async()=>{
 const keys=[];let attempts=0;const client=createDistributionClient(user,{fetcher:async(path,input)=>{
  if(path.endsWith('/session'))return response({sessionToken:'demo'});
  keys.push(JSON.parse(input.body).key);if(attempts++===0)throw new Error('Network lost after commit');return response({revision:2});
 }});await client.login('admin','pin');
 await assert.rejects(client.command('RESERVE','L1',1));assert.equal((await client.command('RESERVE','L1',1)).revision,2);assert.equal(keys[0],keys[1]);
});
test('a new account/client does not reuse cached enterprise data or session headers',async()=>{
 const headers=[];const fetcher=async(path,input)=>{headers.push(input.headers);return response({items:[]});};
 const a=createDistributionClient(user,{fetcher}),b=createDistributionClient(user,{fetcher});await a.query({type:'loads'});await b.query({type:'loads'});assert.equal(headers.length,2);assert.equal(headers[1]['X-Operator-Session'],undefined);
});
test('PDV guard rejects finalization of a logistics-owned pre-order even with stale cart',()=>{
 assert.throws(()=>businessOperationChecks.assertBusinessGuards({historicoVendas:[{id:'O1',_distribution:{stockManaged:true}}]},[{type:'entity_field_equals',field:'historicoVendas',entityId:'O1',property:'estado',expected:'pendente'}]),{code:'ZENOS_DISTRIBUTION_ORDER_LOCKED'});
});
test('product invariants reject any sale or transfer that consumes a reserved warehouse balance',()=>{
 const base={id:'p',estoque:10,estoqueVitrine:0,estoqueGalpao:10,estoqueReservadoDistribuicao:7};
 assert.throws(()=>businessOperationChecks.assertMergedFieldInvariants({field:'produtos',baseValue:[base],localValue:[{...base,estoque:6,estoqueGalpao:6}],mergedValue:[{...base,estoque:6,estoqueGalpao:6}]}),{code:'ZENOS_RESERVED_STOCK'});
});
test('Connect contract requires explicit separate organizations and correlation; has no transport',()=>{
 const event={id:'e1',type:'connect.shipment.dispatched.v1',version:1,senderOrganizationId:'seller',recipientOrganizationId:'buyer',entityId:'L1',externalId:'external1',occurredAt:'2026-11-06T12:00:00Z',idempotencyKey:'key1',correlationId:'c1',payload:{loadId:'L1'}};
 assert.deepEqual(validateConnectEnvelope(event),event);
 assert.throws(()=>validateConnectEnvelope({...event,recipientOrganizationId:'seller'}));
 assert.throws(()=>validateConnectEnvelope({...event,correlationId:undefined}));
});
test('every UI translation path selects Portuguese and Spanish explicitly',()=>{
 assert.equal(distributionText('pt')('dispatch'),'Expedir carga');assert.equal(distributionText('es')('dispatch'),'Despachar carga');assert.equal(distributionText('es')('APPROVED'),'Aprobada');assert.ok(distributionText('es')('INSUFFICIENT_STOCK').includes('depósito'));
});

test('company timezone governs day and month even when device is on a different date',async()=>{
 const {distributionPeriod}=await import('../../src/core/distribution/period.js');
 const now=Date.parse('2026-11-01T01:00:00Z');
 assert.deepEqual(distributionPeriod('hoje',now,'America/Asuncion'),{inicio:'2026-10-31T03:00:00.000Z',fim:'2026-11-01T03:00:00.000Z'});
 const previous=distributionPeriod('anterior',Date.parse('2026-01-10T12:00:00Z'),'America/Asuncion');
 assert.equal(previous.inicio,'2025-12-01T03:00:00.000Z');assert.equal(previous.fim,'2026-01-01T03:00:00.000Z');
 assert.throws(()=>distributionPeriod('personalizado',now,'America/Asuncion','2026-02-30','2026-03-01'));
});
