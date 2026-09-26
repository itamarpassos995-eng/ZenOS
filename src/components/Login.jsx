import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import LandingPage from './LandingPage';

export default function Login() {
  const [modo, setModo] = useState('landing'); // 'landing', 'login' ou 'cadastro'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      if (modo === 'cadastro') {
        if (senha !== confirmarSenha) {
          throw new Error('As senhas não coincidem.');
        }
        if (senha.length < 6) {
          throw new Error('A senha deve ter pelo menos 6 caracteres.');
        }
        
        // 1. Cria a conta no Auth do Firebase
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        
        // 2. Inicializa o documento da nova loja com licença pendente (modelo SaaS)
        await setDoc(doc(db, "lojas", cred.user.uid), {
          email: email,
          status: 'aguardando_pagamento',
          criadoEm: new Date().toISOString()
        });
        
      } else {
        // Login normal
        await signInWithEmailAndPassword(auth, email, senha);
      }
    } catch (err) {
      console.error(err);
      let msg = 'Ocorreu um erro no acesso.';
      if (err.code === 'auth/invalid-email') msg = 'E-mail inválido.';
      if (err.code === 'auth/user-not-found') msg = 'Loja/utilizador não encontrado.';
      if (err.code === 'auth/wrong-password') msg = 'Senha incorreta.';
      if (err.code === 'auth/email-already-in-use') msg = 'Este e-mail já está registado.';
      setErro(err.message || msg);
    } finally {
      setLoading(false);
    }
  };

  // Se o utilizador estiver na página de apresentação (Landing Page)
  if (modo === 'landing') {
    return <LandingPage aoIrParaLogin={() => setModo('login')} />;
  }

  // Ecrã de Login ou Cadastro
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      
      {/* Background Glows */}
      <div style={{ position: 'absolute', top: '10%', left: '20%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(79,70,229,0.1) 0%, rgba(2,6,23,0) 70%)', pointerEvents: 'none' }}></div>

      <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.8)', zIndex: 1 }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '3px 8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '36px' }}>
              <img src="/Logo.png.jpeg" alt="ZenOS" style={{ height: '28px', width: 'auto', objectFit: 'contain' }} onError={(e) => e.target.src = '/logo.png'} />
            </div>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: '18px', letterSpacing: '2px' }}>ZenOS</span>
          </div>
          <button onClick={() => setModo('landing')} style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
            ← Voltar ao Início
          </button>
        </div>

        <h2 style={{ color: '#f8fafc', fontSize: '22px', fontWeight: 900, margin: '0 0 8px 0' }}>
          {modo === 'login' ? 'Aceder ao Terminal' : 'Criar Nova Loja'}
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 24px 0' }}>
          {modo === 'login' ? 'Entre com as credenciais da sua distribuidora.' : 'Registe o seu atacadão para iniciar a operação.'}
        </p>

        {erro && (
          <div style={{ backgroundColor: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', color: '#fb7185', padding: '12px', borderRadius: '10px', fontSize: '13px', marginBottom: '20px', fontWeight: 700 }}>
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>E-mail Corporativo</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="loja@zenos.app.br"
              style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', padding: '14px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Palavra-passe</label>
            <input 
              type="password" 
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', padding: '14px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {modo === 'cadastro' && (
            <div>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>Confirmar Palavra-passe</label>
              <input 
                type="password" 
                required
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="••••••••"
                style={{ width: '100%', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', padding: '14px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            style={{ width: '100%', background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#fff', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: 900, cursor: 'pointer', marginTop: '8px', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'A processar...' : (modo === 'login' ? 'Entrar no Sistema' : 'Registar Nova Loja')}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid #1e293b', paddingTop: '20px' }}>
          {modo === 'login' ? (
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
              A sua loja ainda não tem acesso?{' '}
              <button onClick={() => setModo('cadastro')} style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                Criar Conta SaaS
              </button>
            </span>
          ) : (
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
              Já possui uma conta ativa?{' '}
              <button onClick={() => setModo('login')} style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                Fazer Login
              </button>
            </span>
          )}
        </div>

      </div>
    </div>
  );
}