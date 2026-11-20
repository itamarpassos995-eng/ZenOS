import test from 'node:test';
import assert from 'node:assert/strict';
import {unidadesMenores,converterMoedaConfirmada,criarObrigacaoNativa,criarLiquidacaoNativa,apurarSaldoNativo,resumirSaldosPorMoeda} from '../src/core/monetaryContract.js';
const data='2026-11-20',antiga={PYG:1150,USD:0.2,EUR:0.18},nova={PYG:1100,USD:0.21,EUR:0.19};
const venda=(moedaDocumento='PYG',valorOriginal=25000,taxasConfirmadas=antiga)=>criarObrigacaoNativa({id:'v1',moedaDocumento,valorOriginal,taxasConfirmadas,registradaEm:data});
const liquidar=(o,id,aplicado,pago,moeda='PYG',pagamentos=[])=>criarLiquidacaoNativa({
 id,obrigacao:o,valorAmortizadoOriginal:aplicado,moedaPagamento:moeda,valorPagamentoOriginal:pago,
 taxasConfirmadas:nova,registradaEm:data,liquidacoesAnteriores:pagamentos});
test('cotação 1150->1100 NÃO altera dívida nominal PYG 25000',()=>{
 const o=venda();assert.equal(o.valorOriginal,25000);assert.equal(o.valorContabilHistoricoBRL,21.74);
 assert.equal(converterMoedaConfirmada({valor:25000,moedaOrigem:'PYG',moedaDestino:'BRL',taxasConfirmadas:nova}),22.73);
 assert.equal(o.valorOriginal,25000);
});
test('pagar dívida PYG em PYG conserva 25000 e não exige cotação para mesma moeda',()=>{
 const o=venda(),p=liquidar(o,'p1',25000,25000);
 assert.equal(p.valorPagamentoOriginal,25000);assert.equal(apurarSaldoNativo(o,[p]).saldoNativo,0);
 assert.equal(converterMoedaConfirmada({valor:25000,moedaOrigem:'PYG',moedaDestino:'PYG'}),25000);
});
test('pagamento PYG em BRL aplica somente taxa confirmada e não reprecifica contrato',()=>{
 const o=venda(),p=liquidar(o,'p1',25000,22.73,'BRL');
 assert.equal(p.valorAmortizadoOriginal,25000);assert.equal(p.valorContabilHistoricoAmortizadoBRL,21.74);
 assert.equal(p.diferencaCambialRealizadaBRL,0.99);
});
test('fiado parcial PYG mantém saldo fixo de 12500 apesar de mudança cambial',()=>{
 const o=venda(),p=liquidar(o,'p1',12500,12500);
 assert.equal(apurarSaldoNativo(o,[p]).saldoNativo,12500);
});
test('validação de moeda, taxa e precisão rejeita operações inválidas',()=>{
 assert.throws(()=>unidadesMenores('25000.01','PYG'),/Precisão/);
 assert.throws(()=>venda('PYG',25000,{PYG:0}),/Cotação/);
 assert.throws(()=>converterMoedaConfirmada({valor:25000,moedaOrigem:'PYG',moedaDestino:'BRL',taxasConfirmadas:{}}),/Cotação/);
});
test('não aceita cobrança inferior, duplicação ou pagamento acima da dívida',()=>{
 const o=venda(),p=liquidar(o,'p1',12500,12500);
 assert.throws(()=>liquidar(o,'p2',25000,25000,'PYG',[p]),/excede saldo/);
 assert.throws(()=>liquidar(o,'p1',12500,12500,'PYG',[p]),/repetido/);
 assert.throws(()=>liquidar(o,'p3',25000,22.72,'BRL'),/divergente/);
 assert.throws(()=>apurarSaldoNativo(o,[p,p]),/duplicado/);
});
test('histórico BRL é rateado sem criar centavos ao dividir parcelas',()=>{
 const o=venda('PYG',3,{PYG:2});
 const opts={PYG:2};
 const liq=(id,anteriores)=>criarLiquidacaoNativa({id,obrigacao:o,valorAmortizadoOriginal:1,moedaPagamento:'PYG',
 valorPagamentoOriginal:1,taxasConfirmadas:opts,registradaEm:data,liquidacoesAnteriores:anteriores});
 const a=liq('a',[]),b=liq('b',[a]),c=liq('c',[a,b]);
 assert.equal(a.valorContabilHistoricoAmortizadoBRL+b.valorContabilHistoricoAmortizadoBRL+c.valorContabilHistoricoAmortizadoBRL,1.50);
 assert.equal(apurarSaldoNativo(o,[a,b,c]).saldoNativo,0);
});
test('moedas são reportadas separadamente e legado fica pendente, nunca vira PYG inventado',()=>{
 const a=resumirSaldosPorMoeda([{obrigacao:venda('BRL',50)},
  {obrigacao:{...venda('USD',5),id:'usd'}},{obrigacao:{...venda('EUR',10),id:'eur'}},
  {obrigacao:{id:'legacy',saldoDevedorBRL:11706.81}}]);
 assert.deepEqual(a.totais,{BRL:50,PYG:0,USD:5,EUR:10});
 assert.equal(a.pendencias.length,1);assert.equal(a.confiavel,false);
});
test('documentos congelados não são alterados por leitura ou pagamento',()=>{
 const o=venda(),before=JSON.stringify(o),p=liquidar(o,'x',25000,25000);
 assert.equal(JSON.stringify(o),before);assert.ok(Object.isFrozen(o)&&Object.isFrozen(p));
});
