import { ehEncomendaUsoUnico } from '../core/orderItems';
import React, { useState, useRef } from 'react';
import { normalizarProduto } from '../data';
import { db } from '../firebase';
import { transferirEstoqueEntreLocais } from '../core/inventory';
import { atualizarProdutoUnico, detectarConflitosIdentidadeProdutos, skuJaExiste } from '../core/productIdentity';
import { reservarIdentidadeProduto, liberarIdentidadeProduto } from '../core/productRegistry';
import { carregarHistoricoEstoqueProduto, criarEventoEstoque, obterPoliticaHistoricoEstoque, registrarEventosEstoque } from '../core/stockAudit';
import ZenModal from './ZenModal';
import { calcularPrecoPorCustoEMargem, calcularMargemPorCustoEPreco, validarMargemPrecoVenda, MAX_MARGEM_PRECO_PCT } from '../core/pricing';
import { validarCredencialGerencial } from '../core/accessControl';

export default function Produtos({ produtos, setProdutos, moeda, fmt, t, tx, fornecedoresGlobais = [], userId, operadorAtivo, planoLoja = 'basico', historicoVendas = [], historicoCompras = [], patenteUsuario, regrasDesconto, vendedores = [] }) {
  const [gruposCadastrados, setGruposCadastrados] = useState(['Tintas Acrílicas', 'Colorimetria & Pigmentos', 'Massas e Complementos', 'Serviços Especializados', 'Acessórios & Ferramentas']);
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [buscaProdutoTexto, setBuscaProdutoTexto] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(null);
  const [senhaExclusao, setSenhaExclusao] = useState('');
  
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [produtoEmEdicao, setProdutoEmEdicao] = useState(null);
  const [secaoFiscalExpandida, setSecaoFiscalExpandida] = useState(false);
  const [paisRegulamentoFiscal, setPaisRegulamentoFiscal] = useState('BR');
  const [novoGrupoTexto, setNovoGrupoTexto] = useState('');
  const [criandoNovoGrupo, setCriandoNovoGrupo] = useState(false);
  const [modalMovimento, setModalMovimento] = useState(null);
  const [movimentoQtd, setMovimentoQtd] = useState('1');
  const [movimentoMotivo, setMovimentoMotivo] = useState('Reposição da vitrine');
  const [movimentoObs, setMovimentoObs] = useState('');
  const [salvandoMovimento, setSalvandoMovimento] = useState(false);
  const [historicoExpandido, setHistoricoExpandido] = useState(false);
  const [historicoMovimentos, setHistoricoMovimentos] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [filtroHistoricoInicio, setFiltroHistoricoInicio] = useState('');
  const [filtroHistoricoFim, setFiltroHistoricoFim] = useState('');
  const [modalZen, setModalZen] = useState(null);
  const mostrarZen = (variante, titulo, mensagem, detalhes = []) => setModalZen({ variante, titulo, mensagem, detalhes, apenasConfirmar: true });

  // --- MELHORIA: Autocomplete Inteligente (PRODUTOS + BANCO GLOBAL) ---
  const todosOsFornecedores = [
    ...produtos.map((p) => p.fornecedor),
    ...fornecedoresGlobais.map(f => typeof f === 'object' ? (f.nome || f.razao_social || f.nomeFantasia || f.nomeFornecedor) : f)
  ];
  
  const fornecedoresCadastrados = Array.from(
    new Set(todosOsFornecedores.filter((f) => typeof f === 'string' && f.trim() !== ''))
  ).sort();
  
  const [mostrarFornecedores, setMostrarFornecedores] = useState(false);
  // ---------------------------------------------------------------

  const [formProduto, setFormProduto] = useState(normalizarProduto({}));
  const conflitosIdentidade = detectarConflitosIdentidadeProdutos(produtos || []);
  const idsComConflito = new Set(conflitosIdentidade.map((c) => String(c.id)));
  const fileInputRef = useRef(null);

  const produtosListaFiltrada = (produtos || []).filter(p => {
    if (!p || (!mostrarInativos && p.ativo === false)) return false;
    
    const nomeLower = (p.nome || '').toLowerCase();
    const skuLower = (p.sku || '').toLowerCase();
    const grupoItem = p.grupo || 'Geral';
    const bateGrupo = filtroGrupo === 'todos' || grupoItem === filtroGrupo;
    const texto = buscaProdutoTexto.toLowerCase().trim();
    const bateTexto = texto === '' || nomeLower.includes(texto) || skuLower.includes(texto);
    return bateGrupo && bateTexto;
  });

  const atualizarPrecoPorCustoEMargem = (custoStr, margemStr) => calcularPrecoPorCustoEMargem(custoStr, margemStr).valor;

  const atualizarMargemPorPreco = (custoStr, precoStr) => calcularMargemPorCustoEPreco(custoStr, precoStr);

  const abrirCadastroNovoProduto = () => {
    setProdutoEmEdicao(null);
    setSecaoFiscalExpandida(false);
    setCriandoNovoGrupo(false);
    setNovoGrupoTexto('');
    setPaisRegulamentoFiscal(moeda === 'PYG' ? 'PY' : 'BR');
    setHistoricoExpandido(false);
    setHistoricoMovimentos([]);
    setFormProduto(normalizarProduto({ 
      sku: `SKU-${Date.now().toString().slice(-5)}`, 
      grupo: gruposCadastrados[0],
      estoqueVitrine: '0',
      estoqueGalpao: '0',
      localizacao: '',
      margemDesejada: '40'
    }));
    setModalProdutoAberto(true);
  };

  const abrirEdicaoProduto = (prod) => {
    setProdutoEmEdicao(prod);
    setSecaoFiscalExpandida(false);
    setCriandoNovoGrupo(false);
    setPaisRegulamentoFiscal(moeda === 'PYG' ? 'PY' : 'BR');
    setHistoricoExpandido(false);
    setHistoricoMovimentos([]);
    setFiltroHistoricoInicio('');
    setFiltroHistoricoFim('');
    const custo = prod.custoBRL || 0;
    const preco = prod.precoBRL || 0;
    const margem = preco > 0 ? (((preco - custo) / preco) * 100).toFixed(1) : '40';
    setFormProduto({
      ...normalizarProduto(prod),
      custoBRL: custo.toFixed(2),
      margemDesejada: margem,
      precoBRL: preco.toFixed(2),
      preco2BRL: prod.preco2BRL ? prod.preco2BRL.toFixed(2) : '',
      preco3BRL: prod.preco3BRL ? prod.preco3BRL.toFixed(2) : '',
      estoqueVitrine: (prod.estoqueVitrine ?? prod.estoque ?? 0).toString(),
      estoqueGalpao: (prod.estoqueGalpao ?? 0).toString(),
      localizacao: prod.localizacao || ''
    });
    setModalProdutoAberto(true);
  };

  const lidarUploadImagem = (e) => {
    const arquivo = e.target.files?.[0];
    if (arquivo) {
      const reader = new FileReader();
      reader.onloadend = () => setFormProduto(prev => ({ ...prev, imagem: reader.result }));
      reader.readAsDataURL(arquivo);
    }
  };

  const salvarProduto = async () => {
    if (!formProduto.nome.trim()) return mostrarZen('warning', 'Nome obrigatório', 'Informe o nome do produto antes de salvar.');
    const margemValidacao = validarMargemPrecoVenda(formProduto.margemDesejada);
    if (!margemValidacao.ok && Number(formProduto.custoBRL || 0) > 0) return mostrarZen('warning', 'Margem inválida', margemValidacao.erro, [`Use um valor entre 0% e ${MAX_MARGEM_PRECO_PCT}%.`, 'A margem é calculada sobre o preço de venda.']);
    let grupoFinal = formProduto.grupo;
    if (criandoNovoGrupo && novoGrupoTexto.trim()) {
      grupoFinal = novoGrupoTexto.trim();
      if (!gruposCadastrados.includes(grupoFinal)) setGruposCadastrados([...gruposCadastrados, grupoFinal]);
    }
    const custo = Math.max(0, parseFloat(String(formProduto.custoBRL).replace(',', '.')) || 0);
    const preco = Math.max(0, parseFloat(String(formProduto.precoBRL).replace(',', '.')) || (custo > 0 ? custo * 1.5 : 10));
    const preco2 = formProduto.habilitarPreco2 ? (parseFloat(String(formProduto.preco2BRL).replace(',', '.')) || 0) : 0;
    const preco3 = formProduto.habilitarPreco3 ? (parseFloat(String(formProduto.preco3BRL).replace(',', '.')) || 0) : 0;
    
    const vitrine = Math.max(0, parseInt(formProduto.estoqueVitrine) || 0);
    const galpao = Math.max(0, parseInt(formProduto.estoqueGalpao) || 0);
    const estoqueTotal = vitrine + galpao;

    if (skuJaExiste(produtos, formProduto.sku, produtoEmEdicao)) {
      return mostrarZen('danger', 'SKU duplicado', `Já existe outro produto com o SKU ${formProduto.sku}.`, ['Use um SKU diferente para impedir movimentação no item errado.']);
    }

    const dadosFinais = normalizarProduto({ 
      ...formProduto, 
      grupo: grupoFinal, 
      custoBRL: custo, 
      precoBRL: preco, 
      preco2BRL: preco2, 
      preco3BRL: preco3, 
      estoque: estoqueTotal, 
      estoqueVitrine: vitrine, 
      estoqueGalpao: galpao,
      localizacao: formProduto.localizacao || ''
    });

    let listaAtualizadaEdicao = null;
    if (produtoEmEdicao) {
      try {
        listaAtualizadaEdicao = atualizarProdutoUnico(produtos, produtoEmEdicao, dadosFinais, 'edição do produto');
      } catch (erro) {
        return mostrarZen('danger', 'Edição bloqueada', erro.message || 'Não foi possível editar o produto com segurança.');
      }
    }

    try { await reservarIdentidadeProduto({ db, userId, produto: dadosFinais, produtoAnterior: produtoEmEdicao }); } catch (erro) { return mostrarZen('danger', erro?.code === 'ZENOS_PRODUTO_DUPLICADO' ? 'Produto duplicado' : 'Cadastro não concluído', erro.message || 'Não foi possível reservar a identidade do produto.'); }

    if (produtoEmEdicao) {
      setProdutos(listaAtualizadaEdicao);
    } else {
      if (dadosFinais.tipoItem !== 'servico' && estoqueTotal > 0) {
        try {
          const eventoInicial = criarEventoEstoque({
            produto: dadosFinais,
            tipo: 'cadastro_inicial',
            origem: 'cadastro',
            destino: vitrine > 0 && galpao > 0 ? 'vitrine+deposito' : vitrine > 0 ? 'vitrine' : 'deposito',
            quantidade: estoqueTotal,
            saldoAntes: { estoque: 0, estoqueVitrine: 0, estoqueGalpao: 0 },
            saldoDepois: dadosFinais,
            motivo: 'Saldo inicial do cadastro',
            operador: operadorAtivo,
          });
          await registrarEventosEstoque({ db, userId, eventos: [eventoInicial] });
        } catch (erro) {
          console.error('[ZenOS][ATT06] Falha ao registrar saldo inicial:', erro);
          await liberarIdentidadeProduto({ db, userId, produto: dadosFinais });
          return mostrarZen('danger', 'Produto não salvo', 'Não foi possível registrar o histórico inicial do estoque. Nenhum cadastro foi concluído.');
        }
      }
      setProdutos([dadosFinais, ...produtos]);
    }
    setModalProdutoAberto(false);
  };

  const abrirMovimentoRapido = (produto, localDestino, delta) => {
    const destino = localDestino === 'deposito' ? 'deposito' : 'vitrine';
    const origem = destino === 'vitrine' ? 'deposito' : 'vitrine';
    // Botão "-" inverte a direção: diminuir um local significa transferir para o outro.
    const origemEfetiva = delta > 0 ? origem : destino;
    const destinoEfetivo = delta > 0 ? destino : origem;
    setModalMovimento({ produto, origem: origemEfetiva, destino: destinoEfetivo });
    setMovimentoQtd('1');
    setMovimentoMotivo(destinoEfetivo === 'vitrine' ? 'Reposição da vitrine' : 'Retorno ao depósito');
    setMovimentoObs('');
  };

  const confirmarMovimentoEstoque = async () => {
    if (!modalMovimento?.produto) return;
    const quantidade = Math.max(0, Number(String(movimentoQtd).replace(',', '.')) || 0);
    if (quantidade <= 0) return mostrarZen('warning', 'Quantidade inválida', 'Informe uma quantidade maior que zero.');
    if (!movimentoMotivo.trim()) return mostrarZen('warning', 'Motivo obrigatório', 'Informe o motivo da movimentação.');

    setSalvandoMovimento(true);
    try {
      const resultado = transferirEstoqueEntreLocais(modalMovimento.produto, modalMovimento.origem, modalMovimento.destino, quantidade);
      const evento = criarEventoEstoque({
        produto: modalMovimento.produto,
        tipo: 'transferencia_interna',
        origem: modalMovimento.origem,
        destino: modalMovimento.destino,
        quantidade,
        saldoAntes: resultado.movimento.antes,
        saldoDepois: resultado.movimento.depois,
        motivo: movimentoMotivo,
        observacao: movimentoObs,
        operador: operadorAtivo,
      });
      await registrarEventosEstoque({ db, userId, eventos: [evento] });
      setProdutos(atualizarProdutoUnico(produtos, modalMovimento.produto, resultado.produto, 'movimentação de estoque'));
      if (produtoEmEdicao && String(produtoEmEdicao.id) === String(modalMovimento.produto.id) && String(produtoEmEdicao.sku || '').toUpperCase() === String(modalMovimento.produto.sku || '').toUpperCase()) {
        setProdutoEmEdicao(resultado.produto);
        setFormProduto((prev) => ({
          ...prev,
          estoqueVitrine: String(resultado.produto.estoqueVitrine ?? 0),
          estoqueGalpao: String(resultado.produto.estoqueGalpao ?? 0),
          estoque: resultado.produto.estoque,
        }));
      }
      setModalMovimento(null);
      if (historicoExpandido && produtoEmEdicao && String(produtoEmEdicao.id) === String(modalMovimento.produto.id) && String(produtoEmEdicao.sku || '').toUpperCase() === String(modalMovimento.produto.sku || '').toUpperCase()) {
        await carregarHistoricoProduto(resultado.produto.id);
      }
    } catch (erro) {
      console.error('[ZenOS][ATT06] Falha na movimentação auditada:', erro);
      mostrarZen('danger', 'Movimentação bloqueada', erro.message || 'Não foi possível movimentar o estoque com segurança.');
    } finally {
      setSalvandoMovimento(false);
    }
  };

  const carregarHistoricoProduto = async (produtoId = produtoEmEdicao?.id) => {
    if (!produtoId || !userId) return;
    setCarregandoHistorico(true);
    try {
      const lista = await carregarHistoricoEstoqueProduto({
        db,
        userId,
        produtoId,
        produtoSku: produtoEmEdicao?.sku || '',
        plano: planoLoja,
        inicio: filtroHistoricoInicio || null,
        fim: filtroHistoricoFim || null,
      });
      setHistoricoMovimentos(lista);
    } catch (erro) {
      console.error('[ZenOS][ATT06] Falha ao carregar histórico:', erro);
      mostrarZen('danger', 'Histórico indisponível', 'Não foi possível carregar o histórico de estoque deste produto.');
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const alternarHistorico = async () => {
    const novoEstado = !historicoExpandido;
    setHistoricoExpandido(novoEstado);
    if (novoEstado && produtoEmEdicao) await carregarHistoricoProduto(produtoEmEdicao.id);
  };


  const produtoTemHistorico = (produto) => {
    const id=String(produto?.id||''); const sku=String(produto?.sku||'').toUpperCase();
    const emVendas=(historicoVendas||[]).some(v=>(v.itens||[]).some(i=>String(i.produtoOriginalId||'')===id || String(i.produtoOriginalSku||i.sku||'').toUpperCase()===sku));
    const emCompras=(historicoCompras||[]).some(c=>(c.itens||[]).some(i=>String(i.produtoId||i.id||'')===id || String(i.sku||'').toUpperCase()===sku));
    return emVendas||emCompras;
  };
  const pedirExclusao = produto => { if(patenteUsuario!=='gerencia') return mostrarZen('danger', 'Acesso restrito', 'Somente a gerência pode inativar ou excluir produtos.'); setSenhaExclusao(''); setModalExcluir(produto); };
  const confirmarExclusao = async () => {
    if(!modalExcluir) return;
    const autorizador = await validarCredencialGerencial({ vendedores, senha: senhaExclusao, senhaLegada: regrasDesconto?.senhaGerente });
    if(!autorizador) return mostrarZen('danger', 'Senha incorreta', 'Informe o PIN de um Administrador/Gerência cadastrado.');
    const temHist=produtoTemHistorico(modalExcluir);
    if(temHist){ setProdutos(produtos.map(p=>String(p.id)===String(modalExcluir.id)&&String(p.sku)===String(modalExcluir.sku)?{...p,ativo:false,inativadoEm:new Date().toISOString(),inativadoPor:operadorAtivo?.nome||'Gerência'}:p)); }
    else { setProdutos(produtos.filter(p=>!(String(p.id)===String(modalExcluir.id)&&String(p.sku)===String(modalExcluir.sku)))); await liberarIdentidadeProduto({db,userId,produto:modalExcluir}); }
    setModalExcluir(null);
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{t ? t('catalogoTitulo') : 'Catálogo'}</h2><span style={{ fontSize: '13px', color: '#64748b' }}>{t ? t('catalogoSub') : 'Gerenciamento'}</span></div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <label style={{display:'flex',alignItems:'center',gap:6,color:'#94a3b8',fontSize:11,fontWeight:800}}><input type="checkbox" checked={mostrarInativos} onChange={e=>setMostrarInativos(e.target.checked)}/> Mostrar inativos</label><button onClick={abrirCadastroNovoProduto} style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: '1px solid #38bdf8', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.3)' }}>{t ? t('novoProdutoBtn') : '+ Novo Produto'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120', padding: '16px 20px', borderRadius: '16px', border: '1px solid #1e293b', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <button onClick={() => setFiltroGrupo('todos')} style={{ backgroundColor: filtroGrupo === 'todos' ? '#082f49' : '#020617', color: filtroGrupo === 'todos' ? '#38bdf8' : '#94a3b8', border: `1px solid ${filtroGrupo === 'todos' ? '#0284c7' : '#1e293b'}`, borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t ? t('todosGrupos') : 'Todos'} ({produtosListaFiltrada.length})</button>
          {gruposCadastrados.map((grp) => {
            const ativo = filtroGrupo === grp;
            const qtd = produtos.filter(p => (p.grupo || 'Geral') === grp).length;
            return (
              <button key={grp} onClick={() => setFiltroGrupo(grp)} style={{ backgroundColor: ativo ? '#082f49' : '#020617', color: ativo ? '#38bdf8' : '#94a3b8', border: `1px solid ${ativo ? '#0284c7' : '#1e293b'}`, borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{grp} ({qtd})</button>
            );
          })}
        </div>
        <input type="text" value={buscaProdutoTexto} onChange={(e) => setBuscaProdutoTexto(e.target.value)} placeholder={t ? t('buscarProd') : 'Buscar...'} style={{ width: '280px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '8px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' }} />
      </div>

      {conflitosIdentidade.length > 0 && (
        <div style={{ backgroundColor: 'rgba(127,29,29,0.24)', border: '1px solid #ef4444', borderRadius: '12px', padding: '12px 16px', color: '#fecaca', fontSize: '12px', fontWeight: 800 }}>
          ⛔ Conflito de identidade detectado em {conflitosIdentidade.length} ID(s) de produto. Movimentações desses itens serão bloqueadas para impedir que um produto altere outro. Nenhum cadastro será corrigido automaticamente.
        </div>
      )}

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px' }}>Foto & SKU</th>
                <th style={{ padding: '16px 12px' }}>Descrição</th>
                <th style={{ padding: '16px 12px' }}>Grupo & Unidade</th>
                <th style={{ padding: '16px 12px' }}>Localização</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>Vitrine | Galpão</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>Custo</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>Preço Venda</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>Atacado</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>Margem</th>
                <th style={{ padding: '16px 20px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {produtosListaFiltrada.length === 0 ? (
                <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Nenhum produto encontrado.</td></tr>
              ) : (
                produtosListaFiltrada.map((prod) => {
                  const custo = prod.custoBRL || 0; const preco = prod.precoBRL || 0; const margem = preco > 0 ? (((preco - custo) / preco) * 100).toFixed(1) : 0;
                  const ehServico = prod.tipoItem === 'servico';
                  return (
                    <tr key={`${prod.id}-${prod.sku}`} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {prod.imagem ? <img src={prod.imagem} alt={prod.nome} style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover' }} /> : <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{ehServico ? '🛠️' : '📦'}</div>}
                          <span>{prod.sku}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px' }}><div style={{ fontWeight: 700, color: '#ffffff', fontSize: '14px' }}>{prod.nome} {ehEncomendaUsoUnico(prod) && <span style={{ color: '#fbbf24', fontSize: '10px' }}>(⭐ Encomenda)</span>} {idsComConflito.has(String(prod.id)) && <span style={{ color: '#f87171', fontSize: '10px' }}>(⛔ ID duplicado)</span>}</div><span style={{ fontSize: '11px', color: '#64748b' }}>{prod.marca ? `Marca: ${prod.marca}` : 'S/ Marca'}</span></td>
                      <td style={{ padding: '16px 12px' }}><span style={{ backgroundColor: '#020617', border: '1px solid #1e293b', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>{prod.grupo || 'Geral'}</span><span style={{ marginLeft: '6px', fontSize: '11px', color: '#38bdf8', fontWeight: 800 }}>[{prod.unidadeMedida || 'UN'}]</span></td>
                      <td style={{ padding: '16px 12px', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{prod.localizacao || '—'}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        {ehServico ? <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '11px' }}>Infinito</span> : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px', minWidth: '150px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '9px', color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase' }}>Vitrine</span>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: '#0f172a', padding: '4px 6px', borderRadius: '8px', border: '1px solid #164e63' }}>
                                <button title="Transferir da vitrine para o depósito" onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'vitrine', -1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fb7185', fontWeight: 900, cursor: 'pointer' }}>-</button>
                                <span style={{ fontWeight: 900, fontSize: '14px', minWidth: '30px', textAlign: 'center', color: '#38bdf8' }}>{prod.estoqueVitrine ?? prod.estoque ?? 0}</span>
                                <button title="Transferir do depósito para a vitrine" onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'vitrine', 1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#34d399', fontWeight: 900, cursor: 'pointer' }}>+</button>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '9px', color: '#a855f7', fontWeight: 900, textTransform: 'uppercase' }}>Depósito</span>
                              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: '#0f172a', padding: '4px 6px', borderRadius: '8px', border: '1px solid #4c1d95' }}>
                                <button title="Transferir do depósito para a vitrine" onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'deposito', -1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fb7185', fontWeight: 900, cursor: 'pointer' }}>-</button>
                                <span style={{ fontWeight: 900, fontSize: '14px', minWidth: '30px', textAlign: 'center', color: '#a855f7' }}>{prod.estoqueGalpao ?? 0}</span>
                                <button title="Transferir da vitrine para o depósito" onClick={() => idsComConflito.has(String(prod.id)) ? mostrarZen('danger', 'Conflito de identidade', 'Movimentação bloqueada porque este produto possui ID duplicado no catálogo.') : abrirMovimentoRapido(prod, 'deposito', 1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#34d399', fontWeight: 900, cursor: 'pointer' }}>+</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', color: '#94a3b8', fontWeight: 700 }}>{fmt(custo)}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: '#34d399', fontSize: '15px' }}>{fmt(preco)}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: prod.habilitarPreco2 ? '#38bdf8' : '#475569' }}>{prod.habilitarPreco2 && prod.preco2BRL > 0 ? fmt(prod.preco2BRL) : '—'}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}><span style={{ backgroundColor: margem >= 40 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: margem >= 40 ? '#34d399' : '#fbbf24', border: `1px solid ${margem >= 40 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{margem}%</span></td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}><div style={{display:'flex',gap:6,justifyContent:'flex-end'}}><button onClick={() => pedirExclusao(prod)} style={{background:'#2e0a16',border:'1px solid #7f1d1d',color:'#fb7185',padding:'7px 10px',borderRadius:8,fontSize:11,fontWeight:900,cursor:'pointer'}}>{prod.ativo===false?'Inativo':'Inativar'}</button><button onClick={() => abrirEdicaoProduto(prod)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#38bdf8', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Editar</button></div></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalMovimento && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1700, padding: '16px' }}>
          <div style={{ width: '100%', maxWidth: '480px', backgroundColor: '#0b1120', border: '1px solid #0ea5e9', borderRadius: '20px', padding: '24px', color: '#fff' }}>
            <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 900, textTransform: 'uppercase' }}>Movimentação Auditada</div>
            <h3 style={{ margin: '6px 0 6px', fontSize: '18px' }}>{modalMovimento.produto.nome}</h3>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '16px' }}>
              {modalMovimento.origem === 'vitrine' ? 'Vitrine' : 'Depósito'} → {modalMovimento.destino === 'vitrine' ? 'Vitrine' : 'Depósito'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px', marginBottom: '12px' }}>
              <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Quantidade</label><input type="number" min="0.01" step="0.01" value={movimentoQtd} onChange={(e) => setMovimentoQtd(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '9px', boxSizing: 'border-box' }} /></div>
              <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Motivo *</label><select value={movimentoMotivo} onChange={(e) => setMovimentoMotivo(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '9px' }}><option>Reposição da vitrine</option><option>Retorno ao depósito</option><option>Organização interna</option><option>Inventário / conferência</option><option>Outro</option></select></div>
            </div>
            <div style={{ marginBottom: '16px' }}><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Observação</label><textarea value={movimentoObs} onChange={(e) => setMovimentoObs(e.target.value)} placeholder="Opcional: informe detalhes da movimentação" rows="3" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '9px', boxSizing: 'border-box', resize: 'vertical' }} /></div>
            <div style={{ padding: '10px 12px', backgroundColor: '#082f49', border: '1px solid #0e7490', borderRadius: '10px', color: '#bae6fd', fontSize: '11px', marginBottom: '16px' }}>Esta ação não altera o estoque total: apenas transfere unidades entre Vitrine e Depósito e registra operador, data, motivo e saldos antes/depois.</div>
            <div style={{ display: 'flex', gap: '10px' }}><button disabled={salvandoMovimento} onClick={() => setModalMovimento(null)} style={{ flex: 1, padding: '11px', borderRadius: '9px', backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontWeight: 800 }}>Cancelar</button><button disabled={salvandoMovimento} onClick={confirmarMovimentoEstoque} style={{ flex: 2, padding: '11px', borderRadius: '9px', background: 'linear-gradient(135deg,#0284c7,#0369a1)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 900 }}>{salvandoMovimento ? 'Registrando...' : 'Confirmar movimentação'}</button></div>
          </div>
        </div>
      )}

      {modalProdutoAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #0284c7', borderRadius: '24px', width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto', padding: '28px', boxShadow: '0 25px 50px rgba(0,0,0,0.85)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '1px', textTransform: 'uppercase' }}>Ficha Cadastral Universal</span>
                <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: '2px 0 0 0' }}>{produtoEmEdicao ? `Editar: ${produtoEmEdicao.nome}` : 'Cadastrar Produto ou Serviço'}</h3>
              </div>
              <button onClick={() => setModalProdutoAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '18px' }}>
              {[{ id: 'mercadoria', rotulo: 'Mercadoria Revenda', icone: '📦' }, { id: 'materia_prima', rotulo: 'Matéria-Prima', icone: '🧪' }, { id: 'kit', rotulo: 'Kit/Combo', icone: '🎁' }, { id: 'servico', rotulo: 'Serviço', icone: '🛠️' }].map(tipo => {
                const ativo = formProduto.tipoItem === tipo.id;
                return (
                  <button key={tipo.id} type="button" onClick={() => setFormProduto({ ...formProduto, tipoItem: tipo.id })} style={{ backgroundColor: ativo ? '#082f49' : '#020617', border: `1px solid ${ativo ? '#0284c7' : '#1e293b'}`, color: ativo ? '#38bdf8' : '#94a3b8', borderRadius: '10px', padding: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <span>{tipo.icone}</span><span>{tipo.rotulo}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '18px', marginBottom: '18px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Foto do Item</label>
                <div onClick={() => fileInputRef.current?.click()} style={{ width: '130px', height: '115px', borderRadius: '12px', backgroundColor: '#020617', border: '2px dashed #334155', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' }}>
                  {formProduto.imagem ? <img src={formProduto.imagem} alt="Produto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ textAlign: 'center', color: '#64748b' }}><span style={{ fontSize: '24px', display: 'block' }}>📷</span><span style={{ fontSize: '10px', fontWeight: 700 }}>Foto</span></div>}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={lidarUploadImagem} style={{ display: 'none' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 100px', gap: '10px' }}>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>SKU</label><input type="text" value={formProduto.sku} onChange={(e) => setFormProduto({ ...formProduto, sku: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 800, fontSize: '13px', padding: '8px 10px', outline: 'none' }} /></div>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Nome do Item</label><input type="text" value={formProduto.nome} onChange={(e) => setFormProduto({ ...formProduto, nome: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontWeight: 700, fontSize: '13px', padding: '8px 10px', outline: 'none' }} /></div>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Unid</label><select value={formProduto.unidadeMedida} onChange={(e) => setFormProduto({ ...formProduto, unidadeMedida: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#38bdf8', fontSize: '12px', fontWeight: 900, padding: '8px', outline: 'none' }}><option value="UN">UN</option><option value="KG">KG</option><option value="L">L</option><option value="M">M</option><option value="M²">M²</option><option value="CX">CX</option><option value="KIT">KIT</option></select></div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Grupo</label><button type="button" onClick={() => setCriandoNovoGrupo(!criandoNovoGrupo)} style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>{criandoNovoGrupo ? 'Voltar' : '+ Criar'}</button></div>
                    {criandoNovoGrupo ? <input type="text" value={novoGrupoTexto} onChange={(e) => setNovoGrupoTexto(e.target.value)} placeholder="Novo grupo..." style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #0284c7', borderRadius: '8px', color: '#38bdf8', fontSize: '12px', padding: '8px', outline: 'none' }} /> : <select value={formProduto.grupo} onChange={(e) => setFormProduto({ ...formProduto, grupo: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px', outline: 'none' }}>{gruposCadastrados.map(g => <option key={g} value={g}>{g}</option>)}</select>}
                  </div>
                  <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Marca</label><input type="text" value={formProduto.marca} onChange={(e) => setFormProduto({ ...formProduto, marca: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px 10px', outline: 'none' }} /></div>
                  
                  {/* --- O Campo de Fornecedor dinâmico e inteligente --- */}
                  <div style={{ position: 'relative' }}>
                    <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Fornecedor</label>
                    <input 
                      type="text" 
                      value={formProduto.fornecedor || ''} 
                      onChange={(e) => {
                        setFormProduto({ ...formProduto, fornecedor: e.target.value });
                        setMostrarFornecedores(true);
                      }} 
                      onFocus={() => setMostrarFornecedores(true)}
                      onBlur={() => setTimeout(() => setMostrarFornecedores(false), 250)}
                      autoComplete="off"
                      placeholder="Buscar..."
                      style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px 10px', outline: 'none' }} 
                    />
                    {mostrarFornecedores && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', marginTop: '4px', zIndex: 50, maxHeight: '150px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}>
                        {fornecedoresCadastrados
                          .filter(f => f.toLowerCase().includes((formProduto.fornecedor || '').toLowerCase()))
                          .map((forn) => (
                            <div 
                              // CHAVE ÚNICA DE STRING (Resolve o bug de não clicar quando digita)
                              key={forn} 
                              // EVENTO MOUSE DOWN (Resolve o bug de o campo perder o foco antes de registrar o clique)
                              onMouseDown={(e) => {
                                e.preventDefault(); // Impede que o navegador roube o foco do input
                                setFormProduto(prev => ({ ...prev, fornecedor: forn }));
                                setMostrarFornecedores(false);
                              }} 
                              style={{ padding: '8px 10px', color: '#cbd5e1', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid #1e293b', transition: 'background-color 0.2s' }}
                              onMouseEnter={(e) => e.target.style.backgroundColor = '#1e293b'}
                              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                            >
                              {forn}
                            </div>
                        ))}
                        {fornecedoresCadastrados.filter(f => f.toLowerCase().includes((formProduto.fornecedor || '').toLowerCase())).length === 0 && (
                          <div style={{ padding: '8px 10px', color: '#64748b', fontSize: '11px', fontStyle: 'italic' }}>
                            {formProduto.fornecedor ? 'Novo fornecedor...' : 'Nenhum salvo ainda.'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* --------------------------------------------------- */}

                  <div><label style={{ fontSize: '11px', color: '#34d399', fontWeight: 800 }}>Localização Física</label><input type="text" value={formProduto.localizacao} onChange={(e) => setFormProduto({ ...formProduto, localizacao: e.target.value })} placeholder="Ex: Gôndola 1, Prat. A" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #10b981', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px 10px', outline: 'none' }} /></div>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px 20px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '12px', alignItems: 'start', marginBottom: '8px' }}>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Custo (R$)</label><input type="text" value={formProduto.custoBRL} onChange={(e) => setFormProduto({ ...formProduto, custoBRL: e.target.value, precoBRL: atualizarPrecoPorCustoEMargem(e.target.value, formProduto.margemDesejada) })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Margem sobre venda (%)</label><input type="number" min="0" max={MAX_MARGEM_PRECO_PCT} step="0.1" value={formProduto.margemDesejada} onChange={(e) => setFormProduto({ ...formProduto, margemDesejada: e.target.value, precoBRL: atualizarPrecoPorCustoEMargem(formProduto.custoBRL, e.target.value) })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: `1px solid ${validarMargemPrecoVenda(formProduto.margemDesejada).ok ? '#334155' : '#f43f5e'}`, borderRadius: '8px', color: validarMargemPrecoVenda(formProduto.margemDesejada).ok ? '#fbbf24' : '#fb7185', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Preço Venda</label><input type="text" value={formProduto.precoBRL} onChange={(e) => setFormProduto({ ...formProduto, precoBRL: e.target.value, margemDesejada: atualizarMargemPorPreco(formProduto.custoBRL, e.target.value) })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #34d399', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>Vitrine / Loja</label><input type="number" disabled={formProduto.tipoItem === 'servico' || Boolean(produtoEmEdicao)} value={formProduto.estoqueVitrine} onChange={(e) => setFormProduto({ ...formProduto, estoqueVitrine: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #0369a1', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '6px', outline: 'none' }} /></div>
                <div style={{minWidth:0}}><label style={{ minHeight: '30px', display:'flex', alignItems:'flex-end', fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>Galpão / Depósito</label><input type="number" disabled={formProduto.tipoItem === 'servico' || Boolean(produtoEmEdicao)} value={formProduto.estoqueGalpao} onChange={(e) => setFormProduto({ ...formProduto, estoqueGalpao: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '100%', height:'38px', boxSizing:'border-box', backgroundColor: '#0b1120', border: '1px solid #7e22ce', borderRadius: '8px', color: '#a855f7', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '6px', outline: 'none' }} /></div>
              </div>
              <div style={{fontSize:'9px',color:'#64748b',margin:'0 0 10px'}}>Margem calculada sobre a venda. Máx. 99,9%. Ex.: custo 10 + margem 40% = venda 16,67.</div>
              <div style={{ borderTop: '1px solid #1e293b', paddingTop: '10px', display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={formProduto.habilitarPreco2} onChange={(e) => setFormProduto({ ...formProduto, habilitarPreco2: e.target.checked })} style={{ cursor: 'pointer' }} /><label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Preço 2 (Atacado)</label>{formProduto.habilitarPreco2 && <input type="text" value={formProduto.preco2BRL} onChange={(e) => setFormProduto({ ...formProduto, preco2BRL: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '90px', backgroundColor: '#0b1120', border: '1px solid #38bdf8', borderRadius: '6px', color: '#38bdf8', fontWeight: 800, fontSize: '12px', textAlign: 'right', padding: '4px 8px', outline: 'none' }} />}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={formProduto.habilitarPreco3} onChange={(e) => setFormProduto({ ...formProduto, habilitarPreco3: e.target.checked })} style={{ cursor: 'pointer' }} /><label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>Preço 3 (Distrib.)</label>{formProduto.habilitarPreco3 && <input type="text" value={formProduto.preco3BRL} onChange={(e) => setFormProduto({ ...formProduto, preco3BRL: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '90px', backgroundColor: '#0b1120', border: '1px solid #818cf8', borderRadius: '6px', color: '#818cf8', fontWeight: 800, fontSize: '12px', textAlign: 'right', padding: '4px 8px', outline: 'none' }} />}</div>
              </div>
            </div>

            <div style={{ backgroundColor: '#070d19', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
              <div onClick={() => setSecaoFiscalExpandida(!secaoFiscalExpandida)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', cursor: 'pointer', backgroundColor: secaoFiscalExpandida ? '#0c1527' : '#070d19', borderBottom: secaoFiscalExpandida ? '1px solid #1e293b' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '14px' }}>⚖️</span><span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>Parâmetros Fiscais (NCM / DNIT / IVA)</span></div>
                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 900 }}>{secaoFiscalExpandida ? '▲ Recolher' : '▼ Expandir'}</span>
              </div>
              {secaoFiscalExpandida && (
                <div style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button type="button" onClick={() => setPaisRegulamentoFiscal('BR')} style={{ backgroundColor: paisRegulamentoFiscal === 'BR' ? '#064e3b' : '#020617', border: `1px solid ${paisRegulamentoFiscal === 'BR' ? '#10b981' : '#334155'}`, color: paisRegulamentoFiscal === 'BR' ? '#34d399' : '#94a3b8', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>🇧🇷 Brasil (NCM)</button>
                    <button type="button" onClick={() => setPaisRegulamentoFiscal('PY')} style={{ backgroundColor: paisRegulamentoFiscal === 'PY' ? '#1e1b4b' : '#020617', border: `1px solid ${paisRegulamentoFiscal === 'PY' ? '#6366f1' : '#334155'}`, color: paisRegulamentoFiscal === 'PY' ? '#a5b4fc' : '#94a3b8', padding: '4px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>🇵🇾 Paraguai (DNIT)</button>
                  </div>
                  {paisRegulamentoFiscal === 'BR' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>NCM</label><input type="text" value={formProduto.ncm} onChange={(e) => setFormProduto({ ...formProduto, ncm: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>CEST</label><input type="text" value={formProduto.cest} onChange={(e) => setFormProduto({ ...formProduto, cest: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>CFOP Saída</label><input type="text" value={formProduto.cfop} onChange={(e) => setFormProduto({ ...formProduto, cfop: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Origem</label><select value={formProduto.origem} onChange={(e) => setFormProduto({ ...formProduto, origem: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '11px', padding: '8px', outline: 'none' }}><option value="0">0 - Nacional</option><option value="1">1 - Importada</option></select></div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Código DNIT</label><input type="text" value={formProduto.codigoDnit} onChange={(e) => setFormProduto({ ...formProduto, codigoDnit: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Tasa IVA (PY)</label><select value={formProduto.ivaParaguai} onChange={(e) => setFormProduto({ ...formProduto, ivaParaguai: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }}><option value="10">10%</option><option value="5">5%</option><option value="0">Exento</option></select></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Unidad SIFEN</label><select value={formProduto.unidadMedidaPy} onChange={(e) => setFormProduto({ ...formProduto, unidadMedidaPy: e.target.value })} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px', padding: '8px', outline: 'none' }}><option value="UNI">Unidad</option><option value="GL">Galón</option><option value="LT">Litro</option></select></div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {produtoEmEdicao && (
              <div style={{ backgroundColor: '#070d19', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden', marginBottom: '24px' }}>
                <div onClick={alternarHistorico} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', cursor: 'pointer', backgroundColor: historicoExpandido ? '#0c1527' : '#070d19', borderBottom: historicoExpandido ? '1px solid #1e293b' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>🧾</span><span style={{ fontSize: '12px', fontWeight: 900, color: '#cbd5e1' }}>Histórico de Movimentações de Estoque</span></div>
                  <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 900 }}>{historicoExpandido ? '▲ Recolher' : '▼ Expandir'}</span>
                </div>
                {historicoExpandido && (
                  <div style={{ padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Plano: <span style={{ color: '#38bdf8' }}>{obterPoliticaHistoricoEstoque(planoLoja).rotulo}</span></div>
                        <div style={{ fontSize: '10px', color: '#64748b' }}>Janela consultável: últimos {obterPoliticaHistoricoEstoque(planoLoja).dias} dias. A exclusão física automática não é feita nesta ATT.</div>
                      </div>
                      <button type="button" onClick={() => carregarHistoricoProduto(produtoEmEdicao.id)} style={{ backgroundColor: '#082f49', border: '1px solid #0284c7', color: '#38bdf8', borderRadius: '8px', padding: '7px 12px', fontWeight: 800, cursor: 'pointer' }}>Atualizar</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>De</label><input type="date" value={filtroHistoricoInicio} onChange={(e) => setFiltroHistoricoInicio(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '8px', boxSizing: 'border-box' }} /></div>
                      <div><label style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>Até</label><input type="date" value={filtroHistoricoFim} onChange={(e) => setFiltroHistoricoFim(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '8px', boxSizing: 'border-box' }} /></div>
                      <div style={{ display: 'flex', alignItems: 'end' }}><button type="button" onClick={() => carregarHistoricoProduto(produtoEmEdicao.id)} style={{ width: '100%', backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', borderRadius: '8px', padding: '8px', fontWeight: 800, cursor: 'pointer' }}>Filtrar datas</button></div>
                    </div>
                    {carregandoHistorico ? (
                      <div style={{ color: '#94a3b8', padding: '20px', textAlign: 'center' }}>Carregando histórico...</div>
                    ) : historicoMovimentos.length === 0 ? (
                      <div style={{ color: '#64748b', padding: '20px', textAlign: 'center', backgroundColor: '#020617', borderRadius: '10px' }}>Nenhuma movimentação registrada dentro do período disponível.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                        {historicoMovimentos.map((mov) => (
                          <div key={mov.id} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '10px', padding: '10px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                              <strong style={{ color: '#e2e8f0', fontSize: '12px' }}>{mov.tipo === 'transferencia_interna' ? '↔ Transferência interna' : mov.tipo === 'venda' ? '🛒 Venda' : mov.tipo === 'devolucao' ? '↩ Devolução' : mov.tipo === 'compra_entrada' ? '📦 Entrada de compra' : mov.tipo}</strong>
                              <span style={{ color: '#64748b', fontSize: '10px' }}>{mov.createdAt ? new Date(mov.createdAt).toLocaleString('pt-BR') : '—'}</span>
                            </div>
                            <div style={{ marginTop: '6px', color: '#cbd5e1', fontSize: '11px' }}>
                              <span style={{ color: '#38bdf8', fontWeight: 800 }}>{mov.quantidade}</span> un. • {mov.origem || 'externo'} → {mov.destino || '—'} • {mov.motivo || 'Sem motivo'}
                            </div>
                            <div style={{ marginTop: '4px', color: '#64748b', fontSize: '10px' }}>Operador: {mov.operadorNome || '—'}{mov.referenciaId ? ` • Ref.: ${mov.referenciaId}` : ''}</div>
                            {mov.saldoAntes && mov.saldoDepois && <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '10px' }}>Antes V/D/T: {mov.saldoAntes.vitrine}/{mov.saldoAntes.deposito}/{mov.saldoAntes.total} → Depois: {mov.saldoDepois.vitrine}/{mov.saldoDepois.deposito}/{mov.saldoDepois.total}</div>}
                            {mov.observacao && <div style={{ marginTop: '4px', color: '#94a3b8', fontSize: '10px' }}>Obs.: {mov.observacao}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalProdutoAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarProduto} style={{ flex: 2, background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>Salvar Produto no Sistema</button>
            </div>
          </div>
        </div>
      )}
    
      <ZenModal aberto={!!modalZen} variante={modalZen?.variante} titulo={modalZen?.titulo} mensagem={modalZen?.mensagem} detalhes={modalZen?.detalhes} apenasConfirmar={true} onConfirmar={()=>setModalZen(null)} onCancelar={()=>setModalZen(null)} />

      {modalExcluir && <div style={{position:'fixed',inset:0,zIndex:20000,background:'rgba(2,6,23,.88)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><div style={{maxWidth:480,width:'100%',background:'#0b1120',border:'1px solid #f43f5e',borderRadius:22,padding:22,color:'#fff'}}><div style={{display:'flex',gap:12,alignItems:'center'}}><img src="/logo-zenos.png?v=4" style={{width:46,height:46,objectFit:'contain'}}/><div><div style={{color:'#fb7185',fontSize:11,fontWeight:900}}>AÇÃO GERENCIAL</div><h3 style={{margin:'3px 0'}}>Inativar / excluir produto</h3></div></div><p style={{color:'#cbd5e1',fontSize:13,lineHeight:1.5}}>Se o produto já participou de venda ou compra, ele será apenas <b>inativado</b> para preservar o histórico. Exclusão física só ocorre em cadastro sem uso.</p><input type="text" autoComplete="one-time-code" name="zenos-product-manager-pin" data-lpignore="true" data-1p-ignore="true" value={senhaExclusao} onChange={e=>setSenhaExclusao(e.target.value)} placeholder="PIN do Administrador / Gerência" style={{width:'100%',WebkitTextSecurity:'disc',boxSizing:'border-box',padding:12,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#fff'}}/><div style={{display:'flex',gap:10,marginTop:14}}><button onClick={()=>setModalExcluir(null)} style={{flex:1,padding:11,borderRadius:10,border:'1px solid #334155',background:'#020617',color:'#cbd5e1'}}>Cancelar</button><button onClick={confirmarExclusao} style={{flex:1,padding:11,borderRadius:10,border:'none',background:'#e11d48',color:'#fff',fontWeight:900}}>Confirmar</button></div></div></div>}
</div>
  );
}
