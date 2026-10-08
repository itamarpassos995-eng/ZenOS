import React, { useState, useRef } from 'react';
import { calcularAlocacaoReposicaoDevolucao, reporEstoqueProduto } from '../core/inventory';
import { calcularCustoDevolucaoAtual, calcularValorDevolucaoAtual, obterFinanceiroVenda, precoLiquidoUnitarioItem } from '../core/salesFinancials';
import { ehEncomendaUsoUnico } from '../core/orderItems';
import { db } from '../firebase';
import { criarEventoEstoque, registrarEventosEstoque } from '../core/stockAudit';
import { localizarIndiceProdutoUnico } from '../core/productIdentity';
import ZenModal from './ZenModal';
import { normalizarPerfilLoja, larguraCssRecibo } from '../core/storeProfile';
import { calcularResumoSessao } from '../core/cashSession';
import { formatarEquivalenciaBRL, moedasAtivasRecibo } from '../core/receiptCurrency';

export default function Vendas({ commitOperacaoNegocio, taxasCambio = {}, sessoesCaixa = [], registrarFinanceiro, caixaMovimentos = [], setCaixaMovimentos, sessaoAtiva, saldoSessaoFisicoBRL = 0, perfilLoja, vouchers = [], setVouchers, userId, operadorAtivo, historicoVendas, setHistoricoVendas, produtos, setProdutos, clientes, setClientes, fmt, t, tx, patenteUsuario, moeda, converterDeBRL }) {
  const [vendaExpandida, setVendaExpandida] = useState(null);
  const [cupomParaImprimir, setCupomParaImprimir] = useState(null);

  const [modalDevolucaoAberto, setModalDevolucaoAberto] = useState(false);
  const [vendaSendoDevolvida, setVendaSendoDevolvida] = useState(null);
  const [itensParaDevolver, setItensParaDevolver] = useState({});
  const [metodoReembolso, setMetodoReembolso] = useState('dinheiro');
  const [modalZen, setModalZen] = useState(null);
  const [mostrarVouchers, setMostrarVouchers] = useState(false);
  const [sessaoReembolsoId, setSessaoReembolsoId] = useState('');
  const [processandoDevolucao, setProcessandoDevolucao] = useState(false);
  const devolucaoEmAndamentoRef = useRef(false);
  const devolucaoOperacaoRef = useRef({ assinatura: null, id: null });
  const perfilRecibo = normalizarPerfilLoja(perfilLoja);
  const caixasAbertos = (sessoesCaixa || [])
    .filter(s => s?.status === 'aberta')
    .map(sessao => ({ sessao, resumo: calcularResumoSessao({ sessao, historicoVendas, caixaMovimentos }) }))
    .filter(x => x.resumo)
    .sort((a,b) => Number(b.resumo.saldoEsperado || 0) - Number(a.resumo.saldoEsperado || 0));
  const caixaReembolsoSelecionado = caixasAbertos.find(x => String(x.sessao.id) === String(sessaoReembolsoId)) || null;
  const cotacoesReimpressao = cupomParaImprimir?.taxasCambio || taxasCambio || {};
  const moedasReimpressao = moedasAtivasRecibo(cotacoesReimpressao);

  const pedirConfirmacaoZen = ({ titulo, mensagem, detalhes = [], confirmarTexto = 'Confirmar', variante = 'warning' }) =>
    new Promise(resolve => setModalZen({ variante, titulo, mensagem, detalhes, confirmarTexto, cancelarTexto: 'Cancelar', resolver: resolve }));

  const avisarZen = ({ titulo, mensagem, detalhes = [], variante = 'info' }) =>
    setModalZen({ variante, titulo, mensagem, detalhes, apenasConfirmar: true });

  const iniciarDevolucao = (venda) => {
    if (patenteUsuario !== 'gerencia') return avisarZen({ variante:'danger', titulo:'Acesso negado', mensagem:tx('Apenas a Gerência pode processar devoluções.', 'Solo Gerencia puede procesar devoluciones.', 'Management access required.') });
    if (venda.estado === 'cancelada') return avisarZen({ variante:'warning', titulo:'Venda já cancelada', mensagem:tx('Esta venda já foi totalmente cancelada.', 'Esta venta ya fue cancelada.', 'This sale is already canceled.') });

    setVendaSendoDevolvida(venda);
    const itensIniciais = {};
    venda.itens.forEach(it => {
      const qtdOriginal = Number(it.qtd) || 0;
      const qtdJaDevolvida = Number(it.qtdDevolvida) || 0;
      itensIniciais[it.id] = {
        qtdOriginal,
        qtdJaDevolvida,
        qtdDisponivel: Math.max(0, qtdOriginal - qtdJaDevolvida),
        qtdSendoDevolvidaAgora: 0,
        precoBRL: Number(it.precoPraticadoBRL) || 0,
        precoLiquidoBRL: precoLiquidoUnitarioItem(venda, it),
        custoBRL: Number(it.custoBRL) || 0,
        nome: it.nome,
        sku: it.sku,
        produtoOriginalId: it.produtoOriginalId ?? it.id,
        produtoOriginalSku: it.produtoOriginalSku ?? it.sku,
        movimentoEstoqueVenda: it.movimentoEstoqueVenda || null,
        usoUnicoEncomendado: ehEncomendaUsoUnico(it),
        tipoItem: it.tipoItem || 'mercadoria'
      };
    });
    setItensParaDevolver(itensIniciais);
    setMetodoReembolso('dinheiro');
    const caixaAtual = caixasAbertos.find(x => String(x.sessao.id) === String(sessaoAtiva?.id) && Number(x.resumo.saldoEsperado || 0) > 0);
    const caixaPreferido = caixaAtual || caixasAbertos.find(x => Number(x.resumo.saldoEsperado || 0) > 0) || caixasAbertos[0] || null;
    setSessaoReembolsoId(caixaPreferido?.sessao?.id || '');
    setModalDevolucaoAberto(true);
  };

  const alterarQtdDevolucao = (id, delta) => {
    setItensParaDevolver(prev => {
      const item = prev[id];
      const novaQtd = Math.max(0, Math.min(item.qtdDisponivel, item.qtdSendoDevolvidaAgora + delta));
      return { ...prev, [id]: { ...item, qtdSendoDevolvidaAgora: novaQtd } };
    });
  };

  const selecionarTodosParaDevolver = () => {
    setItensParaDevolver(prev => {
      const novo = { ...prev };
      Object.keys(novo).forEach(id => { novo[id].qtdSendoDevolvidaAgora = novo[id].qtdDisponivel; });
      return novo;
    });
  };

  const calcularTotalDevolucaoBRL = () => calcularValorDevolucaoAtual(vendaSendoDevolvida || {}, itensParaDevolver);

  const confirmarDevolucao = async () => {
    if (devolucaoEmAndamentoRef.current) return;
    devolucaoEmAndamentoRef.current = true;
    setProcessandoDevolucao(true);
    try {
    const totalEstornoBRL = calcularTotalDevolucaoBRL();
    const custoEstornoBRL = calcularCustoDevolucaoAtual(itensParaDevolver);
    if (totalEstornoBRL <= 0) return avisarZen({ variante:'warning', titulo:'Nenhum item selecionado', mensagem:tx('Selecione pelo menos 1 item para devolver.', 'Seleccione al menos 1 ítem.', 'Select at least 1 item.') });

    if (metodoReembolso === 'credito_fiado' && !vendaSendoDevolvida?.clienteId) {
      return avisarZen({ variante:'warning', titulo:'Cliente não vinculado', mensagem:'Esta venda não tem cliente. Escolha Dinheiro, Pix ou Voucher.' });
    }
    if (metodoReembolso === 'dinheiro' && !caixaReembolsoSelecionado) {
      return avisarZen({ variante:'danger', titulo:'Nenhum caixa disponível', mensagem:'Para devolver em dinheiro, selecione um turno de caixa aberto. Se não houver caixa com saldo, use Pix/Banco ou Voucher.' });
    }
    if (metodoReembolso === 'dinheiro' && totalEstornoBRL > Number(caixaReembolsoSelecionado?.resumo?.saldoEsperado || 0) + 0.001) {
      return avisarZen({
        variante:'danger',
        titulo:'Saldo insuficiente no caixa selecionado',
        mensagem:`Disponível: ${fmt(caixaReembolsoSelecionado?.resumo?.saldoEsperado || 0, 'BRL')}`,
        detalhes:[
          `Caixa: ${caixaReembolsoSelecionado?.sessao?.operadorNome || '—'}`,
          `Devolução solicitada: ${fmt(totalEstornoBRL, 'BRL')}`,
          'Selecione outro caixa aberto com saldo suficiente ou use Pix/Banco ou Voucher.'
        ]
      });
    }
    if (metodoReembolso === 'credito_fiado') {
      const cli = (clientes || []).find(c => String(c.id) === String(vendaSendoDevolvida.clienteId));
      const saldo = Number(cli?.saldoDevedorBRL || 0);
      if (totalEstornoBRL > saldo + 0.001) return avisarZen({ variante:'warning', titulo:'Abatimento maior que a dívida', mensagem:`O cliente possui ${fmt(saldo, 'BRL')} em aberto.`, detalhes:['Use Dinheiro, Pix ou Voucher para o valor que exceder o saldo devedor.'] });
    }

    const metodoLabel = metodoReembolso === 'voucher' ? 'Gerar Voucher' : metodoReembolso === 'credito_fiado' ? 'Abater do Fiado' : metodoReembolso === 'pix' ? 'Pix / Banco' : 'Dinheiro da Gaveta';
    const confirmou = await pedirConfirmacaoZen({
      variante:'danger',
      titulo:'Confirmar estorno / devolução',
      mensagem:`Total a devolver: ${fmt(totalEstornoBRL, 'BRL')}`,
      detalhes:[
        `Forma de reembolso: ${metodoLabel}`,
        ...(metodoReembolso === 'dinheiro' ? [`Caixa de origem: ${caixaReembolsoSelecionado?.sessao?.operadorNome || '—'}`] : []),
        `Venda: ${vendaSendoDevolvida?.id || '—'}`,
        'Esta ação ficará registrada no histórico da venda.'
      ],
      confirmarTexto:'Confirmar estorno'
    });
    if (!confirmou) return;

    if (metodoReembolso === 'dinheiro') {
      const sessaoAtualizada = (sessoesCaixa || []).find(s => String(s.id) === String(sessaoReembolsoId) && s.status === 'aberta');
      const resumoAtualizado = sessaoAtualizada ? calcularResumoSessao({ sessao: sessaoAtualizada, historicoVendas, caixaMovimentos }) : null;
      if (!resumoAtualizado || totalEstornoBRL > Number(resumoAtualizado.saldoEsperado || 0) + 0.001) {
        return avisarZen({ variante:'danger', titulo:'Saldo do caixa mudou', mensagem:'O caixa selecionado não possui mais saldo físico suficiente para esta devolução.', detalhes:[`Disponível agora: ${fmt(resumoAtualizado?.saldoEsperado || 0,'BRL')}`, `Devolução: ${fmt(totalEstornoBRL,'BRL')}`, 'Selecione outro caixa com saldo ou use Pix/Banco ou Voucher.'] });
      }
    }

    const assinaturaDevolucao = JSON.stringify({
      vendaId: vendaSendoDevolvida?.id || null,
      metodoReembolso,
      sessaoReembolsoId: metodoReembolso === 'dinheiro' ? sessaoReembolsoId : null,
      itens: Object.entries(itensParaDevolver || {}).filter(([,d]) => Number(d?.qtdSendoDevolvidaAgora || 0) > 0).map(([id,d]) => [id, Number(d.qtdSendoDevolvidaAgora || 0)]),
    });
    if (devolucaoOperacaoRef.current.assinatura !== assinaturaDevolucao || !devolucaoOperacaoRef.current.id) {
      devolucaoOperacaoRef.current = { assinatura: assinaturaDevolucao, id: `DEV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    }
    const devolucaoId = devolucaoOperacaoRef.current.id;
    const devolucaoCreatedAt = new Date().toISOString();

    // ATT 02/06: primeiro montamos toda a reposição em memória. Se qualquer produto
    // regular não existir, abortamos antes de alterar estoque, cliente ou histórico.
    let novosProdutos = [...produtos];
    const eventosEstoque = [];
    try {
      Object.keys(itensParaDevolver).forEach((itemId, index) => {
        const itemDev = itensParaDevolver[itemId];
        if (itemDev.qtdSendoDevolvidaAgora <= 0 || itemDev.tipoItem === 'servico' || itemDev.usoUnicoEncomendado) return;

        const produtoId = itemDev.produtoOriginalId ?? itemId;
        const referenciaProduto = { id: produtoId, sku: itemDev.produtoOriginalSku || itemDev.sku };
        const prodIndex = localizarIndiceProdutoUnico(novosProdutos, referenciaProduto, 'reposição de estoque da devolução');
        if (prodIndex === -1) {
          const erro = new Error(`Não foi possível repor o estoque: o produto "${itemDev.nome}" não existe mais no catálogo.`);
          erro.code = 'ZENOS_PRODUTO_NAO_ENCONTRADO';
          throw erro;
        }

        const alocacao = calcularAlocacaoReposicaoDevolucao(
          { movimentoEstoqueVenda: itemDev.movimentoEstoqueVenda },
          itemDev.qtdJaDevolvida,
          itemDev.qtdSendoDevolvidaAgora,
        );
        const produtoAntes = novosProdutos[prodIndex];
        const reposicao = reporEstoqueProduto(produtoAntes, itemDev.qtdSendoDevolvidaAgora, alocacao);
        novosProdutos[prodIndex] = reposicao.produto;
        const destino = reposicao.movimento.vitrine > 0 && reposicao.movimento.galpao > 0 ? 'vitrine+deposito' : reposicao.movimento.vitrine > 0 ? 'vitrine' : 'deposito';
        eventosEstoque.push(criarEventoEstoque({
          id: `${devolucaoId}-${produtoId}-${index}`,
          produto: produtoAntes,
          tipo: 'devolucao',
          origem: 'cliente',
          destino,
          quantidade: itemDev.qtdSendoDevolvidaAgora,
          saldoAntes: reposicao.auditoria?.antes,
          saldoDepois: reposicao.auditoria?.depois,
          motivo: 'Devolução / estorno',
          operador: operadorAtivo,
          referenciaId: devolucaoId,
          detalhes: { vendaId: vendaSendoDevolvida?.id },
          createdAt: devolucaoCreatedAt,
        }));
      });
      if (typeof commitOperacaoNegocio !== 'function') await registrarEventosEstoque({ db, userId, eventos: eventosEstoque });
    } catch (erro) {
      console.error('[ZenOS][ATT02] Falha ao preparar devolução:', erro);
      avisarZen({ variante:'danger', titulo:'Estorno não concluído', mensagem:erro.message || 'Não foi possível preparar a devolução sem risco de inconsistência.' });
      return;
    }

    let novosClientes = clientes;
    if (metodoReembolso === 'credito_fiado') {
      novosClientes = clientes.map(c => c.id === vendaSendoDevolvida.clienteId
        ? { ...c, saldoDevedorBRL: Math.max(0, (parseFloat(c.saldoDevedorBRL) || 0) - totalEstornoBRL) }
        : c);
    }

    const voucherCodigo = metodoReembolso === 'voucher' ? `VALE-${String(devolucaoId).replace(/[^A-Z0-9]/gi, '').slice(-10).toUpperCase()}` : null;

    const novoHistorico = historicoVendas.map(venda => {
      if (venda.id !== vendaSendoDevolvida.id) return venda;

      const novosItens = venda.itens.map(it => {
        const dadosDev = itensParaDevolver[it.id];
        if (dadosDev && dadosDev.qtdSendoDevolvidaAgora > 0) {
          return { ...it, qtdDevolvida: (Number(it.qtdDevolvida) || 0) + dadosDev.qtdSendoDevolvidaAgora };
        }
        return it;
      });

      const tudoDevolvido = novosItens.every(it => (Number(it.qtdDevolvida) || 0) >= (Number(it.qtd) || 0));
      const parcialmenteDevolvido = novosItens.some(it => (Number(it.qtdDevolvida) || 0) > 0);
      let novoEstado = venda.estado;
      if (tudoDevolvido) novoEstado = 'cancelada';
      else if (parcialmenteDevolvido) novoEstado = 'parcial';

      const financeiroAnterior = obterFinanceiroVenda(venda);
      const valorDevolvidoBRL = Math.min(financeiroAnterior.totalBrutoBRL, Math.round((financeiroAnterior.valorDevolvidoBRL + totalEstornoBRL) * 100) / 100);
      const custoDevolvidoBRL = Math.round((financeiroAnterior.custoDevolvidoBRL + custoEstornoBRL) * 100) / 100;
      const totalLiquidoBRL = Math.max(0, Math.round((financeiroAnterior.totalBrutoBRL - valorDevolvidoBRL) * 100) / 100);
      const lucroLiquidoBRL = Math.round((financeiroAnterior.lucroBrutoBRL - (valorDevolvidoBRL - custoDevolvidoBRL)) * 100) / 100;

      const itensEvento = Object.entries(itensParaDevolver)
        .filter(([, dados]) => dados.qtdSendoDevolvidaAgora > 0)
        .map(([itemId, dados]) => ({
          itemVendaId: itemId,
          produtoOriginalId: dados.produtoOriginalId,
          nome: dados.nome,
          quantidade: dados.qtdSendoDevolvidaAgora,
          valorUnitarioLiquidoBRL: dados.precoLiquidoBRL,
        }));

      return {
        ...venda,
        itens: novosItens,
        estado: novoEstado,
        valorDevolvidoBRL,
        custoDevolvidoBRL,
        totalLiquidoBRL,
        lucroLiquidoBRL,
        devolucoes: [
          ...(Array.isArray(venda.devolucoes) ? venda.devolucoes : []),
          {
            id: devolucaoId,
            createdAt: devolucaoCreatedAt,
            valorBRL: totalEstornoBRL,
            custoBRL: custoEstornoBRL,
            metodoReembolso,
            voucherCodigo,
            itens: itensEvento,
          }
        ],
      };
    });

    // ATT 10.2: devolução é uma única operação crítica confirmada pela nuvem.
    // Estoque + histórico + fiado/voucher + caixa + Livro Financeiro avançam juntos.
    const clienteDevolucao = vendaSendoDevolvida?.clienteId ? (clientes || []).find(c => String(c.id) === String(vendaSendoDevolvida.clienteId)) : null;
    const saldoClienteAntes = clienteDevolucao ? Number(clienteDevolucao.saldoDevedorBRL || 0) : null;
    const saldoClienteDepois = metodoReembolso === 'credito_fiado' && saldoClienteAntes != null ? Math.max(0, saldoClienteAntes - totalEstornoBRL) : null;
    const financeiroDevolucao = {
      id: `DEVOLUCAO-${devolucaoId}`,
      tipo: 'devolucao',
      origem: 'historico_vendas',
      referenciaId: devolucaoId,
      valor: totalEstornoBRL,
      formaPagamento: metodoReembolso,
      createdAt: devolucaoCreatedAt,
      afetaCaixaFisico: metodoReembolso === 'dinheiro',
      afetaResultado: true,
      direcao: 'saida',
      sessaoId: metodoReembolso === 'dinheiro' ? caixaReembolsoSelecionado?.sessao?.id : null,
      clienteId: vendaSendoDevolvida?.clienteId || null,
      clienteNome: vendaSendoDevolvida?.clienteNome || null,
      saldoClienteAntes: metodoReembolso === 'credito_fiado' ? saldoClienteAntes : null,
      saldoClienteDepois: metodoReembolso === 'credito_fiado' ? saldoClienteDepois : null,
      observacao: `Devolução da venda ${vendaSendoDevolvida?.id || '—'} • ${metodoLabel}`,
      detalhes: {
        vendaId: vendaSendoDevolvida?.id || null,
        voucherCodigo,
        caixaOperadorId: metodoReembolso === 'dinheiro' ? caixaReembolsoSelecionado?.sessao?.operadorId || null : null,
        caixaOperadorNome: metodoReembolso === 'dinheiro' ? caixaReembolsoSelecionado?.sessao?.operadorNome || null : null,
      },
      operadorId: operadorAtivo?.id || 'admin',
      operadorNome: operadorAtivo?.nome || 'Administrador',
    };

    const mov = metodoReembolso === 'dinheiro' ? {
      id: `MOV-${devolucaoId}`,
      sessaoId: caixaReembolsoSelecionado.sessao.id,
      createdAt: devolucaoCreatedAt,
      dataHora: new Date(devolucaoCreatedAt).toLocaleString('pt-BR'),
      tipo: 'saida_devolucao',
      direcao: 'saida',
      afetaGaveta: true,
      valorBRL: totalEstornoBRL,
      detalhesMoedas: { BRL: totalEstornoBRL },
      descricao: `Devolução ${vendaSendoDevolvida?.id || devolucaoId}`,
      operador: operadorAtivo?.nome || 'Administrador',
      caixaOperadorId: caixaReembolsoSelecionado?.sessao?.operadorId || null,
      caixaOperadorNome: caixaReembolsoSelecionado?.sessao?.operadorNome || null,
      devolucaoId,
    } : null;
    const caixaProposto = mov ? [mov, ...(caixaMovimentos || [])] : caixaMovimentos;
    const novoVoucher = voucherCodigo ? { codigo: voucherCodigo, valorOriginalBRL: totalEstornoBRL, saldoBRL: totalEstornoBRL, status: 'ativo', criadoEm: devolucaoCreatedAt, origemVendaId: vendaSendoDevolvida?.id || null, clienteId: vendaSendoDevolvida?.clienteId || null, clienteNome: vendaSendoDevolvida?.clienteNome || null, criadoPor: operadorAtivo?.nome || 'Gerência', criadoPorId: operadorAtivo?.id || 'admin', impressoes: [] } : null;
    const vouchersPropostos = novoVoucher ? [novoVoucher, ...(vouchers || [])] : vouchers;

    try {
      let confirmados = { produtos:novosProdutos, clientes:novosClientes, historicoVendas:novoHistorico, caixaMovimentos:caixaProposto, vouchers:vouchersPropostos };
      if (typeof commitOperacaoNegocio === 'function') {
        const changes = [
          { field:'produtos', value:novosProdutos, storageSuffix:'produtos' },
          { field:'historicoVendas', value:novoHistorico, storageSuffix:'historico_vendas' },
        ];
        if (metodoReembolso === 'credito_fiado') changes.push({ field:'clientes', value:novosClientes, storageSuffix:'clientes' });
        if (mov) changes.push({ field:'caixaMovimentos', value:caixaProposto, storageSuffix:'caixa_movs' });
        if (novoVoucher) changes.push({ field:'vouchers', value:vouchersPropostos, storageSuffix:'vouchers' });
        const guardItems = Object.entries(itensParaDevolver || {})
          .filter(([,dados]) => Number(dados?.qtdSendoDevolvidaAgora || 0) > 0)
          .map(([itemId,dados]) => ({ itemId, produtoOriginalId:dados?.produtoOriginalId, quantity:Number(dados?.qtdSendoDevolvidaAgora || 0), name:dados?.nome }));
        const guards = [{ type:'sale_return_capacity', saleId:vendaSendoDevolvida?.id, items:guardItems }];
        if (metodoReembolso === 'dinheiro' && caixaReembolsoSelecionado?.sessao?.id) {
          guards.push({ type:'cash_session_open', sessionId:caixaReembolsoSelecionado.sessao.id });
          guards.push({ type:'cash_balance_at_least', sessionId:caixaReembolsoSelecionado.sessao.id, amount:totalEstornoBRL, message:'O saldo físico do caixa mudou em outro terminal. A devolução em dinheiro foi bloqueada.' });
        }
        if (metodoReembolso === 'credito_fiado' && vendaSendoDevolvida?.clienteId) guards.push({ type:'numeric_at_least', field:'clientes', entityId:vendaSendoDevolvida.clienteId, entityKey:'id', property:'saldoDevedorBRL', amount:totalEstornoBRL, message:'O saldo devedor do cliente mudou em outro terminal. Atualize antes de devolver como crédito de fiado.' });
        const confirmado = await commitOperacaoNegocio({
          changes,
          financialEntries:[financeiroDevolucao],
          stockEvents:eventosEstoque,
          guards,
          operationKey:`devolucao:${devolucaoId}`,
        });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou a devolução.');
        confirmados = { ...confirmados, ...(confirmado.values || {}) };
      } else {
        if (typeof registrarFinanceiro === 'function') await registrarFinanceiro(financeiroDevolucao);
      }

      setProdutos(confirmados.produtos || novosProdutos);
      if (metodoReembolso === 'credito_fiado') setClientes(confirmados.clientes || novosClientes);
      setHistoricoVendas(confirmados.historicoVendas || novoHistorico);
      if (mov && typeof setCaixaMovimentos === 'function') setCaixaMovimentos(confirmados.caixaMovimentos || caixaProposto);
      if (novoVoucher && setVouchers) setVouchers(confirmados.vouchers || vouchersPropostos);
    } catch (err) {
      console.error('[ZenOS][ATT10.2] Devolução não confirmada:', err);
      avisarZen({ variante:'danger', titulo:'Estorno não concluído', mensagem:'A nuvem não confirmou a devolução. Estoque, histórico, caixa e fiado foram preservados.', detalhes:[err?.message || 'Falha de persistência'] });
      return;
    }

    if (voucherCodigo) {
      setModalZen({variante:'success',titulo:'Voucher gerado',mensagem:`Código: ${voucherCodigo}`,detalhes:[`Valor: ${fmt(totalEstornoBRL, 'BRL')}`,'O voucher foi registrado e poderá ser usado como pagamento no PDV.'],apenasConfirmar:true});
    }

    devolucaoOperacaoRef.current = { assinatura:null, id:null };
    setModalDevolucaoAberto(false);
    setVendaSendoDevolvida(null);
    setItensParaDevolver({});
    } finally {
      devolucaoEmAndamentoRef.current = false;
      setProcessandoDevolucao(false);
    }
  };

  const imprimirVoucher = (voucher) => {
    if (!voucher) return;
    const janela = window.open('', '_blank', 'width=420,height=700');
    if (!janela) return avisarZen({ variante:'danger', titulo:'Impressão bloqueada', mensagem:'Permita pop-ups para imprimir o voucher.' });
    const impressoes = Array.isArray(voucher.impressoes) ? voucher.impressoes : [];
    const via = impressoes.length + 1;
    const solicitadoEm = new Date().toISOString();
    const registro = { operadorId: operadorAtivo?.id || 'admin', operadorNome: operadorAtivo?.nome || 'Administrador', dataHora: solicitadoEm, numeroVia: via };
    if (setVouchers) setVouchers((vouchers || []).map(v => String(v.codigo) === String(voucher.codigo) ? { ...v, impressoes: [...impressoes, registro] } : v));
    const logo = perfilRecibo.mostrarLogoRecibo !== false && perfilRecibo.logoLoja ? `<img src="${perfilRecibo.logoLoja}" style="max-width:120px;max-height:60px;object-fit:contain;margin-bottom:6px"/>` : '';
    const loja = perfilRecibo.nomeFantasia || 'ZenOS';
    const criadoEm = voucher.criadoEm ? new Date(voucher.criadoEm).toLocaleString('pt-BR') : '—';
    janela.document.write(`<!DOCTYPE html><html><head><title>Voucher ${voucher.codigo}</title><style>@page{margin:0;size:${larguraCssRecibo(perfilRecibo)} auto}body{font-family:monospace;color:#000;background:#fff;margin:0;padding:12px;width:${larguraCssRecibo(perfilRecibo)};box-sizing:border-box;font-size:12px}.c{text-align:center}.linha{border-top:1px dashed #000;margin:10px 0}.assin{margin-top:38px;text-align:center}</style></head><body><div class="c">${logo}<strong style="font-size:16px">${loja}</strong>${perfilRecibo.cabecalhoRecibo?`<div>${perfilRecibo.cabecalhoRecibo}</div>`:''}<div class="linha"></div><strong>VOUCHER / VALE-CRÉDITO</strong></div><p><strong>Código:</strong> ${voucher.codigo}<br/><strong>Valor original:</strong> ${fmt(voucher.valorOriginalBRL||0,'BRL')}<br/><strong>Saldo disponível:</strong> ${fmt(voucher.saldoBRL||0,'BRL')}<br/><strong>Cliente:</strong> ${voucher.clienteNome||'Consumidor'}<br/><strong>Venda de origem:</strong> ${voucher.origemVendaId||'—'}<br/><strong>Data de emissão:</strong> ${criadoEm}<br/><strong>Emitido por:</strong> ${voucher.criadoPor||'—'}<br/><strong>Código do operador:</strong> ${voucher.criadoPorId||'—'}</p><div class="linha"></div><p><strong>Impresso por:</strong> ${registro.operadorNome}<br/><strong>Código do operador:</strong> ${registro.operadorId}<br/><strong>Data/hora:</strong> ${new Date(solicitadoEm).toLocaleString('pt-BR')}<br/><strong>Número da via:</strong> ${via}</p><div class="assin">____________________________<br/>Assinatura do Cliente</div><div class="assin">____________________________<br/>Assinatura do Vendedor / Administrador</div>${perfilRecibo.rodapeRecibo?`<div class="linha"></div><div class="c">${perfilRecibo.rodapeRecibo}</div>`:''}<script>window.onload=function(){window.focus();window.print();}</script></body></html>`);
    janela.document.close();
  };

  const executarImpressaoNativa = () => {
    const elementoCupom = document.getElementById('area-cupom-reimpressao');
    if (!elementoCupom) return;
    const janelaImpressao = window.open('', '_blank', 'width=400,height=600');
    if (!janelaImpressao) return avisarZen({ variante:'danger', titulo:'Impressão bloqueada', mensagem:'Permita pop-ups para imprimir a segunda via.' });
    janelaImpressao.document.write(`
      <!DOCTYPE html><html><head><title>Cupom - 2a Via</title><style>@page{margin:0;size:${larguraCssRecibo(perfilRecibo)} auto;}body{font-family:'Courier New',Courier,monospace;font-size:12px;color:#000;background:#fff;margin:0;padding:10px;width:${larguraCssRecibo(perfilRecibo)};box-sizing:border-box;}table{width:100%;border-collapse:collapse;font-size:11px;}th,td{padding:3px 0;}</style></head>
      <body>${elementoCupom.innerHTML}<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script></body></html>
    `);
    janelaImpressao.document.close();
  };

  if (cupomParaImprimir) {
    return (
      <>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
        <div style={{ backgroundColor: '#fff', color: '#000', borderRadius: '12px', width: '100%', maxWidth: '350px', padding: '0', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div id="area-cupom-reimpressao" style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>{perfilRecibo.mostrarLogoRecibo !== false && perfilRecibo.logoLoja && <img src={perfilRecibo.logoLoja} alt="Logo" style={{maxWidth:'110px',maxHeight:'55px',objectFit:'contain'}}/>}<h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>{perfilRecibo.nomeFantasia || 'ZenOS - SISTEMA DE GESTÃO'}</h2><div style={{ fontSize: '10px' }}>Cupom Não Fiscal - 2ª Via<br/>{cupomParaImprimir.dataHora}</div></div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ marginBottom: '8px', fontSize: '11px' }}><strong>Comanda:</strong> {cupomParaImprimir.id}<br/><strong>Cliente:</strong> {cupomParaImprimir.clienteNome || 'Consumidor Balcão'}</div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
              <thead><tr><th style={{ paddingBottom: '4px' }}>Qtd</th><th style={{ paddingBottom: '4px' }}>Item</th><th style={{ textAlign: 'right', paddingBottom: '4px' }}>Vl.Un</th><th style={{ textAlign: 'right', paddingBottom: '4px' }}>Total</th></tr></thead>
              <tbody>
                {cupomParaImprimir.itens.map((it, idx) => (
                  <tr key={idx}><td style={{ verticalAlign: 'top', paddingRight: '4px' }}>{it.qtd}</td><td style={{ verticalAlign: 'top' }}>{(it.nome || '').substring(0, 16)}</td><td style={{ textAlign: 'right', verticalAlign: 'top' }}>{fmt(it.precoPraticadoBRL || 0)}</td><td style={{ textAlign: 'right', verticalAlign: 'top' }}>{fmt((it.precoPraticadoBRL || 0) * (parseInt(it.qtd) || 1))}</td></tr>
                ))}
              </tbody>
            </table>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}><span>TOTAL</span><span>{fmt(cupomParaImprimir.totalBRL)}</span></div>
            <div style={{marginTop:6,fontSize:'10px'}}>
              {moedasReimpressao.map(codigo => <div key={codigo} style={{display:'flex',justifyContent:'space-between'}}><span>Total {codigo}</span><span>{formatarEquivalenciaBRL(cupomParaImprimir.totalBRL || 0, codigo, cotacoesReimpressao)}</span></div>)}
            </div>
            <div style={{ marginTop: '10px', fontSize: '11px' }}><strong>Pagamentos:</strong><br/>
              {cupomParaImprimir.pagamentos && cupomParaImprimir.pagamentos.length > 0 ? (
                cupomParaImprimir.pagamentos.map((p, idx) => (<div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.rotulo}</span><span>{fmt(p.valorConvertidoBRL || p.valorOriginal || 0)}</span></div>))
              ) : (<div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{cupomParaImprimir.detalhesPagamento || 'Dinheiro'}</span></div>)}
            </div>
            <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
            <div style={{ textAlign: 'center', fontSize: '10px' }}>Obrigado pela preferência!<br/>Documento sem valor fiscal.</div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: '10px', padding: '20px', backgroundColor: '#f1f5f9', borderTop: '1px solid #cbd5e1' }}>
            <button onClick={executarImpressaoNativa} style={{ flex: 1, padding: '14px', backgroundColor: '#0284c7', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '14px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}><span>🖨️</span> {tx('Confirmar Impressão', 'Confirmar Impresión', 'Confirm Print')}</button>
            <button onClick={() => setCupomParaImprimir(null)} style={{ flex: 1, padding: '14px', backgroundColor: '#475569', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '14px' }}>{tx('Voltar', 'Volver', 'Back')}</button>
          </div>
        </div>
      </div>
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} confirmarTexto={modalZen?.confirmarTexto||'OK'} cancelarTexto={modalZen?.cancelarTexto||'Cancelar'} apenasConfirmar={modalZen?.apenasConfirmar} onConfirmar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(true); }} onCancelar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(false); }}/>
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div className="no-print" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Histórico de Vendas & Devoluções', 'Historial de Ventas', 'Sales History & Refunds')}</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>{tx('Consulte cupons, gerencie estornos parciais, devoluções e emissão de vouchers.', 'Consulte recibos y devoluciones.', 'View receipts and process returns.')}</span>
        </div>
        <button onClick={()=>setMostrarVouchers(v=>!v)} style={{background:mostrarVouchers?'#5b21b6':'#1e1b4b',border:'1px solid #8b5cf6',color:'#e9d5ff',padding:'10px 16px',borderRadius:10,fontWeight:900,cursor:'pointer'}}>🎟️ Vouchers ({(vouchers||[]).filter(v=>v.status==='ativo' && Number(v.saldoBRL||0)>0).length} ativos)</button>
      </div>

      {mostrarVouchers && <div className="no-print" style={{background:'#0b1120',border:'1px solid #8b5cf6',borderRadius:16,padding:18}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:14}}><div><div style={{fontWeight:900,color:'#e9d5ff',fontSize:16}}>🎟️ Central de Vouchers</div><div style={{fontSize:12,color:'#94a3b8'}}>Consulte saldo, origem e situação dos vales emitidos.</div></div><div style={{fontSize:12,color:'#c4b5fd',fontWeight:800}}>Total: {(vouchers||[]).length}</div></div>
        {(vouchers||[]).length===0 ? <div style={{padding:18,color:'#64748b',textAlign:'center'}}>Nenhum voucher emitido.</div> : <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{color:'#94a3b8',borderBottom:'1px solid #1e293b',textAlign:'left'}}><th style={{padding:'8px 6px'}}>Código</th><th>Saldo</th><th>Valor original</th><th>Status</th><th>Origem</th><th>Emitido por</th><th>Data</th><th style={{textAlign:'right'}}>Ações</th></tr></thead><tbody>{(vouchers||[]).map(v=><tr key={v.codigo} style={{borderBottom:'1px solid #1e293b',color:'#cbd5e1'}}><td style={{padding:'10px 6px',fontWeight:900,color:'#c4b5fd'}}>{v.codigo}</td><td style={{fontWeight:900,color:Number(v.saldoBRL||0)>0?'#34d399':'#64748b'}}>{fmt(Number(v.saldoBRL||0),'BRL')}</td><td>{fmt(Number(v.valorOriginalBRL||0),'BRL')}</td><td><span style={{padding:'3px 8px',borderRadius:999,background:v.status==='ativo'?'#064e3b':'#1e293b',color:v.status==='ativo'?'#6ee7b7':'#94a3b8',fontWeight:800}}>{v.status||'—'}</span></td><td>{v.origemVendaId||'—'}</td><td>{v.criadoPor||'—'}<div style={{fontSize:10,color:'#64748b',marginTop:3}}>Impressões: {(v.impressoes||[]).length}</div></td><td>{v.criadoEm?new Date(v.criadoEm).toLocaleString('pt-BR'):'—'}</td><td style={{textAlign:'right'}}><button onClick={()=>imprimirVoucher(v)} style={{background:'#082f49',border:'1px solid #38bdf8',color:'#7dd3fc',padding:'6px 10px',borderRadius:8,fontWeight:900,cursor:'pointer'}}>🖨️ Imprimir</button></td></tr>)}</tbody></table></div>}
      </div>}

      <div className="no-print" style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#020617' }}>
              <th style={{ padding: '16px 20px' }}>Data / Hora</th>
              <th style={{ padding: '16px 12px' }}>{tx('Comanda', 'Recibo', 'Order')}</th>
              <th style={{ padding: '16px 12px' }}>{tx('Cliente', 'Cliente', 'Client')}</th>
              <th style={{ padding: '16px 12px' }}>{tx('Meio de Pgto', 'Medio de Pago', 'Payment Method')}</th>
              <th style={{ padding: '16px 12px', textAlign: 'right' }}>Total (R$)</th>
              <th style={{ padding: '16px 12px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '16px 20px', textAlign: 'right' }}>{tx('Ações', 'Acciones', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {historicoVendas.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Nenhuma venda registada até o momento.</td></tr>
            ) : (
              historicoVendas.map(venda => (
                <React.Fragment key={venda.id}>
                  <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: vendaExpandida === venda.id ? '#1e1b4b' : 'transparent', transition: 'all 0.2s' }}>
                    <td style={{ padding: '16px 20px', color: '#cbd5e1' }}>{venda.dataHora}</td>
                    <td style={{ padding: '16px 12px', fontWeight: 800, color: '#38bdf8' }}>{venda.id}</td>
                    <td style={{ padding: '16px 12px', color: '#f8fafc', fontWeight: 700 }}>{venda.clienteNome}</td>
                    <td style={{ padding: '16px 12px', color: '#94a3b8', fontSize: '11px' }}>{venda.detalhesPagamento}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: venda.estado === 'cancelada' ? '#64748b' : '#34d399', fontSize: '15px' }}>{fmt(obterFinanceiroVenda(venda).totalLiquidoBRL, 'BRL')}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                      {venda.estado === 'cancelada' ? <span style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', border: '1px solid #f43f5e', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Cancelada Total', 'Cancelada', 'Canceled')}</span>
                      : venda.estado === 'parcial' ? <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid #f59e0b', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Devolução Parcial', 'Devol. Parcial', 'Partial Return')}</span>
                      : <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid #10b981', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{tx('Concluída', 'Concluida', 'Completed')}</span>}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <button onClick={() => setVendaExpandida(vendaExpandida === venda.id ? null : venda.id)} style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#cbd5e1', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', marginRight: '8px' }}>{tx('Itens', 'Ítems', 'Items')}</button>
                      {venda.estado !== 'cancelada' && (
                        <button onClick={() => iniciarDevolucao(venda)} style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', color: '#fb7185', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>⚙️ {tx('Estorno', 'Devolución', 'Refund')}</button>
                      )}
                    </td>
                  </tr>

                  {vendaExpandida === venda.id && (
                    <tr style={{ backgroundColor: '#020617', borderBottom: '2px solid #38bdf8' }}>
                      <td colSpan="7" style={{ padding: '20px' }}>
                        <div style={{ border: '1px dashed #334155', borderRadius: '12px', padding: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                            <span style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase' }}>Produtos desta Comanda</span>
                            <button onClick={() => setCupomParaImprimir(venda)} style={{ background: '#082f49', border: '1px solid #0284c7', color: '#38bdf8', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', cursor: 'pointer', fontWeight: 800 }}>🖨️ {tx('Re-Imprimir Cupom', 'Re-Imprimir', 'Re-Print')}</button>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textAlign: 'left' }}><th style={{ paddingBottom: '8px' }}>Qtd</th><th style={{ paddingBottom: '8px' }}>Produto</th><th style={{ paddingBottom: '8px', textAlign: 'right' }}>Vl. Un (R$)</th><th style={{ paddingBottom: '8px', textAlign: 'right' }}>Total (R$)</th><th style={{ paddingBottom: '8px', textAlign: 'right' }}>Status Devolução</th></tr></thead>
                            <tbody>
                              {venda.itens.map((it, idx) => {
                                const qtdOriginal = parseInt(it.qtd) || 0;
                                const qtdDevolvida = parseInt(it.qtdDevolvida) || 0;
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid #1e293b', color: '#cbd5e1', fontSize: '13px' }}>
                                    <td style={{ padding: '10px 0' }}><strong style={{ color: '#fff' }}>{qtdOriginal}x</strong></td>
                                    <td>{it.nome} {ehEncomendaUsoUnico(it) && <span style={{ color: '#fbbf24', fontSize: '10px' }}>(⭐ Encomenda)</span>}</td>
                                    <td style={{ textAlign: 'right' }}>{fmt(it.precoPraticadoBRL, 'BRL')}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#34d399' }}>{fmt(qtdOriginal * (it.precoPraticadoBRL||0), 'BRL')}</td>
                                    <td style={{ textAlign: 'right' }}>
                                      {qtdDevolvida > 0 
                                        ? <span style={{ color: '#fb7185', fontSize: '11px', fontWeight: 800 }}>-{qtdDevolvida} Devolvido(s)</span>
                                        : <span style={{ color: '#64748b', fontSize: '11px' }}>OK</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {Array.isArray(venda.devolucoes) && venda.devolucoes.length > 0 && <div style={{marginTop:14,borderTop:'1px solid #1e293b',paddingTop:12}}>
                            <div style={{fontSize:11,fontWeight:900,color:'#fbbf24',textTransform:'uppercase',marginBottom:8}}>Devoluções / Vouchers desta venda</div>
                            {venda.devolucoes.map(dev => <div key={dev.id} style={{display:'flex',gap:12,flexWrap:'wrap',fontSize:11,color:'#cbd5e1',padding:'6px 0'}}><span>{dev.createdAt?new Date(dev.createdAt).toLocaleString('pt-BR'):dev.id}</span><strong style={{color:'#fb7185'}}>{fmt(dev.valorBRL||0,'BRL')}</strong><span>{dev.metodoReembolso==='voucher'?'Voucher':dev.metodoReembolso==='credito_fiado'?'Abate no fiado':dev.metodoReembolso==='pix'?'Pix / Banco':'Dinheiro da Gaveta'}</span>{dev.voucherCodigo && <span style={{color:'#c4b5fd',fontWeight:900}}>🎟️ {dev.voucherCodigo}</span>}</div>)}
                          </div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} confirmarTexto={modalZen?.confirmarTexto||'OK'} cancelarTexto={modalZen?.cancelarTexto||'Cancelar'} apenasConfirmar={modalZen?.apenasConfirmar} onConfirmar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(true); }} onCancelar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(false); }}/>

      {modalDevolucaoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #f43f5e', borderRadius: '24px', width: '100%', maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', color: '#fff', boxShadow: '0 25px 50px rgba(0,0,0,0.85)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 900, color: '#f43f5e', letterSpacing: '1px', textTransform: 'uppercase' }}>{tx('Motor de Devoluções (RMA)', 'Motor de Devoluciones', 'Returns Engine')}</span><h3 style={{ fontSize: '20px', fontWeight: 900, margin: '2px 0 0 0' }}>Estorno de Itens • Comanda {vendaSendoDevolvida?.id}</h3></div>
              <button onClick={() => setModalDevolucaoAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', color: '#38bdf8' }}>{tx('1. Selecione os itens e quantidades para devolução:', '1. Seleccione ítems y cantidades:', '1. Select items:')}</h4>
                <button onClick={selecionarTodosParaDevolver} style={{ background: 'none', border: '1px solid #0284c7', color: '#38bdf8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{tx('Selecionar Tudo', 'Seleccionar Todo', 'Select All')}</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '11px', textAlign: 'left' }}><th style={{ padding: '10px 0' }}>Produto</th><th style={{ textAlign: 'center' }}>Comprado</th><th style={{ textAlign: 'center' }}>Já Devolv.</th><th style={{ textAlign: 'center' }}>Devolver Agora</th><th style={{ textAlign: 'right' }}>Vl. Estorno</th></tr></thead>
                <tbody>
                  {Object.keys(itensParaDevolver).map(itemId => {
                    const item = itensParaDevolver[itemId];
                    return (
                      <tr key={itemId} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '12px 0' }}>{item.nome} {ehEncomendaUsoUnico(item) && <span style={{ color: '#fbbf24', fontSize: '10px' }}><br/>(Estoque não retorna)</span>}</td>
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{item.qtdOriginal}</td>
                        <td style={{ textAlign: 'center', color: '#fb7185' }}>{item.qtdJaDevolvida}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', padding: '4px' }}>
                            <button onClick={() => alterarQtdDevolucao(itemId, -1)} disabled={item.qtdSendoDevolvidaAgora === 0} style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#1e293b', border: 'none', color: item.qtdSendoDevolvidaAgora === 0 ? '#475569' : '#fff', fontWeight: 900, cursor: item.qtdSendoDevolvidaAgora === 0 ? 'not-allowed' : 'pointer' }}>-</button>
                            <span style={{ fontWeight: 900, fontSize: '15px', width: '30px', textAlign: 'center', color: item.qtdSendoDevolvidaAgora > 0 ? '#38bdf8' : '#94a3b8' }}>{item.qtdSendoDevolvidaAgora}</span>
                            <button onClick={() => alterarQtdDevolucao(itemId, 1)} disabled={item.qtdSendoDevolvidaAgora === item.qtdDisponivel} style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#1e293b', border: 'none', color: item.qtdSendoDevolvidaAgora === item.qtdDisponivel ? '#475569' : '#fff', fontWeight: 900, cursor: item.qtdSendoDevolvidaAgora === item.qtdDisponivel ? 'not-allowed' : 'pointer' }}>+</button>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 900, color: (item.qtdSendoDevolvidaAgora * item.precoLiquidoBRL) > 0 ? '#fb7185' : '#475569', fontSize: '15px' }}>{fmt(item.qtdSendoDevolvidaAgora * item.precoLiquidoBRL)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px' }}>
                <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#fbbf24' }}>{tx('2. Como deseja reembolsar o cliente?', '2. ¿Cómo reembolsar al cliente?', '2. How to refund?')}</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: metodoReembolso === 'dinheiro' ? '#1e1b4b' : 'transparent', border: `1px solid ${metodoReembolso === 'dinheiro' ? '#6366f1' : '#334155'}`, padding: '12px', borderRadius: '10px', cursor: 'pointer' }}><input type="radio" value="dinheiro" checked={metodoReembolso === 'dinheiro'} onChange={() => setMetodoReembolso('dinheiro')} /><div><strong style={{ display: 'block', fontSize: '13px', color: '#fff' }}>Dinheiro de um Caixa Aberto</strong><span style={{fontSize:10,color:'#94a3b8'}}>A gerência autoriza; a saída é vinculada ao caixa físico escolhido.</span></div></label>
                  {metodoReembolso === 'dinheiro' && (
                    <div style={{padding:'10px 12px',border:'1px solid #334155',borderRadius:10,background:'#0b1120'}}>
                      <label style={{display:'block',fontSize:10,fontWeight:900,color:'#94a3b8',marginBottom:6}}>CAIXA DE ORIGEM DO DINHEIRO</label>
                      <select value={sessaoReembolsoId} onChange={e=>setSessaoReembolsoId(e.target.value)} style={{width:'100%',padding:10,borderRadius:8,border:'1px solid #6366f1',background:'#020617',color:'#fff',fontWeight:800}}>
                        <option value="">Selecione um caixa aberto</option>
                        {caixasAbertos.map(({sessao,resumo}) => <option key={sessao.id} value={sessao.id}>{sessao.operadorNome} • disponível {fmt(resumo.saldoEsperado || 0,'BRL')}</option>)}
                      </select>
                      {caixasAbertos.length === 0 && <div style={{fontSize:10,color:'#fb7185',marginTop:6}}>Nenhum turno de caixa está aberto. Use Pix/Banco ou Voucher.</div>}
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: metodoReembolso === 'pix' ? '#082f49' : 'transparent', border: `1px solid ${metodoReembolso === 'pix' ? '#38bdf8' : '#334155'}`, padding: '12px', borderRadius: '10px', cursor: 'pointer' }}><input type="radio" value="pix" checked={metodoReembolso === 'pix'} onChange={() => setMetodoReembolso('pix')} /><div><strong style={{ display: 'block', fontSize: '13px', color: '#fff' }}>Pix / Banco</strong></div></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: metodoReembolso === 'credito_fiado' ? '#451a03' : 'transparent', border: `1px solid ${metodoReembolso === 'credito_fiado' ? '#d97706' : '#334155'}`, padding: '12px', borderRadius: '10px', cursor: 'pointer' }}><input type="radio" value="credito_fiado" checked={metodoReembolso === 'credito_fiado'} onChange={() => setMetodoReembolso('credito_fiado')} disabled={!vendaSendoDevolvida?.clienteId} /><div><strong style={{ display: 'block', fontSize: '13px', color: vendaSendoDevolvida?.clienteId ? '#fff' : '#64748b' }}>Abater do Fiado</strong></div></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: metodoReembolso === 'voucher' ? '#064e3b' : 'transparent', border: `1px solid ${metodoReembolso === 'voucher' ? '#10b981' : '#334155'}`, padding: '12px', borderRadius: '10px', cursor: 'pointer' }}><input type="radio" value="voucher" checked={metodoReembolso === 'voucher'} onChange={() => setMetodoReembolso('voucher')} /><div><strong style={{ display: 'block', fontSize: '13px', color: '#fff' }}>Gerar Voucher</strong></div></label>
                </div>
              </div>
              <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase' }}>{tx('3. Confirmação Final do Estorno', '3. Confirmación de Devolución', '3. Refund Confirmation')}</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: '14px', color: '#cbd5e1' }}>Total a Devolver:</span><span style={{ fontSize: '28px', fontWeight: 900, color: '#f43f5e' }}>{fmt(calcularTotalDevolucaoBRL())}</span></div>
                <button onClick={confirmarDevolucao} disabled={processandoDevolucao || calcularTotalDevolucaoBRL() === 0} style={{ padding: '16px', background: (processandoDevolucao || calcularTotalDevolucaoBRL() === 0) ? '#334155' : 'linear-gradient(135deg, #e11d48, #be123c)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: (processandoDevolucao || calcularTotalDevolucaoBRL() === 0) ? 'not-allowed' : 'pointer' }}>{processandoDevolucao ? 'Confirmando...' : tx('Confirmar Estorno / Devolução', 'Confirmar Devolución', 'Confirm Refund')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}