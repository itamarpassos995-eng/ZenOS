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
