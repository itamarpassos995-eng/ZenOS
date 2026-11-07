import test from 'node:test';
import assert from 'node:assert/strict';
import {pdvCreditLink,pdvImmediatePaymentLink,validateFinanceLink} from '../../src/core/distribution/phase31NativeFinanceLinks.js';
import {criarLancamentoFinanceiro} from '../../src/core/financialLedgerCore.js';
const credit=()=>pdvCreditLink({vendaId:'VENDA-X',clienteId:'C1',lojaId:'COMPANY1',
 valorFiadoBRL:100,moedaDocumento:'PYG',
 pagamentos:[{id:1,formaId:'crediario',moedaOrigem:'PYG',valorOriginal:300000,
 valorConvertidoBRL:100,taxaCambioAplicada:3000}]});
test('B3 native PDV credit links source without pretending bank settlement or installments',()=>{
 const link=credit();
 assert.equal(link.financeLinkVersion,2);
 assert.equal(link.financeEventType,'OBLIGATION');
 assert.equal(link.installmentId,'INST-VENDA-X-AGGREGATE');
 assert.equal(link.moedaOrigem,'BRL');
 assert.equal(link.valorOriginal,100);
 assert.equal(link.statusLiquidacao,'DEBT_REGISTERED');
 const entry=criarLancamentoFinanceiro({id:'VENDA-VENDA-X-FIADO',lojaId:'COMPANY1',
  tipo:'venda_fiada',origem:'pdv',referenciaId:'VENDA-X',valor:100,
  clienteId:'C1',financeLink:link});
 assert.equal(entry.moeda,'BRL');
 assert.equal(entry.valor,100);
 assert.equal(entry.financeLink.receivableId,'REC-VENDA-X');
 assert.equal(entry.financeLink.statusLiquidacao,'DEBT_REGISTERED');
});
test('B3 native immediate receipt retains original tender without claiming bank settlement',()=>{
 const link=pdvImmediatePaymentLink({vendaId:'VENDA-X',clienteId:'C1',lojaId:'COMPANY1',
  ledgerId:'VENDA-VENDA-X-PG-0-pix',pagamento:{formaId:'pix',moedaOrigem:'BRL',
   valorOriginal:30,valorConvertidoBRL:30,taxaCambioAplicada:1}});
 assert.equal(link.financeEventType,'SALE_PAYMENT');
 assert.equal(link.statusLiquidacao,'REGISTERED_UNVERIFIED');
 const entry=criarLancamentoFinanceiro({id:link.paymentId,lojaId:'COMPANY1',
  tipo:'venda',origem:'pdv',referenciaId:'VENDA-X',valor:30,clienteId:'C1',
  financeLink:link});
 assert.equal(entry.valor,30);
 assert.equal(entry.financeLink.moedaOrigem,'BRL');
});
test('B3 refuses spoofed tenant, sale, client and false receipt identity',()=>{
 const input={...credit(),lojaId:'OTHER'};
 assert.throws(()=>criarLancamentoFinanceiro({id:'VENDA-VENDA-X-FIADO',
  lojaId:'COMPANY1',tipo:'venda_fiada',referenciaId:'VENDA-X',valor:100,clienteId:'C1',
  financeLink:input}),{code:'FINANCE_LINK_TENANT_MISMATCH'});
 assert.throws(()=>validateFinanceLink({...credit(),saleId:'ANOTHER'},
  {lojaId:'COMPANY1',referenciaId:'VENDA-X',clienteId:'C1'}),{code:'FINANCE_LINK_SALE_MISMATCH'});
 assert.throws(()=>validateFinanceLink({...credit(),clienteId:'C2'},
  {lojaId:'COMPANY1',referenciaId:'VENDA-X',clienteId:'C1'}),{code:'FINANCE_LINK_CUSTOMER_MISMATCH'});
});
test('B3 ledger normalization without B3 links preserves original schema and amount',()=>{
 const v=criarLancamentoFinanceiro({id:'OLD1',lojaId:'COMPANY1',
  tipo:'recebimento_fiado',referenciaId:'REC-OLD',valor:25,clienteId:'C1'});
 assert.equal(v.valor,25);
 assert.equal(v.financeLink,undefined);
 assert.equal(v.schema,'ATT07_V1_ADITIVO');
});

test('B4 native walk-in immediate payment has no customer, but retains tenant, sale and amount',()=>{
 const link=pdvImmediatePaymentLink({vendaId:'S-WALK',clienteId:null,lojaId:'COMPANY1',
  ledgerId:'VENDA-S-WALK-PG-0-dinheiro_brl',
  pagamento:{formaId:'dinheiro_brl',moedaOrigem:'BRL',valorOriginal:25,
   valorConvertidoBRL:25,taxaCambioAplicada:1}});
 const entry=criarLancamentoFinanceiro({
  id:link.paymentId,lojaId:'COMPANY1',tipo:'venda',origem:'pdv',
  referenciaId:'S-WALK',valor:25,clienteId:null,financeLink:link
 });
 assert.equal(entry.valor,25);
 assert.equal(entry.financeLink.clienteId,null);
 assert.equal(entry.financeLink.saleId,'S-WALK');
});
