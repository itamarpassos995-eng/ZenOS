import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apurarDespesasEVariacaoCambial} from '../src/core/expenseFxResult.js';

test('perda FX de 0,99 em PYG afeta resultado uma única vez, sem alterar preço nativo',()=>{
 const d={id:'d',status:'paga',valorBRL:21.74,moedaOrigem:'PYG',valorOriginal:25000,
   pagamentoMoedaOrigem:'PYG',pagamentoValorOriginal:25000,diferencaCambialBRL:0.99};
 const orig=JSON.stringify(d);
 assert.deepEqual(apurarDespesasEVariacaoCambial([d]),{
  despesasHistoricasBRL:21.74,variacaoCambialBRL:0.99,despesaRealizadaBRL:22.73,quantidadeComAjuste:1});
 assert.equal(JSON.stringify(d),orig);
});
test('ganho realizado reduz despesa, sem entrada de dinheiro fictícia no caixa',()=>{
 const d={status:'paga',valorBRL:25,diferencaCambialBRL:-2.27};
 assert.equal(apurarDespesasEVariacaoCambial([d]).despesaRealizadaBRL,22.73);
 const src=readFileSync(new URL('../src/components/Despesas.jsx',import.meta.url),'utf8');
 assert.match(src,/ajusteCambial\?\[financeiro,ajusteCambial\]:\[financeiro\]/);
 assert.match(src,/afetaCaixaFisico:false/);
 assert.match(src,/variacao_cambial_realizada/);
});
test('pendentes, compras e históricos legados não geram diferença inventada',()=>{
 const a=apurarDespesasEVariacaoCambial([
  {status:'pendente',valorBRL:100,diferencaCambialBRL:10},
  {status:'paga',valorBRL:100,naturezaContabil:'estoque_ativo',diferencaCambialBRL:10},
  {status:'paga',valorBRL:20},
  {status:'paga',valorBRL:30,afetaResultado:false}
 ]);
 assert.deepEqual(a,{despesasHistoricasBRL:20,variacaoCambialBRL:0,despesaRealizadaBRL:20,quantidadeComAjuste:0});
});
test('painel incorpora diferença apenas do pagamento no período',()=>{
 const registros=[{status:'paga',valorBRL:21.74,diferencaCambialBRL:0.99,dataPagamento:'2026-11-20'},
 {status:'paga',valorBRL:5,diferencaCambialBRL:-1,dataPagamento:'2026-11-19'}];
 const x=apurarDespesasEVariacaoCambial(registros,d=>d.dataPagamento==='2026-11-20');
 assert.equal(x.despesaRealizadaBRL,22.73);
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/apurarDespesasEVariacaoCambial\(despesas/);
 assert.match(app,/const despesasPagasBRL = apuracaoDespesas\.despesaRealizadaBRL/);
});
