const textoSeguro = (valor) => String(valor ?? '').trim();

export const normalizarSkuProduto = (sku) => textoSeguro(sku).toUpperCase();

const hashTexto = (texto) => {
  let hash = 2166136261;
  const value = String(texto || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase();
};

export const gerarIdSeguro = (prefixo = 'ID') => {
  try {
    if (globalThis?.crypto?.randomUUID) return `${prefixo}-${globalThis.crypto.randomUUID()}`;
  } catch (_) {
    // fallback abaixo
  }
  return `${prefixo}-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
};

export const gerarIdProduto = (produto = {}, index = 0) => {
  if (produto?.id !== undefined && produto?.id !== null && String(produto.id).trim() !== '') return produto.id;
  const sku = normalizarSkuProduto(produto?.sku);
  if (sku) {
    const assinatura = `${sku}|${textoSeguro(produto?.nome)}|${textoSeguro(produto?.grupo)}|${index}`;
    return `PROD-LEGACY-${hashTexto(assinatura)}`;
  }
  return gerarIdSeguro('PROD');
};

export const gerarIdCliente = (cliente = {}, index = 0) => {
  if (cliente?.id !== undefined && cliente?.id !== null && String(cliente.id).trim() !== '') return cliente.id;
  const assinaturaBase = textoSeguro(cliente?.documento) || textoSeguro(cliente?.email) || textoSeguro(cliente?.nome);
  if (assinaturaBase) return `CLI-LEGACY-${hashTexto(`${assinaturaBase}|${index}`)}`;
  return gerarIdSeguro('CLI');
};

export const identidadeProduto = (produto = {}) => ({
  id: textoSeguro(produto?.produtoOriginalId ?? produto?.id),
  sku: normalizarSkuProduto(produto?.produtoOriginalSku ?? produto?.sku),
});

export const correspondeIdentidadeProduto = (produto, referencia) => {
  const a = identidadeProduto(produto);
  const b = typeof referencia === 'object' ? identidadeProduto(referencia) : { id: textoSeguro(referencia), sku: '' };
  if (!a.id || !b.id || a.id !== b.id) return false;
  if (b.sku) return a.sku === b.sku;
  return true;
};

export const localizarIndicesProduto = (produtos = [], referencia) => {
  const ref = typeof referencia === 'object' ? identidadeProduto(referencia) : { id: textoSeguro(referencia), sku: '' };
  let indices = (produtos || [])
    .map((produto, index) => ({ produto, index }))
    .filter(({ produto }) => textoSeguro(produto?.id) === ref.id);

  if (indices.length > 1 && ref.sku) {
    const porSku = indices.filter(({ produto }) => normalizarSkuProduto(produto?.sku) === ref.sku);
    if (porSku.length > 0) indices = porSku;
  }
  return indices;
};

export const localizarIndiceProdutoUnico = (produtos = [], referencia, contexto = 'operação') => {
  const encontrados = localizarIndicesProduto(produtos, referencia);
  if (encontrados.length === 0) return -1;
  if (encontrados.length > 1) {
    const ref = typeof referencia === 'object' ? identidadeProduto(referencia) : { id: textoSeguro(referencia), sku: '' };
    const erro = new Error(`Conflito de identidade no catálogo: existem ${encontrados.length} registros para o produto ${ref.sku || ref.id}. A ${contexto} foi bloqueada para evitar alterar o item errado.`);
    erro.code = 'ZENOS_PRODUTO_IDENTIDADE_DUPLICADA';
    erro.produtoId = ref.id;
    erro.sku = ref.sku;
    erro.quantidadeConflitos = encontrados.length;
    throw erro;
  }
  return encontrados[0].index;
};

export const atualizarProdutoUnico = (produtos = [], referencia, proximoProduto, contexto = 'atualização') => {
  const indice = localizarIndiceProdutoUnico(produtos, referencia, contexto);
  if (indice < 0) {
    const erro = new Error('Produto não encontrado no catálogo.');
    erro.code = 'ZENOS_PRODUTO_NAO_ENCONTRADO';
    throw erro;
  }
  return (produtos || []).map((produto, index) => (index === indice ? proximoProduto : produto));
};

export const skuJaExiste = (produtos = [], sku, ignorarReferencia = null) => {
  const skuNorm = normalizarSkuProduto(sku);
  if (!skuNorm) return false;
  return (produtos || []).some((produto) => {
    if (normalizarSkuProduto(produto?.sku) !== skuNorm) return false;
    if (!ignorarReferencia) return true;
    return !correspondeIdentidadeProduto(produto, ignorarReferencia);
  });
};

export const detectarConflitosIdentidadeProdutos = (produtos = []) => {
  const porId = new Map();
  for (const produto of produtos || []) {
    const id = textoSeguro(produto?.id);
    if (!id) continue;
    if (!porId.has(id)) porId.set(id, []);
    porId.get(id).push(produto);
  }
  return [...porId.entries()]
    .filter(([, lista]) => lista.length > 1)
    .map(([id, lista]) => ({
      id,
      quantidade: lista.length,
      skus: [...new Set(lista.map((p) => normalizarSkuProduto(p?.sku)).filter(Boolean))],
      nomes: [...new Set(lista.map((p) => textoSeguro(p?.nome)).filter(Boolean))],
    }));
};

export const chaveAuditoriaProduto = (produtoOuId, sku = '') => {
  const ref = typeof produtoOuId === 'object'
    ? identidadeProduto(produtoOuId)
    : { id: textoSeguro(produtoOuId), sku: normalizarSkuProduto(sku) };
  const base = ref.id || 'sem-id';
  const skuParte = ref.sku || 'SEM-SKU';
  return `${base}__${hashTexto(skuParte)}`;
};
