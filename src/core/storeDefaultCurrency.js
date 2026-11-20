/**
 * Pure default-currency resolution.
 * On first authoritative store config, choose persisted store default.
 * Later refreshes preserve deliberate operator visual selection.
 * Never change prices, documents, ledger, or rates.
 */
export function resolverMoedaExibidaAoCarregarConfiguracao({
  visivelAtual, padraoAnterior='BRL', padraoSalvo='BRL',
  primeiraConfiguracao=false, escolhaManual=false
}={}) {
  const permitidas=['BRL','PYG','USD','EUR'];
  const padrao=permitidas.includes(padraoSalvo)?padraoSalvo:'BRL';
  const atual=permitidas.includes(visivelAtual)?visivelAtual:'BRL';
  if (escolhaManual) return atual;
  if (primeiraConfiguracao || atual===padraoAnterior) return padrao;
  return atual;
}
