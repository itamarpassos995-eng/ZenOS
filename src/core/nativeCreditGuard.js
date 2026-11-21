import {parseMoney} from './nativeMoneyKernel.js';
const MOEDAS=new Set(['BRL','USD','EUR','PYG']);
export function validarCapacidadeCreditoNativa(cliente,moeda,novoMinor){
 if(!cliente||!MOEDAS.has(moeda))return {ok:false,codigo:'NATIVE_CREDIT_INVALID_CUSTOMER_OR_CURRENCY'};
 const limite=cliente.limiteCreditoNativo;
 if(limite?.moeda!==moeda||limite?.valorMinor==null)return {ok:false,codigo:'NATIVE_CREDIT_LIMIT_UNVERIFIED'};
 let max,delta;
 try{max=BigInt(limite.valorMinor);delta=BigInt(novoMinor);}catch{return {ok:false,codigo:'NATIVE_CREDIT_INVALID_INTEGER'};}
 if(max<=0n||delta<=0n)return {ok:false,codigo:'NATIVE_CREDIT_INVALID_AMOUNT'};
 const titulos=cliente.titulosFiadoNativos||[];
 if(!Array.isArray(titulos))return {ok:false,codigo:'NATIVE_CREDIT_INVALID_TITLES'};
 let aberto=0n,contabil=0,ids=new Set();
 try{
  for(const t of titulos){
   if(t?.moeda!==moeda||!t.idVenda||ids.has(String(t.idVenda)))throw Error('Title mismatch');
   ids.add(String(t.idVenda));
   const total=parseMoney(String(t.valorOriginal),moeda);
   const saldo=parseMoney(String(t.saldoOriginal),moeda);
   if(BigInt(saldo)<0n||BigInt(saldo)>BigInt(total))throw Error('Invalid debt remainder');
   const saldoContabil=Number(t.saldoContabilBRL);
   if(!Number.isFinite(saldoContabil)||saldoContabil<0)throw Error('Invalid compatibility book');
   aberto+=BigInt(saldo);contabil+=saldoContabil;
  }
 }catch{return {ok:false,codigo:'NATIVE_CREDIT_TITLE_UNVERIFIED'};}
 // Legacy outstanding credit cannot be silently re-denominated.
 const livro=Number(cliente.saldoDevedorBRL||0);
 if(!Number.isFinite(livro)||livro<0||Math.abs(livro-contabil)>0.011)
  return {ok:false,codigo:'NATIVE_CREDIT_LEGACY_RECONCILIATION_REQUIRED'};
 if(aberto+delta>max)return {ok:false,codigo:'NATIVE_CREDIT_LIMIT_EXCEEDED',
   saldoAtualMinor:aberto.toString(),limiteMinor:max.toString()};
 return {ok:true,saldoAtualMinor:aberto.toString(),
  limiteMinor:max.toString(),saldoAposMinor:(aberto+delta).toString()};
}
