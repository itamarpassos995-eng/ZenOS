import React from 'react';
const LandingPage = () => {
// Função que dá vida aos botões
const handleAcesso = () => {
alert("Redirecionando para o acesso seguro do ZenOS...");
};
return (
<div style={styles.pageContainer}>
{/* CABEÇALHO */}
<header style={styles.header}>
<div style={styles.logoContainer}>
<div style={styles.logoIcon}>Z</div>
<h1 style={styles.logoText}>ZenOS</h1>
</div>
<button style={styles.loginButtonOutline} onClick={handleAcesso}>
Acessar Sistema
</button>
</header>
{/* SECÇÃO HERO (PRINCIPAL) */}
<main style={styles.mainContent}>
<section style={styles.heroSection}>
<div style={styles.heroTextContainer}>
<h2 style={styles.heroTitle}>
O Sistema de Gestão Definitivo para o seu Negócio
</h2>
<p style={styles.heroSubtitle}>
Esqueça os sistemas antigos. O ZenOS é a plataforma de gestão e PDV que cabe no seu bolso e tem a potência de um software corporativo.
</p>
<div style={styles.buttonGroup}>
<button style={styles.primaryButton} onClick={handleAcesso}>
Começar Agora
</button>
<button style={styles.secondaryButton} onClick={() => alert("Exibindo recursos do sistema...")}>
Conhecer Recursos
</button>
</div>
</div>
</section>
{/* SECÇÃO DE DESTAQUES (CARDS) */}
<section style={styles.featuresSection}>
<div style={styles.featureCard}>
<h3 style={styles.featureTitle}>📱 PDV Mobile-First</h3>
<p style={styles.featureText}>
Venda de qualquer lugar com um ponto de venda desenhado perfeitamente para a tela do seu celular.
</p>
</div>
<div style={styles.featureCard}>
<h3 style={styles.featureTitle}>🏢 Multi-Lojas</h3>
<p style={styles.featureText}>
Faça a gestão de todas as suas filiais de forma centralizada e com isolamento total de dados.
</p>
</div>
<div style={styles.featureCard}>
<h3 style={styles.featureTitle}>⚡ Alta Performance</h3>
<p style={styles.featureText}>
Hospedado na nuvem com tecnologia de ponta. Os seus dados em tempo real, sem travamentos.
</p>
</div>
</section>
</main>
</div>
);
};
// ==========================================
// ESTILOS RESPONSIVOS DE ALTO PADRÃO (MOBILE-FIRST)
// ==========================================
const styles = {
pageContainer: {
width: '100%',
minHeight: '100vh',
backgroundColor: '#f8fafc',
fontFamily: '"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
overflowX: 'hidden',
},
header: {
width: '100%',
height: '80px',
backgroundColor: '#ffffff',
display: 'flex',
justifyContent: 'space-between',
alignItems: 'center',
padding: '0 clamp(16px, 5vw, 40px)',
boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
},
logoContainer: {
display: 'flex',
alignItems: 'center',
gap: '10px',
},
logoIcon: {
width: '40px',
height: '40px',
backgroundColor: '#0ea5e9',
color: '#fff',
borderRadius: '8px',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
fontSize: '24px',
fontWeight: 'bold',
},
logoText: {
fontSize: '24px',
fontWeight: '800',
color: '#0f172a',
margin: 0,
letterSpacing: '-0.5px',
},
loginButtonOutline: {
padding: '10px 20px',
border: '2px solid #0ea5e9',
backgroundColor: 'transparent',
color: '#0ea5e9',
borderRadius: '8px',
fontWeight: '600',
fontSize: '14px',
cursor: 'pointer',
minHeight: '44px',
},
mainContent: {
width: '100%',
maxWidth: '1200px',
margin: '0 auto',
padding: 'clamp(20px, 5vw, 60px)',
display: 'flex',
flexDirection: 'column',
gap: '60px',
},
heroSection: {
width: '100%',
display: 'flex',
flexDirection: 'column',
alignItems: 'center',
textAlign: 'center',
marginTop: 'clamp(20px, 5vw, 60px)',
},
heroTextContainer: {
width: '100%',
maxWidth: '800px',
},
heroTitle: {
fontSize: 'clamp(32px, 8vw, 56px)',
fontWeight: '800',
color: '#0f172a',
lineHeight: '1.1',
margin: '0 0 20px 0',
letterSpacing: '-1px',
},
heroSubtitle: {
fontSize: 'clamp(16px, 4vw, 20px)',
color: '#64748b',
lineHeight: '1.6',
margin: '0 0 40px 0',
},
buttonGroup: {
display: 'flex',
gap: '16px',
justifyContent: 'center',
flexWrap: 'wrap',
},
primaryButton: {
padding: '14px 32px',
backgroundColor: '#0ea5e9',
color: '#ffffff',
border: 'none',
borderRadius: '8px',
fontSize: '16px',
fontWeight: '600',
cursor: 'pointer',
minHeight: '50px',
minWidth: '200px',
boxShadow: '0 4px 14px rgba(14, 165, 233, 0.4)',
},
secondaryButton: {
padding: '14px 32px',
backgroundColor: '#ffffff',
color: '#0f172a',
border: '1px solid #e2e8f0',
borderRadius: '8px',
fontSize: '16px',
fontWeight: '600',
cursor: 'pointer',
minHeight: '50px',
minWidth: '200px',
boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
},
featuresSection: {
display: 'flex',
flexWrap: 'wrap',
gap: '24px',
justifyContent: 'center',
width: '100%',
},
featureCard: {
flex: '1 1 300px',
backgroundColor: '#ffffff',
padding: '30px',
borderRadius: '16px',
boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
border: '1px solid #f1f5f9',
textAlign: 'left',
},
featureTitle: {
fontSize: '20px',
fontWeight: '700',
color: '#0f172a',
margin: '0 0 12px 0',
},
featureText: {
fontSize: '15px',
color: '#64748b',
lineHeight: '1.6',
margin: 0,
}
};
export default LandingPage;
