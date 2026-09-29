import React, { useState } from 'react';

export default function Fornecedores({ fornecedores, setFornecedores, moeda, tx }) {
  const [termoBusca, setTermoBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [fornecedorEmEdicao, setFornecedorEmEdicao] = useState(null);
  
  // Detecção da legislação fiscal baseada na moeda
  const eParaguai = moeda === 'PYG';
  const labelDocumento = eParaguai ? 'RUC / C.I' : 'CNPJ / CPF';

  const [form, setForm] = useState({
    nome: '', documento: '', telefone: '', email: '', endereco: '', cidade: '', pais: eParaguai ? 'PY' : 'BR', observacoes: ''
  });

  const fornecedoresFiltrados = (fornecedores || []).filter(f => {
    const texto = `${f.nome} ${f.documento} ${f.cidade}`.toLowerCase();
    return texto.includes(termoBusca.toLowerCase());
  });

  const abrirNovo = () => {
    setFornecedorEmEdicao(null);
    setForm({ nome: '', documento: '', telefone: '', email: '', endereco: '', cidade: '', pais: eParaguai ? 'PY' : 'BR', observacoes: '' });
    setModalAberto(true);
  };

  const abrirEdicao = (f) => {
    setFornecedorEmEdicao(f);
    setForm({ ...f });
    setModalAberto(true);
  };

  const salvar = () => {
    if (!form.nome.trim()) return alert(tx('O Nome/Razão Social é obrigatório.', 'El Nombre/Razón Social es obligatorio.', 'Name is required.'));
    
    const dados = { ...form };
    
    if (fornecedorEmEdicao) {
      setFornecedores(fornecedores.map(f => f.id === fornecedorEmEdicao.id ? { ...f, ...dados } : f));
    } else {
      dados.id = `FORN-${Date.now()}`;
      dados.dataCadastro = new Date().toISOString();
      setFornecedores([dados, ...fornecedores]);
    }
    setModalAberto(false);
  };

  const excluir = (id) => {
    if (window.confirm(tx('Tem certeza que deseja excluir este fornecedor?', '¿Eliminar este proveedor?', 'Delete this supplier?'))) {
      setFornecedores(fornecedores.filter(f => f.id !== id));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* CABEÇALHO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '28px' }}>🏭</span> {tx('Gestão de Fornecedores', 'Gestión de Proveedores', 'Suppliers')}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>Base de fabricantes e distribuidores</p>
        </div>
        <button onClick={abrirNovo} style={{ background: 'linear-gradient(135deg, #7e22ce, #6b21a8)', color: '#fff', border: 'none', padding: '14px 24px', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 15px rgba(126, 34, 206, 0.4)' }}>
          + {tx('Novo Fornecedor', 'Nuevo Proveedor', 'New Supplier')}
        </button>
      </div>

      {/* BARRA DE BUSCA */}
      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '16px', display: 'flex', gap: '12px' }}>
        <input 
          type="text" placeholder={tx('Buscar por nome, documento, cidade...', 'Buscar...', 'Search...')} 
          value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)}
          style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#f8fafc', padding: '14px 20px', outline: 'none', fontSize: '15px' }}
        />
      </div>

      {/* LISTA (CARDS) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {fornecedoresFiltrados.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: '#64748b', backgroundColor: '#0b1120', borderRadius: '16px', border: '1px dashed #334155' }}>Nenhum fornecedor encontrado.</div>
        ) : (
          fornecedoresFiltrados.map(f => (
            <div key={f.id} style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'transform 0.2s', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 900, color: '#f8fafc', fontSize: '16px' }}>{f.nome}</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => abrirEdicao(f)} style={{ background: '#020617', border: '1px solid #38bdf8', color: '#38bdf8', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>Editar</button>
                  <button onClick={() => excluir(f.id)} style={{ background: '#020617', border: '1px solid #f43f5e', color: '#f43f5e', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>X</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#cbd5e1' }}>
                <div style={{ display: 'flex', gap: '8px' }}><span style={{ color: '#64748b' }}>{labelDocumento}:</span> <strong style={{ color: '#fff' }}>{f.documento || '---'}</strong></div>
                <div style={{ display: 'flex', gap: '8px' }}><span style={{ color: '#64748b' }}>Contato:</span> <strong style={{ color: '#a855f7' }}>{f.telefone || '---'}</strong></div>
                <div style={{ display: 'flex', gap: '8px' }}><span style={{ color: '#64748b' }}>Cidade:</span> <span>{f.cidade || '---'} ({f.pais})</span></div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL DE CADASTRO */}
      {modalAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #7e22ce', borderRadius: '24px', width: '100%', maxWidth: '600px', padding: '28px', color: '#fff', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '1px' }}>Ficha Cadastral</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '20px', fontWeight: 900 }}>{fornecedorEmEdicao ? `Editar: ${form.nome}` : 'Novo Fornecedor'}</h3>
              </div>
              <button onClick={() => setModalAberto(false)} style={{ backgroundColor: '#020617', border: '1px solid #1e293b', color: '#64748b', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Nome / Razão Social *</label>
                <input type="text" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#fff', padding: '12px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>{labelDocumento}</label>
                  <input type="text" value={form.documento} onChange={e => setForm({...form, documento: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#fff', padding: '12px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>País / Regra Fiscal</label>
                  <select value={form.pais} onChange={e => setForm({...form, pais: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#a855f7', padding: '12px', outline: 'none', marginTop: '6px', boxSizing: 'border-box', fontWeight: 900 }}>
                    <option value="BR">Brasil (CNPJ/CPF)</option>
                    <option value="PY">Paraguay (RUC)</option>
                    <option value="OUTROS">Exterior / Outros</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Telefone / WhatsApp</label>
                  <input type="text" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#fff', padding: '12px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Cidade / Estado</label>
                  <input type="text" value={form.cidade} onChange={e => setForm({...form, cidade: e.target.value})} style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', color: '#fff', padding: '12px', outline: 'none', marginTop: '6px', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setModalAberto(false)} style={{ flex: 1, padding: '14px', backgroundColor: '#1e293b', border: 'none', color: '#cbd5e1', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvar} style={{ flex: 2, background: 'linear-gradient(135deg, #7e22ce, #6b21a8)', border: 'none', color: '#fff', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}>Salvar Fornecedor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
