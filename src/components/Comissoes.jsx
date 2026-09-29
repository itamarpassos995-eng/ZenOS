import React, { useState, useEffect } from 'react';

export default function Comissoes({ historicoVendas, fmt, tx, patenteUsuario, operadorAtivo, regrasDesconto }) {
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [mostrarConfig, setMostrarConfig] = useState(false);
  
  const [regrasComissao, setRegrasComissao] = useState(() => {
    try {
      const salvo = localStorage.getItem('zenos_regras_comissao');
      if (salvo) return JSON.parse(salvo);
    } catch(e) {}
    // Valores padrão de fábrica se o Admin não tiver configurado
    return { pctVerde: 5, pctAmarelo: 3, pctVermelho: 1, bonusFixo: 0 };
  });

  useEffect(() => {
    localStorage.setItem('zenos_regras_comissao', JSON.stringify(regrasComissao));
  }, [regrasComissao]);

  // 🛡️ REGRA 1: Só conta para comissão vendas "liquidadas no caixa" (concluida). Pré-pedido não conta.
  const vendasElegiveis = (historicoVendas || []).filter(v => v.estado === 'concluida' && v.dataHora.startsWith(filtroMes));

  // 🛡️ REGRA 2: Privacidade. Vendedor só vê a própria meta e ganhos. O Admin vê a equipa toda.
  const idVendedorLogado = operadorAtivo?.id || 'admin';
  const ehAdmin = patenteUsuario === 'gerencia';

  const vendasVisiveis = ehAdmin 
    ? vendasElegiveis 
    : vendasElegiveis.filter(v => String(v.vendedorId) === String(idVendedorLogado));

  const margemIdeal = regrasDesconto?.margemIdeal ?? 30; 
  const margemMinima = regrasDesconto?.margemMinima ?? 15;

  // 🛡️ REGRA 3: O Motor de Comissões por Semáforo
  const relatorio = vendasVisiveis.reduce((acc, v) => {
    const id = v.vendedorId || 'desconhecido';
    if (!acc[id]) {
      acc[id] = { nome: v.vendedorNome || 'Desconhecido', totalVendas: 0, totalLucro: 0, comissaoVerde: 0, comissaoAmarelo: 0, comissaoVermelho: 0, totalBonus: 0, comissaoTotal: 0, qtdVerde: 0, qtdAmarelo: 0, qtdVermelho: 0, totalAtendimentos: 0 };
    }

    acc[id].totalAtendimentos++;
    acc[id].totalVendas += (v.totalBRL || 0);
    acc[id].totalLucro += (v.lucroBRL || 0);
    
    const margemReal = v.totalBRL > 0 ? ((v.lucroBRL || 0) / v.totalBRL) * 100 : 0;
    
    let pctAplicada = 0;
    if (margemReal >= margemIdeal) {
      pctAplicada = parseFloat(regrasComissao.pctVerde) / 100;
      acc[id].qtdVerde++;
      acc[id].comissaoVerde += ((v.lucroBRL || 0) * pctAplicada);
    } else if (margemReal >= margemMinima) {
      pctAplicada = parseFloat(regrasComissao.pctAmarelo) / 100;
      acc[id].qtdAmarelo++;
      acc[id].comissaoAmarelo += ((v.lucroBRL || 0) * pctAplicada);
    } else {
      pctAplicada = parseFloat(regrasComissao.pctVermelho) / 100;
      acc[id].qtdVermelho++;
      acc[id].comissaoVermelho += ((v.lucroBRL || 0) * pctAplicada);
    }

    // Bônus fixo por atendimento convertido em venda
    const bonusVenda = parseFloat(regrasComissao.bonusFixo) || 0;
    acc[id].totalBonus += bonusVenda;

    acc[id].comissaoTotal = acc[id].comissaoVerde + acc[id].comissaoAmarelo + acc[id].comissaoVermelho + acc[id].totalBonus;

    return acc;
  }, {});

  const lista = Object.values(relatorio).sort((a,b) => b.comissaoTotal - a.comissaoTotal);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Extrato de Comissões', 'Extracto de Comisiones', 'Commission Statement')}</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {ehAdmin ? 'Acesso Gerencial: Visão global da equipa.' : 'Acesso Restrito: Suas metas e comissões do mês.'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {ehAdmin && (
            <button onClick={() => setMostrarConfig(!mostrarConfig)} style={{ backgroundColor: mostrarConfig ? '#1e293b' : '#020617', border: '1px solid #334155', color: '#f8fafc', padding: '10px 16px', borderRadius: '8px', fontWeight: 900, cursor: 'pointer' }}>
              ⚙️ Regras
            </button>
          )}
          <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} style={{ backgroundColor: '#020617', color: '#fff', border: '1px solid #334155', borderRadius: '8px', padding: '10px 16px', outline: 'none', fontWeight: 900 }} />
        </div>
      </div>

      {ehAdmin && mostrarConfig && (
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #38bdf8', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeIn 0.3s ease' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#38bdf8', fontWeight: 900 }}>Regras do Semáforo e Premiações</h3>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Defina a % que o vendedor ganha sobre o <b>lucro da venda</b> dependendo da margem praticada, e configure bónus diários.</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#34d399', fontWeight: 800 }}>% Comissão (Verde):</label>
              <input type="number" value={regrasComissao.pctVerde} onChange={e => setRegrasComissao({...regrasComissao, pctVerde: e.target.value})} style={{ width: '100%', padding: '12px', backgroundColor: '#020617', border: '1px solid #10b981', borderRadius: '8px', color: '#34d399', fontWeight: 900, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 800 }}>% Comissão (Amarelo):</label>
              <input type="number" value={regrasComissao.pctAmarelo} onChange={e => setRegrasComissao({...regrasComissao, pctAmarelo: e.target.value})} style={{ width: '100%', padding: '12px', backgroundColor: '#020617', border: '1px solid #f59e0b', borderRadius: '8px', color: '#fbbf24', fontWeight: 900, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#fb7185', fontWeight: 800 }}>% Comissão (Vermelho):</label>
              <input type="number" value={regrasComissao.pctVermelho} onChange={e => setRegrasComissao({...regrasComissao, pctVermelho: e.target.value})} style={{ width: '100%', padding: '12px', backgroundColor: '#020617', border: '1px solid #e11d48', borderRadius: '8px', color: '#fb7185', fontWeight: 900, outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#c084fc', fontWeight: 800 }}>Bônus Fixo / Venda (R$):</label>
              <input type="number" value={regrasComissao.bonusFixo} onChange={e => setRegrasComissao({...regrasComissao, bonusFixo: e.target.value})} placeholder="0.00" style={{ width: '100%', padding: '12px', backgroundColor: '#020617', border: '1px solid #9333ea', borderRadius: '8px', color: '#c084fc', fontWeight: 900, outline: 'none' }} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>As alterações feitas aqui aplicam-se imediatamente a todos os extratos deste mês.</div>
        </div>
      )}

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>Sem registo de comissões neste período. Feche vendas no caixa para gerar saldo.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <th style={{ padding: '16px 8px' }}>Operador</th>
                  <th style={{ padding: '16px 8px', textAlign: 'center' }}>Atendimentos</th>
                  <th style={{ padding: '16px 8px', textAlign: 'right' }}>Faturamento Real</th>
                  <th style={{ padding: '16px 8px', textAlign: 'center' }}>Rendimento (Semáforo)</th>
                  <th style={{ padding: '16px 8px', textAlign: 'right' }}>Bônus Extra</th>
                  <th style={{ padding: '16px 8px', textAlign: 'right', color: '#34d399' }}>Total a Receber</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((linha, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px', color: '#cbd5e1' }}>
                    <td style={{ padding: '16px 8px', fontWeight: 800, color: '#f8fafc' }}>{linha.nome}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'center', color: '#94a3b8' }}>{linha.totalAtendimentos}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right' }}>{fmt(linha.totalVendas)}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                        <span style={{ color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{linha.qtdVerde}</span>
                        <span style={{ color: '#fbbf24', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{linha.qtdAmarelo}</span>
                        <span style={{ color: '#fb7185', backgroundColor: 'rgba(244, 63, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{linha.qtdVermelho}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 8px', textAlign: 'right', color: '#c084fc' }}>{linha.totalBonus > 0 ? fmt(linha.totalBonus) : '-'}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 900, color: '#34d399', fontSize: '15px' }}>{fmt(linha.comissaoTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
