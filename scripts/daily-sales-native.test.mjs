import test from 'node:test';
import assert from 'node:assert/strict';
import { apurarVendasNativasDoDia } from '../src/utils/dailySalesNative.js';

const venda=(moedaDocumento,totalOriginal,totalBRL,taxasCambio={BRL:1,PYG:1150,USD:0.2,EUR:0.18},outros={})=>
 ({moedaDocumento,totalOriginal,totalBRL,taxasCambio,estado:'concluida',...outros});

test('guarani vendido hoje é fixo apesar da alteração de cotação',()=>{
 const vendas=[venda('PYG',25000,25000/1150),venda('PYG',50000,50000/1150)];
 const antes=JSON.stringify(vendas);
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:true,total:75000,pendentes:0,outrasMoedas:0});
 vendas.forEach(v=>{v.taxasCambio.PYG=1100;});
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:true,total:75000,pendentes:0,outrasMoedas:0});
 assert.notEqual(JSON.stringify(vendas),antes);
});
test('não converte automaticamente USD BRL EUR em faturamento PYG',()=>{
 const vendas=[venda('PYG',25000,25),venda('BRL',40,40),venda('USD',5,25),venda('EUR',9,50)];
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:true,total:25000,pendentes:0,outrasMoedas:3});
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'BRL'),{ok:true,total:40,pendentes:0,outrasMoedas:3});
});
test('reembolso parcial modifica o líquido usando valores registrados, nunca cotação atual',()=>{
 const v=venda('PYG',25000,25,{BRL:1,PYG:1150}, {totalLiquidoBRL:20,valorDevolvidoBRL:5});
 assert.deepEqual(apurarVendasNativasDoDia([v],'PYG'),{ok:true,total:20000,pendentes:0,outrasMoedas:0});
});
test('sem moeda ou valor original não inventa faturamento',()=>{
 const vendas=[{totalBRL:25},venda('PYG',undefined,25)];
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:false,total:null,pendentes:2,outrasMoedas:0});
});
test('recebimentos, preços e histórico não são alterados ao calcular',()=>{
 const v=venda('PYG',25000,25,{BRL:1,PYG:1150}, {pagamentos:[{moedaOrigem:'USD',valorOriginal:5,taxaCambioAplicada:0.2,valorConvertidoBRL:25}]});
 const original=JSON.stringify(v);
 assert.equal(apurarVendasNativasDoDia([v],'PYG').total,25000);
 assert.equal(JSON.stringify(v),original);
});
