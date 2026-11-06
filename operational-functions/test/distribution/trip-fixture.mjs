import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
import {randomUUID} from 'node:crypto';
export {db,PIN};export const service=distributionService(db);
export const signature=[[[0.1,0.3],[0.2,0.7],[0.7,0.2]]];
export async function setupTrip({orders=3,stock=100,uid='distribution-'+randomUUID().slice(0,8)}={}){
 const f=await seed(uid,{orders,stock});
 const op=(await db.doc(`${f.base}/operadores/stock`).get()).data();
 await db.doc(`${f.base}/operadores/driver`).set({...op,data:{...op.data,id:'driver',nome:'Carlos · motorista sintético',patente:'motorista',permissoes:{distributionDriver:true}}});
 await db.doc(`${f.base}/operadores/other-driver`).set({...op,data:{...op.data,id:'other-driver',nome:'Ana · motorista sintética',patente:'motorista',permissoes:{distributionDriver:true}}});
 await db.doc(`${f.root}/distribution_config/module`).update({driverPaymentMethods:[{id:'dinheiro_pyg',currency:'PYG'},{id:'dinheiro_brl',currency:'BRL'},{id:'dinheiro_usd',currency:'USD'},{id:'dinheiro_eur',currency:'EUR'},{id:'transferencia',currency:'PYG'}],driverPhotos:false});
 for(let n=1;n<=orders;n++){const r=db.doc(`${f.base}/vendas/O${String(n).padStart(3,'0')}`),s=await r.get();await r.update({'data.itens':s.data().data.itens.map(i=>({...i,custoNaVendaBRL:12,lote:'LOT-SYNTHETIC'}))});}
 await db.doc(f.base).update({'fieldCounts.vendedores':5,'fieldManifest.vendedores.count':5});
 f.manager=await service.login(f.uid,{operatorId:'admin',pin:PIN});f.driver=await service.login(f.uid,{operatorId:'driver',pin:PIN,scope:'driver'});f.other=await service.login(f.uid,{operatorId:'other-driver',pin:PIN,scope:'driver'});return f;
}
export const route=(f,actor,type,tripId,expectedRevision,payload={},key=randomUUID())=>service.routeCommand(f.uid,f[actor].sessionToken,{type,tripId,expectedRevision,payload,key});
export const trip=(f,id='T1',actor='manager')=>service.routeQuery(f.uid,f[actor].sessionToken,{type:'detail',view:actor==='manager'?'manage':'driver',tripId:id});
export async function dispatched(f,lid,orderId='O001',quantity=5){
 const c=(type,revision,payload={})=>service.command(f.uid,f.manager.sessionToken,{type,key:randomUUID(),loadId:lid,expectedRevision:revision,payload});
 await c('CREATE',0,{selections:[{orderId,lineIndex:0,quantity}]});for(const [type,revision,payload]of [['RESERVE',1,{}],['START_PICK',2,{}],['CHECK',3,{quantities:[quantity]}],['APPROVE',4,{}],['MANIFEST',5,{vehicle:'HML-2026',driver:'Carlos (sintético)',route:'Centro'}],['DISPATCH',6,{}]])await c(type,revision,payload);
}
export async function planned(f,ids=['O001','O002'],tripId='T1'){
 await route(f,'manager','SAVE_VEHICLE','V1',0,{plate:'HML-2026',name:'Furgão de homologação'});await route(f,'manager','SAVE_ROUTE','R1',0,{name:'Centro / Vila Operária',notes:'Roteiro sintético'});
 const loadIds=[];for(const o of ids){const lid=`L-${o}`;await dispatched(f,lid,o);loadIds.push(lid);}
 await route(f,'manager','CREATE_TRIP',tripId,0,{loadIds,driverId:'driver',vehicleId:'V1',routeId:'R1'});return (await trip(f,tripId)).trip;
}
