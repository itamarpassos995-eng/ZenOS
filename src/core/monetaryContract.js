/**
 * ZenOS: one native obligation, explicit payment currency, frozen accounting.
 * Pure: no UI, Firebase, listeners, clocks, current exchange-rate reads.
 * Foreign rates = foreign currency units per 1 BRL.
 */
export const MOEDAS_SUPORTADAS=Object.freeze(['BRL','PYG','USD','EUR']);
const VALIDAS=new Set(MOEDAS_SUPORTADAS),ESCALA={BRL:100,PYG:1,USD:100,EUR:100};
const FATOR={BRL:100n,PYG:1n,USD:100n,EUR:100n},MAX=BigInt(Number.MAX_SAFE_INTEGER);
function exigir(cond,msg){if(!cond)throw Error(msg);}
function menor(valor,moeda){
  exigir(VALIDAS.has(moeda),'Moeda não suportada.');
  const texto=String(valor??'').trim();
  exigir(/^(0|[1-9]\d*)(\.\d+)?$/.test(texto),'Valor nativo inválido.');
  const [inteiro,dec='']=texto.split('.'),casas=moeda==='PYG'?0:2;
  exigir(dec.length<=casas,'Precisão monetária inválida.');
  const n=BigInt(inteiro)*FATOR[moeda]+BigInt((dec+'0'.repeat(casas)).slice(0,casas)||'0');
  exigir(n<=MAX,'Quantia acima do limite seguro.');
  return n;
}
function seguro(n){exigir(n>=0n&&n<=MAX,'Resultado fora do limite seguro.');return Number(n);}
function maior(n,moeda){return seguro(n)/ESCALA[moeda];}
function racional(entrada){
  const texto=String(entrada??'').trim();
  exigir(/^(0|[1-9]\d*)(\.\d{1,10})?$/.test(texto),'Cotação não confirmada.');
  const [i,d='']=texto.split('.'),num=BigInt(i+d);
  exigir(num>0n&&num<=MAX,'Cotação inválida.');
  return {num,den:10n**BigInt(d.length)};
}
function taxa(m,taxas){
  exigir(VALIDAS.has(m),'Moeda não suportada.');
  return m==='BRL'?{num:1n,den:1n}:racional(taxas?.[m]);
}
function dividirArredondado(n,d){
  exigir(n>=0n&&d>0n,'Divisão monetária inválida.');
  return (2n*n+d)/(2n*d);
}
export function unidadesMenores(valor,moeda){return seguro(menor(valor,moeda));}
export function converterMoedaConfirmada({valor,moedaOrigem,moedaDestino,taxasConfirmadas}){
  const n=menor(valor,moedaOrigem);
  exigir(VALIDAS.has(moedaDestino),'Moeda não suportada.');
  if(moedaOrigem===moedaDestino)return maior(n,moedaDestino);
  const a=taxa(moedaOrigem,taxasConfirmadas),b=taxa(moedaDestino,taxasConfirmadas);
  return maior(dividirArredondado(n*a.den*b.num*FATOR[moedaDestino],FATOR[moedaOrigem]*a.num*b.den),moedaDestino);
}
export function criarObrigacaoNativa({id,moedaDocumento,valorOriginal,taxasConfirmadas,registradaEm}){
  exigir(String(id??'').trim()&&String(registradaEm??'').trim(),'Identidade e data obrigatórias.');
  const n=menor(valorOriginal,moedaDocumento);exigir(n>0n,'Valor deve ser positivo.');
  const valorNativo=maior(n,moedaDocumento);
  const cont=converterMoedaConfirmada({valor:valorNativo,moedaOrigem:moedaDocumento,
    moedaDestino:'BRL',taxasConfirmadas});
  return Object.freeze({versaoMonetaria:1,id:String(id),moedaDocumento,valorOriginal:valorNativo,
    valorContabilHistoricoBRL:cont,
    taxaDocumentoPorBRL:moedaDocumento==='BRL'?1:Number(taxasConfirmadas?.[moedaDocumento]),
    registradaEm:String(registradaEm)});
}
export function apurarSaldoNativo(obrigacao,pagamentos=[]){
  exigir(obrigacao?.versaoMonetaria===1,'Origem monetária da dívida não comprovada.');
  const total=menor(obrigacao.valorOriginal,obrigacao.moedaDocumento);
  const ids=new Set();let liquidado=0n;
  for(const p of pagamentos){
    exigir(p?.versaoMonetaria===1&&p?.obrigacaoId===obrigacao.id
      &&p?.moedaObrigacao===obrigacao.moedaDocumento,'Recebimento não corresponde à obrigação.');
    exigir(!ids.has(String(p.id)),'Recebimento duplicado.');ids.add(String(p.id));
    liquidado+=menor(p.valorAmortizadoOriginal,obrigacao.moedaDocumento);
  }
  exigir(liquidado<=total,'Recebimentos superam o saldo.');
  return {moeda:obrigacao.moedaDocumento,valorOriginal:obrigacao.valorOriginal,
    valorAmortizado:maior(liquidado,obrigacao.moedaDocumento),
    saldoNativo:maior(total-liquidado,obrigacao.moedaDocumento)};
}
export function criarLiquidacaoNativa({id,obrigacao,valorAmortizadoOriginal,moedaPagamento,
  valorPagamentoOriginal,taxasConfirmadas,registradaEm,liquidacoesAnteriores=[]}){
  exigir(obrigacao?.versaoMonetaria===1,'Origem monetária da dívida não comprovada.');
  exigir(String(id??'').trim()&&String(registradaEm??'').trim(),'Identidade e data obrigatórias.');
  const antes=apurarSaldoNativo(obrigacao,liquidacoesAnteriores);
  exigir(!liquidacoesAnteriores.some(p=>String(p.id)===String(id)),'ID de recebimento repetido.');
  const total=menor(obrigacao.valorOriginal,obrigacao.moedaDocumento);
  const aplicado=menor(valorAmortizadoOriginal,obrigacao.moedaDocumento);
  const pagoAntes=menor(antes.valorAmortizado,obrigacao.moedaDocumento);
  exigir(aplicado>0n&&aplicado<=total-pagoAntes,'Amortização excede saldo.');
  const esperado=converterMoedaConfirmada({valor:maior(aplicado,obrigacao.moedaDocumento),
    moedaOrigem:obrigacao.moedaDocumento,moedaDestino:moedaPagamento,taxasConfirmadas});
  exigir(menor(esperado,moedaPagamento)===menor(valorPagamentoOriginal,moedaPagamento),
    'Pagamento físico divergente do valor contratual convertido.');
  const cont=menor(obrigacao.valorContabilHistoricoBRL,'BRL');
  const quota=dividirArredondado(cont*(pagoAntes+aplicado),total)
    -dividirArredondado(cont*pagoAntes,total);
  const recebidoBRL=converterMoedaConfirmada({valor:valorPagamentoOriginal,
    moedaOrigem:moedaPagamento,moedaDestino:'BRL',taxasConfirmadas});
  const historicoBRL=maior(quota,'BRL');
  return Object.freeze({versaoMonetaria:1,id:String(id),obrigacaoId:obrigacao.id,
    moedaObrigacao:obrigacao.moedaDocumento,
    valorAmortizadoOriginal:maior(aplicado,obrigacao.moedaDocumento),
    moedaPagamento,valorPagamentoOriginal:maior(menor(valorPagamentoOriginal,moedaPagamento),moedaPagamento),
    valorContabilHistoricoAmortizadoBRL:historicoBRL,
    equivalentePagamentoNaDataBRL:recebidoBRL,
    diferencaCambialRealizadaBRL:Math.round((recebidoBRL-historicoBRL)*100)/100,
    taxaPagamentoPorBRL:moedaPagamento==='BRL'?1:Number(taxasConfirmadas?.[moedaPagamento]),
    taxaObrigacaoPorBRL:obrigacao.moedaDocumento==='BRL'?1:Number(taxasConfirmadas?.[obrigacao.moedaDocumento]),
    registradaEm:String(registradaEm)});
}
export function resumirSaldosPorMoeda(registros=[]){
  const totais=Object.fromEntries(MOEDAS_SUPORTADAS.map(m=>[m,0])),pendencias=[];
  for(const {obrigacao,pagamentos=[]} of registros){
    try{
      const s=apurarSaldoNativo(obrigacao,pagamentos);
      totais[s.moeda]=maior(menor(totais[s.moeda],s.moeda)+menor(s.saldoNativo,s.moeda),s.moeda);
    }catch(e){pendencias.push({id:obrigacao?.id??null,motivo:e.message});}
  }
  return {totais,pendencias,confiavel:pendencias.length===0};
}
