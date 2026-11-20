import { interpretarValorMonetario } from './cashMoneyInput.js';
import { converterMoedaConfirmada } from './monetaryContract.js';

/**
 * Native checkout: price originates with the item, not its rolling BRL equivalent.
 * Read-only projection; never reinterpret an undocumented historical item as PYG.
 */
export function apurarTotalContratualPDV({itens=[],moedaPadrao='BRL',desconto='0'}){
  if(!Array.isArray(itens)||!itens.length)return {ok:false,motivo:'CARRINHO_VAZIO'};
  let subtotal=0;
  const escala=moedaPadrao==='PYG'?1:100;
  for(const item of itens){
    const original=item?.precoDigitadoOriginal || item?.precoOrigemPDV;
    if(!original||original.moeda!==moedaPadrao)
      return {ok:false,motivo:'ITEM_SEM_PRECO_NATIVO_COMPROVADO',itemId:item?.id};
    const parsed=interpretarValorMonetario(original.valor,moedaPadrao);
    const qtd=Number(item.qtd);
    if(!parsed.ok||!Number.isSafeInteger(qtd)||qtd<=0||!Number.isSafeInteger(Math.round(parsed.valor*escala)))
      return {ok:false,motivo:'PRECO_OU_QUANTIDADE_INVALIDOS',itemId:item?.id};
    subtotal+=Math.round(parsed.valor*escala)*qtd;
    if(!Number.isSafeInteger(subtotal))return {ok:false,motivo:'TOTAL_FORA_LIMITE'};
  }
  const descontoValidado=interpretarValorMonetario(desconto,moedaPadrao);
  if(!descontoValidado.ok||!Number.isSafeInteger(Math.round(descontoValidado.valor*escala)))
    return {ok:false,motivo:'DESCONTO_INVALIDO'};
  const reduzido=Math.round(descontoValidado.valor*escala);
  if(reduzido>subtotal)return {ok:false,motivo:'DESCONTO_MAIOR_TOTAL'};
  return {ok:true,moedaDocumento:moedaPadrao,subtotalOriginal:subtotal/escala,
    descontoOriginal:reduzido/escala,totalOriginal:(subtotal-reduzido)/escala};
}

/** Only this function uses current FX, to quote one RECEIPT in another currency. */
export function cotarRecebimentoPDV({contrato,moedaRecebimento,taxasConfirmadas}){
  if(!contrato?.ok)return {ok:false,motivo:'VALOR_CONTRATUAL_NAO_COMPROVADO'};
  try{
    const valorReceber=converterMoedaConfirmada({valor:contrato.totalOriginal,
      moedaOrigem:contrato.moedaDocumento,moedaDestino:moedaRecebimento,taxasConfirmadas});
    return {ok:true,moedaDocumento:contrato.moedaDocumento,valorContratoOriginal:contrato.totalOriginal,
      moedaRecebimento,valorReceber,
      conversaoNecessaria:contrato.moedaDocumento!==moedaRecebimento};
  }catch(err){return {ok:false,motivo:'COTACAO_INVALIDA',detalhe:err.message};}
}
