import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateOriginalLine,makeCommercialDraft,transitionCommercialDraft,internalAdjustmentRepresentation,moneyMinor} from '../../src/core/distribution/phase31Commercial.js';
const sale={id:'O001',tipoDocumento:'venda',clienteId:'C1',moedaDocumento:'PYG',totalOriginal:199950,
 itens:[{id:'P1',qtd:5,totalBRL:150,precoPraticadoBRL:30}],taxasCambio:{BRL:1,PYG:1333}};
const occurrence={id:'OCC1',tenantId:'tenant',establishmentId:'store',country:'PY',
 quantity:3,impactKind:'PHYSICAL',sourceKind:'MANUAL',factId:'fact1',
 refs:{saleId:'O001',customerId:'C1',orderLineId:'0',productId:'P1'},
 states:{logistics:'CONFIRMED',fiscal:'NOT_REQUESTED',financial:'NOT_REQUESTED'},
 fiscalOriginal:{verified:true,id:'INV1',country:'PY',reference:'CDC1'}};
const arg={id:'ADJ1',tenantId:'tenant',establishmentId:'store',occurrence,sale,
 type:'PARTIAL_RETURN',quantity:2,actorId:'admin',at:'2026-11-07T04:00:00Z',
 fiscalCandidate:'NOTA_CREDITO_ELECTRONICA'};
test('historical weights, original exchange rates, PYG allocation and no float conversion',()=>{
 const d=makeCommercialDraft(arg);
 assert.equal(d.value.minor,'79980');assert.equal(d.value.currency,'PYG');
 assert.equal(d.originalExchangeRates.PYG,1333);
 assert.equal(d.originalPriceBRL,'30');assert.equal(d.financialPreview.state,'RECONCILIATION_REQUIRED');
 assert.equal(d.fiscalDocument.authorized,false);assert.equal(d.fiscalDocument.transmitted,false);
 assert.ok(Object.isFrozen(d));
});
test('allocations operate with original BRL, USD, EUR and precise minor units',()=>{
 for(const [currency,total,digits] of [['BRL',150,2],['USD',10,2],['EUR',25,2]]){
  const a=allocateOriginalLine({sale:{...sale,moedaDocumento:currency,totalOriginal:total},lineIndex:0,quantity:2});
  assert.equal(a.currency,currency);assert.equal(a.precision,digits);
  assert.equal(BigInt(a.minor),moneyMinor(total,currency)*2n/5n);
 }
 assert.throws(()=>moneyMinor('1.25','PYG'),{code:'ORIGINAL_PRECISION_AMBIGUOUS'});
});
test('invalid fiscal candidates, customer mismatch and unsupported amount are denied',()=>{
 assert.throws(()=>makeCommercialDraft({...arg,fiscalCandidate:'NFE_DEVOLUCAO'}),{code:'FISCAL_TYPE_COUNTRY_MISMATCH'});
 assert.throws(()=>makeCommercialDraft({...arg,sale:{...sale,clienteId:'another'}}),{code:'SOURCE_REFERENCE_MISMATCH'});
 assert.throws(()=>makeCommercialDraft({...arg,quantity:4}),{code:'ADJUSTMENT_QUANTITY_EXCEEDED'});
});
test('internal revisions never grant fiscal authorization, debt settlement or stock change',()=>{
 const start=makeCommercialDraft(arg);
 const next=transitionCommercialDraft(start,{eventId:'EV1',actorId:'admin',next:'COMMERCIAL_REVIEW',
  at:'2026-11-07T04:10:00Z',reason:'Conferência por operador',expectedRevision:0});
 assert.equal(next.revision,1);assert.equal(start.revision,0);
 assert.equal(next.fiscalDocument.authorized,false);
 assert.equal(next.financialPreview.state,'RECONCILIATION_REQUIRED');
 const print=internalAdjustmentRepresentation(start,'es');
 assert.equal(print.warning,'DOCUMENTO INTERNO — SIN VALIDEZ FISCAL');
 assert.equal(print.approvedByFiscalAuthority,false);
 assert.throws(()=>transitionCommercialDraft(next,{eventId:'EV2',actorId:'admin',next:'INTERNALLY_REVIEWED',
  at:'2026-11-07T04:10:00Z',reason:'Sem parecer legal',expectedRevision:1}),{code:'ADJUSTMENT_TRANSITION_FORBIDDEN'});
});
