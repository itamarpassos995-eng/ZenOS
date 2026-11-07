/** ZenOS Distribution B.1: auditable, read-only financial-origin reconciliation.
 * Never changes a sale, receivable, cash session, customer balance or ledger.
 * RECONCILED means all source evidence is present and matched; it is NOT permission to refund.
 */
export const FINANCIAL_STATES=Object.freeze([
 'RECONCILIATION_REQUIRED','RECONCILING','RECONCILED','DISCREPANCY',
 'EXTERNAL_SETTLEMENT_PENDING','FX_EVIDENCE_REQUIRED','BLOCKED','STALE'
]);
const error=code=>{throw Object.assign(new Error(code),{code});};
const CURRENCIES={BRL:2,PYG:0,USD:2,EUR:2};
const required=(v,code)=>{if(!v)error(code);};
export const minor=(v,currency)=>{
 const p=CURRENCIES[currency];required(p!==undefined,'CURRENCY_INVALID');
 const m=String(v).match(/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/);
 required(m&&(!m[2]||m[2].length<=p),'ORIGINAL_AMOUNT_INVALID');
 return BigInt(m[1])*10n**BigInt(p)+BigInt((m[2]||'').padEnd(p,'0')||'0');
};
const money=(n,c)=>({currency:c,precision:CURRENCIES[c],minor:n.toString()});
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
export const canonicalFinancialSource=v=>JSON.stringify(sorted(v));
/** Only the source-sale payment record and corroborating ledger proof are considered.
 * Credit creation (venda_fiada) is an obligation, NOT receipt.
 * Missing installment-to-sale links are not reconstructed from customer balances.
 */
export function calculateFinancialOrigin({sale,adjustment,ledger=[],sourceComplete=false,policy=null}){
 required(sale&&adjustment&&Array.isArray(ledger),'RECONCILIATION_INPUT_INVALID');
 const currency=sale.moedaDocumento;
 required(CURRENCIES[currency]!==undefined&&adjustment.value?.currency===currency,'CURRENCY_MISMATCH');
 required(String(sale.id)===adjustment.saleId&&String(sale.clienteId)===adjustment.customerId,
  'SOURCE_REFERENCE_MISMATCH');
 const saleTotal=minor(sale.totalOriginal,currency);
 const adjusted=BigInt(adjustment.value.minor);
 required(adjusted>=0n&&adjusted<=saleTotal,'ADJUSTMENT_AMOUNT_INVALID');
 const issues=new Set(),observed=[],ids=new Set();
 let received=0n,open=0n,authorizedPending=0n;
 if(!sourceComplete)issues.add('SOURCE_PAGINATION_INCOMPLETE');
 if(sale.tipoDocumento!=='venda'||sale.estado!=='concluida')issues.add('SALE_NOT_FINALIZED');
 if(!Array.isArray(sale.pagamentos))issues.add('SALE_PAYMENTS_NOT_AVAILABLE');
 const salePayments=Array.isArray(sale.pagamentos)?sale.pagamentos:[];
 const byRef=new Map();
 for(const entry of ledger){
  if(!entry||typeof entry.id!=='string'||!entry.id||ids.has(entry.id)){
   issues.add('LEDGER_ID_DUPLICATED');continue;
  }
  ids.add(entry.id);
  if(String(entry.referenciaId)!==String(sale.id)||String(entry.clienteId)!==String(sale.clienteId)||
     (entry.lojaId!=null&&String(entry.lojaId)!==String(adjustment.tenantId))){
   issues.add('FOREIGN_LEDGER_RECORD');continue;
  }
  byRef.set(entry.id,entry);
 }
 const paymentIds=new Set();
 for(const p of salePayments){
  const pid=String(p?.id||p?.paymentId||'');
  const method=String(p?.formaId||'');
  if(!pid||paymentIds.has(pid)){issues.add('PAYMENT_ID_NOT_VERIFIED');continue;}
  paymentIds.add(pid);
  if(!method){issues.add('PAYMENT_METHOD_UNKNOWN');continue;}
  if(p.moedaOrigem!==currency){
   issues.add(CURRENCIES[p.moedaOrigem]!==undefined?'FX_EVIDENCE_REQUIRED':'PAYMENT_CURRENCY_UNKNOWN');
   observed.push({id:pid,method,currency:p.moedaOrigem||null,originAmount:p.valorOriginal??null,
    evidence:'FX_REVIEW_REQUIRED'});continue;
  }
  let amount;
  try{amount=minor(p.valorOriginal,currency);}catch{issues.add('PAYMENT_AMOUNT_UNVERIFIED');continue;}
  if(method==='crediario'){
   const backing=ledger.filter(e=>e.tipo==='venda_fiada'&&e.referenciaId===sale.id&&
    e.clienteId===sale.clienteId&&e.paymentId===pid);
   if(backing.length!==1){issues.add('RECEIVABLE_LINK_NOT_VERIFIED');continue;}
   open+=amount;
   observed.push({id:pid,method,currency,originMinor:amount.toString(),evidence:'DEBT_REGISTERED',
    ledgerId:backing[0].id});
   continue;
  }
  const matches=ledger.filter(e=>e.paymentId===pid&&e.referenciaId===sale.id&&
    e.clienteId===sale.clienteId&&e.tipo!=='venda_fiada');
  if(matches.length!==1){issues.add('PAYMENT_LEDGER_NOT_UNIQUE');continue;}
  const entry=matches[0];
  if(String(entry.moeda)!==currency){issues.add('PAYMENT_LEDGER_CURRENCY_MISMATCH');continue;}
  let ledgerAmount;
  try{ledgerAmount=minor(entry.valor,currency);}catch{issues.add('PAYMENT_LEDGER_AMOUNT_INVALID');continue;}
  if(ledgerAmount!==amount){issues.add('PAYMENT_LEDGER_AMOUNT_MISMATCH');continue;}
  if(['cancelado','estornado','rejeitado'].includes(entry.status)){
   issues.add('PAYMENT_CANCELLED_OR_REVERSED');continue;
  }
  // Existing financialLedgerCore does not include a guaranteed external liquidation flag.
  // Only explicit, backed settlement metadata can satisfy confirmation.
  if(entry.liquidacaoConfirmada!==true||!entry.comprovanteId||entry.status!=='liquidado'){
   authorizedPending+=amount;issues.add('EXTERNAL_SETTLEMENT_PENDING');
  }else{
   received+=amount;
  }
  observed.push({id:pid,method,currency,originMinor:amount.toString(),ledgerId:entry.id,
   evidence:entry.liquidacaoConfirmada===true&&entry.status==='liquidado'?'SETTLED':'PENDING'});
 }
 const accounted=received+open+authorizedPending;
 if(accounted!==saleTotal)issues.add('SALE_OBLIGATIONS_MISMATCH');
 // Later receivables, partial settlements or refunds without sale-specific linkage block confirmation.
 const unexpected=ledger.some(e=>e.tipo==='recebimento_fiado'||e.tipo==='devolucao'||
   e.tipo==='estorno'||e.tipo==='nota_credito');
 if(unexpected)issues.add('POST_SALE_MUTATIONS_REQUIRE_ALLOCATION');
 let state='RECONCILED';
 if(issues.has('FX_EVIDENCE_REQUIRED'))state='FX_EVIDENCE_REQUIRED';
 else if(issues.has('EXTERNAL_SETTLEMENT_PENDING'))state='EXTERNAL_SETTLEMENT_PENDING';
 else if([...issues].some(i=>/MISMATCH|DUPLICATED|FOREIGN|CANCELLED|REVERSED/.test(i)))state='DISCREPANCY';
 else if(issues.size)state='RECONCILIATION_REQUIRED';
 // No future compensation is approved here, even with a reconciled receipt.
 const eligible=state==='RECONCILED';
 const allocation=eligible&&policy?.id==='DEBT_FIRST_B1'&&policy.approved===true?
  {ruleId:policy.id,potentialOffset:money(open<adjusted?open:adjusted,currency),
   potentialRefund:money(adjusted-(open<adjusted?open:adjusted),currency)}:null;
 return {
  schema:1,saleId:sale.id,adjustmentId:adjustment.id,customerId:sale.clienteId,
  state,issues:[...issues].sort(),sourceComplete:Boolean(sourceComplete),
  saleTotal:money(saleTotal,currency),verifiedReceived:money(received,currency),
  verifiedOpen:eligible?money(open,currency):null,
  unconfirmedReceipts:money(authorizedPending,currency),adjustmentAmount:money(adjusted,currency),
  potential:allocation,financialExecution:'BLOCKED_B1',payments:observed,
  sourceIds:{saleId:sale.id,ledgerIds:[...ids].sort()},
 };
}
