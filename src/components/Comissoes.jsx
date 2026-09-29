import React, { useState } from 'react';

export default function Comissoes({ historicoVendas, fmt, tx, patenteUsuario, operadorAtivo }) {
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0, 7)); // 'YYYY-MM'

  // As vendas consideradas para comissão são apenas as "concluídas"
  const vendasElegiveis = (historicoVendas || []).filter(v => v.estado === 'concluida' && v.dataHora.startsWith(filtroMes));

  // 🛡️ REGRAS DE PRIVACIDADE
  // Se for administrador (gerencia), vê todos. Se não, vê apenas as suas próprias vendas.
  const idVendedorLogado = operadorAtivo?.id || 'admin';
  const vendasVisiveis = patenteUsuario === 'gerencia' 
    ? vendasElegiveis 
    : vendasElegiveis.filter(v => String(v.vendedorId) === String(idVendedorLogado));

  const relatorioComissoes = vendasVisiveis.reduce((acc, venda) => {
    const id = venda.vendedorId || 'desconhecido';
    if (!acc[id]) {
      acc[id] = { nome: venda.vendedorNome || 'Desconhecido', totalVendasBRL: 0, totalLucroBRL: 0, comissaoEstimadaBRL: 0 };
    }
    
    acc[id].totalVendasBRL += (venda.totalBRL || 0);
    acc[id].totalLucroBRL += (venda.lucroBRL || 0);
    
    // Regra provisória de comissão (ex: 5% sobre o lucro líquido da venda)
    const taxaComissao = 0.05; 
    acc[id].comissaoEstimadaBRL += ((venda.lucroBRL || 0) * taxaComissao);
    
    return acc;
  }, {});

  const listaRelatorio = Object.values(relatorioComissoes).sort((a, b) => b.comissaoEstimadaBRL - a.comissaoEstimadaBRL);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>{tx('Extrato de Comissões', 'Extracto de Comisiones', 'Commission Statement')}</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {patenteUsuario === 'gerencia' ? 'Visão global da equipa.' : 'Acesso restrito. Visão individual.'}
          </span>
        </div>
        <input 
          type="month" 
          value={filtroMes} 
          onChange={(e) => setFiltroMes(e.target.value)} 
          style={{ backgroundColor: '#020617', color: '#fff', border: '1px solid #334155', borderRadius: '8px', padding: '10px 16px', outline: 'none', fontWeight: 900 }}
        />
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {listaRelatorio.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>Sem registo de vendas finalizadas neste período.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <th style={{ padding: '16px 8px' }}>Operador</th>
                  <th style={{ padding: '16px 8px', textAlign: 'right' }}>Vendas (Faturamento)</th>
                  <th style={{ padding: '16px 8px', textAlign: 'right' }}>Lucro Gerado</th>
                  <th style={{ padding: '16px 8px', textAlign: 'right', color: '#34d399' }}>Comissão Ganhos</th>
                </tr>
              </thead>
              <tbody>
                {listaRelatorio.map((linha, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px', color: '#cbd5e1' }}>
                    <td style={{ padding: '16px 8px', fontWeight: 800, color: '#f8fafc' }}>{linha.nome}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right' }}>{fmt(linha.totalVendasBRL)}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right' }}>{fmt(linha.totalLucroBRL)}</td>
                    <td style={{ padding: '16px 8px', textAlign: 'right', fontWeight: 900, color: '#34d399' }}>{fmt(linha.comissaoEstimadaBRL)}</td>
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
