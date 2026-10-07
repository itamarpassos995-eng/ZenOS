import { obterBaseComissaoVenda } from './commissions.js';
import { obterFinanceiroVenda } from './salesFinancials.js';
import { calcularMargemPercentual, classificarMargem } from './profitability.js';

const numero = (valor, fallback = 0) => {
  const n = Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (valor, min = 0, max = Number.POSITIVE_INFINITY) => Math.min(max, Math.max(min, numero(valor, min)));

export const TIPOS_BONUS = [
  { id: 'faturamento', label: 'Faturamento mínimo', unidade: 'moeda' },
  { id: 'lucro', label: 'Lucro mínimo', unidade: 'moeda' },
  { id: 'atendimentos', label: 'Quantidade de vendas', unidade: 'numero' },
  { id: 'ticket_medio', label: 'Ticket médio mínimo', unidade: 'moeda' },
  { id: 'margem_media', label: 'Margem média mínima', unidade: 'percentual' },
  { id: 'vendas_verdes', label: 'Vendas na faixa verde', unidade: 'numero' },
  { id: 'sem_devolucoes', label: 'Sem devoluções no período', unidade: 'booleano' },
];

export const REGRAS_COMISSAO_PADRAO = Object.freeze({
  baseCalculo: 'lucro',
  pctVerde: 5,
  pctAmarelo: 3,
  pctVermelho: 1,
  bonusFixo: 0,
  protecaoPrejuizo: true,
  bonusRegras: [],
});

const gerarIdBonus = () => `BONUS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const normalizarRegraBonus = (regra = {}, indice = 0) => {
  const tipoValido = TIPOS_BONUS.some(item => item.id === regra.tipo) ? regra.tipo : 'faturamento';
  const nomePadrao = TIPOS_BONUS.find(item => item.id === tipoValido)?.label || 'Bonificação';
  return {
    id: String(regra.id || `BONUS-LEGADO-${indice}`),
    nome: String(regra.nome || nomePadrao).trim() || nomePadrao,
    tipo: tipoValido,
    meta: tipoValido === 'sem_devolucoes' ? 0 : clamp(regra.meta, 0),
    valorBonus: clamp(regra.valorBonus ?? regra.valor, 0),
    ativo: regra.ativo !== false,
  };
};

export const criarRegraBonus = (tipo = 'faturamento') => normalizarRegraBonus({
  id: gerarIdBonus(),
  tipo,
  nome: TIPOS_BONUS.find(item => item.id === tipo)?.label || 'Bonificação',
  meta: tipo === 'sem_devolucoes' ? 0 : 0,
  valorBonus: 0,
  ativo: true,
});

export const normalizarRegrasComissao = (regras = {}) => ({
  baseCalculo: regras.baseCalculo === 'faturamento' ? 'faturamento' : 'lucro',
  pctVerde: clamp(regras.pctVerde ?? REGRAS_COMISSAO_PADRAO.pctVerde, 0, 100),
  pctAmarelo: clamp(regras.pctAmarelo ?? REGRAS_COMISSAO_PADRAO.pctAmarelo, 0, 100),
  pctVermelho: clamp(regras.pctVermelho ?? REGRAS_COMISSAO_PADRAO.pctVermelho, 0, 100),
  bonusFixo: clamp(regras.bonusFixo ?? REGRAS_COMISSAO_PADRAO.bonusFixo, 0),
  // Regra estrutural do ZenOS: prejuízo nunca gera comissão.
  protecaoPrejuizo: true,
  bonusRegras: Array.isArray(regras.bonusRegras)
    ? regras.bonusRegras.map((regra, indice) => normalizarRegraBonus(regra, indice))
    : [],
});

const percentualDaFaixa = (faixa, regras) => {
  if (faixa === 'verde') return regras.pctVerde;
  if (faixa === 'amarelo') return regras.pctAmarelo;
  return regras.pctVermelho;
};

export const calcularComissaoVenda = (venda, regrasEntrada = {}, regrasMargem = {}) => {
  const regras = normalizarRegrasComissao(regrasEntrada);
  const base = obterBaseComissaoVenda(venda);
  const faixa = classificarMargem(base.margemLiquidaPct, regrasMargem);
  const pct = percentualDaFaixa(faixa.faixa, regras);
  const houvePrejuizo = base.lucroLiquidoBRL <= 0;
  const valorBase = regras.baseCalculo === 'faturamento'
    ? Math.max(0, base.faturamentoLiquidoBRL)
    : Math.max(0, base.lucroLiquidoBRL);
  const comissaoTeorica = houvePrejuizo ? 0 : valorBase * (pct / 100);
  const tetoFinanceiro = Math.max(0, base.lucroLiquidoBRL);
  const comissao = Math.min(Number.isFinite(comissaoTeorica) ? Math.max(0, comissaoTeorica) : 0, tetoFinanceiro);

  return {
    ...base,
    faixa,
    pctAplicada: pct,
    valorBase,
    baseCalculo: regras.baseCalculo,
    houvePrejuizo,
    comissaoTeorica,
    tetoFinanceiro,
    limitadaPeloLucro: !houvePrejuizo && comissaoTeorica > tetoFinanceiro,
    comissao,
  };
};

export const avaliarRegraBonus = (regraEntrada, metricas = {}) => {
  const regra = normalizarRegraBonus(regraEntrada);
  let atual = 0;
  let atingida = false;
  const metaValida = regra.meta > 0;

  switch (regra.tipo) {
    case 'lucro':
      atual = metricas.totalLucro || 0;
      atingida = metaValida && atual >= regra.meta;
      break;
    case 'atendimentos':
      atual = metricas.totalAtendimentos || 0;
      atingida = metaValida && atual >= regra.meta;
      break;
    case 'ticket_medio':
      atual = metricas.ticketMedio || 0;
      atingida = metaValida && atual >= regra.meta;
      break;
    case 'margem_media':
      atual = metricas.margemMediaPct || 0;
      atingida = metaValida && atual >= regra.meta;
      break;
    case 'vendas_verdes':
      atual = metricas.qtdVerde || 0;
      atingida = metaValida && atual >= regra.meta;
      break;
    case 'sem_devolucoes':
      atual = metricas.qtdDevolucoes || 0;
      atingida = (metricas.totalAtendimentos || 0) > 0 && atual === 0;
      break;
    case 'faturamento':
    default:
      atual = metricas.totalVendas || 0;
      atingida = metaValida && atual >= regra.meta;
      break;
  }

  const progressoPct = regra.tipo === 'sem_devolucoes'
    ? (atingida ? 100 : 0)
    : regra.meta > 0
      ? Math.max(0, Math.min(100, (atual / regra.meta) * 100))
      : (atingida ? 100 : 0);

  return {
    ...regra,
    atual,
    atingida: regra.ativo && atingida,
    progressoPct,
    valorConquistado: regra.ativo && atingida ? regra.valorBonus : 0,
  };
};

export const gerarRelatorioComissoes = (vendas = [], regrasEntrada = {}, regrasMargem = {}) => {
  const regras = normalizarRegrasComissao(regrasEntrada);
  const porVendedor = {};

  for (const venda of vendas) {
    const id = String(venda?.vendedorId || 'desconhecido');
    if (!porVendedor[id]) {
      porVendedor[id] = {
        id,
        nome: venda?.vendedorNome || 'Desconhecido',
        totalVendas: 0,
        totalLucro: 0,
        totalAtendimentos: 0,
        qtdVerde: 0,
        qtdAmarelo: 0,
        qtdVermelho: 0,
        qtdPrejuizo: 0,
        qtdComissaoLimitada: 0,
        qtdDevolucoes: 0,
        comissaoVerde: 0,
        comissaoAmarelo: 0,
        comissaoVermelho: 0,
        comissaoBaseTotal: 0,
      };
    }

    const linha = porVendedor[id];
    const calculo = calcularComissaoVenda(venda, regras, regrasMargem);
    const financeiro = obterFinanceiroVenda(venda);

    linha.totalAtendimentos += 1;
    linha.totalVendas += calculo.faturamentoLiquidoBRL;
    linha.totalLucro += calculo.lucroLiquidoBRL;
    if ((financeiro.valorDevolvidoBRL || 0) > 0 || (Array.isArray(venda?.devolucoes) && venda.devolucoes.length > 0)) linha.qtdDevolucoes += 1;
    if (calculo.houvePrejuizo) linha.qtdPrejuizo += 1;
    if (calculo.limitadaPeloLucro) linha.qtdComissaoLimitada += 1;

    if (calculo.faixa.faixa === 'verde') {
      linha.qtdVerde += 1;
      linha.comissaoVerde += calculo.comissao;
    } else if (calculo.faixa.faixa === 'amarelo') {
      linha.qtdAmarelo += 1;
      linha.comissaoAmarelo += calculo.comissao;
    } else {
      linha.qtdVermelho += 1;
      linha.comissaoVermelho += calculo.comissao;
    }
    linha.comissaoBaseTotal += calculo.comissao;
  }

  return Object.values(porVendedor).map(linha => {
    const margemMediaPct = calcularMargemPercentual(linha.totalVendas, linha.totalLucro);
    const ticketMedio = linha.totalAtendimentos > 0 ? linha.totalVendas / linha.totalAtendimentos : 0;
    const metricas = { ...linha, margemMediaPct, ticketMedio };
    const bonusAvaliados = regras.bonusRegras.filter(r => r.ativo).map(r => avaliarRegraBonus(r, metricas));
    const bonusFixoTotal = regras.bonusFixo * linha.totalAtendimentos;
    const bonusMetasTotal = bonusAvaliados.reduce((soma, item) => soma + item.valorConquistado, 0);
    const totalBonus = bonusFixoTotal + bonusMetasTotal;

    return {
      ...linha,
      margemMediaPct,
      ticketMedio,
      faixaMargem: classificarMargem(margemMediaPct, regrasMargem),
      bonusAvaliados,
      bonusFixoTotal,
      bonusMetasTotal,
      totalBonus,
      comissaoTotal: linha.comissaoBaseTotal + totalBonus,
      baseCalculo: regras.baseCalculo,
    };
  }).sort((a, b) => b.comissaoTotal - a.comissaoTotal);
};
