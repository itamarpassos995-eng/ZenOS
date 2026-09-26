import React, { useState } from 'react';

export default function LandingPage({ aoIrParaLogin }) {
  const [emailInteresse, setEmailInteresse] = useState('');
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (emailInteresse.trim()) {
      setEnviado(true);
      setEmailInteresse('');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowX: 'hidden' }}>
      
      {/* Background Gradients de Alta Performance */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '1000px', height: '400px', background: 'radial-gradient(circle at 50% 0%, rgba(79, 70, 229, 0.12) 0%, rgba(2, 6, 23, 0) 70%)', zIndex: 0, pointerEvents: 'none' }}></div>

      {/* Header Corporativo */}
      <header style={{ padding: '24px 60px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(30, 41, 59, 0.4)', zIndex: 10, backdropFilter: 'blur(12px)', backgroundColor: 'rgba(2, 6, 23, 0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ backgroundColor: '#ffffff', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '38px', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
            <img src="/Logo.png.jpeg" alt="ZenOS" style={{ height: '28px', width: 'auto', objectFit: 'contain' }} onError={(e) => e.target.src = '/logo.png'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ color: '#f8fafc', fontWeight: 900, fontSize: '20px', letterSpacing: '4px' }}>ZenOS</span>
            <span style={{ color: '#6366f1', fontWeight: 800, fontSize: '9px', letterSpacing: '2px' }}>ENTERPRISE</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button onClick={aoIrParaLogin} style={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#cbd5e1', padding: '10px 20px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>
            Entrar no Sistema
          </button>
          <button onClick={aoIrParaLogin} style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '8px', fontSize: '12px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 20px rgba(79, 70, 229, 0.4)' }}>
            Solicitar Acesso
          </button>
        </div>
      </header>

      {/* Hero Section de Alto Impacto */}
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '80px 20px 60px 20px', zIndex: 1, maxWidth: '1000px', margin: '0 auto' }}>
        
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', padding: '8px 18px', borderRadius: '999px', marginBottom: '32px' }}>
          <div style={{ width: '6px', height: '6px', backgroundColor: '#6366f1', borderRadius: '50%', boxShadow: '0 0 10px #6366f1' }}></div>
          <span style={{ color: '#a5b4fc', fontSize: '11px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase' }}>Sistema Operacional de Gestão Multiloja</span>
        </div>

        <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.05, margin: '0 0 28px 0', letterSpacing: '-1.5px', color: '#ffffff' }}>
          Controle absoluto da sua operação. <br/>
          <span style={{ background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sem margem para erros.</span>
        </h1>

        <p style={{ color: '#94a3b8', fontSize: '18px', lineHeight: 1.7, maxWidth: '740px', margin: '0 0 48px 0', fontWeight: 400 }}>
          O ZenOS unifica PDV de alta velocidade, dados isolados por tenant (Multi-Tenant), gestão financeira em tempo real, câmbio multi-moeda e inteligência executiva numa única plataforma em nuvem.
        </p>

        {/* Call to Action Box Corporativa */}
        <div style={{ width: '100%', maxWidth: '520px', backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '16px', padding: '36px', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}>
          {enviado ? (
            <div style={{ padding: '24px', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid #10b981', borderRadius: '10px' }}>
              <h3 style={{ color: '#34d399', margin: '0 0 8px 0', fontSize: '16px', fontWeight: 900 }}>Solicitação Registada</h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Nossa equipe comercial entrará em contacto para homologação do seu ambiente.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
              <label style={{ fontSize: '11px', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Acelere a digitalização da sua empresa</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="email" 
                  required
                  placeholder="Insira o seu e-mail corporativo..." 
                  value={emailInteresse}
                  onChange={(e) => setEmailInteresse(e.target.value)}
                  style={{ flex: 1, backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '10px', padding: '14px 18px', color: '#fff', fontSize: '14px', outline: 'none' }}
                />
                <button type="submit" style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', border: 'none', color: '#fff', padding: '0 24px', borderRadius: '10px', fontSize: '13px', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 4px 15px rgba(79, 70, 229, 0.4)' }}>
                  Solicitar Demo
                </button>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>Atendimento direcionado a empresas, atacadões e comércio corporativo.</span>
            </form>
          )}
        </div>

        {/* Pilares Estratégicos (Bento Grid Style) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', width: '100%', marginTop: '90px', textAlign: 'left' }}>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '14px', padding: '30px' }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#818cf8', marginBottom: '12px' }}>01 / ISOLAMENTO</div>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: '0 0 10px 0' }}>Segurança Multi-Tenant</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0, lineHeight: 1.6 }}>Ambiente operacional 100% privado por loja no Firestore, garantindo sigilo financeiro e estabilidade intransigível.</p>
          </div>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '14px', padding: '30px' }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#38bdf8', marginBottom: '12px' }}>02 / VELOCIDADE</div>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: '0 0 10px 0' }}>PDV & Retaguarda Integrados</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0, lineHeight: 1.6 }}>Emissão rápida de vendas, controlo de fiados, gaveta de caixa blindada e gestão de comissões sem atritos.</p>
          </div>
          <div style={{ backgroundColor: '#0b1120', border: '1px solid #1e293b', borderRadius: '14px', padding: '30px' }}>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#c084fc', marginBottom: '12px' }}>03 / INTELIGÊNCIA</div>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#fff', margin: '0 0 10px 0' }}>Visão Executiva (CEO)</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0, lineHeight: 1.6 }}>Cálculo real de lucro líquido, Curva ABC de produtos e acompanhamento financeiro em tempo real na palma da mão.</p>
          </div>
        </div>

      </main>

      {/* Footer Corporativo */}
      <footer style={{ padding: '30px 60px', borderTop: '1px solid rgba(30, 41, 59, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748b' }}>
        <span>© 2026 ZenOS Enterprise. Todos os direitos reservados.</span>
        <span>Infraestrutura em Nuvem de Alta Performance</span>
      </footer>

    </div>
  );
}