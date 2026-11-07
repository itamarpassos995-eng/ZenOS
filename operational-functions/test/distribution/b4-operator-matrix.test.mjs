// B.4 G6 operator grants: authentic backend policy and live command tests.
// Emulator synthetic tenants only; never writes to the production app.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {distributionPermission} from '../../src/distribution/security.js';
import {setupTrip,planned,route,trip,db,service,PIN} from './trip-fixture.mjs';
const operator=(id,permissoes={})=>({id,patente:'vendedor',permissoes});
test('G6 explicit grants use existing operator vocabulary, finance needs PDV',()=>{
 const matrix=[
  {id:'admin',permissions:{},allowed:['admin','stock','trip','tripView','driver','manage','returns','finance','fiscalReview','pdv']},
  {id:'driver',permissions:{distributionDriver:true},allowed:['driver','trip','tripView']},
  {id:'manager',permissions:{distributionManage:true},allowed:['manage','trip','tripView','fiscalReview']},
  {id:'returns',permissions:{distributionReturns:true},allowed:['returns','trip','tripView']},
  {id:'financial-only',permissions:{distributionFinance:true},allowed:['trip','tripView']},
  {id:'finance',permissions:{distributionFinance:true,pdv:true},allowed:['finance','trip','tripView','pdv']},
  {id:'sales',permissions:{pdv:true},allowed:['pdv']},
  {id:'stock',permissions:{produtos:true},allowed:['stock']},
  {id:'fiscal',permissions:{distributionFiscalReview:true},allowed:['fiscalReview','trip','tripView']}
 ];
 const scopes=['admin','stock','trip','tripView','driver','manage','returns','finance','fiscalReview','pdv'];
 for(const row of matrix){
  const op=operator(row.id,row.permissions);
  for(const scope of scopes)assert.equal(distributionPermission(op,scope),row.allowed.includes(scope),
   row.id+' / '+scope);
 }
});
test('G6 server rejects unauthorized manager, sales, stock and driver mutation',async()=>{
 const f=await setupTrip({orders:2});
 await planned(f,['O001']);
 const stock=await service.login(f.uid,{operatorId:'stock',pin:PIN,scope:'stock'});
 const sales=await service.login(f.uid,{operatorId:'sales',pin:PIN,scope:'pdv'});
 const unauthorized=[stock.sessionToken,sales.sessionToken,f.driver.sessionToken];
 for(const [i,t] of unauthorized.entries()){
  await assert.rejects(service.routeCommand(f.uid,t,{
   type:'SAVE_ROUTE',tripId:'G6-ROUTE-'+i,expectedRevision:0,
   payload:{name:'Should not save'},key:randomUUID()
  }),{code:'FORBIDDEN'});
  assert.equal((await db.doc(`${f.root}/distribution_routes/G6-ROUTE-${i}`).get()).exists,false);
 }
 await assert.rejects(route(f,'other','START','T1',1),{code:'FORBIDDEN'});
 await assert.rejects(service.routeCommand(f.uid,sales.sessionToken,{
  type:'BEGIN_CLOSE',tripId:'T1',expectedRevision:1,payload:{},
  key:randomUUID()}),{code:'FORBIDDEN'});
 const existing=await trip(f);
 assert.equal(existing.trip.revision,1);
});
test('G6 live permission and PIN credential changes invalidate existing sessions',async()=>{
 const f=await setupTrip({orders:1});
 await planned(f,['O001']);
 const before=(await db.doc(`${f.base}/operadores/driver`).get()).data();
 await db.doc(`${f.base}/operadores/driver`).update({'data.permissoes':{}});
 await assert.rejects(route(f,'driver','START','T1',1),{code:'FORBIDDEN'});
 await db.doc(`${f.base}/operadores/driver`).set(before);
 await db.doc(`${f.base}/operadores/driver`).update({'data.pinTrocaObrigatoria':true});
 await assert.rejects(route(f,'driver','START','T1',1),{code:'FORBIDDEN'});
 assert.equal((await trip(f)).trip.revision,1);
});
test('G6 session of one synthetic tenant cannot operate another synthetic tenant',async()=>{
 const a=await setupTrip({orders:1}),b=await setupTrip({orders:1});
 await planned(a,['O001']);
 await assert.rejects(service.routeCommand(b.uid,a.manager.sessionToken,{
  type:'SAVE_ROUTE',tripId:'X-FOREIGN',expectedRevision:0,
  key:randomUUID(),payload:{name:'Forbidden'}
 }),{code:'SESSION_EXPIRED'});
 assert.equal((await db.doc(`${b.root}/distribution_routes/X-FOREIGN`).get()).exists,false);
});
