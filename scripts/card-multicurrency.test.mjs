import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calcularConciliacaoEletronicaSessao} from '../src/core/cashSession.js';
import {interpretarValorMonetario} from '../src/core/cashMoneyInput.js';

const pdv=readFileSync('src/components/PDV.jsx','utf8');
const clientes=readFileSync('src/components/Clientes.jsx','utf8');
const app=readFileSync('src/App.jsx','utf8');

test('PDV usa moeda nativa do cartão e mantém IDs BRL legados',()=>{
 assert.match(pdv,/m === 'BRL' \? 'cartaoCredito' : `cartaoCredito_\$\{m\.toLowerCase\(\)\}`/);
 assert.match(pdv,/m === 'BRL' \? 'cartaoDebito' : `cartaoDebito_\$\{m\.toLowerCase\(\)\}`/);
 assert.match(pdv,/moedaOrigem:m/);
 assert.match(pdv,/valorOriginal: valorNum/);
 assert.match(pdv,/valorConvertidoBRL: Math\.round\(valorBRL \* 100\) \/ 100/);
 assert.match(pdv,/afetaCaixaFisico: String\(pag\.formaId \|\| ''\)\.startsWith\('dinheiro'\)/);
});

test('recebimento de fiado preserva moeda do cartão sem alterar dívida BRL',()=>{
 assert.match(clientes,/cartaoCredito_\$\{m\.toLowerCase\(\)\}/);
 assert.match(clientes,/detalhes: \{moedaOrigem:formaCfg\.moedaOrigem,valorOriginal,taxaCambioAplicada:/);
 assert.match(clientes,/afetaCaixaFisico: dinheiroFisico/);
});

test('PYG não aceita centavos e cartão mantém o valor real',()=>{
 assert.deepEqual(interpretarValorMonetario('125000','PYG'),{ok:true,valor:125000,vazio:false});
 assert.equal(interpretarValorMonetario('125000,50','PYG').ok,false);
});

test('conciliação de cartões mantém BRL e PYG separados, sem somar gaveta',()=>{
 const sessao={id:'turno'};
 const livroFinanceiro=[
  {sessaoId:'turno',formaPagamento:'cartaoCredito',valor:100,direcao:'entrada',detalhes:{moedaOrigem:'BRL',valorOriginal:100}},
  {sessaoId:'turno',formaPagamento:'cartaoCredito_pyg',valor:120,direcao:'entrada',detalhes:{moedaOrigem:'PYG',valorOriginal:180000}},
  {sessaoId:'turno',formaPagamento:'cartaoDebito_pyg',valor:60,direcao:'entrada',detalhes:{moedaOrigem:'PYG',valorOriginal:90000}},
  {sessaoId:'turno',formaPagamento:'cartaoCredito_pyg',valor:20,direcao:'saida',detalhes:{moedaOrigem:'PYG',valorOriginal:30000}},
  {sessaoId:'outro',formaPagamento:'cartaoDebito',valor:500,direcao:'entrada'},
 ];
 const res=calcularConciliacaoEletronicaSessao({sessao,livroFinanceiro});
 assert.equal(res.cartaoCreditoLiquido,200);
 assert.equal(res.cartaoDebitoLiquido,60);
 assert.equal(res.recebiveisPorMoeda['cartaoCredito:BRL'].liquidoNativo,100);
 assert.equal(res.recebiveisPorMoeda['cartaoCredito:PYG'].liquidoNativo,150000);
 assert.equal(res.recebiveisPorMoeda['cartaoCredito:PYG'].equivalenteBRL,100);
 assert.equal(res.recebiveisPorMoeda['cartaoDebito:PYG'].liquidoNativo,90000);
 assert.match(app,/conciliacaoEletronica\.recebiveisPorMoeda/);
});
