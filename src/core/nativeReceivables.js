import {parseMoney,convertMinorDirect,formatMoneyMinor} from './nativeMoneyKernel.js';
// ZenOS — receivables in the contractual currency. Never convert a book value
// using the current rate to invent a historical native obligation.
const MOEDAS=new Set(['BRL','PYG','USD','EUR']);
const unidades=m=>m==='PYG'?1:100;
const arred=(n,m)=>Math.round((n+Number.EPSILON)*unidades(m))/unidades(m);
const cent=n=>Math.round((n+Number.EPSILON)*100)/100;
const numero=(v,rotulo)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error(rotulo+' inválido.');return v;};
const moeda=m=>{if(!MOEDAS.has(m))throw Error('Moeda inválida: '+String(m));return m;};
const validar=(v,m,rotulo)=>{numero(v,rotulo);moeda(m);if(Math.abs(arred(v,m)-v)>1e-7)throw Error('Precisão inválida em '+m);return v;};
const taxa=(m,ts)=>{moeda(m);if(m==='BRL')return 1;const t=Number(ts?.[m]);if(!Number.isFinite(t)||t<=0)throw Error('Cotação inválida de '+m);return t;};
export function apurarCarteiraNativa(cliente,moedaPadrao){
 moeda(moedaPadrao);
 const contabil=Number(cliente?.saldoDevedorBRL??0);
 if(!cliente||!Number.isFinite(contabil)||contabil<0)
   return {status:'inconsistente',moeda:moedaPadrao,totalNativo:null,totalContabilBRL:null};
 const titulos=cliente?.titulosFiadoNativos??[];
 if(!Array.isArray(titulos))return {status:'inconsistente',moeda:moedaPadrao,totalNativo:null,totalContabilBRL:contabil};
 let nativo=0,livro=0;const ids=new Set();
 for(const t of titulos){
   if(!t||t.moeda!==moedaPadrao||ids.has(String(t.idVenda))||!t.idVenda)
     return {status:'inconsistente',moeda:moedaPadrao,totalNativo:null,totalContabilBRL:contabil};
   ids.add(String(t.idVenda));
   try{
     validar(t.valorOriginal,t.moeda,'Valor original');
     validar(t.saldoOriginal,t.moeda,'Saldo original');
     numero(t.valorContabilRegistroBRL,'Valor contábil inicial');
     numero(t.saldoContabilBRL,'Saldo contábil restante');
   }catch{return {status:'inconsistente',moeda:moedaPadrao,totalNativo:null,totalContabilBRL:contabil};}
   if(t.saldoOriginal>t.valorOriginal||t.saldoContabilBRL>t.valorContabilRegistroBRL+0.01)
     return {status:'inconsistente',moeda:moedaPadrao,totalNativo:null,totalContabilBRL:contabil};
   nativo+=t.saldoOriginal;livro+=t.saldoContabilBRL;
 }
 nativo=arred(nativo,moedaPadrao);livro=cent(livro);
 const legadoBRL=cent(contabil-livro);
 if(legadoBRL<-.01)return {status:'inconsistente',moeda:moedaPadrao,totalNativo:null,totalContabilBRL:contabil};
 if(legadoBRL>.01)return {status:'legado_pendente',moeda:moedaPadrao,totalNativo:null,totalContabilBRL:contabil,legadoBRL,nativoComprovado:nativo};
 return {status:'confirmado',moeda:moedaPadrao,totalNativo:nativo,totalContabilBRL:contabil,legadoBRL:0};
}
export function adicionarTituloNativo(cliente,{idVenda,moedaObrigacao,valorOriginal,valorContabilBRL,createdAt}){
 moeda(moedaObrigacao);validar(valorOriginal,moedaObrigacao,'Valor do crédito');
 numero(valorContabilBRL,'Equivalente contábil');
 if(valorOriginal<=0||valorContabilBRL<=0||!idVenda)throw Error('Título sem valor ou identidade');
 const titulos=Array.isArray(cliente?.titulosFiadoNativos)?cliente.titulosFiadoNativos:[];
 if(titulos.some(t=>String(t.idVenda)===String(idVenda)))throw Error('Título duplicado');
 if(titulos.some(t=>t.moeda!==moedaObrigacao))throw Error('Cliente com títulos de outra moeda: requer carteira segregada');
 return {...cliente,titulosFiadoNativos:[...titulos,{
  idVenda:String(idVenda),moeda:moedaObrigacao,valorOriginal,
  saldoOriginal:valorOriginal,valorContabilRegistroBRL:cent(valorContabilBRL),
  saldoContabilBRL:cent(valorContabilBRL),createdAt:createdAt||null,
 }]};
}
export function receberTituloNativo(cliente,{moedaPadrao,moedaPagamento,valorPago,taxasCambio}){
 moeda(moedaPagamento);validar(valorPago,moedaPagamento,'Pagamento');
 if(valorPago<=0)throw Error('Pagamento vazio');
 const carteira=apurarCarteiraNativa(cliente,moedaPadrao);
 if(carteira.status!=='confirmado')throw Error('Fiado legado sem contrato nativo conciliado: recebimento bloqueado');
 const taxaOrigem=taxa(moedaPadrao,taxasCambio),taxaPagamento=taxa(moedaPagamento,taxasCambio);
 const pagoNativo=Number(formatMoneyMinor(convertMinorDirect(
   parseMoney(valorPago.toFixed(moedaPagamento==='PYG'?0:2),moedaPagamento),
   moedaPagamento,moedaPadrao,taxasCambio),moedaPadrao));
 if(pagoNativo<=0||pagoNativo>carteira.totalNativo)throw Error('Pagamento fora do saldo contratual');
 let restante=pagoNativo,abatimentoContabilBRL=0;
 const novosTitulos=cliente.titulosFiadoNativos.map(t=>{
  if(restante<=0||t.saldoOriginal<=0)return t;
  const aplicado=Math.min(restante,t.saldoOriginal);
  restante=arred(restante-aplicado,moedaPadrao);
  const saldoOriginal=arred(t.saldoOriginal-aplicado,moedaPadrao);
  const saldoContabilBRL=saldoOriginal===0?0:cent(t.valorContabilRegistroBRL*saldoOriginal/t.valorOriginal);
  abatimentoContabilBRL+=cent(t.saldoContabilBRL-saldoContabilBRL);
  return {...t,saldoOriginal,saldoContabilBRL};
 });
 const novoSaldoContabilBRL=cent(novosTitulos.reduce((s,t)=>s+t.saldoContabilBRL,0));
 const recebidoBRL=cent(valorPago/taxaPagamento);
 return {cliente:{...cliente,titulosFiadoNativos:novosTitulos,saldoDevedorBRL:novoSaldoContabilBRL},
  moedaObrigacao:moedaPadrao,valorAplicadoNativo:pagoNativo,
  saldoNativo:arred(carteira.totalNativo-pagoNativo,moedaPadrao),
  moedaPagamento,valorPago,recebidoBRL,abatimentoContabilBRL:cent(abatimentoContabilBRL),
  variacaoCambialRealizadaBRL:cent(recebidoBRL-abatimentoContabilBRL),
  taxaObrigacao:taxaOrigem,taxaPagamento};
}
