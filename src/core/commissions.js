import { registroEhDoIntervaloLocal, registroEhDoMesLocal } from './dates.js';
import { obterFinanceiroVenda } from './salesFinancials.js';
import { calcularMargemPercentual } from './profitability.js';

export const vendaElegivelParaComissao = (venda, filtro) => {
  if (!venda || !['concluida', 'parcial'].includes(venda.estado)) return false;

  let pertencePeriodo = false;
  if (typeof filtro === 'string') {
    pertencePeriodo = registroEhDoMesLocal(venda, filtro);
  } else if (filtro?.tipo === 'intervalo') {
    pertencePeriodo = registroEhDoIntervaloLocal(venda, filtro.inicio, filtro.fim);
  } else if (filtro?.mes) {
    pertencePeriodo = registroEhDoMesLocal(venda, filtro.mes);
  }

  if (!pertencePeriodo) return false;
  return obterFinanceiroVenda(venda).totalLiquidoBRL > 0;
};

export const obterBaseComissaoVenda = (venda = {}) => {
  const financeiro = obterFinanceiroVenda(venda);
  const faturamentoLiquidoBRL = financeiro.totalLiquidoBRL;
  const lucroLiquidoBRL = financeiro.lucroLiquidoBRL;
  const margemLiquidaPct = calcularMargemPercentual(faturamentoLiquidoBRL, lucroLiquidoBRL);

  return {
    faturamentoLiquidoBRL,
    lucroLiquidoBRL,
    margemLiquidaPct,
  };
};
