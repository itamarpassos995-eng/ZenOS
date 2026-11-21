import {parseMoney,formatMoneyMinor} from './nativeMoneyKernel.js';

const OPTIONS={
 BRL:{locale:'pt-BR',symbol:'R$',digits:2},
 PYG:{locale:'es-PY',symbol:'₲',digits:0},
 USD:{locale:'en-US',symbol:'US$',digits:2},
 EUR:{locale:'de-DE',symbol:'€',digits:2},
};
const check=code=>{if(!Object.hasOwn(OPTIONS,code))throw Error('Moeda não suportada: '+String(code));return OPTIONS[code];};
const separated=(whole,locale)=>new Intl.NumberFormat(locale,{maximumFractionDigits:0,useGrouping:true}).format(BigInt(whole));
/** Format integer minor units without any FX or JS floating-point arithmetic. */
export function formatNativeMinor(minor,currency){
 const cfg=check(currency),decimal=formatMoneyMinor(minor,currency);
 const negative=decimal.startsWith('-');
 const [whole,fraction='']=decimal.replace(/^-/, '').split('.');
 const body=separated(whole,cfg.locale)+(cfg.digits===0?'':(currency==='EUR'?',':currency==='BRL'?',':'.')+fraction);
 return (negative?'-':'')+cfg.symbol+' '+body;
}
export function formatNativeDecimal(amount,currency){
 check(currency);
 return formatNativeMinor(parseMoney(String(amount),currency),currency);
}
/** A legacy BRL amount has no verified PYG/USD currency. Never relabel it. */
export function formatVerifiedOrPending(valueMinor,currency,pendingLabel='Em conciliação'){
 return valueMinor==null?pendingLabel:formatNativeMinor(valueMinor,currency);
}
export function nativeCreditLimitMinor(client,storeCurrency){
 check(storeCurrency);
 const verified=client?.limiteCreditoNativo;
 if(verified?.moeda===storeCurrency&&verified.valorMinor!=null){
  try{
   const minor=BigInt(verified.valorMinor);
   return minor>=0n?minor.toString():null;
  }catch{return null;}
 }
 // Explicit legacy BRL values may be read as BRL only for BRL-native shops.
 if(storeCurrency==='BRL'&&Number.isFinite(Number(client?.limiteCreditoBRL))&&
    Number(client?.limiteCreditoBRL)>=0)
  return parseMoney(Number(client.limiteCreditoBRL).toFixed(2),'BRL');
 return null;
}

/** Symbols follow the currency explicitly requested; never infer from a BRL accounting field. */
export function nativeCurrencySymbol(currency){return check(currency).symbol;}
