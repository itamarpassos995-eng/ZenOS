const moeda = (valor) => Math.round((Number(valor) || 0) * 100) / 100;
const qtd = (valor) => Math.max(0, Number(String(valor ?? '').replace(',', '.')) || 0);

export const subtotalBrutoItensVenda = (venda = {}) => (venda.itens || []).reduce(
  (acc, item) => acc + qtd(item.qtd) * (Number(item.precoPraticadoBRL) || 0),
  0,
);

export const fatorLiquidoDaVenda = (venda = {}) => {
  const subtotal = subtotalBrutoItensVenda(venda);
  if (subtotal <= 0) return 1;
  const total = Math.max(0, Number(venda.totalBRL) || 0);
  return Math.max(0, Math.min(1, total / subtotal));
};

export const precoLiquidoUnitarioItem = (venda, item) => moeda((Number(item?.precoPraticadoBRL) || 0) * fatorLiquidoDaVenda(venda));

export const calcularDevolvidoPelosItens = (venda = {}) => {
  const fator = fatorLiquidoDaVenda(venda);
  return moeda((venda.itens || []).reduce((acc, item) => {
    return acc + qtd(item.qtdDevolvida) * (Number(item.precoPraticadoBRL) || 0) * fator;
  }, 0));
};

export const calcularCustoDevolvidoPelosItens = (venda = {}) => moeda((venda.itens || []).reduce((acc, item) => {
  return acc + qtd(item.qtdDevolvida) * (Number(item.custoBRL) || 0);
}, 0));

export const obterFinanceiroVenda = (venda = {}) => {
  const totalBrutoBRL = moeda(venda.totalBRL || 0);
  const lucroBrutoBRL = moeda(venda.lucroBRL || 0);
  const valorDevolvidoBRL = moeda(venda.valorDevolvidoBRL ?? calcularDevolvidoPelosItens(venda));
  const custoDevolvidoBRL = moeda(venda.custoDevolvidoBRL ?? calcularCustoDevolvidoPelosItens(venda));
  const totalLiquidoBRL = moeda(venda.totalLiquidoBRL ?? Math.max(0, totalBrutoBRL - valorDevolvidoBRL));
  const lucroLiquidoBRL = moeda(venda.lucroLiquidoBRL ?? (lucroBrutoBRL - (valorDevolvidoBRL - custoDevolvidoBRL)));

  return {
    totalBrutoBRL,
    lucroBrutoBRL,
    valorDevolvidoBRL,
    custoDevolvidoBRL,
    totalLiquidoBRL,
    lucroLiquidoBRL,
  };
};

export const calcularValorDevolucaoAtual = (venda, itensParaDevolver = {}) => {
  const fator = fatorLiquidoDaVenda(venda);
  const valor = Object.values(itensParaDevolver).reduce((acc, item) => {
    return acc + qtd(item.qtdSendoDevolvidaAgora) * (Number(item.precoBRL) || 0) * fator;
  }, 0);

  const financeiro = obterFinanceiroVenda(venda);
  const restante = Math.max(0, financeiro.totalBrutoBRL - financeiro.valorDevolvidoBRL);
  return moeda(Math.min(valor, restante));
};

export const calcularCustoDevolucaoAtual = (itensParaDevolver = {}) => moeda(Object.values(itensParaDevolver).reduce((acc, item) => {
  return acc + qtd(item.qtdSendoDevolvidaAgora) * (Number(item.custoBRL) || 0);
}, 0));
