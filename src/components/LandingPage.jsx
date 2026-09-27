import React, { useState } from 'react';

const LandingPage = () => {
  const [view, setView] = useState('login'); // Pode ser: 'login', 'register', 'demo'

  const handleSubmit = (e) => {
    e.preventDefault();
    alert("A conectar à infraestrutura segura ZenOS...");
  };

  return (
    <div style={styles.pageContainer}>
      {/* CARTÃO DE VIDRO FOSCO (GLASSMORPHISM) */}
      <div style={styles.glassCard}>
        
        {/* LOGÓTIPO */}
        <div style={styles.logoContainer}>
          <img src="/logo-zenos.png?v=1" alt="ZenOS Logo" style={styles.logoImage} />
        </div>

        {/* ABAS DE NAVEGAÇÃO INTERNAS */}
        <div style={styles.tabContainer}>
          <button style={view === 'login' ? styles.activeTab : styles.tab} onClick={() => setView('login')}>Acesso</button>
          <button style={view === 'register' ? styles.activeTab : styles.tab} onClick={() => setView('register')}>Criar Conta</button>
          <button style={view === 'demo' ? styles.activeTab : styles.tab} onClick={() => setView('demo')}>Demo</button>
        </div>

        {/* ÁREA DINÂMICA (Muda conforme a aba) */}
        <div style={styles.formViewContainer}>
          <h2 style={styles.formTitle}>
            {view === 'login' && 'Bem-vindo de volta'}
            {view === 'register' && 'Junte-se à Elite'}
            {view === 'demo' && 'Agendar Demonstração'}
          </h2>
          <p style={styles.formSubtitle}>
            {view === 'login' && 'Introduza as suas credenciais para aceder ao sistema de gestão.'}
            {view === 'register' && 'Crie a sua conta e aguarde a aprovação da licença comercial.'}
            {view === 'demo' && 'Descubra como o ZenOS pode transformar os resultados da sua loja.'}
          </p>

          <form onSubmit={handleSubmit} style={styles.form}>
            {(view === 'register' || view === 'demo') && (
              <input type="text" placeholder="Nome da Loja ou Empresa" style={styles.input} required />
            )}
            
            <input type="email" placeholder="E-mail profissional" style={styles.input} required />
            
            {view !== 'demo' && (
              <input type="password" placeholder="Palavra-passe" style={styles.input} required />
            )}
            
            <button type="submit" style={styles.submitBtn}>
              {view === 'login' && 'Entrar no Sistema'}
              {view === 'register' && 'Solicitar Acesso'}
              {view === 'demo' && 'Pedir Demonstração Gratuita'}
            </button>
          </form>
        </div>
        
      </div>
    </div>
  );
};

// ==========================================
// ESTILOS: TEMA ESCURO PREMIUM & GLASSMORPHISM
// ==========================================
const styles = {
  pageContainer: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: '#050505',
    // Fundo com um leve brilho radial verde-água no topo para dar profundidade
    backgroundImage: 'radial-gradient(circle at 50% -20%, #0d3831 0%, #050505 50%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 'clamp(16px, 5vw, 40px)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    boxSizing: 'border-box',
  },
  glassCard: {
    width: '100%',
    maxWidth: '480px',
    background: 'rgba(20, 20, 20, 0.6)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)', // Suporte para Safari/iOS
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    padding: 'clamp(30px, 6vw, 50px)',
    boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
  logoContainer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '30px',
  },
  logoImage: {
    width: '100%',
    maxWidth: '220px',
    height: 'auto',
    objectFit: 'contain',
  },
  tabContainer: {
    display: 'flex',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: '12px',
    padding: '4px',
    marginBottom: '30px',
  },
  tab: {
    flex: 1,
    padding: '12px 0',
    background: 'transparent',
    border: 'none',
    color: '#737373',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'all 0.3s',
  },
  activeTab: {
    flex: 1,
    padding: '12px 0',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
  },
  formViewContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  formTitle: {
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '8px',
    textAlign: 'center',
    color: '#ffffff',
  },
  formSubtitle: {
    fontSize: '14px',
    color: '#a3a3a3',
    marginBottom: '24px',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  input: {
    width: '100%',
    height: '54px',
    background: 'rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '0 20px',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  submitBtn: {
    height: '54px',
    background: '#14b8a6', // O verde-água da marca Zênite
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'all 0.3s',
    boxShadow: '0 4px 12px rgba(20, 184, 166, 0.2)',
  }
};

export default LandingPage;
