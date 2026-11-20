import { obterFinanceiroVenda } from './salesFinancials.js';
import { obterComposicaoHistoricaCaixa } from './cashHistoryDisplay.js';

const CODES = new Set(['BRL','PYG','USD','EUR']);
/**
 * Never reverse-convert a BRL accounting snapshot using the current FX quote.
 * Only show native amounts when the movement contains explicit native evidence.
 */
export function apresentarMovimentoNaMoedaPadrao(movimento, moedaPadrao='BRL') {
  const composicao = obterComposicaoHistoricaCaixa(movimento);
  const padraoValida = CODES.has(moedaPadrao);
  if (!padraoValida || !composicao.comprovada) {
    return {valorPrincipal:null,moedaPrincipal:null,composicao,pendente:true,
      motivo: !padraoValida ? 'MOEDA_PADRAO_INVALIDA' : composicao.motivo || 'SEM_COMPOSICAO_NATIVA'};
  }
  const valores = composicao.moedas;
  if (valores.length !== 1) {
    return {valorPrincipal:null,moedaPrincipal:null,composicao,pendente:false,multimoeda:true};
  }
  return {valorPrincipal:valores[0].valor,moedaPrincipal:valores[0].moeda,composicao,
    pendente:false,foraDaPadrao:valores[0].moeda!==moedaPadrao};
}

/** Explicit accounting-only labels: does not claim to be native PYG or USD. */
export function rotuloEquivalenteContabil(moedaPadrao='BRL') {
  return moedaPadrao==='BRL' ? 'BRL' : 'BRL (equivalente contábil, não moeda padrão)';
}

/**
 * Historical sales must use the finalized document's own amount.
 * Never recalculate a finished sale using today's exchange rate.
 */
export function apresentarVendaHistorica(venda) {
  const codigo = venda?.moedaDocumento;
  const original = venda?.totalOriginal;
  if (!CODES.has(codigo) || typeof original !== 'number' || !Number.isFinite(original) || original < 0) {
    return {comprovada:false,moeda:null,valor:null,motivo:'VALOR_NATIVO_NAO_REGISTRADO'};
  }
  if (codigo==='PYG' && Math.abs(original-Math.round(original)) > 1e-6) {
    return {comprovada:false,moeda:null,valor:null,motivo:'PYG_FRACIONARIO'};
  }
  const financeiro = obterFinanceiroVenda(venda);
  if (!Number.isFinite(financeiro.totalBrutoBRL) || !Number.isFinite(financeiro.totalLiquidoBRL)
      || financeiro.totalBrutoBRL < 0 || financeiro.totalLiquidoBRL < 0
      || financeiro.totalLiquidoBRL > financeiro.totalBrutoBRL + .01) {
    return {comprovada:false,moeda:null,valor:null,motivo:'FINANCEIRO_DIVERGENTE'};
  }
  const fator = financeiro.totalBrutoBRL > 0
    ? Math.max(0,Math.min(1,financeiro.totalLiquidoBRL/financeiro.totalBrutoBRL)) : 0;
  const brutoNativo = codigo==='PYG' ? Math.round(original) : original;
  const casas = codigo==='PYG' ? 1 : 100;
  const valor = Math.round(brutoNativo*fator*casas)/casas;
  return {comprovada:true,moeda:codigo,valor};
}
