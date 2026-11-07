/** Phase 3.1 B.2 — verified linkage overlay for financial ledger V2.
 * Data is obtained solely from persisted sale and original journal entries.
 * Explicit, versioned debt/instalment links are mandatory; never backfill guessed IDs.
 * Read-only, and never a financial authorization for Phase C.
 */
import {minor,canonicalFinancialSource} from './phase31Reconciliation.js';
const problem=c=>{throw Object.assign(new Error(c),{code:c});};
const valid=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(v);
const PRECISION={BRL:2,PYG:0,USD:2,EUR:2};
const m=(n,c)=>({currency:c,precision:PRECISION[c],minor:n.toString()});
const validMoney=(v,c)=>{try{return minor(v,c)}catch{problem('INVALID_ORIGINAL_MONEY')}};
const ADDITIVE=new Set(['RECEIPT','REVERSAL','COMPENSATION']);
const stateOf=e=>e.status==='liquidado'&&e.liquidacaoConfirmada===true&&valid(e.comprovanteId);
function fxOf(event,denomination){
 const c=event.moeda;
 if(!Object.hasOwn(PRECISION,c))problem('INVALID_ORIGINAL_CURRENCY');
 const native=validMoney(event.valor,c);
 if(c===denomination)return native;
 const fx=event.conversaoHistorica;
 if(!fx||fx.moedaOrigem!==c||fx.moedaDestino!==denomination||
    !valid(fx.comprovanteId)||!valid(fx.fonte)||!fx.data||
    typeof fx.valorAtribuido!=='string')problem('FX_EVIDENCE_REQUIRED');
 // Exact target amount was recorded with the financial entry at the original settlement.
 // Never recompute using current exchange rates.
 const assigned=validMoney(fx.valorAtribuido,denomination);
 if(!String(fx.taxa||'').match(/^[0-9]+(\.[0-9]+)?$/))problem('FX_EVIDENCE_REQUIRED');
 return assigned;
}
export function reconcileLinkedObligations({sale,adjustment,ledger=[],complete=true}) {
 if(!sale||!adjustment||!Array.isArray(ledger))problem('FINANCIAL_SOURCE_INVALID');
 const c=sale.moedaDocumento;
 if(!Object.hasOwn(PRECISION,c)||adjustment.value?.currency!==c||String(sale.id)!==adjustment.saleId||
    String(sale.clienteId)!==adjustment.customerId)problem('SOURCE_REFERENCE_MISMATCH');
 const issues=new Set(),byId=new Map(),installments=new Map(),seen=new Set();
 if(!complete)issues.add('SOURCE_PAGINATION_INCOMPLETE');
 const amount=validMoney(sale.totalOriginal,c),adjust=BigInt(adjustment.value.minor);
 let verifiedReceived=0n,previousCompensations=0n,externalPending=0n;
 for(const e of ledger){
  if(!e||!valid(e.id)||seen.has(e.id)){issues.add('DUPLICATE_LEDGER_EVENT');continue;}
  seen.add(e.id);
  if(String(e.referenciaId)!==String(sale.id)||String(e.clienteId)!==String(sale.clienteId)||
    (e.lojaId!=null&&String(e.lojaId)!==String(adjustment.tenantId))){
   issues.add('FOREIGN_FINANCIAL_EVENT');continue;
  }
  if(e.financeLinkVersion!==2||!valid(e.receivableId)||!valid(e.installmentId)||
     !['OBLIGATION','RECEIPT','REVERSAL','COMPENSATION'].includes(e.financeEventType)){
   issues.add('LEGACY_LINK_UNVERIFIED');continue;
  }
  if((e.financeEventType==='RECEIPT'||e.financeEventType==='REVERSAL'||e.financeEventType==='COMPENSATION')&&
    (!valid(e.paymentId)||!valid(e.sourceEventId))){
   issues.add('FINANCE_EVENT_ORIGIN_MISSING');continue;
  }
  byId.set(e.id,e);
 }
 const obligations=[...byId.values()].filter(e=>e.financeEventType==='OBLIGATION');
 for(const e of obligations){
  if(installments.has(e.installmentId)){issues.add('DUPLICATE_INSTALLMENT');continue;}
  let original;
  try{original=fxOf(e,c)}catch(err){issues.add(err.code);continue}
  if(original<=0n){issues.add('INVALID_OBLIGATION');continue}
  installments.set(e.installmentId,{id:e.installmentId,receivableId:e.receivableId,
   original,paid:0n,reverse:0n,compensated:0n,events:[e.id],state:'PENDING',dueAt:e.vencimento||null});
 }
 const receipts=new Map(),reversals=new Map(),reversalKeys=new Set(),usedIds=new Set();
 const entries=[...byId.values()].filter(e=>ADDITIVE.has(e.financeEventType))
   .sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||a.id.localeCompare(b.id));
 for(const e of entries){
  const target=installments.get(e.installmentId);
  if(!target||target.receivableId!==e.receivableId){issues.add('INSTALLMENT_LINK_NOT_VERIFIED');continue;}
  if(usedIds.has(e.paymentId)&&e.financeEventType==='RECEIPT'){issues.add('DUPLICATE_PAYMENT_ID');continue;}
  let value;
  try{value=fxOf(e,c)}catch(err){issues.add(err.code);continue}
  if(value<=0n){issues.add('FINANCE_AMOUNT_INVALID');continue}
  if(!stateOf(e)){externalPending+=value;issues.add('EXTERNAL_SETTLEMENT_PENDING');continue;}
  if(e.financeEventType==='RECEIPT'){
   usedIds.add(e.paymentId);receipts.set(e.id,{event:e,amount:value});
   target.paid+=value;target.events.push(e.id);
  }else if(e.financeEventType==='REVERSAL'){
   if(reversalKeys.has(e.sourceEventId)){issues.add('DUPLICATE_REVERSAL');continue;}
   reversalKeys.add(e.sourceEventId);
   const origin=receipts.get(e.sourceEventId);
   if(!origin||origin.event.installmentId!==e.installmentId||
      origin.event.receivableId!==e.receivableId){issues.add('REVERSAL_ORIGIN_MISSING');continue}
   const already=reversals.get(e.sourceEventId)||0n;
   if(already+value>origin.amount){issues.add('REVERSAL_EXCEEDS_RECEIPT');continue}
   reversals.set(e.sourceEventId,already+value);
   target.reverse+=value;target.events.push(e.id);
  }else{
   if(reversalKeys.has('comp:'+e.sourceEventId)){issues.add('DUPLICATE_COMPENSATION');continue;}
   reversalKeys.add('comp:'+e.sourceEventId);
   target.compensated+=value;previousCompensations+=value;target.events.push(e.id);
  }
 }
 let originalDebt=0n,openDebt=0n,receivedDebt=0n;
 const details=[];
 for(const v of installments.values()){
  const net=v.paid-v.reverse,remaining=v.original-net-v.compensated;
  if(net<0n||remaining<0n){issues.add('INSTALLMENT_OVERPAID_OR_REVERSED');continue}
  originalDebt+=v.original;receivedDebt+=net;openDebt+=remaining;
  details.push({id:v.id,receivableId:v.receivableId,dueAt:v.dueAt,
   original:m(v.original,c),received:m(net,c),compensated:m(v.compensated,c),
   outstanding:m(remaining,c),sourceEventIds:v.events,
   state:remaining===0n?'PAID':net>0n?'PARTIALLY_PAID':'OPEN'});
 }
 if(installments.size===0)issues.add('RECEIVABLE_LINK_NOT_VERIFIED');
 // This overlay handles full-credit sales only. Mixed immediate payment/fiado
 // needs separately proven payment allocation — no shortcut via customer balance.
 if(originalDebt!==amount)issues.add('SALE_OBLIGATIONS_MISMATCH');
 if(previousCompensations>adjust)issues.add('PRIOR_COMPENSATION_REVIEW_REQUIRED');
 if(ledger.length!==seen.size)issues.add('DUPLICATE_LEDGER_EVENT');
 const confirmed=issues.size===0;
 return {
  schema:2,state:confirmed?'RECONCILED':issues.has('FX_EVIDENCE_REQUIRED')?'FX_EVIDENCE_REQUIRED':
   issues.has('EXTERNAL_SETTLEMENT_PENDING')?'EXTERNAL_SETTLEMENT_PENDING':'RECONCILIATION_REQUIRED',
  issues:[...issues].sort(),installments:details,
  saleTotal:m(amount,c),
  verifiedReceived:m(receivedDebt,c),
  verifiedOpen:confirmed?m(openDebt,c):null,
  previousCompensations:m(previousCompensations,c),
  unconfirmedReceipts:m(externalPending,c),
  adjustmentAmount:m(adjust,c),
  payments:entries.map(e=>({id:e.id,installmentId:e.installmentId,kind:e.financeEventType,
   currency:e.moeda,amount:String(e.valor),status:e.status})),
  potential:null,financialExecution:'BLOCKED_B2',
  sourceIds:{saleId:String(sale.id),ledgerIds:[...seen].sort()},
  eligibility:{schema:'FinancialCompensationEligibilityV1',executable:false,
   sourceDigest:canonicalFinancialSource({saleId:sale.id,ledgerIds:[...seen].sort()}),
   preconditions:confirmed?['FINANCIAL_SOURCE_REVALIDATION_REQUIRED','FISCAL_APPROVAL_REQUIRED']:
    [...issues].sort()},
 };
}
