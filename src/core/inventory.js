import { correspondeIdentidadeProduto, localizarIndiceProdutoUnico } from './productIdentity.js';
const EPSILON = 1e-9;

const numberOrZero = (value) => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizarQuantidadeEstoque = (value) => Math.max(0, numberOrZero(value));

const temCampo = (obj, key) => obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null && obj[key] !== '';

/**
 * ATT 02 — Regra de compatibilidade V1:
 * - `estoque` continua sendo o total canônico porque as vendas antigas já o alteravam.
 * - `estoqueVitrine` e `estoqueGalpao` são reconciliados sem apagar o total.
 * - Quando existia divergência antiga, preservamos o galpão até o limite do total e
 *   reconstruímos a vitrine. Isso corresponde à regra operacional de vender da
 *   vitrine primeiro e depois do galpão.
 */
export const obterEstoqueProduto = (produto = {}) => {
  const temVitrine = temCampo(produto, 'estoqueVitrine');
  const temGalpao = temCampo(produto, 'estoqueGalpao');
  const temTotal = temCampo(produto, 'estoque');

  const vitrineInformada = normalizarQuantidadeEstoque(produto.estoqueVitrine);
  const galpaoInformado = normalizarQuantidadeEstoque(produto.estoqueGalpao);
  const somaLocalizacoes = vitrineInformada + galpaoInformado;
  const totalInformado = normalizarQuantidadeEstoque(produto.estoque);

  if (!temVitrine && !temGalpao) {
    return {
      estoque: totalInformado,
      estoqueVitrine: totalInformado,
      estoqueGalpao: 0,
      reconciliado: false,
      legadoSemLocalizacao: true,
    };
  }

  const totalCanonico = temTotal ? totalInformado : somaLocalizacoes;
  if (Math.abs(somaLocalizacoes - totalCanonico) <= EPSILON) {
    return {
      estoque: totalCanonico,
      estoqueVitrine: vitrineInformada,
      estoqueGalpao: galpaoInformado,
      reconciliado: false,
      legadoSemLocalizacao: false,
    };
  }

  const estoqueGalpao = Math.min(galpaoInformado, totalCanonico);
  const estoqueVitrine = Math.max(0, totalCanonico - estoqueGalpao);

  return {
    estoque: totalCanonico,
    estoqueVitrine,
    estoqueGalpao,
    reconciliado: true,
    legadoSemLocalizacao: false,
  };
};

export const aplicarEstoqueNormalizado = (produto = {}) => {
  const saldo = obterEstoqueProduto(produto);
  return {
    ...produto,
    estoque: saldo.estoque,
    estoqueVitrine: saldo.estoqueVitrine,
    estoqueGalpao: saldo.estoqueGalpao,
  };
};


export const preverBaixaEstoqueProduto = (produto, quantidade) => {
  const qtd = normalizarQuantidadeEstoque(quantidade);
  const saldo = obterEstoqueProduto(produto);
  if (qtd <= 0) return { saldo, movimento: { vitrine: 0, galpao: 0, total: 0 }, suficiente: true };
  const baixaVitrine = Math.min(saldo.estoqueVitrine, qtd);
  const restante = Math.max(0, qtd - baixaVitrine);
  const baixaGalpao = Math.min(saldo.estoqueGalpao, restante);
  return {
    saldo,
    movimento: { vitrine: baixaVitrine, galpao: baixaGalpao, total: baixaVitrine + baixaGalpao },
    suficiente: qtd <= saldo.estoque + EPSILON,
    solicitado: qtd,
  };
};

export const baixarEstoqueProduto = (produto, quantidade) => {
  const qtd = normalizarQuantidadeEstoque(quantidade);
  const saldo = obterEstoqueProduto(produto);

  if (qtd <= 0) {
    return {
      produto: aplicarEstoqueNormalizado(produto),
      movimento: { vitrine: 0, galpao: 0, total: 0 },
    };
  }

  if (qtd - saldo.estoque > EPSILON) {
    const erro = new Error(`Estoque insuficiente para ${produto?.nome || produto?.sku || 'produto'}. Disponível: ${saldo.estoque}; solicitado: ${qtd}.`);
    erro.code = 'ZENOS_ESTOQUE_INSUFICIENTE';
    erro.produtoId = produto?.id;
    erro.disponivel = saldo.estoque;
    erro.solicitado = qtd;
    throw erro;
  }

  const baixaVitrine = Math.min(saldo.estoqueVitrine, qtd);
  const restante = qtd - baixaVitrine;
  const baixaGalpao = Math.min(saldo.estoqueGalpao, restante);

  const estoqueVitrine = Math.max(0, saldo.estoqueVitrine - baixaVitrine);
  const estoqueGalpao = Math.max(0, saldo.estoqueGalpao - baixaGalpao);
  const estoque = estoqueVitrine + estoqueGalpao;

  return {
    produto: {
      ...produto,
      estoque,
      estoqueVitrine,
      estoqueGalpao,
    },
    movimento: {
      vitrine: baixaVitrine,
      galpao: baixaGalpao,
      total: baixaVitrine + baixaGalpao,
    },
    auditoria: {
      antes: { ...saldo },
      depois: { estoque, estoqueVitrine, estoqueGalpao },
    },
  };
};

const distribuirReposicaoLegada = (produto, quantidade) => {
  const qtd = normalizarQuantidadeEstoque(quantidade);
  const vitrineRaw = normalizarQuantidadeEstoque(produto?.estoqueVitrine);
  const galpaoRaw = normalizarQuantidadeEstoque(produto?.estoqueGalpao);

  // Compatibilidade com o caso observado: produto cadastrado somente no depósito.
  if (vitrineRaw <= EPSILON && galpaoRaw > EPSILON) {
    return { vitrine: 0, galpao: qtd, total: qtd };
  }
  return { vitrine: qtd, galpao: 0, total: qtd };
};

export const reporEstoqueProduto = (produto, quantidade, alocacaoPreferida = null) => {
  const qtd = normalizarQuantidadeEstoque(quantidade);
  const saldo = obterEstoqueProduto(produto);
  const preferida = alocacaoPreferida || distribuirReposicaoLegada(produto, qtd);

  let reporVitrine = Math.max(0, normalizarQuantidadeEstoque(preferida.vitrine));
  let reporGalpao = Math.max(0, normalizarQuantidadeEstoque(preferida.galpao));
  const somaPreferida = reporVitrine + reporGalpao;

  if (somaPreferida <= EPSILON) {
    reporVitrine = qtd;
    reporGalpao = 0;
  } else if (Math.abs(somaPreferida - qtd) > EPSILON) {
    const fator = qtd / somaPreferida;
    reporVitrine *= fator;
    reporGalpao *= fator;
  }

  const estoqueVitrine = saldo.estoqueVitrine + reporVitrine;
  const estoqueGalpao = saldo.estoqueGalpao + reporGalpao;

  const estoque = estoqueVitrine + estoqueGalpao;
  return {
    produto: {
      ...produto,
      estoqueVitrine,
      estoqueGalpao,
      estoque,
    },
    movimento: {
      vitrine: reporVitrine,
      galpao: reporGalpao,
      total: reporVitrine + reporGalpao,
    },
    auditoria: {
      antes: { ...saldo },
      depois: { estoque, estoqueVitrine, estoqueGalpao },
    },
  };
};

export const aplicarVendaAoEstoque = (produtos = [], itensVenda = [], referenciasParaRemover = []) => {
  let novosProdutos = (produtos || []).map((produto) => aplicarEstoqueNormalizado(produto));
  const itensComMovimento = [];

  for (const item of itensVenda || []) {
    const referencia = {
      id: item.produtoOriginalId ?? item.id,
      sku: item.produtoOriginalSku ?? item.sku,
    };
    const qtd = normalizarQuantidadeEstoque(item.qtd);
    const ehRemovido = (referenciasParaRemover || []).some((ref) => correspondeIdentidadeProduto(referencia, ref));

    if (item.tipoItem === 'servico' || item.usoUnicoEncomendado || ehRemovido) {
      itensComMovimento.push({
        ...item,
        produtoOriginalId: item.produtoOriginalId ?? item.id,
        produtoOriginalSku: item.produtoOriginalSku ?? item.sku,
      });
      if (ehRemovido) {
        const indiceRemover = localizarIndiceProdutoUnico(novosProdutos, referencia, 'remoção de encomenda');
        if (indiceRemover >= 0) novosProdutos = novosProdutos.filter((_, index) => index !== indiceRemover);
      }
      continue;
    }

    const indice = localizarIndiceProdutoUnico(novosProdutos, referencia, 'baixa de estoque da venda');
    if (indice < 0) {
      const erro = new Error(`Produto da venda não encontrado no catálogo: ${item.nome || referencia.sku || referencia.id}.`);
      erro.code = 'ZENOS_PRODUTO_NAO_ENCONTRADO';
      erro.produtoId = referencia.id;
      throw erro;
    }

    const produto = novosProdutos[indice];
    const resultado = baixarEstoqueProduto(produto, qtd);
    novosProdutos[indice] = resultado.produto;
    itensComMovimento.push({
      ...item,
      produtoOriginalId: item.produtoOriginalId ?? item.id,
      produtoOriginalSku: item.produtoOriginalSku ?? item.sku,
      movimentoEstoqueVenda: resultado.movimento,
      saldoEstoqueVenda: resultado.auditoria,
    });
  }

  return { produtos: novosProdutos, itens: itensComMovimento };
};

const alocacaoCumulativa = (movimentoVenda, quantidadeDevolvida) => {
  const qtd = normalizarQuantidadeEstoque(quantidadeDevolvida);
  const vitrineVendida = normalizarQuantidadeEstoque(movimentoVenda?.vitrine);
  const galpaoVendido = normalizarQuantidadeEstoque(movimentoVenda?.galpao);
  const totalMovimento = vitrineVendida + galpaoVendido;

  if (totalMovimento <= EPSILON) return null;

  const vitrine = Math.min(qtd, vitrineVendida);
  const restante = Math.max(0, qtd - vitrine);
  const galpao = Math.min(restante, galpaoVendido);
  return { vitrine, galpao, total: vitrine + galpao };
};

export const calcularAlocacaoReposicaoDevolucao = (itemVenda, qtdJaDevolvida, qtdDevolvidaAgora) => {
  const antes = alocacaoCumulativa(itemVenda?.movimentoEstoqueVenda, qtdJaDevolvida);
  const depois = alocacaoCumulativa(itemVenda?.movimentoEstoqueVenda, normalizarQuantidadeEstoque(qtdJaDevolvida) + normalizarQuantidadeEstoque(qtdDevolvidaAgora));

  if (!antes || !depois) return null;

  return {
    vitrine: Math.max(0, depois.vitrine - antes.vitrine),
    galpao: Math.max(0, depois.galpao - antes.galpao),
    total: Math.max(0, depois.total - antes.total),
  };
};


export const transferirEstoqueEntreLocais = (produto, origem, destino, quantidade) => {
  const qtd = normalizarQuantidadeEstoque(quantidade);
  const saldo = obterEstoqueProduto(produto);
  if (qtd <= 0) {
    const erro = new Error('Informe uma quantidade maior que zero para movimentar o estoque.');
    erro.code = 'ZENOS_MOVIMENTO_INVALIDO';
    throw erro;
  }

  const origemNormalizada = origem === 'deposito' || origem === 'galpao' ? 'deposito' : 'vitrine';
  const destinoNormalizado = destino === 'deposito' || destino === 'galpao' ? 'deposito' : 'vitrine';
  if (origemNormalizada === destinoNormalizado) {
    const erro = new Error('Origem e destino da transferência não podem ser iguais.');
    erro.code = 'ZENOS_MOVIMENTO_INVALIDO';
    throw erro;
  }

  const disponivel = origemNormalizada === 'vitrine' ? saldo.estoqueVitrine : saldo.estoqueGalpao;
  if (qtd - disponivel > EPSILON) {
    const rotulo = origemNormalizada === 'vitrine' ? 'vitrine' : 'depósito';
    const erro = new Error(`Quantidade insuficiente no ${rotulo}. Disponível: ${disponivel}; solicitado: ${qtd}.`);
    erro.code = 'ZENOS_ESTOQUE_LOCAL_INSUFICIENTE';
    erro.disponivel = disponivel;
    erro.solicitado = qtd;
    erro.origem = origemNormalizada;
    throw erro;
  }

  let estoqueVitrine = saldo.estoqueVitrine;
  let estoqueGalpao = saldo.estoqueGalpao;
  if (origemNormalizada === 'vitrine') {
    estoqueVitrine -= qtd;
    estoqueGalpao += qtd;
  } else {
    estoqueGalpao -= qtd;
    estoqueVitrine += qtd;
  }
  const estoque = estoqueVitrine + estoqueGalpao;

  return {
    produto: { ...produto, estoque, estoqueVitrine, estoqueGalpao },
    movimento: {
      origem: origemNormalizada,
      destino: destinoNormalizado,
      quantidade: qtd,
      antes: { ...saldo },
      depois: { estoque, estoqueVitrine, estoqueGalpao },
    },
  };
};
