const limparId = (valor) => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 180) || `MOV-${Date.now()}`;

export const formaEhDinheiro = (forma = '') => {
  const v = String(forma || '').toLowerCase();
  return v.startsWith('dinheiro') || v.includes('gaveta') || v === 'cash';
};

export const criarLancamentoFinanceiro = ({
  id,
  lojaId,
  tipo,
  origem,
  referenciaId,
  valor,
  moeda = 'BRL',
  formaPagamento = 'nao_informado',
  operadorId = 'admin',
  operadorNome = 'Administrador',
  createdAt = new Date().toISOString(),
  afetaCaixaFisico = false,
  afetaResultado = false,
  observacao = '',
  direcao = 'entrada',
  sessaoId = null,
  clienteId = null,
  clienteNome = null,
  saldoClienteAntes = null,
  saldoClienteDepois = null,
  detalhes = null,
}) => {
  const valorNum = Math.max(0, Number(valor) || 0);
  if (!lojaId) throw new Error('Loja não identificada para o lançamento financeiro.');
  if (!tipo) throw new Error('Tipo financeiro obrigatório.');
  if (!referenciaId) throw new Error('Referência financeira obrigatória.');
  if (valorNum <= 0) throw new Error('Valor financeiro deve ser maior que zero.');

  const idFinal = limparId(id || `${tipo}-${referenciaId}-${formaPagamento}`);
  return {
    id: idFinal,
    lojaId: String(lojaId),
    tipo: String(tipo),
    origem: String(origem || 'sistema'),
    referenciaId: String(referenciaId),
    valor: Math.round(valorNum * 100) / 100,
    moeda: String(moeda || 'BRL'),
    formaPagamento: String(formaPagamento || 'nao_informado'),
    operadorId: String(operadorId || 'admin'),
    operadorNome: String(operadorNome || 'Administrador'),
    createdAt,
    afetaCaixaFisico: Boolean(afetaCaixaFisico),
    afetaResultado: Boolean(afetaResultado),
    observacao: String(observacao || ''),
    direcao: direcao === 'saida' ? 'saida' : 'entrada',
    sessaoId: sessaoId ? String(sessaoId) : null,
    clienteId: clienteId ? String(clienteId) : null,
    clienteNome: clienteNome ? String(clienteNome) : null,
    saldoClienteAntes: saldoClienteAntes == null ? null : Number(saldoClienteAntes),
    saldoClienteDepois: saldoClienteDepois == null ? null : Number(saldoClienteDepois),
    detalhes: detalhes && typeof detalhes === 'object' ? detalhes : null,
    schema: 'ATT07_V1_ADITIVO',
  };
};
