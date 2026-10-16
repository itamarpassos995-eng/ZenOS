const n = (v) => Number(v) || 0;

export function timestampSessao(sessao) {
  const idTs = Number(String(sessao?.id || '').split('-')[1]);
  if (Number.isFinite(idTs) && idTs > 0) return idTs;
  const dt = Date.parse(sessao?.createdAt || sessao?.abertura || '');
  return Number.isFinite(dt) ? dt : 0;
}

export function timestampVenda(venda) {
  const dt = Date.parse(venda?.createdAt || '');
  if (Number.isFinite(dt)) return dt;
  const idTs = Number(String(venda?.id || '').split('-').at(-1));
  return Number.isFinite(idTs) ? idTs : 0;
}

// Uma única regra de inclusão para o cálculo financeiro, o comprovante e o fechamento.
export function vendasDaSessao({ sessao, historicoVendas = [] }) {
  if (!sessao) return [];
  const inicio = timestampSessao(sessao);
  const fim = sessao.fechamento ? Date.parse(sessao.fechamento) : Infinity;
  return (historicoVendas || []).filter(v => {
    const estadoComFluxo = v.estado === 'concluida' || v.estado === 'parcial' || (v.estado === 'cancelada' && Array.isArray(v.pagamentos) && v.pagamentos.length > 0);
    if (!estadoComFluxo) return false;
    if (v.sessaoId != null && String(v.sessaoId).trim() !== '') {
      return String(v.sessaoId) === String(sessao.id);
    }
    // Compatibilidade de leitura apenas. Nenhuma venda antiga é reescrita.
    return String(v.vendedorId || '') === String(sessao.operadorId || '')
      && timestampVenda(v) >= inicio && timestampVenda(v) <= fim;
  });
}

export function assinaturaFinanceiraSessao({ sessao, historicoVendas = [], caixaMovimentos = [] }) {
  if (!sessao) return '';
  const vendas = vendasDaSessao({ sessao, historicoVendas })
    .map(v => [
      String(v.id), v.estado, String(v.sessaoId ?? ''), String(v.vendedorId ?? ''),
      v.createdAt ?? '', Number(v.trocoBRL || 0), v.moedaTrocoInfo ?? '',
      v.trocoOriginal ?? null,
      (v.pagamentos || []).map(p => [p.formaId ?? '', p.moedaOrigem ?? '',
        p.valorOriginal ?? null, p.valorConvertidoBRL ?? null]),
    ]).sort((a,b) => a[0].localeCompare(b[0]));
  const movimentos = (caixaMovimentos || []).filter(m => String(m.sessaoId || '') === String(sessao.id))
    .map(m => [
      String(m.id), m.tipo, m.direcao, m.afetaGaveta, m.valorBRL,
      ['BRL','USD','EUR','PYG'].map(x => [
        m.detalhesMoedasNativas?.[x] ?? null, m.detalhesMoedas?.[x] ?? null,
      ]),
    ]).sort((a,b) => a[0].localeCompare(b[0]));
  const abertura = ['BRL','USD','EUR','PYG'].map(m => [
    sessao.detalheAberturaNativos?.[m] ?? null, sessao.detalheAbertura?.[m] ?? null,
  ]);
  const texto = JSON.stringify([
    sessao.id, sessao.operadorId, sessao.status, sessao.saldoInicial,
    sessao.createdAt, sessao.fechamento ?? null, abertura, vendas, movimentos,
  ]);
  // Assinatura determinística compacta para bloquear mudanças entre a contagem e o commit.
  // Não é uma assinatura criptográfica/autenticação: é um marcador de concorrência.
  let h = 2166136261 >>> 0;
  let h2 = 5381 >>> 0;
  for (let i = 0; i < texto.length; i += 1) {
    h = Math.imul(h ^ texto.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2, 33) + texto.charCodeAt(i) >>> 0;
  }
  return [vendas.length, movimentos.length, texto.length, h.toString(16), h2.toString(16)].join(':');
}

export function calcularResumoSessao({ sessao, historicoVendas = [], caixaMovimentos = [] }) {
  if (!sessao) return null;
  const vendas = vendasDaSessao({ sessao, historicoVendas });
  const movs = (caixaMovimentos || []).filter(m => String(m.sessaoId || '') === String(sessao.id || ''));

  const vendasDinheiro = vendas.reduce((acc, v) => {
    const dinheiro = (v.pagamentos || [])
      .filter(p => String(p.formaId || '').startsWith('dinheiro'))
      .reduce((s, p) => s + n(p.valorConvertidoBRL), 0);
    return acc + Math.max(0, dinheiro - n(v.trocoBRL));
  }, 0);

  const porTipo = (tipo) => movs.filter(m => m.tipo === tipo).reduce((acc, m) => acc + n(m.valorBRL), 0);
  const suprimentos = porTipo('suprimento');
  const sangrias = porTipo('sangria');
  const recebimentosDinheiro = porTipo('recebimento_fiado');
  const devolucoesDinheiro = porTipo('saida_devolucao');
  const despesasDinheiro = porTipo('saida_despesa');
  const comprasDinheiro = porTipo('saida_compra');

  const tiposConhecidos = new Set(['suprimento', 'sangria', 'recebimento_fiado', 'saida_devolucao', 'saida_despesa', 'saida_compra']);
  const outrasEntradas = movs.filter(m => !tiposConhecidos.has(m.tipo) && m.afetaGaveta === true && m.direcao === 'entrada').reduce((a,m)=>a+n(m.valorBRL),0);
  const outrasSaidas = movs.filter(m => !tiposConhecidos.has(m.tipo) && m.afetaGaveta === true && m.direcao === 'saida').reduce((a,m)=>a+n(m.valorBRL),0);

  const saldoEsperado = n(sessao.saldoInicial) + vendasDinheiro + recebimentosDinheiro + suprimentos + outrasEntradas - sangrias - devolucoesDinheiro - despesasDinheiro - comprasDinheiro - outrasSaidas;

  return {
    sessaoId: sessao.id,
    operadorId: sessao.operadorId,
    operadorNome: sessao.operadorNome,
    abertura: sessao.abertura,
    saldoInicial: n(sessao.saldoInicial),
    vendasDinheiro,
    recebimentosDinheiro,
    suprimentos,
    sangrias,
    devolucoesDinheiro,
    despesasDinheiro,
    comprasDinheiro,
    outrasEntradas,
    outrasSaidas,
    saldoEsperado: Math.round(saldoEsperado * 100) / 100,
    status: sessao.status,
  };
}


const normalizarFormaEletronica = (forma = '') => String(forma || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

export function calcularConciliacaoEletronicaSessao({ sessao, livroFinanceiro = [] }) {
  if (!sessao) return null;
  const lancamentos = (livroFinanceiro || []).filter(l => String(l?.sessaoId || '') === String(sessao.id || ''));
  const classificar = (l) => {
    const forma = normalizarFormaEletronica(l?.formaPagamento);
    if (forma.includes('pix')) return 'pix';
    if (forma.includes('cartaocredito') || forma.includes('creditcard')) return 'cartaoCredito';
    if (forma.includes('cartaodebito') || forma.includes('debitcard')) return 'cartaoDebito';
    return null;
  };
  const somar = (lista, direcao) => lista
    .filter(l => (l?.direcao === 'saida' ? 'saida' : 'entrada') === direcao)
    .reduce((acc, l) => acc + n(l?.valor), 0);
  const porTipo = (tipo) => lancamentos.filter(l => classificar(l) === tipo);
  const pixLancamentos = porTipo('pix');
  const creditoLancamentos = porTipo('cartaoCredito');
  const debitoLancamentos = porTipo('cartaoDebito');
  const pixEntradas = somar(pixLancamentos, 'entrada');
  const pixSaidas = somar(pixLancamentos, 'saida');
  const cartaoCreditoEntradas = somar(creditoLancamentos, 'entrada');
  const cartaoCreditoSaidas = somar(creditoLancamentos, 'saida');
  const cartaoDebitoEntradas = somar(debitoLancamentos, 'entrada');
  const cartaoDebitoSaidas = somar(debitoLancamentos, 'saida');
  return {
    // aliases preservados para a UI aprovada da ATT 07.1
    pixRegistrado: pixEntradas,
    cartoesRegistrados: cartaoCreditoEntradas + cartaoDebitoEntradas,
    pixEntradas,
    pixSaidas,
    pixLiquido: Math.round((pixEntradas - pixSaidas) * 100) / 100,
    cartaoCreditoEntradas,
    cartaoCreditoSaidas,
    cartaoCreditoLiquido: Math.round((cartaoCreditoEntradas - cartaoCreditoSaidas) * 100) / 100,
    cartaoDebitoEntradas,
    cartaoDebitoSaidas,
    cartaoDebitoLiquido: Math.round((cartaoDebitoEntradas - cartaoDebitoSaidas) * 100) / 100,
    pixLancamentos,
    cartaoCreditoLancamentos: creditoLancamentos,
    cartaoDebitoLancamentos: debitoLancamentos,
  };
}
