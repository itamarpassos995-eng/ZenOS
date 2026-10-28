import React, { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  normalizarCommerceConfig,
  lerCommerceConfigLocal,
  salvarCommerceConfigLocal,
  comprimirImagem
} from '../core/commerceConfig';
import { notifyPersistenceStatus } from '../core/persistenceSafety';
import ZenModal from './ZenModal';
import ZenCommerceStorefront from './ZenCommerceStorefront';
import './CommerceSolicitacao.css';

const translation = {
  nao_solicitado: ['Disponível para solicitar', 'Disponible para solicitar', 'Available to request'],
  pendente_analise: ['Solicitação recebida', 'Solicitud recibida', 'Request received'],
  em_analise: ['Em análise', 'En evaluación', 'Under review'],
  aprovado: ['Aprovação registrada — ativação pendente', 'Aprobación registrada — activación pendiente', 'Approved — awaiting activation'],
  rejeitado: ['Solicitação revisada — entre em contato com o ZenOS', 'Solicitud revisada — contacte a ZenOS', 'Request reviewed — contact ZenOS'],
};

const helpError = (error, tx) => {
  const code = String(error?.code || '');
  if (code.includes('unauthenticated')) return tx('Faça login novamente para consultar sua solicitação.', 'Inicie sesión de nuevo para consultar su solicitud.', 'Sign in again to check your request.');
  if (code.includes('permission-denied')) return tx('Não foi possível confirmar que esta loja pertence à sua conta.', 'No se pudo confirmar que esta tienda pertenece a su cuenta.', 'We could not verify that this store belongs to your account.');
  return tx('Não foi possível confirmar a operação. Tente novamente mais tarde.', 'No fue posible confirmar la operación. Intente nuevamente más tarde.', 'Could not confirm the operation. Try again later.');
};

const CORES_TEMA = [
  { id: '#0284c7', nome: 'Azul Zen' },
  { id: '#6366f1', nome: 'Índigo' },
  { id: '#10b981', nome: 'Esmeralda' },
  { id: '#f59e0b', nome: 'Âmbar' },
  { id: '#f43f5e', nome: 'Rosa Rubi' },
  { id: '#8b5cf6', nome: 'Púrpura' },
  { id: '#0f172a', nome: 'Grafite' }
];

export default function CommerceSolicitacao({ lojaId, perfilLoja = null, produtos = [], tx = (pt) => pt }) {
  const [configCommerce, setConfigCommerce] = useState(() => lerCommerceConfigLocal(lojaId, perfilLoja));
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [modalZen, setModalZen] = useState(null);
  const [modoPrevia, setModoPrevia] = useState('mobile'); // 'mobile' | 'desktop'

  // Controle das seções retráteis / rebatíveis
  const [secoesAbertas, setSecoesAbertas] = useState({
    apresentacao: true,
    imagens: true,
    atendimento: false,
    entregas: false,
    modulo: false,
  });

  // Estados da solicitação original do módulo
  const [registro, setRegistro] = useState(null);
  const [erro, setErro] = useState('');
  const [carregandoModulo, setCarregandoModulo] = useState(true);
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);
  const seq = useRef(0);

  const fileLogoRef = useRef(null);
  const fileBannerRef = useRef(null);

  const urlVitrine = typeof window !== 'undefined'
    ? `${window.location.origin}/loja/${lojaId || ''}`
    : `https://zenos-ac6b2.web.app/loja/${lojaId || ''}`;

  const avisarZen = (variante, titulo, mensagem, detalhes = []) => {
    setModalZen({ variante, titulo, mensagem, detalhes, apenasConfirmar: true });
  };

  const alternarSecao = (chave) => {
    setSecoesAbertas((prev) => ({
      ...prev,
      [chave]: !prev[chave],
    }));
  };

  const alternarTodasSecoes = (abrir) => {
    setSecoesAbertas({
      apresentacao: abrir,
      imagens: abrir,
      atendimento: abrir,
      entregas: abrir,
      modulo: abrir,
    });
  };

  // Carregar dados de configuração do Firestore
  useEffect(() => {
    let ativo = true;
    async function carregarDados() {
      if (!lojaId) return;
      try {
        const snap = await getDoc(doc(db, 'lojas', lojaId, 'dados', 'configuracoes'));
        if (ativo && snap.exists()) {
          const dadosDoc = snap.data() || {};
          if (dadosDoc.commerceConfig) {
            const normalizado = normalizarCommerceConfig(dadosDoc.commerceConfig, perfilLoja, lojaId);
            setConfigCommerce(normalizado);
            salvarCommerceConfigLocal(lojaId, normalizado);
          }
        }
      } catch (err) {
        console.warn('[Commerce] Leitura de configurações offline ou sem permissão:', err);
      }
    }
    carregarDados();
    return () => { ativo = false; };
  }, [lojaId, perfilLoja]);

  // Preservar a validação original da solicitação e seu isolamento por loja.
  const chamar = async (action) => {
    const user = auth.currentUser;
    if (!user || user.uid !== lojaId) {
      throw Object.assign(new Error('Identidade não confirmada'), { code: 'permission-denied' });
    }
    const callable = httpsCallable(getFunctions(undefined, 'southamerica-east1'), 'commerceSolicitacaoCliente', { timeout: 35000 });
    const response = await callable({ action, lojaId });
    if (!translation[response.data?.status] || response.data?.habilitado !== false) {
      throw Error('COMMERCE_RESPONSE_UNEXPECTED');
    }
    return response.data;
  };

  const consultar = async () => {
    const version = ++seq.current;
    setCarregandoModulo(true);
    setErro('');
    try {
      const data = await chamar('consultar');
      if (seq.current === version) setRegistro(data);
    } catch (e) {
      if (seq.current === version) {
        setRegistro(null);
        setErro(helpError(e, tx));
      }
    } finally {
      if (seq.current === version) setCarregandoModulo(false);
    }
  };

  useEffect(() => {
    seq.current++;
    setRegistro(null);
    setErro('');
    setEnviandoSolicitacao(false);
    void consultar();
    return () => { seq.current++; };
  }, [lojaId]);

  const solicitar = async () => {
    if (enviandoSolicitacao || carregandoModulo || registro?.status !== 'nao_solicitado') return;
    const version = ++seq.current;
    setEnviandoSolicitacao(true);
    setErro('');
    try {
      const data = await chamar('solicitar');
      if (seq.current === version) setRegistro(data);
    } catch (e) {
      if (seq.current === version) setErro(helpError(e, tx));
    } finally {
      if (seq.current === version) setEnviandoSolicitacao(false);
    }
  };

  const atualizarCampo = (campo, valor) => {
    setConfigCommerce(prev => ({ ...prev, [campo]: valor }));
  };

  const alternarStatusVitrine = () => {
    atualizarCampo('habilitado', !configCommerce.habilitado);
  };

  const copiarLinkVitrine = () => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(urlVitrine);
      } else {
        const inp = document.createElement('input');
        inp.value = urlVitrine;
        document.body.appendChild(inp);
        inp.select();
        document.execCommand('copy');
        document.body.removeChild(inp);
      }
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2500);
    } catch (e) {
      avisarZen('info', tx('Link da Vitrine', 'Enlace', 'Link'), urlVitrine);
    }
  };

  const lidarUploadImagem = async (e, campo, maxW = 800, maxH = 400) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      avisarZen(
        'warning',
        tx('Arquivo Inválido', 'Archivo Inválido', 'Invalid File'),
        tx('Por favor, selecione uma imagem válida (PNG, JPG ou WEBP).', 'Seleccione una imagen válida.', 'Please select a valid image.')
      );
      return;
    }

    try {
      const imagemComprimida = await comprimirImagem(file, maxW, maxH, 0.8);
      atualizarCampo(campo, imagemComprimida);
    } catch (err) {
      avisarZen(
        'danger',
        tx('Erro na Imagem', 'Error en Imagen', 'Image Error'),
        tx('Não foi possível processar a imagem. Tente uma imagem mais leve.', 'No fue posible procesar la imagen.', 'Could not process image.')
      );
    } finally {
      e.target.value = '';
    }
  };

  const salvarConfiguracoesLoja = async () => {
    if (!lojaId) return;
    if (auth.currentUser?.uid !== lojaId) {
      avisarZen(
        'danger',
        tx('Acesso não autorizado', 'Acceso no autorizado', 'Unauthorized access'),
        helpError({ code: 'permission-denied' }, tx)
      );
      return;
    }
    setSalvandoConfig(true);
    try {
      notifyPersistenceStatus({ status: 'SALVANDO', field: 'commerce_config' });
      const configNormalizada = normalizarCommerceConfig(configCommerce, perfilLoja, lojaId);

      await setDoc(
        doc(db, 'lojas', lojaId, 'dados', 'configuracoes'),
        {
          commerceConfig: configNormalizada,
          updatedAtClient: new Date().toISOString(),
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );

      salvarCommerceConfigLocal(lojaId, configNormalizada);
      notifyPersistenceStatus({ status: 'SINCRONIZADO', field: 'commerce_config' });

      avisarZen(
        'success',
        tx('Configurações Salvas!', '¡Configuraciones Guardadas!', 'Settings Saved!'),
        tx(
          'As configurações da sua loja online foram sincronizadas com sucesso no ZenOS Cloud.',
          'Las configuraciones se guardaron con éxito en la nube.',
          'Your online store settings were successfully synchronized to ZenOS Cloud.'
        )
      );
    } catch (err) {
      console.error('[Commerce] Falha ao salvar configurações:', err);
      notifyPersistenceStatus({ status: 'ERRO', field: 'commerce_config', error: err?.message });
      avisarZen(
        'danger',
        tx('Erro ao Salvar', 'Error al Guardar', 'Save Error'),
        tx(
          'Não foi possível salvar na nuvem agora. Suas alterações continuam salvas no dispositivo e tentaremos novamente.',
          'No fue posible guardar en la nube en este momento.',
          'Could not save to the cloud right now. Saved locally.'
        ),
        [err.message || String(err)]
      );
    } finally {
      setSalvandoConfig(false);
    }
  };

  const statusModulo = registro?.status || 'nao_solicitado';

  return (
    <div className="commerce-wrapper">
      {modalZen && (
        <ZenModal
          aberto={true}
          variante={modalZen.variante}
          titulo={modalZen.titulo}
          mensagem={modalZen.mensagem}
          detalhes={modalZen.detalhes}
          apenasConfirmar={modalZen.apenasConfirmar}
          onConfirmar={() => setModalZen(null)}
          onFechar={() => setModalZen(null)}
        />
      )}

      {/* CABEÇALHO */}
      <header className="commerce-header">
        <div className="commerce-header-top">
          <div className="commerce-title-group">
            <span className="commerce-badge-kicker">ZENOS COMMERCE</span>
            <h1>{tx('Minha Loja Online', 'Mi Tienda Online', 'My Online Store')}</h1>
            <p>
              {tx(
                'Personalize a vitrine pública da sua loja, configure entregas e WhatsApp e visualize em tempo real à direita.',
                'Personalice su vitrina pública, configure entregas y WhatsApp y visualice en tiempo real.',
                'Customize your public storefront, delivery rules and WhatsApp with live preview.'
              )}
            </p>
          </div>

          <div className="commerce-status-toggle">
            <div className="commerce-status-indicator">
              <span className={`commerce-dot ${configCommerce.habilitado ? 'active' : 'paused'}`} />
              <strong>
                {configCommerce.habilitado
                  ? tx('Vitrine NO AR', 'Tienda ACTIVA', 'Storefront LIVE')
                  : tx('Vitrine PAUSADA', 'Tienda PAUSADA', 'Storefront PAUSED')}
              </strong>
            </div>
            <button
              type="button"
              className={`commerce-toggle-btn ${configCommerce.habilitado ? 'on' : 'off'}`}
              onClick={alternarStatusVitrine}
            >
              {configCommerce.habilitado
                ? tx('Desativar', 'Desactivar', 'Deactivate')
                : tx('Ativar Vitrine', 'Activar Tienda', 'Activate Store')}
            </button>
          </div>
        </div>

        {/* CARD DO LINK PÚBLICO */}
        <div className="commerce-url-card">
          <div className="commerce-url-info">
            <span className="commerce-url-label">🔗 {tx('Link da sua Vitrine:', 'Enlace de su Tienda:', 'Storefront Link:')}</span>
            <code className="commerce-url-text">{urlVitrine}</code>
          </div>
          <div className="commerce-url-actions">
            <button
              type="button"
              className="commerce-btn-copy"
              onClick={copiarLinkVitrine}
            >
              {linkCopiado ? `✓ ${tx('Copiado!', '¡Copiado!', 'Copied!')}` : tx('Copiar Link', 'Copiar Enlace', 'Copy Link')}
            </button>
            <a
              href={urlVitrine}
              target="_blank"
              rel="noopener noreferrer"
              className="commerce-btn-open"
            >
              {tx('Abrir Vitrine ↗', 'Abrir Tienda ↗', 'Open Storefront ↗')}
            </a>
          </div>
        </div>
      </header>

      {/* LAYOUT EM DUAS COLUNAS: CONFIGURAÇÕES RETRÁTEIS (ESQUERDA) + PRÉVIA AO VIVO (DIREITA) */}
      <div className="commerce-split-layout">

        {/* COLUNA ESQUERDA: CONFIGURAÇÕES REBATÍVEIS */}
        <div className="commerce-settings-column">
          <div className="commerce-accordion-controls-bar">
            <span className="commerce-accordion-bar-title">⚙️ {tx('Painéis de Configuração', 'Paneles de Configuración', 'Settings Panels')}</span>
            <div className="commerce-accordion-bar-actions">
              <button
                type="button"
                className="commerce-btn-accordion-all"
                onClick={() => alternarTodasSecoes(true)}
              >
                {tx('Expandir Tudo', 'Expandir Todo', 'Expand All')}
              </button>
              <button
                type="button"
                className="commerce-btn-accordion-all"
                onClick={() => alternarTodasSecoes(false)}
              >
                {tx('Recolher Tudo', 'Colapsar Todo', 'Collapse All')}
              </button>
            </div>
          </div>

          <div className="commerce-accordion-list">

            {/* SEÇÃO 1: APRESENTAÇÃO DA LOJA */}
            <div className={`commerce-accordion-card ${secoesAbertas.apresentacao ? 'open' : 'closed'}`}>
              <button
                type="button"
                className="commerce-accordion-header"
                onClick={() => alternarSecao('apresentacao')}
                aria-expanded={secoesAbertas.apresentacao}
              >
                <div className="commerce-accordion-title-wrap">
                  <span className="commerce-accordion-icon">🎨</span>
                  <div className="commerce-accordion-texts">
                    <strong>{tx('Apresentação da Loja', 'Presentación de la Tienda', 'Store Presentation')}</strong>
                    <small>{tx('Nome na vitrine, slogan, descrição e cor de destaque', 'Nombre, eslogan y colores', 'Store name, slogan and theme color')}</small>
                  </div>
                </div>
                <span className="commerce-accordion-chevron">{secoesAbertas.apresentacao ? '▲' : '▼'}</span>
              </button>

              {secoesAbertas.apresentacao && (
                <div className="commerce-accordion-body">
                  <div className="commerce-field">
                    <label>{tx('Nome da Loja na Vitrine *', 'Nombre de la Tienda en Vitrina *', 'Storefront Name *')}</label>
                    <input
                      type="text"
                      value={configCommerce.nomeLoja}
                      placeholder="Ex: Loja Modelo Tintas & Ferragens"
                      onChange={(e) => atualizarCampo('nomeLoja', e.target.value)}
                    />
                  </div>

                  <div className="commerce-field">
                    <label>{tx('Slogan ou Subtítulo', 'Eslogan o Subtítulo', 'Slogan or Subtitle')}</label>
                    <input
                      type="text"
                      value={configCommerce.slogan}
                      placeholder="Ex: As melhores marcas com pronta entrega e o melhor preço"
                      onChange={(e) => atualizarCampo('slogan', e.target.value)}
                    />
                  </div>

                  <div className="commerce-field">
                    <label>{tx('Descrição / Sobre a Loja', 'Descripción / Sobre la Tienda', 'Description / About')}</label>
                    <textarea
                      rows="3"
                      value={configCommerce.descricao}
                      placeholder="Conte aos seus clientes quem você é e os diferenciais da sua loja..."
                      onChange={(e) => atualizarCampo('descricao', e.target.value)}
                    />
                  </div>

                  <div className="commerce-field">
                    <label>{tx('Comunicado de Topo (Opcional)', 'Aviso Superior (Opcional)', 'Top Banner Announcement (Optional)')}</label>
                    <input
                      type="text"
                      value={configCommerce.avisoTopo}
                      placeholder="Ex: 📢 Promoção de Tintas até sexta-feira! Entregas rápidas."
                      onChange={(e) => atualizarCampo('avisoTopo', e.target.value)}
                    />
                    <small>{tx('Aparece em destaque no topo da sua vitrine para todos os visitantes.', 'Aparece destacado en la parte superior.', 'Highlighted at the top of your store.')}</small>
                  </div>

                  <div className="commerce-field">
                    <label>{tx('Cor de Destaque da Loja', 'Color Principal de la Tienda', 'Accent Color')}</label>
                    <div className="commerce-colors-row">
                      {CORES_TEMA.map((cor) => (
                        <button
                          key={cor.id}
                          type="button"
                          title={cor.nome}
                          className={`commerce-color-dot ${configCommerce.corTema === cor.id ? 'selected' : ''}`}
                          style={{ backgroundColor: cor.id }}
                          onClick={() => atualizarCampo('corTema', cor.id)}
                        />
                      ))}
                      <input
                        type="color"
                        value={configCommerce.corTema}
                        onChange={(e) => atualizarCampo('corTema', e.target.value)}
                        className="commerce-color-picker"
                        title="Escolher outra cor"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 2: IDENTIDADE VISUAL & IMAGENS */}
            <div className={`commerce-accordion-card ${secoesAbertas.imagens ? 'open' : 'closed'}`}>
              <button
                type="button"
                className="commerce-accordion-header"
                onClick={() => alternarSecao('imagens')}
                aria-expanded={secoesAbertas.imagens}
              >
                <div className="commerce-accordion-title-wrap">
                  <span className="commerce-accordion-icon">🖼️</span>
                  <div className="commerce-accordion-texts">
                    <strong>{tx('Identidade Visual & Imagens', 'Identidad Visual e Imágenes', 'Visual Identity & Images')}</strong>
                    <small>{tx('Logotipo e banner de capa para cabeçalho da vitrine', 'Logo y banner de portada', 'Store logo and header cover')}</small>
                  </div>
                </div>
                <span className="commerce-accordion-chevron">{secoesAbertas.imagens ? '▲' : '▼'}</span>
              </button>

              {secoesAbertas.imagens && (
                <div className="commerce-accordion-body">
                  {/* Logotipo */}
                  <div className="commerce-media-block">
                    <div className="commerce-media-label">
                      <strong>{tx('Logotipo da Loja', 'Logotipo de la Tienda', 'Store Logo')}</strong>
                      <span>{tx('Recomendado imagem quadrada (PNG ou JPG)', 'Recomendado imagen cuadrada', 'Square image recommended')}</span>
                    </div>
                    <div className="commerce-logo-preview-box">
                      {configCommerce.logoUrl ? (
                        <img src={configCommerce.logoUrl} alt="Logo" className="commerce-logo-img" />
                      ) : (
                        <div className="commerce-logo-placeholder">🏪</div>
                      )}
                      <div className="commerce-media-actions">
                        <input
                          ref={fileLogoRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => lidarUploadImagem(e, 'logoUrl', 400, 400)}
                        />
                        <button
                          type="button"
                          className="commerce-btn-upload"
                          onClick={() => fileLogoRef.current?.click()}
                        >
                          📷 {tx('Alterar Logotipo', 'Cambiar Logotipo', 'Change Logo')}
                        </button>
                        {configCommerce.logoUrl && (
                          <button
                            type="button"
                            className="commerce-btn-remove"
                            onClick={() => atualizarCampo('logoUrl', '')}
                          >
                            ✕ {tx('Remover', 'Quitar', 'Remove')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Banner de Capa */}
                  <div className="commerce-media-block" style={{ marginTop: '16px' }}>
                    <div className="commerce-media-label">
                      <strong>{tx('Banner de Capa (Cabeçalho)', 'Banner de Portada', 'Header Cover Banner')}</strong>
                      <span>{tx('Recomendado horizontal (proporção 16:9 ou 3:1)', 'Recomendado horizontal', 'Horizontal image recommended')}</span>
                    </div>
                    <div className="commerce-banner-preview-box">
                      {configCommerce.bannerUrl ? (
                        <img src={configCommerce.bannerUrl} alt="Banner" className="commerce-banner-img" />
                      ) : (
                        <div className="commerce-banner-placeholder">
                          <span>🖼️</span>
                          <small>{tx('Nenhum banner personalizado. O sistema usará o padrão elegante com a cor do seu tema.', 'Sin banner personalizado. Se usará el fondo predeterminado.', 'No custom banner. Default theme background will be used.')}</small>
                        </div>
                      )}
                      <div className="commerce-media-actions" style={{ marginTop: '10px' }}>
                        <input
                          ref={fileBannerRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => lidarUploadImagem(e, 'bannerUrl', 1000, 400)}
                        />
                        <button
                          type="button"
                          className="commerce-btn-upload"
                          onClick={() => fileBannerRef.current?.click()}
                        >
                          🖼️ {tx('Enviar Banner de Capa', 'Subir Banner', 'Upload Header Banner')}
                        </button>
                        {configCommerce.bannerUrl && (
                          <button
                            type="button"
                            className="commerce-btn-remove"
                            onClick={() => atualizarCampo('bannerUrl', '')}
                          >
                            ✕ {tx('Remover Banner', 'Quitar Banner', 'Remove Banner')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 3: PEDIDOS & WHATSAPP */}
            <div className={`commerce-accordion-card ${secoesAbertas.atendimento ? 'open' : 'closed'}`}>
              <button
                type="button"
                className="commerce-accordion-header"
                onClick={() => alternarSecao('atendimento')}
                aria-expanded={secoesAbertas.atendimento}
              >
                <div className="commerce-accordion-title-wrap">
                  <span className="commerce-accordion-icon">💬</span>
                  <div className="commerce-accordion-texts">
                    <strong>{tx('Pedidos & WhatsApp', 'Pedidos y WhatsApp', 'Orders & WhatsApp')}</strong>
                    <small>{tx('Número para pedidos, mensagem padrão, horários e chave Pix', 'Número para pedidos y horarios', 'WhatsApp for orders, hours and Pix key')}</small>
                  </div>
                </div>
                <span className="commerce-accordion-chevron">{secoesAbertas.atendimento ? '▲' : '▼'}</span>
              </button>

              {secoesAbertas.atendimento && (
                <div className="commerce-accordion-body">
                  <div className="commerce-field">
                    <label>{tx('Número de WhatsApp Comercial *', 'Número de WhatsApp Comercial *', 'Business WhatsApp Number *')}</label>
                    <input
                      type="text"
                      value={configCommerce.whatsapp}
                      placeholder="Ex: 5545999999999 (com código do país)"
                      onChange={(e) => atualizarCampo('whatsapp', e.target.value)}
                    />
                    <small>{tx('Os pedidos fechados na vitrine serão direcionados para este número.', 'Los pedidos de la tienda se enviarán a este número.', 'Orders will be sent directly to this WhatsApp.')}</small>
                  </div>

                  <div className="commerce-field">
                    <label>{tx('Mensagem Padrão do Pedido', 'Mensaje Predeterminado del Pedido', 'Default Order Message')}</label>
                    <textarea
                      rows="3"
                      value={configCommerce.mensagemPadrao}
                      placeholder="Ex: Olá! Gostaria de confirmar meu pedido feito pelo catálogo online do ZenOS."
                      onChange={(e) => atualizarCampo('mensagemPadrao', e.target.value)}
                    />
                  </div>

                  <div className="commerce-field">
                    <label>{tx('Horários de Atendimento', 'Horarios de Atención', 'Opening Hours')}</label>
                    <input
                      type="text"
                      value={configCommerce.horarioFuncionamento}
                      placeholder="Ex: Seg a Sex: 08h às 18h | Sáb: 08h às 12h"
                      onChange={(e) => atualizarCampo('horarioFuncionamento', e.target.value)}
                    />
                  </div>

                  <div className="commerce-field">
                    <label>{tx('Chave Pix (Opcional)', 'Clave Pix (Opcional)', 'Pix Key (Optional)')}</label>
                    <input
                      type="text"
                      value={configCommerce.chavePix}
                      placeholder="Ex: CNPJ, e-mail, celular ou chave aleatória"
                      onChange={(e) => atualizarCampo('chavePix', e.target.value)}
                    />
                    <small>{tx('Facilita para o cliente pagar na hora de fechar o pedido.', 'Facilita el pago inmediato del cliente.', 'Allows customers to pay right away.')}</small>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 4: ENTREGAS & RETIRADAS */}
            <div className={`commerce-accordion-card ${secoesAbertas.entregas ? 'open' : 'closed'}`}>
              <button
                type="button"
                className="commerce-accordion-header"
                onClick={() => alternarSecao('entregas')}
                aria-expanded={secoesAbertas.entregas}
              >
                <div className="commerce-accordion-title-wrap">
                  <span className="commerce-accordion-icon">🛵</span>
                  <div className="commerce-accordion-texts">
                    <strong>{tx('Opções de Entrega & Retirada', 'Opciones de Entrega y Retiro', 'Delivery & Pickup Options')}</strong>
                    <small>{tx('Permitir retirada no balcão e prazos/taxas de entrega', 'Retiro en tienda y tarifas de envío', 'Pickup in store and delivery fees')}</small>
                  </div>
                </div>
                <span className="commerce-accordion-chevron">{secoesAbertas.entregas ? '▲' : '▼'}</span>
              </button>

              {secoesAbertas.entregas && (
                <div className="commerce-accordion-body">
                  {/* Retirada */}
                  <div className="commerce-checkbox-group">
                    <label className="commerce-checkbox-label">
                      <input
                        type="checkbox"
                        checked={configCommerce.aceitaRetirada}
                        onChange={(e) => atualizarCampo('aceitaRetirada', e.target.checked)}
                      />
                      <span>🏪 {tx('Permitir Retirada no Balcão / Loja Física', 'Permitir Retiro en Tienda', 'Allow Pickup in Store')}</span>
                    </label>

                    {configCommerce.aceitaRetirada && (
                      <div className="commerce-subfield">
                        <label>{tx('Endereço para Retirada', 'Dirección de Retiro', 'Pickup Address')}</label>
                        <input
                          type="text"
                          value={configCommerce.enderecoRetirada}
                          placeholder="Ex: Av. Brasil, 1200 - Centro"
                          onChange={(e) => atualizarCampo('enderecoRetirada', e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Entrega */}
                  <div className="commerce-checkbox-group" style={{ marginTop: '16px' }}>
                    <label className="commerce-checkbox-label">
                      <input
                        type="checkbox"
                        checked={configCommerce.aceitaEntrega}
                        onChange={(e) => atualizarCampo('aceitaEntrega', e.target.checked)}
                      />
                      <span>🛵 {tx('Oferecer Entrega / Delivery / Motoboy', 'Ofrecer Entrega / Delivery', 'Offer Delivery / Courier')}</span>
                    </label>

                    {configCommerce.aceitaEntrega && (
                      <div className="commerce-subfield-grid">
                        <div>
                          <label>{tx('Taxa de Entrega', 'Tarifa de Envío', 'Delivery Fee')}</label>
                          <input
                            type="text"
                            value={configCommerce.taxaEntrega}
                            placeholder="Ex: R$ 10,00 ou A combinar"
                            onChange={(e) => atualizarCampo('taxaEntrega', e.target.value)}
                          />
                        </div>
                        <div>
                          <label>{tx('Prazo Estimado', 'Tiempo Estimado', 'Estimated Time')}</label>
                          <input
                            type="text"
                            value={configCommerce.prazoEstimado}
                            placeholder="Ex: 40 a 60 min"
                            onChange={(e) => atualizarCampo('prazoEstimado', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO 5: MÓDULO & LICENÇA */}
            <div className={`commerce-accordion-card ${secoesAbertas.modulo ? 'open' : 'closed'}`}>
              <button
                type="button"
                className="commerce-accordion-header"
                onClick={() => alternarSecao('modulo')}
                aria-expanded={secoesAbertas.modulo}
              >
                <div className="commerce-accordion-title-wrap">
                  <span className="commerce-accordion-icon">🛡️</span>
                  <div className="commerce-accordion-texts">
                    <strong>{tx('Módulo & Licença', 'Módulo y Licencia', 'Module & License')}</strong>
                    <small>{tx('Situação da assinatura e sincronização de catálogo', 'Estado del módulo y activación', 'Module status and activation')}</small>
                  </div>
                </div>
                <span className="commerce-accordion-chevron">{secoesAbertas.modulo ? '▲' : '▼'}</span>
              </button>

              {secoesAbertas.modulo && (
                <div className="commerce-accordion-body">
                  <div className="commerce-module-intro">
                    <span className="commerce-request-kicker">ZENOS COMMERCE PREMIUM</span>
                    <h2>{tx('Controle do Módulo e Licença', 'Control del Módulo y Licencia', 'Module & License Control')}</h2>
                    <p>{tx('O Commerce Premium permite sincronizar seus produtos cadastrados no ZenOS direto para a vitrine online e receber pedidos no PDV.', 'Commerce Premium conecta sus productos de ZenOS directamente al escaparate virtual.', 'Commerce Premium syncs your ZenOS products to online catalog and receives orders.')}</p>

                    <div className="commerce-benefits-list">
                      <span>✓ {tx('Catálogo atualizado automaticamente com seu estoque', 'Catálogo sincronizado con inventario', 'Auto synced inventory')}</span>
                      <span>✓ {tx('Fotos de alta qualidade comprimidas e seguras', 'Fotos de alta calidad optimizadas', 'Optimized high quality photos')}</span>
                      <span>✓ {tx('Pedidos enviados pro seu WhatsApp e pré-vendas', 'Pedidos a su WhatsApp', 'Direct WhatsApp orders')}</span>
                      <span>✓ {tx('Sem taxa por venda', 'Sin comisiones por venta', 'Zero fee per sale')}</span>
                    </div>
                  </div>

                  <div className="commerce-module-status-card" style={{ marginTop: '16px' }}>
                    <span className="commerce-request-badge">{tx('MÓDULO OPCIONAL', 'MÓDULO OPCIONAL', 'OPTIONAL MODULE')}</span>
                    <h3>{tx('Situação no Sistema', 'Estado en el Sistema', 'System Status')}</h3>

                    {carregandoModulo ? (
                      <div role="status" className="commerce-request-status">
                        {tx('Consultando status do módulo…', 'Consultando estado…', 'Checking module status…')}
                      </div>
                    ) : registro ? (
                      <div role="status" className="commerce-request-status">
                        <small>{tx('Situação da solicitação', 'Estado de la solicitud', 'Request status')}</small>
                        <strong>{tx(...translation[statusModulo])}</strong>
                        {statusModulo !== 'nao_solicitado' && (
                          <span>{tx('Acompanhe a liberação do seu pacote Commerce Premium com o suporte.', 'Consulte con soporte sobre la activación.', 'Check with support regarding activation.')}</span>
                        )}
                      </div>
                    ) : null}

                    {erro && <div role="alert" className="commerce-request-error">{erro}</div>}

                    {registro?.status === 'nao_solicitado' && (
                      <button
                        type="button"
                        className="commerce-request-action"
                        disabled={enviandoSolicitacao || carregandoModulo}
                        onClick={solicitar}
                      >
                        {enviandoSolicitacao ? tx('Enviando solicitação…', 'Enviando…', 'Sending…') : tx('Solicitar Ativação do Módulo', 'Solicitar Activación', 'Request Module Activation')}
                      </button>
                    )}

                    {!enviandoSolicitacao && (
                      <button
                        type="button"
                        className="commerce-request-refresh"
                        disabled={carregandoModulo}
                        onClick={consultar}
                      >
                        🔄 {tx('Atualizar Situação', 'Actualizar Estado', 'Refresh Status')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* COLUNA DIREITA: PRÉVIA AO VIVO DA LOJA VIRTUAL */}
        <div className="commerce-preview-column">
          <div className="commerce-preview-card">
            <div className="commerce-preview-topbar">
              <div className="commerce-preview-title-box">
                <span className="commerce-preview-kicker">LIVE PREVIEW</span>
                <h3>{tx('Prévia ao Vivo da Vitrine', 'Vista Previa en Vivo', 'Live Storefront Preview')}</h3>
              </div>

              <div className="commerce-preview-device-switch">
                <button
                  type="button"
                  className={`commerce-device-btn ${modoPrevia === 'mobile' ? 'active' : ''}`}
                  onClick={() => setModoPrevia('mobile')}
                >
                  📱 {tx('Celular', 'Celular', 'Mobile')}
                </button>
                <button
                  type="button"
                  className={`commerce-device-btn ${modoPrevia === 'desktop' ? 'active' : ''}`}
                  onClick={() => setModoPrevia('desktop')}
                >
                  💻 {tx('Computador', 'Computadora', 'Desktop')}
                </button>
              </div>
            </div>

            {/* Aviso de Status no Mockup */}
            <div className={`commerce-preview-indicator-bar ${configCommerce.habilitado ? 'active' : 'paused'}`}>
              <span className={`commerce-dot ${configCommerce.habilitado ? 'active' : 'paused'}`} />
              <span>
                {configCommerce.habilitado
                  ? tx('Vitrine online e aberta para pedidos', 'Tienda online activa', 'Store is live online')
                  : tx('Vitrine pausada (modo de manutenção)', 'Tienda pausada', 'Store is paused')}
              </span>
            </div>

            {/* MOCKUP DO DISPOSITIVO */}
            <div className={`commerce-mockup-wrapper ${modoPrevia}`}>

              {modoPrevia === 'desktop' && (
                <div className="commerce-browser-bar">
                  <div className="commerce-browser-dots">
                    <span className="browser-dot red" />
                    <span className="browser-dot yellow" />
                    <span className="browser-dot green" />
                  </div>
                  <div className="commerce-browser-address">
                    🔒 {urlVitrine.replace(/^https?:\/\//, '')}
                  </div>
                </div>
              )}

              {modoPrevia === 'mobile' && (
                <div className="commerce-phone-header-notch">
                  <span className="phone-speaker" />
                  <span className="phone-cam" />
                </div>
              )}

              {/* TELA DA LOJA VIRTUAL RENDERIZADA */}
              <div className="commerce-mockup-screen" style={{ background: '#f7f6f3', maxHeight: modoPrevia === 'mobile' ? '680px' : '580px', overflowY: 'auto' }}>
                <ZenCommerceStorefront
                  idPublico={lojaId}
                  configCommerce={configCommerce}
                  produtos={produtos}
                  isLivePreview={true}
                />
              </div>
            </div>

            <div className="commerce-preview-footer-note">
              <span>⚡ {tx('A prévia atualiza na hora enquanto você digita ou envia fotos à esquerda.', 'Se actualiza en tiempo real.', 'Updates in real time as you edit.')}</span>
            </div>
          </div>
        </div>

      </div>

      {/* BARRA FIXA DE SALVAR */}
      <footer className="commerce-footer-bar">
        <div className="commerce-footer-content">
          <div className="commerce-footer-info">
            <strong>{tx('Configurações da Loja Online', 'Configuraciones de la Tienda Online', 'Online Store Settings')}</strong>
            <span>{tx('Todas as alterações ficam salvas com segurança no ZenOS Cloud.', 'Los cambios se guardan de forma segura.', 'Changes are securely saved to ZenOS Cloud.')}</span>
          </div>
          <button
            type="button"
            className="commerce-btn-save-main"
            disabled={salvandoConfig}
            onClick={salvarConfiguracoesLoja}
          >
            {salvandoConfig ? tx('Salvando na Nuvem…', 'Guardando…', 'Saving…') : `💾 ${tx('Salvar Configurações', 'Guardar Configuraciones', 'Save Settings')}`}
          </button>
        </div>
      </footer>
    </div>
  );
}
