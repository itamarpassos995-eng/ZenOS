import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apurarTotalContratualPDV,cotarRecebimentoPDV} from '../src/core/pdvNativeCheckout.js';
import {adicionarCreditoNativoCliente,receberCreditoNativoCliente,saldoLegadoClienteBRL} from '../src/core/nativeCustomerCredit.js';
import {criarObrigacaoNativa} from '../src/core/monetaryContract.js';

const taxasA={PYG:1150,USD:0.20,EUR:0.18};
const taxasB={PYG:1100,USD:0.21,EUR:0.19};
const pdv=(clienteId)=>apurarTotalContratualPDV({itens:[{
 id:'prod1',qtd:'2',precoOrigemPDV:{moeda:'PYG',valor:15000},
 precoPraticadoBRL:13.04,clienteId
}],moedaPadrao:'PYG',desconto:'0'});
test('venda Gs 30000 sempre original: cliente novo e antigo, antes/depois de câmbio',()=>{
 for(const cli of ['novo','antigo']){
  const contrato=pdv(cli);
  assert.equal(contrato.ok,true);
  assert.equal(contrato.totalOriginal,30000);
  assert.equal(cotarRecebimentoPDV({contrato,moedaRecebimento:'PYG',taxasConfirmadas:taxasA}).valorReceber,30000);
  assert.equal(cotarRecebimentoPDV({contrato,moedaRecebimento:'PYG',taxasConfirmadas:taxasB}).valorReceber,30000);
  assert.equal(cotarRecebimentoPDV({contrato,moedaRecebimento:'BRL',taxasConfirmadas:taxasA}).valorReceber,26.09);
  assert.equal(cotarRecebimentoPDV({contrato,moedaRecebimento:'BRL',taxasConfirmadas:taxasB}).valorReceber,27.27);
 }
});
test('fiado novo Gs 30000 conserva obrigação com pagamento integral R$ 27,27',()=>{
 let cliente={id:'cliente-antigo',saldoDevedorBRL:100};
 const pagamento={formaId:'crediario',moedaOrigem:'PYG',valorOriginal:30000,valorConvertidoBRL:26.09};
 cliente=adicionarCreditoNativoCliente({cliente,vendaId:'VENDA-30k',moedaDocumento:'PYG',
  pagamentosFiado:[pagamento],taxasConfirmadas:taxasA,registradaEm:'2026-11-20'});
 cliente.saldoDevedorBRL=126.09;
 assert.equal(saldoLegadoClienteBRL(cliente),100);
 const recebido=receberCreditoNativoCliente({cliente,contaId:'VENDA-30k',recebimentoId:'REC-1',
  moedaPagamento:'BRL',valorPagamentoOriginal:27.27,taxasConfirmadas:taxasB,registradaEm:'2026-11-20'});
 assert.equal(recebido.depois.saldoNativo,0);
 assert.equal(recebido.cliente.saldoDevedorBRL,100);
 assert.equal(recebido.liquidacao.moedaObrigacao,'PYG');
 assert.equal(recebido.liquidacao.valorAmortizadoOriginal,30000);
 assert.equal(recebido.liquidacao.diferencaCambialRealizadaBRL,1.18);
});
test('o formulário de cliente não troca a moeda da dívida ao selecionar como receber',()=>{
 const clientes=readFileSync(new URL('../src/components/Clientes.jsx',import.meta.url),'utf8');
 assert.match(clientes,/receberCreditoNativoCliente\(\{cliente:clienteAtual/);
 assert.match(clientes,/contaFiadoSelecionadaId/);
 assert.match(clientes,/moedaPagamento:formaCfg\.moedaOrigem/);
 assert.match(clientes,/saldoLegadoClienteBRL\(clienteAtual\)/);
 assert.match(clientes,/taxasCambio=\{\}+/);
});
test('PDV armazena moeda contratual original em novos créditos, sem migrar antigos',()=>{
 const source=readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
 assert.match(source,/adicionarCreditoNativoCliente\(\{cliente:c,vendaId/);
 assert.match(source,/moedaDocumento:contratoNativoPDV\.ok\?moedaPadrao:moeda/);
 assert.match(source,/totalOriginal:contratoNativoPDV\.ok\?contratoNativoPDV\.totalOriginal/);
 assert.match(source,/cotarPendenteNaMoeda\(conf\.moedaOrigem\)/);
 assert.match(source,/taxasDoCheckoutRef\.current/);
});
test('valor em moeda padrão fica visível como total, equivalência é opcional',()=>{
 const source=readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
 assert.match(source,/formatarContratoNativo\(contratoNativoPDV\.totalOriginal\)/);
 assert.match(source,/moeda !== moedaPadrao/);
 assert.match(source,/Equivalente visual/);
});
test('app inicia com moeda padrão guardada e opção visual manual não grava padrão',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/moedaPadraoInicialCarregadaRef\.current=true/);
 assert.match(app,/setMoeda: novaMoeda => \{moedaEscolhaManualRef\.current=true;setMoeda\(novaMoeda\);\}/);
 assert.match(app,/<Clientes moedaPadrao=\{moedaPadrao\} taxasCambio=\{taxasCambio\}/);
});
test('legados não recebem moeda inventada pela taxa atual',()=>{
 const legado={id:'cliente',saldoDevedorBRL:11706.81};
 assert.equal(saldoLegadoClienteBRL(legado),11706.81);
 assert.throws(()=>criarObrigacaoNativa({id:'legado',moedaDocumento:'PYG',
  valorOriginal:null,taxasConfirmadas:taxasB,registradaEm:'2026-11-20'}));
});
test('motores de moeda não têm acesso a Firestore nem listeners',()=>{
 for(const path of ['monetaryContract.js','pdvNativeCheckout.js','nativeCustomerCredit.js']){
  const code=readFileSync(new URL('../src/core/'+path,import.meta.url),'utf8');
  assert.doesNotMatch(code,/firebase\/firestore|onSnapshot\s*\(|setDoc\s*\(|runTransaction\s*\(/);
 }
});
