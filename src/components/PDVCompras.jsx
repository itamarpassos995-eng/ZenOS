import React, { useState, useEffect, useRef } from 'react';
import ZenModal from './ZenModal';
import { normalizarProduto } from '../data';
import { reporEstoqueProduto } from '../core/inventory';
import { db } from '../firebase';
import { criarEventoEstoque, registrarEventosEstoque } from '../core/stockAudit'; 
import { atualizarProdutoUnico, localizarIndiceProdutoUnico, skuJaExiste } from '../core/productIdentity';

export default function PDVCompras({ commitOperacaoNegocio, registrarFinanceiro, saldoSessaoFisicoBRL = 0, 
  userId, produtos, setProdutos, 
  fornecedores, setFornecedores,
  despesas, setDespesas,
  caixaMovimentos, setCaixaMovimentos, sessaoAtiva,
  moeda, fmt, t, tx, converterDeBRL, converterParaBRL, 
  historicoCompras, setHistoricoCompras, 
  operadorAtivo 
}) {
  const [termoBusca, setTermoBusca] = useState('');
  const [indiceFocoBusca, setIndiceFocoBusca] = useState(0);
  const [itensCompra, setItensCompra] = useState([]);
  const [descontoTexto, setDescontoTexto] = useState('0');
  const [acrescimoTexto, setAcrescimoTexto] = useState('0'); 
  
  const [nomeFornecedorVulso, setNomeFornecedorVulso] = useState('');
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState(null);
  const [focoInputFornecedor, setFocoInputFornecedor] = useState(false);

  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [produtoEmEdicao, setProdutoEmEdicao] = useState(null);
  const [formProduto, setFormProduto] = useState(normalizarProduto({}));

  const [modalFornecedorAberto, setModalFornecedorAberto] = useState(false);
  const [formFornecedor, setFormFornecedor] = useState({});

  const [itemParaAdicionar, setItemParaAdicionar] = useState(null);
  const [qtdDigitadaRapida, setQtdDigitadaRapida] = useState('1');
  
  const [modalFechamentoAberto, setModalFechamentoAberto] = useState(false);
  const [pagamentosLancados, setPagamentosLancados] = useState([]);
  const [formaSelecionada, setFormaSelecionada] = useState('boleto');
  const [valorLancamentoInput, setValorLancamentoInput] = useState('');
  
  const [compraSucesso, setCompraSucesso] = useState(false);
  const [compraConcluidaObj, setCompraConcluidaObj] = useState(null);
  const [processandoCompra, setProcessandoCompra] = useState(false);
  const compraEmAndamentoRef = useRef(false);
  const [modalZen, setModalZen] = useState(null);
  const avisarZen = (variante, titulo, mensagem, detalhes = []) => setModalZen({ variante, titulo, mensagem, detalhes, apenasConfirmar:true });
  const confirmarZen = ({ variante='warning', titulo, mensagem, detalhes=[], confirmarTexto='Confirmar' }) => new Promise(resolve => setModalZen({ variante, titulo, mensagem, detalhes, confirmarTexto, cancelarTexto:'Cancelar', resolver:resolve }));

  const inputBuscaRef = useRef(null);
  const inputQtdRapidaRef = useRef(null);
  const inputValorLancamentoRef = useRef(null);

  const termosProd = termoBusca.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const produtosFiltrados = produtos.filter(prod => {
    if (!prod) return false;
    const textoCompleto = `${prod.nome || ''} ${prod.sku || ''} ${prod.grupo || ''}`.toLowerCase();
    return termosProd.every(termo => textoCompleto.includes(termo));
  });

  const termosBuscaForn = nomeFornecedorVulso.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const fornecedoresSugeridos = (nomeFornecedorVulso.trim() && !fornecedorSelecionado && fornecedores)
    ? fornecedores.filter(f => {
        const textoCompleto = `${f.nome || ''} ${f.documento || ''}`.toLowerCase();
        return termosBuscaForn.every(termo => textoCompleto.includes(termo));
      })
    : [];

  useEffect(() => { setIndiceFocoBusca(0); }, [termoBusca]);
  useEffect(() => { if (itemParaAdicionar && inputQtdRapidaRef.current) { inputQtdRapidaRef.current.focus(); inputQtdRapidaRef.current.select(); } }, [itemParaAdicionar]);

  const selecionarFornecedor = (f) => {
    setFornecedorSelecionado(f); setNomeFornecedorVulso(f.nome); setFocoInputFornecedor(false);
  };
  const removerFornecedor = () => {
    setFornecedorSelecionado(null); setNomeFornecedorVulso('');
  };
  const abrirCadastroFornecedor = () => {
    setFormFornecedor({ nome: nomeFornecedorVulso, documento: '', telefone: '' });
    setModalFornecedorAberto(true);
  };
  const salvarFornecedor = async () => {
    if (!formFornecedor.nome.trim()) return avisarZen('warning','Fornecedor incompleto','Informe a Razão Social/Nome do fornecedor.');
    const novoForn = { ...formFornecedor, id: `FORN-${Date.now()}` };
    const listaProposta = [novoForn, ...(fornecedores || [])];
    try {
      let confirmados = listaProposta;
      if (typeof commitOperacaoNegocio === 'function') {
        const confirmado = await commitOperacaoNegocio({ changes:[{ field:'fornecedores', value:listaProposta, storageSuffix:'fornecedores' }] });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o fornecedor.');
        confirmados = confirmado.values?.fornecedores || listaProposta;
      }
      if (typeof setFornecedores === 'function') setFornecedores(confirmados);
      selecionarFornecedor(confirmados.find(f => String(f.id) === String(novoForn.id)) || novoForn);
      setModalFornecedorAberto(false);
    } catch (erro) {
      avisarZen('danger','Fornecedor não salvo','A nuvem não confirmou o cadastro do fornecedor.',[erro?.message || 'Falha de persistência']);
    }
  };

  const abrirCadastroProduto = () => {
    setProdutoEmEdicao(null); 
    setFormProduto(normalizarProduto({ sku: `NOVO-${Date.now().toString().slice(-5)}` }));
    setModalProdutoAberto(true);
  };
  const abrirEdicaoProduto = (prod) => {
    setProdutoEmEdicao(prod); 
    setFormProduto({
      ...normalizarProduto(prod), custoBRL: (prod.custoBRL || 0).toString(), precoBRL: (prod.precoBRL || 0).toString(),
      estoque: (prod.estoque || 0).toString()
    });
    setModalProdutoAberto(true);
  };
  const salvarProduto = async () => {
    if (!formProduto.nome.trim()) return avisarZen('warning','Produto incompleto','Informe o nome do produto.');
    const custo = parseFloat(String(formProduto.custoBRL).replace(',', '.')) || 0;
    const preco = parseFloat(String(formProduto.precoBRL).replace(',', '.')) || 0;
    const estoque = parseInt(String(formProduto.estoque)) || 0;

    if (skuJaExiste(produtos, formProduto.sku, produtoEmEdicao)) return avisarZen('danger','SKU duplicado',`Já existe outro produto com o SKU ${formProduto.sku}. Use um SKU diferente.`);
    const dadosFinais = normalizarProduto({ ...formProduto, custoBRL: custo, precoBRL: preco, estoque: estoque });
    if (!dadosFinais.id) dadosFinais.id = `PROD-${Date.now()}`;

    let listaProposta;
    if (produtoEmEdicao) {
      try { listaProposta = atualizarProdutoUnico(produtos, produtoEmEdicao, { ...produtoEmEdicao, ...dadosFinais }, 'edição de produto na compra'); }
      catch (erro) { return avisarZen('danger','Edição bloqueada',erro.message || 'Não foi possível editar este produto com segurança.'); }
    } else {
      listaProposta = [dadosFinais, ...(produtos || [])];
    }

    try {
      let produtosConfirmados = listaProposta;
      if (typeof commitOperacaoNegocio === 'function') {
        const confirmado = await commitOperacaoNegocio({ changes:[{ field:'produtos', value:listaProposta, storageSuffix:'produtos' }] });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou o produto.');
        produtosConfirmados = confirmado.values?.produtos || listaProposta;
      }
      setProdutos(produtosConfirmados);
      const produtoConfirmado = produtosConfirmados.find(p => String(p.id) === String(dadosFinais.id) && String(p.sku || '').toUpperCase() === String(dadosFinais.sku || '').toUpperCase()) || dadosFinais;
      if (produtoEmEdicao) {
        setItensCompra(itensCompra.map(item => String(item.produtoOriginalId || item.id) === String(produtoEmEdicao.id) && String(item.produtoOriginalSku || item.sku || '').toUpperCase() === String(produtoEmEdicao.sku || '').toUpperCase() ? { ...item, ...produtoConfirmado, produtoOriginalId: produtoConfirmado.id, produtoOriginalSku: produtoConfirmado.sku, custoPraticadoBRL: custo } : item));
      } else {
        setItemParaAdicionar(produtoConfirmado);
        setQtdDigitadaRapida('1');
      }
      setModalProdutoAberto(false);
    } catch (erro) {
      avisarZen('danger','Produto não salvo','A nuvem não confirmou o produto. O cadastro não foi considerado concluído.',[erro?.message || 'Falha de persistência']);
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
    const custoBase = itemParaAdicionar.custoBRL || 0;

    const indiceExistente = itensCompra.findIndex(i => String(i.produtoOriginalId || i.id) === String(itemParaAdicionar.id) && String(i.produtoOriginalSku || i.sku || '').toUpperCase() === String(itemParaAdicionar.sku || '').toUpperCase());

    if (indiceExistente !== -1) {
      const novaLista = [...itensCompra];
      const qtdAtual = parseInt(novaLista[indiceExistente].qtd) || 0;
      novaLista[indiceExistente] = { ...novaLista[indiceExistente], qtd: String(qtdAtual + qtdNum) };
      setItensCompra(novaLista);
    } else {
      setItensCompra([ ...itensCompra, { 
        ...itemParaAdicionar, 
        produtoOriginalId: itemParaAdicionar.id,
        produtoOriginalSku: itemParaAdicionar.sku,
        qtd: String(qtdNum), 
        custoPraticadoBRL: custoBase, 
        custoTexto: converterDeBRL(custoBase, moeda).toFixed(2) 
      }]);
    }
    setItemParaAdicionar(null); setTermoBusca(''); 
    if (inputBuscaRef.current) inputBuscaRef.current.focus();
  };

  const removerItem = (id) => { setItensCompra(itensCompra.filter(item => item.id !== id)); };
  const atualizarQtd = (id, valor) => { setItensCompra(itensCompra.map(item => item.id === id ? { ...item, qtd: String(Math.max(1, parseInt(valor) || 1)) } : item)); };
  const lidarDigitacaoCusto = (id, valorDigitado) => { setItensCompra(itensCompra.map(item => item.id === id ? { ...item, custoTexto: valorDigitado, custoPraticadoBRL: converterParaBRL(parseFloat(valorDigitado.replace(',', '.')) || 0, moeda) } : item)); };

  const subtotalBrutoBRL = itensCompra.reduce((acc, item) => acc + (Math.max(0, parseInt(item.qtd) || 0) * (item.custoPraticadoBRL || 0)), 0);
  const descBRL = converterParaBRL(parseFloat(String(descontoTexto).replace(',', '.')) || 0, moeda);
  const acrescBRL = converterParaBRL(parseFloat(String(acrescimoTexto).replace(',', '.')) || 0, moeda); 
  const totalFinalBRL = Math.max(0, (subtotalBrutoBRL + acrescBRL) - descBRL);

  const catalogoFormasPagamento = [
    { id: 'boleto', rotulo: 'Boleto / Faturado', moedaOrigem: 'BRL', icone: '📄', aPrazo: true },
    { id: 'prazo', rotulo: 'Fiado / Crediário', moedaOrigem: 'BRL', icone: '📒', aPrazo: true },
    { id: 'cheque', rotulo: 'Cheque Pré-Datado', moedaOrigem: 'BRL', icone: '📝', aPrazo: true },
    { id: 'cartao_credito', rotulo: 'Cartão de Crédito', moedaOrigem: 'BRL', icone: '💳', aPrazo: true },
    { id: 'dinheiro', rotulo: 'Dinheiro (Pagto Imediato)', moedaOrigem: 'BRL', icone: '💵', aPrazo: false }, 
    { id: 'pix', rotulo: 'Pix (Pagto Imediato)', moedaOrigem: 'BRL', icone: '⚡', aPrazo: false }, 
  ];

  const [qtdParcelas, setQtdParcelas] = useState(1);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [dataPrimeiroVenc, setDataPrimeiroVenc] = useState(() => new Date().toISOString().split('T')[0]);

  const configAtualForma = catalogoFormasPagamento.find(f => f.id === formaSelecionada) || catalogoFormasPagamento[0];

  const totalPagoConvertidoBRL = pagamentosLancados.reduce((acc, p) => acc + (p.valorConvertidoBRL || 0), 0);
  const saldoRestanteBRL = Math.max(0, totalFinalBRL - totalPagoConvertidoBRL);
  const podeFinalizarCompra = totalFinalBRL > 0 && totalPagoConvertidoBRL >= (totalFinalBRL - 0.05);

  const abrirFechamento = async () => {
    if (itensCompra.length === 0 || totalFinalBRL <= 0) return avisarZen('warning','Entrada vazia','Adicione produtos à nota de entrada.');
    if (!fornecedorSelecionado) {
        const confirmou = await confirmarZen({ titulo:'Entrada sem fornecedor', mensagem:'Você não selecionou um fornecedor. Deseja registrar a entrada de estoque de forma avulsa?', confirmarTexto:'Continuar sem fornecedor' });
        if (!confirmou) return;
    }
    setPagamentosLancados([]); 
    setFormaSelecionada('boleto');
    setQtdParcelas(1);
    setValorLancamentoInput(converterDeBRL(totalFinalBRL, 'BRL').toFixed(2));
    setCompraSucesso(false); 
    setModalFechamentoAberto(true);
  };

  useEffect(() => {
    const lidarAtalhos = (e) => {
      if (e.key === 'F10') { e.preventDefault(); abrirFechamento(); }
    };
    window.addEventListener('keydown', lidarAtalhos);
    return () => window.removeEventListener('keydown', lidarAtalhos);
  });

  const adicionarPagamento = () => {
    const valorNum = parseFloat(String(valorLancamentoInput).replace(',', '.')) || 0;
    if (valorNum <= 0) return;
    const configForma = catalogoFormasPagamento.find(f => f.id === formaSelecionada) || catalogoFormasPagamento[0];
    const valorBRL = converterParaBRL(valorNum, configForma.moedaOrigem);

    let novosPagamentos = [];

    if (configForma.aPrazo) {
      const parcelas = Math.max(1, parseInt(qtdParcelas) || 1);
      const valorParcelaBRL = valorBRL / parcelas;
      const valorParcelaOriginal = valorNum / parcelas;
      
      let dataBase = new Date(dataPrimeiroVenc);
      dataBase.setMinutes(dataBase.getMinutes() + dataBase.getTimezoneOffset());

      for (let i = 0; i < parcelas; i++) {
        let dataVenc = new Date(dataBase);
        dataVenc.setDate(dataVenc.getDate() + (i * parseInt(intervaloDias)));
        
        novosPagamentos.push({
          id: Date.now() + i,
          formaId: configForma.id,
          rotulo: `${configForma.rotulo} (${i + 1}/${parcelas})`,
          icone: configForma.icone,
          moedaOrigem: configForma.moedaOrigem,
          valorOriginal: valorParcelaOriginal,
          valorConvertidoBRL: valorParcelaBRL,
          geraDespesa: true,
          aPrazo: true,
          statusFinanceiro: 'pendente',
          dataVencimento: dataVenc.toISOString().split('T')[0]
        });
      }
    } else {
      novosPagamentos.push({
        id: Date.now(),
        formaId: configForma.id,
        rotulo: configForma.rotulo,
        icone: configForma.icone,
        moedaOrigem: configForma.moedaOrigem,
        valorOriginal: valorNum,
        valorConvertidoBRL: valorBRL,
        geraDespesa: true,
        aPrazo: false,
        statusFinanceiro: 'paga',
        dataVencimento: new Date().toISOString().split('T')[0]
      });
    }

    const novaLista = [...pagamentosLancados, ...novosPagamentos];
    setPagamentosLancados(novaLista);
    const novoSaldo = Math.max(0, totalFinalBRL - novaLista.reduce((acc, p) => acc + p.valorConvertidoBRL, 0));
    setValorLancamentoInput(novoSaldo > 0 ? converterDeBRL(novoSaldo, configForma.moedaOrigem).toFixed(2) : '');
    setQtdParcelas(1); 
  };

  const concluirEntradaMercadoria = async () => {
    if (compraEmAndamentoRef.current || !podeFinalizarCompra) return;
    const totalDinheiroImediato = pagamentosLancados.filter(p => !p.aPrazo && p.formaId === 'dinheiro').reduce((a,p)=>a+(Number(p.valorConvertidoBRL)||0),0);
    if (totalDinheiroImediato > 0 && !sessaoAtiva) {
      return setModalZen({ variante:'danger', titulo:'Caixa fechado', mensagem:'Para pagar uma compra em dinheiro é necessário um turno de caixa aberto.', apenasConfirmar:true });
    }
    if (totalDinheiroImediato > Number(saldoSessaoFisicoBRL || 0) + 0.001) {
      return setModalZen({ variante:'danger', titulo:'Saldo insuficiente na gaveta', mensagem:`Disponível: ${fmt(saldoSessaoFisicoBRL, 'BRL')}`, detalhes:[`Pagamento em dinheiro: ${fmt(totalDinheiroImediato, 'BRL')}`], apenasConfirmar:true });
    }
    compraEmAndamentoRef.current = true;
    setProcessandoCompra(true);

    try {
      const instanteCompra = new Date();
      const compraId = `COMPRA-${Date.now()}`;
      const eventosEstoque = [];
      // preflight de identidade: valida todos os itens antes de qualquer mutação de estoque.
      for (const item of itensCompra || []) {
        if (item.tipoItem === 'servico') continue;
        localizarIndiceProdutoUnico(produtos || [], { id: item.produtoOriginalId || item.id, sku: item.produtoOriginalSku || item.sku }, 'entrada de compra');
      }
      const novosProdutos = (produtos || []).map((p, index) => {
        const itemComprado = itensCompra.find(i => String(i.produtoOriginalId || i.id) === String(p.id) && (!i.produtoOriginalSku || String(i.produtoOriginalSku).toUpperCase() === String(p.sku || '').toUpperCase()));
        if (itemComprado && p.tipoItem !== 'servico') {
          const quantidadeEntrada = Math.max(0, Number(itemComprado.qtd) || 0);
          const entrada = reporEstoqueProduto(p, quantidadeEntrada, { vitrine: 0, galpao: quantidadeEntrada });
          eventosEstoque.push(criarEventoEstoque({
            id: `${compraId}-${p.id}-${index}`,
            produto: p,
            tipo: 'compra_entrada',
            origem: 'fornecedor',
            destino: 'deposito',
            quantidade: quantidadeEntrada,
            saldoAntes: entrada.auditoria?.antes,
            saldoDepois: entrada.auditoria?.depois,
            motivo: 'Entrada de compra',
            operador: operadorAtivo,
            referenciaId: compraId,
            createdAt: instanteCompra.toISOString(),
          }));
          return { ...entrada.produto, custoBRL: itemComprado.custoPraticadoBRL };
        }
        return p;
      });

      const idSeguro = operadorAtivo?.id || 'admin';
      const nomeSeguro = operadorAtivo?.nome || 'Administrador';
      const novaCompra = {
        id: compraId,
        createdAt: instanteCompra.toISOString(),
        dataHora: instanteCompra.toLocaleString(),
        fornecedorId: fornecedorSelecionado ? fornecedorSelecionado.id : null,
        fornecedorNome: fornecedorSelecionado ? fornecedorSelecionado.nome : 'Entrada Avulsa',
        operadorId: idSeguro,
        operadorNome: nomeSeguro,
        itens: [...itensCompra],
        totalBRL: totalFinalBRL,
        pagamentos: [...pagamentosLancados],
        estado: 'concluida',
        tipoDocumento: 'entrada_estoque',
        naturezaContabil: 'estoque_ativo'
      };
      const historicoProposto = [novaCompra, ...(historicoCompras || [])];

      const novasDespesas = pagamentosLancados.filter(pag => pag.geraDespesa).map((pag,index) => {
        const pagamentoImediato = !pag.aPrazo;
        return {
          id: `DESP-${compraId}-${index}`,
          descricao: `Compra de Estoque - ${fornecedorSelecionado ? fornecedorSelecionado.nome : 'Avulso'} | ${pag.rotulo}`,
          categoria: 'Mercadoria para Revenda',
          naturezaContabil: 'estoque_ativo',
          afetaResultado: false,
          compraId: novaCompra.id,
          valorBRL: pag.valorConvertidoBRL,
          dataVencimento: pag.dataVencimento,
          status: pagamentoImediato ? 'paga' : 'pendente',
          dataPagamento: pagamentoImediato ? instanteCompra.toISOString() : null,
          formaPagamento: pagamentoImediato ? pag.rotulo : null,
          recorrente: false,
          observacao: `Vinculado à nota de compra: ${novaCompra.id}. Mercadoria para revenda: movimenta caixa/contas a pagar, mas o custo entra no resultado quando a mercadoria é vendida.`
        };
      });
      const despesasPropostas = novasDespesas.length > 0 ? [...novasDespesas, ...(despesas || [])] : despesas;

      const pagamentosDinheiro = pagamentosLancados.filter(pag => !pag.aPrazo && pag.formaId === 'dinheiro');
      const novosMovimentos = sessaoAtiva ? pagamentosDinheiro.map((pag, index) => ({
        id: `MOV-${compraId}-${index}`,
        sessaoId: sessaoAtiva.id,
        dataHora: instanteCompra.toLocaleString(),
        createdAt: instanteCompra.toISOString(),
        tipo: 'saida_compra',
        direcao: 'saida',
        afetaGaveta: true,
        valorBRL: pag.valorConvertidoBRL,
        detalhesMoedas: { BRL: pag.valorOriginal },
        descricao: `Compra de estoque ${novaCompra.id}`,
        compraId: novaCompra.id,
        operador: nomeSeguro,
      })) : [];
      const caixaProposto = novosMovimentos.length > 0 ? [...novosMovimentos, ...(caixaMovimentos || [])] : caixaMovimentos;

      const financialEntries = pagamentosLancados
        .map((pag,index) => ({pag,index}))
        .filter(({pag}) => !pag.aPrazo && Number(pag.valorConvertidoBRL) > 0)
        .map(({pag,index}) => ({
          id: `COMPRA-${novaCompra.id}-${index}`,
          tipo: 'pagamento_compra',
          origem: 'compras',
          referenciaId: novaCompra.id,
          valor: Number(pag.valorConvertidoBRL) || 0,
          formaPagamento: pag.formaId,
          createdAt: novaCompra.createdAt,
          afetaCaixaFisico: pag.formaId === 'dinheiro',
          afetaResultado: false,
          direcao: 'saida',
          sessaoId: pag.formaId === 'dinheiro' ? sessaoAtiva?.id : null,
          observacao: `Pagamento da compra de estoque ${novaCompra.id}`,
          detalhes: { fornecedorId: novaCompra.fornecedorId, fornecedorNome: novaCompra.fornecedorNome },
          operadorId:idSeguro,
          operadorNome:nomeSeguro,
        }));

      let confirmados = {
        produtos:novosProdutos,
        historicoCompras:historicoProposto,
        despesas:despesasPropostas,
        caixaMovimentos:caixaProposto,
      };

      if (typeof commitOperacaoNegocio === 'function') {
        const changes = [
          { field:'produtos', value:novosProdutos, storageSuffix:'produtos' },
          { field:'historicoCompras', value:historicoProposto, storageSuffix:'historico_compras' },
        ];
        if (novasDespesas.length > 0) changes.push({ field:'despesas', value:despesasPropostas, storageSuffix:'despesas' });
        if (novosMovimentos.length > 0) changes.push({ field:'caixaMovimentos', value:caixaProposto, storageSuffix:'caixa_movs' });
        const totalDinheiro = pagamentosDinheiro.reduce((acc,pag)=>acc + Number(pag.valorConvertidoBRL || 0),0);
        const guards = totalDinheiro > 0 && sessaoAtiva?.id ? [
          { type:'cash_session_open', sessionId:sessaoAtiva.id },
          { type:'cash_balance_at_least', sessionId:sessaoAtiva.id, amount:totalDinheiro, message:'O saldo físico do caixa mudou em outro terminal. A compra em dinheiro foi bloqueada.' },
        ] : [];
        const confirmado = await commitOperacaoNegocio({ changes, financialEntries, stockEvents:eventosEstoque, guards });
        if (!confirmado?.cloudOk) throw confirmado?.error || new Error('A nuvem não confirmou a entrada de mercadoria.');
        confirmados = { ...confirmados, ...(confirmado.values || {}) };
      } else {
        await registrarEventosEstoque({ db, userId, eventos:eventosEstoque });
        if (typeof registrarFinanceiro === 'function') for (const entry of financialEntries) await registrarFinanceiro(entry);
      }

      setProdutos(confirmados.produtos || novosProdutos);
      if (typeof setHistoricoCompras === 'function') setHistoricoCompras(confirmados.historicoCompras || historicoProposto);
      if (novasDespesas.length > 0 && typeof setDespesas === 'function') setDespesas(confirmados.despesas || despesasPropostas);
      if (novosMovimentos.length > 0 && typeof setCaixaMovimentos === 'function') setCaixaMovimentos(confirmados.caixaMovimentos || caixaProposto);
      setCompraConcluidaObj(novaCompra);
      setCompraSucesso(true);
    } catch (err) {
      // Compatibilidade de contrato ATT07: titulo:'Compra não concluída' / Falha ao registrar compra no Livro Financeiro.
      console.error('Falha ao registrar compra no Livro Financeiro / operação atômica:', err);
      avisarZen('danger','Compra não concluída','A nuvem não confirmou a compra. Estoque, financeiro e caixa foram preservados.',[err?.message || 'Falha de persistência']);
    } finally {
      compraEmAndamentoRef.current = false;
      setProcessandoCompra(false);
    }
  };

  const limparParaNovaCompra = () => {
    setItensCompra([]); setDescontoTexto('0'); setAcrescimoTexto('0'); setPagamentosLancados([]);
    setFornecedorSelecionado(null); setNomeFornecedorVulso('');
    setModalFechamentoAberto(false); setCompraSucesso(false); setCompraConcluidaObj(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', width: '100%', boxSizing: 'border-box' }}>
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} confirmarTexto={modalZen?.confirmarTexto || "OK"} cancelarTexto={modalZen?.cancelarTexto || "Cancelar"} apenasConfirmar={!!modalZen?.apenasConfirmar} onConfirmar={()=>{const r=modalZen?.resolver;setModalZen(null);if(r)r(true);}} onCancelar={()=>{const r=modalZen?.resolver;setModalZen(null);if(r)r(false);}} />
      
      {compraSucesso && compraConcluidaObj && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.95)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px', boxSizing: 'border-box' }}>
           <div style={{ backgroundColor: '#ffffff', border: '2px solid #f97316', borderRadius: '16px', width: '100%', maxWidth: '380px', maxHeight: '95vh', overflowY: 'auto', padding: '0', color: '#000', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
              <div id="area-cupom-compras" style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                  <h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>ZenOS - ESPELHO DE COMPRA</h2>
                  <div style={{ fontSize: '10px' }}>COMPROVANTE DE ENTRADA DE ESTOQUE<br/>{compraConcluidaObj.dataHora}</div>
                </div>
                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <div style={{ marginBottom: '8px', fontSize: '11px' }}>
                  <strong>Fornecedor:</strong> {compraConcluidaObj.fornecedorNome}<br/>
                  <strong>Recebido por:</strong> {compraConcluidaObj.operadorNome}
                </div>
                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <table style={{ width: '100%', textAlign: 'left', fontSize: '11px' }}>
                  <thead><tr><th>Qtd</th><th>Item (SKU)</th><th style={{ textAlign: 'right' }}>Custo Un</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                  <tbody>
                    {compraConcluidaObj.itens.map((it, idx) => (
                      <tr key={idx}><td>{it.qtd}</td><td>{it.nome.substring(0, 15)}</td><td style={{ textAlign: 'right' }}>{converterDeBRL(it.custoPraticadoBRL, moeda).toFixed(2)}</td><td style={{ textAlign: 'right' }}>{converterDeBRL((it.custoPraticadoBRL * it.qtd), moeda).toFixed(2)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}><span>TOTAL DA NOTA</span><span>{fmt(compraConcluidaObj.totalBRL)}</span></div>
                
                <div style={{ marginTop: '10px', fontSize: '11px' }}>
                  <strong>Forma de Pagamento (Contas a Pagar):</strong><br/>
                  {compraConcluidaObj.pagamentos.map((p, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.rotulo}</span><span>{p.valorOriginal.toFixed(2)}</span></div>)}
                </div>
                <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                <div style={{ textAlign: 'center', fontSize: '10px', color: '#555' }}>Estoque atualizado com sucesso.</div>
              </div>
              <div className="no-print" style={{ padding: '20px', backgroundColor: '#f1f5f9', display: 'flex', gap: '10px', borderTop: '1px dashed #ccc', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', flexWrap: 'wrap' }}>
                <button onClick={limparParaNovaCompra} style={{ flex: 1, padding: '12px', background: '#f97316', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>Nova Entrada</button>
              </div>
           </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <div style={{ position: 'absolute', top: '14px', left: '16px', fontSize: '18px' }}>🏭</div>
            <input 
              type="text" 
              placeholder="Buscar Fornecedor / Fabricante..." 
              value={nomeFornecedorVulso} 
              onChange={(e) => { if (fornecedorSelecionado) setFornecedorSelecionado(null); setNomeFornecedorVulso(e.target.value); }} 
              onFocus={() => setFocoInputFornecedor(true)} 
              onBlur={() => setTimeout(() => setFocoInputFornecedor(false), 200)} 
              style={{ width: '100%', padding: '16px 20px 16px 44px', backgroundColor: fornecedorSelecionado ? '#4c1d95' : '#0b1120', border: `1px solid ${fornecedorSelecionado ? '#8b5cf6' : '#1e293b'}`, borderRadius: '14px', color: fornecedorSelecionado ? '#ddd6fe' : '#f8fafc', fontSize: '15px', fontWeight: fornecedorSelecionado ? 900 : 600, outline: 'none', boxSizing: 'border-box' }} 
            />
            {fornecedorSelecionado && (
              <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={removerFornecedor} style={{ backgroundColor: '#020617', border: 'none', color: '#f43f5e', fontSize: '14px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
              </div>
            )}
            {focoInputFornecedor && fornecedoresSugeridos.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '14px', overflow: 'hidden', zIndex: 50, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                {fornecedoresSugeridos.map((f, index) => (
                  <div key={f.id || `f-${index}`} onMouseDown={(e) => { e.preventDefault(); selecionarFornecedor(f); }} style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><strong style={{ color: '#f8fafc', fontSize: '14px' }}>{f.nome}</strong><br/><span style={{ color: '#64748b', fontSize: '11px' }}>Doc: {f.documento}</span></div><span style={{ color: '#a855f7', fontSize: '11px', fontWeight: 800 }}>Vincular ➜</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={abrirCadastroFornecedor} style={{ padding: '16px 20px', backgroundColor: '#3b0764', border: '1px solid #7e22ce', color: '#e9d5ff', borderRadius: '14px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 15px rgba(126, 34, 206, 0.2)' }}>+ Fornecedor</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 900, color: '#f97316', letterSpacing: '1px', textTransform: 'uppercase' }}>🔎 Localizar Mercadoria para Entrada</label>
            <button onClick={abrirCadastroProduto} style={{ backgroundColor: '#ea580c', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}>+ Novo Produto na Base</button>
          </div>
          <div style={{ position: 'relative' }}>
            <input ref={inputBuscaRef} type="text" value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} onKeyDown={lidarTecladoBusca} placeholder="Busque por nome, SKU, código de barras..." style={{ width: '100%', backgroundColor: '#0b1120', border: '2px solid #f97316', color: '#f8fafc', fontSize: '16px', borderRadius: '14px', padding: '16px 20px', outline: 'none', boxSizing: 'border-box' }} autoFocus />
            {termoBusca.trim() !== '' && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '14px', overflow: 'hidden', zIndex: 50, maxHeight: '280px', overflowY: 'auto' }}>
                {produtosFiltrados.length > 0 ? produtosFiltrados.map((prod, index) => {
                  const estaFocado = index === indiceFocoBusca;
                  return (
                    <div key={prod.id} onClick={() => { setItemParaAdicionar(prod); setQtdDigitadaRapida('1'); }} onMouseEnter={() => setIndiceFocoBusca(index)} style={{ padding: '14px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', backgroundColor: estaFocado ? '#431407' : 'transparent' }}>
                      <div><div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '15px' }}>{prod.nome}</div><div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>SKU: {prod.sku} • Estoque Atual: <strong style={{ color: '#f97316' }}>{prod.estoque} {prod.unidadeMedida}</strong></div></div>
                      <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'right' }}>Último Custo<br/><span style={{ color: '#fff', fontWeight: 900, fontSize: '14px' }}>{fmt(prod.custoBRL || 0)}</span></div>
                    </div>
                  );
                }) : <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Nenhum produto localizado na base. Deseja cadastrar?</div>}
              </div>
            )}
          </div>
        </div>

        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>Lista de Entrada ({itensCompra.length})</span>
          </div>
          <div style={{ padding: '8px', flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
            {itensCompra.length === 0 ? <div style={{ padding: '60px 20px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>Aguardando bipes ou buscas...</div> : itensCompra.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #1e293b', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>{item.nome}</div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>SKU: {item.sku}</span>
                    <span onClick={() => removerItem(item.id)} style={{ fontSize: '11px', color: '#f43f5e', cursor: 'pointer', fontWeight: 600 }}>Remover da Lista</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <label style={{ fontSize: '9px', color: '#64748b' }}>Qtd</label>
                    <input type="number" value={item.qtd} onChange={(e) => atualizarQtd(item.id, e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '50px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontWeight: 800, fontSize: '13px', textAlign: 'center', padding: '6px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <label style={{ fontSize: '9px', color: '#64748b' }}>Custo Un.</label>
                    <input type="text" value={item.custoTexto !== undefined ? item.custoTexto : converterDeBRL(item.custoPraticadoBRL, moeda).toFixed(2)} onChange={(e) => lidarDigitacaoCusto(item.id, e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '80px', backgroundColor: '#020617', border: '1px solid #f97316', borderRadius: '8px', color: '#fdba74', fontWeight: 800, fontSize: '13px', textAlign: 'right', padding: '6px', outline: 'none' }} />
                  </div>
                  <div style={{ width: '85px', textAlign: 'right', fontWeight: 900, color: '#f97316', fontSize: '15px', paddingTop: '14px' }}>{fmt(Math.max(0, parseInt(item.qtd) || 0) * (item.custoPraticadoBRL || 0))}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
        
        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>Resumo da Nota de Compra</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#cbd5e1' }}><span>Subtotal dos Produtos</span><span style={{ fontWeight: 700, color: '#fff' }}>{fmt(subtotalBrutoBRL)}</span></div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: '#cbd5e1' }}>
            <span>Frete / Impostos (R$)</span>
            <input type="text" value={acrescimoTexto} onChange={(e) => setAcrescimoTexto(e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '75px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', padding: '6px 8px', color: '#ef4444', fontWeight: 800, fontSize: '14px', textAlign: 'right', outline: 'none' }} />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', color: '#cbd5e1' }}>
            <span>Desconto Recebido (R$)</span>
            <input type="text" value={descontoTexto} onChange={(e) => setDescontoTexto(e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '75px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', padding: '6px 8px', color: '#34d399', fontWeight: 800, fontSize: '14px', textAlign: 'right', outline: 'none' }} />
          </div>
          
          <div style={{ height: '1px', backgroundColor: '#1e293b', margin: '4px 0' }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#94a3b8' }}>Total da Nota</span>
            <span style={{ fontSize: '28px', fontWeight: 900, color: '#f97316', letterSpacing: '-1px' }}>{fmt(totalFinalBRL)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={abrirFechamento} style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', border: '1px solid #fdba74', color: '#fff', padding: '18px', borderRadius: '14px', fontSize: '15px', fontWeight: 900, cursor: 'pointer', textAlign: 'center', boxShadow: '0 4px 15px rgba(249, 115, 22, 0.3)', width: '100%', boxSizing: 'border-box' }}>
            [F10] Finalizar Entrada no Estoque
          </button>
        </div>
      </div>

      {itemParaAdicionar && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #f97316', borderRadius: '20px', width: '100%', maxWidth: '400px', padding: '28px', color: '#fff', textAlign: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '4px' }}>{itemParaAdicionar.nome}</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>Quantidade Comprada:</p>
            <input ref={inputQtdRapidaRef} type="number" value={qtdDigitadaRapida} onChange={e => setQtdDigitadaRapida(e.target.value)} onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter') confirmarAdicaoRapida(); if(e.key==='Escape') setItemParaAdicionar(null);}} style={{ width: '80px', padding: '10px', fontSize: '20px', textAlign: 'center', backgroundColor: '#020617', border: '1px solid #f97316', color: '#fff', borderRadius: '8px', marginBottom: '20px', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setItemParaAdicionar(null)} style={{ flex: 1, padding: '12px', background: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 800 }}>Cancelar</button>
              <button onClick={confirmarAdicaoRapida} style={{ flex: 2, padding: '12px', background: '#ea580c', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>Adicionar à Nota</button>
            </div>
          </div>
        </div>
      )}

      {modalProdutoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #ea580c', borderRadius: '24px', width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', padding: '28px', color: '#fff', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#f97316', letterSpacing: '1px', textTransform: 'uppercase' }}>Ficha Cadastral Universal</span><h3 style={{ fontSize: '18px', fontWeight: 900, margin: '2px 0 0 0' }}>{produtoEmEdicao ? `Editar: ${produtoEmEdicao.nome}` : 'Cadastrar Novo Produto na Base'}</h3></div>
              <button onClick={() => setModalProdutoAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>SKU / Cód. Barras</label><input type="text" value={formProduto.sku} onChange={(e) => setFormProduto({ ...formProduto, sku: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 800, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Nome do Item</label><input type="text" value={formProduto.nome} onChange={(e) => setFormProduto({ ...formProduto, nome: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Grupo / Categoria (Livre)</label>
                  <input type="text" placeholder="Ex: Tintas, Pincéis..." value={formProduto.grupo || ''} onChange={(e) => setFormProduto({ ...formProduto, grupo: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Fornecedor / Marca</label>
                  <input type="text" placeholder="Ex: Suvinil, Tigre..." value={formProduto.fornecedor || ''} onChange={(e) => setFormProduto({ ...formProduto, fornecedor: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '10px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px 20px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', alignItems: 'center' }}>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Custo de Compra (R$)</label><input type="text" value={formProduto.custoBRL} onChange={(e) => setFormProduto({ ...formProduto, custoBRL: e.target.value })} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #ea580c', borderRadius: '8px', color: '#fdba74', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Preço Venda PDV (R$)</label><input type="text" value={formProduto.precoBRL} onChange={(e) => setFormProduto({ ...formProduto, precoBRL: e.target.value })} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #34d399', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Estoque Atual</label><input type="number" value={formProduto.estoque} onChange={(e) => setFormProduto({ ...formProduto, estoque: e.target.value })} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => setModalProdutoAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarProduto} style={{ flex: 2, background: 'linear-gradient(135deg, #ea580c, #c2410c)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>Salvar na Base e Adicionar</button>
            </div>
          </div>
        </div>
      )}
{/* MODAL CADASTRO FORNECEDOR (IGUAL À IMAGEM) */}
      {modalFornecedorAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #7e22ce', borderRadius: '24px', width: '100%', maxWidth: '600px', padding: '28px', color: '#fff', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '1px' }}>Ficha Cadastral</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 900 }}>Novo Fornecedor</h3>
              </div>
              <button onClick={() => setModalFornecedorAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Nome / Razão Social *</label>
                <input type="text" value={formFornecedor.nome || ''} onChange={e => setFormFornecedor({...formFornecedor, nome: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', color: '#fff', padding: '14px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>{moeda === 'PYG' ? 'RUC / C.I' : 'CNPJ / CPF'}</label>
                  <input type="text" value={formFornecedor.documento || ''} onChange={e => setFormFornecedor({...formFornecedor, documento: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', color: '#fff', padding: '14px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>País / Regra Fiscal</label>
                  <select value={formFornecedor.pais || (moeda === 'PYG' ? 'PY' : 'BR')} onChange={e => setFormFornecedor({...formFornecedor, pais: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', color: '#a855f7', padding: '14px', outline: 'none', marginTop: '6px', boxSizing: 'border-box', fontWeight: 900 }}>
                    <option value="BR">Brasil (CNPJ/CPF)</option>
                    <option value="PY">Paraguay (RUC)</option>
                    <option value="OUTROS">Exterior / Outros</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Telefone / WhatsApp</label>
                  <input type="text" value={formFornecedor.telefone || ''} onChange={e => setFormFornecedor({...formFornecedor, telefone: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', color: '#fff', padding: '14px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Cidade / Estado</label>
                  <input type="text" value={formFornecedor.cidade || ''} onChange={e => setFormFornecedor({...formFornecedor, cidade: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', color: '#fff', padding: '14px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalFornecedorAberto(false)} style={{ flex: 1, padding: '16px', backgroundColor: '#1e293b', border: 'none', color: '#f8fafc', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
              <button onClick={salvarFornecedor} style={{ flex: 2, background: 'linear-gradient(135deg, #9333ea, #7e22ce)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '14px' }}>Salvar Fornecedor</button>
            </div>
          </div>
        </div>
      )}
      {modalFechamentoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #ea580c', borderRadius: '24px', width: '100%', maxWidth: '750px', maxHeight: '95vh', overflowY: 'auto', padding: '28px', color: '#fff', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', boxSizing: 'border-box' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 900, color: '#f97316', letterSpacing: '1px', textTransform: 'uppercase' }}>Lançamento Financeiro</span>
                <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '4px 0 0 0' }}>Fornecedor: {fornecedorSelecionado ? fornecedorSelecionado.nome : (nomeFornecedorVulso || 'Avulso / Não Informado')}</h3>
              </div>
              <button onClick={() => setModalFechamentoAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>Total da Nota</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>{fmt(totalFinalBRL, 'BRL')}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>Pagamentos Agendados</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: '#34d399' }}>{fmt(totalPagoConvertidoBRL, 'BRL')}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>Restante a Lançar</span>
                <div style={{ fontSize: '18px', fontWeight: 900, color: saldoRestanteBRL > 0.01 ? '#f97316' : '#38bdf8' }}>{saldoRestanteBRL > 0.01 ? fmt(saldoRestanteBRL, 'BRL') : 'TUDO LANÇADO ✓'}</div>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
              <select 
                value={formaSelecionada} 
                onChange={e => {
                  const novaForma = e.target.value;
                  setFormaSelecionada(novaForma);
                  const pendenteBRL = Math.max(0, totalFinalBRL - totalPagoConvertidoBRL);
                  setValorLancamentoInput(pendenteBRL > 0 ? pendenteBRL.toFixed(2) : '');
                }} 
                style={{ padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', color: '#f8fafc', fontSize: '14px', fontWeight: 800, outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}
              >
                {catalogoFormasPagamento.map(f => (
                  <option key={f.id} value={f.id}>{f.icone} {f.rotulo}</option>
                ))}
              </select>
              
              <input 
                ref={inputValorLancamentoRef} type="text" value={valorLancamentoInput} 
                onChange={e => setValorLancamentoInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && adicionarPagamento()} 
                placeholder="0.00" onFocus={e => e.target.select()}
                style={{ padding: '14px', backgroundColor: '#020617', border: '1px solid #ea580c', borderRadius: '12px', color: '#f97316', fontSize: '18px', fontWeight: 900, textAlign: 'right', outline: 'none', boxSizing: 'border-box', width: '100%' }} 
              />
            </div>

            {configAtualForma.aPrazo && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px', backgroundColor: '#1e1104', border: '1px solid #78350f', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#fdba74', fontWeight: 800 }}>Nº de Parcelas</label>
                  <input type="number" value={qtdParcelas} min="1" max="60" onChange={e => setQtdParcelas(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #ea580c', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 900, padding: '10px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#fdba74', fontWeight: 800 }}>Intervalo (Dias)</label>
                  <input type="number" value={intervaloDias} onChange={e => setIntervaloDias(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #ea580c', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 900, padding: '10px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#fdba74', fontWeight: 800 }}>1º Vencimento</label>
                  <input type="date" value={dataPrimeiroVenc} onChange={e => setDataPrimeiroVenc(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #ea580c', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: 900, padding: '10px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>
            )}
            
            <button onClick={adicionarPagamento} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '15px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(234, 88, 12, 0.3)', boxSizing: 'border-box' }}>
              + Confirmar Parcela / Pagamento
            </button>
            
            <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '20px', background: '#020617', padding: '10px', borderRadius: '12px', border: '1px solid #1e293b' }}>
              {pagamentosLancados.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#475569', fontSize: '12px', padding: '15px 0' }}>Nenhuma forma de pagamento registrada ainda.</div>
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
              <button onClick={() => setModalFechamentoAberto(false)} style={{ flex: 1, padding: '14px', backgroundColor: '#020617', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: '12px', cursor: 'pointer', fontWeight: 800, fontSize: '13px' }}>Cancelar</button>
              <button onClick={() => concluirEntradaMercadoria()} disabled={!podeFinalizarCompra || processandoCompra} style={{ flex: 2, padding: '14px', background: (podeFinalizarCompra && !processandoCompra) ? 'linear-gradient(135deg, #10b981, #059669)' : '#1e293b', border: 'none', color: (podeFinalizarCompra && !processandoCompra) ? '#fff' : '#64748b', borderRadius: '12px', cursor: (podeFinalizarCompra && !processandoCompra) ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: '14px', boxShadow: podeFinalizarCompra ? '0 4px 15px rgba(16, 185, 129, 0.4)' : 'none' }}>
                Confirmar Entrada e Somar Estoque ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
