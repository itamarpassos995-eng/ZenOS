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

export default function CommerceSolicitacao({ lojaId, perfilLoja = null, tx = (pt) => pt }) {
  const [abaAtiva, setAbaAtiva] = useState('vitrine');
  const [configCommerce, setConfigCommerce] = useState(() => lerCommerceConfigLocal(lojaId, perfilLoja));
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [modalZen, setModalZen] = useState(null);

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

  // Consulta do status de solicitação na Cloud Function
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

  const lidarUploadImagem = async (e, campo, maxW, maxH) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    try {
      const base64 = await comprimirImagem(arquivo, maxW, maxH, 0.8);
      atualizarCampo(campo, base64);
    } catch (err) {
      avisarZen('danger', tx('Erro na imagem', 'Error en la imagen', 'Image error'), tx('Não foi possível carregar a imagem selecionada.', 'No se pudo cargar la imagen seleccionada.', 'Could not load selected image.'));
    }
  };

  const copiarLinkVitrine = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(urlVitrine);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 3000);
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
          updatedAtServer: serverTimestamp()
        },
        { merge: true }
      );
      salvarCommerceConfigLocal(lojaId, configNormalizada);
      notifyPersistenceStatus({ status: 'SINCRONIZADO', field: 'commerce_config' });
      avisarZen(
        'success',
        tx('Loja Online Atualizada', 'Tienda Online Actualizada', 'Online Store Updated'),
        tx('As configurações da vitrine foram salvas com sucesso na nuvem!', '¡Las configuraciones se guardaron con éxito en la nube!', 'Storefront settings saved to cloud!')
      );
    } catch (error) {
      console.error('[Commerce] Falha ao salvar configurações:', error);
      notifyPersistenceStatus({ status: 'ERRO', field: 'commerce_config', error: error?.message });
      avisarZen(
        'danger',
        tx('Falha ao salvar', 'Falla al guardar', 'Save failed'),
        tx('Não foi possível sincronizar com o servidor. Verifique a conexão.', 'No se pudo sincronizar con el servidor. Verifique la conexión.', 'Could not sync with server. Check connection.')
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
          apenasConfirmar={true}
          onConfirmar={() => setModalZen(null)}
        />
      )}

      {/* CABEÇALHO PRINCIPAL */}
      <header className="commerce-header">
        <div className="commerce-header-top">
          <div className="commerce-title-group">
            <span className="commerce-badge-kicker">ZENOS COMMERCE • VITRINE ONLINE</span>
            <h1>{tx('Minha Loja Online', 'Mi Tienda Online', 'My Online Store')}</h1>
            <p>{tx('Personalize a vitrine pública da sua loja, ative entregas, WhatsApp e divulgue seu catálogo.', 'Personalice el escaparate público de su tienda, entregas, WhatsApp y comparta su catálogo.', 'Customize your public storefront, delivery, WhatsApp and share your catalog.')}</p>
          </div>

          <div className="commerce-status-toggle">
            <div className="commerce-status-indicator">
              <span className={`commerce-dot ${configCommerce.habilitado ? 'active' : 'paused'}`}></span>
              <strong>{configCommerce.habilitado ? tx('Vitrine No Ar', 'Tienda Activa', 'Store Online') : tx('Vitrine Pausada', 'Tienda Pausada', 'Store Paused')}</strong>
            </div>
            <button
              type="button"
              className={`commerce-toggle-btn ${configCommerce.habilitado ? 'on' : 'off'}`}
              onClick={() => atualizarCampo('habilitado', !configCommerce.habilitado)}
            >
              {configCommerce.habilitado ? tx('Desativar', 'Desactivar', 'Deactivate') : tx('Ativar Vitrine', 'Activar Tienda', 'Activate Store')}
            </button>
          </div>
        </div>

        {/* BARRA DO LINK PÚBLICO */}
        <div className="commerce-url-card">
          <div className="commerce-url-info">
            <span className="commerce-url-label">🔗 {tx('Link da sua Vitrine:', 'Enlace de su Tienda:', 'Storefront Link:')}</span>
            <code className="commerce-url-text">{urlVitrine}</code>
          </div>
          <div className="commerce-url-actions">
            <button type="button" onClick={copiarLinkVitrine} className="commerce-btn-copy">
              {linkCopiado ? `✓ ${tx('Copiado!', '¡Copiado!', 'Copied!')}` : tx('Copiar Link', 'Copiar Enlace', 'Copy Link')}
            </button>
            <a href={urlVitrine} target="_blank" rel="noopener noreferrer" className="commerce-btn-open">
              {tx('Abrir Vitrine ↗', 'Abrir Tienda ↗', 'Open Store ↗')}
            </a>
          </div>
        </div>

        {/* NAVEGAÇÃO POR ABAS */}
        <nav className="commerce-nav-tabs">
          <button
            type="button"
            className={`commerce-tab-btn ${abaAtiva === 'vitrine' ? 'active' : ''}`}
            onClick={() => setAbaAtiva('vitrine')}
          >
            🎨 {tx('Vitrine & Visual', 'Escaparate y Visual', 'Storefront & Design')}
          </button>
          <button
            type="button"
            className={`commerce-tab-btn ${abaAtiva === 'atendimento' ? 'active' : ''}`}
            onClick={() => setAbaAtiva('atendimento')}
          >
            🛵 {tx('Pedidos, Entregas & Contato', 'Pedidos, Entregas y Contacto', 'Orders, Delivery & Contact')}
          </button>
          <button
            type="button"
            className={`commerce-tab-btn ${abaAtiva === 'modulo' ? 'active' : ''}`}
            onClick={() => setAbaAtiva('modulo')}
          >
            🛡️ {tx('Módulo & Licença', 'Módulo y Licencia', 'Module & License')}
          </button>
        </nav>
      </header>

      {/* CORPO DE CONTEÚDO */}
      <main className="commerce-body">
        {/* ABA 1: VITRINE & VISUAL */}
        {abaAtiva === 'vitrine' && (
          <div className="commerce-section-grid">
            {/* Informações da Loja */}
            <div className="commerce-card">
              <h2 className="commerce-card-title">🏪 {tx('Apresentação da Loja', 'Presentación de la Tienda', 'Store Presentation')}</h2>

              <div className="commerce-field">
                <label>{tx('Nome da Loja na Vitrine *', 'Nombre de la Tienda *', 'Store Name *')}</label>
                <input
                  type="text"
                  value={configCommerce.nomeLoja}
                  placeholder="Ex: Loja Modelo Tintas & Ferragens"
                  onChange={(e) => atualizarCampo('nomeLoja', e.target.value)}
                />
              </div>

              <div className="commerce-field">
                <label>{tx('Slogan ou Subtítulo', 'Eslogan o Subtítulo', 'Tagline or Slogan')}</label>
                <input
                  type="text"
                  value={configCommerce.slogan}
                  placeholder="Ex: As melhores marcas com pronta entrega e o melhor preço"
                  onChange={(e) => atualizarCampo('slogan', e.target.value)}
                />
              </div>

              <div className="commerce-field">
                <label>{tx('Descrição / Sobre a Loja', 'Descripción / Sobre la Tienda', 'About Store / Bio')}</label>
                <textarea
                  rows="3"
                  value={configCommerce.descricao}
                  placeholder={tx('Conte aos seus clientes quem você é e os diferenciais da sua loja...', 'Cuente a sus clientes sobre su tienda y ventajas...', 'Tell customers about your store...')}
                  onChange={(e) => atualizarCampo('descricao', e.target.value)}
                />
              </div>

              <div className="commerce-field">
                <label>{tx('Comunicado de Topo (Opcional)', 'Aviso Destacado (Opcional)', 'Top Banner Announcement (Optional)')}</label>
                <input
                  type="text"
                  value={configCommerce.avisoTopo}
                  placeholder="Ex: 📢 Promoção de Tintas até sexta-feira! Entregas rápidas."
                  onChange={(e) => atualizarCampo('avisoTopo', e.target.value)}
                />
                <small>{tx('Aparece em destaque no topo da sua vitrine para todos os visitantes.', 'Aparece destacado en la parte superior para todos los visitantes.', 'Appears highlighted at top of store.')}</small>
              </div>

              <div className="commerce-field">
                <label>{tx('Cor de Destaque da Loja', 'Color Principal de la Tienda', 'Theme Highlight Color')}</label>
                <div className="commerce-colors-row">
                  {CORES_TEMA.map(cor => (
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

            {/* Imagens de Identidade Visual */}
            <div className="commerce-card">
              <h2 className="commerce-card-title">🖼️ {tx('Identidade Visual & Imagens', 'Identidad Visual e Imágenes', 'Visual Identity & Images')}</h2>

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
              <div className="commerce-media-block" style={{ marginTop: '20px' }}>
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
          </div>
        )}

        {/* ABA 2: ATENDIMENTO, PEDIDOS & ENTREGAS */}
        {abaAtiva === 'atendimento' && (
          <div className="commerce-section-grid">
            {/* WhatsApp e Contato */}
            <div className="commerce-card">
              <h2 className="commerce-card-title">💬 {tx('WhatsApp para Receber Pedidos', 'WhatsApp para Pedidos', 'WhatsApp for Orders')}</h2>

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

            {/* Entrega e Retirada */}
            <div className="commerce-card">
              <h2 className="commerce-card-title">🛵 {tx('Opções de Entrega & Retirada', 'Opciones de Entrega y Retiro', 'Delivery & Pickup Options')}</h2>

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
              <div className="commerce-checkbox-group" style={{ marginTop: '20px' }}>
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
          </div>
        )}

        {/* ABA 3: MÓDULO & LICENÇA */}
        {abaAtiva === 'modulo' && (
          <div className="commerce-module-panel">
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

            <div className="commerce-module-status-card">
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
      </main>

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
