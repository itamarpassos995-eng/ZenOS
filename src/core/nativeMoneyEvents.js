import { interpretarValorMonetario, MOEDAS_CAIXA } from './cashMoneyInput.js';

const arredondarBRL = valor => Math.round((valor + Number.EPSILON) * 100) / 100;
const taxaEfetiva = (codigo, taxas) => codigo === 'BRL' ? 1 : Number(taxas?.[codigo]);

/**
 * Canonical immutable money snapshot for NEW transaction events.
 * Reference: rates[PYG] = PYG per BRL, rates[USD] = USD per BRL.
 * Reject missing/invalid exchange rates instead of assuming 1.
 * Never reconstruct historical native currency from a converted BRL figure.
 */
export function criarSnapshotMonetario({valorOriginal, moedaOrigem, taxasCambio, permitirZero=false}) {
  if (!MOEDAS_CAIXA.includes(moedaOrigem)) return {ok:false,erro:'Moeda original não reconhecida.'};
  const validacao = interpretarValorMonetario(valorOriginal, moedaOrigem);
  if (!validacao.ok) return {ok:false,erro:validacao.erro};
  if (!permitirZero && validacao.valor <= 0) return {ok:false,erro:'Valor deve ser maior que zero.'};
  const taxa = taxaEfetiva(moedaOrigem,taxasCambio);
  if (!Number.isFinite(taxa) || taxa <= 0) return {ok:false,erro:'Cotação não confirmada para '+moedaOrigem+'.'};
  const brutoBRL = validacao.valor/taxa;
  if (!Number.isFinite(brutoBRL) || brutoBRL < 0 || !Number.isSafeInteger(Math.round(brutoBRL*100)))
    return {ok:false,erro:'Equivalente contábil fora do limite seguro.'};
  return {ok:true,moedaOrigem,valorOriginal:validacao.valor,taxaCambioAplicada:taxa,
    valorConvertidoBRL:arredondarBRL(brutoBRL)};
}

/**
 * Compare an actual payout in the chosen currency with an already-confirmed
 * BRL accounting obligation. Never invent the native quantity.
 */
export function validarLiquidacaoMultimoeda({valorDevidoBRL,valorFisico,moedaFisica,taxasCambio}) {
  if (!Number.isFinite(valorDevidoBRL) || valorDevidoBRL<=0) return {ok:false,erro:'Obrigação inválida.'};
  const evento=criarSnapshotMonetario({valorOriginal:valorFisico,moedaOrigem:moedaFisica,taxasCambio});
  if (!evento.ok) return evento;
  const diferenca=arredondarBRL(evento.valorConvertidoBRL-valorDevidoBRL);
  // Do not silently settle an over/underpayment or change sale amounts.
  if (diferenca !== 0) return {ok:false,erro:'Valor físico e obrigação contábil não conferem. Revise o câmbio, diferença e troco.',diferencaBRL:diferenca};
  return {...evento,diferencaBRL:diferenca};
}

/**
 * Settle a nominal obligation in its native contractual currency.
 * Current FX may price a DIFFERENT payment currency, never reprice the debt.
 * The difference between historic book BRL and payment-date equivalent is
 * returned explicitly as exchange variance, not silently written as profit.
 */
export function validarPagamentoObrigacaoNativa({
  valorObrigacaoOriginal, moedaObrigacao, valorFisico,
  moedaFisica, taxasCambio, valorContabilHistoricoBRL
}) {
  const divida=interpretarValorMonetario(valorObrigacaoOriginal,moedaObrigacao);
  if (!divida.ok || divida.valor<=0) return {ok:false,erro:'Valor contratual da obrigação não comprovado.'};
  const pago=criarSnapshotMonetario({valorOriginal:valorFisico,moedaOrigem:moedaFisica,taxasCambio});
  if (!pago.ok) return pago;
  const taxaOrigem=taxaEfetiva(moedaObrigacao,taxasCambio);
  if (!Number.isFinite(taxaOrigem) || taxaOrigem<=0) return {ok:false,erro:'Cotação atual da moeda da dívida ausente ou inválida.'};
  const unidadesPagamento=moedaFisica==='PYG' ? 1 : 100;
  const valorPagamentoExato = divida.valor/taxaOrigem*pago.taxaCambioAplicada;
  const valorPagamentoEsperado=Math.round((valorPagamentoExato+Number.EPSILON)*unidadesPagamento)/unidadesPagamento;
  const quitacaoNaOrigem=pago.valorOriginal/pago.taxaCambioAplicada*taxaOrigem;
  const residuoOrigem=quitacaoNaOrigem-divida.valor;
  if (Math.abs(pago.valorOriginal-valorPagamentoEsperado)>1e-8)
    return {ok:false,erro:'Pagamento não corresponde ao valor devido na moeda original com arredondamento da moeda recebida. Confira a quantia ou registre diferença/troco.',
      valorPagamentoEsperado,moedaPagamentoEsperada:moedaFisica,diferencaOrigem:residuoOrigem};
  if (!Number.isFinite(valorContabilHistoricoBRL) || valorContabilHistoricoBRL<=0)
    return {ok:false,erro:'Equivalente contábil histórico ausente.'};
  return {...pago,moedaObrigacao,valorObrigacaoOriginal:divida.valor,
    valorContabilHistoricoBRL,valorContabilDataPagamentoBRL:pago.valorConvertidoBRL,
    diferencaCambialBRL:arredondarBRL(pago.valorConvertidoBRL-valorContabilHistoricoBRL),
    taxaOrigemAtual:taxaOrigem,
    residuoArredondamentoOrigem:residuoOrigem,
    valorPagamentoEsperado};
}

/**
 * A refund of a verified native sale owes the original contractual currency,
 * not the BRL equivalent at today's exchange rate. Partial returns allocate
 * the nominal amount from cumulative BRL return proportions, preventing
 * currency rounding drift across separate returns. No native identity is
 * inferred for legacy documents.
 */
export function validarReembolsoVendaNativa({
  venda, valorEstornoBRL, moedaFisica, valorFisico, taxasCambio
}) {
  if (!Number.isFinite(valorEstornoBRL) || valorEstornoBRL <= 0)
    return {ok:false,erro:'Valor de devolução inválido.'};
  const moedaOriginal = venda?.moedaDocumento;
  const valorOriginal = venda?.totalOriginal;
  const totalBrutoBRL = Number(venda?.totalBRL);
  if (!MOEDAS_CAIXA.includes(moedaOriginal) || typeof valorOriginal!=='number' ||
      !Number.isFinite(valorOriginal) || valorOriginal<=0 ||
      !Number.isFinite(totalBrutoBRL) || totalBrutoBRL<=0) {
    // An undocumented old sale has ONLY its confirmed BRL ledger obligation.
    // The operator still explicitly chooses actual payout currency; no source
    // PYG amount can be reconstructed from the current exchange rate.
    return validarLiquidacaoMultimoeda({
      valorDevidoBRL:valorEstornoBRL,valorFisico,moedaFisica,taxasCambio});
  }
  const devolvidoAnteriorBRL=Number(venda?.valorDevolvidoBRL || 0);
  if (!Number.isFinite(devolvidoAnteriorBRL)||devolvidoAnteriorBRL<0||
      devolvidoAnteriorBRL+valorEstornoBRL>totalBrutoBRL+0.011)
    return {ok:false,erro:'Devolução supera o saldo original da venda.'};
  const fator = moedaOriginal==='PYG' ? 1 : 100;
  const quotaAntiga = Math.round(valorOriginal * Math.min(1,devolvidoAnteriorBRL/totalBrutoBRL)*fator)/fator;
  const quotaNova = Math.round(valorOriginal * Math.min(1,(devolvidoAnteriorBRL+valorEstornoBRL)/totalBrutoBRL)*fator)/fator;
  const valorContratualDevolver = Math.round((quotaNova-quotaAntiga)*fator)/fator;
  if (valorContratualDevolver <= 0)
    return {ok:false,erro:'Devolução nativa não representável para esta parcela.'};
  const liquidacao=validarPagamentoObrigacaoNativa({
    valorObrigacaoOriginal:valorContratualDevolver,moedaObrigacao:moedaOriginal,
    valorFisico,moedaFisica,taxasCambio,valorContabilHistoricoBRL:valorEstornoBRL
  });
  if (!liquidacao.ok) return liquidacao;
  return {...liquidacao,moedaVendaOriginal:moedaOriginal,
    valorDevolvidoContratoOriginal:valorContratualDevolver};
}
