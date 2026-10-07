const numero = (valor, fallback = 0) => {
  const n = Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

export const normalizarRegrasMargem = (regras = {}) => {
  let idealRaw = numero(regras.margemIdeal, 30);
  let minimaRaw = numero(regras.margemMinima, 15);

  // ATT 08.1: 0/0 desliga o semáforo na prática. Trate configuração vazia/corrompida
  // como padrão seguro em vez de classificar toda venda como verde.
  if (idealRaw <= 0 && minimaRaw <= 0) {
    idealRaw = 30;
    minimaRaw = 15;
  }

  idealRaw = Math.max(0, idealRaw);
  minimaRaw = Math.max(0, minimaRaw);
  const margemIdeal = Math.max(idealRaw, minimaRaw);
  const margemMinima = Math.min(idealRaw, minimaRaw);
  return { margemIdeal, margemMinima };
};

export const classificarMargem = (margemPct, regras = {}) => {
  const margem = numero(margemPct, 0);
  const { margemIdeal, margemMinima } = normalizarRegrasMargem(regras);

  if (margem >= margemIdeal) {
    return {
      faixa: 'verde',
      cor: '#34d399',
      fundo: 'rgba(16, 185, 129, 0.15)',
      borda: 'rgba(16, 185, 129, 0.4)',
      margemIdeal,
      margemMinima,
    };
  }

  if (margem >= margemMinima) {
    return {
      faixa: 'amarelo',
      cor: '#fbbf24',
      fundo: 'rgba(245, 158, 11, 0.15)',
      borda: 'rgba(245, 158, 11, 0.4)',
      margemIdeal,
      margemMinima,
    };
  }

  return {
    faixa: 'vermelho',
    cor: '#fb7185',
    fundo: 'rgba(244, 63, 94, 0.15)',
    borda: 'rgba(244, 63, 94, 0.4)',
    margemIdeal,
    margemMinima,
  };
};

export const calcularMargemPercentual = (faturamento, lucro) => {
  const fat = numero(faturamento, 0);
  const luc = numero(lucro, 0);
  return fat > 0 ? (luc / fat) * 100 : 0;
};
