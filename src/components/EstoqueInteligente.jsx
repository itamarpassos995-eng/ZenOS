import React, { useState, useMemo } from 'react';

export default function EstoqueInteligente({ produtos, fmt }) {
  const [abaAtiva, setAbaAtiva] = useState('ruptura'); // 'ruptura', 'curvaABC', 'parado'

  // --- MOTORES DE CÁLCULO (Blindados e à prova de falhas) ---
  
  // 1. Alertas de Ruptura (Estoque Baixo)
  const produtosRuptura = useMemo(() => {
    return produtos
      .filter(p => p.estoque <= 5 && !p.usoUnicoEncomendado && p.tipoItem !== 'servico')
      .sort((a, b) => (a.estoque || 0) - (b.estoque || 0));
  }, [produtos]);

  // 2. Curva ABC (Baseada no Capital Imobilizado: Custo * Estoque)
  const curvaABC = useMemo(() => {
    const itensValidos = produtos.filter(p => p.estoque > 0 && p.custoBRL > 0 && p.tipoItem !== 'servico');
    
    // Calcula o valor total imobilizado de cada item
    const itensComValor = itensValidos.map(p => ({
      ...p,
      valorImobilizado: (p.custoBRL || 0) * (p.estoque || 0)
    }));

    // Ordena do maior valor para o menor
    itensComValor.sort((a, b) => b.valorImobilizado - a.valorImobilizado);

    const valorTotalEstoque = itensComValor.reduce((acc, item) => acc + item.valorImobilizado, 0);

    let somaAcumulada = 0;
    return itensComValor.map(item => {
      somaAcumulada += item.valorImobilizado;
      const percentualAcumulado = (somaAcumulada / valorTotalEstoque) * 100;
      
      let classificacao = 'C';
      if (percentualAcumulado <= 70) classificacao = 'A'; // Top 70% do capital
      else if (percentualAcumulado <= 90) classificacao = 'B'; // Próximos 20%
      
      return { ...item, classificacao, percentualAcumulado };
    });
  }, [produtos]);

  // 3. Capital Parado (Alto volume de estoque vs Custo)
  const produtosParados = useMemo(() => {
    return produtos
      .filter(p => p.estoque > 20 && p.tipoItem !== 'servico')
      .sort((a, b) => ((b.estoque * b.custoBRL) || 0) - ((a.estoque * a.custoBRL) || 0))
      .slice(0, 20); // Pega os 20 piores
  }, [produtos]);

  // Resumo Financeiro Global
  const totalImobilizado = curvaABC.reduce((acc, item) => acc + item.valorImobilizado, 0);
  const totalItensRuptura = produtosRuptura.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* CABEÇALHO DO DASHBOARD */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Inteligência de Estoque</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Análise preditiva, Curva ABC e Prevenção de Perdas</span>
        </div>
        <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', padding: '12px 20px', borderRadius: '12px', textAlign: 'right' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Capital Imobilizado (Custo)</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#38bdf8' }}>{fmt(totalImobilizado)}</div>
        </div>
      </div>

      {/* MENU DE NAVEGAÇÃO INTERNA */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #1e293b', paddingBottom: '16px' }}>
        <button 
          onClick={() => setAbaAtiva('ruptura')} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: abaAtiva === 'ruptura' ? 'rgba(251, 113, 133, 0.1)' : 'transparent', color: abaAtiva === 'ruptura' ? '#fb7185' : '#64748b', border: abaAtiva === 'ruptura' ? '1px solid rgba(251, 113, 133, 0.3)' : '1px solid transparent' }}
        >
          🚨 <span>Risco de Ruptura ({totalItensRuptura})</span>
        </button>
        <button 
          onClick={() => setAbaAtiva('curvaABC')} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: abaAtiva === 'curvaABC' ? 'rgba(56, 189, 248, 0.1)' : 'transparent', color: abaAtiva === 'curvaABC' ? '#38bdf8' : '#64748b', border: abaAtiva === 'curvaABC' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent' }}
        >
          📊 <span>Curva ABC (Capital)</span>
        </button>
        <button 
          onClick={() => setAbaAtiva('parado')} 
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', backgroundColor: abaAtiva === 'parado' ? 'rgba(245, 158, 11, 0.1)' : 'transparent', color: abaAtiva === 'parado' ? '#f59e0b' : '#64748b', border: abaAtiva === 'parado' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent' }}
        >
          🛑 <span>Capital Parado</span>
        </button>
      </div>

      {/* ÁREA DE CONTEÚDO (RENDERIZAÇÃO CONDICIONAL) */}
      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        
        {/* ABA: RISCO DE RUPTURA */}
        {abaAtiva === 'ruptura' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px' }}>Item (SKU)</th>
                <th style={{ padding: '16px 12px' }}>Fornecedor / Marca</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>Estoque Atual</th>
                <th style={{ padding: '16px 20px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {produtosRuptura.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#34d399', fontWeight: 800 }}>✅ Estoque saudável! Nenhum item em risco de ruptura.</td></tr>
              ) : (
                produtosRuptura.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#f8fafc' }}>{p.sku} - {p.nome}</td>
                    <td style={{ padding: '16px 12px', color: '#94a3b8' }}>{p.fornecedor || p.marca || 'Não informado'}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                      <span style={{ backgroundColor: p.estoque === 0 ? 'rgba(251, 113, 133, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: p.estoque === 0 ? '#fb7185' : '#fbbf24', padding: '4px 12px', borderRadius: '8px', fontWeight: 900, fontSize: '14px' }}>
                        {p.estoque} {p.unidadeMedida || 'UN'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: p.estoque === 0 ? '#fb7185' : '#fbbf24' }}>
                        {p.estoque === 0 ? '🚨 ZERADO - Comprar Urgente' : '⚠️ Pedido de Reposição Recomendado'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* ABA: CURVA ABC */}
        {abaAtiva === 'curvaABC' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px' }}>Curva</th>
                <th style={{ padding: '16px 12px' }}>Produto</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>Qtd. Estoque</th>
                <th style={{ padding: '16px 12px', textAlign: 'right' }}>Custo Un.</th>
                <th style={{ padding: '16px 20px', textAlign: 'right' }}>Capital Imobilizado</th>
              </tr>
            </thead>
            <tbody>
              {curvaABC.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Sem dados suficientes para calcular a Curva ABC.</td></tr>
              ) : (
                curvaABC.map(p => {
                  let corCurva = p.classificacao === 'A' ? '#10b981' : p.classificacao === 'B' ? '#38bdf8' : '#64748b';
                  let bgCurva = p.classificacao === 'A' ? 'rgba(16, 185, 129, 0.1)' : p.classificacao === 'B' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(100, 116, 139, 0.1)';
                  
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ backgroundColor: bgCurva, color: corCurva, border: `1px solid ${corCurva}`, padding: '4px 10px', borderRadius: '6px', fontWeight: 900, fontSize: '12px' }}>
                          CLASSE {p.classificacao}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', fontWeight: 700, color: '#f8fafc' }}>{p.nome}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'center', color: '#cbd5e1' }}>{p.estoque}</td>
                      <td style={{ padding: '16px 12px', textAlign: 'right', color: '#94a3b8' }}>{fmt(p.custoBRL)}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 900, color: corCurva }}>
                        {fmt(p.valorImobilizado)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}

        {/* ABA: CAPITAL PARADO */}
        {abaAtiva === 'parado' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '16px 20px' }}>Produto Encalhado (Top 20)</th>
                <th style={{ padding: '16px 12px', textAlign: 'center' }}>Estoque Alto</th>
                <th style={{ padding: '16px 20px', textAlign: 'right' }}>Dinheiro Travado</th>
                <th style={{ padding: '16px 20px', textAlign: 'center' }}>Sugestão do Sistema</th>
              </tr>
            </thead>
            <tbody>
              {produtosParados.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#34d399', fontWeight: 800 }}>✅ Excelente! Sem excessos alarmantes de estoque.</td></tr>
              ) : (
                produtosParados.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 700, color: '#f8fafc' }}>{p.nome}</td>
                    <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                      <span style={{ color: '#f59e0b', fontWeight: 900, fontSize: '14px' }}>{p.estoque} UN</span>
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 900, color: '#fb7185' }}>
                      {fmt((p.custoBRL || 0) * p.estoque)}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                      <span style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>
                        📢 Criar Promoção / Oferta
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

      </div>
    </div>
  );
}