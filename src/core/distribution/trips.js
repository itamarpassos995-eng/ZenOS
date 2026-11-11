/** Shared exact-native-money and delivery contracts. No cross-currency implicit totals. */
export const TRIP_SCHEMA=1;
export const CURRENCIES=Object.freeze({BRL:2,PYG:0,USD:2,EUR:2});
export function tripError(code){throw Object.assign(new Error(code),{code});}
export function units(value,min=0){if(!Number.isSafeInteger(value)||value<min)tripError('INVALID_QUANTITY');return value;}
export function nativeMinor(value,currency){const precision=CURRENCIES[currency];if(precision===undefined)tripError('INVALID_PAYMENT');const m=String(value).match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);if(!m||(m[2]||'').length>precision)tripError('INVALID_PAYMENT');const n=BigInt(m[1])*10n**BigInt(precision)+BigInt((m[2]||'').padEnd(precision,'0')||0);if(n>BigInt(Number.MAX_SAFE_INTEGER))tripError('INVALID_PAYMENT');return Number(n);}
export function originalValue(minor,currency){return units(minor)/10**CURRENCIES[currency];}
export function paymentCents(minor,currency,rate){units(minor);const m=String(rate).match(/^(\d+)(?:\.(\d{1,12}))?$/);if(!m)tripError('PAYMENT_RATE_REQUIRED');const rn=BigInt(m[1]+(m[2]||''));if(!rn)tripError('PAYMENT_RATE_REQUIRED');const numerator=BigInt(minor)*100n*10n**BigInt((m[2]||'').length),denominator=10n**BigInt(CURRENCIES[currency])*rn;const result=Number((numerator*2n+denominator)/(denominator*2n));return units(result);}
// Preserve a native amount only for fully financed sales with reconciled historical FX.
export function pygCreditSnapshot({currency, totalOriginal, totalCentsBRL, creditCentsBRL, rate}){
 if(currency!=='PYG'||!Number.isSafeInteger(totalOriginal)||totalOriginal<=0||
  !Number.isSafeInteger(creditCentsBRL)||creditCentsBRL<=0||creditCentsBRL!==totalCentsBRL)return null;
 try{
  if(paymentCents(totalOriginal,'PYG',rate)!==creditCentsBRL)return null;
 }catch{return null;}
 return {currency:'PYG',amountMinor:totalOriginal,historicalRate:String(rate)};
}
export function custodyTotals(receipts){const totals={};for(const r of receipts||[])if(!r.voided){totals[r.currency]=(totals[r.currency]||0)+r.minor;units(totals[r.currency]);}return totals;}
export function deliveryQuantities(line,delivered,condition){units(delivered);if(delivered>line.quantity||!['GOOD','DAMAGED'].includes(condition))tripError('INVALID_DELIVERY');return {delivered,returning:line.quantity-delivered,condition};}
export function validateSignature(strokes){if(!Array.isArray(strokes)||!strokes.length||strokes.length>20||strokes.reduce((n,s)=>n+(Array.isArray(s)?s.length:10000),0)>600)tripError('SIGNATURE_REQUIRED');for(const stroke of strokes){if(!Array.isArray(stroke)||stroke.length<2)tripError('SIGNATURE_REQUIRED');for(const p of stroke)if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1))tripError('SIGNATURE_REQUIRED');}return strokes;}

export function hasPendingTripReturnFinance(trip, nativePygCashEnabled){
 return trip.stops.some(stop=>stop.lines.some(line=>line.returning>line.refunded&&
  !(nativePygCashEnabled&&line.pygCompensation?.active&&line.returnChecked&&line.returning===line.customerReturned&&
    line.pygCompensation.restitutionPendingMinor===0)));
}
