import { obterFinanceiroVenda } from '../core/salesFinancials.js';

const MOEDAS = new Set(['BRL','PYG','USD','EUR']);

/**
 * Dashboard only: totaliza vendas EXCLUSIVAMENTE na moeda registrada.
 * Não utiliza nenhuma cotação (atual ou histórica) e não grava dados.
 * Vendas em outras moedas são segregadas. Legados sem valor/moeda originais
 * exigem auditoria, nunca estimativa nem conversão silenciosa.
 */
export function apurarVendasNativasDoDia(vendas = [], moedaPadrao = 'BRL') {
  if (!MOEDAS.has(moedaPadrao)) return {ok:false,total:null,subtotalConfirmado:0,confirmadas:0,pendentes:vendas.length,outrasMoedas:0,pendencias:[]};
  let total = 0, pendentes = 0, outrasMoedas = 0, confirmadas = 0;
  const pendencias = [];
  for (const v of vendas) {
    if (v?.moedaDocumento !== moedaPadrao) {
      if (MOEDAS.has(v?.moedaDocumento)) outrasMoedas++;
      else { pendentes++; pendencias.push({id:String(v?.id || ''),motivo:'moeda_nao_registrada'}); }
      continue;
    }
    if (v.totalOriginal == null || typeof v.totalOriginal !== 'number' ||
        !Number.isFinite(v.totalOriginal) || v.totalOriginal < 0 ||
        (moedaPadrao === 'PYG' && !Number.isInteger(v.totalOriginal))) {
      pendentes++;
      pendencias.push({id:String(v?.id || ''),motivo:'valor_original_nao_comprovado'});
      continue;
    }
    const {totalBrutoBRL, totalLiquidoBRL} = obterFinanceiroVenda(v);
    if (!Number.isFinite(totalBrutoBRL) || !Number.isFinite(totalLiquidoBRL) ||
        totalBrutoBRL < 0 || totalLiquidoBRL < 0 || totalLiquidoBRL > totalBrutoBRL + 0.01) {
      pendentes++;
      pendencias.push({id:String(v?.id || ''),motivo:'historico_financeiro_inconsistente'});
      continue;
    }
    // Histórico de devolução: preserva parte líquida do preço original.
    // Nenhuma cotação entra na conta.
    const fator = totalBrutoBRL > 0 ? Math.max(0,Math.min(1,totalLiquidoBRL/totalBrutoBRL)) : 0;
    total += v.totalOriginal * fator;
    confirmadas++;
  }
  const casas = moedaPadrao === 'PYG' ? 1 : 100;
  if (!Number.isFinite(total) || !Number.isSafeInteger(Math.round(total * casas))) pendentes++;
  return {ok:pendentes === 0,total:pendentes === 0 ? Math.round(total * casas)/casas : null,
    subtotalConfirmado:Math.round(total * casas)/casas,confirmadas,pendentes,outrasMoedas,pendencias};
}
