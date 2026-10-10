import React, { useState, useEffect, useRef } from 'react';
import { normalizarProduto, normalizarCliente } from '../data';
import { aplicarVendaAoEstoque, obterEstoqueProduto, preverBaixaEstoqueProduto } from '../core/inventory';
import { db } from '../firebase';
import { criarEventoEstoque, registrarEventosEstoque } from '../core/stockAudit';
import { ajustarSkuPorTipoProdutoRapido, ehEncomendaUsoUnico, gerarSkuProdutoBalcao } from '../core/orderItems';
import { classificarMargem } from '../core/profitability';
import ZenModal from './ZenModal';
import { liberarIdentidadeProduto, reservarIdentidadeProduto } from '../core/productRegistry';
import { normalizarPerfilLoja, larguraCssRecibo } from '../core/storeProfile';
import { atualizarProdutoUnico, localizarIndiceProdutoUnico, skuJaExiste } from '../core/productIdentity';
import { formatarEquivalenciaBRL, moedasAtivasRecibo } from '../core/receiptCurrency';
import { validarCredencialGerencial } from '../core/accessControl';
import { calcularCmvVenda } from '../core/salesFinancials';

export default function PDV({ perfilLoja, taxasCambio = {}, registrarFinanceiro, commitOperacaoCritica, commitVendaCritica, vouchers = [], setVouchers, userId, produtos, setProdutos, clientes, setClientes, moeda, fmt, t, tx, converterDeBRL, converterParaBRL, historicoVendas, setHistoricoVendas, patenteUsuario, idioma, regrasDesconto, vendedores = [], operadorAtivo, sessaoAtiva }) {
  const [termoBusca, setTermoBusca] = useState('');
  const [indiceFocoBusca, setIndiceFocoBusca] = useState(0);
  const [itensVenda, setItensVenda] = useState([]);
  const [descontoTexto, setDescontoTexto] = useState('0');
  
  const [nomeClienteVulso, setNomeClienteVulso] = useState('');
  const [clienteSelecionadoPDV, setClienteSelecionadoPDV] = useState(null);
  const [focoInputCliente, setFocoInputCliente] = useState(false);

  const [modalProdutoPDVAberto, setModalProdutoPDVAberto] = useState(false);
  const [produtoEmEdicaoPDV, setProdutoEmEdicaoPDV] = useState(null);
  const [formProdutoPDV, setFormProdutoPDV] = useState(normalizarProduto({}));

  const [modalClientePDVAberto, setModalClientePDVAberto] = useState(false);
  const [formClientePDV, setFormClientePDV] = useState(normalizarCliente({}));

  const [itemParaAdicionar, setItemParaAdicionar] = useState(null);
  const [qtdDigitadaRapida, setQtdDigitadaRapida] = useState('1');
  const [modalFechamentoAberto, setModalFechamentoAberto] = useState(false);

  const [pagamentosLancados, setPagamentosLancados] = useState([]);
  const [formaSelecionada, setFormaSelecionada] = useState('dinheiro_brl');
  const [valorLancamentoInput, setValorLancamentoInput] = useState('');
  const [voucherCodigoInput, setVoucherCodigoInput] = useState('');
  const [moedaTrocoEscolhida, setMoedaTrocoEscolhida] = useState('BRL');
  
  const [vendaSucesso, setVendaSucesso] = useState(false);
  const [vendaConcluidaObj, setVendaConcluidaObj] = useState(null);
  const [processandoTransacao, setProcessandoTransacao] = useState(false);
  const operacaoEmAndamentoRef = useRef(false);
  const operacaoDocumentoRef = useRef({ assinatura: null, id: null });

  const [modalResgateAberto, setModalResgateAberto] = useState(false);
  const [prePedidoEmAbertoId, setPrePedidoEmAbertoId] = useState(null);

  const perfilRecibo = normalizarPerfilLoja(perfilLoja);
  const cotacoesRecibo = vendaConcluidaObj?.taxasCambio || taxasCambio || {};
  const moedasReciboAtivas = moedasAtivasRecibo(cotacoesRecibo);
  const [modalZen, setModalZen] = useState(null);
  const [modalSenhaMargem, setModalSenhaMargem] = useState(false);
  const [senhaMargemInput, setSenhaMargemInput] = useState('');
  const mostrarZen = (variante, titulo, mensagem, detalhes = []) => setModalZen({ variante, titulo, mensagem, detalhes, apenasConfirmar: true });
  const pedirConfirmacaoZen = ({ titulo, mensagem, detalhes = [], confirmarTexto = 'Continuar', variante = 'warning' }) =>
    new Promise(resolve => setModalZen({ variante, titulo, mensagem, detalhes, confirmarTexto, cancelarTexto: 'Cancelar', resolver: resolve }));
  const inputBuscaRef = useRef(null);
  const inputQtdRapidaRef = useRef(null);
  const inputValorLancamentoRef = useRef(null);

  const termosProd = termoBusca.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const produtosFiltrados = produtos.filter(prod => {
    if (!prod) return false;
    const ehUsoUnico = ehEncomendaUsoUnico(prod);
    if (ehUsoUnico && parseInt(prod.estoque || 0) <= 0) return false; 
    const textoCompleto = `${prod.nome || ''} ${prod.sku || ''} ${prod.grupo || ''}`.toLowerCase();
    return termosProd.every(termo => textoCompleto.includes(termo));
  });

  const termosBuscaCli = nomeClienteVulso.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const clientesSugeridos = (nomeClienteVulso.trim() && !clienteSelecionadoPDV)
    ? clientes.filter(c => {
        const textoCompleto = `${c.nome || ''} ${c.documento || ''} ${c.telefone || ''}`.toLowerCase();
        return termosBuscaCli.every(termo => textoCompleto.includes(termo));
      })
    : [];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setIndiceFocoBusca(0); }, [termoBusca]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (itemParaAdicionar && inputQtdRapidaRef.current) { inputQtdRapidaRef.current.focus(); inputQtdRapidaRef.current.select(); } }, [itemParaAdicionar]);

  const aplicarPrecoPorPerfilCliente = (prod, cliente) => {
    if (!prod) return 0;
    if (cliente && cliente.perfilPreco === 'preco2' && prod.habilitarPreco2 && prod.preco2BRL > 0) return prod.preco2BRL;
    return prod.precoBRL || 0;
  };

  const obterProdutoCatalogoSeguro = (item, contexto = 'consulta do PDV') => {
    const indice = localizarIndiceProdutoUnico(produtos || [], { id: item.produtoOriginalId ?? item.id, sku: item.produtoOriginalSku ?? item.sku }, contexto);
    return indice >= 0 ? produtos[indice] : item;
  };

  const itensVendaComCustoAtual = (itens = []) => (itens || []).map(item => {
    const produtoId = item.produtoOriginalId ?? item.id;
    const produtoSku = String(item.produtoOriginalSku ?? item.sku ?? '').toUpperCase();
    const porId = (produtos || []).filter(produto => String(produto?.id) === String(produtoId));
    const porSku = porId.filter(produto => String(produto?.sku || '').toUpperCase() === produtoSku);
    const produtoAtual = porId.length === 1 ? porId[0] : porSku.length === 1 ? porSku[0] : null;
    const custoAtual = Number(produtoAtual?.custoBRL);
    return produtoAtual && Number.isFinite(custoAtual) && custoAtual >= 0 && custoAtual !== Number(item.custoBRL)
      ? { ...item, custoBRL: custoAtual }
      : item;
  });

  const selecionarClienteNoPDV = (cli) => {
    try {
      const novosItens = itensVenda.map(item => {
        const prodOriginal = obterProdutoCatalogoSeguro(item, 'reprecificação por cliente');
        const novoPrecoBRL = aplicarPrecoPorPerfilCliente(prodOriginal, cli);
        return { ...item, precoPraticadoBRL: novoPrecoBRL, precoTexto: converterDeBRL(novoPrecoBRL, moeda).toFixed(2) };
      });
      setClienteSelecionadoPDV(cli); setNomeClienteVulso(cli.nome); setFocoInputCliente(false);
      setItensVenda(novosItens);
    } catch (erro) { mostrarZen('danger', 'Preço não recalculado', erro.message || 'Não foi possível recalcular os preços com segurança.'); }
  };

  const removerClienteDoPDV = () => {
    try {
      const novosItens = itensVenda.map(item => {
        const prodOriginal = obterProdutoCatalogoSeguro(item, 'retorno ao preço de balcão');
        return { ...item, precoPraticadoBRL: prodOriginal.precoBRL || 0, precoTexto: converterDeBRL(prodOriginal.precoBRL || 0, moeda).toFixed(2) };
      });
      setClienteSelecionadoPDV(null); setNomeClienteVulso('');
      setItensVenda(novosItens);
    } catch (erro) { mostrarZen('danger', 'Preço não restaurado', erro.message || 'Não foi possível retornar aos preços de balcão com segurança.'); }
  };

  const abrirCadastroClientePDV = () => {
    setFormClientePDV(normalizarCliente({ nome: nomeClienteVulso, pais: moeda === 'PYG' ? 'PY' : 'BR', tipoDocumento: moeda === 'PYG' ? 'RUC' : 'CPF' }));
    setModalClientePDVAberto(true);
  };

  const salvarClientePDV = async () => {
    if (!formClientePDV.nome.trim()) return mostrarZen('warning', 'Nome obrigatório', tx('Informe o nome do cliente.', 'Informe el nombre del cliente.', 'Enter customer name.'));
    const limiteNum = parseFloat(String(formClientePDV.limiteCreditoBRL).replace(',', '.')) || 0;
    const novoCli = normalizarCliente({ ...formClientePDV, limiteCreditoBRL: limiteNum });
    const listaProposta = [novoCli, ...(clientes || [])];
    try {
      let clientesConfirmados = listaProposta;
      if (typeof commitVendaCritica === 'function') {
        const confirmado = await commitVendaCritica({ changes:[{ field:'clientes', value:listaProposta, storageSuffix:'clientes' }] });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o cliente.');
        clientesConfirmados = confirmado.values?.clientes || listaProposta;
      }
      setClientes(clientesConfirmados);
      const clienteConfirmado = clientesConfirmados.find(c => String(c.id) === String(novoCli.id)) || novoCli;
      selecionarClienteNoPDV(clienteConfirmado);
      setModalClientePDVAberto(false);
    } catch (erro) {
      mostrarZen('danger', 'Cliente não salvo', 'A nuvem não confirmou o novo cliente. O cadastro rápido não foi concluído.', [erro?.message || 'Falha de persistência']);
    }
  };

  const abrirCadastroProdutoPDV = () => {
    setProdutoEmEdicaoPDV(null); 
    setFormProdutoPDV(normalizarProduto({ sku: gerarSkuProdutoBalcao('BALCAO'), usoUnicoEncomendado: false, classificacaoUso: 'estoque', estoque: 0, estoqueVitrine: 0, estoqueGalpao: 0 }));
    setModalProdutoPDVAberto(true);
  };

  const abrirEdicaoProdutoPDV = (prod) => {
    setProdutoEmEdicaoPDV(prod); 
    setFormProdutoPDV({
      ...normalizarProduto(prod), custoBRL: (prod.custoBRL || 0).toString(), precoBRL: (prod.precoBRL || 0).toString(),
      preco2BRL: (prod.preco2BRL || 0).toString(), preco3BRL: (prod.preco3BRL || 0).toString(), estoque: (prod.estoque || 0).toString(),
      usoUnicoEncomendado: ehEncomendaUsoUnico(prod)
    });
    setModalProdutoPDVAberto(true);
  };

  const salvarProdutoPDV = async () => {
    if (!formProdutoPDV.nome.trim()) return mostrarZen('warning', 'Nome obrigatório', tx('Informe o nome do produto.', 'Informe el nombre del producto.', 'Enter product name.'));
    const custo = parseFloat(String(formProdutoPDV.custoBRL).replace(',', '.')) || 0;
    const preco = parseFloat(String(formProdutoPDV.precoBRL).replace(',', '.')) || 0;
    const preco2 = formProdutoPDV.habilitarPreco2 ? (parseFloat(String(formProdutoPDV.preco2BRL).replace(',', '.')) || 0) : 0;
    const preco3 = formProdutoPDV.habilitarPreco3 ? (parseFloat(String(formProdutoPDV.preco3BRL).replace(',', '.')) || 0) : 0;
    const estoqueVitrineNovo = Math.max(0, parseInt(String(formProdutoPDV.estoqueVitrine)) || 0);
    const estoqueGalpaoNovo = Math.max(0, parseInt(String(formProdutoPDV.estoqueGalpao)) || 0);
    const estoque = produtoEmEdicaoPDV
      ? Math.max(0, Number(normalizarProduto(produtoEmEdicaoPDV).estoque) || 0)
      : estoqueVitrineNovo + estoqueGalpaoNovo;

    if (skuJaExiste(produtos, formProdutoPDV.sku, produtoEmEdicaoPDV)) return mostrarZen('danger', 'SKU duplicado', `Já existe outro produto com o SKU ${formProdutoPDV.sku}. Use um SKU diferente.`);
    const usoUnicoEncomendado = Boolean(formProdutoPDV.usoUnicoEncomendado);
    const skuAjustado = ajustarSkuPorTipoProdutoRapido(formProdutoPDV.sku, usoUnicoEncomendado);
    const dadosFinais = normalizarProduto({
      ...formProdutoPDV,
      sku: skuAjustado,
      custoBRL: custo,
      precoBRL: preco,
      preco2BRL: preco2,
      preco3BRL: preco3,
      estoque,
      estoqueVitrine: usoUnicoEncomendado ? 0 : (produtoEmEdicaoPDV ? normalizarProduto(produtoEmEdicaoPDV).estoqueVitrine : estoqueVitrineNovo),
      estoqueGalpao: usoUnicoEncomendado ? 0 : (produtoEmEdicaoPDV ? normalizarProduto(produtoEmEdicaoPDV).estoqueGalpao : estoqueGalpaoNovo),
      usoUnicoEncomendado,
      classificacaoUso: usoUnicoEncomendado ? 'encomenda_unica' : 'estoque',
    });
    dadosFinais.usoUnicoEncomendado = usoUnicoEncomendado;
    if (!dadosFinais.id) dadosFinais.id = `PROD-BALCAO-${Date.now()}`;

    let listaProposta;
    if (produtoEmEdicaoPDV) {
      try { listaProposta = atualizarProdutoUnico(produtos, produtoEmEdicaoPDV, dadosFinais, 'edição rápida no PDV'); }
      catch (erro) { return mostrarZen('danger', 'Edição bloqueada', erro.message || 'Não foi possível editar este produto com segurança.'); }
    } else {
      listaProposta = [dadosFinais, ...(produtos || [])];
    }

    let eventoInicial = null;
    if (!produtoEmEdicaoPDV && !usoUnicoEncomendado && dadosFinais.tipoItem !== 'servico' && estoque > 0) {
      eventoInicial = criarEventoEstoque({
        produto: dadosFinais,
        tipo: 'cadastro_inicial',
        origem: 'cadastro_pdv',
        destino: estoqueVitrineNovo > 0 && estoqueGalpaoNovo > 0 ? 'vitrine+deposito' : estoqueVitrineNovo > 0 ? 'vitrine' : 'deposito',
        quantidade: estoque,
        saldoAntes: { estoque: 0, estoqueVitrine: 0, estoqueGalpao: 0 },
        saldoDepois: dadosFinais,
        motivo: 'Saldo inicial do cadastro rápido no PDV',
        operador: operadorAtivo,
      });
    }

    try { await reservarIdentidadeProduto({ db, userId, produto: dadosFinais, produtoAnterior: produtoEmEdicaoPDV }); }
    catch (erro) { return setModalZen({variante:'danger',titulo:'Produto duplicado',mensagem:erro.message,apenasConfirmar:true}); }

    try {
      let produtosConfirmados = listaProposta;
      if (typeof commitVendaCritica === 'function') {
        const confirmado = await commitVendaCritica({
          changes:[{ field:'produtos', value:listaProposta, storageSuffix:'produtos' }],
          stockEvents:eventoInicial ? [eventoInicial] : [],
        });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o produto.');
        produtosConfirmados = confirmado.values?.produtos || listaProposta;
      } else if (eventoInicial) {
        await registrarEventosEstoque({ db, userId, eventos:[eventoInicial] });
      }

      setProdutos(produtosConfirmados);
      const produtoConfirmado = produtosConfirmados.find(p => String(p.id) === String(dadosFinais.id) && String(p.sku || '').toUpperCase() === String(dadosFinais.sku || '').toUpperCase()) || dadosFinais;
      if (produtoEmEdicaoPDV) {
        setItensVenda(itensVenda.map(item => String(item.produtoOriginalId || item.id) === String(produtoEmEdicaoPDV.id) ? { ...item, ...produtoConfirmado, precoPraticadoBRL: preco } : item));
      } else {
        setItemParaAdicionar(produtoConfirmado);
        setQtdDigitadaRapida('1');
      }
      setModalProdutoPDVAberto(false);
    } catch (erro) {
      console.error('[ZenOS][ATT10.2] Cadastro rápido de produto não confirmado:', erro);
      try {
        if (produtoEmEdicaoPDV) await reservarIdentidadeProduto({ db, userId, produto:produtoEmEdicaoPDV, produtoAnterior:dadosFinais });
        else await liberarIdentidadeProduto({ db, userId, produto:dadosFinais });
      } catch (rollbackErro) { console.error('[ZenOS][ATT10.2] Falha ao restaurar índice do produto rápido:', rollbackErro); }
      mostrarZen('danger','Produto não salvo','A nuvem não confirmou o cadastro rápido. Nenhuma alteração foi considerada concluída.',[erro?.message || 'Falha de persistência']);
    }
  };

  const lidarTecladoBusca = (e) => {
    if (produtosFiltrados.length === 0 || termoBusca.trim() === '') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceFocoBusca((prev) => (prev + 1) % produtosFiltrados.length); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceFocoBusca((prev) => (prev - 1 + produtosFiltrados.length) % produtosFiltrados.length); } 
    else if (e.key === 'Enter') { e.preventDefault(); const itemEscolhido = produtosFiltrados[indiceFocoBusca] || produtosFiltrados[0]; if (itemEscolhido) { setItemParaAdicionar(itemEscolhido); setQtdDigitadaRapida('1'); } } 
    else if (e.key === 'Escape') { setTermoBusca(''); }
  };

  const confirmarAdicaoRapida = () => {
    if (!itemParaAdicionar) return;
    const qtdNum = Math.max(1, parseInt(qtdDigitadaRapida) || 1);
    if (itemParaAdicionar.tipoItem !== 'servico' && !ehEncomendaUsoUnico(itemParaAdicionar)) {
      const saldo = obterEstoqueProduto(itemParaAdicionar);
      if (qtdNum > saldo.estoque) return mostrarZen('warning', 'Estoque insuficiente', `Disponível: ${saldo.estoque} unidade(s). Você tentou adicionar ${qtdNum}.`, [`Vitrine: ${saldo.estoqueVitrine || 0}`, `Depósito: ${saldo.estoqueGalpao || 0}`]);
    }
    const precoBase = aplicarPrecoPorPerfilCliente(itemParaAdicionar, clienteSelecionadoPDV);

    const indiceExistente = itensVenda.findIndex(i => i.nome === itemParaAdicionar.nome && i.sku === itemParaAdicionar.sku);

    if (indiceExistente !== -1) {
      const novaLista = [...itensVenda];
      const qtdAtual = parseInt(novaLista[indiceExistente].qtd) || 0;
      novaLista[indiceExistente] = { ...novaLista[indiceExistente], qtd: String(qtdAtual + qtdNum) };
      setItensVenda(novaLista);
    } else {
      setItensVenda([ ...itensVenda, { 
        ...itemParaAdicionar, 
        id: `${itemParaAdicionar.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        produtoOriginalId: itemParaAdicionar.id,
        produtoOriginalSku: itemParaAdicionar.sku,
        qtd: String(qtdNum), 
        precoPraticadoBRL: precoBase, 
        precoTexto: converterDeBRL(precoBase, moeda).toFixed(2) 
      }]);
    }
    setItemParaAdicionar(null); setTermoBusca(''); 
    if (inputBuscaRef.current) inputBuscaRef.current.focus();
  };

  const removerItem = (id) => { setItensVenda(itensVenda.filter(item => item.id !== id)); };
  const atualizarQtd = (id, valor) => { setItensVenda(itensVenda.map(item => item.id === id ? { ...item, qtd: String(Math.max(1, parseInt(valor) || 1)) } : item)); };
  const lidarDigitacaoPreco = (id, valorDigitado) => { setItensVenda(itensVenda.map(item => item.id === id ? { ...item, precoTexto: valorDigitado, precoPraticadoBRL: converterParaBRL(parseFloat(valorDigitado.replace(',', '.')) || 0, moeda) } : item)); };

  const carregarPrePedido = (pedido) => {
    setItensVenda(itensVendaComCustoAtual(pedido.itens));
    if (pedido.clienteId) {
      const cli = clientes.find(c => c.id === pedido.clienteId);
      if (cli) setClienteSelecionadoPDV(cli);
    }
    setNomeClienteVulso(pedido.clienteNome !== tx('Consumidor Balcão', 'Consumidor', 'Walk-in') ? pedido.clienteNome : '');
    setPrePedidoEmAbertoId(pedido.id);
    setModalResgateAberto(false);
  };

  const subtotalBrutoBRL = itensVenda.reduce((acc, item) => acc + (Math.max(0, parseInt(item.qtd) || 0) * (item.precoPraticadoBRL || 0)), 0);
  const custoTotalBRL = itensVendaComCustoAtual(itensVenda).reduce((acc, item) => acc + (Math.max(0, parseInt(item.qtd) || 0) * (item.custoBRL || 0)), 0);
  const descBRL = converterParaBRL(parseFloat(String(descontoTexto).replace(',', '.')) || 0, moeda);
  
  const totalFinalBRL = Math.max(0, subtotalBrutoBRL - descBRL);
  const lucroEstimadoBRL = totalFinalBRL - custoTotalBRL;
  const margemLucroReal = totalFinalBRL > 0 ? (lucroEstimadoBRL / totalFinalBRL) * 100 : 0;

  const regras = regrasDesconto || {};
  const classificacaoMargem = classificarMargem(margemLucroReal, regras);
  const margemIdeal = classificacaoMargem.margemIdeal;
  const margemMinima = classificacaoMargem.margemMinima;

  let corSemafaro = classificacaoMargem.cor;
  let bgSemafaro = classificacaoMargem.fundo;
  let borderSemafaro = classificacaoMargem.borda;
  let textoSemafaro = tx(`🟢 Margem Saudável (≥ ${margemIdeal}%)`, `🟢 Margen Saludable`, `🟢 Healthy Margin`);
  let vendaBloqueadaPorMargem = false;

  if (itensVenda.length > 0 && totalFinalBRL > 0) {
    if (classificacaoMargem.faixa === 'vermelho') {
      textoSemafaro = tx(`🔴 Margem Crítica (< ${margemMinima}%)`, `🔴 Margen Crítico`, `🔴 Critical Margin`);
      if (patenteUsuario !== 'gerencia') vendaBloqueadaPorMargem = true;
    } else if (classificacaoMargem.faixa === 'amarelo') {
      textoSemafaro = tx(`🟡 Margem em Alerta (${margemMinima}% a < ${margemIdeal}%)`, `🟡 Alerta de Margen`, `🟡 Margin Alert`);
    }
  } else if (itensVenda.length === 0) {
    corSemafaro = '#34d399'; bgSemafaro = 'rgba(16, 185, 129, 0.1)'; borderSemafaro = 'rgba(16, 185, 129, 0.3)';
    textoSemafaro = tx(`🟢 Aguardando Produtos...`, `🟢 Esperando Productos...`, `🟢 Waiting for Products...`);
  }

  const catalogoFormas = [
    { id: 'dinheiro_brl', rotulo: tx('Dinheiro (R$)', 'Efectivo (R$)', 'Cash (R$)'), moedaOrigem: 'BRL', icone: '💵' }, 
    { id: 'dinheiro_usd', rotulo: tx('Dólar ($)', 'Dólar ($)', 'Dollar ($)'), moedaOrigem: 'USD', icone: '💵' },
    { id: 'dinheiro_pyg', rotulo: tx('Guarani (₲)', 'Guaraní (₲)', 'Guarani (₲)'), moedaOrigem: 'PYG', icone: '💵' }, 
    { id: 'dinheiro_eur', rotulo: tx('Euro (€)', 'Euro (€)', 'Euro (€)'), moedaOrigem: 'EUR', icone: '💶' },
    { id: 'pix', rotulo: 'Pix QR Code', moedaOrigem: 'BRL', icone: '⚡' }, 
    { id: 'cartaoCredito', rotulo: tx('Cartão Crédito', 'Tarjeta Crédito', 'Credit Card'), moedaOrigem: 'BRL', icone: '💳' },
    { id: 'cartaoDebito', rotulo: tx('Cartão Débito', 'Tarjeta Débito', 'Debit Card'), moedaOrigem: 'BRL', icone: '💳' }, 
    { id: 'voucher', rotulo: 'Voucher', moedaOrigem: 'BRL', icone: '🎟️' },
    { id: 'cheque', rotulo: 'Cheque', moedaOrigem: 'BRL', icone: '📝' }, 
    { id: 'crediario', rotulo: tx('Crediário / Fiado', 'Fiado / Crédito', 'Store Credit'), moedaOrigem: 'BRL', icone: '📒' }
  ];

  const totalPagoConvertidoBRL = pagamentosLancados.reduce((acc, p) => acc + (p.valorConvertidoBRL || 0), 0);
  const saldoRestanteBRL = Math.max(0, totalFinalBRL - totalPagoConvertidoBRL);
  
  const totalDinheiroBRL = pagamentosLancados
    .filter(p => p.formaId && p.formaId.startsWith('dinheiro'))
    .reduce((acc, p) => acc + (p.valorConvertidoBRL || 0), 0);
    
  const valorExcedidoGlobal = totalPagoConvertidoBRL - totalFinalBRL;
  const trocoTotalBRL = valorExcedidoGlobal > 0.01 ? Math.min(valorExcedidoGlobal, totalDinheiroBRL) : 0;
  const podeFinalizarVenda = totalFinalBRL > 0 && totalPagoConvertidoBRL >= (totalFinalBRL - 0.05);

  const abrirCheckoutAposValidacoes = () => {
    if (itensVenda.length === 0 || totalFinalBRL <= 0) return mostrarZen('warning', 'Venda vazia', tx('Adicione produtos à venda.', 'Añada productos.', 'Add products.'));
    setPagamentosLancados([]);
    setFormaSelecionada('dinheiro_brl');
    setMoedaTrocoEscolhida(moeda);
    setValorLancamentoInput(converterDeBRL(totalFinalBRL, 'BRL').toFixed(2));
    setVendaSucesso(false);
    setModalFechamentoAberto(true);
  };

  const confirmarSenhaMargem = async () => {
    const autorizador = await validarCredencialGerencial({ vendedores, senha: senhaMargemInput, senhaLegada: regras?.senhaGerente });
    if (!autorizador) {
      setSenhaMargemInput('');
      return mostrarZen('danger', 'Senha incorreta', tx('Venda bloqueada. Informe o PIN de um Administrador/Gerência cadastrado.', 'Venta bloqueada. Ingrese el PIN de un Administrador/Gerencia.', 'Sale blocked. Enter a registered manager/admin PIN.'));
    }
    setModalSenhaMargem(false);
    setSenhaMargemInput('');
    abrirCheckoutAposValidacoes();
  };

  const abrirFechamento = () => {
    if (!sessaoAtiva) {
      return mostrarZen('warning', 'Caixa fechado', tx('Abra primeiro o turno de caixa na Home para liquidar vendas. Pré-pedidos e orçamentos continuam disponíveis.', 'Abra primero el turno de caja.', 'Open the cash shift first.'));
    }
    if (vendaBloqueadaPorMargem) {
      if (regras?.exigirSenhaVermelho ?? true) {
        setSenhaMargemInput('');
        setModalSenhaMargem(true);
        return;
      }
      return mostrarZen('danger', 'Venda bloqueada pela margem', tx(`A margem de lucro (${margemLucroReal.toFixed(1)}%) está abaixo do mínimo exigido de ${margemMinima}%.`, 'Margen por debajo del mínimo.', 'Margin below minimum.'));
    }
    abrirCheckoutAposValidacoes();
  };

  useEffect(() => {
    const lidarAtalhos = (e) => {
      if (e.key === 'F10') {
        e.preventDefault();
        abrirFechamento();
      }
    };
    window.addEventListener('keydown', lidarAtalhos);
    return () => window.removeEventListener('keydown', lidarAtalhos);
  });

  const adicionarPagamento = () => {
    const valorNum = parseFloat(String(valorLancamentoInput).replace(',', '.')) || 0;
    if (valorNum <= 0) return;
    const configForma = catalogoFormas.find(f => f.id === formaSelecionada) || catalogoFormas[0];
    let voucherSelecionado = null;
    if (configForma.id === 'voucher') {
      const codigo = String(voucherCodigoInput || '').trim().toUpperCase();
      voucherSelecionado = (vouchers || []).find(v => String(v.codigo || '').toUpperCase() === codigo && v.status === 'ativo' && Number(v.saldoBRL || 0) > 0);
      if (!voucherSelecionado) return setModalZen({variante:'danger',titulo:'Voucher inválido',mensagem:'Código não encontrado, já utilizado ou sem saldo.',apenasConfirmar:true});
      if (valorNum > Number(voucherSelecionado.saldoBRL || 0) + 0.001) return setModalZen({variante:'warning',titulo:'Saldo insuficiente no voucher',mensagem:`Saldo disponível: ${fmt(voucherSelecionado.saldoBRL, 'BRL')}`,apenasConfirmar:true});
    }
    const valorBRL = converterParaBRL(valorNum, configForma.moedaOrigem);

  if (configForma.id === 'crediario') {
      if (!clienteSelecionadoPDV) return mostrarZen('warning', 'Cliente obrigatório', 'Para vender fiado, vincule um cliente antes de finalizar.');

      const limite = parseFloat(clienteSelecionadoPDV.limiteCreditoBRL) || 0;
      
      // TRAVA 1: Se o cliente não tem limite ou o limite é zero
      if (limite <= 0) {
        return mostrarZen('danger', 'Venda bloqueada', 'Este cliente não possui limite de crédito cadastrado ou o limite é zero.');
      }

      // TRAVA 2: Se a compra ultrapassar o limite (Sem opção de confirmar)
      const novoDevedor = (parseFloat(clienteSelecionadoPDV.saldoDevedorBRL) || 0) + valorBRL;
      if (novoDevedor > limite) {
        return mostrarZen('danger', 'Limite de crédito excedido', `Limite: ${fmt(limite, 'BRL')}. Com esta compra, a dívida iria para ${fmt(novoDevedor, 'BRL')}.`);
      }
    }

    const novaLista = [...pagamentosLancados, { 
      id: Date.now(), 
      formaId: configForma.id, 
      rotulo: configForma.rotulo,
      icone: configForma.icone,
      moedaOrigem: configForma.moedaOrigem,
      valorOriginal: valorNum, 
      valorConvertidoBRL: valorBRL,
      voucherCodigo: voucherSelecionado?.codigo || null
    }];
    setPagamentosLancados(novaLista);
    const novoSaldo = Math.max(0, totalFinalBRL - novaLista.reduce((acc, p) => acc + p.valorConvertidoBRL, 0));
    setValorLancamentoInput(novoSaldo > 0 ? converterDeBRL(novoSaldo, configForma.moedaOrigem).toFixed(2) : '');
    if (configForma.id === 'voucher') setVoucherCodigoInput('');
  };

  const concluirTransacao = async (tipoFinalizacao) => {
    if (operacaoEmAndamentoRef.current) return;
    if (tipoFinalizacao === 'venda' && (!podeFinalizarVenda || !sessaoAtiva)) return;
    operacaoEmAndamentoRef.current = true;
    setProcessandoTransacao(true);
    try {
      let eventosEstoqueVenda = [];
      const lancamentosFinanceirosVenda = [];
      let valorFiadoOperacao = 0;
      const assinaturaOperacao = JSON.stringify({
        tipoFinalizacao,
        prePedidoEmAbertoId: prePedidoEmAbertoId || null,
        itens: (itensVenda || []).map(it => [it.id, Number(it.qtd || 0), Number(it.precoPraticadoBRL || it.precoBRL || 0)]),
        total: Number(totalFinalBRL || 0),
        clienteId: clienteSelecionadoPDV?.id || null,
        pagamentos: (pagamentosLancados || []).map(p => [p.formaId, Number(p.valorConvertidoBRL || 0), p.voucherCodigo || null]),
      });
      const idsParaRemover = itensVenda
        .filter(it => ehEncomendaUsoUnico(it))
        .map(it => ({ id: it.produtoOriginalId || it.id, sku: it.produtoOriginalSku || it.sku }));
      
      let novosProdutos = produtos;
      let novosClientes = null;
      const itensVendaAtualizada = itensVendaComCustoAtual(itensVenda);
      let itensDocumento = [...itensVendaAtualizada];
      const instanteVenda = new Date();
      const docRotulo = tipoFinalizacao === 'venda' ? 'VENDA' : (tipoFinalizacao === 'pre_pedido' ? 'PRÉ-PEDIDO' : 'ORÇAMENTO');
      if (operacaoDocumentoRef.current.assinatura !== assinaturaOperacao || !operacaoDocumentoRef.current.id) {
        operacaoDocumentoRef.current = {
          assinatura: assinaturaOperacao,
          id: `${docRotulo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
      }
      const vendaId = operacaoDocumentoRef.current.id;

      if (tipoFinalizacao === 'venda') {
        const itensComUsoVitrine = (itensVendaAtualizada || []).filter((it) => !ehEncomendaUsoUnico(it) && it.tipoItem !== 'servico').map((it) => {
          const produtoAtual = obterProdutoCatalogoSeguro(it, 'prévia de baixa de estoque');
          return { item: it, previsao: preverBaixaEstoqueProduto(produtoAtual, Number(it.qtd) || 0) };
        }).filter(({ previsao }) => previsao.movimento.vitrine > 0);
        if (itensComUsoVitrine.length > 0) {
          const linhas = itensComUsoVitrine.map(({ item, previsao }) => `${item.nome}: baixa prevista Vitrine ${previsao.movimento.vitrine} + Depósito ${previsao.movimento.galpao} • saldo atual V:${previsao.saldo.estoqueVitrine} D:${previsao.saldo.estoqueGalpao}`);
          const confirmouVitrine = await pedirConfirmacaoZen({
            variante:'warning',
            titulo:'Atenção ao estoque da vitrine',
            mensagem:'Esta venda utilizará unidades expostas na vitrine.',
            detalhes:[...linhas, 'Considere repor a vitrine após concluir a venda.'],
            confirmarTexto:'Continuar venda'
          });
          if (!confirmouVitrine) return;
        }

        // ATT 02: uma única operação mantém estoque total = vitrine + galpão
        // e registra em cada item exatamente de onde a mercadoria saiu.
        const resultadoEstoque = aplicarVendaAoEstoque(produtos || [], itensVendaAtualizada || [], idsParaRemover);
        novosProdutos = resultadoEstoque.produtos;
        itensDocumento = resultadoEstoque.itens;

        eventosEstoqueVenda = resultadoEstoque.itens
          .filter((it) => it.movimentoEstoqueVenda?.total > 0)
          .map((it, index) => {
            const mov = it.movimentoEstoqueVenda;
            const origem = mov.vitrine > 0 && mov.galpao > 0 ? 'vitrine+deposito' : mov.vitrine > 0 ? 'vitrine' : 'deposito';
            return criarEventoEstoque({
              id: `${vendaId}-${it.produtoOriginalId || it.id}-${index}`,
              produto: it,
              tipo: 'venda',
              origem,
              destino: 'cliente',
              quantidade: mov.total,
              saldoAntes: it.saldoEstoqueVenda?.antes,
              saldoDepois: it.saldoEstoqueVenda?.depois,
              motivo: 'Venda no PDV',
              operador: operadorAtivo,
              referenciaId: vendaId,
              detalhes: { vitrine: mov.vitrine, deposito: mov.galpao },
              createdAt: instanteVenda.toISOString(),
            });
          });
        // Em ATT10.2 a auditoria da venda entra na mesma transação do histórico/estoque.
        // Fallback preservado para runtimes antigos sem commitVendaCritica.
        if (typeof commitVendaCritica !== 'function') {
          await registrarEventosEstoque({ db, userId, eventos: eventosEstoqueVenda });
        }

        const valorFiado = pagamentosLancados.filter(p => p.formaId === 'crediario').reduce((acc, p) => acc + (parseFloat(p.valorConvertidoBRL) || 0), 0);
        valorFiadoOperacao = valorFiado;
        
        if (valorFiado > 0 && clienteSelecionadoPDV) {
          novosClientes = (clientes || []).map(c => 
            String(c.id) === String(clienteSelecionadoPDV.id) 
              ? { ...c, saldoDevedorBRL: (parseFloat(c.saldoDevedorBRL) || 0) + valorFiado } 
              : c
          );
        }
      }

      const idSeguro = (operadorAtivo && operadorAtivo.id) ? operadorAtivo.id : 'admin';
      const nomeSeguro = (operadorAtivo && operadorAtivo.nome) ? operadorAtivo.nome : 'Administrador';

      const estadoFinal = tipoFinalizacao === 'venda' ? 'concluida' : (tipoFinalizacao === 'pre_pedido' ? 'pendente' : 'orcamento');
      if (tipoFinalizacao === 'venda') {
        itensDocumento = itensDocumento.map(item => ({
          ...item,
          custoNaVendaBRL: Number.isFinite(Number(item.custoBRL)) && Number(item.custoBRL) >= 0 ? Number(item.custoBRL) : 0,
        }));
      }
      const cmvVendaBRL = tipoFinalizacao === 'venda' ? calcularCmvVenda({ itens: itensDocumento }) : null;

      const novaVenda = {
        id: vendaId,
        createdAt: instanteVenda.toISOString(),
        dataHora: instanteVenda.toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR'),
        clienteId: clienteSelecionadoPDV ? clienteSelecionadoPDV.id : null,
        clienteNome: (String(clienteSelecionadoPDV?.nome || '').trim() || String(nomeClienteVulso || '').trim() || tx('Consumidor Balcão', 'Consumidor', 'Walk-in')),
        vendedorId: idSeguro,
        vendedorNome: nomeSeguro,
        itens: itensDocumento, 
        totalBRL: totalFinalBRL, 
        lucroBRL: tipoFinalizacao === 'venda' ? totalFinalBRL - cmvVendaBRL : lucroEstimadoBRL,
        ...(tipoFinalizacao === 'venda' ? { cmvBRL: cmvVendaBRL } : {}),
        trocoBRL: tipoFinalizacao === 'venda' ? trocoTotalBRL : 0,
        moedaTrocoInfo: tipoFinalizacao === 'venda' && trocoTotalBRL > 0.01 ? `${moedaTrocoEscolhida}` : null,
        pagamentos: tipoFinalizacao === 'venda' ? [...pagamentosLancados] : [],
        taxasCambio: { BRL: 1, ...(taxasCambio || {}) },
        detalhesPagamento: tipoFinalizacao === 'venda' ? (pagamentosLancados.map(p => `${p.rotulo}: ${(parseFloat(p.valorOriginal)||0).toFixed(2)}`).join(' • ') || tx('Dinheiro', 'Efectivo', 'Cash')) : docRotulo,
        estado: estadoFinal,
        tipoDocumento: tipoFinalizacao
      };

      if (tipoFinalizacao === 'venda' && (typeof registrarFinanceiro === 'function' || typeof commitVendaCritica === 'function')) {
        try {
          const registrarFinanceiroVenda = async (entrada) => {
            const enriquecida = {
              ...entrada,
              operadorId: entrada?.operadorId || operadorAtivo?.id || 'admin',
              operadorNome: entrada?.operadorNome || operadorAtivo?.nome || 'Administrador',
            };
            if (typeof commitVendaCritica === 'function') {
              lancamentosFinanceirosVenda.push(enriquecida);
              return enriquecida;
            }
            return registrarFinanceiro(enriquecida);
          };
          let trocoRestante = Math.max(0, Number(trocoTotalBRL) || 0);
          const clienteAntes = clienteSelecionadoPDV ? Number(clienteSelecionadoPDV.saldoDevedorBRL || 0) : null;
          const pagamentosFiado = pagamentosLancados.filter(p => p.formaId === 'crediario');
          const valorFiadoTotal = pagamentosFiado.reduce((a,p)=>a+(Number(p.valorConvertidoBRL)||0),0);
          const clienteDepois = clienteAntes == null ? null : clienteAntes + valorFiadoTotal;

          // Fiado vira um único débito no extrato do cliente, mesmo que haja mais de um lançamento de crédito na mesma venda.
          if (valorFiadoTotal > 0) {
            await registrarFinanceiroVenda({
              id: `VENDA-${vendaId}-FIADO`,
              tipo: 'venda_fiada',
              origem: 'pdv',
              referenciaId: vendaId,
              valor: valorFiadoTotal,
              formaPagamento: 'crediario',
              createdAt: novaVenda.createdAt,
              afetaCaixaFisico: false,
              afetaResultado: true,
              direcao: 'entrada',
              sessaoId: null,
              clienteId: novaVenda.clienteId,
              clienteNome: novaVenda.clienteNome,
              saldoClienteAntes: clienteAntes,
              saldoClienteDepois: clienteDepois,
              observacao: `Venda fiada ${vendaId}`,
            });
          }

          const pagamentosImediatos = pagamentosLancados.filter(p => p.formaId !== 'crediario');
          for (let index = 0; index < pagamentosImediatos.length; index += 1) {
            const pag = pagamentosImediatos[index];
            const bruto = Math.max(0, Number(pag.valorConvertidoBRL) || 0);
            let valorEfetivo = bruto;
            if (String(pag.formaId || '').startsWith('dinheiro') && trocoRestante > 0) {
              const abatido = Math.min(trocoRestante, valorEfetivo);
              valorEfetivo -= abatido;
              trocoRestante -= abatido;
            }
            if (valorEfetivo <= 0) continue;
            await registrarFinanceiroVenda({
              id: `VENDA-${vendaId}-PG-${index}-${String(pag.formaId || 'outro')}`,
              tipo: 'venda',
              origem: 'pdv',
              referenciaId: vendaId,
              valor: valorEfetivo,
              formaPagamento: pag.formaId,
              createdAt: novaVenda.createdAt,
              afetaCaixaFisico: String(pag.formaId || '').startsWith('dinheiro'),
              afetaResultado: true,
              direcao: 'entrada',
              sessaoId: sessaoAtiva?.id || null,
              clienteId: novaVenda.clienteId,
              clienteNome: novaVenda.clienteNome,
              observacao: `Venda ${vendaId} • ${pag.rotulo}`,
            });
          }
        } catch (erroFinanceiro) {
          console.error('Falha ao registrar a venda no Livro Financeiro:', erroFinanceiro);
          setModalZen({
            variante: 'danger',
            titulo: 'Venda não concluída',
            mensagem: 'Não foi possível registrar o financeiro desta venda com segurança.',
            detalhes: 'Nenhum estoque, cliente ou histórico de venda foi alterado. Tente novamente antes de prosseguir.',
            apenasConfirmar: true,
          });
          return;
        }
      }

      let novoHist = Array.isArray(historicoVendas) ? historicoVendas : [];
      if (prePedidoEmAbertoId) {
        novoHist = novoHist.filter(h => h.id !== prePedidoEmAbertoId);
      }
      const historicoProposto = [novaVenda, ...novoHist];

      let vouchersPropostos = Array.isArray(vouchers) ? vouchers : [];
      if (tipoFinalizacao === 'venda') {
        const usos = pagamentosLancados.filter(p => p.formaId === 'voucher' && p.voucherCodigo);
        if (usos.length > 0) {
          vouchersPropostos = vouchersPropostos.map(v => {
            const uso = usos.filter(u => String(u.voucherCodigo).toUpperCase() === String(v.codigo).toUpperCase()).reduce((a,u)=>a+(Number(u.valorConvertidoBRL)||0),0);
            if (!uso) return v;
            const saldo = Math.max(0, Number(v.saldoBRL || 0) - uso);
            return {...v, saldoBRL: saldo, status: saldo <= 0.001 ? 'utilizado' : 'ativo', usadoEm: new Date().toISOString(), ultimaVendaId: novaVenda.id};
          });
        }
      }

      let valoresConfirmados = {
        historicoVendas: historicoProposto,
        produtos: novosProdutos,
        clientes: novosClientes || clientes,
        vouchers: vouchersPropostos,
      };

      if (typeof commitVendaCritica === 'function') {
        const changes = [
          { field:'historicoVendas', value:historicoProposto, storageSuffix:'historico_vendas', removeEntityIds: prePedidoEmAbertoId ? [prePedidoEmAbertoId] : [] },
        ];
        if (tipoFinalizacao === 'venda') {
          changes.push({ field:'produtos', value:novosProdutos, storageSuffix:'produtos' });
          if (novosClientes) changes.push({ field:'clientes', value:novosClientes, storageSuffix:'clientes' });
          if (!Object.is(vouchersPropostos, vouchers)) changes.push({ field:'vouchers', value:vouchersPropostos, storageSuffix:'vouchers' });
        }
        const guards = [];
        if (tipoFinalizacao === 'venda' && sessaoAtiva?.id) guards.push({ type:'cash_session_open', sessionId:sessaoAtiva.id });
        if (tipoFinalizacao === 'venda' && valorFiadoOperacao > 0 && clienteSelecionadoPDV?.id) {
          guards.push({ type:'client_credit_capacity', clientId:clienteSelecionadoPDV.id, amount:valorFiadoOperacao });
        }
        if (tipoFinalizacao === 'venda') {
          const usosVoucher = new Map();
          for (const p of pagamentosLancados || []) {
            if (p.formaId !== 'voucher' || !p.voucherCodigo) continue;
            const codigo = String(p.voucherCodigo).toUpperCase();
            usosVoucher.set(codigo, (usosVoucher.get(codigo) || 0) + Number(p.valorConvertidoBRL || 0));
          }
          for (const [code, amount] of usosVoucher.entries()) guards.push({ type:'voucher_balance_at_least', code, amount });
        }
        if (prePedidoEmAbertoId) {
          guards.push({
            type:'entity_field_equals',
            field:'historicoVendas',
            entityId:prePedidoEmAbertoId,
            entityKey:'id',
            property:'estado',
            expected:'pendente',
            message:'Este pré-pedido já foi liquidado ou deixou de estar pendente em outro caixa. Atualize a fila antes de continuar.',
          });
        }
        const confirmado = await commitVendaCritica({
          changes,
          financialEntries: lancamentosFinanceirosVenda,
          stockEvents: eventosEstoqueVenda,
          guards,
          operationKey: `pdv:${vendaId}`,
        });
        if (!confirmado?.cloudOk) {
          setModalZen({
            variante:'danger',
            titulo: tipoFinalizacao === 'venda' ? 'Venda não concluída' : 'Documento não salvo',
            mensagem:'A nuvem não confirmou esta operação. Nada foi finalizado no PDV.',
            detalhes: confirmado?.error?.message || 'Verifique conexão/quota e tente novamente sem fechar esta tela.',
            apenasConfirmar:true,
          });
          return;
        }
        valoresConfirmados = { ...valoresConfirmados, ...(confirmado.values || {}) };
      }

      if (tipoFinalizacao === 'venda') {
        setProdutos(valoresConfirmados.produtos || novosProdutos);
        if (novosClientes) setClientes(valoresConfirmados.clientes || novosClientes);
        if (setVouchers && !Object.is(vouchersPropostos, vouchers)) setVouchers(valoresConfirmados.vouchers || vouchersPropostos);
      }
      if (typeof setHistoricoVendas === 'function') {
        setHistoricoVendas(valoresConfirmados.historicoVendas || historicoProposto);
      }
      setVendaConcluidaObj(novaVenda);
      setVendaSucesso(true);
      // Força a tela de imprimir o recibo a saltar, mesmo em Orçamentos/Pré-Pedidos
      setModalFechamentoAberto(true);

    } catch (err) {
      console.error("Erro fatal ao finalizar documento:", err);
      if (err?.code === 'ZENOS_ESTOQUE_INSUFICIENTE' || err?.code === 'ZENOS_PRODUTO_NAO_ENCONTRADO' || err?.code === 'ZENOS_PRODUTO_IDENTIDADE_DUPLICADA') {
        mostrarZen('danger', 'Venda não concluída', err.message);
        return;
      }
      mostrarZen('danger', 'Documento não concluído', 'Houve um erro interno ao processar o documento. Nenhum passo adicional deve ser realizado até tentar novamente.');
    } finally {
      operacaoEmAndamentoRef.current = false;
      setProcessandoTransacao(false);
    }
  };

  const executarImpressaoNativa = () => {
    const elementoCupom = document.getElementById('area-cupom-pdv');
    if (!elementoCupom) return;
    const janelaImpressao = window.open('', '_blank', 'width=400,height=600');
    if (!janelaImpressao) return mostrarZen('warning', 'Impressão bloqueada', 'O navegador bloqueou a janela de impressão. Permita pop-ups para o ZenOS e tente novamente.');
    janelaImpressao.document.write(`
      <!DOCTYPE html><html><head><title>Cupom</title><style>@page{margin:0;size:${larguraCssRecibo(perfilRecibo)} auto;}body{font-family:monospace;font-size:12px;color:#000;background:#fff;margin:0;padding:10px;width:${larguraCssRecibo(perfilRecibo)};box-sizing:border-box;}table{width:100%;border-collapse:collapse;font-size:11px;}th,td{padding:3px 0;}</style></head>
      <body>${elementoCupom.innerHTML}<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script></body></html>
    `);
    janelaImpressao.document.close();
  };

  const limparParaNovaVenda = () => {
    operacaoDocumentoRef.current = { assinatura: null, id: null };
    setItensVenda([]); setDescontoTexto('0'); setPagamentosLancados([]);
    setClienteSelecionadoPDV(null); setNomeClienteVulso('');
    setPrePedidoEmAbertoId(null); 
    setModalFechamentoAberto(false); setVendaSucesso(false); setVendaConcluidaObj(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', width: '100%', boxSizing: 'border-box' }}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        @media (max-width: 900px) {
          .pdv-grid-main { grid-template-columns: 1fr !important; }
        }
      `}</style>
      
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} confirmarTexto={modalZen?.confirmarTexto||'OK'} cancelarTexto={modalZen?.cancelarTexto||'Cancelar'} apenasConfirmar={modalZen?.apenasConfirmar} onConfirmar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(true); }} onCancelar={()=>{ const r=modalZen?.resolver; setModalZen(null); if(r) r(false); }}/>

      {modalSenhaMargem && <div style={{position:'fixed',inset:0,zIndex:20500,background:'rgba(2,6,23,.9)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{width:'100%',maxWidth:460,background:'#0b1120',border:'1px solid #f43f5e',borderRadius:24,overflow:'hidden',color:'#fff',boxShadow:'0 30px 80px rgba(0,0,0,.65)'}}><div style={{display:'flex',alignItems:'center',gap:14,padding:'20px 22px',background:'linear-gradient(135deg,#2e0a16,#0b1120)'}}><img src="/logo-zenos.png?v=4" alt="ZenOS" style={{width:48,height:48,objectFit:'contain'}}/><div><div style={{fontSize:10,fontWeight:900,letterSpacing:2,color:'#f43f5e'}}>ZENOS • PROTEÇÃO DE MARGEM</div><div style={{fontSize:19,fontWeight:900,marginTop:3}}>🔐 Autorização gerencial</div></div></div><div style={{padding:'20px 22px'}}><div style={{fontSize:13,lineHeight:1.55,color:'#e2e8f0',marginBottom:14}}>Margem atual: <b>{margemLucroReal.toFixed(1)}%</b> • mínimo: <b>{margemMinima}%</b>. Informe a senha gerencial para liberar excepcionalmente esta venda.</div><input autoFocus type="text" inputMode="text" autoComplete="one-time-code" name="zenos-manager-approval-pin" data-lpignore="true" data-1p-ignore="true" value={senhaMargemInput} onChange={e=>setSenhaMargemInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')confirmarSenhaMargem();}} placeholder="PIN do Administrador / Gerência" style={{width:'100%',WebkitTextSecurity:'disc',boxSizing:'border-box',padding:13,borderRadius:10,border:'1px solid #f43f5e',background:'#020617',color:'#fff',outline:'none'}}/></div><div style={{display:'flex',gap:10,padding:'16px 22px 20px',borderTop:'1px solid #1e293b'}}><button onClick={()=>{setModalSenhaMargem(false);setSenhaMargemInput('');}} style={{flex:1,padding:12,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#cbd5e1',fontWeight:900,cursor:'pointer'}}>Cancelar</button><button onClick={confirmarSenhaMargem} style={{flex:1,padding:12,borderRadius:10,border:'none',background:'#e11d48',color:'#fff',fontWeight:900,cursor:'pointer'}}>Autorizar venda</button></div></div></div>}

      {modalResgateAberto && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 2000, backgroundColor: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #8b5cf6', borderRadius: '20px', width: '100%', maxWidth: '600px', padding: '24px', color: '#fff', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 900, color: '#c084fc', letterSpacing: '1px', textTransform: 'uppercase' }}>Fila do Caixa</span>
                <h3 style={{ margin: '4px 0 0 0', color: '#ffffff', fontSize: '18px', fontWeight: 900 }}>📥 Resgatar Pré-Pedidos</h3>
              </div>
              <button onClick={() => setModalResgateAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {historicoVendas.filter(v => v.estado === 'pendente').length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', padding: '40px', backgroundColor: '#020617', borderRadius: '12px', border: '1px solid #1e293b' }}>Nenhum pré-pedido a aguardar pagamento no caixa.</div>
              ) : (
                historicoVendas.filter(v => v.estado === 'pendente').map(v => (
                  <div key={v.id} onClick={() => carregarPrePedido(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: '12px', cursor: 'pointer', transition: 'transform 0.2s', boxShadow: '0 4px 10px rgba(76,29,149,0.2)' }}>
                    <div>
                      <strong style={{ display: 'block', color: '#e2e8f0', fontSize: '15px' }}>{v.clienteNome}</strong>
                      <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>Vendedor: <span style={{color: '#a78bfa', fontWeight: 800}}>{v.vendedorNome}</span> • {v.dataHora}</span>
                    </div>
                    <div style={{ fontWeight: 900, color: '#34d399', fontSize: '16px' }}>{fmt(v.totalBRL)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {vendaSucesso && vendaConcluidaObj && (vendaConcluidaObj.tipoDocumento === 'orcamento' || vendaConcluidaObj.tipoDocumento === 'pre_pedido') && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.95)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px', boxSizing: 'border-box' }}>
           <div style={{ backgroundColor: '#ffffff', border: '1px solid #10b981', borderRadius: '16px', width: '100%', maxWidth: '380px', maxHeight: '95vh', overflowY: 'auto', padding: '0', color: '#000', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
              <div id="area-cupom-pdv" style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                  {perfilRecibo.mostrarLogoRecibo !== false && perfilRecibo.logoLoja && <img src={perfilRecibo.logoLoja} alt="Logo" style={{maxWidth:'110px',maxHeight:'55px',objectFit:'contain',marginBottom:4}}/>}<h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>{perfilRecibo.nomeFantasia || 'ZenOS - SISTEMA DE GESTÃO'}</h2>{perfilRecibo.cabecalhoRecibo && <div style={{fontSize:'10px'}}>{perfilRecibo.cabecalhoRecibo}</div>}
                  <div style={{ fontSize: '10px' }}>{vendaConcluidaObj.tipoDocumento === 'pre_pedido' ? 'TICKET DE PRÉ-PEDIDO (NÃO PAGO)' : 'ORÇAMENTO SEM VALOR FISCAL'}<br/>{vendaConcluidaObj.dataHora}</div>
                </div>
                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <div style={{ marginBottom: '8px', fontSize: '11px' }}>
                  <strong>Cliente:</strong> {vendaConcluidaObj.clienteNome}<br/>
                  <strong>Balconista:</strong> {vendaConcluidaObj.vendedorNome}
                </div>
                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <table style={{ width: '100%', textAlign: 'left', fontSize: '11px' }}>
                  <thead><tr><th>Qtd</th><th>Item</th><th style={{ textAlign: 'right' }}>Vl. Un</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                  <tbody>
                    {vendaConcluidaObj.itens.map((it, idx) => (
                      <tr key={idx}><td>{it.qtd}</td><td>{it.nome.substring(0, 15)}</td><td style={{ textAlign: 'right' }}>{converterDeBRL(it.precoPraticadoBRL, moeda).toFixed(2)}</td><td style={{ textAlign: 'right' }}>{converterDeBRL((it.precoPraticadoBRL * it.qtd), moeda).toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}><span>TOTAL A PAGAR</span><span>{fmt(vendaConcluidaObj.totalBRL)}</span></div>
                <div style={{ marginTop: 6, fontSize: '10px' }}>
                  {moedasReciboAtivas.map(codigo => (
                    <div key={codigo} style={{ display:'flex', justifyContent:'space-between' }}>
                      <span>Total {codigo}</span>
                      <span>{formatarEquivalenciaBRL(vendaConcluidaObj.totalBRL || 0, codigo, cotacoesRecibo)}</span>
                    </div>
                  ))}
                </div>
                
                <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', border: '1px solid #000', padding: '5px' }}>
                  {vendaConcluidaObj.tipoDocumento === 'pre_pedido' ? 'DIRIJA-SE AO CAIXA PARA PAGAR' : 'ORÇAMENTO VÁLIDO POR 7 DIAS'}
                </div>

                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <div style={{ textAlign: 'center', fontSize: '10px' }}>{perfilRecibo.rodapeRecibo || 'Obrigado pela preferência! Volte sempre.'}</div>
              </div>
              <div className="no-print" style={{ padding: '20px', backgroundColor: '#f1f5f9', display: 'flex', gap: '10px', borderTop: '1px dashed #ccc', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', flexWrap: 'wrap' }}>
                <button onClick={executarImpressaoNativa} style={{ flex: 1, padding: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>🖨️ {tx('Imprimir', 'Imprimir', 'Print')}</button>
                <button onClick={limparParaNovaVenda} style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>{tx('Novo Atendimento', 'Nuevo', 'New')}</button>
              </div>
           </div>
        </div>
      )}

      {/* COLUNA ESQUERDA: CLIENTE, BUSCA E LISTA DE ITENS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <div style={{ position: 'absolute', top: '14px', left: '16px', fontSize: '18px' }}>👤</div>
            <input 
              type="text" 
              placeholder={tx('Consumidor Final (Digite o nome para avulso ou buscar fiado)...', 'Consumidor Final...', 'Walk-in Customer...')} 
              value={nomeClienteVulso} 
              onChange={(e) => { if (clienteSelecionadoPDV) setClienteSelecionadoPDV(null); setNomeClienteVulso(e.target.value); }} 
              onFocus={() => setFocoInputCliente(true)} 
              onBlur={() => setTimeout(() => setFocoInputCliente(false), 200)} 
              style={{ width: '100%', padding: '16px 20px 16px 44px', backgroundColor: clienteSelecionadoPDV ? '#082f49' : '#0b1120', border: `1px solid ${clienteSelecionadoPDV ? '#0284c7' : '#1e293b'}`, borderRadius: '14px', color: clienteSelecionadoPDV ? '#38bdf8' : '#f8fafc', fontSize: '15px', fontWeight: clienteSelecionadoPDV ? 900 : 600, outline: 'none', boxSizing: 'border-box' }} 
            />
            {clienteSelecionadoPDV && (
              <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#cbd5e1' }} className="hide-mobile">{tx('Fiado:', 'Deuda:', 'Debt:')} <strong style={{ color: clienteSelecionadoPDV.saldoDevedorBRL > 0 ? '#fb7185' : '#34d399' }}>{fmt(clienteSelecionadoPDV.saldoDevedorBRL, 'BRL')}</strong></span>
                <button onClick={removerClienteDoPDV} style={{ backgroundColor: '#020617', border: 'none', color: '#f43f5e', fontSize: '14px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
              </div>
            )}
            {focoInputCliente && clientesSugeridos.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '14px', overflow: 'hidden', zIndex: 50, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                {clientesSugeridos.map((c, index) => (
  <div key={c.id || `cli-antigo-${index}`} onMouseDown={(e) => { e.preventDefault(); selecionarClienteNoPDV(c); }} style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><strong style={{ color: '#f8fafc', fontSize: '14px' }}>{c.nome}</strong><br/><span style={{ color: '#64748b', fontSize: '11px' }}>Doc: {c.documento}</span></div><span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 800 }}>Vincular ➜</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={abrirCadastroClientePDV} style={{ padding: '16px 20px', backgroundColor: '#451a03', border: '1px solid #d97706', color: '#fbbf24', borderRadius: '14px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 15px rgba(217, 119, 6, 0.2)' }}>{tx('+ Cliente', '+ Cliente', '+ Client')}</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 900, color: '#38bdf8', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('digiteProdutoLabel')}</label>
            <button onClick={abrirCadastroProdutoPDV} style={{ backgroundColor: '#0369a1', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>{tx('+ Produto Balcão', '+ Producto Rápido', '+ Quick Product')}</button>
          </div>
          <div style={{ position: 'relative' }}>
            <input ref={inputBuscaRef} type="text" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} onKeyDown={lidarTecladoBusca} placeholder={t('buscaPlaceholder')} style={{ width: '100%', backgroundColor: '#0b1120', border: '2px solid #0284c7', color: '#f8fafc', fontSize: '16px', borderRadius: '14px', padding: '16px 20px', outline: 'none', boxSizing: 'border-box' }} autoFocus />
            {termoBusca.trim() !== '' && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '14px', overflow: 'hidden', zIndex: 50, maxHeight: '280px', overflowY: 'auto' }}>
                {produtosFiltrados.length > 0 ? produtosFiltrados.map((prod, index) => {
                  const estaFocado = index === indiceFocoBusca;
                  return (
                    <div key={prod.id} onClick={() => { setItemParaAdicionar(prod); setQtdDigitadaRapida('1'); }} onMouseEnter={() => setIndiceFocoBusca(index)} style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: estaFocado ? '#1e1b4b' : 'transparent' }}>
                      <div><div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '15px' }}>{prod.nome} {ehEncomendaUsoUnico(prod) && <span style={{ color: '#fbbf24', fontSize: '11px' }}>({tx('Encomenda', 'Especial', 'Order')})</span>}</div><div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>SKU: {prod.sku} • Estoque: <strong style={{ color: '#38bdf8' }}>{prod.estoque} {prod.unidadeMedida}</strong></div></div>
                      <div style={{ color: '#34d399', fontWeight: 900, fontSize: '16px' }}>{fmt(aplicarPrecoPorPerfilCliente(prod, clienteSelecionadoPDV))}</div>
                    </div>
                  );
                }) : <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>{tx('Nenhum produto localizado', 'Ningún producto', 'No products found')}</div>}
              </div>
            )}
          </div>
        </div>

        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('itensLancados')} ({itensVenda.length})</span>
          </div>
          <div style={{ padding: '8px', flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
            {itensVenda.length === 0 ? <div style={{ padding: '60px 20px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>{t('nenhumItem')}</div> : itensVenda.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #1e293b', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>{item.nome} {ehEncomendaUsoUnico(item) && <span style={{ color: '#fbbf24', fontSize: '10px' }}>(⭐ {tx('Encomenda', 'Especial', 'Order')})</span>}</div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>SKU: {item.sku}</span>
                    <span onClick={() => abrirEdicaoProdutoPDV(item)} style={{ fontSize: '11px', color: '#38bdf8', cursor: 'pointer', fontWeight: 600 }}>{tx('Editar', 'Editar', 'Edit')}</span>
                    <span onClick={() => removerItem(item.id)} style={{ fontSize: '11px', color: '#f43f5e', cursor: 'pointer', fontWeight: 600 }}>{tx('Remover', 'Eliminar', 'Remove')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                  <input type="number" value={item.qtd} onChange={(e) => atualizarQtd(item.id, e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '45px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontWeight: 800, fontSize: '13px', textAlign: 'center', padding: '6px', outline: 'none' }} />
                  <input type="text" value={item.precoTexto !== undefined ? item.precoTexto : converterDeBRL(item.precoPraticadoBRL, moeda).toFixed(2)} onChange={(e) => lidarDigitacaoPreco(item.id, e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '75px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 800, fontSize: '13px', textAlign: 'right', padding: '6px', outline: 'none' }} />
                  <div style={{ width: '85px', textAlign: 'right', fontWeight: 900, color: '#34d399', fontSize: '15px' }}>{fmt(Math.max(0, parseInt(item.qtd) || 0) * (item.precoPraticadoBRL || 0))}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
        
        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('resumoVenda')}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5e1' }}><span>{t('subtotal')}</span><span style={{ fontWeight: 700, color: '#fff' }}>{fmt(subtotalBrutoBRL)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: '#cbd5e1' }}>
            <span>{t('descontoGlobal')}</span>
            <input type="text" value={descontoTexto} onChange={(e) => setDescontoTexto(e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '75px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', padding: '6px 8px', color: '#fbbf24', fontWeight: 800, fontSize: '14px', textAlign: 'right', outline: 'none' }} />
          </div>
          <div style={{ height: '1px', backgroundColor: '#1e293b', margin: '4px 0' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>{t('totalPagar')}</span>
            <span style={{ fontSize: '28px', fontWeight: 900, color: '#34d399', letterSpacing: '-1px' }}>{fmt(totalFinalBRL)}</span>
          </div>
        </div>

        <div style={{ backgroundColor: bgSemafaro, border: `1px solid ${borderSemafaro}`, borderRadius: '16px', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: corSemafaro, textTransform: 'uppercase', marginBottom: '4px' }}>{tx('Semáforo de Lucratividade', 'Semáforo de Rentabilidad', 'Profitability Light')}</div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: corSemafaro }}>{textoSemafaro}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button disabled={processandoTransacao} onClick={() => { if(itensVenda.length===0) return; concluirTransacao('orcamento'); }} style={{ flex: 1, minWidth: '90px', padding: '12px', background: 'transparent', border: '1px solid #475569', color: '#94a3b8', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>
              🖨️ Orçamento
            </button>
            <button disabled={processandoTransacao} onClick={() => { if(itensVenda.length===0) return; concluirTransacao('pre_pedido'); }} style={{ flex: 1, minWidth: '90px', padding: '12px', background: '#021e15', border: '1px solid #10b981', color: '#34d399', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>
              📝 Pré-Pedido
            </button>
            <button onClick={() => setModalResgateAberto(true)} style={{ flex: 1, minWidth: '90px', padding: '12px', background: 'linear-gradient(135deg, #5b21b6, #4c1d95)', border: '1px solid #7c3aed', color: '#ddd6fe', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>
              📥 Resgatar
            </button>
          </div>
          
          <button onClick={abrirFechamento} style={{ background: vendaBloqueadaPorMargem ? '#334155' : 'linear-gradient(135deg, #4f46e5, #4338ca)', border: '1px solid #6366f1', color: '#fff', padding: '18px', borderRadius: '14px', fontSize: '15px', fontWeight: 900, cursor: vendaBloqueadaPorMargem ? 'not-allowed' : 'pointer', textAlign: 'center', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.3)', width: '100%', boxSizing: 'border-box' }}>
            [F10] Receber no Caixa {vendaBloqueadaPorMargem ? '🔒' : ''}
          </button>
        </div>
      </div>

      {itemParaAdicionar && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #6366f1', borderRadius: '20px', width: '100%', maxWidth: '400px', padding: '28px', color: '#fff', textAlign: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '10px' }}>{itemParaAdicionar.nome}</h3>
            {(() => {
              if (itemParaAdicionar.tipoItem === 'servico' || ehEncomendaUsoUnico(itemParaAdicionar)) return null;
              const saldo = obterEstoqueProduto(itemParaAdicionar);
              const previsao = preverBaixaEstoqueProduto(itemParaAdicionar, Math.max(1, parseInt(qtdDigitadaRapida) || 1));
              if (saldo.estoqueVitrine > 0) return <div style={{ marginBottom: '14px', padding: '10px 12px', backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.45)', borderRadius: '10px', color: '#fbbf24', fontSize: '12px', fontWeight: 800 }}>⚠️ Disponibilidade: Vitrine {saldo.estoqueVitrine} • Depósito {saldo.estoqueGalpao} • Total {saldo.estoque}. Para esta quantidade, a baixa prevista é Vitrine {previsao.movimento.vitrine} + Depósito {previsao.movimento.galpao}. {saldo.estoqueGalpao > 0 ? 'Considere repor a vitrine após a venda.' : 'O produto está disponível somente na vitrine.'}</div>;
              return <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '11px' }}>Vitrine: {saldo.estoqueVitrine} • Depósito: {saldo.estoqueGalpao} • Total: {saldo.estoque}</div>;
            })()}
            <input ref={inputQtdRapidaRef} type="number" value={qtdDigitadaRapida} onChange={e => setQtdDigitadaRapida(e.target.value)} onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter') confirmarAdicaoRapida(); if(e.key==='Escape') setItemParaAdicionar(null);}} style={{ width: '80px', padding: '10px', fontSize: '20px', textAlign: 'center', backgroundColor: '#020617', border: '1px solid #6366f1', color: '#fff', borderRadius: '8px', marginBottom: '20px', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setItemParaAdicionar(null)} style={{ flex: 1, padding: '12px', background: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 800 }}>{tx('Cancelar', 'Cancelar', 'Cancel')}</button>
              <button onClick={confirmarAdicaoRapida} style={{ flex: 2, padding: '12px', background: '#4f46e5', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>{tx('Adicionar', 'Añadir', 'Add')}</button>
            </div>
          </div>
        </div>
      )}

      {modalClientePDVAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #d97706', borderRadius: '24px', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '28px', color: '#fff', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24', letterSpacing: '1px', textTransform: 'uppercase' }}>{tx('Ficha de Cliente', 'Ficha de Cliente', 'Client Profile')}</span><h3 style={{ fontSize: '18px', fontWeight: 900, margin: '2px 0 0 0' }}>{tx('Cadastrar Novo Cliente no Balcão', 'Registrar Nuevo Cliente', 'New Walk-in Client')}</h3></div>
              <button onClick={() => setModalClientePDVAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
              <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Nome Completo / Razão Social', 'Nombre / Razón Social', 'Full Name')}</label><input type="text" value={formClientePDV.nome} onChange={(e) => setFormClientePDV({ ...formClientePDV, nome: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
              <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Perfil de Preço', 'Perfil de Precio', 'Price Profile')}</label><select value={formClientePDV.perfilPreco} onChange={(e) => setFormClientePDV({ ...formClientePDV, perfilPreco: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#38bdf8', fontSize: '12px', fontWeight: 800, padding: '10px', outline: 'none', boxSizing: 'border-box' }}><option value="preco1">{tx('Tabela Balcão', 'Precio Mostrador', 'Retail Price')}</option><option value="preco2">{tx('Tabela Pintor', 'Precio Pintor', 'Painter Price')}</option></select></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Documento (CPF/RUC)', 'Documento (CI/RUC)', 'ID (TAX/SSN)')}</label><input type="text" value={formClientePDV.documento} onChange={(e) => setFormClientePDV({ ...formClientePDV, documento: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
              <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>{tx('Telefone / WhatsApp', 'Teléfono / WhatsApp', 'Phone / WhatsApp')}</label><input type="text" value={formClientePDV.telefone} onChange={(e) => setFormClientePDV({ ...formClientePDV, telefone: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 800, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
              <div><label style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 800 }}>{tx('Limite Fiado (R$)', 'Límite Fiado ($)', 'Credit Limit ($)')}</label><input type="text" value={formClientePDV.limiteCreditoBRL} onChange={(e) => setFormClientePDV({ ...formClientePDV, limiteCreditoBRL: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #d97706', borderRadius: '8px', color: '#fbbf24', fontWeight: 900, fontSize: '14px', textAlign: 'right', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => setModalClientePDVAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{tx('Cancelar', 'Cancelar', 'Cancel')}</button>
              <button onClick={salvarClientePDV} style={{ flex: 2, background: 'linear-gradient(135deg, #d97706, #b45309)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>{tx('Salvar e Vincular à Venda', 'Guardar y Vincular', 'Save and Link')}</button>
            </div>
          </div>
        </div>
      )}

      {modalProdutoPDVAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #0284c7', borderRadius: '24px', width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', padding: '28px', color: '#fff', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '1px', textTransform: 'uppercase' }}>Ficha Cadastral Universal • PDV Balcão</span><h3 style={{ fontSize: '18px', fontWeight: 900, margin: '2px 0 0 0' }}>{produtoEmEdicaoPDV ? `Editar: ${produtoEmEdicaoPDV.nome}` : tx('Cadastrar Novo Produto', 'Registrar Nuevo Producto', 'New Product')}</h3></div>
              <button onClick={() => setModalProdutoPDVAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', border: '1px solid rgba(217, 119, 6, 0.4)', borderRadius: '14px', padding: '14px 20px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="checkbox" id="checkUsoUnico" checked={formProdutoPDV.usoUnicoEncomendado} onChange={e => setFormProdutoPDV({...formProdutoPDV, usoUnicoEncomendado: e.target.checked})} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <div><label htmlFor="checkUsoUnico" style={{ fontSize: '13px', fontWeight: 900, color: '#fbbf24', cursor: 'pointer' }}>{tx('⭐ Produto de Uso Único / Encomenda Especial', '⭐ Producto de Uso Único / Especial', '⭐ Single-Use / Special Order')}</label><p style={{ fontSize: '11px', color: '#cbd5e1', margin: '2px 0 0 0' }}>{tx('Marque somente para encomenda/uso único. Desmarcado, o produto entra normalmente no catálogo e no estoque.', 'Marque solo para pedido/uso único. Desmarcado, queda en catálogo y stock.', 'Check only for single-use/special orders. Unchecked items remain in catalog and stock.')}</p></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '18px' }}>
              {[{ id: 'mercadoria', rotulo: tx('Mercadoria', 'Mercancía', 'Retail'), icone: '📦' }, { id: 'materia_prima', rotulo: tx('Matéria-Prima', 'Materia Prima', 'Raw'), icone: '🧪' }, { id: 'kit', rotulo: 'Kit / Combo', icone: '🎁' }, { id: 'servico', rotulo: tx('Serviço', 'Servicio', 'Service'), icone: '🛠️' }].map(tipo => {
                const ativo = formProdutoPDV.tipoItem === tipo.id;
                return (<button key={tipo.id} type="button" onClick={() => setFormProdutoPDV({ ...formProdutoPDV, tipoItem: tipo.id })} style={{ backgroundColor: ativo ? '#082f49' : '#020617', border: `1px solid ${ativo ? '#0284c7' : '#1e293b'}`, color: ativo ? '#38bdf8' : '#94a3b8', borderRadius: '10px', padding: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><span>{tipo.icone}</span><span>{tipo.rotulo}</span></button>);
              })}
            </div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>SKU</label><input type="text" value={formProdutoPDV.sku} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, sku: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 800, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Nome do Item</label><input type="text" value={formProdutoPDV.nome} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, nome: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Grupo / Categoria (Livre)</label>
                  <input type="text" placeholder="Ex: Tintas, Pincéis..." value={formProdutoPDV.grupo || ''} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, grupo: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Fornecedor / Marca</label>
                  <input type="text" placeholder="Ex: Suvinil, Tigre..." value={formProdutoPDV.fornecedor || ''} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, fornecedor: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px 20px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '12px', alignItems: 'start', marginBottom: '12px' }}>
                <div><label style={{ minHeight:28, display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Custo (R$)</label><input type="text" value={formProdutoPDV.custoBRL} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, custoBRL: e.target.value })} style={{ width: '100%', height:40, backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ minHeight:28, display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Preço Venda (R$)</label><input type="text" value={formProdutoPDV.precoBRL} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, precoBRL: e.target.value })} style={{ width: '100%', height:40, backgroundColor: '#0b1120', border: '1px solid #34d399', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ minHeight:28, display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>Vitrine / Loja</label><input type="number" disabled={Boolean(produtoEmEdicaoPDV)} value={formProdutoPDV.estoqueVitrine ?? 0} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, estoqueVitrine: e.target.value })} style={{ width: '100%', height:40, backgroundColor: '#0b1120', border: '1px solid #0369a1', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '10px', outline: 'none', boxSizing: 'border-box', opacity: produtoEmEdicaoPDV ? .65 : 1 }} /></div>
                <div><label style={{ minHeight:28, display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>Galpão / Depósito</label><input type="number" disabled={Boolean(produtoEmEdicaoPDV)} value={formProdutoPDV.estoqueGalpao ?? 0} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, estoqueGalpao: e.target.value })} style={{ width: '100%', height:40, backgroundColor: '#0b1120', border: '1px solid #7e22ce', borderRadius: '8px', color: '#a855f7', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '10px', outline: 'none', boxSizing: 'border-box', opacity: produtoEmEdicaoPDV ? .65 : 1 }} /></div>
              </div>
              {produtoEmEdicaoPDV && <div style={{fontSize:10,color:'#64748b',marginTop:-4,marginBottom:10}}>Para alterar estoque de produto existente, use as movimentações auditadas de Vitrine/Depósito no Catálogo.</div>}
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => setModalProdutoPDVAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{tx('Cancelar', 'Cancelar', 'Cancel')}</button>
              <button onClick={salvarProdutoPDV} style={{ flex: 2, background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>{tx('Salvar e Lançar na Venda', 'Guardar e Incluir', 'Save and Add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO (CHECKOUT - CAIXA E DOCUMENTOS) */}
      {modalFechamentoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: vendaSucesso ? '#ffffff' : '#0b1120', border: '1px solid #10b981', borderRadius: vendaSucesso ? '16px' : '24px', width: '100%', maxWidth: vendaSucesso ? '380px' : '750px', maxHeight: '95vh', overflowY: 'auto', padding: vendaSucesso ? '0' : '28px', color: vendaSucesso ? '#000' : '#fff', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', boxSizing: 'border-box' }}>
            {vendaSucesso ? (
              <div>
                <div id="area-cupom-pdv" style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                    {perfilRecibo.mostrarLogoRecibo !== false && perfilRecibo.logoLoja && <img src={perfilRecibo.logoLoja} alt="Logo" style={{maxWidth:'110px',maxHeight:'55px',objectFit:'contain',marginBottom:4}}/>}<h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>{perfilRecibo.nomeFantasia || 'ZenOS - SISTEMA DE GESTÃO'}</h2>{perfilRecibo.cabecalhoRecibo && <div style={{fontSize:'10px'}}>{perfilRecibo.cabecalhoRecibo}</div>}
                    <div style={{ fontSize: '10px' }}>{vendaConcluidaObj?.tipoDocumento === 'venda' ? 'Cupom de Venda Não Fiscal' : vendaConcluidaObj?.tipoDocumento === 'pre_pedido' ? 'TICKET DE PRÉ-PEDIDO (NÃO PAGO)' : 'ORÇAMENTO SEM VALOR FISCAL'}<br/>{vendaConcluidaObj?.dataHora}</div>
                  </div>
                  <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                  <div style={{ marginBottom: '8px', fontSize: '11px' }}>
                    <strong>Cliente:</strong> {vendaConcluidaObj?.clienteNome}<br/>
                    <strong>Operador:</strong> {vendaConcluidaObj?.vendedorNome}
                  </div>
                  <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                  <table style={{ width: '100%', textAlign: 'left', fontSize: '11px' }}>
                    <thead><tr><th>Qtd</th><th>Item</th><th style={{ textAlign: 'right' }}>Vl. Un</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                    <tbody>
                      {vendaConcluidaObj?.itens.map((it, idx) => (
                        <tr key={idx}><td>{it.qtd}</td><td>{it.nome.substring(0, 15)}</td><td style={{ textAlign: 'right' }}>{converterDeBRL(it.precoPraticadoBRL, moeda).toFixed(2)}</td><td style={{ textAlign: 'right' }}>{converterDeBRL((it.precoPraticadoBRL * it.qtd), moeda).toFixed(2)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}><span>TOTAL A PAGAR</span><span>{fmt(vendaConcluidaObj?.totalBRL)}</span></div>
                  <div style={{ marginTop: 6, fontSize: '10px' }}>
                    {moedasReciboAtivas.map(codigo => (
                      <div key={codigo} style={{ display:'flex', justifyContent:'space-between' }}>
                        <span>Total {codigo}</span>
                        <span>{formatarEquivalenciaBRL(vendaConcluidaObj?.totalBRL || 0, codigo, cotacoesRecibo)}</span>
                      </div>
                    ))}
                  </div>
                  
                  {vendaConcluidaObj?.tipoDocumento === 'venda' && (
                    <>
                      <div style={{ marginTop: '10px', fontSize: '11px' }}>
                        <strong>Pagamentos (Liquidados):</strong><br/>
                        {vendaConcluidaObj?.pagamentos.map((p, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.rotulo}</span><span>{p.valorOriginal.toFixed(2)}</span></div>)}
                      </div>
                      {vendaConcluidaObj?.trocoBRL > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '4px', backgroundColor: '#e2e8f0', padding: '2px' }}><span>TROCO ({vendaConcluidaObj.moedaTrocoInfo})</span><span>{formatarEquivalenciaBRL(vendaConcluidaObj.trocoBRL, vendaConcluidaObj.moedaTrocoInfo || 'BRL', cotacoesRecibo)}</span></div>}
                    </>
                  )}
                  {vendaConcluidaObj?.tipoDocumento === 'pre_pedido' && (
                    <div style={{ marginTop: '15px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold', border: '1px solid #000', padding: '5px' }}>AGUARDANDO PAGAMENTO NO CAIXA</div>
                  )}

                  <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                  <div style={{ textAlign: 'center', fontSize: '10px' }}>{perfilRecibo.rodapeRecibo || 'Obrigado pela preferência! Volte sempre.'}</div>
                </div>
                <div className="no-print" style={{ padding: '20px', backgroundColor: '#f1f5f9', display: 'flex', gap: '10px', borderTop: '1px dashed #ccc', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', flexWrap: 'wrap' }}>
                  <button onClick={executarImpressaoNativa} style={{ flex: 1, padding: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>🖨️ {tx('Imprimir', 'Imprimir', 'Print')}</button>
                  <button onClick={limparParaNovaVenda} style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>{tx('Novo Atendimento', 'Nueva Venta', 'New Sale')}</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#34d399', letterSpacing: '1px', textTransform: 'uppercase' }}>{tx('Fechamento de Caixa', 'Cierre de Caja', 'Checkout')}</span>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '4px 0 0 0' }}>{clienteSelecionadoPDV ? clienteSelecionadoPDV.nome : (nomeClienteVulso || tx('Consumidor Balcão', 'Consumidor', 'Walk-in'))}</h3>
                  </div>
                  <button onClick={() => setModalFechamentoAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>{tx('Total', 'Total', 'Total')}</span>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>{fmt(totalFinalBRL, 'BRL')}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>{tx('Pago', 'Pagado', 'Paid')}</span>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#34d399' }}>{fmt(totalPagoConvertidoBRL, 'BRL')}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>{saldoRestanteBRL > 0.01 ? tx('Falta', 'Falta', 'Due') : tx('Troco na Moeda:', 'Cambio en:', 'Change in:')}</span>
                    {saldoRestanteBRL > 0.01 ? (
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#fb7185' }}>{fmt(saldoRestanteBRL, 'BRL')}</div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: trocoTotalBRL > 0 ? '#fbbf24' : '#38bdf8' }}>{trocoTotalBRL > 0 ? `${converterDeBRL(trocoTotalBRL, moedaTrocoEscolhida).toFixed(2)}` : 'QUITADO ✓'}</div>
                        {trocoTotalBRL > 0 && (
                          <select value={moedaTrocoEscolhida} onChange={(e) => setMoedaTrocoEscolhida(e.target.value)} style={{ backgroundColor: '#0f172a', color: '#fbbf24', border: '1px solid #334155', borderRadius: '4px', fontSize: '11px', outline: 'none', cursor: 'pointer', padding: '2px' }}>
                            <option value="BRL">BRL</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="PYG">PYG</option>
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                 <select 
                    value={formaSelecionada} 
                    onChange={e => {
                      const novaForma = e.target.value;
                      setFormaSelecionada(novaForma);
                      const pendenteBRL = Math.max(0, totalFinalBRL - totalPagoConvertidoBRL);
                      const conf = catalogoFormas.find(f => f.id === novaForma) || catalogoFormas[0];
                      setValorLancamentoInput(pendenteBRL > 0 ? converterDeBRL(pendenteBRL, conf.moedaOrigem).toFixed(2) : '');
                    }} 
                    style={{ padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', color: '#f8fafc', fontSize: '14px', fontWeight: 800, outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}
                  >
                    {catalogoFormas.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.icone} {f.rotulo}
                      </option>
                    ))}
                  </select>
                  
                  <input 
                    ref={inputValorLancamentoRef} 
                    type="text" 
                    value={valorLancamentoInput} 
                    onChange={e => setValorLancamentoInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && adicionarPagamento()} 
                    placeholder="0.00" 
                    onFocus={e => e.target.select()}
                    style={{ padding: '14px', backgroundColor: '#020617', border: '1px solid #10b981', borderRadius: '12px', color: '#34d399', fontSize: '18px', fontWeight: 900, textAlign: 'right', outline: 'none', boxSizing: 'border-box', width: '100%' }} 
                  />
                </div>
                {formaSelecionada === 'voucher' && <div style={{margin:'-6px 0 14px'}}><label style={{fontSize:11,color:'#c084fc',fontWeight:900}}>CÓDIGO DO VOUCHER</label><input value={voucherCodigoInput} onChange={e=>setVoucherCodigoInput(e.target.value.toUpperCase())} placeholder="VALE-000000" style={{width:'100%',boxSizing:'border-box',marginTop:6,padding:12,borderRadius:10,border:'1px solid #8b5cf6',background:'#020617',color:'#e9d5ff',fontWeight:900,letterSpacing:1}}/></div>}
                
                <button 
                  onClick={adicionarPagamento} 
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '15px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)', boxSizing: 'border-box' }}
                >
                  + Lançar Pagamento
                </button>
                
                <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '20px', background: '#020617', padding: '10px', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  {pagamentosLancados.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px', padding: '15px 0' }}>{tx('Nenhum pagamento lançado.', 'Ningún pago.', 'No payments.')}</div>
                  ) : pagamentosLancados.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', fontSize: '13px', borderBottom: '1px solid #1e293b' }}>
                      <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{p.icone} {p.rotulo}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <strong style={{ color: '#fff', fontSize: '14px' }}>{p.valorOriginal.toFixed(2)}</strong>
                        <button onClick={() => setPagamentosLancados(pagamentosLancados.filter(x => x.id !== p.id))} style={{ color: '#f43f5e', backgroundColor: 'rgba(244, 63, 94, 0.1)', border: 'none', borderRadius: '6px', width: '24px', height: '24px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button onClick={() => setModalFechamentoAberto(false)} style={{ flex: 1, padding: '14px', backgroundColor: '#020617', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}>{tx('Cancelar', 'Cancelar', 'Cancel')}</button>
                  <button onClick={() => concluirTransacao('venda')} disabled={!podeFinalizarVenda || processandoTransacao} style={{ flex: 2, padding: '14px', background: (podeFinalizarVenda && !processandoTransacao) ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#1e293b', border: 'none', color: (podeFinalizarVenda && !processandoTransacao) ? '#fff' : '#64748b', borderRadius: '12px', cursor: (podeFinalizarVenda && !processandoTransacao) ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: '14px', boxShadow: podeFinalizarVenda ? '0 4px 15px rgba(2, 132, 199, 0.4)' : 'none' }}>{tx('Liquidar no Caixa', 'Finalizar', 'Pay & Close')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
