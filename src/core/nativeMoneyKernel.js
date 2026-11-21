/**
 * ZenOS - Native money kernel V2.
 * Every contractual sum is in the store's sovereign currency.
 * Exchange quotes are units of each currency per one common QUOTE UNIT;
 * the quote unit is only a denomination for the rates, never an intermediate
 * transaction amount. Exactly one rational conversion and one final rounding.
 *
 * Input monetary quantities MUST be integer minor units (prefer decimal strings)
 * and never JS floats representing money. BRL/USD/EUR = 100; PYG = 1.
 */
const UNITS = Object.freeze({BRL:100,USD:100,EUR:100,PYG:1});
const assertCurrency = c => {
  if (!Object.hasOwn(UNITS,c)) throw Error('Unsupported currency: '+String(c));
  return c;
};
const asBigInt = (v,label) => {
  if(typeof v==='bigint') return v;
  if(typeof v==='string' && /^-?\d+$/.test(v)) return BigInt(v);
  if(typeof v==='number' && Number.isSafeInteger(v)) return BigInt(v);
  throw Error(label+' must be an integer minor-unit amount');
};
function decimalRational(value,label) {
  const s=String(value);
  const match=/^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(s);
  if(!match)throw Error(label+' must be a positive decimal rate');
  const p=BigInt(match[1]+(match[2]||'')),q=10n**BigInt((match[2]||'').length);
  if(p<=0n)throw Error(label+' must be positive');
  return {p,q};
}
function divideRounded(n,d) {
  if(d<=0n)throw Error('Invalid exchange denominator');
  const sign=n<0n?-1n:1n,abs=n<0n?-n:n;
  return sign*((abs+d/2n)/d);
}
function quoteRate(code,rates) {
  assertCurrency(code);
  // Rate convention: how many currency units for 1 BRL reference unit.
  // Even when the store is USD or PYG, BRL is NEVER an amount calculation step.
  return code==='BRL'?{p:1n,q:1n}:decimalRational(rates?.[code],'Exchange rate '+code);
}
export function parseMoney(value,code) {
  assertCurrency(code);
  const s=String(value);
  if(!/^-?(0|[1-9]\d*)(?:\.\d+)?$/.test(s))throw Error('Invalid monetary decimal');
  const neg=s.startsWith('-'),str=neg?s.slice(1):s;
  const [whole,fraction='']=str.split('.');
  const digits=code==='PYG'?0:2;
  if(fraction.length>digits)throw Error('Invalid fraction for '+code);
  const minor=BigInt(whole)*BigInt(UNITS[code])+BigInt((fraction.padEnd(digits,'0'))||'0');
  return (neg?-minor:minor).toString();
}
export function formatMoneyMinor(amount,code) {
  assertCurrency(code);
  const n=asBigInt(amount,'Amount'),negative=n<0n,abs=negative?-n:n;
  const unit=BigInt(UNITS[code]),whole=abs/unit,dec=abs%unit;
  return (negative?'-':'')+whole.toString()+(code==='PYG'?'':'.'+dec.toString().padStart(2,'0'));
}
/**
 * One-step conversion: sourceMinor * sourceUnit^{-1} * targetUnit
 * * quoteTarget / quoteSource. No BRL amount is ever computed or rounded.
 */
export function convertMinorDirect(amountMinor,source,target,rates) {
  assertCurrency(source);assertCurrency(target);
  const amount=asBigInt(amountMinor,'Amount');
  if(source===target)return amount.toString();
  const s=quoteRate(source,rates),t=quoteRate(target,rates);
  const numerator=amount*BigInt(UNITS[target])*t.p*s.q;
  const denominator=BigInt(UNITS[source])*t.q*s.p;
  return divideRounded(numerator,denominator).toString();
}
export function createNativeContract({storeCurrency,amountMinor,id}) {
  assertCurrency(storeCurrency);
  const amount=asBigInt(amountMinor,'Contract');
  if(amount<0n)throw Error('Negative native contract');
  if(!id)throw Error('Missing contract ID');
  return Object.freeze({id:String(id),currency:storeCurrency,amountMinor:amount.toString()});
}
export function sumNative(contracts,storeCurrency) {
  assertCurrency(storeCurrency);
  let total=0n;
  for(const item of contracts){
    if(item?.currency!==storeCurrency)throw Error('Mixed contractual currencies cannot be summed');
    total+=asBigInt(item.amountMinor??item.creditedMinor,'Native amount');
  }
  return total.toString();
}
/**
 * Cash events retain the physical incoming amount and the amount applied to
 * the STORE contract, frozen with the full rate snapshot. Values are strings
 * to avoid JSON/Firestore BigInt serialisation problems.
 */
export function prepareIncomingPayment({paymentId,storeCurrency,paymentCurrency,receivedMinor,rates,at}) {
  if(!paymentId)throw Error('Missing idempotency key');
  assertCurrency(storeCurrency);assertCurrency(paymentCurrency);
  const received=asBigInt(receivedMinor,'Received amount');
  if(received<=0n)throw Error('Received amount must be positive');
  const credited=convertMinorDirect(receivedMinor,paymentCurrency,storeCurrency,rates);
  if(BigInt(credited)<=0n)throw Error('Payment rounds to zero in store currency');
  const s=quoteRate(paymentCurrency,rates),t=quoteRate(storeCurrency,rates);
  return Object.freeze({
    id:String(paymentId),currency:storeCurrency,
    paymentCurrency,receivedMinor:received.toString(),
    creditedMinor:credited,
    frozenRate:{paymentPerReference:s.p.toString()+'/'+s.q.toString(),
      storePerReference:t.p.toString()+'/'+t.q.toString(),
      rateConvention:'currency units per reference unit'},
    recordedAt:at||null,
  });
}
export function settleNativeDebt({debt,paidEvents}) {
  const outstanding=asBigInt(debt?.amountMinor,'Native debt');
  if(outstanding<0n)throw Error('Negative native debt');
  const paid=sumNative(paidEvents,debt.currency);
  if(BigInt(paid)>outstanding)throw Error('Payment exceeds native debt');
  return {currency:debt.currency,originalMinor:outstanding.toString(),
    appliedMinor:paid,outstandingMinor:(outstanding-BigInt(paid)).toString()};
}
