import { obterFinanceiroVenda } from './salesFinancials.js';

const MOEDAS = new Set(['BRL', 'PYG', 'USD', 'EUR']);
const taxaHistorica = (venda, moeda) => moeda === 'BRL' ? 1 : (() => {
  const taxa = Number(venda?.taxasCambio?.[moeda]);
  return Number.isFinite(taxa) && taxa > 0 ? taxa : null;
})();
const arredondar = (n, moeda) => {
  const fator = moeda === 'PYG' ? 1 : 100;
  return Math.round(n * fator) / fator;
};

// O faturamento do dia permanece na moeda escolhida como padrão da loja,
// sem revalorizar vendas concluídas quando a cotação atual muda.
export function totalDiarioMoedaPadrao(vendas = [], moedaPadrao = 'BRL') {
  if (!MOEDAS.has(moedaPadrao)) return { ok:false, total:null, pendentes:vendas.length };
  let total = 0;
  let pendentes = 0;
  for (const venda of vendas) {
    const moedaOrigem = venda?.moedaDocumento;
    const original = Number(venda?.totalOriginal);
    const {totalBrutoBRL, totalLiquidoBRL} = obterFinanceiroVenda(venda);
    const taxaOrigem = taxaHistorica(venda, moedaOrigem);
    const taxaDestino = taxaHistorica(venda, moedaPadrao);
    // Nunca inferir moeda de vendas legadas, nem inventar cotações ausentes.
    if (!MOEDAS.has(moedaOrigem) || venda?.totalOriginal == null || !Number.isFinite(original) || original < 0
      || !Number.isFinite(totalBrutoBRL) || !Number.isFinite(totalLiquidoBRL)
      || totalBrutoBRL < 0 || totalLiquidoBRL < 0 || totalLiquidoBRL > totalBrutoBRL + 0.01
      || !taxaOrigem || !taxaDestino || (totalBrutoBRL === 0 && totalLiquidoBRL > 0)) {
      pendentes++;
      continue;
    }
    // Se houver devolução, reduzir a parte nativa pela proporção líquida
    // do snapshot financeiro; sem devolução preservar o número original.
    const proporcao = totalBrutoBRL > 0 ? Math.max(0, Math.min(1, totalLiquidoBRL / totalBrutoBRL)) : 0;
    const nativoLiquido = original * proporcao;
    const convertido = moedaOrigem === moedaPadrao ? nativoLiquido : nativoLiquido / taxaOrigem * taxaDestino;
    const fator = moedaPadrao === 'PYG' ? 1 : 100;
    if (!Number.isFinite(convertido) || convertido < 0 || !Number.isSafeInteger(Math.round(convertido * fator))) {
      pendentes++;
      continue;
    }
    total += convertido;
  }
  return {ok:pendentes === 0,total:pendentes === 0 ? arredondar(total,moedaPadrao) : null,pendentes};
}
