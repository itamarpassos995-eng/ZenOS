import React, { useMemo } from 'react';

export default function DashboardMobile({ historicoVendas, despesas, clientes, produtos, fmt, tx, patenteUsuario }) {
  // Bloqueio Absoluto: Vendedores não podem ver a saúde financeira da empresa
  if (patenteUsuario !== 'gerencia') {
    return <div style={{ color: '#fb7185', textAlign: 'center', padding: '40px', fontSize: '18px', fontWeight: 900 }}>Acesso Restrito à Direção.</div>;
  }

  // Motor Analítico: Processamento de Dados para o CEO
  const painel = useMemo(() => {
    const vendasValidas = historicoVendas.filter(v => v.estado !== 'cancelada');
    
    // Para garantir que o dashboard tem sempre dados (mesmo em dias de teste),
    // vamos olhar para as últimas 50 vendas globais para os insights principais.
    const amostraVendas = vendasValidas.slice(0, 50);
    
    const faturamentoTotal = amostraVendas.reduce((acc, v) => acc + (v.totalBRL || 0), 0);
    const lucroTotal = amostraVendas.reduce((acc, v) => acc + (v.lucroBRL || 0), 0);
    const ticketMedio = amostraVendas.length > 0 ? faturamentoTotal / amostraVendas.length : 0;
    const margemMedia = faturamentoTotal > 0 ? (lucroTotal / faturamentoTotal) * 100 : 0;

    const fiadoTotal = clientes.reduce((acc, c) => acc + (parseFloat(c.saldoDevedorBRL) || 0), 0);
    const despesasPagas = despesas.filter(d => d.status === 'paga').reduce((acc, d) => acc + (parseFloat(d.valorBRL) || 0), 0);
    const lucroLiquidoReal = lucroTotal - despesasPagas;

    // Descobrir o Campeão de Vendas
    const contagemItens = {};
    amostraVendas.forEach(v => {
      v.itens.forEach(it => {
        contagemItens[it.nome] = (contagemItens[it.nome] || 0) + it.qtd;
      });
    });
    
    let topProduto = 'Ainda sem dados';
    let maxQtd = 0;
    Object.entries(contagemItens).forEach(([nome, qtd]) => {
      if (qtd > maxQtd) { maxQtd = qtd; topProduto = nome; }
    });

    // --- ASSISTENTE DE DECISÃO (Insights Automáticos) ---
    const insights = [];
    
    // Insight 1: Margem
    if (margemMedia >= 35) {
      insights.push({ icone: '🚀', cor: '#10b981', titulo: 'Margem Saudável', texto: `Sua margem está em ${margemMedia.toFixed(1)}%. Excelente precificação e poucos descontos!` });
    } else if (margemMedia > 0) {
      insights.push({ icone: '⚠️', cor: '#f59e0b', titulo: 'Atenção aos Descontos', texto: `A margem média caiu para ${margemMedia.toFixed(1)}%. Verifique se a equipa não está a dar descontos a mais.` });
    }

    // Insight 2: Fiado vs Faturamento
    if (fiadoTotal > (faturamentoTotal * 0.5) && faturamentoTotal > 0) {
      insights.push({ icone: '🛑', cor: '#ef4444', titulo: 'Risco de Crédito Alto', texto: `O volume de dinheiro na rua (fiado) está perigosamente alto em relação ao seu volume de vendas.` });
    } else {
      insights.push({ icone: '💸', cor: '#38bdf8', titulo: 'Controle de Inadimplência', texto: `O limite de fiados parece estar sob controlo em relação à saúde do caixa.` });
    }

    // Insight 3: Produto Destaque
    if (maxQtd > 0) {
      insights.push({ icone: '⭐', cor: '#fbbf24', titulo: 'Campeão de Vendas', texto: `O item "${topProduto}" é o seu motor atual. Garanta que o estoque no Galpão está cheio!` });
    }

    return {
      faturamentoTotal, lucroLiquidoReal, ticketMedio, margemMedia, fiadoTotal, insights, numVendas: amostraVendas.length
    };
  }, [historicoVendas, despesas, clientes]);

  // Estilização Mobile-First (Emula um ecrã de telemóvel)
  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '32px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', position: 'relative' }}>
        
        {/* HEADER DA APP MOBILE */}
        <div style={{ backgroundColor: '#0b1120', padding: '30px 24px 20px 24px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '16px', fontWeight: 900, color: '#f8fafc', letterSpacing: '1px' }}>Zênite<span style={{ color: '#f59e0b' }}>CEO</span></span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
              <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 800 }}>LIVE</span>
            </div>
          </div>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Faturamento (Últ. {painel.numVendas} vendas)</span>
          <div style={{ fontSize: '36px', fontWeight: 900, color: '#ffffff', letterSpacing: '-1px' }}>
            {fmt(painel.faturamentoTotal)}
          </div>
        </div>

        {/* CORPO ROLÁVEL */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* CARDS DE KPIS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ backgroundColor: '#064e3b', border: '1px solid #10b981', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '20px', marginBottom: '4px' }}>🏆</span>
              <span style={{ fontSize: '10px', color: '#a7f3d0', fontWeight: 800, textTransform: 'uppercase' }}>Lucro Real</span>
              <span style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>{fmt(painel.lucroLiquidoReal)}</span>
            </div>
            <div style={{ backgroundColor: '#451a03', border: '1px solid #d97706', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '20px', marginBottom: '4px' }}>📒</span>
              <span style={{ fontSize: '10px', color: '#fde68a', fontWeight: 800, textTransform: 'uppercase' }}>Na Praça (Fiado)</span>
              <span style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>{fmt(painel.fiadoTotal)}</span>
            </div>
            <div style={{ backgroundColor: '#1e1b4b', border: '1px solid #6366f1', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '20px', marginBottom: '4px' }}>🛒</span>
              <span style={{ fontSize: '10px', color: '#c7d2fe', fontWeight: 800, textTransform: 'uppercase' }}>Ticket Médio</span>
              <span style={{ fontSize: '18px', fontWeight: 900, color: '#fff' }}>{fmt(painel.ticketMedio)}</span>
            </div>
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '20px', marginBottom: '4px' }}>🎯</span>
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Margem Média</span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#38bdf8' }}>{painel.margemMedia.toFixed(1)}%</span>
            </div>
          </div>

          {/* INSIGHTS - ASSISTENTE DE DECISÃO */}
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '18px' }}>🧠</span>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#e2e8f0', fontWeight: 900 }}>Assistente de Decisão</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {painel.insights.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '12px', padding: '20px' }}>Aguardando mais dados de vendas para gerar análises.</div>
              ) : (
                painel.insights.map((insight, index) => (
                  <div key={index} style={{ backgroundColor: '#0b1120', borderLeft: `4px solid ${insight.cor}`, borderRadius: '12px', padding: '16px', display: 'flex', gap: '12px' }}>
                    <div style={{ fontSize: '24px' }}>{insight.icone}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ color: insight.cor, fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>{insight.titulo}</span>
                      <span style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.5 }}>{insight.texto}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* BARRA DE NAVEGAÇÃO INFERIOR ESTILO iOS */}
        <div style={{ backgroundColor: '#0b1120', borderTop: '1px solid #1e293b', padding: '16px 24px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '40%', height: '5px', backgroundColor: '#334155', borderRadius: '10px' }}></div>
        </div>

      </div>
    </div>
  );
}