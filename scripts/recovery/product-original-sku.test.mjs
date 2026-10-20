import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {conciliarSkuHistorico as localizar} from '../../src/core/productHistoricalSkuLookup.js';
const atual=[{id:'P-1',nome:'Pneu Um',sku:'66346',estoque:7,ativo:false}];
test('registro atual existe: restabelece visibilidade sem alterar ID, saldo ou cadastro',()=>{
 const r=localizar({sku:'66346',indexData:{produtoId:'P-1',ativo:true},catalogoAtual:atual});
 assert.equal(r.status,'found');assert.equal(r.produto,atual[0]);assert.equal(atual[0].estoque,7);
});
test('se apenas no V1, mostra ID original sem inventar saldo atual',()=>{
 const antigo=[{id:'P-7',nome:'Pneu Veloce',sku:'66346',estoque:18}];
 const r=localizar({sku:'66346',indexData:{produtoId:'P-7',ativo:true},catalogoAtual:[],catalogoLegado:antigo});
 assert.equal(r.status,'historical_only');assert.equal(r.ownerId,'P-7');
 assert.equal('produto' in r,false);
});
test('índice órfão retorna referência e nunca substitui produto',()=>{
 const r=localizar({sku:'66346',indexData:{produtoId:'P-7',ativo:true},catalogoAtual:[]});
 assert.equal(r.status,'orphan_index');assert.equal(r.ownerId,'P-7');
});
test('conflito de ID não escolhe pneu de forma arbitrária',()=>{
 const r=localizar({sku:'66346',indexData:{produtoId:'P-1',ativo:true},catalogoAtual:[atual[0],{...atual[0],nome:'Outra versão'}]});
 assert.equal(r.status,'conflict');
});
test('sem índice pesquisa SKU exato e nunca nome aproximado',()=>{
 const r=localizar({sku:'66346',indexData:null,catalogoAtual:atual});
 assert.equal(r.status,'found');
 assert.equal(localizar({sku:'34849',indexData:null,catalogoAtual:atual}).status,'not_found');
});
test('UI só faz consulta após clique explícito da gerência',()=>{
 const ui=readFileSync(new URL('../../src/components/Produtos.jsx',import.meta.url),'utf8');
 assert.match(ui,/onClick=\{buscarCadastroPeloSkuAntigo\}/);
 assert.match(ui,/patenteUsuario==='gerencia'/);
 assert.match(ui,/localizarSkuHistoricoServidor\(\{db,userId,sku\}\)/);
 assert.match(ui,/setMostrarInativos\(true\)/);
});
