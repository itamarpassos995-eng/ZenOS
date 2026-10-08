import React, { useMemo, useState } from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function ZenSidebar({
  compacta,
  onToggleCompacta,
  mobileAberta,
  onFecharMobile,
  ecraAtual,
  grupos = [],
  perfilLoja,
  usuarioAutenticado,
  patenteUsuario,
  userId,
  onEditarPerfil,
  editarPerfilLabel = 'Editar nome e logo',
  onHome,
  onSair,
}) {
  const defaults = useMemo(() => Object.fromEntries(grupos.map(g => [g.id, g.abertaInicial !== false])), [grupos]);
  const [abertas, setAbertas] = useState(defaults);
  const [flyout, setFlyout] = useState(null);

  const alternarGrupo = (id) => {
    if (compacta) {
      setFlyout(prev => prev === id ? null : id);
      return;
    }
    setAbertas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selecionar = (item) => {
    item.onClick?.();
    setFlyout(null);
    onFecharMobile?.();
  };

  return (
    <>
      {mobileAberta && <button className="zen-sidebar-backdrop" onClick={onFecharMobile} aria-label="Fechar menu" />}
      <aside className={cx('zen-sidebar', compacta && 'is-compact', mobileAberta && 'is-mobile-open')}>
        <div className="zen-sidebar-brand">
          <button className="zen-brand-hit" onClick={onHome} title="Painel Inicial">
            <img src="/logo-zenos.png?v=4" alt="ZenOS" className="zen-brand-logo" />
            {!compacta && <div className="zen-brand-copy"><strong>Zen<span>OS</span></strong><small>SISTEMA DE GESTÃO</small></div>}
          </button>
          <button className="zen-collapse-button" onClick={onToggleCompacta} title={compacta ? 'Expandir menu' : 'Recolher menu'}>{compacta ? '›' : '‹'}</button>
        </div>

        {!compacta && (
          <div className="zen-user-card">
            <div className="zen-user-avatar">{(perfilLoja?.nomeFantasia || usuarioAutenticado || 'A').trim().charAt(0).toUpperCase()}</div>
            <div className="zen-user-copy">
              <strong>{perfilLoja?.nomeFantasia || 'Administrador'}</strong>
              <span>{usuarioAutenticado || 'loja@zenos.com'}</span>
              <small>ID: {userId ? userId.substring(0, 8).toUpperCase() : '---'}</small>
            </div>
            <span className="zen-role-badge">{patenteUsuario}</span>
          </div>
        )}

        {!compacta && onEditarPerfil && <button className="zen-edit-profile" onClick={onEditarPerfil}>✏️ {editarPerfilLabel}</button>}

        <nav className="zen-nav" aria-label="Navegação principal">
          <button className={cx('zen-nav-direct', ecraAtual === 'hub' && 'active')} onClick={() => selecionar({ onClick: onHome })} title="Painel Inicial">
            <span className="zen-nav-icon">⌂</span>{!compacta && <span>Painel Inicial</span>}
          </button>

          {grupos.map(grupo => {
            const temAtivo = grupo.itens.some(item => item.tela === ecraAtual);
            const aberta = !!abertas[grupo.id];
            const flyoutAberto = flyout === grupo.id;
            return (
              <div className={cx('zen-nav-group', temAtivo && 'has-active')} key={grupo.id}>
                <button className="zen-nav-group-head" onClick={() => alternarGrupo(grupo.id)} title={grupo.titulo}>
                  <span className="zen-nav-icon">{grupo.icone}</span>
                  {!compacta && <><span className="zen-nav-group-title">{grupo.titulo}</span><span className="zen-nav-chevron">{aberta ? '⌃' : '⌄'}</span></>}
                </button>
                {!compacta && aberta && (
                  <div className="zen-nav-subitems">
                    {grupo.itens.map(item => (
                      <button key={item.id} className={cx('zen-nav-subitem', item.tela === ecraAtual && 'active')} onClick={() => selecionar(item)}>
                        <span>{item.icone}</span><span>{item.rotulo}</span>{item.badge != null && <b>{item.badge}</b>}
                      </button>
                    ))}
                  </div>
                )}
                {compacta && flyoutAberto && (
                  <div className="zen-nav-flyout">
                    <div className="zen-nav-flyout-title">{grupo.titulo}</div>
                    {grupo.itens.map(item => (
                      <button key={item.id} className={cx('zen-nav-subitem', item.tela === ecraAtual && 'active')} onClick={() => selecionar(item)}>
                        <span>{item.icone}</span><span>{item.rotulo}</span>{item.badge != null && <b>{item.badge}</b>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="zen-sidebar-footer">
          <button onClick={onSair} title="Sair da loja"><span>↪</span>{!compacta && <span>Sair da loja</span>}</button>
        </div>
      </aside>
    </>
  );
}

export function ZenTopbar({
  onAbrirMobile,
  status,
  statusTitle,
  labelErroSincronizacao = 'Erro ao sincronizar',
  idioma,
  setIdioma,
  moeda,
  setMoeda,
  onCambio,
  operador,
  patente,
  onTrocarOperador,
  tema,
  onAlternarTema,
}) {
  const labelSync = status === 'SINCRONIZADO' ? 'Sincronizado' : status === 'SALVANDO' ? 'Salvando...' : status === 'OFFLINE' ? 'Offline' : status === 'ERRO' ? labelErroSincronizacao : 'Pendente';
  return <header className="zen-topbar no-print">
    <div className="zen-topbar-left">
      <button className="zen-mobile-menu" onClick={onAbrirMobile}>☰</button>
      <div className="zen-topbar-mini-brand"><img src="/logo-zenos.png?v=4" alt="ZenOS"/><div><strong>Zen<span>OS</span></strong><small>SISTEMA DE GESTÃO</small></div></div>
    </div>
    <div className="zen-topbar-actions">
      <div className={cx('zen-sync-pill', `sync-${String(status || '').toLowerCase()}`)} title={statusTitle || status}><i/> <span>{labelSync}</span></div>
      <label className="zen-top-control"><span>🌐</span><select value={idioma} onChange={e => setIdioma(e.target.value)}><option value="pt">Português (PT)</option><option value="es">Español (ES)</option><option value="en">English (EN)</option></select></label>
      <label className="zen-top-control"><span>🇧🇷</span><select value={moeda} onChange={e => setMoeda(e.target.value)}><option value="BRL">BRL (R$)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="PYG">PYG (₲)</option></select><button onClick={onCambio} title="Ajustar cotações">⚙</button></label>
      <button className="zen-theme-toggle" onClick={onAlternarTema} title="Alternar tema">{tema === 'dark' ? '☾ Escuro' : '☀ Claro'}</button>
      <div className="zen-operator-chip"><span>Operador:</span><strong className={patente === 'gerencia' ? 'manager' : ''}>{operador || 'Admin'}</strong></div>
      <button className="zen-switch-user" onClick={onTrocarOperador}>Trocar Operador</button>
    </div>
  </header>;
}

export function ZenHero({ operador, patente }) {
  const agora = new Date();
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return <section className="zen-hero">
    <div className="zen-hero-copy">
      <span className="zen-eyebrow">ZENOS (CLOUD)</span>
      <h1>Olá, {operador || 'Administrador'}! <span className="zen-wave">👋</span></h1>
      <p>Aqui está um resumo da sua operação. Tudo sob controle.</p>
      <div className="zen-hero-meta"><span>▣ {data}</span><i/><span>◷ {hora}</span><b>{patente}</b></div>
    </div>
    <div className="zen-hero-art" aria-hidden="true">
      <div className="zen-device back"><div className="zen-grid-lines"/></div>
      <div className="zen-device front"><img src="/logo-zenos.png?v=4" alt=""/><strong>Zen<span>OS</span></strong><small>SISTEMA DE GESTÃO</small></div>
      <blockquote>“Gestão simples<br/>para grandes<br/><strong>resultados.</strong>”<i/></blockquote>
    </div>
  </section>;
}

export function ZenKpiCard({ icon, titulo, valor, detalhe, tone = 'teal', trailing }) {
  return <div className={cx('zen-kpi-card', `tone-${tone}`)}>
    <div className="zen-kpi-icon">{icon}</div>
    <div className="zen-kpi-copy"><span>{titulo}</span><strong>{valor}</strong><small>{detalhe}</small></div>
    <div className="zen-kpi-trailing">{trailing}</div>
  </div>;
}

export function ZenQuickCard({ icon, titulo, detalhe, tone = 'teal', onClick }) {
  return <button className={cx('zen-quick-card', `tone-${tone}`)} onClick={onClick}>
    <span className="zen-quick-icon">{icon}</span><strong>{titulo}</strong><small>{detalhe}</small><i>→</i>
  </button>;
}
