import React, { useState } from 'react';

const LandingPage = () => {
  const [view, setView] = useState('login');

  const handleSubmit = (e) => {
    e.preventDefault();
    alert("A conectar à infraestrutura segura ZenOS...");
  };

  return (
    <div style={styles.pageContainer}>
      {/* CÓDIGO INVISÍVEL PARA MATAR A BARRA DE ROLAGEM DO NAVEGADOR */}
      <style>{`
        ::-webkit-scrollbar { display: none; }
        * { -ms-overflow-style: none; scrollbar-width: none; }
        body, html { margin: 0; padding: 0; overflow: hidden; background-color: #050505; }
      `}</style>

      {/* CAMADAS DE FUNDO */}
      <div style={styles.bgImage}></div>
      <div style={styles.bgOverlay}></div>

      {/* CENTRO DA TELA (AUTO-AJUSTÁVEL) */}
      <div style={styles.contentWrapper}>
        <div style={styles.glassCard}>
          
          {/* LOGÓTIPO COM BORDA ARREDONDADA */}
          <div style={styles.logoContainer}>
            <img 
              src="/logo-zenos.png?v=2" 
              alt="ZenOS Logo" 
              style={styles.logoImage} 
              onError={(e) => { e.target.onerror = null; e.target.src = '/Logo.png.jpeg'; }}
            />
          </div>

          <div style={styles.tabContainer}>
            <button style={view === 'login' ? styles.activeTab : styles.tab} onClick={() => setView('login')}>Acesso</button>
            <button style={view === 'register' ? styles.activeTab : styles.tab} onClick={() => setView('register')}>Criar Conta</button>
            <button style={view === 'demo' ? styles.activeTab : styles.tab} onClick={() => setView('demo')}>Demo</button>
          </div>

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

      {/* RODAPÉ ALINHADO À BASE */}
      <div style={styles.featuresFooter}>
        <div style={styles.featuresRow}>
          <div style={styles.featureItem}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            <span style={styles.featureTitle}>VENDAS<br/>EM TEMPO REAL</span>
          </div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            <span style={styles.featureTitle}>ESTOQUE<br/>INTELIGENTE</span>
          </div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span style={styles.featureTitle}>COMISSÕES<br/>E EQUIPE</span>
          </div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            <span style={styles.featureTitle}>FINANCEIRO<br/>COMPLETO</span>
          </div>
          <div style={styles.divider}></div>
          <div style={styles.featureItem}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
            <span style={styles.featureTitle}>CONTROLE<br/>TOTAL</span>
          </div>
        </div>
        
        <div style={styles.featuresSubtitle}>
          MAIS ORGANIZAÇÃO &nbsp;&nbsp;•&nbsp;&nbsp; MAIS RESULTADOS &nbsp;&nbsp;•&nbsp;&nbsp; MAIS LUCRO
        </div>
      </div>
    </div>
  );
};

// ==========================================
// ESTILOS DINÂMICOS 100% RESPONSIVOS
// ==========================================
const styles = {
  pageContainer: {
    position: 'fixed', // TRAVA O ECRÃ POR COMPLETO
    top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    backgroundColor: '#050505',
    overflowY: 'auto', // Mantém funcionalidade escondida se ecrã for incrivelmente pequeno
    overflowX: 'hidden',
  },
  bgImage: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundImage: 'url("https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop")',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    zIndex: 1,
  },
  bgOverlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'linear-gradient(135deg, rgba(5,5,5,0.92) 0%, rgba(13,56,49,0.75) 100%)',
    zIndex: 2,
  },
  contentWrapper: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '0 20px',
    zIndex: 10,
    width: '100%',
    boxSizing: 'border-box',
  },
  glassCard: {
    width: '100%',
    maxWidth: '440px',
    background: 'rgba(10, 10, 10, 0.4)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: 'clamp(20px, 4vh, 40px)', // Adapta-se à altura
    boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxSizing: 'border-box',
    marginTop: 'clamp(10px, 4vh, 30px)', // Dá espaço extra no topo
  },
  logoContainer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 'clamp(16px, 3vh, 30px)',
  },
  logoImage: {
    width: '100%',
    maxWidth: '180px',
    height: 'clamp(60px, 12vh, 100px)', // Ajuste fino para não esticar
    objectFit: 'contain',
    borderRadius: '16px', // Dá ao fundo branco a aparência de ícone Apple
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
  },
  tabContainer: {
    display: 'flex',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: '12px',
    padding: '4px',
    marginBottom: 'clamp(16px, 3vh, 30px)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
  tab: {
    flex: 1,
    padding: 'clamp(8px, 1.5vh, 12px) 0',
    background: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    borderRadius: '8px',
    transition: 'all 0.3s',
  },
  activeTab: {
    flex: 1,
    padding: 'clamp(8px, 1.5vh, 12px) 0',
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  formViewContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  formTitle: {
    fontSize: 'clamp(18px, 3vh, 24px)',
    fontWeight: '800',
    marginBottom: '8px',
    textAlign: 'center',
    color: '#ffffff',
  },
  formSubtitle: {
    fontSize: 'clamp(12px, 1.5vh, 14px)',
    color: '#a3a3a3',
    marginBottom: 'clamp(16px, 3vh, 24px)',
    textAlign: 'center',
    lineHeight: '1.5',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(10px, 2vh, 16px)',
  },
  input: {
    width: '100%',
    height: 'clamp(44px, 6vh, 52px)',
    background: 'rgba(0, 0, 0, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '0 20px',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border 0.3s',
  },
  submitBtn: {
    height: 'clamp(46px, 6.5vh, 54px)',
    background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '800',
    cursor: 'pointer',
    marginTop: 'clamp(4px, 1vh, 10px)',
    transition: 'all 0.3s',
    boxShadow: '0 8px 20px rgba(20, 184, 166, 0.3)',
  },
  featuresFooter: {
    width: '100%',
    zIndex: 10,
    padding: 'clamp(12px, 2.5vh, 20px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)',
  },
  featuresRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 'clamp(10px, 2vw, 30px)',
    marginBottom: 'clamp(8px, 1.5vh, 16px)',
  },
  featureItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    minWidth: '80px',
  },
  featureTitle: {
    color: '#e5e5e5',
    fontSize: '10px',
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: '1px',
    lineHeight: '1.4',
  },
  divider: {
    width: '1px',
    height: 'clamp(20px, 4vh, 30px)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  featuresSubtitle: {
    color: '#14b8a6',
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '2px',
    textAlign: 'center',
    paddingBottom: 'clamp(4px, 1vh, 10px)',
  }
};

export default LandingPage;
