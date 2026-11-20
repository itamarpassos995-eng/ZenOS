import test from 'node:test';
import assert from 'node:assert/strict';
import {adicionarCreditoNativoCliente,receberCreditoNativoCliente,contasAbertasClienteNativo,saldoLegadoClienteBRL} from '../src/core/nativeCustomerCredit.js';
const data='2026-11-20',a={PYG:1150},b={PYG:1100};
const cliente={id:'C',saldoDevedorBRL:0};
const pg=[{formaId:'crediario',moedaOrigem:'PYG',valorOriginal:30000,valorConvertidoBRL:26.09}];
const preparar=()=>{const c=adicionarCreditoNativoCliente({cliente,vendaId:'V1',moedaDocumento:'PYG',pagamentosFiado:pg,taxasConfirmadas:a,registradaEm:data});return {...c,saldoDevedorBRL:26.09};};
test('venda fiada Gs 30000 cria contrato nominal que não depende do câmbio atual',()=>{
 const c=preparar(),d=contasAbertasClienteNativo(c);
 assert.equal(d.length,1);assert.equal(d[0].obrigacao.valorOriginal,30000);
 assert.equal(d[0].obrigacao.valorContabilHistoricoBRL,26.09);
 assert.equal(saldoLegadoClienteBRL(c),0);
});
test('receber R$ 27,27 a 1100 quita Gs 30000, sem deixar 3 guaranis fictícios',()=>{
 const c=preparar();const r=receberCreditoNativoCliente({cliente:c,contaId:'V1',recebimentoId:'REC',moedaPagamento:'BRL',
   valorPagamentoOriginal:27.27,taxasConfirmadas:b,registradaEm:data});
 assert.equal(r.depois.saldoNativo,0);assert.equal(r.cliente.saldoDevedorBRL,0);
 assert.equal(r.liquidacao.valorPagamentoOriginal,27.27);
 assert.equal(r.liquidacao.valorAmortizadoOriginal,30000);
 assert.equal(r.liquidacao.diferencaCambialRealizadaBRL,1.18);
});
test('receber Gs 10000 baixa apenas Gs 10000, saldo nativo permanece Gs 20000',()=>{
 const c=preparar();const r=receberCreditoNativoCliente({cliente:c,contaId:'V1',recebimentoId:'REC',moedaPagamento:'PYG',
  valorPagamentoOriginal:10000,taxasConfirmadas:b,registradaEm:data});
 assert.equal(r.depois.saldoNativo,20000);
 assert.equal(r.liquidacao.moedaPagamento,'PYG');
});
test('cliente antigo pode ter legado BRL separado de dívida nativa sem converter legado',()=>{
 const c={...preparar(),saldoDevedorBRL:126.09};
 assert.equal(saldoLegadoClienteBRL(c),100);
});
test('recebimentos repetidos e valores incorretos são bloqueados',()=>{
 const c=preparar();
 assert.throws(()=>receberCreditoNativoCliente({cliente:c,contaId:'V1',recebimentoId:'X',moedaPagamento:'BRL',
  valorPagamentoOriginal:25,taxasConfirmadas:b,registradaEm:data}),/divergente/);
 const r=receberCreditoNativoCliente({cliente:c,contaId:'V1',recebimentoId:'REC',moedaPagamento:'PYG',
  valorPagamentoOriginal:10000,taxasConfirmadas:b,registradaEm:data});
 assert.throws(()=>receberCreditoNativoCliente({cliente:r.cliente,contaId:'V1',recebimentoId:'REC',moedaPagamento:'PYG',
  valorPagamentoOriginal:10000,taxasConfirmadas:b,registradaEm:data}),/repetido/);
});
