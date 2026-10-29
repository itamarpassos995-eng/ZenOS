import React, { useMemo, useState } from 'react';

const cx = (...parts) => parts.filter(Boolean).join(' ');

// O menu controla seu próprio estado: abrir/fechar não força um render do PDV,
// do histórico nem dos painéis recebidos em `children`.
export function ZenNavigationLayout({ sidebarProps, topbarProps, children }) {
  const [mobileAberta, setMobileAberta] = useState(false);
  const [compacta, setCompacta] = useState(false);

  return (
    <div className={cx('zen-shell', compacta && 'sidebar-compact')}>
      <ZenSidebar
        {...sidebarProps}
        compacta={compacta}
        mobileAberta={mobileAberta}
        onToggleCompacta={() => setCompacta(valor => !valor)}
        onFecharMobile={() => setMobileAberta(false)}
      />
      <div className="zen-content">
        <ZenTopbar {...topbarProps} onAbrirMobile={() => setMobileAberta(true)} />
        {children}
      </div>
    </div>
  );
}

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
  tx = (pt) => pt,
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
      {mobileAberta && <button className="zen-sidebar-backdrop" onClick={onFecharMobile} aria-label={tx('Fechar menu','Cerrar menú','Close menu')} />}
      <aside className={cx('zen-sidebar', compacta && 'is-compact', mobileAberta && 'is-mobile-open')}>
        <div className="zen-sidebar-brand">
          <button className="zen-brand-hit" onClick={onHome} title={tx('Painel Inicial','Panel Inicial','Dashboard')}>
            <img src="/logo-zenos.png?v=4" alt="ZenOS" className="zen-brand-logo" />
            {!compacta && <div className="zen-brand-copy"><strong>Zen<span>OS</span></strong><small>{tx('SISTEMA DE GESTÃO','SISTEMA DE GESTIÓN','MANAGEMENT SYSTEM')}</small></div>}
          </button>
          <button className="zen-collapse-button" onClick={onToggleCompacta} title={compacta ? tx('Expandir menu','Expandir menú','Expand menu') : tx('Recolher menu','Contraer menú','Collapse menu')}>{compacta ? '›' : '‹'}</button>
        </div>

        {!compacta && (
          <div className="zen-user-card">
            <div className="zen-user-avatar">{(perfilLoja?.nomeFantasia || usuarioAutenticado || 'A').trim().charAt(0).toUpperCase()}</div>
            <div className="zen-user-copy">
              <strong>{perfilLoja?.nomeFantasia || tx('Administrador','Administrador','Administrator')}</strong>
              <span>{usuarioAutenticado || 'loja@zenos.com'}</span>
              <small>ID: {userId ? userId.substring(0, 8).toUpperCase() : '---'}</small>
            </div>
            <span className="zen-role-badge">{patenteUsuario}</span>
          </div>
        )}

        {!compacta && onEditarPerfil && <button className="zen-edit-profile" onClick={onEditarPerfil}>✏️ {editarPerfilLabel}</button>}

        <nav className="zen-nav" aria-label={tx('Navegação principal','Navegación principal','Main navigation')}>
          <button className={cx('zen-nav-direct', ecraAtual === 'hub' && 'active')} onClick={() => selecionar({ onClick: onHome })} title={tx('Painel Inicial','Panel Inicial','Dashboard')}>
            <span className="zen-nav-icon">⌂</span>{!compacta && <span>{tx('Painel Inicial','Panel Inicial','Dashboard')}</span>}
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
          <button onClick={onSair} title={tx('Sair da loja','Salir de la tienda','Sign out of store')}><span>↪</span>{!compacta && <span>{tx('Sair da loja','Salir de la tienda','Sign out of store')}</span>}</button>
        </div>
      </aside>
    </>
  );
}

export function ZenTopbar({
  onAbrirMobile,
  onAbrirPedidosLoja,
  totalPedidosLoja = null,
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
  tx = (pt) => pt,
}) {
  const labelSync = status === 'SINCRONIZADO' ? tx('Sincronizado','Sincronizado','Synced') : status === 'SALVANDO' ? tx('Salvando...','Guardando...','Saving...') : status === 'OFFLINE' ? 'Offline' : status === 'ERRO' ? labelErroSincronizacao : tx('Pendente','Pendiente','Pending');
  return <header className="zen-topbar no-print">
    <div className="zen-topbar-left">
      <button className="zen-mobile-menu" onClick={onAbrirMobile}>☰</button>
      <div className="zen-topbar-mini-brand"><img src="/logo-zenos.png?v=4" alt="ZenOS"/><div><strong>Zen<span>OS</span></strong><small>{tx('SISTEMA DE GESTÃO','SISTEMA DE GESTIÓN','MANAGEMENT SYSTEM')}</small></div></div>
    </div>
    <div className="zen-topbar-actions">
      <div className={cx('zen-sync-pill', `sync-${String(status || '').toLowerCase()}`)} title={statusTitle || status}><i/> <span>{labelSync}</span></div>
      <label className="zen-top-control"><span>🌐</span><select value={idioma} onChange={e => setIdioma(e.target.value)}><option value="pt">Português (PT)</option><option value="es">Español (ES)</option><option value="en">English (EN)</option></select></label>
      <label className="zen-top-control"><span>🇧🇷</span><select value={moeda} onChange={e => setMoeda(e.target.value)}><option value="BRL">BRL (R$)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="PYG">PYG (₲)</option></select><button onClick={onCambio} title={tx('Ajustar cotações','Ajustar cotizaciones','Adjust exchange rates')}>⚙</button></label>
      {onAbrirPedidosLoja && <button type="button" className="zen-commerce-topbar-btn" onClick={onAbrirPedidosLoja}
        title={tx('Abrir pedidos da loja online no PDV','Abrir pedidos de la tienda online en caja','Open online store orders in POS')}
        aria-label={tx('Pedidos da loja online','Pedidos de la tienda online','Online store orders')}>
        <span aria-hidden="true">🛒</span>
        <strong>{tx('Pedidos Online','Pedidos Online','Online Orders')}</strong>
        {totalPedidosLoja > 0 && <span className="zen-commerce-topbar-badge" aria-live="polite">
          {totalPedidosLoja > 50 ? '50+' : totalPedidosLoja}
        </span>}
      </button>}
      <button className="zen-theme-toggle" onClick={onAlternarTema} title={tx('Alternar tema','Cambiar tema','Toggle theme')}>{tema === 'dark' ? `☾ ${tx('Escuro','Oscuro','Dark')}` : `☀ ${tx('Claro','Claro','Light')}`}</button>
      <div className="zen-operator-chip"><span>{tx('Operador:','Operador:','Operator:')}</span><strong className={patente === 'gerencia' ? 'manager' : ''}>{operador || 'Admin'}</strong></div>
      <button className="zen-switch-user" onClick={onTrocarOperador}>{tx('Trocar Operador','Cambiar Operador','Switch Operator')}</button>
    </div>
  </header>;
}

export function ZenHero({ operador, patente, idioma = 'pt', tx = (pt) => pt }) {
  const agora = new Date();
  const locale = idioma === 'es' ? 'es-PY' : idioma === 'en' ? 'en-US' : 'pt-BR';
  const data = agora.toLocaleDateString(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const hora = agora.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return <section className="zen-hero">
    <div className="zen-hero-copy">
      <span className="zen-eyebrow">ZENOS (CLOUD)</span>
      <h1>{tx('Olá','Hola','Hello')}, {operador || tx('Administrador','Administrador','Administrator')}! <span className="zen-wave">👋</span></h1>
      <p>{tx('Aqui está um resumo da sua operação. Tudo sob controle.','Aquí está un resumen de su operación. Todo bajo control.','Here is a summary of your operation. Everything is under control.')}</p>
      <div className="zen-hero-meta"><span>▣ {data}</span><i/><span>◷ {hora}</span><b>{patente}</b></div>
    </div>
    <div className="zen-hero-art" aria-hidden="true">
      <div className="zen-device back"><div className="zen-grid-lines"/></div>
      <div className="zen-device front"><img src="/logo-zenos.png?v=4" alt=""/><strong>Zen<span>OS</span></strong><small>{tx('SISTEMA DE GESTÃO','SISTEMA DE GESTIÓN','MANAGEMENT SYSTEM')}</small></div>
      <blockquote>“{tx('Gestão simples','Gestión simple','Simple management')}<br/>{tx('para grandes','para grandes','for great')}<br/><strong>{tx('resultados.','resultados.','results.')}</strong>”<i/></blockquote>
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
