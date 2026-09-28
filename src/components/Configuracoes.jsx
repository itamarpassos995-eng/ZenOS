import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword } from 'firebase/auth';
import { produtosIniciais, clientesIniciais, normalizarProduto, normalizarCliente } from '../data';

export default function Configuracoes({ setProdutos, setClientes, setHistoricoVendas, setCaixaMovimentos, setDespesas, moeda, fmt, tx }) {
  const [modalResetAberto, setModalResetAberto] = useState(false);
  const [senhaAdmin, setSenhaAdmin] = useState('');
  const [etapaAviso, setEtapaAviso] = useState(1); // 1: Aviso de risco, 2: Senha de admin
  const [carregandoReset, setCarregandoReset] = useState(false);

  // Configurações de Vendedores e Comissões
  const [vendedores, setVendedores] = useState([
    { id: 1, nome: 'Gerência / Administrador', comissaoTipo: 'lucro', percentual: 0 },
    { id: 2, nome: 'Vendedor Padrão', comissaoTipo: 'venda', percentual: 5 }
  ]);
  const [novoVendedorNome, setNovoVendedorNome] = useState('');
  const [novoVendedorPercentual, setNovoVendedorPercentual] = useState('5');

  const adicionarVendedor = () => {
    if (!novoVendedorNome.trim()) return alert('Informe o nome do vendedor.');
    const nv = {
      id: Date.now(),
      nome: novoVendedorNome.trim(),
      comissaoTipo: 'venda',
      percentual: parseFloat(novoVendedorPercentual) || 0
    };
    setVendedores([...vendedores, nv]);
    setNovoVendedorNome('');
    alert('Vendedor adicionado com sucesso!');
  };

  const executarResetCompleto = async () => {
    if (!senhaAdmin) return alert('Por favor, digite a senha de administrador.');
    setCarregandoReset(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('Utilizador não autenticado.');
      }

      // Reautenticação segura no Firebase com a senha fornecida
      const credential = EmailAuthProvider.credential(user.email, senhaAdmin);
      await reauthenticateWithCredential(user, credential);

      // Se a senha estiver correta, limpa os dados locais e de fábrica
      const padroesProd = produtosIniciais.map((p, idx) => normalizarProduto(p, idx));
      const padroesCli = clientesIniciais.map(c => normalizarCliente(c));

      setProdutos(padroesProd);
      setClientes(padroesCli);
      setHistoricoVendas([]);
      setCaixaMovimentos([]);
      setDespesas([]);

      // Limpa também no Firestore da loja atual
      await setDoc(doc(db, "lojas", user.uid, "dados", "operacao"), {
        produtos: padroesProd,
        clientes: padroesCli,
        historicoVendas: [],
        caixaMovimentos: [],
        despesas: []
      }, { merge: true });

      alert('Sistema limpo e restaurado para os dados de fábrica com sucesso!');
      setModalResetAberto(false);
      setSenhaAdmin('');
      setEtapaAviso(1);
    } catch (err) {
      console.error("Erro ao validar senha de admin:", err);
      alert('Senha de Administrador incorreta ou erro de autenticação. A operação foi cancelada por segurança.');
    } finally {
      setCarregandoReset(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1000px', margin: '0 auto' }}>
      <div>
        <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', margin: 0 }}>Configurações do Sistema</h2>
        <span style={{ fontSize: '13px', color: '#64748b' }}>Gestão de equipa, regras de comissão e segurança da loja</span>
      </div>

      {/* SEÇÃO DE VENDEDORES E COMISSÕES */}
      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>👥</span>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: 0 }}>Gestão de Vendedores e Regras de Comissão</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
          Cadastre os colaboradores e defina se a comissão é calculada sobre o <b>valor total da venda</b> ou sobre o <b>lucro bruto</b> gerado.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', backgroundColor: '#020617', padding: '16px', borderRadius: '12px', border: '1px solid #1e293b' }}>
          <input 
            type="text" value={novoVendedorNome} onChange={e => setNovoVendedorNome(e.target.value)}
            placeholder="Nome do Vendedor / Operador"
            style={{ flex: 2, minWidth: '200px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#fff', padding: '10px 14px', outline: 'none', fontSize: '13px' }}
          />
          <input 
            type="text" value={novoVendedorPercentual} onChange={e => setNovoVendedorPercentual(e.target.value)}
            placeholder="% Comissão"
            style={{ flex: 1, minWidth: '100px', backgroundColor: '#0b1120', border: '1px solid #334155', borderRadius: '8px', color: '#34d399', fontWeight: 900, padding: '10px 14px', outline: 'none', fontSize: '13px', textAlign: 'center' }}
          />
          <button onClick={vendedores} type="button" onClick={adicionarVendedor} style={{ backgroundColor: '#4f46e5', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontWeight: 900, cursor: 'pointer', fontSize: '13px' }}>
            + Adicionar Vendedor
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {vendedores.map(v => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#020617', padding: '12px 16px', borderRadius: '10px', border: '1px solid #1e293b', fontSize: '13px' }}>
              <span style={{ color: '#f8fafc', fontWeight: 800 }}>{v.nome}</span>
              <span style={{ color: '#34d399', fontWeight: 900 }}>Comissão: {v.percentual}% ({v.comissaoTipo === 'lucro' ? 'Sobre Lucro Bruto' : 'Sobre Valor da Venda'})</span>
            </div>
          ))}
        </div>
      </div>

      {/* ZONA DE PERIGO: RESTAURAR DADOS DE FÁBRICA */}
      <div style={{ backgroundColor: '#2e0a16', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>⚠️</span>
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fb7185', margin: 0 }}>Zona de Perigo • Restauração de Fábrica</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#fca5a5', margin: 0, lineHeight: 1.5 }}>
          Esta ação irá <b>apagar permanentemente</b> todos os produtos atuais, histórico de vendas, clientes cadastrados e fechos de caixa, retornando o sistema para os dados iniciais de demonstração.
        </p>
        <div>
          <button 
            onClick={() => { setEtapaAviso(1); setSenhaAdmin(''); setModalResetAberto(true); }}
            type="button" 
            style={{ backgroundColor: '#e11d48', border: 'none', color: '#fff', padding: '12px 24px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', fontSize: '13px', boxShadow: '0 4px 15px rgba(225,29,72,0.4)' }}
          >
            🗑️ Limpar Sistema e Restaurar Padrões
          </button>
        </div>
      </div>

      {/* MODAL DE SEGURANÇA PARA RESET (DUPLA BARREIRA) */}
      {modalResetAberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ backgroundColor: '#0b1120', border: '2px solid #f43f5e', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '460px', color: '#fff', boxSizing: 'border-box' }}>
            
            {etapaAviso === 1 ? (
              <>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <span style={{ fontSize: '40px' }}>🚨</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#f43f5e', margin: '8px 0 0 0' }}>ATENÇÃO: AÇÃO IRREVERSÍVEL!</h3>
                </div>
                <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '24px', textAlign: 'center' }}>
                  Tem a certeza absoluta de que pretende zerar o sistema? Todo o estoque atual, registos de clientes com fiado e histórico de vendas serão <b>destruídos permanentemente</b>.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setModalResetAberto(false)} type="button" style={{ flex: 1, padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={() => setEtapaAviso(2)} type="button" style={{ flex: 1, padding: '14px', backgroundColor: '#e11d48', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer' }}>Sim, Compreendo os Riscos</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <span style={{ fontSize: '32px' }}>🔐</span>
                  <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#fff', margin: '8px 0 0 0' }}>Confirmação de Administrador</h3>
                </div>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: '16px', textAlign: 'center' }}>
                  Por motivos de segurança, insira a sua <b>senha de Administrador</b> para autorizar a limpeza total da loja.
                </p>

                <label style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: '6px' }}>Senha de Administrador:</label>
                <input 
                  type="password" value={senhaAdmin} onChange={e => setSenhaAdmin(e.target.value)}
                  placeholder="••••••••••••"
                  style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #f43f5e', borderRadius: '12px', color: '#fff', padding: '14px', outline: 'none', fontSize: '16px', boxSizing: 'border-box', marginBottom: '24px', textAlign: 'center' }}
                  autoFocus
                />

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setModalResetAberto(false)} type="button" style={{ flex: 1, padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', color: '#94a3b8', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>Voltar</button>
                  <button 
                    disabled={carregandoReset}
                    onClick={executarResetCompleto} 
                    type="button" 
                    style={{ flex: 2, padding: '14px', backgroundColor: carregandoReset ? '#475569' : '#e11d48', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: carregandoReset ? 'not-allowed' : 'pointer', boxShadow: '0 4px 15px rgba(225,29,72,0.3)' }}
                  >
                    {carregandoReset ? 'A limpar sistema...' : 'Autorizar e Limpar Tudo'}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
