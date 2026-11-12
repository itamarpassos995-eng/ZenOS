import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,seed,PIN} from './fixture.mjs';
import {distributionService} from '../../src/distribution/service.js';
const service=distributionService(db);
async function createFixture(stock,orders){
 const f=await seed('draft-adjust-'+randomUUID().slice(0,8),{stock,orders});
 const session=await service.login(f.uid,{operatorId:'admin',pin:PIN});
 return {...f,session:session.sessionToken};
}
const cmd=(f,type,loadId,revision,payload={},key=randomUUID())=>service.command(f.uid,f.session,{type,loadId,expectedRevision:revision,payload,key});
const detail=(f,loadId)=>service.query(f.uid,f.session,{type:'detail',loadId});
test('short draft can be reduced and reserved without duplicate inventory or PYG postings',async()=>{
 const f=await createFixture(3,1);
 await cmd(f,'CREATE','SHORT',0,{selections:[{orderId:'O001',lineIndex:0,quantity:5}]});
 assert.equal((await detail(f,'SHORT')).availability.P1,3);
 await assert.rejects(cmd(f,'RESERVE','SHORT',1),{code:'INSUFFICIENT_STOCK'});
 for(const quantities of [[0],[6],[-1],[1.5]])
  await assert.rejects(cmd(f,'ADJUST_DRAFT','SHORT',1,{quantities}),{code:'INVALID_QUANTITY'});
 const key=randomUUID();
 await cmd(f,'ADJUST_DRAFT','SHORT',1,{quantities:[3]},key);
 assert.equal((await cmd(f,'ADJUST_DRAFT','SHORT',1,{quantities:[3]},key)).replayed,true);
 const adjusted=(await detail(f,'SHORT')).load;
 assert.equal(adjusted.lines[0].quantity,3);
 assert.equal(adjusted.lines[0].amount.minor,'119970');
 let sale=(await db.doc(f.base+'/vendas/O001').get()).data().data;
 assert.equal(sale._distribution.allocated[0],3);
 assert.equal(sale._distribution.allocatedMinor[0],'119970');
 let product=(await db.doc(f.base+'/produtos/P1').get()).data().data;
 assert.equal(product.estoque,3);
 assert.equal(product.estoqueReservadoDistribuicao,0);
 assert.equal((await db.collection(f.root+'/financeiro_livro').get()).size,0);
 await assert.rejects(cmd(f,'ADJUST_DRAFT','SHORT',1,{quantities:[2]}),{code:'REVISION_CONFLICT'});
 await cmd(f,'RESERVE','SHORT',2);
 await assert.rejects(cmd(f,'ADJUST_DRAFT','SHORT',3,{quantities:[2]}),{code:'INVALID_TRANSITION'});
 product=(await db.doc(f.base+'/produtos/P1').get()).data().data;
 assert.equal(product.estoqueReservadoDistribuicao,3);
 await cmd(f,'CANCEL','SHORT',3);
 sale=(await db.doc(f.base+'/vendas/O001').get()).data().data;
 assert.equal(sale._distribution.allocated[0],0);
 assert.equal(sale._distribution.allocatedMinor[0],'0');
});
test('three-client draft can shrink shared SKU to 10 physical units and reserve once',async()=>{
 const f=await createFixture(10,3);
 await cmd(f,'CREATE','THREE',0,{selections:['O001','O002','O003'].map(orderId=>({orderId,lineIndex:0,quantity:5}))});
 await assert.rejects(cmd(f,'RESERVE','THREE',1),{code:'INSUFFICIENT_STOCK'});
 await cmd(f,'ADJUST_DRAFT','THREE',1,{quantities:[5,3,2]});
 assert.deepEqual((await detail(f,'THREE')).load.lines.map(l=>l.quantity),[5,3,2]);
 await cmd(f,'RESERVE','THREE',2);
 const product=(await db.doc(f.base+'/produtos/P1').get()).data().data;
 assert.equal(product.estoque,10);
 assert.equal(product.estoqueReservadoDistribuicao,10);
});
