import { chaveAuditoriaProduto } from './productIdentity.js';
const PLANOS_HISTORICO = {
  basico: { dias: 30, limite: 200, rotulo: 'Básico' },
  essencial: { dias: 90, limite: 500, rotulo: 'Essencial' },
  pro: { dias: 365, limite: 2000, rotulo: 'Pro' },
  avancado: { dias: 365, limite: 2000, rotulo: 'Pro' },
  multi: { dias: 3650, limite: 5000, rotulo: 'Multi-Filiais' },
  multifiliais: { dias: 3650, limite: 5000, rotulo: 'Multi-Filiais' },
};

const numero = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

export const normalizarPlanoHistorico = (plano) => {
  const chave = String(plano || 'basico').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (chave.includes('multi')) return 'multi';
  if (chave.includes('essencial')) return 'essencial';
  if (chave.includes('pro') || chave.includes('avanc')) return 'pro';
  return 'basico';
};

export const obterPoliticaHistoricoEstoque = (plano) => {
  const id = normalizarPlanoHistorico(plano);
  return { id, ...PLANOS_HISTORICO[id] };
};

export const dataMinimaHistoricoPlano = (plano, referencia = new Date()) => {
  const politica = obterPoliticaHistoricoEstoque(plano);
  const data = new Date(referencia);
  data.setDate(data.getDate() - politica.dias);
  return data;
};

export const criarEventoEstoque = ({
  produto,
  tipo,
  origem = null,
  destino = null,
  quantidade = 0,
  saldoAntes = null,
  saldoDepois = null,
  motivo = '',
  observacao = '',
  operador = null,
  referenciaId = null,
  detalhes = null,
  createdAt = null,
  id = null,
}) => {
  const instante = createdAt || new Date().toISOString();
  const produtoId = produto?.produtoOriginalId ?? produto?.id ?? 'sem-id';
  const produtoSku = produto?.produtoOriginalSku ?? produto?.sku ?? '';
  return {
    id: id || `MOVEST-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    produtoId,
    produtoAuditKey: chaveAuditoriaProduto(produtoId, produtoSku),
    sku: produtoSku,
    produtoNome: produto?.nome || '',
    tipo,
    origem,
    destino,
    quantidade: Math.max(0, numero(quantidade)),
    saldoAntes: saldoAntes ? {
      vitrine: numero(saldoAntes.estoqueVitrine ?? saldoAntes.vitrine),
      deposito: numero(saldoAntes.estoqueGalpao ?? saldoAntes.deposito ?? saldoAntes.galpao),
      total: numero(saldoAntes.estoque ?? saldoAntes.total),
    } : null,
    saldoDepois: saldoDepois ? {
      vitrine: numero(saldoDepois.estoqueVitrine ?? saldoDepois.vitrine),
      deposito: numero(saldoDepois.estoqueGalpao ?? saldoDepois.deposito ?? saldoDepois.galpao),
      total: numero(saldoDepois.estoque ?? saldoDepois.total),
    } : null,
    motivo: String(motivo || '').trim(),
    observacao: String(observacao || '').trim(),
    operadorId: operador?.id || 'admin',
    operadorNome: operador?.nome || 'Administrador',
    referenciaId: referenciaId || null,
    detalhes: detalhes || null,
    createdAt: instante,
  };
};

export const historicoPermitidoPeloPlano = (createdAt, plano, referencia = new Date()) => {
  const data = new Date(createdAt);
  if (Number.isNaN(data.getTime())) return false;
  return data >= dataMinimaHistoricoPlano(plano, referencia) && data <= referencia;
};
