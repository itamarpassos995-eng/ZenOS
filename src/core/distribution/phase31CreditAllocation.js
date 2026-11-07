/** B.4: deterministic allocation of an ACTUAL native client receipt to verified
 * credit obligations. Values in BRL cents; FX remains in the receipt's
 * original historical evidence. Does not prove external bank settlement.
 */
const reject=code=>{throw Object.assign(new Error(code),{code});};
const cents=v=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<=0||
  Math.abs(v*100-Math.round(v*100))>0.000001)reject('CREDIT_ALLOCATION_AMOUNT_INVALID');
 return Math.round(v*100);
};
const key=v=>typeof v==='string'&&/^[A-Za-z0-9._:-]{1,120}$/.test(v);
export const creditObligationForSale=sale=>{
 if(!sale||!key(String(sale.id||''))||sale.financeCreditV2?.schema!==1)
  reject('CREDIT_SOURCE_UNVERIFIED');
 const x=sale.financeCreditV2;
 // A prior commercial return may already have reduced the client's debt.
 // Without an allocated reversal, never reuse the original credit face value.
 if(Array.isArray(sale.devolucoes)&&sale.devolucoes.length)
  reject('CREDIT_PRIOR_RETURN_REVIEW_REQUIRED');
 const owed=cents(x.originalBRL);
 const source=(sale.pagamentos||[]).filter(p=>p.formaId==='crediario')
  .reduce((n,p)=>n+Math.round(Number(p.valorConvertidoBRL||0)*100),0);
 if(owed!==source||x.receivableId!==`REC-${sale.id}`)
  reject('CREDIT_SOURCE_MISMATCH');
 const installments=x.installments;
 if(!Array.isArray(installments)||installments.length===0||installments.length>80)
  reject('CREDIT_INSTALLMENT_SOURCE_MISSING');
 let issued=0;const used=new Set();
 for(const inst of installments){
  if(!key(inst.id)||used.has(inst.id))reject('CREDIT_INSTALLMENT_DUPLICATE');
  used.add(inst.id);issued+=cents(inst.amountBRL);
 }
 if(issued!==owed)reject('CREDIT_INSTALLMENT_SUM_MISMATCH');
 return {owed,installments};
};
export function prepareVerifiedCreditAllocations({sales=[],clientId,receiptId,receivedBRL,allocations=[]}){
 if(!key(String(clientId||''))||!key(String(receiptId||''))||
   !Array.isArray(sales)||!Array.isArray(allocations)||
   !allocations.length||allocations.length>40)reject('CREDIT_ALLOCATION_INPUT_INVALID');
 const amount=cents(receivedBRL),bySale=new Map(),used=new Set();
 for(const sale of sales){
  if(String(sale.clienteId)!==String(clientId))continue;
  if(bySale.has(String(sale.id)))reject('CREDIT_SALE_DUPLICATED');
  bySale.set(String(sale.id),sale);
 }
 let total=0;const pending=new Map(),items=[];
 for(const row of allocations){
  const id=String(row.saleId||''),inst=String(row.installmentId||'');
  if(!key(id)||!key(inst)||used.has(id+':'+inst))reject('CREDIT_ALLOCATION_DUPLICATE');
  used.add(id+':'+inst);
  const sale=bySale.get(id);
  if(!sale)reject('CREDIT_ALLOCATION_SALE_NOT_OWNED');
  const {installments}=creditObligationForSale(sale);
  if(!installments.some(i=>i.id===inst))reject('CREDIT_ALLOCATION_INSTALLMENT_UNKNOWN');
  const portion=cents(row.amountBRL);
  total+=portion;
  const item={saleId:id,installmentId:inst,amountBRL:portion/100,
   amountBRLCents:String(portion)};
  items.push(item);
  const old=pending.get(id)||[];old.push(item);pending.set(id,old);
 }
 if(total!==amount)reject('CREDIT_ALLOCATION_PAYMENT_SUM_MISMATCH');
 const patches=[];
 for(const [id,rows] of pending){
  const sale=bySale.get(id),{installments}=creditObligationForSale(sale);
  const existing=Array.isArray(sale.creditAllocationsV2)?sale.creditAllocationsV2:[];
  const seen=new Set(),booked=new Map();
  for(const old of existing){
   if(!key(old.receiptId)||seen.has(old.receiptId))reject('CREDIT_SOURCE_ALLOCATION_CORRUPT');
   seen.add(old.receiptId);
   if(!Array.isArray(old.allocations))reject('CREDIT_SOURCE_ALLOCATION_CORRUPT');
   for(const p of old.allocations){
    if(!installments.some(i=>i.id===p.installmentId))reject('CREDIT_SOURCE_ALLOCATION_CORRUPT');
    booked.set(p.installmentId,(booked.get(p.installmentId)||0)+cents(p.amountBRL));
   }
  }
  if(seen.has(receiptId))reject('CREDIT_ALLOCATION_REPLAY_CONFLICT');
  for(const row of rows)booked.set(row.installmentId,(booked.get(row.installmentId)||0)+cents(row.amountBRL));
  for(const installment of installments)if((booked.get(installment.id)||0)>cents(installment.amountBRL))
   reject('CREDIT_INSTALLMENT_CAPACITY_EXCEEDED');
  patches.push({saleId:id,
   previousAllocationSnapshot:existing,
   nextSale:{...sale,creditAllocationsV2:[...existing,{
    receiptId,recordedAtState:'REGISTERED_UNVERIFIED',allocations:rows
   }]}
  });
 }
 return {schema:1,clientId:String(clientId),receiptId,
  receivedBRLCents:String(amount),allocations:items,patches,
  eligibleForExecution:false,externalSettlement:'UNVERIFIED'};
}
