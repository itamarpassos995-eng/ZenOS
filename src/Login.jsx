import React, { useState } from 'react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // Aqui vai entrar a ligação real ao Firebase na próxima etapa!
    alert(`A iniciar sessão segura para: ${email}`);
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginCard}>
        
        {/* LOGÓTIPO */}
        <div style={styles.logoContainer}>
          <img 
            src="/logo-zenos.png" 
            alt="ZenOS Logo" 
            style={styles.logoImage} 
          />
        </div>

        <div style={styles.headerText}>
          <h2 style={styles.title}>Acesso Seguro</h2>
          <p style={styles.subtitle}>Introduza as suas credenciais para aceder ao painel</p>
        </div>

        {/* FORMULÁRIO */}
        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>E-mail</label>
            <input 
              type="email" 
              placeholder="exemplo@suaempresa.com"
              style={styles.input} 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required 
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Palavra-passe</label>
            <input 
              type="password" 
              placeholder="••••••••"
              style={styles.input} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>

          <div style={styles.forgotPassword}>
            <span style={styles.linkText}>Esqueceu-se da palavra-passe?</span>
          </div>

          <button type="submit" style={styles.submitButton}>
            Entrar no Sistema
          </button>
        </form>

        <div style={styles.footer}>
          <p style={styles.securityText}>🔒 Ligação encriptada de ponta a ponta</p>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// ESTILOS: TEMA ESCURO CORPORATIVO & MOBILE-FIRST
// ==========================================
const styles = {
  container: {
    width: '100%',
    minHeight: '100vh',
    backgroundColor: '#0a0a0a', // Fundo super escuro para destacar o logótipo
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 'clamp(16px, 5vw, 40px)',
    fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    boxSizing: 'border-box',
  },
  loginCard: {
    width: '100%',
    maxWidth: '440px', // Trava o tamanho no PC
    backgroundColor: '#141414', // Ligeiramente mais claro que o fundo
    borderRadius: '16px',
    padding: 'clamp(30px, 8vw, 50px)',
    boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
    border: '1px solid #262626',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
  logoContainer: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  logoImage: {
    width: '100%',
    maxWidth: '240px', // Tamanho ideal para o telemóvel e PC
    height: 'auto',
    objectFit: 'contain',
  },
  headerText: {
    textAlign: 'center',
    marginBottom: '30px',
    width: '100%',
  },
  title: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  subtitle: {
    color: '#a3a3a3',
    fontSize: '14px',
    margin: 0,
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    color: '#e5e5e5',
    fontSize: '14px',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    height: '50px',
    backgroundColor: '#1c1c1c',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '0 16px',
    color: '#ffffff',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  // O foco do input não usa pseudo-classes em inline-styles simples, 
  // mas o design base já passa a ideia de sofisticação.
  forgotPassword: {
    display: 'flex',
    justifyContent: 'flex-end',
    width: '100%',
  },
  linkText: {
    color: '#14b8a6', // Tom de verde/teal para combinar com o logótipo
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  submitButton: {
    width: '100%',
    height: '50px',
    backgroundColor: '#14b8a6', // Verde/teal que puxa a cor do logótipo
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    marginTop: '10px',
    boxShadow: '0 4px 12px rgba(20, 184, 166, 0.3)',
  },
  footer: {
    marginTop: '30px',
    textAlign: 'center',
  },
  securityText: {
    color: '#525252',
    fontSize: '12px',
    fontWeight: '500',
    margin: 0,
  }
};

export default Login;
