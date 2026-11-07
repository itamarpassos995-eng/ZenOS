import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileLinkedObligations} from '../../src/core/distribution/phase31FinancialLinks.js';
const sale={id:'O001',clienteId:'C1',moedaDocumento:'PYG',totalOriginal:1000000,
 tipoDocumento:'venda',estado:'concluida'};
const adjustment={id:'ADJ1',tenantId:'tenant',establishmentId:'store1',saleId:'O001',
 customerId:'C1',value:{currency:'PYG',minor:'250000'}};
const obligation={id:'DEBT1',financeLinkVersion:2,financeEventType:'OBLIGATION',
 receivableId:'DEBT-A',installmentId:'INST1',lojaId:'tenant',
 referenciaId:'O001',clienteId:'C1',moeda:'PYG',valor:1000000,createdAt:'2026-11-01T00:00:00Z'};
const receipt=(id,amount,date)=>({...obligation,id,financeEventType:'RECEIPT',paymentId:id,
 sourceEventId:'DEBT1',moeda:'PYG',valor:amount,createdAt:date,status:'liquidado',
 liquidacaoConfirmada:true,comprovanteId:'PROOF-'+id});
const report=(ledger,params={})=>reconcileLinkedObligations({sale,adjustment,ledger,complete:true,...params});
test('B2 three verified partial receipts reconcile 450000 paid, 550000 open',()=>{
 const r=report([obligation,receipt('R1',200000,'2026-11-02'),
  receipt('R2',150000,'2026-11-03'),receipt('R3',100000,'2026-11-04')]);
 assert.equal(r.state,'RECONCILED');
 assert.equal(r.verifiedReceived.minor,'450000');
 assert.equal(r.verifiedOpen.minor,'550000');
 assert.equal(r.installments[0].state,'PARTIALLY_PAID');
 assert.equal(r.financialExecution,'BLOCKED_B2');
 assert.equal(r.eligibility.executable,false);
});
test('B2 two legitimate partial reversals of same payment adjust net receipt',()=>{
 const rev=(id,amount)=>({...receipt(id,amount,'2026-11-05'),financeEventType:'REVERSAL',
  sourceEventId:'R1',paymentId:id});
 const r=report([obligation,receipt('R1',200000,'2026-11-02'),
  rev('REV1',50000),rev('REV2',25000)]);
 assert.equal(r.state,'RECONCILED');
 assert.equal(r.verifiedReceived.minor,'125000');assert.equal(r.verifiedOpen.minor,'875000');
 const invalid=report([obligation,receipt('R1',200000,'2026-11-02'),rev('REV3',250000)]);
 assert.ok(invalid.issues.includes('REVERSAL_EXCEEDS_RECEIPT'));
});
test('B2 independently proven BRL payment applies historical PYG allocation, not current FX',()=>{
 const fx={...receipt('R1',200,'2026-11-02'),moeda:'BRL',valor:'150.00',
  conversaoHistorica:{moedaOrigem:'BRL',moedaDestino:'PYG',valorAtribuido:'200000',
   comprovanteId:'FX1',fonte:'FX-SETTLEMENT',data:'2026-11-02',taxa:'1333.333333'}};
 const r=report([obligation,fx]);
 assert.equal(r.state,'RECONCILED');assert.equal(r.verifiedReceived.minor,'200000');
 const missing=report([obligation,{...fx,conversaoHistorica:null}]);
 assert.equal(missing.state,'FX_EVIDENCE_REQUIRED');
 assert.equal(missing.verifiedOpen,null);
});
test('B2 legacy unmatched, foreign, duplicate and non-liquidated links fail closed',()=>{
 const good=receipt('R1',200000,'2026-11-02');
 assert.ok(report([obligation,good,{...good,id:'LEGACY',financeLinkVersion:1}]).issues.includes('LEGACY_LINK_UNVERIFIED'));
 assert.ok(report([obligation,good,{...good,id:'FOREIGN',lojaId:'another'}]).issues.includes('FOREIGN_FINANCIAL_EVENT'));
 assert.ok(report([obligation,good,{...good,id:'R2',paymentId:'R1'}]).issues.includes('DUPLICATE_PAYMENT_ID'));
 assert.equal(report([obligation,{...good,liquidacaoConfirmada:false}]).state,'EXTERNAL_SETTLEMENT_PENDING');
 assert.ok(report([obligation,good],{complete:false}).issues.includes('SOURCE_PAGINATION_INCOMPLETE'));
});
test('B2 id and customer mismatches cannot reconcile with other sale',()=>{
 const b={...obligation,id:'DEBT-OTHER',referenciaId:'O999'};
 assert.ok(report([obligation,b]).issues.includes('FOREIGN_FINANCIAL_EVENT'));
 assert.throws(()=>report([obligation],{adjustment:{...adjustment,saleId:'O999'}}),{code:'SOURCE_REFERENCE_MISMATCH'});
});
