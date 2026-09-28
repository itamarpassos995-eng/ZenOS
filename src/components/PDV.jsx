import React, { useState, useEffect, useRef } from 'react';
import { normalizarProduto, normalizarCliente } from '../data';

export default function PDV({ produtos, setProdutos, clientes, setClientes, moeda, fmt, t, tx, converterDeBRL, converterParaBRL, historicoVendas, setHistoricoVendas, patenteUsuario, idioma, regrasDesconto }) {
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
  const [secaoFiscalExpandidaPDV, setSecaoFiscalExpandidaPDV] = useState(false);
  const [paisRegulamentoFiscalPDV, setPaisRegulamentoFiscalPDV] = useState('BR');
  const fileInputPDVRef = useRef(null);

  const [modalClientePDVAberto, setModalClientePDVAberto] = useState(false);
  const [formClientePDV, setFormClientePDV] = useState(normalizarCliente({}));

  const [itemParaAdicionar, setItemParaAdicionar] = useState(null);
  const [qtdDigitadaRapida, setQtdDigitadaRapida] = useState('1');
  const [modalFechamentoAberto, setModalFechamentoAberto] = useState(false);

  const [pagamentosLancados, setPagamentosLancados] = useState([]);
  const [formaSelecionada, setFormaSelecionada] = useState('dinheiro_brl');
  const [valorLancamentoInput, setValorLancamentoInput] = useState('');
  
  const [vendaSucesso, setVendaSucesso] = useState(false);
  const [vendaConcluidaObj, setVendaConcluidaObj] = useState(null);

  const inputBuscaRef = useRef(null);
  const inputQtdRapidaRef = useRef(null);
  const inputValorLancamentoRef = useRef(null);

  const termosProd = termoBusca.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const produtosFiltrados = produtos.filter(prod => {
    if (!prod) return false;
    const ehUsoUnico = prod.usoUnicoEncomendado || String(prod.sku || '').toUpperCase().includes('ENCOMENDA');
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

  useEffect(() => { setIndiceFocoBusca(0); }, [termoBusca]);
  useEffect(() => { if (itemParaAdicionar && inputQtdRapidaRef.current) { inputQtdRapidaRef.current.focus(); inputQtdRapidaRef.current.select(); } }, [itemParaAdicionar]);

  const aplicarPrecoPorPerfilCliente = (prod, cliente) => {
    if (!prod) return 0;
    if (cliente && cliente.perfilPreco === 'preco2' && prod.habilitarPreco2 && prod.preco2BRL > 0) return prod.preco2BRL;
    return prod.precoBRL || 0;
  };

  const selecionarClienteNoPDV = (cli) => {
    setClienteSelecionadoPDV(cli); setNomeClienteVulso(cli.nome); setFocoInputCliente(false);
    setItensVenda(itensVenda.map(item => {
      const prodOriginal = produtos.find(p => p.id === item.id) || item;
      const novoPrecoBRL = aplicarPrecoPorPerfilCliente(prodOriginal, cli);
      return { ...item, precoPraticadoBRL: novoPrecoBRL, precoTexto: converterDeBRL(novoPrecoBRL, moeda).toFixed(2) };
    }));
  };

  const removerClienteDoPDV = () => {
    setClienteSelecionadoPDV(null); setNomeClienteVulso('');
    setItensVenda(itensVenda.map(item => {
      const prodOriginal = produtos.find(p => p.id === item.id) || item;
      return { ...item, precoPraticadoBRL: prodOriginal.precoBRL || 0, precoTexto: converterDeBRL(prodOriginal.precoBRL || 0, moeda).toFixed(2) };
    }));
  };

  const abrirCadastroClientePDV = () => {
    setFormClientePDV(normalizarCliente({ nome: nomeClienteVulso, pais: moeda === 'PYG' ? 'PY' : 'BR', tipoDocumento: moeda === 'PYG' ? 'RUC' : 'CPF' }));
    setModalClientePDVAberto(true);
  };

  const salvarClientePDV = () => {
    if (!formClientePDV.nome.trim()) return alert(tx('Informe o nome do cliente.', 'Informe el nombre del cliente.', 'Enter customer name.'));
    const limiteNum = parseFloat(String(formClientePDV.limiteCreditoBRL).replace(',', '.')) || 0;
    const novoCli = normalizarCliente({ ...formClientePDV, limiteCreditoBRL: limiteNum });
    setClientes([novoCli, ...clientes]);
    selecionarClienteNoPDV(novoCli);
    setModalClientePDVAberto(false);
  };

  const abrirCadastroProdutoPDV = () => {
    setProdutoEmEdicaoPDV(null); setSecaoFiscalExpandidaPDV(false); setPaisRegulamentoFiscalPDV(moeda === 'PYG' ? 'PY' : 'BR');
    setFormProdutoPDV(normalizarProduto({ sku: `ENCOMENDA-${Date.now().toString().slice(-5)}`, usoUnicoEncomendado: true }));
    setModalProdutoPDVAberto(true);
  };

  const abrirEdicaoProdutoPDV = (prod) => {
    setProdutoEmEdicaoPDV(prod); setSecaoFiscalExpandidaPDV(false); setPaisRegulamentoFiscalPDV(moeda === 'PYG' ? 'PY' : 'BR');
    setFormProdutoPDV({
      ...normalizarProduto(prod), custoBRL: (prod.custoBRL || 0).toString(), precoBRL: (prod.precoBRL || 0).toString(),
      preco2BRL: (prod.preco2BRL || 0).toString(), preco3BRL: (prod.preco3BRL || 0).toString(), estoque: (prod.estoque || 0).toString(),
      usoUnicoEncomendado: prod.usoUnicoEncomendado || String(prod.sku).toUpperCase().includes('ENCOMENDA')
    });
    setModalProdutoPDVAberto(true);
  };

  const salvarProdutoPDV = () => {
    if (!formProdutoPDV.nome.trim()) return alert(tx('Informe o nome do produto.', 'Informe el nombre del producto.', 'Enter product name.'));
    const custo = parseFloat(String(formProdutoPDV.custoBRL).replace(',', '.')) || 0;
    const preco = parseFloat(String(formProdutoPDV.precoBRL).replace(',', '.')) || 0;
    const preco2 = formProdutoPDV.habilitarPreco2 ? (parseFloat(String(formProdutoPDV.preco2BRL).replace(',', '.')) || 0) : 0;
    const preco3 = formProdutoPDV.habilitarPreco3 ? (parseFloat(String(formProdutoPDV.preco3BRL).replace(',', '.')) || 0) : 0;
    const estoque = parseInt(formProdutoPDV.estoque) || 0;

    const dadosFinais = normalizarProduto({ ...formProdutoPDV, custoBRL: custo, precoBRL: preco, preco2BRL: preco2, preco3BRL: preco3, estoque: estoque });
    dadosFinais.usoUnicoEncomendado = formProdutoPDV.usoUnicoEncomendado; 
    
    if (!dadosFinais.id) dadosFinais.id = `PROD-BALCAO-${Date.now()}`;

    if (produtoEmEdicaoPDV) {
      setProdutos(produtos.map(p => p.id === produtoEmEdicaoPDV.id ? dadosFinais : p));
      setItensVenda(itensVenda.map(item => item.id === produtoEmEdicaoPDV.id ? { ...item, ...dadosFinais, precoPraticadoBRL: preco } : item));
    } else {
      setProdutos([dadosFinais, ...produtos]);
      setItemParaAdicionar(dadosFinais);
      setQtdDigitadaRapida('1');
    }
    setModalProdutoPDVAberto(false);
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
        qtd: String(qtdNum), 
        precoPraticadoBRL: precoBase, 
        precoTexto: converterDeBRL(precoBase, moeda).toFixed(2) 
      }]);
    }
    setItemParaAdicionar(null); setTermoBusca(''); 
    if (inputBuscaRef.current) inputBuscaRef.current.focus();
  };

  const removerItem = (id) => { setItensVenda(itensVenda.filter(item => item.id !== id)); };
  const atualizarQtd = (id, valor) => { setItensVenda(itensVenda.map(item => item.id === id ? { ...item, qtd: valor } : item)); };
  const lidarDigitacaoPreco = (id, valorDigitado) => { setItensVenda(itensVenda.map(item => item.id === id ? { ...item, precoTexto: valorDigitado, precoPraticadoBRL: converterParaBRL(parseFloat(valorDigitado.replace(',', '.')) || 0, moeda) } : item)); };

  // CÁLCULOS MATEMÁTICOS PARA MARGEM REAL
  const subtotalBrutoBRL = itensVenda.reduce((acc, item) => acc + (Math.max(0, parseInt(item.qtd) || 0) * (item.precoPraticadoBRL || 0)), 0);
  const custoTotalBRL = itensVenda.reduce((acc, item) => acc + (Math.max(0, parseInt(item.qtd) || 0) * (item.custoBRL || 0)), 0);
  const descBRL = converterParaBRL(parseFloat(String(descontoTexto).replace(',', '.')) || 0, moeda);
  
  const totalFinalBRL = Math.max(0, subtotalBrutoBRL - descBRL);
  const lucroEstimadoBRL = totalFinalBRL - custoTotalBRL;
  
  // A MÁGICA ESTÁ AQUI: Avalia o Lucro Real versus o Faturamento Real
  const margemLucroReal = totalFinalBRL > 0 ? (lucroEstimadoBRL / totalFinalBRL) * 100 : 0;

  // 🛡️ LÓGICA DO SEMÁFORO BASEADO NA MARGEM REAL
  const regras = regrasDesconto || {};
  const margemIdeal = regras.margemIdeal ?? 30; // Padrão: Acima de 30% é Verde
  const margemMinima = regras.margemMinima ?? 15; // Padrão: Abaixo de 15% é Vermelho

  let corSemafaro = '#34d399'; let bgSemafaro = 'rgba(16, 185, 129, 0.1)'; let borderSemafaro = 'rgba(16, 185, 129, 0.3)';
  let textoSemafaro = tx(`🟢 Margem Saudável (> ${margemIdeal}%)`, `🟢 Margen Saludable`, `🟢 Healthy Margin`); 
  let vendaBloqueadaPorMargem = false;

  if (itensVenda.length > 0 && totalFinalBRL > 0) {
    if (margemLucroReal < margemMinima) { 
      corSemafaro = '#fb7185'; bgSemafaro = 'rgba(244, 63, 94, 0.15)'; borderSemafaro = 'rgba(244, 63, 94, 0.4)'; 
      textoSemafaro = tx(`🔴 Margem Crítica / Prejuízo (< ${margemMinima}%)`, `🔴 Margen Crítico`, `🔴 Critical Margin`); 
      if (patenteUsuario !== 'gerencia') vendaBloqueadaPorMargem = true; 
    } 
    else if (margemLucroReal < margemIdeal) { 
      corSemafaro = '#fbbf24'; bgSemafaro = 'rgba(245, 158, 11, 0.15)'; borderSemafaro = 'rgba(245, 158, 11, 0.4)'; 
      textoSemafaro = tx(`🟡 Margem Baixa/Em Alerta (< ${margemIdeal}%)`, `🟡 Alerta de Margen`, `🟡 Margin Alert`); 
    }
  } else if (itensVenda.length === 0) {
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
  const trocoTotalBRL = totalPagoConvertidoBRL > totalFinalBRL ? (totalPagoConvertidoBRL - totalFinalBRL) : 0;
  const podeFinalizarVenda = totalFinalBRL > 0 && totalPagoConvertidoBRL >= (totalFinalBRL - 0.01);

  const abrirFechamento = () => {
    // 🛡️ APLICAÇÃO DA SENHA DE GERÊNCIA NO BLOQUEIO DE MARGEM
    if (vendaBloqueadaPorMargem) {
      if (regras?.exigirSenhaVermelho ?? true) {
        const senhaDigitada = window.prompt(tx(
          `🔴 A margem de lucro caiu para ${margemLucroReal.toFixed(1)}% (Mínimo exigido: ${margemMinima}%).\nInsira a Senha da Gerência para liberar a venda:`, 
          `🔴 ¡Margen por debajo del límite!\nIngrese la Contraseña de Gerencia:`, 
          `🔴 Margin below limit!\nEnter Manager Password:`
        ));
        if (senhaDigitada !== (regras?.senhaGerente ?? '1234')) {
          return alert(tx('⛔ Senha incorreta! Venda bloqueada.', '⛔ ¡Contraseña incorrecta!', '⛔ Wrong password!'));
        }
      } else {
        return alert(tx(`⛔ Venda bloqueada!\nA margem de lucro (${margemLucroReal.toFixed(1)}%) está abaixo do mínimo exigido.`, '⛔ ¡Venta bloqueada!', '⛔ Sale blocked!'));
      }
    }
    
    if (itensVenda.length === 0 || totalFinalBRL <= 0) return alert(tx('Adicione produtos à venda.', 'Añada productos.', 'Add products.'));
    setPagamentosLancados([]); setFormaSelecionada('dinheiro_brl');
    setValorLancamentoInput(converterDeBRL(totalFinalBRL, 'BRL').toFixed(2));
    setVendaSucesso(false); setModalFechamentoAberto(true);
  };

  const adicionarPagamento = () => {
    const valorNum = parseFloat(String(valorLancamentoInput).replace(',', '.')) || 0;
    if (valorNum <= 0) return;
    const configForma = catalogoFormas.find(f => f.id === formaSelecionada) || catalogoFormas[0];
    const valorBRL = converterParaBRL(valorNum, configForma.moedaOrigem);

    if (configForma.id === 'crediario') {
      if (!clienteSelecionadoPDV) return alert(tx('Para Fiado, vincule o cliente!', 'Para fiado, vincule el cliente.', 'For Credit, link customer.'));
      const novoDevedor = (parseFloat(clienteSelecionadoPDV.saldoDevedorBRL) || 0) + valorBRL;
      if (novoDevedor > (parseFloat(clienteSelecionadoPDV.limiteCreditoBRL) || 0)) {
        if (!window.confirm(tx(`O limite de ${fmt(clienteSelecionadoPDV.limiteCreditoBRL, 'BRL')} foi ultrapassado!\nAutorizar?`, `¡Límite superado!\n¿Autorizar?`, `Limit exceeded!\nAuthorize?`))) return;
      }
    }

    const novaLista = [...pagamentosLancados, { id: Date.now(), ...configForma, valorOriginal: valorNum, valorConvertidoBRL: valorBRL }];
    setPagamentosLancados(novaLista);
    const novoSaldo = Math.max(0, totalFinalBRL - novaLista.reduce((acc, p) => acc + p.valorConvertidoBRL, 0));
    setValorLancamentoInput(novoSaldo > 0 ? converterDeBRL(novoSaldo, configForma.moedaOrigem).toFixed(2) : '');
  };

  const concluirVenda = () => {
    if (!podeFinalizarVenda) return;
    
    const idsParaRemover = itensVenda
      .filter(it => it.usoUnicoEncomendado || String(it.sku).toUpperCase().includes('ENCOMENDA'))
      .map(it => String(it.id));
    
    const novosProdutos = produtos.map(p => {
      const itemVendido = itensVenda.find(i => String(i.id) === String(p.id));
      if (itemVendido && p.tipoItem !== 'servico' && !idsParaRemover.includes(String(p.id))) {
        return { ...p, estoque: Math.max(0, (parseInt(p.estoque) || 0) - (parseInt(itemVendido.qtd) || 0)) };
      }
      return p;
    }).filter(p => !idsParaRemover.includes(String(p.id))); 

    setProdutos(novosProdutos);
    localStorage.setItem('zenos_produtos', JSON.stringify(novosProdutos));

    const valorFiado = pagamentosLancados.filter(p => p.formaId === 'crediario').reduce((acc, p) => acc + p.valorConvertidoBRL, 0);
    if (valorFiado > 0 && clienteSelecionadoPDV) {
      const novosClientes = clientes.map(c => c.id === clienteSelecionadoPDV.id ? { ...c, saldoDevedorBRL: (parseFloat(c.saldoDevedorBRL) || 0) + valorFiado } : c);
      setClientes(novosClientes);
      localStorage.setItem('zenos_clientes', JSON.stringify(novosClientes));
    }

    const novaVenda = {
      id: `VENDA-${1000 + historicoVendas.length + 1}`,
      dataHora: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR'),
      clienteId: clienteSelecionadoPDV ? clienteSelecionadoPDV.id : null,
      clienteNome: clienteSelecionadoPDV ? clienteSelecionadoPDV.nome : tx('Consumidor Balcão', 'Consumidor', 'Walk-in'),
      itens: [...itensVenda], totalBRL: totalFinalBRL, lucroBRL: lucroEstimadoBRL,
      pagamentos: [...pagamentosLancados],
      detalhesPagamento: pagamentosLancados.map(p => `${p.rotulo}: ${p.valorOriginal.toFixed(2)}`).join(' • ') || tx('Dinheiro', 'Efectivo', 'Cash'),
      estado: 'concluida'
    };

    const novoHistorico = [novaVenda, ...historicoVendas];
    setHistoricoVendas(novoHistorico);
    localStorage.setItem('zenos_historico_vendas', JSON.stringify(novoHistorico));
    
    setVendaConcluidaObj(novaVenda);
    setVendaSucesso(true);
  };

  const executarImpressaoNativa = () => {
    const elementoCupom = document.getElementById('area-cupom-pdv');
    if (!elementoCupom) return;
    const janelaImpressao = window.open('', '_blank', 'width=400,height=600');
    if (!janelaImpressao) return alert('Bloqueador de pop-ups ativo. Permita pop-ups.');
    janelaImpressao.document.write(`
      <!DOCTYPE html><html><head><title>Cupom PDV</title><style>@page{margin:0;size:80mm auto;}body{font-family:monospace;font-size:12px;color:#000;background:#fff;margin:0;padding:10px;width:80mm;}table{width:100%;border-collapse:collapse;font-size:11px;}th,td{padding:3px 0;}</style></head>
      <body>${elementoCupom.innerHTML}<script>window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},500);};</script></body></html>
    `);
    janelaImpressao.document.close();
  };

  const limparParaNovaVenda = () => {
    setItensVenda([]); setDescontoTexto('0'); setPagamentosLancados([]);
    setClienteSelecionadoPDV(null); setNomeClienteVulso('');
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
      
      {/* COLUNA ESQUERDA: CLIENTE, BUSCA E LISTA DE ITENS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
        
        {/* SELETOR DE CLIENTE */}
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
                {clientesSugeridos.map(c => (
                  <div key={c.id} onClick={() => selecionarClienteNoPDV(c)} style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><strong style={{ color: '#f8fafc', fontSize: '14px' }}>{c.nome}</strong><br/><span style={{ color: '#64748b', fontSize: '11px' }}>Doc: {c.documento}</span></div><span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 800 }}>Vincular ➜</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={abrirCadastroClientePDV} style={{ padding: '16px 20px', backgroundColor: '#451a03', border: '1px solid #d97706', color: '#fbbf24', borderRadius: '14px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 15px rgba(217, 119, 6, 0.2)' }}>{tx('+ Cliente', '+ Cliente', '+ Client')}</button>
        </div>

        {/* CAMPO DE BUSCA DE PRODUTOS */}
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
                      <div><div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '15px' }}>{prod.nome} {(prod.usoUnicoEncomendado || String(prod.sku).includes('ENCOMENDA')) && <span style={{ color: '#fbbf24', fontSize: '11px' }}>({tx('Encomenda', 'Especial', 'Order')})</span>}</div><div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>SKU: {prod.sku} • Estoque: <strong style={{ color: '#38bdf8' }}>{prod.estoque} {prod.unidadeMedida}</strong></div></div>
                      <div style={{ color: '#34d399', fontWeight: 900, fontSize: '16px' }}>{fmt(aplicarPrecoPorPerfilCliente(prod, clienteSelecionadoPDV))}</div>
                    </div>
                  );
                }) : <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>{tx('Nenhum produto localizado', 'Ningún producto', 'No products found')}</div>}
              </div>
            )}
          </div>
        </div>

        {/* LISTA DE ITENS LANÇADOS (CARRINHO) */}
        <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '1px', textTransform: 'uppercase' }}>{t('itensLancados')} ({itensVenda.length})</span>
          </div>
          <div style={{ padding: '8px', flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
            {itensVenda.length === 0 ? <div style={{ padding: '60px 20px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>{t('nenhumItem')}</div> : itensVenda.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid #1e293b', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '14px' }}>{item.nome} {(item.usoUnicoEncomendado || String(item.sku).includes('ENCOMENDA')) && <span style={{ color: '#fbbf24', fontSize: '10px' }}>(⭐ {tx('Encomenda', 'Especial', 'Order')})</span>}</div>
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

      {/* COLUNA DIREITA: RESUMO, SEMÁFORO E FINALIZAÇÃO DE VENDA */}
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

        <button onClick={abrirFechamento} style={{ background: vendaBloqueadaPorMargem ? '#334155' : 'linear-gradient(135deg, #4f46e5, #4338ca)', border: '1px solid #6366f1', color: '#fff', padding: '18px', borderRadius: '14px', fontSize: '15px', fontWeight: 900, cursor: vendaBloqueadaPorMargem ? 'pointer' : 'pointer', textAlign: 'center', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.3)', width: '100%', boxSizing: 'border-box' }}>
          [F10] {t('fecharVenda')} {vendaBloqueadaPorMargem ? '🔒' : ''}
        </button>
      </div>

      {/* MODAL DE QUANTIDADE RÁPIDA */}
      {itemParaAdicionar && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85), backdrop-filter: blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #6366f1', borderRadius: '20px', width: '100%', maxWidth: '400px', padding: '28px', color: '#fff', textAlign: 'center' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, marginBottom: '16px' }}>{itemParaAdicionar.nome}</h3>
            <input ref={inputQtdRapidaRef} type="number" value={qtdDigitadaRapida} onChange={e => setQtdDigitadaRapida(e.target.value)} onFocus={e=>e.target.select()} onKeyDown={e=>{if(e.key==='Enter') confirmarAdicaoRapida(); if(e.key==='Escape') setItemParaAdicionar(null);}} style={{ width: '80px', padding: '10px', fontSize: '20px', textAlign: 'center', backgroundColor: '#020617', border: '1px solid #6366f1', color: '#fff', borderRadius: '8px', marginBottom: '20px', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setItemParaAdicionar(null)} style={{ flex: 1, padding: '12px', background: '#1e293b', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 800 }}>{tx('Cancelar', 'Cancelar', 'Cancel')}</button>
              <button onClick={confirmarAdicaoRapida} style={{ flex: 2, padding: '12px', background: '#4f46e5', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>{tx('Adicionar', 'Añadir', 'Add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO DE CLIENTE */}
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

      {/* MODAL DE CADASTRO DE PRODUTO */}
      {modalProdutoPDVAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #0284c7', borderRadius: '24px', width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', padding: '28px', color: '#fff', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '1px', textTransform: 'uppercase' }}>Ficha Cadastral Universal • PDV Balcão</span><h3 style={{ fontSize: '18px', fontWeight: 900, margin: '2px 0 0 0' }}>{produtoEmEdicaoPDV ? `Editar: ${produtoEmEdicaoPDV.nome}` : tx('Cadastrar Novo Produto', 'Registrar Nuevo Producto', 'New Product')}</h3></div>
              <button onClick={() => setModalProdutoPDVAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', border: '1px solid rgba(217, 119, 6, 0.4)', borderRadius: '14px', padding: '14px 20px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input type="checkbox" id="checkUsoUnico" checked={formProdutoPDV.usoUnicoEncomendado} onChange={e => setFormProdutoPDV({...formProdutoPDV, usoUnicoEncomendado: e.target.checked})} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <div><label htmlFor="checkUsoUnico" style={{ fontSize: '13px', fontWeight: 900, color: '#fbbf24', cursor: 'pointer' }}>{tx('⭐ Produto de Uso Único / Encomenda Especial', '⭐ Producto de Uso Único / Especial', '⭐ Single-Use / Special Order')}</label><p style={{ fontSize: '11px', color: '#cbd5e1', margin: '2px 0 0 0' }}>{tx('Se marcado, o sistema EXCLUIRÁ esse produto fisicamente da base de dados ao fechar a venda.', 'Si está marcado, el sistema ELIMINARÁ este producto al cerrar.', 'If checked, the system will DELETE this item upon sale completion.')}</p></div>
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
            </div>
            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px 20px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Custo (R$)</label><input type="text" value={formProdutoPDV.custoBRL} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, custoBRL: e.target.value })} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Preço Venda (R$)</label><input type="text" value={formProdutoPDV.precoBRL} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, precoBRL: e.target.value })} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #34d399', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Estoque Inicial</label><input type="number" value={formProdutoPDV.estoque} onChange={(e) => setFormProdutoPDV({ ...formProdutoPDV, estoque: e.target.value })} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '10px', outline: 'none', boxSizing: 'border-box' }} /></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => setModalProdutoPDVAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>{tx('Cancelar', 'Cancelar', 'Cancel')}</button>
              <button onClick={salvarProdutoPDV} style={{ flex: 2, background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>{tx('Salvar e Lançar na Venda', 'Guardar e Incluir', 'Save and Add')}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO DE CAIXA (CHECKOUT) */}
      {modalFechamentoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px', boxSizing: 'border-box' }}>
          <div style={{ backgroundColor: vendaSucesso ? '#ffffff' : '#0b1120', border: '1px solid #10b981', borderRadius: vendaSucesso ? '16px' : '24px', width: '100%', maxWidth: vendaSucesso ? '380px' : '750px', maxHeight: '95vh', overflowY: 'auto', padding: vendaSucesso ? '0' : '28px', color: vendaSucesso ? '#000' : '#fff', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', boxSizing: 'border-box' }}>
            {vendaSucesso ? (
              <div>
                <div id="area-cupom-pdv" style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '16px' }}>ZÊNITE ATACADÃO DE TINTAS</h2>
                    <div style={{ fontSize: '10px' }}>Cupom Não Fiscal - Uso Interno<br/>{vendaConcluidaObj?.dataHora}</div>
                  </div>
                  <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                  <div style={{ marginBottom: '8px', fontSize: '11px' }}><strong>Cliente:</strong> {vendaConcluidaObj?.clienteNome}</div>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px' }}><span>TOTAL DA VENDA</span><span>{fmt(vendaConcluidaObj?.totalBRL)}</span></div>
                  <div style={{ marginTop: '10px', fontSize: '11px' }}>
                    <strong>Pagamentos:</strong><br/>
                    {vendaConcluidaObj?.pagamentos.map((p, idx) => <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{p.rotulo}</span><span>{p.valorOriginal.toFixed(2)}</span></div>)}
                  </div>
                  {trocoTotalBRL > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '4px' }}><span>TROCO</span><span>{fmt(trocoTotalBRL)}</span></div>}
                  <div style={{ borderBottom: '1px dashed #000', margin: '10px 0' }}></div>
                  <div style={{ textAlign: 'center', fontSize: '10px' }}>Obrigado pela preferência!<br/>Volte Sempre.</div>
                </div>
                <div className="no-print" style={{ padding: '20px', backgroundColor: '#f1f5f9', display: 'flex', gap: '10px', borderTop: '1px dashed #ccc', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px', flexWrap: 'wrap' }}>
                  <button onClick={executarImpressaoNativa} style={{ flex: 1, padding: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>🖨️ {tx('Imprimir', 'Imprimir', 'Print')}</button>
                  <button onClick={limparParaNovaVenda} style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', fontSize: '14px' }}>{tx('Nova Venda', 'Nueva Venta', 'New Sale')}</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#34d399', letterSpacing: '1px', textTransform: 'uppercase' }}>{tx('Fechamento de Caixa • Múltiplas Formas', 'Cierre de Caja', 'Checkout')}</span>
                    <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '4px 0 0 0' }}>{clienteSelecionadoPDV ? clienteSelecionadoPDV.nome : (nomeClienteVulso || tx('Consumidor Balcão', 'Consumidor', 'Walk-in'))}</h3>
                  </div>
                  <button onClick={() => setModalFechamentoAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '10px', width: '36px', height: '36px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>{tx('Total', 'Total', 'Total')}</span><div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>{fmt(totalFinalBRL, 'BRL')}</div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>{tx('Pago', 'Pagado', 'Paid')}</span><div style={{ fontSize: '18px', fontWeight: 900, color: '#34d399' }}>{fmt(totalPagoConvertidoBRL, 'BRL')}</div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>{tx('Falta', 'Falta', 'Due')}</span><div style={{ fontSize: '18px', fontWeight: 900, color: saldoRestanteBRL > 0.01 ? '#fb7185' : '#38bdf8' }}>{saldoRestanteBRL > 0.01 ? fmt(saldoRestanteBRL, 'BRL') : 'QUITADO ✓'}</div></div>
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
                  <button onClick={concluirVenda} disabled={!podeFinalizarVenda} style={{ flex: 2, padding: '14px', background: podeFinalizarVenda ? 'linear-gradient(135deg, #0284c7, #0369a1)' : '#1e293b', border: 'none', color: podeFinalizarVenda ? '#fff' : '#64748b', borderRadius: '12px', cursor: podeFinalizarVenda ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: '14px', boxShadow: podeFinalizarVenda ? '0 4px 15px rgba(2, 132, 199, 0.4)' : 'none' }}>{tx('Confirmar e Finalizar', 'Finalizar', 'Complete Sale')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
