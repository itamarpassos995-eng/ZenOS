/** Distribution Phase 3.1 B — commercial adjustment draft domain.
 * Pure immutable calculations; never issues fiscal documents or mutates money, debt, stock.
 * Fiscal types are INTERNAL CANDIDATES ONLY, not legal validation or provider payloads.
 */
export const ADJUSTMENT_SCHEMA=1;
export const ADJUSTMENT_STATUS=Object.freeze({
 DRAFT:['COMMERCIAL_REVIEW','CANCELLED'],
 COMMERCIAL_REVIEW:['FISCAL_REVIEW','REJECTED','DRAFT'],
 FISCAL_REVIEW:['LEGAL_REVIEW_REQUIRED','REJECTED','COMMERCIAL_REVIEW'],
 LEGAL_REVIEW_REQUIRED:['REJECTED','COMMERCIAL_REVIEW','INTERNALLY_REVIEWED'],
 INTERNALLY_REVIEWED:[],
 REJECTED:[],
 CANCELLED:[]
});
export const ADJUSTMENT_TYPES=Object.freeze([
 'TOTAL_RETURN','PARTIAL_RETURN','SHORTAGE','DAMAGED','TOTAL_REFUSAL',
 'PARTIAL_REFUSAL','WRONG_PRODUCT','REPLACEMENT','REPLENISHMENT',
 'POST_SALE_DISCOUNT','INVOICE_DELIVERY_MISMATCH'
]);
export const FISCAL_CANDIDATES=Object.freeze({
 PY:Object.freeze(['NOTA_CREDITO_ELECTRONICA','NOTA_REMISION_ELECTRONICA','CANCELAMENTO_REQUEST']),
 BR:Object.freeze(['NFE_DEVOLUCAO','NFE_ENTRADA','NFE_NOTA_CREDITO','CANCELAMENTO_REQUEST'])
});
export const INTERNAL_FISCAL_WARNING=Object.freeze({
 pt:'DOCUMENTO INTERNO — SEM VALIDADE FISCAL',
 es:'DOCUMENTO INTERNO — SIN VALIDEZ FISCAL'
});
const check=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
const precise=Object.freeze({BRL:2,PYG:0,USD:2,EUR:2});
const digits=v=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v);
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const clone=v=>structuredClone(v);
export function moneyMinor(value,currency) {
 const precision=precise[currency];
 check(precision!==undefined,'INVALID_CURRENCY');
 const m=String(value).match(/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/);
 check(!!m,'ORIGINAL_MONEY_UNVERIFIED');
 const fraction=m[2]||'';
 check(fraction.length<=precision,'ORIGINAL_PRECISION_AMBIGUOUS');
 return BigInt(m[1])*10n**BigInt(precision)+BigInt((fraction||'').padEnd(precision,'0')||'0');
}
export function moneySnapshot(currency,minor) {
 check(precise[currency]!==undefined&&typeof minor==='bigint'&&minor>=0n,'INVALID_MONEY');
 return frozen({currency,precision:precise[currency],minor:minor.toString()});
}
export function allocateOriginalLine({sale,lineIndex,quantity}) {
 const currency=sale?.moedaDocumento,precision=precise[currency];
 check(precision!==undefined&&Array.isArray(sale?.itens)&&sale.itens.length>0,'ORIGINAL_SALE_INVALID');
 check(Number.isSafeInteger(lineIndex)&&lineIndex>=0&&lineIndex<sale.itens.length,'SOURCE_LINE_INVALID');
 const weights=sale.itens.map(item=>{
  check(Number.isSafeInteger(Number(item.qtd))&&Number(item.qtd)>0,'ORIGINAL_QUANTITY_INVALID');
  if(item.totalBRL!=null)return moneyMinor(item.totalBRL,'BRL');
  check(item.precoPraticadoBRL!=null,'ORIGINAL_PRICE_UNVERIFIED');
  return moneyMinor(item.precoPraticadoBRL,'BRL')*BigInt(item.qtd);
 });
 const sum=weights.reduce((a,b)=>a+b,0n);check(sum>0n,'ORIGINAL_PRICE_UNVERIFIED');
 const total=moneyMinor(sale.totalOriginal,currency);
 const before=weights.slice(0,lineIndex).reduce((a,b)=>a+b,0n);
 const lineTotal=(total*(before+weights[lineIndex])/sum)-(total*before/sum);
 const originalQuantity=Number(sale.itens[lineIndex].qtd);
 check(Number.isSafeInteger(quantity)&&quantity>0&&quantity<=originalQuantity,'ADJUSTMENT_QUANTITY_EXCEEDED');
 // Cumulative floor boundaries guarantee exact additivity and no overstatement.
 const slice=lineTotal*BigInt(quantity)/BigInt(originalQuantity);
 return frozen({currency,precision,minor:slice.toString(),lineOriginalMinor:lineTotal.toString(),
  originalQuantity,quantity,originalDocumentMinor:total.toString(),calculation:'SOURCE_DOCUMENT_WEIGHTED_ALLOCATION_V1'});
}
export function makeCommercialDraft({id,tenantId,establishmentId,occurrence,sale,type,quantity,actorId,at,
 fiscalCandidate=null,financialSnapshot=null,sourceClient=null}) {
 check([id,tenantId,establishmentId,actorId].every(validId)&&Number.isFinite(Date.parse(at)),'ADJUSTMENT_ID_INVALID');
 check(occurrence?.tenantId===tenantId&&occurrence?.establishmentId===establishmentId&&
  occurrence.states?.logistics==='CONFIRMED'&&occurrence.states?.financial!=='SETTLED','OCCURRENCE_NOT_CONFIRMED');
 check(ADJUSTMENT_TYPES.includes(type),'ADJUSTMENT_TYPE_INVALID');
 check(['BR','PY'].includes(occurrence.country),'FISCAL_COUNTRY_NOT_CONFIGURED');
 check(fiscalCandidate===null||FISCAL_CANDIDATES[occurrence.country].includes(fiscalCandidate),'FISCAL_TYPE_COUNTRY_MISMATCH');
 check(occurrence.refs?.saleId===String(sale?.id)&&occurrence.refs?.customerId===String(sale?.clienteId),'SOURCE_REFERENCE_MISMATCH');
 check(['venda','pre_pedido'].includes(sale.tipoDocumento),'SOURCE_SALE_INVALID');
 check(Number.isSafeInteger(quantity)&&quantity>0&&quantity<=occurrence.quantity,'ADJUSTMENT_QUANTITY_EXCEEDED');
 const lineIndex=Number(occurrence.refs.orderLineId);
 const value=allocateOriginalLine({sale,lineIndex,quantity});
 const originalSource=occurrence.fiscalOriginal?.verified===true?clone(occurrence.fiscalOriginal):null;
 const line=sale.itens[lineIndex];
 check(String(line.produtoOriginalId??line.id)===occurrence.refs.productId,'SOURCE_PRODUCT_MISMATCH');
 const unitPrice=line.precoPraticadoBRL==null?null:String(line.precoPraticadoBRL);
 const discount=line.descontoOriginal??line.desconto??null;
 const tax=line.tributosOriginais??null;
 const proposal={
  schema:ADJUSTMENT_SCHEMA,id,tenantId,establishmentId,country:occurrence.country,
  occurrenceId:occurrence.id,factId:occurrence.factId,sourceKind:occurrence.sourceKind,
  saleId:String(sale.id),customerId:String(sale.clienteId),
  orderLineId:String(lineIndex),productId:String(line.produtoOriginalId??line.id),
  type,quantity,originalQuantity:value.originalQuantity,
  value:moneySnapshot(value.currency,BigInt(value.minor)),
  lineOriginalValue:moneySnapshot(value.currency,BigInt(value.lineOriginalMinor)),
  pricingMethod:value.calculation,
  originalPriceBRL:unitPrice,originalDiscountSnapshot:discount,originalTaxSnapshot:tax,
  originalExchangeRates:clone(sale.taxasCambio??null),
  saleDocumentTotal:moneySnapshot(value.currency,BigInt(value.originalDocumentMinor)),
  documentOrigin:originalSource,
  fiscalCandidate:fiscalCandidate||null,
  fiscalEligibility:'LEGAL_REVIEW_REQUIRED',
  fiscalDocument:{status:'INTERNAL_DRAFT_ONLY',authorized:false,transmitted:false,providerProtocol:null},
  financialPreview:financialSnapshot??{state:'RECONCILIATION_REQUIRED',received:null,outstanding:null,
    possibleCredit:null,possibleRefund:null},
  customerName:sourceClient?.nome??sale.clienteNome??null,
  status:'DRAFT',createdAt:at,createdBy:actorId,revision:0,
  history:[{eventId:'CREATED:'+id,actorId,at,from:null,to:'DRAFT',reason:'COMMERCIAL_DRAFT_CREATED'}]
 };
 return frozen(proposal);
}
export function transitionCommercialDraft(draft,{eventId,actorId,next,at,reason,expectedRevision}) {
 check(draft?.schema===ADJUSTMENT_SCHEMA&&validId(draft.tenantId),'ADJUSTMENT_INVALID');
 check([eventId,actorId].every(validId)&&Number.isFinite(Date.parse(at))&&typeof reason==='string'&&
  reason.trim().length>=5&&reason.length<=500,'ADJUSTMENT_EVENT_INVALID');
 check(draft.revision===expectedRevision,'REVISION_CONFLICT');
 check(ADJUSTMENT_STATUS[draft.status]?.includes(next),'ADJUSTMENT_TRANSITION_FORBIDDEN');
 check(!draft.history.some(e=>e.eventId===eventId),'DUPLICATE_EVENT');
 // No transition ever sets fiscal authorization, a financial settlement or inventory effect.
 const updated=clone(draft),from=updated.status;
 updated.status=next;updated.revision+=1;
 updated.history.push({eventId,actorId,at,from,to:next,reason});
 return frozen(updated);
}
export function internalAdjustmentRepresentation(snapshot,language='pt') {
 check(snapshot?.schema===ADJUSTMENT_SCHEMA&&['pt','es'].includes(language),'ADJUSTMENT_INVALID');
 return frozen({warning:INTERNAL_FISCAL_WARNING[language],kind:'INTERNAL_COMMERCIAL_ADJUSTMENT',
  id:snapshot.id,version:snapshot.revision+1,at:snapshot.createdAt,country:snapshot.country,
  tenantId:snapshot.tenantId,establishmentId:snapshot.establishmentId,
  customerId:snapshot.customerId,customerName:snapshot.customerName,
  saleId:snapshot.saleId,occurrenceId:snapshot.occurrenceId,
  sourceDocument:snapshot.documentOrigin,type:snapshot.type,
  quantity:snapshot.quantity,productId:snapshot.productId,
  value:clone(snapshot.value),status:snapshot.status,createdBy:snapshot.createdBy,
  approvedByFiscalAuthority:false});
}
