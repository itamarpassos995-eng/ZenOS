import test from 'node:test';
import assert from 'node:assert/strict';
import { apurarVendasNativasDoDia } from '../src/utils/dailySalesNative.js';

const venda=(moedaDocumento,totalOriginal,totalBRL,taxasCambio={BRL:1,PYG:1150,USD:0.2,EUR:0.18},outros={})=>
 ({moedaDocumento,totalOriginal,totalBRL,taxasCambio,estado:'concluida',...outros});

test('guarani vendido hoje é fixo apesar da alteração de cotação',()=>{
 const vendas=[venda('PYG',25000,25000/1150),venda('PYG',50000,50000/1150)];
 const antes=JSON.stringify(vendas);
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:true,total:75000,subtotalConfirmado:75000,confirmadas:2,pendentes:0,outrasMoedas:0,pendencias:[]});
 vendas.forEach(v=>{v.taxasCambio.PYG=1100;});
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:true,total:75000,subtotalConfirmado:75000,confirmadas:2,pendentes:0,outrasMoedas:0,pendencias:[]});
 assert.notEqual(JSON.stringify(vendas),antes);
});
test('não converte automaticamente USD BRL EUR em faturamento PYG',()=>{
 const vendas=[venda('PYG',25000,25),venda('BRL',40,40),venda('USD',5,25),venda('EUR',9,50)];
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:true,total:25000,subtotalConfirmado:25000,confirmadas:1,pendentes:0,outrasMoedas:3,pendencias:[]});
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'BRL'),{ok:true,total:40,subtotalConfirmado:40,confirmadas:1,pendentes:0,outrasMoedas:3,pendencias:[]});
});
test('reembolso parcial modifica o líquido usando valores registrados, nunca cotação atual',()=>{
 const v=venda('PYG',25000,25,{BRL:1,PYG:1150}, {totalLiquidoBRL:20,valorDevolvidoBRL:5});
 assert.deepEqual(apurarVendasNativasDoDia([v],'PYG'),{ok:true,total:20000,subtotalConfirmado:20000,confirmadas:1,pendentes:0,outrasMoedas:0,pendencias:[]});
});
test('sem moeda ou valor original não inventa faturamento',()=>{
 const vendas=[{totalBRL:25},venda('PYG',undefined,25)];
 assert.deepEqual(apurarVendasNativasDoDia(vendas,'PYG'),{ok:false,total:null,subtotalConfirmado:0,confirmadas:0,pendentes:2,outrasMoedas:0,pendencias:[{id:'',motivo:'moeda_nao_registrada'},{id:'',motivo:'valor_original_nao_comprovado'}]});
});
test('recebimentos, preços e histórico não são alterados ao calcular',()=>{
 const v=venda('PYG',25000,25,{BRL:1,PYG:1150}, {pagamentos:[{moedaOrigem:'USD',valorOriginal:5,taxaCambioAplicada:0.2,valorConvertidoBRL:25}]});
 const original=JSON.stringify(v);
 assert.equal(apurarVendasNativasDoDia([v],'PYG').total,25000);
 assert.equal(JSON.stringify(v),original);
});

test('vendas parcialmente auditáveis não produzem total inventado nem escondem valor confirmado',()=>{
 const linhas=[venda('PYG',25000,25),{id:'antiga-sem-moeda',totalBRL:20}];
 const valor=apurarVendasNativasDoDia(linhas,'PYG');
 assert.equal(valor.ok,false);
 assert.equal(valor.total,null);
 assert.equal(valor.subtotalConfirmado,25000);
 assert.equal(valor.confirmadas,1);
 assert.equal(valor.pendentes,1);
 assert.deepEqual(valor.pendencias,[{id:'antiga-sem-moeda',motivo:'moeda_nao_registrada'}]);
});
