import { MOEDAS_CAIXA, interpretarValorMonetario, converterValoresFisicosParaBRL } from './cashMoneyInput.js';
import { vendasDaSessao } from './cashSession.js';

const novoSaldo = () => Object.fromEntries(MOEDAS_CAIXA.map(m => [m, 0]));
const arredondar = (valor, moeda) => Math.round((valor + Number.EPSILON) * (moeda === 'PYG' ? 1 : 100)) / (moeda === 'PYG' ? 1 : 100);
const normalizarMoeda = (codigo) => {
  const m = String(codigo || '').toUpperCase();
  return MOEDAS_CAIXA.includes(m) ? m : null;
};
const moedaPagamento = (p) => normalizarMoeda(p?.moedaOrigem)
  || ({ dinheiro_brl:'BRL', dinheiro_usd:'USD', dinheiro_eur:'EUR', dinheiro_pyg:'PYG' }[String(p?.formaId || '').toLowerCase()])
  || null;
const ehDinheiro = (p) => String(p?.formaId || '').toLowerCase().startsWith('dinheiro');
const dinheiroMovimento = (m) => {
  const conhecidos = ['suprimento', 'sangria', 'recebimento_fiado', 'saida_devolucao', 'saida_despesa', 'saida_compra'];
  return conhecidos.includes(m?.tipo) || m?.afetaGaveta === true;
};
const sentidoMovimento = (m) => ['sangria','saida_devolucao','saida_despesa','saida_compra'].includes(m?.tipo)
  ? -1 : m?.tipo === 'suprimento' || m?.tipo === 'recebimento_fiado'
    ? 1 : m?.direcao === 'saida' ? -1 : 1;

function adicionarDetalhes(saldos, detalhes, sinal, pendencias, contexto) {
  for (const m of MOEDAS_CAIXA) {
    const raw = detalhes?.[m];
    if (raw === undefined || raw === null || raw === '') continue;
    const resultado = interpretarValorMonetario(raw, m, { permitirVazio: true });
    if (!resultado.ok) {
      pendencias.push(contexto + ': quantia inválida de ' + m);
    } else {
      saldos[m] += sinal * resultado.valor;
    }
  }
}

/**
 * Livro físico nativo BRL/USD/EUR/PYG: reconstrução sem reavaliar pagamentos históricos.
 * Registros legados sem identidade monetária são sinalizados; NÃO geram "falta de caixa" conclusiva.
 */
export function calcularConciliacaoFisicaMultimoeda({ sessao, historicoVendas = [], caixaMovimentos = [], contagem = {}, taxas = {} }) {
  const pendencias = [];
  const esperado = novoSaldo();
  if (!sessao) return { confiavel: false, pendencias: ['Sessão ausente'] };

  if (sessao.detalheAberturaNativos || sessao.detalheAbertura) {
    adicionarDetalhes(esperado, sessao.detalheAberturaNativos || sessao.detalheAbertura, 1, pendencias, 'Abertura');
  } else if (Number(sessao.saldoInicial || 0) === 0) {
    // Abertura zerada tem representação inequívoca.
  } else {
    pendencias.push('Abertura legada sem composição de moedas.');
  }

  const vendas = vendasDaSessao({ sessao, historicoVendas });
  for (const venda of vendas) {
    for (const pag of venda.pagamentos || []) {
      if (!pag?.formaId) {
        // Mesas/lançamentos legados sem formaId podem representar dinheiro
        // não contabilizado. Nunca declarar caixa conciliado nesse caso.
        pendencias.push('Venda ' + venda.id + ': pagamento sem forma identificável (registro legado).');
        continue;
      }
      if (!ehDinheiro(pag)) continue;
      const moeda = moedaPagamento(pag);
      if (!moeda || pag.valorOriginal == null) {
        // BRL legado também pode ser reconstruído pelo montante contabilizado.
        if (moeda === 'BRL' && Number.isFinite(Number(pag.valorConvertidoBRL))) {
          esperado.BRL += Number(pag.valorConvertidoBRL);
        } else {
          pendencias.push('Venda ' + venda.id + ': pagamento físico sem valor e moeda de origem.');
        }
        continue;
      }
      const valor = Number(pag.valorOriginal);
      if (!Number.isFinite(valor) || valor < 0) {
        pendencias.push('Venda ' + venda.id + ': pagamento físico inválido.');
      } else {
        esperado[moeda] += valor;
      }
    }
    if (Number(venda.trocoBRL || 0) > 0) {
      const moeda = normalizarMoeda(venda.moedaTrocoInfo) || 'BRL';
      const valorOriginal = venda.trocoOriginal != null && Number(venda.trocoOriginal) > 0
        ? Number(venda.trocoOriginal)
        : (moeda === 'BRL' ? Number(venda.trocoBRL) : NaN);
      if (!Number.isFinite(valorOriginal)) {
        pendencias.push('Venda ' + venda.id + ': troco legado sem quantidade física.');
      } else {
        esperado[moeda] -= valorOriginal;
      }
    }
  }

  const movimentos = (caixaMovimentos || []).filter(m => String(m?.sessaoId || '') === String(sessao.id) && dinheiroMovimento(m));
  for (const mov of movimentos) {
    const sinal = sentidoMovimento(mov);
    const detalhes = mov.detalhesMoedasNativas || mov.detalhesMoedas;
    if (detalhes && typeof detalhes === 'object' && Object.keys(detalhes).length) {
      adicionarDetalhes(esperado, detalhes, sinal, pendencias, 'Movimento ' + mov.id);
    } else if (normalizarMoeda(mov.moedaOrigem) && normalizarMoeda(mov.moedaOrigem) !== 'BRL') {
      // O equivalente contábil em BRL não prova quantas notas de outra moeda
      // entraram ou saíram. Não inventar saldo físico nem aprovar conciliação.
      pendencias.push('Movimento ' + mov.id + ': faltam valores físicos nativos de ' + mov.moedaOrigem + '.');
    } else if (Number.isFinite(Number(mov.valorBRL))) {
      esperado.BRL += sinal * Number(mov.valorBRL);
    } else {
      pendencias.push('Movimento ' + mov.id + ': valor físico não identificável.');
    }
  }

  const contados = novoSaldo();
  adicionarDetalhes(contados, contagem, 1, pendencias, 'Contagem');
  const diferencas = novoSaldo();
  for (const m of MOEDAS_CAIXA) {
    esperado[m] = arredondar(esperado[m], m);
    contados[m] = arredondar(contados[m], m);
    diferencas[m] = arredondar(contados[m] - esperado[m], m);
  }

  const equivalenteEsperado = converterValoresFisicosParaBRL(esperado, taxas);
  const equivalenteContado = converterValoresFisicosParaBRL(contados, taxas);
  // Valor esperado NEGATIVO em uma moeda pode ser legítimo como dado matemático
  // mas indica movimentos inconsistentes; nenhuma diferença conclusiva deve ser imputada.
  for (const m of MOEDAS_CAIXA) if (esperado[m] < 0) {
    pendencias.push('Saldo físico negativo em ' + m + ': registrar/corrigir a movimentação antes de conciliar.');
  }
  if (!equivalenteEsperado.ok || !equivalenteContado.ok) {
    pendencias.push('Cotação inválida ou valor não conversível no fechamento.');
  }

  const confiavel = pendencias.length === 0;
  const divergenciaFisica = MOEDAS_CAIXA.some(m => Math.abs(diferencas[m]) > (m === 'PYG' ? 0 : 0.009));
  return {
    confiavel, pendencias, esperado, contado: contados, diferencas, divergenciaFisica,
    totalEsperadoBRL: equivalenteEsperado.ok ? equivalenteEsperado.totalBRL : null,
    totalContadoBRL: equivalenteContado.ok ? equivalenteContado.totalBRL : null,
    diferencaBRL: equivalenteEsperado.ok && equivalenteContado.ok
      ? Math.round((equivalenteContado.totalBRL - equivalenteEsperado.totalBRL) * 100) / 100 : null,
    quantidadeVendas: vendas.length, quantidadeMovimentos: movimentos.length,
  };
}
