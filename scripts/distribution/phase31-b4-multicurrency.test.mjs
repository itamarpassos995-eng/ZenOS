// B.4 G3 read-only reconciliation scenarios. All "liquidado" events below
// are synthetic evidence fixtures; no bank integration or authorization occurs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileLinkedObligations} from '../../src/core/distribution/phase31FinancialLinks.js';
const scenario=({currency='PYG',face=1000000,receiptCurrency=currency,
  receiptValue=200000,attributed=200000,fx=true,settled=true})=>{
 const sale={id:'SALE-G3',clienteId:'C1',moedaDocumento:currency,
  totalOriginal:face,tipoDocumento:'venda',estado:'concluida',
  pagamentos:[{formaId:'crediario',moedaOrigem:currency,valorOriginal:face}]};
 const adjustment={id:'ADJ-G3',tenantId:'TENANT',saleId:'SALE-G3',
  customerId:'C1',value:{currency,minor:String(currency==='PYG'?10000:1000)}};
 const obligation={id:'DEBT-G3',lojaId:'TENANT',referenciaId:'SALE-G3',
  clienteId:'C1',financeLinkVersion:2,financeEventType:'OBLIGATION',
  receivableId:'REC-G3',installmentId:'INST-G3',moeda:currency,
  valor:face,createdAt:'2026-11-01'};
 const receipt={...obligation,id:'PAY-G3',financeEventType:'RECEIPT',
  paymentId:'PAY-G3',sourceEventId:'DEBT-G3',
  moeda:receiptCurrency,valor:receiptValue,createdAt:'2026-11-02',
  status:settled?'liquidado':'registrado',liquidacaoConfirmada:settled,
  comprovanteId:settled?'PAY-EVIDENCE-G3':null};
 if(receiptCurrency!==currency&&fx)receipt.conversaoHistorica={
  moedaOrigem:receiptCurrency,moedaDestino:currency,
  valorAtribuido:String(attributed),taxa:'1234.56',fonte:'SYNTHETIC-HISTORICAL',
  data:'2026-11-02',comprovanteId:'FX-EVIDENCE-G3'};
 const run=(entries=[obligation,receipt])=>reconcileLinkedObligations({
  sale,adjustment,ledger:entries,complete:true});
 return {sale,adjustment,obligation,receipt,run};
};
test('G3 PYG original settlement remains PYG without conversion',()=>{
 const x=scenario({});
 const r=x.run();
 assert.equal(r.state,'RECONCILED');
 assert.equal(r.verifiedReceived.currency,'PYG');
 assert.equal(r.verifiedReceived.minor,'200000');
 assert.equal(r.eligibility.executable,false);
});
test('G3 documented BRL original payment uses historical PYG assignment only',()=>{
 const x=scenario({receiptCurrency:'BRL',receiptValue:'150.00',
  attributed:200000});
 const r=x.run();
 assert.equal(r.state,'RECONCILED');
 assert.equal(r.verifiedReceived.minor,'200000');
 assert.equal(r.financialExecution,'BLOCKED_B2');
});
test('G3 BRL sale and USD payment require exact original evidence',()=>{
 const x=scenario({currency:'BRL',face:1000,receiptCurrency:'USD',
  receiptValue:'40.00',attributed:'220.00'});
 const r=x.run();
 assert.equal(r.state,'RECONCILED');
 assert.equal(r.verifiedReceived.minor,'22000');
 assert.equal(r.eligibility.executable,false);
});
test('G3 EUR sale and USD payment preserve EUR denomination and original proof',()=>{
 const x=scenario({currency:'EUR',face:1000,receiptCurrency:'USD',
  receiptValue:'100.00',attributed:'91.50'});
 const r=x.run();
 assert.equal(r.state,'RECONCILED');
 assert.equal(r.verifiedReceived.currency,'EUR');
 assert.equal(r.verifiedReceived.minor,'9150');
});
test('G3 missing historical FX fails closed, never converts at current rate',()=>{
 const x=scenario({receiptCurrency:'BRL',receiptValue:'150.00',fx:false});
 const r=x.run();
 assert.equal(r.state,'FX_EVIDENCE_REQUIRED');
 assert.equal(r.verifiedOpen,null);
 assert.equal(r.eligibility.executable,false);
});
test('G3 missing external settlement confirmation cannot be treated as paid',()=>{
 const x=scenario({settled:false});
 const r=x.run();
 assert.equal(r.state,'EXTERNAL_SETTLEMENT_PENDING');
 assert.equal(r.verifiedOpen,null);
 assert.equal(r.eligibility.executable,false);
});
test('G3 mixed immediate payment and credit cannot be silently allocated',()=>{
 const x=scenario({});
 const mixed={...x.sale,pagamentos:[
  {formaId:'crediario',moedaOrigem:'PYG',valorOriginal:800000},
  {formaId:'dinheiro_pyg',moedaOrigem:'PYG',valorOriginal:200000}]};
 const r=reconcileLinkedObligations({sale:mixed,adjustment:x.adjustment,
  ledger:[x.obligation,x.receipt],complete:true});
 assert.ok(r.issues.includes('MIXED_PAYMENT_ALLOCATION_REQUIRED'));
 assert.equal(r.eligibility.executable,false);
});
test('G3 mismatched FX origin and unsupported currency fail closed',()=>{
 const x=scenario({receiptCurrency:'BRL',receiptValue:'150.00'});
 const invalid={...x.receipt,conversaoHistorica:{
  ...x.receipt.conversaoHistorica,moedaOrigem:'USD'}};
 const r=x.run([x.obligation,invalid]);
 assert.equal(r.state,'FX_EVIDENCE_REQUIRED');
 assert.equal(r.eligibility.executable,false);
 const unsupported={...x.receipt,moeda:'XYZ'};
 const bad=x.run([x.obligation,unsupported]);
 assert.ok(bad.issues.includes('INVALID_ORIGINAL_CURRENCY'));
 assert.equal(bad.eligibility.executable,false);
});
