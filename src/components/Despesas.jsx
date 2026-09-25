import React, { useState } from 'react';

export default function Despesas({ despesas, setDespesas, fmt, tx, patenteUsuario, moeda, converterParaBRL }) {
  const [modalAberto, setModalAberto] = useState(false);
  const [despesaEmEdicao, setDespesaEmEdicao] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('pendente'); // pendente, paga, todas

  // Form states
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('Fornecedor');
  const [valorInput, setValorInput] = useState('');
  const [dataVencimento, setDataVencimento] = useState(new Date().toISOString().split('T')[0]);

  // Pagamento states
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false);
  const [despesaParaPagar, setDespesaParaPagar] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState('Dinheiro / Caixa');

  if (patenteUsuario !== 'gerencia') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#64748b' }}>
        <span style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</span>
        <h2 style={{ color: '#f8fafc' }}>Acesso Restrito</h2>
        <p>Apenas a Gerência tem acesso ao módulo financeiro de Contas a Pagar.</p>
      </div>
    );
  }

  const abrirNovaDespesa = () => {
    setDespesaEmEdicao(null);
    setDescricao('');
    setCategoria('Fornecedor');
    setValorInput('');
    setDataVencimento(new Date().toISOString().split('T')[0]);
    setModalAberto(true);
  };

  const salvarDespesa = () => {
    if (!descricao.trim()) return alert('Informe a descrição da despesa.');
    const valBRL = converterParaBRL(parseFloat(valorInput.replace(',', '.')) || 0, moeda);
    if (valBRL <= 0) return alert('Informe um valor válido maior que zero.');

    const novaDespesa = {
      id: despesaEmEdicao ? despesaEmEdicao.id : `DESP-${Date.now()}`,
      descricao,
      categoria,
      valorBRL: valBRL,
      dataVencimento,
      status: despesaEmEdicao ? despesaEmEdicao.status : 'pendente',
      dataPagamento: despesaEmEdicao ? despesaEmEdicao.dataPagamento : null,
      formaPagamento: despesaEmEdicao ? despesaEmEdicao.formaPagamento : null
    };

    if (despesaEmEdicao) {
      setDespesas(despesas.map(d => d.id === despesaEmEdicao.id ? novaDespesa : d));
    } else {
      setDespesas([novaDespesa, ...despesas]);
    }
    setModalAberto(false);
  };

  const abrirPagamento = (despesa) => {
    setDespesaParaPagar(despesa);
    setFormaPagamento('Dinheiro / Caixa');
    setModalPagamentoAberto(true);
  };

  const confirmarPagamento = () => {
    setDespesas(despesas.map(d => {
      if (d.id === despesaParaPagar.id) {
        return { 
          ...d, 
          status: 'paga', 
          dataPagamento: new Date().toISOString().split('T')[0],
          formaPagamento 
        };
      }
      return d;
    }));
    setModalPagamentoAberto(false);
    setDespesaParaPagar(null);
  };

  const excluirDespesa = (id) => {
    if (window.confirm('Tem certeza que deseja excluir este registro permanentemente?')) {
      setDespesas(despesas.filter(d => d.id !== id));
    }
  };

  const despesasFiltradas = despesas.filter(d => filtroStatus === 'todas' ? true : d.status === filtroStatus);
  
  const totalFiltradoBRL = despesasFiltradas.reduce((acc, d) => acc + d.valorBRL, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Contas a Pagar & Despesas</h2>
          <span style={{ fontSize: '13px', color: '#64748b' }}>Gestão de custos fixos, variáveis e fornecedores.</span>
        </div>
        <button onClick={abrirNovaDespesa} style={{ background: 'linear-gradient(135deg, #e11d48, #be123c)', border: 'none', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.3)' }}>
          + Lançar Nova Despesa
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button onClick={() => setFiltroStatus('pendente')} style={{ flex: 1, padding: '14px', backgroundColor: filtroStatus === 'pendente' ? '#451a03' : '#0b1120', border: `1px solid ${filtroStatus === 'pendente' ? '#d97706' : '#1e293b'}`, color: filtroStatus === 'pendente' ? '#fbbf24' : '#64748b', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>⏳ Pendentes</button>
        <button onClick={() => setFiltroStatus('paga')} style={{ flex: 1, padding: '14px', backgroundColor: filtroStatus === 'paga' ? '#064e3b' : '#0b1120', border: `1px solid ${filtroStatus === 'paga' ? '#10b981' : '#1e293b'}`, color: filtroStatus === 'paga' ? '#34d399' : '#64748b', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>✅ Pagas</button>
        <button onClick={() => setFiltroStatus('todas')} style={{ flex: 1, padding: '14px', backgroundColor: filtroStatus === 'todas' ? '#1e1b4b' : '#0b1120', border: `1px solid ${filtroStatus === 'todas' ? '#6366f1' : '#1e293b'}`, color: filtroStatus === 'todas' ? '#a5b4fc' : '#64748b', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>📋 Todas as Despesas</button>
      </div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e293b', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#020617' }}>
              <th style={{ padding: '16px 20px' }}>Vencimento</th>
              <th style={{ padding: '16px 12px' }}>Descrição</th>
              <th style={{ padding: '16px 12px' }}>Categoria</th>
              <th style={{ padding: '16px 12px', textAlign: 'right' }}>Valor (R$)</th>
              <th style={{ padding: '16px 12px', textAlign: 'center' }}>Status</th>
              <th style={{ padding: '16px 20px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {despesasFiltradas.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>Nenhuma despesa encontrada nesta visão.</td></tr>
            ) : (
              despesasFiltradas.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '16px 20px', color: '#cbd5e1', fontWeight: d.status === 'pendente' ? 800 : 500 }}>
                    {d.dataVencimento.split('-').reverse().join('/')}
                  </td>
                  <td style={{ padding: '16px 12px', color: '#f8fafc', fontWeight: 700 }}>
                    {d.descricao}
                    {d.status === 'paga' && <div style={{ fontSize: '10px', color: '#10b981', marginTop: '4px' }}>Pago em: {d.dataPagamento?.split('-').reverse().join('/')} via {d.formaPagamento}</div>}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{ backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', padding: '4px 8px', borderRadius: '6px', fontSize: '11px' }}>{d.categoria}</span>
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: d.status === 'paga' ? '#64748b' : '#f43f5e', fontSize: '15px' }}>
                    {fmt(d.valorBRL, 'BRL')}
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                    {d.status === 'paga' 
                      ? <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>Paga</span>
                      : <span style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>Pendente</span>}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                    {d.status === 'pendente' && (
                      <button onClick={() => abrirPagamento(d)} style={{ backgroundColor: '#064e3b', border: '1px solid #10b981', color: '#34d399', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', marginRight: '8px' }}>Baixar Pgto</button>
                    )}
                    <button onClick={() => excluirDespesa(d.id)} style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#f43f5e', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Excluir</button>
                  </td>
                </tr>
              ))
            )}
            {/* Linha de Total */}
            {despesasFiltradas.length > 0 && (
              <tr style={{ backgroundColor: '#020617' }}>
                <td colSpan="3" style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 800, color: '#94a3b8' }}>TOTAL DESTA VISÃO:</td>
                <td style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 900, color: filtroStatus === 'paga' ? '#64748b' : '#f43f5e', fontSize: '16px' }}>{fmt(totalFiltradoBRL, 'BRL')}</td>
                <td colSpan="2"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL NOVA DESPESA */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #f43f5e', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '28px', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div><span style={{ fontSize: '11px', fontWeight: 800, color: '#fb7185', textTransform: 'uppercase' }}>Contas a Pagar</span><h3 style={{ fontSize: '20px', fontWeight: 900, margin: '2px 0 0 0' }}>Lançar Nova Despesa</h3></div>
              <button onClick={() => setModalAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Descrição da Despesa</label>
                <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Pagamento Fornecedor Tintas" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Valor ({moeda})</label>
                  <input type="text" value={valorInput} onChange={e => setValorInput(e.target.value)} placeholder="0.00" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #f43f5e', borderRadius: '8px', color: '#fb7185', fontWeight: 900, fontSize: '16px', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Data de Vencimento</label>
                  <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800 }}>Categoria</label>
                <select value={categoria} onChange={e => setCategoria(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}>
                  <option value="Fornecedor">📦 Fornecedor de Mercadorias</option>
                  <option value="Infraestrutura">🏢 Aluguel / Água / Luz / Net</option>
                  <option value="Salários">👥 Salários / Comissões</option>
                  <option value="Impostos">⚖️ Impostos / Taxas Fiscais</option>
                  <option value="Marketing">📢 Marketing / Publicidade</option>
                  <option value="Outros">🔄 Outras Despesas</option>
                </select>
              </div>
            </div>

            <button onClick={salvarDespesa} style={{ width: '100%', background: 'linear-gradient(135deg, #e11d48, #be123c)', border: 'none', color: '#fff', padding: '16px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(225, 29, 72, 0.3)' }}>
              Registrar Despesa no Sistema
            </button>
          </div>
        </div>
      )}

      {/* MODAL BAIXAR PAGAMENTO */}
      {modalPagamentoAberto && despesaParaPagar && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500 }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #10b981', borderRadius: '24px', width: '100%', maxWidth: '400px', padding: '28px', color: '#fff' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 16px 0', color: '#34d399' }}>Baixar Pagamento</h3>
            <div style={{ backgroundColor: '#020617', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>{despesaParaPagar.descricao}</div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#f8fafc' }}>{fmt(despesaParaPagar.valorBRL, 'BRL')}</div>
            </div>
            
            <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800 }}>De onde saiu o dinheiro?</label>
            <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '12px', outline: 'none', marginTop: '8px', marginBottom: '24px', boxSizing: 'border-box' }}>
              <option value="Dinheiro / Gaveta">💵 Dinheiro da Gaveta do Caixa</option>
              <option value="Pix / Banco">🏦 Transferência Bancária / Pix</option>
              <option value="Cartão Corporativo">💳 Cartão Corporativo</option>
            </select>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalPagamentoAberto(false)} style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #1e293b', color: '#94a3b8', padding: '12px', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarPagamento} style={{ flex: 2, background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#ffffff', padding: '12px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}>Confirmar Pago</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}