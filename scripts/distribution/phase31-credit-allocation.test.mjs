import test from 'node:test';
import assert from 'node:assert/strict';
import {creditObligationForSale,prepareVerifiedCreditAllocations} from '../../src/core/distribution/phase31CreditAllocation.js';
import {validateFinanceLink,nativeReturnLineageLink} from '../../src/core/distribution/phase31NativeFinanceLinks.js';
const sale=(id,amount)=>({
 id,clienteId:'C1',tipoDocumento:'venda',estado:'concluida',
 pagamentos:[{formaId:'crediario',valorConvertidoBRL:amount}],
 financeCreditV2:{schema:1,receivableId:`REC-${id}`,originalBRL:amount,
  installments:[{id:`INST-${id}-AGGREGATE`,amountBRL:amount,kind:'AGGREGATE_NO_SCHEDULE'}]},
 creditAllocationsV2:[]
});
const plan=(sales,lines,amount=500)=>prepareVerifiedCreditAllocations({
 sales,clientId:'C1',receiptId:'REC-1234',receivedBRL:amount,allocations:lines
});
test('B4 distributes one actual receipt across two owned sales without duplicate ledger revenue',()=>{
 const a=sale('SA',350),b=sale('SB',220);
 const p=plan([a,b],[{saleId:'SA',installmentId:'INST-SA-AGGREGATE',amountBRL:300},
  {saleId:'SB',installmentId:'INST-SB-AGGREGATE',amountBRL:200}]);
 assert.equal(p.receivedBRLCents,'50000');
 assert.equal(p.patches.length,2);
 assert.equal(p.patches[0].nextSale.creditAllocationsV2[0].receiptId,'REC-1234');
 assert.equal(p.eligibleForExecution,false);
 assert.equal(p.externalSettlement,'UNVERIFIED');
});
test('B4 blocks over-allocation, wrongly allocated sum and cross-client source',()=>{
 const a=sale('SA',300),b=sale('SB',200),lines=[{saleId:'SA',installmentId:'INST-SA-AGGREGATE',amountBRL:350}];
 assert.throws(()=>plan([a,b],lines,350),{code:'CREDIT_INSTALLMENT_CAPACITY_EXCEEDED'});
 assert.throws(()=>plan([a,b],[{saleId:'SA',installmentId:'INST-SA-AGGREGATE',amountBRL:300}],500),
  {code:'CREDIT_ALLOCATION_PAYMENT_SUM_MISMATCH'});
 assert.throws(()=>plan([{...a,clienteId:'C2'}],[{saleId:'SA',installmentId:'INST-SA-AGGREGATE',amountBRL:300}],300),
  {code:'CREDIT_ALLOCATION_SALE_NOT_OWNED'});
});
test('B4 refuses forged credit contracts, stale receipts and duplicate installment allocations',()=>{
 const a=sale('SA',300);
 assert.throws(()=>creditObligationForSale({...a,financeCreditV2:{...a.financeCreditV2,originalBRL:999}}),
  {code:'CREDIT_SOURCE_MISMATCH'});
 const line={saleId:'SA',installmentId:'INST-SA-AGGREGATE',amountBRL:100};
 assert.throws(()=>plan([a],[line,line],200),{code:'CREDIT_ALLOCATION_DUPLICATE'});
 assert.throws(()=>plan([{...a,creditAllocationsV2:[{receiptId:'REC-1234',allocations:[line]}]}],[line],100),
  {code:'CREDIT_ALLOCATION_REPLAY_CONFLICT'});
});
test('B4 ledger stores one receipt with two verifiable allocations and never sets settlement',()=>{
 const items=[{saleId:'SA',installmentId:'INST-SA-AGGREGATE',amountBRL:300},
  {saleId:'SB',installmentId:'INST-SB-AGGREGATE',amountBRL:200}];
 const x=validateFinanceLink({financeLinkVersion:2,financeEventType:'RECEIPT',
  saleId:'SA',paymentId:'REC-1234',sourceEventId:'VENDA-SA-FIADO',
  receivableId:'REC-SA',installmentId:'INST-SA-AGGREGATE',clienteId:'C1',lojaId:'T1',
  moedaOrigem:'BRL',valorOriginal:500,statusLiquidacao:'REGISTERED_UNVERIFIED',
  currencyEvidence:{valorAtribuidoBRL:500},allocations:items,saleIds:['SA','SB']
 },{lojaId:'T1',referenciaId:'REC-1234',clienteId:'C1',ledgerId:'REC-1234'});
 assert.deepEqual(x.allocations,items);assert.deepEqual(x.saleIds,['SA','SB']);
 assert.equal(x.statusLiquidacao,'REGISTERED_UNVERIFIED');
 assert.throws(()=>validateFinanceLink({...x,currencyEvidence:{valorAtribuidoBRL:499}},
  {lojaId:'T1',referenciaId:'REC-1234',clienteId:'C1'}),{code:'FINANCE_ALLOCATION_TOTAL_MISMATCH'});
});
test('B4 native return lineage is a historical return record, not a bank-verified reversal',()=>{
 const x=nativeReturnLineageLink({saleId:'S1',returnId:'D1',clientId:'C1',
  tenantId:'T1',amountBRL:100,method:'credito_fiado',operatorId:'admin'});
 assert.equal(x.financeEventType,'RETURN_RECORDED');
 assert.equal(x.statusLiquidacao,'REGISTERED_UNVERIFIED');
 assert.equal(x.sourceEventId,'D1');
 assert.equal(x.saleId,'S1');
});

test('B4 refuses to allocate further debt when earlier refund modified credit without a proven reversal',()=>{
 const a={...sale('SA',300),devolucoes:[{id:'D1',valorBRL:50,metodoReembolso:'credito_fiado'}]};
 assert.throws(()=>plan([a],[{saleId:'SA',installmentId:'INST-SA-AGGREGATE',amountBRL:100}],100),
  {code:'CREDIT_PRIOR_RETURN_REVIEW_REQUIRED'});
});
