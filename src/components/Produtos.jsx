import React, { useState, useRef } from 'react';
import { normalizarProduto } from '../data';

// Adicionamos a prop 'fornecedoresGlobais' para receber a lista oficial do sistema
export default function Produtos({ produtos, setProdutos, moeda, fmt, t, restaurarProdutosPadrao, fornecedoresGlobais = [] }) {
  const [gruposCadastrados, setGruposCadastrados] = useState(['Tintas Acrílicas', 'Colorimetria & Pigmentos', 'Massas e Complementos', 'Serviços Especializados', 'Acessórios & Ferramentas']);
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [buscaProdutoTexto, setBuscaProdutoTexto] = useState('');
  
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [produtoEmEdicao, setProdutoEmEdicao] = useState(null);
  const [secaoFiscalExpandida, setSecaoFiscalExpandida] = useState(false);
  const [paisRegulamentoFiscal, setPaisRegulamentoFiscal] = useState('BR');
  const [novoGrupoTexto, setNovoGrupoTexto] = useState('');
  const [criandoNovoGrupo, setCriandoNovoGrupo] = useState(false);

  // --- MELHORIA: Autocomplete Inteligente (PRODUTOS + BANCO GLOBAL) ---
  // Agora ele pega os fornecedores que já estão nos produtos E os fornecedores oficiais do sistema
  const todosOsFornecedores = [
    ...produtos.map((p) => p.fornecedor),
    ...fornecedoresGlobais.map(f => typeof f === 'object' ? f.nome || f.razao_social : f)
  ];
  
  const fornecedoresCadastrados = Array.from(
    new Set(todosOsFornecedores.filter((f) => f && f.trim() !== ''))
  ).sort();
  
  const [mostrarFornecedores, setMostrarFornecedores] = useState(false);
  // ---------------------------------------------------------------

  const [formProduto, setFormProduto] = useState(normalizarProduto({}));
  const fileInputRef = useRef(null);

  const produtosListaFiltrada = produtos.filter(p => {
    if (!p) return false;
    if (p.usoUnicoEncomendado && (p.estoque || 0) <= 0) return false;

    const nomeLower = (p.nome || '').toLowerCase();
    const skuLower = (p.sku || '').toLowerCase();
    const grupoItem = p.grupo || 'Geral';
    const bateGrupo = filtroGrupo === 'todos' || grupoItem === filtroGrupo;
    const texto = buscaProdutoTexto.toLowerCase().trim();
    const bateTexto = texto === '' || nomeLower.includes(texto) || skuLower.includes(texto);
    return bateGrupo && bateTexto;
  });

  const atualizarPrecoPorCustoEMargem = (custoStr, margemStr) => {
    const custo = parseFloat(String(custoStr).replace(',', '.')) || 0;
    const margem = parseFloat(String(margemStr).replace(',', '.')) || 0;
    if (custo > 0) { const precoCalculado = custo / (1 - (margem / 100)); return precoCalculado > 0 ? precoCalculado.toFixed(2) : '0.00'; }
    return '';
  };

  const atualizarMargemPorPreco = (custoStr, precoStr) => {
    const custo = parseFloat(String(custoStr).replace(',', '.')) || 0;
    const preco = parseFloat(String(precoStr).replace(',', '.')) || 0;
    if (preco > 0 && custo > 0) { return (((preco - custo) / preco) * 100).toFixed(1); }
    return '0';
  };

  const abrirCadastroNovoProduto = () => {
    setProdutoEmEdicao(null);
    setSecaoFiscalExpandida(false);
    setCriandoNovoGrupo(false);
    setNovoGrupoTexto('');
    setPaisRegulamentoFiscal(moeda === 'PYG' ? 'PY' : 'BR');
    setFormProduto(normalizarProduto({ 
      sku: `SKU-${Date.now().toString().slice(-5)}`, 
      grupo: gruposCadastrados[0],
      estoqueVitrine: '0',
      estoqueGalpao: '0',
      localizacao: ''
    }));
    setModalProdutoAberto(true);
  };

  const abrirEdicaoProduto = (prod) => {
    setProdutoEmEdicao(prod);
    setSecaoFiscalExpandida(false);
    setCriandoNovoGrupo(false);
    setPaisRegulamentoFiscal(moeda === 'PYG' ? 'PY' : 'BR');
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

  const salvarProduto = () => {
    if (!formProduto.nome.trim()) return alert('Por favor, informe o nome do produto.');
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

    if (produtoEmEdicao) {
      setProdutos(produtos.map(p => p.id === produtoEmEdicao.id ? dadosFinais : p));
    } else {
      setProdutos([dadosFinais, ...produtos]);
    }
    setModalProdutoAberto(false);
  };

  const alterarEstoqueRapido = (id, delta) => {
    setProdutos(produtos.map(p => {
      if (p.id === id) {
        const vitrineAtual = p.estoqueVitrine ?? p.estoque ?? 0;
        const novoVitrine = Math.max(0, vitrineAtual + delta);
        const galpaoAtual = p.estoqueGalpao ?? 0;
        const novoEstoqueTotal = novoVitrine + galpaoAtual;
        return { ...p, estoque: novoEstoqueTotal, estoqueVitrine: novoVitrine };
      }
      return p;
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{t('catalogoTitulo')}</h2><span style={{ fontSize: '13px', color: '#64748b' }}>{t('catalogoSub')}</span></div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={abrirCadastroNovoProduto} style={{ background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: '1px solid #38bdf8', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(2, 132, 199, 0.3)' }}>{t('novoProdutoBtn')}</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120', padding: '16px 20px', borderRadius: '16px', border: '1px solid #1e293b', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
          <button onClick={() => setFiltroGrupo('todos')} style={{ backgroundColor: filtroGrupo === 'todos' ? '#082f49' : '#020617', color: filtroGrupo === 'todos' ? '#38bdf8' : '#94a3b8', border: `1px solid ${filtroGrupo === 'todos' ? '#0284c7' : '#1e293b'}`, borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t('todosGrupos')} ({produtosListaFiltrada.length})</button>
          {gruposCadastrados.map((grp) => {
            const ativo = filtroGrupo === grp;
            const qtd = produtos.filter(p => (p.grupo || 'Geral') === grp && (!p.usoUnicoEncomendado || p.estoque > 0)).length;
            return (
              <button key={grp} onClick={() => setFiltroGrupo(grp)} style={{ backgroundColor: ativo ? '#082f49' : '#020617', color: ativo ? '#38bdf8' : '#94a3b8', border: `1px solid ${ativo ? '#0284c7' : '#1e293b'}`, borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{grp} ({qtd})</button>
            );
          })}
        </div>
        <input type="text" value={buscaProdutoTexto} onChange={(e) => setBuscaProdutoTexto(e.target.value)} placeholder={t('buscarProd')} style={{ width: '280px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '8px 14px', color: '#ffffff', fontSize: '13px', outline: 'none' }} />
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px' }}>{t('fotoSku')}</th>
                <th style={{ padding: '16px 12px' }}>{t('descItem')}</th>
                <th style={{ padding: '16px 12px' }}>Grupo & Unidade</th>
                <th style={{ padding: '16px 12px' }}>Localização</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>Vitrine | Galpão</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>{t('custo')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>{t('preco1')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>{t('preco2')}</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>{t('margem')}</th>
                <th style={{ padding: '16px 20px', textAlign: 'right' }}>{t('acoes')}</th>
              </tr>
            </thead>
            <tbody>
              {produtosListaFiltrada.length === 0 ? (
                <tr><td colSpan="10" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>{t('nenhumProd')}</td></tr>
              ) : (
                produtosListaFiltrada.map((prod) => {
                  const custo = prod.custoBRL || 0; const preco = prod.precoBRL || 0; const margem = preco > 0 ? (((preco - custo) / preco) * 100).toFixed(1) : 0;
                  const ehServico = prod.tipoItem === 'servico';
                  return (
                    <tr key={prod.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '16px 20px', fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {prod.imagem ? <img src={prod.imagem} alt={prod.nome} style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover' }} /> : <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#020617', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{ehServico ? '🛠️️' : '📦'}</div>}
                          <span>{prod.sku}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px' }}><div style={{ fontWeight: 700, color: '#ffffff', fontSize: '14px' }}>{prod.nome} {prod.usoUnicoEncomendado && <span style={{ color: '#fbbf24', fontSize: '10px' }}>(⭐ Encomenda)</span>}</div><span style={{ fontSize: '11px', color: '#64748b' }}>{prod.marca ? `Marca: ${prod.marca}` : 'S/ Marca'}</span></td>
                      <td style={{ padding: '16px 12px' }}><span style={{ backgroundColor: '#020617', border: '1px solid #1e293b', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', color: '#cbd5e1', fontWeight: 700 }}>{prod.grupo || 'Geral'}</span><span style={{ marginLeft: '6px', fontSize: '11px', color: '#38bdf8', fontWeight: 800 }}>[{prod.unidadeMedida || 'UN'}]</span></td>
                      <td style={{ padding: '16px 12px', fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>{prod.localizacao || '—'}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        {ehServico ? <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '11px' }}>Infinito</span> : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#0f172a', padding: '4px 8px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                              <button onClick={() => alterarEstoqueRapido(prod.id, -1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fb7185', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                              <span style={{ fontWeight: 900, fontSize: '14px', minWidth: '30px', textAlign: 'center', color: '#38bdf8' }} title="Loja / Vitrine">{prod.estoqueVitrine ?? prod.estoque ?? 0}</span>
                              <button onClick={() => alterarEstoqueRapido(prod.id, 1)} style={{ width: '20px', height: '20px', borderRadius: '4px', backgroundColor: '#020617', border: '1px solid #334155', color: '#34d399', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            </div>
                            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>📦 Depósito: <span style={{ color: '#a855f7' }}>{prod.estoqueGalpao ?? 0}</span></span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', color: '#94a3b8', fontWeight: 700 }}>{fmt(custo)}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: '#34d399', fontSize: '15px' }}>{fmt(preco)}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: prod.habilitarPreco2 ? '#38bdf8' : '#475569' }}>{prod.habilitarPreco2 && prod.preco2BRL > 0 ? fmt(prod.preco2BRL) : '—'}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}><span style={{ backgroundColor: margem >= 40 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: margem >= 40 ? '#34d399' : '#fbbf24', border: `1px solid ${margem >= 40 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`, padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>{margem}%</span></td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}><button onClick={() => abrirEdicaoProduto(prod)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#38bdf8', padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>{t('editar')}</button></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
                      onBlur={() => setTimeout(() => setMostrarFornecedores(false), 200)}
                      autoComplete="off"
                      placeholder="Buscar..."
                      style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#ffffff', fontSize: '12px', padding: '8px 10px', outline: 'none' }} 
                    />
                    {mostrarFornecedores && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', marginTop: '4px', zIndex: 50, maxHeight: '150px', overflowY: 'auto', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}>
                        {fornecedoresCadastrados
                          .filter(f => f.toLowerCase().includes((formProduto.fornecedor || '').toLowerCase()))
                          .map((forn, idx) => (
                            <div 
                              key={idx} 
                              onClick={() => {
                                setFormProduto({ ...formProduto, fornecedor: forn });
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Custo (R$)</label><input type="text" value={formProduto.custoBRL} onChange={(e) => setFormProduto({ ...formProduto, custoBRL: e.target.value, precoBRL: atualizarPrecoPorCustoEMargem(e.target.value, formProduto.margemDesejada) })} onFocus={(e) => e.target.select()} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Margem (%)</label><input type="text" value={formProduto.margemDesejada} onChange={(e) => setFormProduto({ ...formProduto, margemDesejada: e.target.value, precoBRL: atualizarPrecoPorCustoEMargem(formProduto.custoBRL, e.target.value) })} onFocus={(e) => e.target.select()} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#fbbf24', fontWeight: 800, fontSize: '14px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Preço Venda</label><input type="text" value={formProduto.precoBRL} onChange={(e) => setFormProduto({ ...formProduto, precoBRL: e.target.value, margemDesejada: atualizarMargemPorPreco(formProduto.custoBRL, e.target.value) })} onFocus={(e) => e.target.select()} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #34d399', borderRadius: '8px', color: '#34d399', fontWeight: 900, fontSize: '15px', textAlign: 'right', padding: '6px 10px', outline: 'none' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700 }}>Vitrine / Loja</label><input type="number" disabled={formProduto.tipoItem === 'servico'} value={formProduto.estoqueVitrine} onChange={(e) => setFormProduto({ ...formProduto, estoqueVitrine: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #0369a1', borderRadius: '8px', color: '#38bdf8', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '6px', outline: 'none' }} /></div>
                <div><label style={{ fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>Galpão / Depósito</label><input type="number" disabled={formProduto.tipoItem === 'servico'} value={formProduto.estoqueGalpao} onChange={(e) => setFormProduto({ ...formProduto, estoqueGalpao: e.target.value })} onFocus={(e) => e.target.select()} style={{ width: '100%', backgroundColor: '#0b1120', border: '1px solid #7e22ce', borderRadius: '8px', color: '#a855f7', fontWeight: 900, fontSize: '14px', textAlign: 'center', padding: '6px', outline: 'none' }} /></div>
              </div>
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

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalProdutoAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarProduto} style={{ flex: 2, background: 'linear-gradient(135deg, #0284c7, #0369a1)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer' }}>Salvar Produto no Sistema</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
