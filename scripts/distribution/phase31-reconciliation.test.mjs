import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateFinancialOrigin,minor,canonicalFinancialSource} from '../../src/core/distribution/phase31Reconciliation.js';
const sale=(currency='PYG')=>({id:'O001',clienteId:'C1',tipoDocumento:'venda',
 estado:'concluida',moedaDocumento:currency,totalOriginal:currency==='PYG'?500000:500,
 pagamentos:[{id:'PAY1',formaId:'dinheiro_pyg',moedaOrigem:currency,
  valorOriginal:currency==='PYG'?500000:500}]});
const adjustment=(currency='PYG')=>({id:'ADJ1',tenantId:'tenant',saleId:'O001',customerId:'C1',
 value:{currency,minor:currency==='PYG'?'250000':'25000'}});
const receipt=(currency='PYG')=>({id:'LED1',lojaId:'tenant',referenciaId:'O001',clienteId:'C1',
 paymentId:'PAY1',tipo:'recebimento_venda',status:'liquidado',liquidacaoConfirmada:true,
 comprovanteId:'PROOF1',moeda:currency,valor:currency==='PYG'?500000:500});
const calc=(opts={})=>calculateFinancialOrigin({sale:sale(),adjustment:adjustment(),
 ledger:[receipt()],sourceComplete:true,...opts});
test('B1 explicit same-currency verified ledger receipt reconciles without moving money',()=>{
 const a=calc();assert.equal(a.state,'RECONCILED');
 assert.equal(a.verifiedReceived.minor,'500000');assert.equal(a.verifiedOpen.minor,'0');
 assert.equal(a.financialExecution,'BLOCKED_B1');assert.equal(a.potential,null);
});
test('B1 card authorization without liquidation remains pending',()=>{
 const p=sale();p.pagamentos[0].formaId='cartao_pyg';
 const e={...receipt(),status:'autorizado',liquidacaoConfirmada:false,comprovanteId:null};
 const a=calc({sale:p,ledger:[e]});
 assert.equal(a.state,'EXTERNAL_SETTLEMENT_PENDING');assert.equal(a.verifiedOpen,null);
 assert.equal(a.unconfirmedReceipts.minor,'500000');
});
test('B1 credit issuance does not prove current open debt or any refund',()=>{
 const p=sale();p.pagamentos=[{id:'PAY1',formaId:'crediario',moedaOrigem:'PYG',valorOriginal:500000}];
 const e={...receipt(),tipo:'venda_fiada',status:'aberto',liquidacaoConfirmada:false};
 const a=calc({sale:p,ledger:[e]});
 assert.equal(a.state,'RECONCILIATION_REQUIRED');
 assert.equal(a.verifiedOpen,null);
 assert.ok(a.issues.includes('RECEIVABLE_CURRENT_BALANCE_NOT_VERIFIED'));
});
test('B1 missing FX snapshot does not use default/current exchange rate',()=>{
 const p=sale();p.pagamentos=[{id:'PAY1',formaId:'cartao_brl',moedaOrigem:'BRL',valorOriginal:120}];
 const a=calc({sale:p,ledger:[]});
 assert.equal(a.state,'FX_EVIDENCE_REQUIRED');
 assert.equal(a.verifiedReceived.minor,'0');
 assert.equal(a.verifiedOpen,null);
});
test('B1 cancelled/duplicated/foreign ledger and cross-sale id are blocked',()=>{
 assert.equal(calc({ledger:[receipt(),receipt()]}).state,'DISCREPANCY');
 assert.equal(calc({ledger:[{...receipt(),status:'cancelado'}]}).state,'DISCREPANCY');
 const foreign=calc({ledger:[{...receipt(),lojaId:'another'}]});
 assert.equal(foreign.state,'DISCREPANCY');
 assert.throws(()=>calc({adjustment:{...adjustment(),saleId:'other'}}),{code:'SOURCE_REFERENCE_MISMATCH'});
});
test('B1 unrelated extra sale ledger event cannot be silently ignored',()=>{
 const extra={...receipt(),id:'LED2',paymentId:'UNLINKED',status:'liquidado'};
 const report=calc({ledger:[receipt(),extra]});
 assert.equal(report.state,'DISCREPANCY');
 assert.ok(report.issues.includes('UNATTRIBUTED_LEDGER_RECORD'));
});
test('B1 source completeness and mutation require new verification',()=>{
 const a=calc({sourceComplete:false});
 assert.equal(a.state,'RECONCILIATION_REQUIRED');
 assert.notEqual(canonicalFinancialSource({a:1,b:2}),canonicalFinancialSource({a:1,b:3}));
 assert.equal(minor('39990','PYG'),39990n);
 assert.throws(()=>minor('39.99','PYG'),{code:'ORIGINAL_AMOUNT_INVALID'});
});
