import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { formatarValorNativoCaixa } from '../src/core/cashHistoryDisplay.js';
import { interpretarValorMonetario } from '../src/core/cashMoneyInput.js';
import { calcularConciliacaoFisicaMultimoeda } from '../src/core/cashReconciliation.js';
const app = readFileSync('src/App.jsx','utf8');
test('saldo de caixa expresso em BRL deve ser convertido antes de formatar na moeda selecionada',()=>{
 assert.match(app,/const fmtEquivalenteCaixa = valorBRL => fmt\(valorBRL, moedaTotalCaixa\)/);
 for(const symbol of ['saldoEsperadoBRL','valInformadoBRL','diferenca','calcularTotalMovBRL()']) {
  assert.ok(app.includes('fmtEquivalenteCaixa('+symbol+')'),symbol);
  assert.ok(!app.includes('fmt('+symbol+', moedaTotalCaixa)'),symbol+' não pode só mudar símbolo');
 }
});
test('resumo do caixa utiliza moeda selecionada e discrimina nativos por moeda',()=>{
 assert.match(app,/tx\('Saldo esperado','Saldo esperado','Expected balance'\)/);
 assert.match(app,/\['BRL','PYG','USD','EUR'\]\.map\(codigo/);
 assert.match(app,/conciliacaoFisica\.esperado\?\.\[codigo\]/);
 assert.match(app,/conciliacaoFisica\.contado\?\.\[codigo\]/);
 assert.match(app,/conciliacaoFisica\.diferencas\?\.\[codigo\]/);
});
test('fechamento ainda faz commit seguro idempotente e preserva guardas',()=>{
 for(const guard of ['cash_session_open','cash_close_snapshot_matches','cash_close_exchange_rates_match'])assert.ok(app.includes(guard),guard);
 assert.match(app,/operationKey: `fechar-caixa:\$\{sessaoAtiva\.id\}`/);
});

test('quantias nativas exibidas sem multiplicação adicional e equivalentes convertidos uma vez',()=>{
 const pyg = {locale:'es-PY',moeda:'PYG'};
 assert.match(formatarValorNativoCaixa(819950,'PYG',pyg),/819[.,]950/);
 assert.match(formatarValorNativoCaixa(1779050,'PYG',pyg),/1[.,]779[.,]050/);
 assert.match(formatarValorNativoCaixa(825,'BRL',{locale:'pt-BR'}),/825,00/);
 assert.ok(app.includes('formatarValorNativoCaixa(Number(valor || 0), codigo, moedasConfig[codigo])'));
 assert.ok(!app.includes('fmt(converterDeBRL(valorBRL'));
});
test('números do livro não são interpretados como agrupamentos de milhar',()=>{
 assert.equal(interpretarValorMonetario(1.234,'BRL').valor,1.23);
 assert.equal(interpretarValorMonetario(25000/1500,'BRL').valor,16.67);
 assert.equal(interpretarValorMonetario('1.234','BRL').valor,1234);
 assert.equal(interpretarValorMonetario('1.2345','BRL').ok,false);
 for(const v of [NaN,Infinity,-1]) assert.equal(interpretarValorMonetario(v,'BRL').ok,false);
 assert.equal(interpretarValorMonetario(10.5,'PYG').ok,false);
 const args={sessao:{id:'S',detalheAberturaNativos:{BRL:100,PYG:819950}},
  caixaMovimentos:[{id:'expense',sessaoId:'S',tipo:'saida_despesa',detalhesMoedas:{BRL:25000/1500}}],
  contagem:{BRL:83.33,PYG:819950},taxas:{PYG:1500}};
 const c=calcularConciliacaoFisicaMultimoeda(args);
 assert.equal(c.confiavel,true);
 assert.equal(c.esperado.BRL,83.33);
 assert.equal(c.esperado.PYG,819950);
 assert.equal(c.divergenciaFisica,false);
 args.caixaMovimentos[0].detalhesMoedas.BRL=NaN;
 assert.equal(calcularConciliacaoFisicaMultimoeda(args).confiavel,false);
});
