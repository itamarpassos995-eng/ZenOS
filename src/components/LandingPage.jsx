import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const LandingPage = () => {
  const [view, setView] = useState('login'); // 'login' | 'register' | 'demo' | 'recovery'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [storeName, setStoreName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (view === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        
      } else if (view === 'register') {
        if (!storeName) throw new Error('Por favor, introduza o nome da loja.');
        
        if (password !== confirmPassword) {
           setErrorMsg('As palavras-passe não coincidem. Verifique e tente novamente.');
           setLoading(false);
           return;
        }
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "lojas", user.uid), {
          nomeLoja: storeName,
          emailAdmin: email,
          status: 'aguardando_pagamento',
          dataCriacao: new Date().toISOString()
        });
        
      } else if (view === 'demo') {
        setSuccessMsg('Pedido enviado com sucesso! Entraremos em contacto.');
        setEmail('');
        storeName && setStoreName('');

      } else if (view === 'recovery') {
        if (!email || !email.includes('@')) {
          throw new Error('Por favor, insira um e-mail válido para a recuperação.');
        }
        await sendPasswordResetEmail(auth, email);
        setSuccessMsg('E-mail de recuperação enviado! Verifique a sua caixa de entrada e spam.');
        setEmail('');
      }
    } catch (error) {
      console.error(error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setErrorMsg('Credenciais inválidas. Verifique os seus dados.');
      } else if (error.code === 'auth/email-already-in-use') {
        setErrorMsg('Este e-mail já está em uso.');
      } else if (error.code === 'auth/user-not-found') {
        setErrorMsg('Não existe nenhuma conta associada a este e-mail.');
      } else {
        setErrorMsg(error.message || 'Ocorreu um erro. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const mudarAba = (novaAba) => {
    setView(novaAba);
    setErrorMsg('');
    setSuccessMsg('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  return (
    <div style={styles.pageContainer}>
      <style>{`
        ::-webkit-scrollbar { display: none; }
        * { -ms-overflow-style: none; scrollbar-width: none; }
        body, html { margin: 0; padding: 0; overflow: hidden; background-color: #050505; }
      `}</style>

      <div style={styles.bgImage}></div>
      <div style={styles.bgOverlay}></div>

      <div style={styles.contentWrapper}>
        <div style={styles.glassCard}>
          
          <div style={styles.logoContainer}>
            <img 
              src="/logo-zenos.png?v=3" 
              alt="ZenOS Logo Oficial" 
              style={styles.logoImage} 
            />
          </div>

          <div style={styles.tabContainer}>
            <button style={view === 'login' || view === 'recovery' ? styles.activeTab : styles.tab} onClick={() => mudarAba('login')}>Acesso</button>
            <button style={view === 'register' ? styles.activeTab : styles.tab} onClick={() => mudarAba('register')}>Criar Conta</button>
            <button style={view === 'demo' ? styles.activeTab : styles.tab} onClick={() => mudarAba('demo')}>Demo</button>
          </div>

          <div style={styles.formViewContainer}>
            <h2 style={styles.formTitle}>
              {view === 'login' && 'Bem-vindo de volta'}
              {view === 'register' && 'Junte-se à Elite'}
              {view === 'demo' && 'Agendar Demonstração'}
              {view === 'recovery' && 'Recuperar Senha'}
            </h2>
            <p style={styles.formSubtitle}>
              {view === 'login' && 'Introduza as suas credenciais para aceder ao sistema de gestão.'}
              {view === 'register' && 'Crie a sua conta e aguarde a aprovação da licença comercial.'}
              {view === 'demo' && 'Descubra como o ZenOS pode transformar os resultados da sua loja.'}
              {view === 'recovery' && 'Introduza o seu e-mail cadastrado para receber o link de redefinição.'}
            </p>

            {errorMsg && <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#fca5a5', padding: '10px', borderRadius: '8px', fontSize: '13px', textAlign: 'center', marginBottom: '16px' }}>{errorMsg}</div>}
            {successMsg && <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.5)', color: '#6ee7b7', padding: '10px', borderRadius: '8px', fontSize: '13px', textAlign: 'center', marginBottom: '16px' }}>{successMsg}</div>}

            <form onSubmit={handleSubmit} style={styles.form}>
              {(view === 'register' || view === 'demo') && (
                <input type="text" placeholder="Nome da Loja ou Empresa" style={styles.input} value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
              )}
              
              <input type="email" placeholder="E-mail profissional" style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} required />
              
              {view !== 'demo' && view !== 'recovery' && (
                <>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      placeholder="Palavra-passe" 
                      style={{ ...styles.input, paddingRight: '45px' }}
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      required 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      style={styles.eyeButton}
                      title={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      )}
                    </button>
                  </div>

                  {view === 'register' && (
                    <div style={{ position: 'relative', width: '100%' }}>
                      <input 
                        type={showPassword ? "text" : "password"} 
                        placeholder="Confirmar palavra-passe" 
                        style={{ ...styles.input, paddingRight: '45px' }}
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        required 
                      />
                    </div>
                  )}
                </>
              )}
              
              <button type="submit" style={styles.submitBtn} disabled={loading}>
                {loading ? 'A processar...' : (view === 'login' ? 'Entrar no Sistema' : view === 'register' ? 'Solicitar Acesso' : view === 'demo' ? 'Pedir Demonstração Gratuita' : 'Enviar Link de Recuperação')}
              </button>

              {/* Botão secundário de transição para Recuperar Senha */}
              {view === 'login' && (
                <div style={{ textAlign: 'center', marginTop: '4px' }}>
                  <button 
                    type="button" 
                    onClick={() => mudarAba('recovery')}
                    style={styles.textLinkBtn}
                  >
                    Esqueceu a sua palavra-passe?
                  </button>
                </div>
              )}

              {view === 'recovery' && (
                <div style={{ textAlign: 'center', marginTop: '4px' }}>
                  <button 
                    type="button" 
                    onClick={() => mudarAba('login')}
                    style={styles.textLinkBtn}
                  >
                    Lembrou-se da palavra-passe? Voltar ao Login
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <div style={styles.featuresFooter}>
        <div style={styles.featuresRow}>
          <div style={styles.featureItem}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg><span style={styles.featureTitle}>VENDAS<br/>EM TEMPO REAL</span></div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg><span style={styles.featureTitle}>ESTOQUE<br/>INTELIGENTE</span></div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg><span style={styles.featureTitle}>COMISSÕES<br/>E EQUIPE</span></div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg><span style={styles.featureTitle}>FINANCEIRO<br/>COMPLETO</span></div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg><span style={styles.featureTitle}>CONTROLE<br/>TOTAL</span></div>
        </div>
        <div style={styles.featuresSubtitle}>MAIS ORGANIZAÇÃO &nbsp;&nbsp;•&nbsp;&nbsp; MAIS RESULTADOS &nbsp;&nbsp;•&nbsp;&nbsp; MAIS LUCRO</div>
      </div>
    </div>
  );
};

// ==========================================
// ESTILOS DINÂMICOS 100% RESPONSIVOS
// ==========================================
const styles = {
  pageContainer: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', fontFamily: '"Inter", "Segoe UI", sans-serif', backgroundColor: '#050505', overflowY: 'auto', overflowX: 'hidden' },
  bgImage: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url("https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 1 },
  bgOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(135deg, rgba(5,5,5,0.92) 0%, rgba(13,56,49,0.75) 100%)', zIndex: 2 },
  contentWrapper: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 20px', zIndex: 10, width: '100%', boxSizing: 'border-box' },
  glassCard: { width: '100%', maxWidth: '440px', background: 'rgba(10, 10, 10, 0.4)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: 'clamp(20px, 4vh, 40px)', boxShadow: '0 30px 60px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box', marginTop: 'clamp(10px, 4vh, 30px)' },
  logoContainer: { width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 'clamp(16px, 3vh, 30px)' },
  logoImage: { width: '100%', maxWidth: '180px', height: 'clamp(60px, 12vh, 100px)', objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.6))' },
  tabContainer: { display: 'flex', width: '100%', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '12px', padding: '4px', marginBottom: 'clamp(16px, 3vh, 30px)', border: '1px solid rgba(255, 255, 255, 0.05)' },
  tab: { flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', background: 'transparent', border: 'none', color: '#888', fontSize: '13px', fontWeight: '700', cursor: 'pointer', borderRadius: '8px', transition: 'all 0.3s' },
  activeTab: { flex: 1, padding: 'clamp(8px, 1.5vh, 12px) 0', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#ffffff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' },
  formViewContainer: { width: '100%', display: 'flex', flexDirection: 'column' },
  formTitle: { fontSize: 'clamp(18px, 3vh, 24px)', fontWeight: '800', marginBottom: '8px', textAlign: 'center', color: '#ffffff' },
  formSubtitle: { fontSize: 'clamp(12px, 1.5vh, 14px)', color: '#a3a3a3', marginBottom: 'clamp(16px, 3vh, 24px)', textAlign: 'center', lineHeight: '1.5' },
  form: { display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 2vh, 16px)' },
  input: { width: '100%', height: 'clamp(44px, 6vh, 52px)', background: 'rgba(0, 0, 0, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '0 20px', color: '#ffffff', fontSize: '15px', outline: 'none', boxSizing: 'border-box', transition: 'border 0.3s' },
  eyeButton: { position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none' },
  submitBtn: { height: 'clamp(46px, 6.5vh, 54px)', background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)', color: '#ffffff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '800', cursor: 'pointer', marginTop: 'clamp(4px, 1vh, 10px)', transition: 'all 0.3s', boxShadow: '0 8px 20px rgba(20, 184, 166, 0.3)' },
  textLinkBtn: { background: 'transparent', border: 'none', color: '#14b8a6', fontSize: '12px', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline', padding: '4px 0', marginTop: '4px' },
  featuresFooter: { width: '100%', zIndex: 10, padding: 'clamp(12px, 2.5vh, 20px)', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)' },
  featuresRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 'clamp(10px, 2vw, 30px)', marginBottom: 'clamp(8px, 1.5vh, 16px)' },
  featureItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '80px' },
  featureTitle: { color: '#e5e5e5', fontSize: '10px', fontWeight: '700', textAlign: 'center', letterSpacing: '1px', lineHeight: '1.4' },
  divider: { width: '1px', height: 'clamp(20px, 4vh, 30px)', backgroundColor: 'rgba(255,255,255,0.1)' },
  featuresSubtitle: { color: '#14b8a6', fontSize: '10px', fontWeight: '800', letterSpacing: '2px', textAlign: 'center', paddingBottom: 'clamp(4px, 1vh, 10px)' }
};

export default LandingPage;
