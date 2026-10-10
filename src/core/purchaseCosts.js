const valorFinito = (value) => {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

const arredondarCustoUnitario = (value) => Math.round((valorFinito(value) + Number.EPSILON) * 1e8) / 1e8;

const distribuirCentavos = (centavos, pesos) => {
  const totalPeso = pesos.reduce((sum, peso) => sum + Math.max(0, peso), 0);
  if (!pesos.length || centavos === 0 || totalPeso <= 0) return pesos.map(() => 0);

  const quotas = pesos.map((peso, indice) => {
    const exata = (centavos * Math.max(0, peso)) / totalPeso;
    const base = Math.floor(exata);
    return { indice, base, residuo: exata - base };
  });
  let restante = centavos - quotas.reduce((sum, quota) => sum + quota.base, 0);
  const porResiduo = [...quotas].sort((a, b) => b.residuo - a.residuo || a.indice - b.indice);
  for (let indice = 0; restante > 0; indice = (indice + 1) % porResiduo.length) {
    porResiduo[indice].base += 1;
    restante -= 1;
  }

  const alocacoes = Array(pesos.length).fill(0);
  quotas.forEach(quota => { alocacoes[quota.indice] = quota.base; });
  return alocacoes;
};

export const ratearCustosAquisicao = (itens = [], custosAdicionaisBRL = 0, descontoCompraBRL = 0) => {
  const linhas = (Array.isArray(itens) ? itens : []).map(item => {
    const quantidade = Math.max(0, valorFinito(item?.qtd));
    const custoFornecedorUnitarioBRL = Math.max(0, valorFinito(item?.custoPraticadoBRL));
    return {
      item,
      quantidade,
      custoFornecedorUnitarioBRL,
      subtotalAquisicaoBRL: quantidade * custoFornecedorUnitarioBRL,
    };
  });
  if (linhas.length === 0) return [];

  const subtotalAquisicaoBRL = linhas.reduce((sum, linha) => sum + linha.subtotalAquisicaoBRL, 0);
  const pesos = subtotalAquisicaoBRL > 0
    ? linhas.map(linha => linha.subtotalAquisicaoBRL)
    : linhas.map(linha => linha.quantidade);
  const custoFornecedorTotalCentavos = Math.round((subtotalAquisicaoBRL + Number.EPSILON) * 100);
  const custosAdicionaisCentavos = Math.round((valorFinito(custosAdicionaisBRL) + Number.EPSILON) * 100);
  const descontoCompraCentavos = Math.round((valorFinito(descontoCompraBRL) + Number.EPSILON) * 100);
  const custoFornecedorAlocado = distribuirCentavos(custoFornecedorTotalCentavos, pesos);
  const custoAdicionalAlocado = distribuirCentavos(Math.abs(custosAdicionaisCentavos), pesos)
    .map(value => Math.sign(custosAdicionaisCentavos) * value);
  const descontoAlocado = distribuirCentavos(Math.abs(descontoCompraCentavos), pesos)
    .map(value => Math.sign(descontoCompraCentavos) * value);

  return linhas.map((linha, indice) => {
    const custoFinalCentavos = custoFornecedorAlocado[indice] + custoAdicionalAlocado[indice] - descontoAlocado[indice];
    if (custoFinalCentavos < 0) {
      throw new Error(`O desconto alocado excede o custo de aquisição do item ${linha.item?.nome || linha.item?.sku || indice + 1}.`);
    }
    const custoFinalAquisicaoBRL = custoFinalCentavos / 100;
    return {
      ...linha.item,
      custoFornecedorBRL: linha.custoFornecedorUnitarioBRL,
      custoFornecedorTotalBRL: custoFornecedorAlocado[indice] / 100,
      custoAdicionalAlocadoBRL: custoAdicionalAlocado[indice] / 100,
      descontoCompraAlocadoBRL: descontoAlocado[indice] / 100,
      custoFinalAquisicaoBRL,
      custoFinalAquisicaoUnitarioBRL: linha.quantidade > 0
        ? custoFinalAquisicaoBRL / linha.quantidade
        : 0,
    };
  });
};

export const calcularCustoMedioMovel = ({
  estoqueAnterior = 0,
  custoAnteriorBRL,
  quantidadeEntrada = 0,
  custoFinalEntradaUnitarioBRL = 0,
}) => {
  const quantidadeAnterior = Math.max(0, valorFinito(estoqueAnterior));
  const quantidadeNova = Math.max(0, valorFinito(quantidadeEntrada));
  const custoEntrada = Math.max(0, valorFinito(custoFinalEntradaUnitarioBRL));
  const custoAnterior = Math.max(0, valorFinito(custoAnteriorBRL));
  const quantidadeTotal = quantidadeAnterior + quantidadeNova;

  if (quantidadeTotal <= 0) return custoAnterior;
  const valorAnterior = quantidadeAnterior * custoAnterior;
  const valorEntrada = quantidadeNova * custoEntrada;
  return arredondarCustoUnitario((valorAnterior + valorEntrada) / quantidadeTotal);
};
