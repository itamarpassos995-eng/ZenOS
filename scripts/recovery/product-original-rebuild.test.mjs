import test from 'node:test';
import assert from 'node:assert/strict';
import {avaliarRecomposicaoOriginal as avaliar,idOriginalRecomponivel} from '../../src/core/productOriginalRebuildPolicy.js';
const id='PROD-LEGACY-1X9720V',nome='Pneu 130/70-17 - KONTROL',sku='SKU-63346';
const indices=[
 {produtoId:id,nome,sku,ativo:true},
 {produtoId:id,nome,sku:'',ativo:true}
];
const base={ownerId:id,indices,catalogo:[],legado:[],vendas:[],compras:[],movimentoEncontrado:false,modoV2:false};
test('reserva intacta do cadastro normal pode recompor o mesmo ID e o SKU correto',()=>{
 assert.deepEqual(avaliar(base),{ok:true,ownerId:id,nome,sku});
});
test('sem registros completos confirmados, NÃO copiar ou inventar saldos',()=>{
 assert.equal('estoque' in avaliar(base),false);
 assert.equal('precoBRL' in avaliar(base),false);
});
test('nunca recompor se o nome já existe com outro SKU, se SKU/id já existe ou V1 guarda original',()=>{
 for(const replace of [
  {catalogo:[{id,nome,sku}]},
  {catalogo:[{id:'novo',nome,sku:'SKU-34849'}]},
  {catalogo:[{id:'novo',nome:'Outro',sku}]},
  {legado:[{id,nome,sku}]},
  {legado:null},
 ])assert.equal(avaliar({...base,...replace}).ok,false,JSON.stringify(replace));
});
test('venda, compra ou movimento de estoque com o ID original bloqueiam recuperação cega',()=>{
 for(const replace of [
  {vendas:[{itens:[{produtoOriginalId:id}]}]},
  {vendas:[{itens:[{sku}]}]},
  {compras:[{itens:[{produtoId:id}]}]},
  {movimentoEncontrado:true}
 ])assert.equal(avaliar({...base,...replace}).ok,false,JSON.stringify(replace));
});
test('tombstone V2, índice inativo, donos distintos e identidade sem SKU bloqueiam',()=>{
 for(const replace of [
  {modoV2:true,registroV2:{deleted:true,data:{id}}},
  {modoV2:true,registroV2:{deleted:false,data:{id}}},
  {indices:[indices[0],{...indices[1],produtoId:'outro'}]},
  {indices:[indices[0],{...indices[1],ativo:false}]},
  {indices:[{...indices[0],sku:''},{...indices[1]}]},
  {legacyConfiavel:false},
  {ownerId:'PROD-BALCAO-12345'}
 ])assert.equal(avaliar({...base,...replace}).ok,false,JSON.stringify(replace));
});

test('IDs normais do Novo Produto (UUID v4 e fallback) recuperam apenas reserva íntegra',()=>{
 const normais=[
  'PROD-550e8400-e29b-41d4-a716-446655440000',
  'PROD-1792846800000-123456789'
 ];
 for(const ownerId of normais){
  assert.equal(idOriginalRecomponivel(ownerId),true);
  const r=avaliar({...base,ownerId,indices:indices.map(i=>({...i,produtoId:ownerId}))});
  assert.deepEqual(r,{ok:true,ownerId,nome,sku});
  for(const bloqueio of [
   {vendas:[{itens:[{produtoOriginalId:ownerId}]}]},
   {movimentoEncontrado:true},
   {legado:[{id:ownerId,nome,sku}]},
   {indices:indices.map(i=>({...i,produtoId:'outro'}))}
  ])assert.equal(avaliar({...base,ownerId,indices:indices.map(i=>({...i,produtoId:ownerId})),...bloqueio}).ok,false);
 }
});
test('não aceitar IDs arbitrários, rápidos do balcão ou UUID com formato inválido',()=>{
 for(const ownerId of ['PROD-BALCAO-1792846800000','PROD-qualquer','PROD-550e8400-e29b-11d4-a716-446655440000','CLI-LEGACY-X','PROD-1792846800000']){
  assert.equal(idOriginalRecomponivel(ownerId),false,ownerId);
  assert.equal(avaliar({...base,ownerId,indices:indices.map(x=>({...x,produtoId:ownerId}))}).ok,false);
 }
});
