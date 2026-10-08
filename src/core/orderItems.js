export const ehEncomendaUsoUnico = (item = {}) => {
  // ATT 04: novos produtos rápidos passam a ter classificação explícita.
  // Assim o SKU deixa de ser a regra de negócio para registros novos.
  if (item.classificacaoUso === 'estoque') return false;
  if (item.classificacaoUso === 'encomenda_unica') return true;

  if (item.usoUnicoEncomendado === true) return true;

  // Compatibilidade V1: versões antigas identificavam encomendas pelo SKU e
  // chegaram a apagar o produto do catálogo no fechamento da venda.
  return String(item.sku || '').toUpperCase().includes('ENCOMENDA');
};

export const gerarSkuProdutoBalcao = (prefixo = 'BALCAO') => `${prefixo}-${Date.now().toString().slice(-6)}`;

export const ajustarSkuPorTipoProdutoRapido = (skuAtual, usoUnicoEncomendado) => {
  const sku = String(skuAtual || '').trim();
  const ehAutoBalcao = /^BALCAO-\d+$/i.test(sku);
  const ehAutoEncomenda = /^ENCOMENDA-\d+$/i.test(sku);

  if (usoUnicoEncomendado) {
    if (!sku || ehAutoBalcao) return gerarSkuProdutoBalcao('ENCOMENDA');
    return sku;
  }

  if (!sku || ehAutoEncomenda) return gerarSkuProdutoBalcao('BALCAO');
  return sku;
};
