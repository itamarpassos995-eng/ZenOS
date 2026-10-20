import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {avaliarLiberacaoOrfaoPDV as avaliar} from '../../src/core/productOrphanReleaseCore.js';
const old='PROD-BALCAO-1792300000000',now=Date.parse('2026-10-20T15:00:00Z');
const dado={ownerId:old,sku:'66346',
 indices:[
 {produtoId:old,sku:'66346',nome:'Pneu Novo',ativo:true,updatedAt:'2026-10-19T15:00:00Z'},
 {produtoId:old,sku:'',nome:'Pneu Novo',ativo:true,updatedAt:'2026-10-19T15:00:00Z'},
 ],atual:[],legado:[],vendas:[],compras:[],temAuditoria:false,agora:now};
test('PDV sem cadastro, sem vínculos e índice antigo pode ser liberado',()=>{
 assert.equal(avaliar(dado).ok,true);
});
test('bloqueia cadastros existentes na V1, V2 ou mesmo nome com novo SKU',()=>{
 for(const patch of [
 {atual:[{id:old,sku:'66346',nome:'Pneu Novo'}]},
 {legado:[{id:old,sku:'66346',nome:'Pneu Novo'}]},
 {atual:[{id:'outra-ref',sku:'34849',nome:'Pneu Novo'}]},
 {legado:null},
 ])assert.equal(avaliar({...dado,...patch}).ok,false);
});
test('venda, compra ou histórico de estoque impedem recadastro que romperia vínculo',()=>{
 for(const patch of [
 {vendas:[{id:'v1',itens:[{produtoOriginalId:old,qtd:2}]}]},
 {compras:[{id:'c1',itens:[{produtoId:old,qtd:3}]}]},
 {temAuditoria:true},
 ])assert.equal(avaliar({...dado,...patch}).ok,false);
});
test('não libera índice de outra pessoa, recente, sem data, nem ID fora do PDV',()=>{
 for(const patch of [
 {ownerId:'regular-1'},
 {indices:[{produtoId:'outra-ref',sku:'66346',nome:'Pneu Novo',ativo:true,updatedAt:'2026-10-19T15:00:00Z'}]},
 {indices:[{produtoId:old,sku:'66346',nome:'Pneu Novo',ativo:true,updatedAt:'2026-10-20T14:59:00Z'}]},
 {indices:[{produtoId:old,sku:'66346',nome:'Pneu Novo',ativo:true}]},
 ])assert.equal(avaliar({...dado,...patch}).ok,false);
});
test('UI exige gerência, confirmação explícita e nunca aplica liberação ao pesquisar sozinho',()=>{
 const ui=readFileSync(new URL('../../src/components/Produtos.jsx',import.meta.url),'utf8');
 assert.match(ui,/patenteUsuario==='gerencia' && candidatoOrfaoPDV/);
 assert.match(ui,/onClick=\{\(\)=>setConfirmarLiberacaoOrfao\(true\)\}/);
 assert.match(ui,/liberarIndiceOrfaoPDV\(\{/);
 assert.match(ui,/Conferir e liberar se seguro/);
 const svc=readFileSync(new URL('../../src/core/productOrphanRelease.js',import.meta.url),'utf8');
 assert.match(svc,/await runTransaction\(db,async tx=>/);
 assert.match(svc,/getOperationalSnapshot\(db,userId\)/);
 assert.match(svc,/estoque_auditoria/);
 assert.doesNotMatch(svc,/deleteDoc|tx\.delete\(/);
});
