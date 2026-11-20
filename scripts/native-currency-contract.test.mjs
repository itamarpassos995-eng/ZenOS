import test from 'node:test';
import assert from 'node:assert/strict';
import {criarObrigacaoNativa,cotarObrigacaoNativa,registrarPagamentoContraObrigacao} from '../src/core/nativeCurrencyContract.js';

const taxas={BRL:1,PYG:1500,USD:0.20,EUR:0.18};
test('venda PYG 30000 permanece 30000 após atualizar cambio',()=>{
 const original=criarObrigacaoNativa(30000,'PYG');
 assert.equal(cotarObrigacaoNativa(original,'BRL',taxas).valor,20);
 assert.equal(cotarObrigacaoNativa(original,'BRL',{...taxas,PYG:1200}).valor,25);
 assert.deepEqual(original,{moeda:'PYG',valor:30000});
});
test('receber BRL 20 com PYG 1500 quita PYG 30000 sem mudar contrato',()=>{
 const contrato=criarObrigacaoNativa(30000,'PYG');
 const pago=registrarPagamentoContraObrigacao(contrato,20,'BRL',taxas);
 assert.equal(pago.saldoNativo,0);
 assert.equal(pago.aplicadoNativo,30000);
 assert.equal(pago.valorConvertidoBRL,20);
 assert.equal(contrato.valor,30000);
});
test('receber parcialmente e novo cambio muda apenas saldo a cobrar convertido',()=>{
 const contrato=criarObrigacaoNativa(30000,'PYG');
 const parcial=registrarPagamentoContraObrigacao(contrato,10,'BRL',taxas);
 assert.equal(parcial.aplicadoNativo,15000);
 assert.equal(parcial.saldoNativo,15000);
 assert.equal(cotarObrigacaoNativa(criarObrigacaoNativa(parcial.saldoNativo,'PYG'),'BRL',{...taxas,PYG:1200}).valor,12.5);
});
test('cotação cruzada USD EUR preserva valor nativo',()=>{
 const origem=criarObrigacaoNativa(50,'USD');
 const emEUR=cotarObrigacaoNativa(origem,'EUR',taxas);
 assert.equal(emEUR.valor,45);
 assert.equal(origem.valor,50);
});
test('taxa ausente, moeda invalida e fracao de PYG bloqueiam operacao',()=>{
 assert.throws(()=>cotarObrigacaoNativa(criarObrigacaoNativa(30000,'PYG'),'BRL',{PYG:0}));
 assert.throws(()=>criarObrigacaoNativa(30000.5,'PYG'));
 assert.throws(()=>criarObrigacaoNativa(5,'XYZ'));
 assert.throws(()=>registrarPagamentoContraObrigacao({valor:50,moeda:'USD'},10,'EUR',{USD:0.2}));
});
