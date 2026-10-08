const toNumber = (value) => {
  const n = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const MAX_MARGEM_PRECO_PCT = 99.9;

export const validarMargemPrecoVenda = (value) => {
  const margem = toNumber(value);
  if (margem < 0) return { ok: false, margem, erro: 'A margem não pode ser negativa.' };
  if (margem >= 100) return { ok: false, margem, erro: 'A margem sobre o preço de venda deve ser menor que 100%.' };
  return { ok: true, margem, erro: null };
};

export const calcularPrecoPorCustoEMargem = (custoValue, margemValue) => {
  const custo = Math.max(0, toNumber(custoValue));
  const validacao = validarMargemPrecoVenda(margemValue);
  if (!(custo > 0)) return { ok: true, valor: '', custo, margem: validacao.margem, erro: null };
  if (!validacao.ok) return { ok: false, valor: '', custo, margem: validacao.margem, erro: validacao.erro };
  const divisor = 1 - (validacao.margem / 100);
  const preco = custo / divisor;
  if (!Number.isFinite(preco) || preco < 0) return { ok: false, valor: '', custo, margem: validacao.margem, erro: 'Não foi possível calcular um preço válido com essa margem.' };
  return { ok: true, valor: preco.toFixed(2), custo, margem: validacao.margem, erro: null };
};

export const calcularMargemPorCustoEPreco = (custoValue, precoValue) => {
  const custo = Math.max(0, toNumber(custoValue));
  const preco = Math.max(0, toNumber(precoValue));
  if (!(preco > 0) || !(custo > 0)) return '0';
  const margem = ((preco - custo) / preco) * 100;
  if (!Number.isFinite(margem)) return '0';
  return margem.toFixed(1);
};
