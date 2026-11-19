import test from 'node:test';
import assert from 'node:assert/strict';
import { totalDiarioMoedaPadrao } from '../src/core/dailySalesNative.js';

const venda = (moedaDocumento, totalOriginal, taxa, totalBRL, campos={}) => ({
  estado:'concluida',moedaDocumento,totalOriginal,taxasCambio:{BRL:1,PYG:taxa,USD:0.2,EUR:0.18},totalBRL,...campos
});

test('Gs 25.000 + 50.000 vendidos permanecem Gs 75.000, independentemente da cotação nova', () => {
 const historico=[venda('PYG',25000,1150,25000/1150),venda('PYG',50000,1100,50000/1100)];
 const antes=JSON.stringify(historico);
 assert.deepEqual(totalDiarioMoedaPadrao(historico,'PYG'),{ok:true,total:75000,pendentes:0});
 assert.equal(JSON.stringify(historico),antes);
});
test('conversão histórica BRL USD EUR para PYG usa cotação da venda e não cotação nova',()=>{
 const historico=[venda('BRL',10,1150,10),venda('USD',2,1100,10),venda('EUR',1.8,1200,10)];
 // 11.500 + 11.000 + 12.000 pela taxa congelada em cada venda.
 assert.deepEqual(totalDiarioMoedaPadrao(historico,'PYG'),{ok:true,total:34500,pendentes:0});
});
test('valor BRL original não muda por alteração de câmbio PYG',()=>{
 assert.deepEqual(totalDiarioMoedaPadrao([venda('BRL',50,1150,50)],'BRL'),{ok:true,total:50,pendentes:0});
});
test('devolução parcial reduz valor original sem revalorizar saldo pelo câmbio atual',()=>{
 const historico=[venda('PYG',25000,1150,25,{totalLiquidoBRL:20,valorDevolvidoBRL:5})];
 assert.deepEqual(totalDiarioMoedaPadrao(historico,'PYG'),{ok:true,total:20000,pendentes:0});
});
test('dados sem origem de moeda ou sem cotação de histórico não são inventados',()=>{
 const historico=[{totalBRL:25}, {moedaDocumento:'PYG',totalOriginal:25000,totalBRL:25,taxasCambio:{PYG:0}}];
 assert.deepEqual(totalDiarioMoedaPadrao(historico,'PYG'),{ok:false,total:null,pendentes:2});
});
