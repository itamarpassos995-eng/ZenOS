import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vendasDaSessao} from '../src/core/cashSession.js';
const code=readFileSync(new URL('../src/components/GestaoCaixas.jsx',import.meta.url),'utf8');
test('cash audit retains all linked cash movements without sanitizing or hiding types',()=>{
 assert.match(code,/caixaMovimentos\.filter\(m=>String\(m\.sessaoId\)===String\(detalhe\.id\)\)/);
 assert.match(code,/movimentos\.map\(m=>\(\{id:'mov:'/);
 assert.doesNotMatch(code,/movimentos\.filter\(m=>m\.tipo===/);
});
test('cash audit also lists session sales independently from movements',()=>{
 assert.match(code,/vendasDaSessao\(\{sessao:detalhe,historicoVendas\}\)/);
 assert.match(code,/\.\.\.vendas\.map\(v=>\(\{id:'venda:'/);
 assert.match(code,/historicoDoTurno\.map\(h=>/);
});
test('historic sale matching uses original session or operator-and-time provenance',()=>{
 const sessao={id:'turno1',operadorId:'op1',createdAt:'2026-11-21T10:00:00Z'};
 const vendas=[{id:'sale1',sessaoId:'turno1',estado:'concluida',createdAt:'2026-11-21T11:00:00Z'},
 {id:'sale2',vendedorId:'op1',estado:'concluida',createdAt:'2026-11-21T11:30:00Z'},
 {id:'sale3',sessaoId:'elsewhere',estado:'concluida',createdAt:'2026-11-21T11:30:00Z'}];
 assert.deepEqual(vendasDaSessao({sessao,historicoVendas:vendas}).map(v=>v.id),['sale1','sale2']);
});
