import test from 'node:test';import assert from 'node:assert/strict';
import {compararIndicesCatalogo,MAX_PRODUCT_INDEX_AUDIT_READS} from '../../src/core/productIndexAudit.js';
test('detecta três donos ausentes sem sugerir recriar ou modificar saldos',()=>{
 const catalogo=[{id:'ok',nome:'Produto',ativo:true},{id:'hidden',nome:'Pneu',ativo:false}];
 const indices=[
  {produtoId:'missing1',nome:'Pneu A',sku:'66346',ativo:true},
  {produtoId:'missing1',nome:'Pneu A',ativo:true},
  {produtoId:'missing2',nome:'Pneu B',ativo:true},
  {produtoId:'missing3',nome:'Pneu C',ativo:true},
  {produtoId:'ok',nome:'Produto',ativo:true},
  {produtoId:'hidden',nome:'Pneu',ativo:true},
  {produtoId:'old',nome:'Antigo',ativo:false}
 ];
 const r=compararIndicesCatalogo(indices,catalogo);
 assert.deepEqual(r.ausentes.map(x=>x.produtoId),['missing1','missing2','missing3']);
 assert.equal(r.ausentes[0].indices,2);
 assert.equal(r.ausentes[0].skus[0],'66346');
 assert.equal(r.inativos.length,1);
 assert.equal(r.ativos,1);
 assert.equal(catalogo.length,2);
 assert.equal(MAX_PRODUCT_INDEX_AUDIT_READS,2501);
});
test('rejeita dados incompletos em vez de reportar falso zero',()=>assert.throws(()=>compararIndicesCatalogo(null,[])));
