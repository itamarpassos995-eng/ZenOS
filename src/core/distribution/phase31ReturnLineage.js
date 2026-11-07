/** Phase B.4 — non-destructive reconciliation of historical ZenOS refunds.
 * VERIFIED means only the internal return and journal entry agree. External
 * bank/card settlement and fiscal authorization are never implied.
 */
const fail=c=>{throw Object.assign(new Error(c),{code:c});};
const cents=n=>Number.isFinite(Number(n))&&Number(n)>=0?
 Math.round(Number(n)*100):null;
const key=s=>typeof s==='string'&&s.length>0&&s.length<=120;
const classification=(status,reason,source={})=>({status,reason,...source,
 externalSettlement:'UNVERIFIED',eligibleForExecution:false});
/** Read-only capacity check. Missing historical quantities never become proof. */
function auditReturnCapacity(sale,returns){
 if(!returns.length||!Array.isArray(sale.itens)||!sale.itens.length)
  return {verified:false,reason:'RETURN_QUANTITY_SOURCE_MISSING'};
 const sold=new Map(),used=new Map();
 for(const item of sale.itens){
  const id=String(item?.id||''),qty=Number(item?.qtd);
  if(!key(id)||sold.has(id)||!Number.isFinite(qty)||qty<=0)
   return {verified:false,reason:'RETURN_QUANTITY_SOURCE_INVALID'};
  sold.set(id,qty);
 }
 let sum=0;
 for(const r of returns){
  if(!Array.isArray(r.itens)||!r.itens.length)
   return {verified:false,reason:'RETURN_QUANTITY_EVIDENCE_MISSING'};
  const amount=cents(r.valorBRL);
  if(amount===null||amount<=0)return {verified:false,reason:'RETURN_VALUE_INVALID',conflict:true};
  sum+=amount;
  for(const line of r.itens){
   const id=String(line?.itemVendaId||''),qty=Number(line?.quantidade);
   if(!sold.has(id)||!Number.isFinite(qty)||qty<=0)
    return {verified:false,reason:'RETURN_QUANTITY_SOURCE_MISMATCH',conflict:true};
   used.set(id,(used.get(id)||0)+qty);
   if(used.get(id)>sold.get(id)+1e-9)
    return {verified:false,reason:'RETURN_QUANTITY_EXCEEDED',conflict:true};
  }
 }
 const gross=cents(sale.totalBRL);
 if(gross!==null&&gross>0&&sum>gross)
  return {verified:false,reason:'RETURN_VALUE_EXCEEDED',conflict:true};
 for(const item of sale.itens){
  if(item.qtdDevolvida==null)return {verified:false,reason:'RETURN_QUANTITY_SNAPSHOT_MISSING'};
  const qty=Number(item.qtdDevolvida);
  if(!Number.isFinite(qty)||Math.abs(qty-(used.get(String(item.id))||0))>1e-9)
   return {verified:false,reason:'RETURN_QUANTITY_SNAPSHOT_MISMATCH',conflict:true};
 }
 return {verified:true,reason:'RETURN_CAPACITY_MATCHED'};
}
export function classifySaleReturnHistory({sale,ledger=[],tenantId}){
 if(!sale||!key(String(sale.id))||!Array.isArray(ledger)||!key(String(tenantId)))
  fail('RETURN_AUDIT_INPUT_INVALID');
 const returns=Array.isArray(sale.devolucoes)?sale.devolucoes:[];
 const seenReturns=new Set(),journalById=new Map(),seenEvents=new Set(),duplicateEvents=new Set();
 for(const e of ledger){
  if(!e?.id)continue;
  if(seenEvents.has(String(e.id))){duplicateEvents.add(String(e.id));continue;}
  seenEvents.add(String(e.id));
  if(e.tipo!=='devolucao')continue;
  const id=String(e.id);journalById.set(id,e);
 }
 const items=[],usedJournal=new Set();
 for(const r of returns){
  const sourceId=String(r.id||'');
  if(!key(sourceId)||seenReturns.has(sourceId)){
   items.push(classification('CONFLICT','DUPLICATE_OR_MISSING_RETURN_ID',{returnId:sourceId}));continue;
  }
  seenReturns.add(sourceId);
  const journalId='DEVOLUCAO-'+sourceId,entry=journalById.get(journalId);
  const summary={returnId:sourceId,ledgerId:entry?.id||null,saleId:String(sale.id)};
  if(!entry){items.push(classification('UNVERIFIED','JOURNAL_MISSING',summary));continue;}
  usedJournal.add(journalId);
  if(duplicateEvents.has(journalId)){
   items.push(classification('CONFLICT','DUPLICATE_RETURN_JOURNAL',summary));continue;
  }
  if(String(entry.lojaId)!==String(tenantId)||
    String(entry.clienteId||'')!==String(sale.clienteId||'')||
    String(entry.detalhes?.vendaId||entry.financeLink?.saleId||'')!==String(sale.id)||
    String(entry.referenciaId)!==sourceId){
   items.push(classification('CONFLICT','RETURN_SOURCE_MISMATCH',summary));continue;
  }
  const x=cents(entry.valor),y=cents(r.valorBRL);
  if(x===null||y===null||x!==y||x===0){
   items.push(classification('CONFLICT','RETURN_VALUE_MISMATCH',summary));continue;
  }
  if(entry.financeLink&&
    (entry.financeLink.saleId!==String(sale.id)||entry.financeLink.financeEventType!=='RETURN_RECORDED')){
   items.push(classification('CONFLICT','RETURN_LINK_INCONSISTENT',summary));continue;
  }
  const confirmedInternal=entry._v2?.commandId&&entry._v2?.sequence>0;
  items.push(classification(confirmedInternal?'VERIFIED':'PARTIAL_EVIDENCE',
   confirmedInternal?'INTERNAL_V2_ATOMIC_RECORD':'LEGACY_INTERNAL_LEDGER_ONLY',
   {...summary,originalBRLCents:String(x),method:r.metodoReembolso||null,
    commandId:entry._v2?.commandId||null}));
 }
 for(const [ledgerId,e] of journalById){
  if(usedJournal.has(ledgerId))continue;
  if(String(e.detalhes?.vendaId||e.financeLink?.saleId||'')!==String(sale.id))continue;
  items.push(classification('CONFLICT','ORPHAN_RETURN_JOURNAL',{
   returnId:String(e.referenciaId||''),ledgerId,saleId:String(sale.id)}));
 }
 const capacity=auditReturnCapacity(sale,returns);
 if(capacity.conflict)items.push(classification('CONFLICT',capacity.reason,{saleId:String(sale.id)}));
 const anyConflict=items.some(i=>i.status==='CONFLICT');
 const anyIncomplete=items.some(i=>i.status!=='VERIFIED');
 return {schema:'DistributionReturnLineageV1',saleId:String(sale.id),
  classification:anyConflict?'CONFLICT':anyIncomplete?'PARTIAL_EVIDENCE':'VERIFIED',
  items,eligibleForExecution:false,
  limitsVerified:capacity.verified&&!anyIncomplete&&items.length>0,
  limitEvidence:capacity.reason,
  externalSettlement:'UNVERIFIED'};
}
