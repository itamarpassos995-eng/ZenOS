import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { normalizarCommerceConfig } from '../core/commerceConfig';
import ZenCommerceStorefront from './ZenCommerceStorefront';
import './CommerceVitrinePreview.css';
import '../commerce.css';

export default function CommerceVitrinePreview({ lojaIdRota }) {
  const [situacao, setSituacao] = useState('autenticando');
  const [config, setConfig] = useState(null);
  const [semConfiguracao, setSemConfiguracao] = useState(false);
  const [produtosLoja, setProdutosLoja] = useState([]);
  const [modo, setModo] = useState('full'); // 'full', 'desktop', 'mobile'
  const [recarregar, setRecarregar] = useState(0);

  // Ao voltar da edição, buscar a versão salva sem qualquer operação de escrita.
  useEffect(() => {
    const aoFocar = () => setRecarregar(n => n + 1);
    window.addEventListener('focus', aoFocar);
    return () => window.removeEventListener('focus', aoFocar);
  }, []);

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

        const idDaLoja = lojaIdRota === 'previa' ? usuario.uid : (lojaIdRota || usuario.uid);
        if (!idDaLoja || usuario.uid !== idDaLoja) {
          setConfig(null);
          setSituacao('proibido');
          return;
        }

        setSituacao('carregando');
        void (async () => {
          try {
            const [snapConfig, snapLoja] = await Promise.all([
              getDoc(doc(db, 'lojas', idDaLoja, 'dados', 'configuracoes')),
              getDoc(doc(db, 'lojas', idDaLoja)).catch(() => null)
            ]);

            if (!ativo || atual !== versao) return;

            const dadosConfig = snapConfig && snapConfig.exists() ? snapConfig.data()?.commerceConfig : null;
            const produtos = snapLoja && snapLoja.exists() && Array.isArray(snapLoja.data()?.produtos)
              ? snapLoja.data().produtos
              : [];

            setConfig(normalizarCommerceConfig(dadosConfig || {}, null, idDaLoja));
            setSemConfiguracao(!dadosConfig);
            setProdutosLoja(produtos);
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
      autenticando: 'Verificando o acesso à vitrine…',
      carregando: 'Carregando as configurações da sua loja…',
      login: 'Entre na sua conta ZenOS para visualizar a vitrine da sua loja.',
      proibido: 'Este link pertence a outra loja. Entre com a conta correspondente.',
      erro: 'Não foi possível ler as configurações. Verifique sua conexão e tente novamente.'
    }[situacao];

    return (
      <main className="commerce-link-preview commerce-preview-message">
        <div className="commerce-preview-access-card" role="status">
          <span className="commerce-preview-private-badge">🔒 PRÉVIA PRIVADA</span>
          <h1>Minha Vitrine Online</h1>
          <p>{mensagem}</p>
          {situacao === 'login' && <p>Depois de entrar, abra este link novamente.</p>}
          <div className="commerce-preview-access-actions">
            {(situacao === 'login' || situacao === 'proibido') && <a href="/login">Entrar no ZenOS</a>}
            {situacao === 'erro' && <button type="button" onClick={() => setRecarregar(n => n + 1)}>Tentar novamente</button>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="commerce-vitrine-preview-container">
      {/* Barra de controle discreta no topo */}
      <header className="commerce-preview-admin-toolbar" role="region" aria-label="Controles da prévia">
        <div className="toolbar-left">
          <span className="badge-status">🔒 PRÉVIA PRIVADA · ZENOS COMMERCE</span>
          <span className="store-title">{config?.nomeLoja || 'Sua Loja'}</span>
        </div>

        <div className="toolbar-center">
          <div className="device-switcher" role="group" aria-label="Modo de visualização">
            <button
              type="button"
              className={modo === 'full' ? 'active' : ''}
              onClick={() => setModo('full')}
              title="Ver vitrine completa"
            >
              🖥️ Tela Cheia
            </button>
            <button
              type="button"
              className={modo === 'desktop' ? 'active' : ''}
              onClick={() => setModo('desktop')}
              title="Simular visualização de computador"
            >
              💻 Computador
            </button>
            <button
              type="button"
              className={modo === 'mobile' ? 'active' : ''}
              onClick={() => setModo('mobile')}
              title="Simular celular"
            >
              📱 Celular
            </button>
          </div>
        </div>

        <div className="toolbar-right">
          <button type="button" className="btn-refresh" onClick={() => setRecarregar(n => n + 1)}>
            ↻ Atualizar
          </button>
          <a href="/" className="btn-back">
            ← Voltar ao ZenOS
          </a>
        </div>
      </header>

      {semConfiguracao && <p className="commerce-link-preview-notice" role="status">
        Ainda não há configurações da vitrine salvas na nuvem. Edite e salve em “Minha Loja Online” para vê-las aqui.
      </p>}

      {/* Exibição da Vitrine */}
      <div className={`commerce-preview-viewport ${modo}`}>
        {modo === 'full' ? (
          <div className="commerce-full-viewport">
            <ZenCommerceStorefront
              idPublico={lojaIdRota}
              configCommerce={config}
              produtos={produtosLoja}
              isLivePreview={true}
            />
          </div>
        ) : (
          <div className={`commerce-device-frame ${modo}`}>
            {modo === 'desktop' ? (
              <div className="commerce-browser-bar">
                <div className="commerce-browser-dots">
                  <span className="browser-dot red" />
                  <span className="browser-dot yellow" />
                  <span className="browser-dot green" />
                </div>
                <div className="commerce-browser-address">
                  🔒 {window.location.host}/loja/{config?.lojaId || 'vitrine'}
                </div>
              </div>
            ) : (
              <div className="commerce-phone-header-notch">
                <span className="phone-speaker" />
                <span className="phone-cam" />
              </div>
            )}
            <div className="commerce-frame-inner">
              <ZenCommerceStorefront
                idPublico={lojaIdRota}
                configCommerce={config}
                produtos={produtosLoja}
                isLivePreview={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
