import {parseMoney,formatMoneyMinor,convertMinorDirect,prepareIncomingPayment} from './nativeMoneyKernel.js';
import {calculateNativeCart} from './nativeOperationalAccounting.js';
import {legacyPYGMinor} from './vipeLegacyNative.js';

const CURRENCIES=new Set(['BRL','PYG','USD','EUR']);
const requireCurrency=m=>{if(!CURRENCIES.has(m))throw Error('Moeda inválida: '+String(m));return m;};
const amountDecimal=(value,currency)=>{
 requireCurrency(currency);
 let amount=String(value??'').trim();
 // Older PYG drafts may contain 0.00; this is an integer, not guarani cents.
 if(currency==='PYG' && /^-?\d+\.0+$/.test(amount))amount=amount.split('.')[0];
 if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount))throw Error('Valor monetário sem precisão válida');
 return parseMoney(amount,currency);
};
const asBig=value=>BigInt(value);
export function nativoParaDecimal(minor,currency) {
 return Number(formatMoneyMinor(minor,requireCurrency(currency)));
}
export function formatarNativo(minor,currency,language='pt') {
 const amount=nativoParaDecimal(minor,currency);
 return new Intl.NumberFormat(language==='es'?'es-PY':language==='en'?'en-US':'pt-BR',{
  style:'currency',currency,minimumFractionDigits:currency==='PYG'?0:2,maximumFractionDigits:currency==='PYG'?0:2
 }).format(amount);
}
export function fontePrecoNativa(item,storeCurrency,storeId=null) {
 requireCurrency(storeCurrency);
 const direct=item?.precoDigitadoOriginal||item?.precoOrigemPDV||item?.precoNaVenda;
 if(direct && direct.moeda && direct.valor!=null)return {currency:direct.moeda,amountMinor:amountDecimal(direct.valor,direct.moeda),verified:true};
 const campo=item?.habilitarPreco2&&item?.perfilPrecoPDV==='preco2'?'preco2BRL':'precoBRL';
 const snapshot=item?.snapshotMoedasProduto?.campos?.[campo]||item?.valoresMonetarios?.campos?.[campo];
 if(snapshot?.moeda && snapshot.valor!=null)
  return {currency:snapshot.moeda,amountMinor:amountDecimal(snapshot.valor,snapshot.moeda),verified:true};
 const vipe=legacyPYGMinor(item?.precoPraticadoBRL??item?.precoBRL,storeId,storeCurrency);
 if(vipe!==null)return {currency:'PYG',amountMinor:vipe,verified:false,legacyVipe:true};
 if(storeCurrency==='BRL' && Number.isFinite(Number(item?.precoPraticadoBRL??item?.precoBRL))){
  const legacy=Number(item?.precoPraticadoBRL??item?.precoBRL);
  if(legacy>=0)return {currency:'BRL',amountMinor:amountDecimal(legacy.toFixed(2),'BRL'),verified:false,legacyBRL:true};
 }
 throw Object.assign(new Error('Preço sem moeda original comprovada. É necessária conciliação do cadastro antes da venda.'),{code:'NATIVE_PRICE_ORIGIN_REQUIRED'});
}
export function calcularCarrinhoNativoPDV({itens,desconto,moedaDesconto,moedaLoja,taxas,storeId=null}){
 requireCurrency(moedaLoja);
 const precos=(itens||[]).map(item=>{
  const src=fontePrecoNativa(item,moedaLoja,storeId);
  // A product whose only proven price is in another currency does NOT have
  // a fixed contractual store price. Do not create one using today's FX.
  if(src.currency!==moedaLoja)throw Error('Preço sem valor contratual fixo em '+moedaLoja+': concilie o produto.');
  const unitMinor=src.amountMinor;
  const quantity=Number(item.qtd);
  if(!Number.isSafeInteger(quantity)||quantity<=0)throw Error('Quantidade do item inválida');
  return {id:item.id,currency:moedaLoja,priceMinor:unitMinor,quantity,
    sourceCurrency:src.currency,sourceMinor:src.amountMinor,verified:src.verified};
 });
 const discountMinor=desconto==null||String(desconto).trim()===''?'0':
  convertMinorDirect(amountDecimal(desconto,moedaDesconto||moedaLoja),moedaDesconto||moedaLoja,moedaLoja,taxas);
 const cart=calculateNativeCart({storeCurrency:moedaLoja,items:precos,discountMinor});
 return {...cart,items:precos};
}
export function registrarPagamentoNativoPDV({id,formaId,moedaRecebida,valorRecebido,moedaLoja,taxas}){
 const originalMinor=amountDecimal(valorRecebido,moedaRecebida);
 const event=prepareIncomingPayment({paymentId:id,storeCurrency:moedaLoja,paymentCurrency:moedaRecebida,
  receivedMinor:originalMinor,rates:taxas});
 return {...event,formaId,moedaLoja,rateSnapshot:{...taxas}};
}
export function validarQuitacaoNativa({totalMinor,pagamentos=[],moedaLoja}){
 const total=asBig(totalMinor);
 if(total<=0n) return {podeConcluir:false,excessoEletronico:false,saldoMinor:'0',trocoMinor:'0'};
 let paid=0n,cash=0n;
 for(const p of pagamentos) {
  if(p.currency!==moedaLoja||p.creditedMinor==null)throw Error('Pagamento sem moeda e crédito nativos');
  const amount=asBig(p.creditedMinor);
  if(amount<0n)throw Error('Pagamento negativo');
  paid+=amount;
  if(String(p.formaId||'').startsWith('dinheiro'))cash+=amount;
 }
 const excess=paid-total;
 const blocked=excess>cash;
 return {podeConcluir:paid>=total&&!blocked,excessoEletronico:blocked,
  pagoMinor:paid.toString(),saldoMinor:(total>paid?total-paid:0n).toString(),
  trocoMinor:(excess>0n&&!blocked?excess:0n).toString(),
  dinheiroMinor:cash.toString()};
}
export function registrarBridgeContabilBRL(quantiaMinor,moedaLoja,taxas){
 // Exclusively at legacy persistence interfaces, never in cart or payment validation.
 return nativoParaDecimal(convertMinorDirect(quantiaMinor,moedaLoja,'BRL',taxas),'BRL');
}
export function valorPendenteNaMoedaRecebida(saldoMinor,moedaLoja,moedaPagamento,taxas){
 return formatMoneyMinor(convertMinorDirect(saldoMinor,moedaLoja,moedaPagamento,taxas),moedaPagamento);
}
