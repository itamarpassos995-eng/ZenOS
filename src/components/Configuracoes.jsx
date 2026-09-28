import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { produtosIniciais, clientesIniciais, normalizarProduto, normalizarCliente } from '../data';

export default function Configuracoes({ produtos, setProdutos, clientes, setClientes, historicoVendas, setHistoricoVendas, caixaMovimentos, setCaixaMovimentos, despesas, setDespesas, moeda, fmt, tx, regrasDesconto, setRegrasDesconto }) {
  const [modalResetAberto, setModalResetAberto] = useState(false);
  const [senhaAdmin, setSenhaAdmin] = useState('');
  const [etapaAviso, setEtapaAviso] = useState(1);
  const [carregandoReset, setCarregandoReset] = useState(false);

  const [selProdutos, setSelProdutos] = useState(false);
  const [selClientes, setSelClientes] = useState(false);
  const [selVendas, setSelVendas] = useState(false);
  const [selCaixa, setSelCaixa] = useState(false);
  const [selDespesas, setSelDespesas] = useState(false);
  const [selTudo, setSelTudo] = useState(false);

  const handleSelTudo = (val) => {
    setSelTudo(val); setSelProdutos(val); setSelClientes(val); setSelVendas(val); setSelCaixa(val); setSelDespesas(val);
  };

  const [vendedores, setVendedores] = useState([
    { id: 1, nome: 'Gerência / Administrador', comissaoTipo: 'lucro', percentual: 0 },
    { id: 2, nome: 'Vendedor Padrão', comissaoTipo: 'venda', percentual: 5 }
  ]);
  const [novoVendedorNome, setNovoVendedorNome] = useState('');
  const [novoVendedorPercentual, setNovoVendedorPercentual] = useState('5');

  const adicionarVendedor = () => {
    if (!novoVendedorNome.trim()) return alert('Informe o nome do vendedor.');
    const nv = { id: Date.now(), nome: novoVendedorNome.trim(), comissaoTipo: 'venda', percentual: parseFloat(novoVendedorPercentual) || 0 };
    setVendedores([...vendedores, nv]);
    setNovoVendedorNome('');
    alert('Vendedor adicionado com sucesso!');
  };

  const executarResetGranular = async () => {
    if (!senhaAdmin) return alert('Por favor, digite a senha de administrador.');
    if (!selProdutos && !selClientes && !selVendas && !selCaixa && !selDespesas) { return alert('Selecione pelo menos uma opção para restaurar ou limpar.'); }
    setCarregandoReset(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error('Utilizador não autenticado.');
      const credential = EmailAuthProvider.credential(user.email, senhaAdmin);
      await reauthenticateWithCredential(user, credential);
      const novosProdutos = selProdutos ? produtosIniciais.map((p, idx) => normalizarProduto(p, idx)) : produtos;
      const novosClientes = selClientes ? clientesIniciais.map(c => normalizarCliente(c)) : clientes;
      const novoHistoricoVendas = selVendas ? [] : historicoVendas;
      const novosCaixaMovs = selCaixa ? [] : caixaMovimentos;
      const novasDespesas = selDespesas ? [] : despesas;
      setProdutos(novosProdutos); setClientes(novosClientes); setHistoricoVendas(novoHistoricoVendas); setCaixaMovimentos(novosCaixaMovs); setDespesas(novasDespesas);
      await setDoc(doc(db, "lojas", user.uid, "dados", "operacao"), { produtos: novosProdutos, clientes: novosClientes, historicoVendas: novoHistoricoVendas, caixaMovimentos: novosCaixaMovs, despesas: novasDespesas }, { merge: true });
      alert('Itens selecionados limpos/restaurados com sucesso!');
      setModalResetAberto(false); setSenhaAdmin(''); setEtapaAviso(1); handleSelTudo(false);
    } catch (err) {
      console.error("Erro ao validar senha:", err);
      alert('Senha incorreta ou erro de autenticação.');
    } finally {
      setCarregandoReset(false);
    }
  };

  const lidarComMudancaRegra = (campo, valor) => {
    setRegrasDesconto(prev => ({ ...prev, [campo]: valor }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1000px', margin: '0 auto' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Configurações do Sistema</h2>
        <span style={{ fontSize: '13px', color: '#64748b' }}>Gestão de equipa, rentabilidade e segurança</span>
      </div>

      {/* 🛡️ SEMÁFORO DE LUCRATIVIDADE DA VENDA */}
      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🚥</span>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>Semáforo de Lucratividade</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
          Proteja o seu lucro. O sistema avalia a margem real de cada venda em tempo real <b>(Total da Venda vs Custo dos Produtos)</b>.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div style={{ backgroundColor: '#021e15', border: '1px solid rgba(16,185,129,0.3)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ display: 'block', color: '#10b981', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>🟢 Margem Saudável (Ideal)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>Acima de</span>
              <input 
                type="number" value={regrasDesconto?.margemIdeal ?? 30} 
                onChange={(e) => lidarComMudancaRegra('margemIdeal', parseFloat(e.target.value) || 0)}
                style={{ width: '60px', backgroundColor: '#020617', border: '1px solid #10b981', color: '#34d399', fontWeight: 900, padding: '8px', borderRadius: '6px', textAlign: 'center', outline: 'none' }}
              />
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>%</span>
            </div>
            <span style={{ display: 'block', color: '#64748b', fontSize: '10px', marginTop: '8px' }}>Lucro excelente. O PDV liberta a venda sem alertas.</span>
          </div>

          <div style={{ backgroundColor: '#2b1704', border: '1px solid rgba(245,158,11,0.3)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ display: 'block', color: '#f59e0b', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>🟡 Margem em Alerta</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>Abaixo de {regrasDesconto?.margemIdeal ?? 30}% até</span>
              <input 
                type="number" value={regrasDesconto?.margemMinima ?? 15} 
                onChange={(e) => lidarComMudancaRegra('margemMinima', parseFloat(e.target.value) || 0)}
                style={{ width: '60px', backgroundColor: '#020617', border: '1px solid #f59e0b', color: '#fbbf24', fontWeight: 900, padding: '8px', borderRadius: '6px', textAlign: 'center', outline: 'none' }}
              />
              <span style={{ color: '#cbd5e1', fontSize: '13px' }}>%</span>
            </div>
            <span style={{ display: 'block', color: '#64748b', fontSize: '10px', marginTop: '8px' }}>Avisa o vendedor que o lucro final está a ficar baixo.</span>
          </div>

          <div style={{ backgroundColor: '#2e0a16', border: '1px solid rgba(225,29,72,0.3)', padding: '16px', borderRadius: '12px' }}>
            <span style={{ display: 'block', color: '#e11d48', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', marginBottom: '8px' }}>🔴 Margem Crítica / Prejuízo</span>
            <span style={{ color: '#fca5a5', fontSize: '12px', fontWeight: 800 }}>Abaixo de {regrasDesconto?.margemMinima ?? 15}%</span>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
              <input 
                type="checkbox" checked={regrasDesconto?.exigirSenhaVermelho ?? true} 
                onChange={(e) => lidarComMudancaRegra('exigirSenhaVermelho', e.target.checked)}
                style={{ accentColor: '#e11d48', width: '16px', height: '16px' }}
              />
              <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>Bloquear e Exigir Senha</span>
            </label>

            {(regrasDesconto?.exigirSenhaVermelho ?? true) && (
              <div style={{ marginTop: '12px' }}>
                <span style={{ color: '#64748b', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Senha da Gerência:</span>
                <input 
                  type="text" value={regrasDesconto?.senhaGerente ?? '1234'} 
                  onChange={(e) => lidarComMudancaRegra('senhaGerente', e.target.value)}
                  style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #e11d48', color: '#fb7185', fontWeight: 900, padding: '8px', borderRadius: '6px', textAlign: 'center', outline: 'none' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* GESTÃO DE VENDEDORES */}
      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>👥</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>Gestão de Vendedores e Comissão</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', backgroundColor: '#020617', padding: '16px', borderRadius: '12px', border: '1px solid #1e293b' }}>
          <input type="text" value={novoVendedorNome} onChange={e => setNovoVendedorNome(e.target.value)} placeholder="Nome do Vendedor" style={{ flex: 2, minWidth: '200px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '10px 14px', outline: 'none', fontSize: '13px' }} />
          <input type="text" value={novoVendedorPercentual} onChange={e => setNovoVendedorPercentual(e.target.value)} placeholder="% Comissão" style={{ flex: 1, minWidth: '100px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 900, padding: '10px 14px', outline: 'none', fontSize: '13px', textAlign: 'center' }} />
          <button onClick={adicionarVendedor} type="button" style={{ backgroundColor: '#4f46e5', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontWeight: 900, cursor: 'pointer', fontSize: '13px' }}>+ Adicionar</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {vendedores.map(v => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '10px', border: '1px solid #1e293b', fontSize: '13px' }}>
              <span style={{ color: '#f8fafc', fontWeight: 800 }}>{v.nome}</span><span style={{ color: '#34d399', fontWeight: 900 }}>Comissão: {v.percentual}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* ZONA DE PERIGO */}
      <div style={{ backgroundColor: '#2e0a16', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fb7185', margin: 0 }}>Zona de Perigo • Limpeza</h3>
        </div>
        <div>
          <button onClick={() => { setEtapaAviso(1); setSenhaAdmin(''); handleSelTudo(false); setModalResetAberto(true); }} type="button" style={{ backgroundColor: '#e11d48', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '13px' }}>🗑️ Gerir Restauração</button>
        </div>
      </div>

      {modalResetAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '2px solid #f43f5e', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '480px', color: '#fff', boxSizing: 'border-box' }}>
            {etapaAviso === 1 ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}><span style={{ fontSize: '36px' }}>🛡️</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f43f5e', margin: '6px 0 0 0' }}>Escolha o que Restaurar</h3></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#020617', padding: '16px', borderRadius: '14px', border: '1px solid #1e293b', marginBottom: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 900, color: '#fbbf24', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px' }}><input type="checkbox" checked={selTudo} onChange={e => handleSelTudo(e.target.checked)} style={{ width: '16px', height: '16px' }} />🔥 Selecionar Todos</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selProdutos} onChange={e => setSelProdutos(e.target.checked)} style={{ width: '16px', height: '16px' }} />📦 Produtos</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selClientes} onChange={e => setSelClientes(e.target.checked)} style={{ width: '16px', height: '16px' }} />👥 Clientes</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selVendas} onChange={e => setSelVendas(e.target.checked)} style={{ width: '16px', height: '16px' }} />📑 Vendas</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selCaixa} onChange={e => setSelCaixa(e.target.checked)} style={{ width: '16px', height: '16px' }} />💵 Caixa</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0' }}><input type="checkbox" checked={selDespesas} onChange={e => setSelDespesas(e.target.checked)} style={{ width: '16px', height: '16px' }} />💸 Despesas</label>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setModalResetAberto(false)} type="button" style={{ flex: 1, padding: '12px', backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={() => { if (!selProdutos && !selClientes && !selVendas && !selCaixa && !selDespesas) { return alert('Selecione algo.'); } setEtapaAviso(2); }} type="button" style={{ flex: 1, padding: '12px', backgroundColor: '#e11d48', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer' }}>Avançar ➔</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}><span style={{ fontSize: '32px' }}>🔐</span><h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: '8px 0 0 0' }}>Senha Administrador</h3></div>
                <input type="password" value={senhaAdmin} onChange={e => setSenhaAdmin(e.target.value)} placeholder="••••••••••••" style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #f43f5e', borderRadius: '12px', color: '#fff', padding: '14px', outline: 'none', fontSize: '16px', boxSizing: 'border-box', marginBottom: '24px', textAlign: 'center' }} autoFocus />
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setEtapaAviso(1)} type="button" style={{ flex: 1, padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>Voltar</button>
                  <button disabled={carregandoReset} onClick={executarResetGranular} type="button" style={{ flex: 2, padding: '14px', backgroundColor: carregandoReset ? '#475569' : '#e11d48', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: carregandoReset ? 'not-allowed' : 'pointer' }}>Confirmar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
