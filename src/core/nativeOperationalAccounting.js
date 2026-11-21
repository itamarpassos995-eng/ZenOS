import {createNativeContract,parseMoney,convertMinorDirect,sumNative,prepareIncomingPayment,settleNativeDebt} from './nativeMoneyKernel.js';
const units={BRL:100,USD:100,EUR:100,PYG:1};
const positiveInt=(n,label)=>{
 if(!Number.isSafeInteger(n)||n<0)throw Error(label+' must be a nonnegative safe integer');
 return BigInt(n);
};
const asBig=(v,label)=>{
 if(typeof v==='string'&&/^-?\d+$/.test(v))return BigInt(v);
 if(typeof v==='number'&&Number.isSafeInteger(v))return BigInt(v);
 if(typeof v==='bigint')return v;
 throw Error(label+' must be minor-unit integer');
};
const assertCurrency=c=>{if(!Object.hasOwn(units,c))throw Error('Invalid currency');return c;};
export function calculateNativeCart({storeCurrency,items=[],discountMinor='0'}){
 assertCurrency(storeCurrency);
 let subtotal=0n;
 for(const item of items){
  if(item.currency!==storeCurrency)throw Error('Item price is not in store contractual currency');
  const unitPrice=asBig(item.priceMinor,'Unit price'),quantity=positiveInt(item.quantity,'Quantity');
  if(unitPrice<0n)throw Error('Negative product price');
  subtotal+=unitPrice*quantity;
 }
 const discount=asBig(discountMinor,'Discount');
 if(discount<0n||discount>subtotal)throw Error('Invalid native discount');
 return Object.freeze({currency:storeCurrency,subtotalMinor:subtotal.toString(),discountMinor:discount.toString(),
  totalMinor:(subtotal-discount).toString()});
}
export function applyNativePayments({saleId,storeCurrency,totalMinor,payments=[],rates}){
 const contract=createNativeContract({id:saleId,storeCurrency,amountMinor:totalMinor});
 const events=payments.map((p,i)=>prepareIncomingPayment({
  paymentId:p.id??(String(saleId)+':'+i),storeCurrency,paymentCurrency:p.currency,
  receivedMinor:p.receivedMinor,rates:p.ratesSnapshot??rates,at:p.receivedAt,
 }));
 const settled=settleNativeDebt({debt:contract,paidEvents:events});
 return {sale:contract,events,settled};
}
/** Physical drawers are independent; settlement in the default currency is a distinct book. */
export function summarizeNativeCash({storeCurrency,opening={},events=[]}){
 assertCurrency(storeCurrency);
 const drawer=Object.fromEntries(Object.keys(units).map(code=>[code,0n]));
 for(const [code,v] of Object.entries(opening)){
  assertCurrency(code);drawer[code]+=asBig(v,'Opening cash');
 }
 let credited=0n;
 const ids=new Set();
 for(const event of events){
  if(!event.id||ids.has(String(event.id)))throw Error('Duplicate cash event ID');
  ids.add(String(event.id));
  if(event.currency!==storeCurrency)throw Error('Event belongs to another store currency');
  assertCurrency(event.paymentCurrency);
  const direction=event.direction==='out'?-1n:event.direction==='in'||!event.direction?1n:null;
  if(direction===null)throw Error('Invalid cash event direction');
  const received=asBig(event.receivedMinor,'Physical amount');
  const creditedValue=asBig(event.creditedMinor,'Credited value');
  if(received<0n||creditedValue<0n)throw Error('Negative cash event');
  if(event.physical!==false)drawer[event.paymentCurrency]+=received*direction;
  credited+=creditedValue*direction;
 }
 return Object.freeze({currency:storeCurrency,
  creditedMinor:credited.toString(),
  physicalByCurrency:Object.fromEntries(Object.entries(drawer).map(([k,v])=>[k,v.toString()])),
  physicalWarnings:Object.entries(drawer).filter(([,v])=>v<0n).map(([k])=>k)});
}
export function quoteDisplayOnly({nativeAmountMinor,nativeCurrency,targetCurrency,rates}){
 const convertedMinor=convertMinorDirect(nativeAmountMinor,nativeCurrency,targetCurrency,rates);
 return Object.freeze({currency:targetCurrency,amountMinor:convertedMinor,informativeOnly:true});
}
