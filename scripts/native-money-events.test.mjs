import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {criarSnapshotMonetario,validarLiquidacaoMultimoeda} from '../src/core/nativeMoneyEvents.js';
import {calcularConciliacaoFisicaMultimoeda} from '../src/core/cashReconciliation.js';

const taxas={BRL:1,PYG:1100,USD:0.2,EUR:0.18};
test('guarani 25000 conserva origem e aplica taxa explícita só no reembolso',()=>{
 const r=criarSnapshotMonetario({valorOriginal:'25000',moedaOrigem:'PYG',taxasCambio:taxas});
 assert.deepEqual(r,{ok:true,moedaOrigem:'PYG',valorOriginal:25000,taxaCambioAplicada:1100,valorConvertidoBRL:22.73});
 const mutada={...taxas,PYG:1150};
 assert.equal(r.valorOriginal,25000);
 assert.equal(criarSnapshotMonetario({valorOriginal:'25000',moedaOrigem:'PYG',taxasCambio:mutada}).valorConvertidoBRL,21.74);
});
test('sem taxa confirmada ou com formato inválido não cria valor',()=>{
 assert.equal(criarSnapshotMonetario({valorOriginal:'25000',moedaOrigem:'PYG',taxasCambio:{}}).ok,false);
 assert.equal(criarSnapshotMonetario({valorOriginal:'25000',moedaOrigem:'PYG',taxasCambio:{PYG:0}}).ok,false);
 assert.equal(criarSnapshotMonetario({valorOriginal:'25000.55',moedaOrigem:'PYG',taxasCambio:taxas}).ok,false);
 assert.equal(criarSnapshotMonetario({valorOriginal:'abc',moedaOrigem:'BRL',taxasCambio:taxas}).ok,false);
});
test('não quita diferença financeira com quantia física diferente',()=>{
 assert.equal(validarLiquidacaoMultimoeda({valorDevidoBRL:22.73,valorFisico:'25000',moedaFisica:'PYG',taxasCambio:taxas}).ok,true);
 assert.equal(validarLiquidacaoMultimoeda({valorDevidoBRL:22.73,valorFisico:'21000',moedaFisica:'PYG',taxasCambio:taxas}).ok,false);
});
test('USD, EUR e BRL conservam valor na moeda efetivamente paga',()=>{
 for(const [m,v] of [['USD','2'],['EUR','1,80'],['BRL','10,00']]){
  const r=criarSnapshotMonetario({valorOriginal:v,moedaOrigem:m,taxasCambio:taxas});
  assert.equal(r.ok,true);
  assert.equal(r.valorConvertidoBRL,10);
 }
});
test('conciliação reconstrói saída física apenas na moeda realmente entregue',()=>{
 const sessao={id:'CX',status:'aberta',saldoInicial:0,detalheAberturaNativos:{PYG:50000,BRL:0,USD:0,EUR:0}};
 const caixaMovimentos=[{id:'MOV-DEV-1',sessaoId:'CX',tipo:'saida_devolucao',valorBRL:22.73,
   detalhesMoedasNativas:{PYG:25000},moedaOrigem:'PYG',valorOriginal:25000,taxaCambioAplicada:1100}];
 const r=calcularConciliacaoFisicaMultimoeda({sessao,caixaMovimentos,contagem:{PYG:25000},taxas});
 assert.equal(r.confiavel,true);
 assert.equal(r.divergenciaFisica,false);
 assert.equal(r.esperado.PYG,25000);
 assert.equal(r.esperado.BRL,0);
});
test('Vendas exige escolha explícita, grava composição nativa e usa guarda no servidor',()=>{
 const src=readFileSync(new URL('../src/components/Vendas.jsx',import.meta.url),'utf8');
 assert.match(src,/moedaFisicaReembolso/);
 assert.match(src,/valorFisicoReembolso/);
 assert.match(src,/detalhesMoedasNativas: \{\[pagamentoFisico\.moedaOrigem\]/);
 assert.match(src,/cash_native_balance_at_least/);
 assert.match(src,/taxaCambioAplicada: pagamentoFisico\.taxaCambioAplicada/);
});
