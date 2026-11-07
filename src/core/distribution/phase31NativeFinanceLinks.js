/**
 * B.3: additive provenance metadata for the native ZenOS financial ledger.
 * Never fabricates a settlement, changes booked BRL values or backfills legacy events.
 */
const fail=c=>{throw Object.assign(new Error(c),{code:c})};
const id=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
const currency=v=>['BRL','PYG','USD','EUR'].includes(v);
export function validateFinanceLink(link,{lojaId,referenciaId,clienteId,ledgerId}={}){
 if(link==null)return null;
 if(link.financeLinkVersion!==2||!['OBLIGATION','RECEIPT','REVERSAL','COMPENSATION','SALE_PAYMENT'].includes(link.financeEventType)||
  !id(link.saleId)||!id(link.paymentId)||!id(link.sourceEventId)||!currency(link.moedaOrigem)||
  typeof link.valorOriginal!=='number'||!Number.isFinite(link.valorOriginal)||link.valorOriginal<=0)
  fail('FINANCE_LINK_INVALID');
 if(String(link.saleId)!==String(referenciaId)&&!['REVERSAL','RECEIPT'].includes(link.financeEventType))fail('FINANCE_LINK_SALE_MISMATCH');
 if(link.clienteId!=null&&String(link.clienteId)!==String(clienteId))fail('FINANCE_LINK_CUSTOMER_MISMATCH');
 if(link.lojaId!=null&&String(link.lojaId)!==String(lojaId))fail('FINANCE_LINK_TENANT_MISMATCH');
 if(link.financeEventType==='OBLIGATION'&&(!id(link.receivableId)||!id(link.installmentId)))
  fail('FINANCE_LINK_INSTALLMENT_REQUIRED');
 if(link.financeEventType==='RECEIPT'&&(!id(link.receivableId)||!id(link.installmentId)))
  fail('FINANCE_LINK_INSTALLMENT_REQUIRED');
 if(link.financeEventType==='REVERSAL'&&!id(link.reversalOf))fail('FINANCE_LINK_ORIGIN_REQUIRED');
 return {financeLinkVersion:2,financeEventType:link.financeEventType,
  saleId:link.saleId,lojaId:String(lojaId),clienteId:String(clienteId||''),
  paymentId:link.paymentId,sourceEventId:link.sourceEventId,
  receivableId:link.receivableId||null,installmentId:link.installmentId||null,
  moedaOrigem:link.moedaOrigem,valorOriginal:link.valorOriginal,
  statusLiquidacao:link.statusLiquidacao||'REGISTERED_UNVERIFIED',
  comprovanteId:link.comprovanteId||null,
  currencyEvidence:link.currencyEvidence||null,
  reversalOf:link.reversalOf||null,ledgerId:ledgerId||null};
}
/** Existing PDV creates one aggregated debt in the financial ledger.
 * This link documents that aggregate faithfully, without inventing installments.
 */
export function pdvCreditLink({vendaId,clienteId,lojaId,valorFiadoBRL,moedaDocumento,pagamentos}){
 if(!id(vendaId)||!id(String(clienteId||''))||!id(String(lojaId||''))||
    !Number.isFinite(valorFiadoBRL)||valorFiadoBRL<=0)fail('FINANCE_LINK_INVALID');
 const credits=(pagamentos||[]).filter(p=>p.formaId==='crediario');
 if(!credits.length)fail('FINANCE_LINK_INVALID');
 const obligationId=`VENDA-${vendaId}-FIADO`;
 return validateFinanceLink({financeLinkVersion:2,financeEventType:'OBLIGATION',
  saleId:vendaId,paymentId:obligationId,sourceEventId:obligationId,
  clienteId:String(clienteId),lojaId:String(lojaId),
  receivableId:`REC-${vendaId}`,installmentId:`INST-${vendaId}-AGGREGATE`,
  moedaOrigem:'BRL',valorOriginal:Number(valorFiadoBRL.toFixed(2)),
  statusLiquidacao:'DEBT_REGISTERED',currencyEvidence:{
   documentCurrency:moedaDocumento,originalCreditPayments:credits.map(p=>({
    paymentId:String(p.id),currency:p.moedaOrigem,amount:p.valorOriginal,amountBRL:p.valorConvertidoBRL,
    historicalRate:p.taxaCambioAplicada
   }))}}, {lojaId,referenciaId:vendaId,clienteId,ledgerId:obligationId});
}
export function pdvImmediatePaymentLink({vendaId,clienteId,lojaId,pagamento,ledgerId}){
 return validateFinanceLink({
  financeLinkVersion:2,financeEventType:'SALE_PAYMENT',saleId:vendaId,
  paymentId:ledgerId,sourceEventId:ledgerId,clienteId:clienteId||null,
  lojaId:String(lojaId),moedaOrigem:pagamento.moedaOrigem,
  valorOriginal:Number(pagamento.valorOriginal),
  statusLiquidacao:'REGISTERED_UNVERIFIED',
  currencyEvidence:{amountBRL:pagamento.valorConvertidoBRL,
   rateAtSale:pagamento.taxaCambioAplicada,method:pagamento.formaId}
 },{lojaId,referenciaId:vendaId,clienteId,ledgerId});
}
