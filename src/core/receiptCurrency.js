const CONFIG = {
  BRL: { locale: 'pt-BR', currency: 'BRL' },
  USD: { locale: 'en-US', currency: 'USD' },
  EUR: { locale: 'de-DE', currency: 'EUR' },
  PYG: { locale: 'es-PY', currency: 'PYG' },
};

export const MOEDAS_RECIBO = Object.freeze(['BRL', 'USD', 'PYG', 'EUR']);

export const normalizarCotacoesRecibo = (taxas = {}) => ({
  BRL: 1,
  USD: Number(taxas?.USD) > 0 ? Number(taxas.USD) : 0,
  EUR: Number(taxas?.EUR) > 0 ? Number(taxas.EUR) : 0,
  PYG: Number(taxas?.PYG) > 0 ? Number(taxas.PYG) : 0,
});

export const moedasAtivasRecibo = (taxas = {}) => {
  const t = normalizarCotacoesRecibo(taxas);
  return MOEDAS_RECIBO.filter(codigo => codigo === 'BRL' || t[codigo] > 0);
};

export const formatarEquivalenciaBRL = (valorBRL, codigo, taxas = {}) => {
  const t = normalizarCotacoesRecibo(taxas);
  const cfg = CONFIG[codigo] || CONFIG.BRL;
  const taxa = codigo === 'BRL' ? 1 : t[codigo];
  const valor = (Number(valorBRL) || 0) * (taxa > 0 ? taxa : 0);
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cfg.currency,
      maximumFractionDigits: codigo === 'PYG' ? 0 : 2,
    }).format(valor);
  } catch {
    return `${codigo} ${codigo === 'PYG' ? Math.round(valor) : valor.toFixed(2)}`;
  }
};
