import test from 'node:test';
import assert from 'node:assert/strict';
import {baixarEstoqueProduto,obterEstoqueProduto,reporEstoqueProduto,aplicarVendaAoEstoque,preverBaixaEstoqueProduto} from '../src/core/inventory.js';

const produto={id:'A',sku:'A',nome:'Item',estoque:2,estoqueVitrine:0,estoqueGalpao:2,permitirEstoqueNegativo:true};
test('sem permissão a baixa insuficiente continua bloqueada',()=>{
 assert.throws(()=>baixarEstoqueProduto({...produto,permitirEstoqueNegativo:false},5),{code:'ZENOS_ESTOQUE_INSUFICIENTE'});
});
test('com permissão baixa integral registra déficit no depósito',()=>{
 const result=baixarEstoqueProduto(produto,5);
 assert.equal(result.produto.estoque,-3);
 assert.equal(result.produto.estoqueGalpao,-3);
 assert.equal(result.produto.estoqueVitrine,0);
 assert.equal(result.movimento.total,5);
 assert.equal(obterEstoqueProduto(result.produto).estoque,-3);
 assert.equal(preverBaixaEstoqueProduto(result.produto,2).suficiente,true);
});
test('reposição compensa déficit antes de liberar saldo positivo',()=>{
 const vendido=baixarEstoqueProduto(produto,5).produto;
 const reposto=reporEstoqueProduto(vendido,4).produto;
 assert.equal(reposto.estoque,1);
 assert.equal(reposto.estoqueGalpao,1);
 assert.equal(reposto.estoqueVitrine,0);
});
test('venda normal não modifica outros produtos nem mascara o saldo',()=>{
 const result=aplicarVendaAoEstoque([produto,{id:'B',sku:'B',estoque:9,estoqueVitrine:9,estoqueGalpao:0}],
  [{id:'A',produtoOriginalId:'A',produtoOriginalSku:'A',qtd:'5'}]);
 assert.equal(result.produtos[0].estoque,-3);
 assert.equal(result.produtos[1].estoque,9);
 assert.equal(result.itens[0].movimentoEstoqueVenda.total,5);
});
