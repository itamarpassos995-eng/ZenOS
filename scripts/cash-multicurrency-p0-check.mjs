import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validarComposicaoPagamento } from '../src/core/paymentValidation.js';
import { interpretarValorMonetario, converterValoresFisicosParaBRL } from '../src/core/cashMoneyInput.js';
import { calcularResumoSessao } from '../src/core/cashSession.js';

const parse = (text, currency) => interpretarValorMonetario(text, currency);
assert.equal(parse('30.000', 'PYG').valor, 30000);
assert.equal(parse('30,000', 'PYG').valor, 30000);
assert.equal(parse('1.470,20', 'BRL').valor, 1470.2);
assert.equal(parse('1,470.20', 'BRL').valor, 1470.2);
assert.equal(parse('1.470.20', 'BRL').ok, false);
assert.equal(parse('1.470,200', 'BRL').ok, false);
assert.equal(parse('abc', 'BRL').ok, false);
assert.equal(parse('-50', 'BRL').ok, false);
assert.equal(parse('', 'BRL').ok, false);
assert.equal(interpretarValorMonetario('', 'BRL', { permitirVazio: true }).valor, 0);
assert.equal(parse('30,20', 'PYG').ok, false);
assert.equal(parse('30000', 'PYG').valor, 30000);
const total = converterValoresFisicosParaBRL({ BRL: '1.470,20', PYG:'30.000' }, { USD: 0.185, EUR: 0.165, PYG: 1500 });
assert.equal(total.ok, true);
assert.equal(total.totalBRL, 1490.2);
assert.equal(total.valoresNativos.PYG, 30000);
assert.equal(converterValoresFisicosParaBRL({ PYG:'abc' }, { PYG: 1500 }).ok, false);
const sessao = { id: 'SESSAO-2', operadorId: 'OP-1', createdAt:'2026-10-09T10:00:00.000Z', status:'fechada', fechamento:'2026-10-09T17:00:00.000Z', saldoInicial:0 };
const vendas = [
  { id:'new', estado:'concluida', sessaoId:'SESSAO-2', vendedorId:'OP-1', createdAt:'2026-10-09T10:10:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:100}] },
  { id:'other', estado:'concluida', sessaoId:'SESSAO-3', vendedorId:'OP-1', createdAt:'2026-10-09T11:00:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:500}] },
  { id:'old', estado:'concluida', vendedorId:'OP-1', createdAt:'2026-10-09T10:30:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:20}] },
  { id:'late', estado:'concluida', vendedorId:'OP-1', createdAt:'2026-10-09T18:00:00.000Z', pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:999}] },
];
assert.equal(calcularResumoSessao({sessao,historicoVendas:vendas,caixaMovimentos:[]}).vendasDinheiro,120);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:120,recebidoDinheiroBRL:0}).podeConcluir,false);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:120,recebidoDinheiroBRL:50}).podeConcluir,true);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:100,recebidoDinheiroBRL:0}).podeConcluir,true);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:0,recebidoDinheiroBRL:0}).podeConcluir,false);
assert.equal(validarComposicaoPagamento({totalBRL:100,recebidoBRL:Number.NaN,recebidoDinheiroBRL:0}).podeConcluir,false);
// Garante que os pontos críticos da interface importem os motores efetivamente exercitados.
const pdv=fs.readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
assert.match(pdv,/import \{ validarComposicaoPagamento \} from '..\/core\/paymentValidation'/);
assert.match(pdv,/const \{ podeConcluir: podeFinalizarVenda \} = validarComposicaoPagamento/);
assert.match(pdv,/sessaoId: tipoFinalizacao === 'venda' \? sessaoAtiva\?\.id/);
assert.match(app,/converterValoresFisicosParaBRL\(valoresMovCaixa, taxasCambio\)/);
assert.match(app,/const contagemValidada = validarValoresMovCaixa\(\)/);

console.log('ZenOS caixa: testes de regressão P0 aprovados.');
