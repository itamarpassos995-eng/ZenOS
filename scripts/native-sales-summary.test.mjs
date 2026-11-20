import test from 'node:test';
import assert from 'node:assert/strict';
import {resumirVendasNativas} from '../src/core/nativeSalesSummary.js';
const v={id:'v',versaoMonetaria:1,estado:'concluida',moedaDocumento:'PYG',totalOriginal:30000};
test('faturamento PYG não muda após alterar câmbio de 1150 para 1100',()=>{
 const a=resumirVendasNativas([v],'PYG',()=>26.09);
 assert.equal(a.valorNativoComprovado,30000);
 assert.equal(a.parcial,false);
 assert.equal(resumirVendasNativas([v],'PYG',()=>27.27).valorNativoComprovado,30000);
});
test('venda histórica sem origem independente não vira PYG por câmbio atual',()=>{
 const r=resumirVendasNativas([{...v,versaoMonetaria:undefined}],'PYG',()=>26.09);
 assert.equal(r.valorNativoComprovado,0);
 assert.equal(r.documentosPendentes,1);
 assert.equal(r.legadoContabilBRL,26.09);
});
test('devolução histórica sem quantia nativa não inventa faturamento líquido',()=>{
 const r=resumirVendasNativas([{...v,devolucoes:[{valorBRL:12}]}],'PYG',()=>14.09);
 assert.equal(r.documentosPendentes,1);assert.equal(r.legadoContabilBRL,14.09);
});
test('moedas estrangeiras ficam em grupos nominais separados',()=>{
 const r=resumirVendasNativas([v,{...v,id:'x',moedaDocumento:'USD',totalOriginal:10}],'PYG');
 assert.equal(r.totaisPorMoeda.PYG,30000);
 assert.equal(r.totaisPorMoeda.USD,10);
 assert.equal(r.parcial,true);
});
