import React, { useState, useEffect, useMemo } from 'react';

export default function Mesas({ produtos, fmt, tx, historicoVendas, setHistoricoVendas, moeda, idioma }) {
  // Inicialização Segura: Garante que as mesas não se perdem se o navegador fechar
  const [mesas, setMesas] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_mesas_ativas');
      if (salvo) return JSON.parse(salvo);
    } catch (e) {}
    
    // Gerar ambiente padrão: 15 Mesas + 5 Comandas Vips
    const iniciais = [];
    for(let i=1; i<=15; i++) iniciais.push({ id: `M${i}`, tipo: 'Mesa', rotulo: `Mesa ${String(i).padStart(2, '0')}`, status: 'livre', itens: [] });
    for(let i=1; i<=5; i++) iniciais.push({ id: `C${i}`, tipo: 'Comanda', rotulo: `Comanda ${String(i).padStart(2, '0')}`, status: 'livre', itens: [] });
    return iniciais;
  });

  useEffect(() => {
    localStorage.setItem('zenos_mesas_ativas', JSON.stringify(mesas));
  }, [mesas]);

  const [mesaAtivaId, setMesaAtivaId] = useState(null);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [modalPagamento, setModalPagamento] = useState(false);
  const [metodoPgto, setMetodoPgto] = useState('Dinheiro');
  
  const mesaAtiva = mesas.find(m => m.id === mesaAtivaId);

  // Otimização de Busca para Cardápio (Ignora itens de uso único sem estoque)
  const produtosCardapio = useMemo(() => {
    let lista = produtos.filter(p => !p.usoUnicoEncomendado || p.estoque > 0);
    if (!buscaProduto) return lista.slice(0, 50); // Mostra 50 primeiros para ser rápido
    const txt = buscaProduto.toLowerCase();
    return lista.filter(p => (p.nome || '').toLowerCase().includes(txt) || (p.sku || '').toLowerCase().includes(txt)).slice(0, 50);
  }, [produtos, buscaProduto]);

  const totalMesa = useMemo(() => {
    if (!mesaAtiva) return 0;
    return mesaAtiva.itens.reduce((acc, item) => acc + (item.preco * item.qtd), 0);
  }, [mesaAtiva]);

  // AÇÕES DA MESA
  const adicionarItemMesa = (produto) => {
    setMesas(prev => prev.map(m => {
      if (m.id === mesaAtivaId) {
        const jaExiste = m.itens.findIndex(it => it.produtoId === produto.id);
        let novosItens = [...m.itens];
        if (jaExiste >= 0) {
          novosItens[jaExiste].qtd += 1;
        } else {
          novosItens.push({
            produtoId: produto.id,
            nome: produto.nome,
            preco: produto.precoBRL || 0,
            custo: produto.custoBRL || 0,
            qtd: 1
          });
        }
        return { ...m, status: 'ocupada', itens: novosItens };
      }
      return m;
    }));
  };

  const alterarQtdItem = (produtoId, delta) => {
    setMesas(prev => prev.map(m => {
      if (m.id === mesaAtivaId) {
        let novosItens = m.itens.map(it => {
          if (it.produtoId === produtoId) return { ...it, qtd: it.qtd + delta };
          return it;
        }).filter(it => it.qtd > 0);
        return { ...m, itens: novosItens, status: novosItens.length === 0 ? 'livre' : 'ocupada' };
      }
      return m;
    }));
  };

  const processarPagamento = () => {
    if (!mesaAtiva || mesaAtiva.itens.length === 0) return;
    
    // Constrói objeto de venda perfeitamente compatível com o seu sistema de Faturamento
    const novaVenda = {
      id: Date.now(),
      dataHora: new Date().toLocaleString(idioma === 'en' ? 'en-US' : idioma === 'es' ? 'es-ES' : 'pt-BR'),
      clienteNome: `Consumidor (${mesaAtiva.rotulo})`,
      clienteId: null,
      operador: 'Módulo Restaurante',
      totalBRL: totalMesa,
      lucroBRL: mesaAtiva.itens.reduce((acc, it) => acc + ((it.preco - it.custo) * it.qtd), 0),
      estado: 'concluida',
      itens: mesaAtiva.itens.map(it => ({
        id: it.produtoId,
        nome: it.nome,
        qtd: it.qtd,
        precoPraticadoBRL: it.preco,
        custoBRL: it.custo
      })),
      pagamentos: [
        { rotulo: metodoPgto, valorConvertidoBRL: totalMesa }
      ]
    };

    // Salva na Nuvem/Histórico Geral
    setHistoricoVendas([novaVenda, ...historicoVendas]);

    // Limpa e liberta a Mesa
    setMesas(prev => prev.map(m => m.id === mesaAtivaId ? { ...m, status: 'livre', itens: [] } : m));
    setModalPagamento(false);
    setMesaAtivaId(null);
  };

  // TELA 1: MAPA GERAL DE MESAS
  if (!mesaAtivaId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Mapa de Mesas & Comandas</h2><span style={{ fontSize: '13px', color: '#64748b' }}>Gestão de consumos em aberto</span></div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981' }}></div><span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Livre</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#f43f5e' }}></div><span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Ocupada</span></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
          {mesas.map(m => {
            const ocupada = m.status === 'ocupada';
            const total = ocupada ? m.itens.reduce((acc, it) => acc + (it.preco * it.qtd), 0) : 0;
            return (
              <div 
                key={m.id} 
                onClick={() => setMesaAtivaId(m.id)}
                style={{ 
                  backgroundColor: ocupada ? '#4c0519' : '#064e3b', 
                  border: `2px solid ${ocupada ? '#e11d48' : '#10b981'}`, 
                  borderRadius: '16px', padding: '20px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform 0.2s',
                  boxShadow: ocupada ? '0 10px 25px rgba(225, 29, 72, 0.2)' : 'none'
                }}
              >
                <span style={{ fontSize: '28px', marginBottom: '8px' }}>{m.tipo === 'Mesa' ? '🍽️' : '🎫'}</span>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>{m.rotulo}</span>
                {ocupada ? (
                  <span style={{ color: '#fda4af', fontWeight: 800, fontSize: '12px', marginTop: '6px' }}>{fmt(total)}</span>
                ) : (
                  <span style={{ color: '#a7f3d0', fontWeight: 800, fontSize: '11px', marginTop: '6px' }}>Disponível</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    );
  }

  // TELA 2: GESTÃO DA MESA SELECIONADA
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 140px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120', padding: '16px 24px', borderRadius: '16px', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => setMesaAtivaId(null)} style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', padding: '10px 16px', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}>⬅ Voltar ao Mapa</button>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#fff', fontWeight: 900 }}>{mesaAtiva.rotulo}</h2>
            <span style={{ color: mesaAtiva.status === 'ocupada' ? '#fb7185' : '#34d399', fontSize: '12px', fontWeight: 800 }}>
              {mesaAtiva.status === 'ocupada' ? '🔴 Em Consumo' : '🟢 Mesa Livre'}
            </span>
          </div>
        </div>
        <div style={{ fontSize: '24px', fontWeight: 900, color: '#38bdf8' }}>Total: {fmt(totalMesa)}</div>
      </div>

      <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
        {/* LADO ESQUERDO: CARDÁPIO / PRODUTOS */}
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#0b1120', borderRadius: '16px', border: '1px solid #1e293b', padding: '20px' }}>
          <input 
            type="text" value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)}
            placeholder="🔍 Buscar produto no cardápio..."
            style={{ width: '100%', padding: '14px 20px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px', alignContent: 'start' }}>
            {produtosCardapio.map(p => (
              <div 
                key={p.id} onClick={() => adicionarItemMesa(p)}
                style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '8px' }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#0284c7'}
                onMouseOut={e => e.currentTarget.style.borderColor = '#1e293b'}
              >
                <div style={{ fontWeight: 800, color: '#f8fafc', fontSize: '13px', lineHeight: 1.3 }}>{p.nome}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>{p.grupo || 'Geral'}</span>
                  <span style={{ color: '#34d399', fontWeight: 900, fontSize: '14px' }}>{fmt(p.precoBRL)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LADO DIREITO: CONTA DA MESA */}
        <div style={{ flex: 1, backgroundColor: '#020617', borderRadius: '16px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ backgroundColor: '#1e1b4b', padding: '16px', borderBottom: '1px solid #312e81', textAlign: 'center' }}>
            <h3 style={{ margin: 0, color: '#a5b4fc', fontSize: '15px', fontWeight: 900 }}>CONTA ABERTA</h3>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {mesaAtiva.itens.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#475569', fontSize: '13px', marginTop: '40px', fontWeight: 800 }}>Mesa vazia. Adicione itens do cardápio.</div>
            ) : (
              mesaAtiva.itens.map(it => (
                <div key={it.produtoId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0b1120', padding: '12px', borderRadius: '10px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>{it.nome}</span>
                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>{fmt(it.preco)} / un</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => alterarQtdItem(it.produtoId, -1)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#f43f5e', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>-</button>
                    <span style={{ color: '#38bdf8', fontWeight: 900, fontSize: '14px', width: '20px', textAlign: 'center' }}>{it.qtd}</span>
                    <button onClick={() => alterarQtdItem(it.produtoId, 1)} style={{ width: '28px', height: '28px', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: '20px', backgroundColor: '#0b1120', borderTop: '1px solid #1e293b' }}>
            <button 
              disabled={mesaAtiva.itens.length === 0}
              onClick={() => setModalPagamento(true)}
              style={{ width: '100%', padding: '16px', borderRadius: '12px', fontSize: '16px', fontWeight: 900, cursor: mesaAtiva.itens.length === 0 ? 'not-allowed' : 'pointer', background: mesaAtiva.itens.length === 0 ? '#1e293b' : 'linear-gradient(135deg, #10b981, #059669)', color: mesaAtiva.itens.length === 0 ? '#64748b' : '#fff', border: 'none', boxShadow: mesaAtiva.itens.length === 0 ? 'none' : '0 10px 25px rgba(16, 185, 129, 0.3)' }}
            >
              💳 FECHAR CONTA • {fmt(totalMesa)}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE PAGAMENTO RÁPIDO */}
      {modalPagamento && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #10b981', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '400px' }}>
            <h2 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '24px', fontWeight: 900, textAlign: 'center' }}>Finalizar Mesa</h2>
            <div style={{ fontSize: '32px', fontWeight: 900, color: '#34d399', textAlign: 'center', marginBottom: '24px' }}>{fmt(totalMesa)}</div>
            
            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Forma de Pagamento</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '24px' }}>
              {['Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Pix'].map(mt => (
                <button 
                  key={mt} onClick={() => setMetodoPgto(mt)}
                  style={{ padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', border: `1px solid ${metodoPgto === mt ? '#10b981' : '#334155'}`, backgroundColor: metodoPgto === mt ? 'rgba(16, 185, 129, 0.1)' : '#020617', color: metodoPgto === mt ? '#34d399' : '#94a3b8' }}
                >
                  {mt}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalPagamento(false)} style={{ flex: 1, padding: '16px', backgroundColor: '#020617', border: '1px solid #f43f5e', color: '#fb7185', borderRadius: '12px', fontWeight: 900, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={processarPagamento} style={{ flex: 2, padding: '16px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer' }}>Confirmar Recebimento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}