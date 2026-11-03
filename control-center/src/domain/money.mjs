export const currencies=['BRL','PYG','USD','EUR'];
export function money(value,{positive=false}={}){
 const s=String(value??'');if(!/^\d{1,14}(\.\d{1,4})?$/.test(s))throw Error('INVALID_AMOUNT');
 const [whole,fraction='']=s.split('.');const n=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
 if(positive&&n<=0n)throw Error('INVALID_AMOUNT');return n;
}
export const decimal=n=>`${n/10000n}.${String(n%10000n).padStart(4,'0')}`;
export function currency(value){if(!currencies.includes(value))throw Error('INVALID_CURRENCY');return value;}
