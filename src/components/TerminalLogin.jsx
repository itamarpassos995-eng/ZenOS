// src/components/TerminalLogin.jsx
import React, { useState, useEffect } from 'react';

function LogoSubLogin() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
      <img src="/logo-zenos.png?v=4" alt="ZenOS" style={{ height: '60px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ color: '#f8fafc', fontWeight: 900, fontSize: '24px', letterSpacing: '2.5px' }}>ZÊNITE</span>
        <span style={{ color: '#818cf8', fontWeight: 800, fontSize: '12px', letterSpacing: '1px' }}>OS</span>
      </div>
    </div>
  );
}

export default function TerminalLogin({ vendedores, onLoginSuccess, onSairLoja }) {
  const [idSelecionado, setIdSelecionado] = useState('');
  const [senhaDigitada, setSenhaDigitada] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (vendedores && vendedores.length > 0 && !idSelecionado) {
      setIdSelecionado(vendedores[0].id);
    }
  }, [vendedores, idSelecionado]);

  const tentarAcesso = (e) => {
    e.preventDefault();
    setErro('');

    const operador = vendedores.find(v => String(v.id) === String(idSelecionado));
    if (!operador) return setErro('Selecione um operador.');

    if (operador.senha !== senhaDigitada) {
      setSenhaDigitada('');
      return setErro('PIN / Senha incorreta! Tente novamente.');
    }

    onLoginSuccess(operador);
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', fontFamily: '"Inter", "Segoe UI", sans-serif', backgroundColor: '#050505' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url("https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1 }}></div>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(135deg, rgba(5,5,5,0.92) 0%, rgba(13,56,49,0.75) 100%)', zIndex: 2 }}></div>
      
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', zIndex: 10 }}>
        <div style={{ width: '100%', maxWidth: '400px', background: 'rgba(10, 10, 10, 0.6)', backdropFilter: 'blur(20px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '40px', boxShadow: '0 30px 60px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          
          <LogoSubLogin />
          
          <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 900, marginBottom: '8px', textAlign: 'center' }}>Acesso ao Terminal</h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', marginBottom: '24px' }}>Selecione o seu utilizador e insira o PIN para operar o caixa.</p>
          
          <form onSubmit={tentarAcesso} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 800 }}>Quem está a operar?</label>
              <select value={idSelecionado} onChange={(e) => { setIdSelecionado(e.target.value); setErro(''); setSenhaDigitada(''); }} style={{ width: '100%', padding: '14px', backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: 800, outline: 'none', cursor: 'pointer' }}>
                {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nome} ({v.cargo})</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 800 }}>Senha / PIN:</label>
              <input type="password" placeholder="••••" value={senhaDigitada} onChange={e => { setSenhaDigitada(e.target.value); setErro(''); }} style={{ width: '100%', padding: '14px', backgroundColor: '#020617', border: `1px solid ${erro ? '#f43f5e' : '#14b8a6'}`, borderRadius: '12px', color: '#34d399', fontSize: '20px', fontWeight: 900, textAlign: 'center', outline: 'none', boxSizing: 'border-box', letterSpacing: '4px' }} autoFocus />
              {erro ? <span style={{ fontSize: '12px', color: '#f43f5e', textAlign: 'center', marginTop: '4px', fontWeight: 800 }}>{erro}</span> : <span style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>A senha padrão mestre é <b>admin</b></span>}
            </div>

            <button type="submit" style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #0d9488, #14b8a6)', border: 'none', color: '#fff', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', fontSize: '15px', marginTop: '8px', boxShadow: '0 4px 15px rgba(20, 184, 166, 0.3)' }}>Desbloquear Terminal ➔</button>
            {onSairLoja && <button type="button" onClick={onSairLoja} style={{ background: 'transparent', border: 'none', color: '#fb7185', fontSize: '12px', fontWeight: 800, cursor: 'pointer', marginTop: '8px', textDecoration: 'underline' }}>Encerrar sessão principal da loja</button>}
          </form>
        </div>
      </div>
    </div>
  );
}
