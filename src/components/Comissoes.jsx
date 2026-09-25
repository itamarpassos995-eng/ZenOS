import React, { useState, useMemo } from 'react';

export default function Comissoes({ historicoVendas, fmt, tx, patenteUsuario }) {
  const [vendedorSelecionado, setVendedorSelecionado] = useState('todos');
  const [tipoRegra, setTipoRegra] = useState('escalonada'); // 'escalonada' ou 'fixa'
  
  // Bloqueio de segurança: Apenas gerência acede a este ecrã
  if (patenteUsuario !== 'gerencia') {
    return <div style={{ color: '#fb7185', textAlign: 'center', padding: '40px', fontSize: '18px', fontWeight: 900 }}>Acesso Restrito à Gerência.</div>;
  }

  // Obter lista única de vendedores que fizeram vendas
  const vendedores = useMemo(() => {
    const lista = historicoVendas.filter(v => v.estado !== 'cancelada').map(v => v.operador || 'Desconhecido');
    return [...new Set(lista)];
  }, [historicoVendas]);

  // Motor de Cálculo de Comissão
  const relatorio = useMemo(() => {
    let totalVendido = 0;
    let totalComissao = 0;
    let totalLucroLoja = 0;

    const vendasFiltradas = historicoVendas
      .filter(v => v.estado !== 'cancelada' && (vendedorSelecionado === 'todos' || v.operador === vendedorSelecionado))
      .map(venda => {
        const valorVenda = venda.totalBRL || 0;
        const lucroVenda = venda.lucroBRL || 0;
        const margem = valorVenda > 0 ? (lucroVenda / valorVenda) * 100 : 0;
        
        let comissao = 0;
        let aviso = '';

        if (tipoRegra === 'fixa') {
          // Regra Clássica: 3% sobre tudo
          comissao = valorVenda * 0.03; 
          aviso = '3% Fixo';
        } else {
          // Regra Escalonada (Inteligente): Protege o lucro do dono
          if (margem >= 40) {
            comissao = valorVenda * 0.05; // 5% (Prêmio por vender sem desconto)
            aviso = '5% (Margem Alta)';
          } else if (margem >= 20) {
            comissao = valorVenda * 0.02; // 2% (Deu algum desconto)
            aviso = '2% (Margem Média)';
          } else {
            comissao = 0; // 0% (Deu desconto demais, lucro destruído)
            aviso = '0% (Desconto Excessivo)';
          }
        }

        totalVendido += valorVenda;
        totalComissao += comissao;
        totalLucroLoja += lucroVenda;

        return { ...venda, margem, comissao, aviso };
      });

    return { vendasFiltradas, totalVendido, totalComissao, totalLucroLoja };
  }, [historicoVendas, vendedorSelecionado, tipoRegra]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* CABEÇALHO LIMPO E DIRETO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Acerto de Comissões</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Pagamento da equipa comercial de forma simples e justa</span>
        </div>
      </div>

      {/* PAINEL DE CONTROLO SUPER SIMPLES */}
      <div style={{ display: 'flex', gap: '20px', backgroundColor: '#0b1120', border: '1px solid #1e293b', padding: '24px', borderRadius: '16px', alignItems: 'center' }}>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>1. Escolha o Vendedor</label>
          <select 
            value={vendedorSelecionado} 
            onChange={(e) => setVendedorSelecionado(e.target.value)}
            style={{ padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', color: '#fff', borderRadius: '10px', fontSize: '14px', fontWeight: 800, outline: 'none' }}
          >
            <option value="todos">Mostrar Toda a Equipa</option>
            {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>2. Regra de Pagamento</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setTipoRegra('escalonada')}
              style={{ flex: 1, padding: '14px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', backgroundColor: tipoRegra === 'escalonada' ? '#1e1b4b' : '#020617', color: tipoRegra === 'escalonada' ? '#818cf8' : '#64748b', border: `1px solid ${tipoRegra === 'escalonada' ? '#6366f1' : '#1e293b'}` }}
            >
              🛡️ Protege Lucro (0% a 5%)
            </button>
            <button 
              onClick={() => setTipoRegra('fixa')}
              style={{ flex: 1, padding: '14px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', backgroundColor: tipoRegra === 'fixa' ? '#082f49' : '#020617', color: tipoRegra === 'fixa' ? '#38bdf8' : '#64748b', border: `1px solid ${tipoRegra === 'fixa' ? '#0284c7' : '#1e293b'}` }}
            >
              🎯 Fixa (3% Fixo)
            </button>
          </div>
        </div>
      </div>

      {/* BLOCOS GIGANTES DE RESUMO (Fácil leitura) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
        <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Total Vendido pelo Operador</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#f8fafc', marginTop: '8px' }}>{fmt(relatorio.totalVendido)}</div>
        </div>
        <div style={{ backgroundColor: '#451a03', border: '1px solid #b45309', borderRadius: '16px', padding: '24px', textAlign: 'center', boxShadow: '0 10px 25px rgba(180, 83, 9, 0.1)' }}>
          <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 800, textTransform: 'uppercase' }}>Comissão a Pagar (Dinheiro)</span>
          <div style={{ fontSize: '32px', fontWeight: 900, color: '#fef3c7', marginTop: '8px' }}>{fmt(relatorio.totalComissao)}</div>
        </div>
        <div style={{ backgroundColor: '#064e3b', border: '1px solid #10b981', borderRadius: '16px', padding: '24px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#a7f3d0', fontWeight: 800, textTransform: 'uppercase' }}>Lucro Bruto Retido p/ Loja</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#34d399', marginTop: '8px' }}>{fmt(relatorio.totalLucroLoja)}</div>
        </div>
      </div>

      {/* TABELA DE EXTRATO PARA TRANSPARÊNCIA */}
      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', backgroundColor: '#070d19' }}>
          <h3 style={{ margin: 0, fontSize: '14px', color: '#cbd5e1', fontWeight: 800 }}>Extrato Detalhado de Vendas</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
              <th style={{ padding: '16px 20px' }}>Data / Vendedor</th>
              <th style={{ padding: '16px 12px' }}>Cliente</th>
              <th style={{ padding: '16px 12px', textAlign: 'right' }}>Valor da Venda</th>
              <th style={{ padding: '16px 12px', textAlign: 'center' }}>Margem Alcançada</th>
              <th style={{ padding: '16px 20px', textAlign: 'right' }}>Comissão Paga</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.vendasFiltradas.length === 0 ? (
              <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontWeight: 800 }}>Nenhuma venda encontrada para este filtro.</td></tr>
            ) : (
              relatorio.vendasFiltradas.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <div style={{ fontWeight: 800, color: '#f8fafc' }}>{v.operador}</div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>{v.dataHora}</div>
                  </td>
                  <td style={{ padding: '16px 12px', color: '#cbd5e1', fontWeight: 600 }}>{v.clienteNome}</td>
                  <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>{fmt(v.totalBRL)}</td>
                  <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: v.margem >= 40 ? '#10b981' : v.margem >= 20 ? '#f59e0b' : '#ef4444' }}>
                      {v.margem.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, color: v.comissao > 0 ? '#fbbf24' : '#64748b', fontSize: '15px' }}>{fmt(v.comissao)}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{v.aviso}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}