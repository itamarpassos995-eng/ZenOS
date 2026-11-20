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
