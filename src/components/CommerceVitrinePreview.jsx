import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalizarCommerceConfig } from '../core/commerceConfig';
import './CommerceSolicitacao.css';
import './CommerceVitrinePreview.css';

const PRODUTOS_EXEMPLO = [
  { nome: 'Produto demonstrativo 1', detalhe: 'Exemplo de item em destaque', preco: 'R$ 89,90', simbolo: '📦' },
  { nome: 'Produto demonstrativo 2', detalhe: 'Exemplo de item em oferta', preco: 'R$ 49,90', simbolo: '✨' },
];

export default function CommerceVitrinePreview({ lojaIdRota }) {
  const [situacao, setSituacao] = useState('autenticando');
  const [config, setConfig] = useState(null);
  const [semConfiguracao, setSemConfiguracao] = useState(false);
  const [modo, setModo] = useState('desktop');
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    let ativo = true;
    let versao = 0;
    const cancelar = onAuthStateChanged(
      auth,
      (usuario) => {
        const atual = ++versao;
        if (!usuario) {
          setConfig(null);
          setSituacao('login');
          return;
        }

        const idDaLoja = lojaIdRota === 'previa' ? usuario.uid : lojaIdRota;
        // A comparação precede qualquer consulta. Nenhum dado de outra loja é lido.
        if (!idDaLoja || usuario.uid !== idDaLoja) {
          setConfig(null);
          setSituacao('proibido');
          return;
        }

        setSituacao('carregando');
        void (async () => {
          try {
            const snap = await getDoc(doc(db, 'lojas', idDaLoja, 'dados', 'configuracoes'));
            if (!ativo || atual !== versao) return;
            const dados = snap.exists() ? snap.data()?.commerceConfig : null;
            setConfig(normalizarCommerceConfig(dados || {}, null, idDaLoja));
            setSemConfiguracao(!dados);
            setSituacao('pronto');
          } catch {
            if (!ativo || atual !== versao) return;
            setConfig(null);
            setSituacao('erro');
          }
        })();
      },
      () => {
        if (ativo) {
          setConfig(null);
          setSituacao('erro');
        }
      }
    );
    return () => {
      ativo = false;
      versao++;
      cancelar();
    };
  }, [lojaIdRota, recarregar]);

  if (situacao !== 'pronto') {
    const mensagem = {
      autenticando: 'Verificando o acesso à prévia…',
      carregando: 'Carregando as configurações salvas da loja…',
      login: 'Entre na sua conta ZenOS para visualizar a prévia da sua loja.',
      proibido: 'Este link pertence a outra loja. Entre com a conta correspondente.',
      erro: 'Não foi possível ler as configurações. Verifique seu acesso e tente novamente.',
    }[situacao];
    return (
      <main className="commerce-link-preview commerce-preview-message">
        <div className="commerce-preview-access-card" role="status">
          <span className="commerce-preview-private-badge">🔒 PRÉVIA PRIVADA</span>
          <h1>Minha Vitrine Online</h1>
          <p>{mensagem}</p>
          {situacao === 'login' && <p>Depois de entrar, abra este link de prévia novamente.</p>}
          <div className="commerce-preview-access-actions">
            {(situacao === 'login' || situacao === 'proibido') && <a href="/login">Entrar no ZenOS</a>}
            {situacao === 'erro' && <button type="button" onClick={() => setRecarregar(n => n + 1)}>Tentar novamente</button>}
          </div>
        </div>
      </main>
    );
  }

  const cor = config.corTema || '#0284c7';
  return (
    <main className="commerce-link-preview">
      <header className="commerce-link-preview-header">
        <div>
          <span className="commerce-preview-private-badge">🔒 PRÉVIA PRIVADA · SOMENTE LEITURA</span>
          <h1>Veja como sua loja vai ficar</h1>
          <p>Esta é uma demonstração visual. Nenhum pedido ou pagamento será realizado.</p>
        </div>
        <div className="commerce-link-preview-actions">
          <button type="button" onClick={() => setRecarregar(n => n + 1)}>↻ Atualizar prévia</button>
          <a href="/">Voltar ao ZenOS</a>
        </div>
      </header>

      {semConfiguracao && (
        <p className="commerce-link-preview-notice" role="status">
          Ainda não há configurações da vitrine salvas na nuvem. Edite e salve em “Minha Loja Online” para vê-las aqui.
        </p>
      )}

      <section className="commerce-link-preview-stage" aria-label="Visualização da vitrine">
        <div className="commerce-preview-topbar">
          <div className="commerce-preview-title-box">
            <span className="commerce-preview-kicker">DEMONSTRAÇÃO AO VIVO</span>
            <h2>Visualização da vitrine</h2>
          </div>
          <div className="commerce-preview-device-switch" role="group" aria-label="Tamanho da prévia">
            <button type="button" className={`commerce-device-btn ${modo === 'mobile' ? 'active' : ''}`} aria-pressed={modo === 'mobile'} onClick={() => setModo('mobile')}>📱 Celular</button>
            <button type="button" className={`commerce-device-btn ${modo === 'desktop' ? 'active' : ''}`} aria-pressed={modo === 'desktop'} onClick={() => setModo('desktop')}>💻 Computador</button>
          </div>
        </div>

        <div className={`commerce-mockup-wrapper ${modo}`}>
          {modo === 'desktop' ? (
            <div className="commerce-browser-bar">
              <div className="commerce-browser-dots">
                <span className="browser-dot red" /><span className="browser-dot yellow" /><span className="browser-dot green" />
              </div>
              <div className="commerce-browser-address">🔒 Prévia privada do ZenOS</div>
            </div>
          ) : (
            <div className="commerce-phone-header-notch"><span className="phone-speaker" /><span className="phone-cam" /></div>
          )}

          <div className="commerce-mockup-screen">
            {config.avisoTopo && <div className="mock-top-banner" style={{ backgroundColor: cor }}>📢 {config.avisoTopo}</div>}
            <div className="mock-cover-banner" style={config.bannerUrl
              ? { backgroundImage: `url("${config.bannerUrl}")` }
              : { background: `linear-gradient(135deg, ${cor}, #0b1120)` }}>
              {!config.bannerUrl && <span className="mock-cover-empty-text">{config.nomeLoja || 'Minha Loja Online'}</span>}
            </div>

            <div className="mock-store-header">
              <div className="mock-logo-box">
                {config.logoUrl ? <img src={config.logoUrl} alt="Logo da loja" className="mock-logo-img" /> :
                  <div className="mock-logo-placeholder" style={{ borderColor: cor }}>🏪</div>}
              </div>
              <h3 className="mock-store-name">{config.nomeLoja || 'Nome da sua loja'}</h3>
              {config.slogan && <p className="mock-store-slogan">{config.slogan}</p>}

              <div className="mock-badges-row">
                {config.horarioFuncionamento && <span className="mock-badge">🕒 {config.horarioFuncionamento}</span>}
                {config.aceitaEntrega && <span className="mock-badge">🛵 Entrega {config.taxaEntrega && `(${config.taxaEntrega})`}</span>}
                {config.aceitaRetirada && <span className="mock-badge">🏪 Retirada na loja</span>}
                {config.chavePix && <span className="mock-badge">⚡ Pix aceito</span>}
              </div>

              <div className="mock-action-row">
                <span className="mock-btn-whatsapp" aria-disabled="true">💬 Pedido por WhatsApp · Exemplo</span>
              </div>
              {config.descricao && <div className="mock-about-card"><small>Sobre nós</small><p>{config.descricao}</p></div>}
            </div>

            <div className="mock-catalog-section">
              <div className="mock-search-bar"><span>🔍</span><span>Buscar produtos (demonstração)</span></div>
              <div className="mock-category-tabs">
                <span className="mock-cat-tab active" style={{ backgroundColor: cor }}>Destaques</span>
                <span className="mock-cat-tab">Ofertas</span>
              </div>
              <div className="mock-products-grid">
                {PRODUTOS_EXEMPLO.map(item => (
                  <div className="mock-product-card" key={item.nome}>
                    <div className="mock-product-thumb"><span>{item.simbolo}</span></div>
                    <div className="mock-product-details">
                      <strong>{item.nome}</strong>
                      <small>{item.detalhe}</small>
                      {config.mostrarPreco && <div className="mock-product-price-row"><span className="mock-price">{item.preco}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mock-footer">
              {config.aceitaRetirada && config.enderecoRetirada && <div className="mock-footer-row">📍 Retirada: {config.enderecoRetirada}</div>}
              {config.aceitaEntrega && <div className="mock-footer-row">🛵 Entrega: {config.taxaEntrega || 'A combinar'} ({config.prazoEstimado || 'Sob consulta'})</div>}
              <div className="mock-footer-brand"><span>Prévia demonstrativa · sem pedidos reais</span><small>ZenOS Commerce</small></div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
