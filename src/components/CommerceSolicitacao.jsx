import React, { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  normalizarCommerceConfig,
  sanitizarSlugLoja,
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
    apresentacao: false,
    produtos: true,
    imagens: false,
    atendimento: false,
    entregas: false,
    modulo: false,
  });

  // Estados da Gestão de Produtos na Loja (Fase 2)
  const [buscaProduto, setBuscaProduto] = useState('');
  const [filtroProdutosTab, setFiltroProdutosTab] = useState('todos');
  const [pctDescontoLote, setPctDescontoLote] = useState('15');
  const [produtoModalEdicao, setProdutoModalEdicao] = useState(null);
  const [formProdCustom, setFormProdCustom] = useState({
    nomeLoja: '',
    precoPromoBRL: '',
    tagPromo: 'OFERTA',
    descricaoLoja: '',
    imagemLoja: '',
    imagensLoja: [],
    destaque: false,
    ativo: true,
  });

  // Estados da solicitação original do módulo
  const [registro, setRegistro] = useState(null);
  const [erro, setErro] = useState('');
  const [carregandoModulo, setCarregandoModulo] = useState(true);
  const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);
  const seq = useRef(0);

  const fileLogoRef = useRef(null);
  const fileBannerRef = useRef(null);

  const slugAtivo = (configCommerce.slug && configCommerce.slug !== sanitizarSlugLoja(lojaId)
    ? configCommerce.slug
    : lojaId || '').trim();
  const urlVitrine = typeof window !== 'undefined'
    ? `${window.location.origin}/loja/${slugAtivo}`
    : `https://zenos-ac6b2.web.app/loja/${slugAtivo}`;

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
      produtos: abrir,
      imagens: abrir,
      atendimento: abrir,
      entregas: abrir,
      modulo: abrir,
    });
  };

  // Funções de Gestão de Produtos para a Loja Virtual
  const alternarAtivoProduto = (produtoId) => {
    const mapa = { ...(configCommerce.produtosLoja || {}) };
    const cfgAtual = mapa[produtoId] || {};
    const produto = (produtos || []).find(p => p?.id === produtoId);
    const ativoAtual = cfgAtual.ativo !== undefined ? cfgAtual.ativo : Number(produto?.estoque ?? 0) > 0;
    const novoStatus = !ativoAtual;
    mapa[produtoId] = { ...cfgAtual, ativo: novoStatus };
    atualizarCampo('produtosLoja', mapa);
  };

  const alternarDestaqueProduto = (produtoId) => {
    const mapa = { ...(configCommerce.produtosLoja || {}) };
    const cfgAtual = mapa[produtoId] || {};
    const novoDestaque = !cfgAtual.destaque;
    mapa[produtoId] = { ...cfgAtual, destaque: novoDestaque, ativo: true };
    atualizarCampo('produtosLoja', mapa);
  };

  const alterarPrecoPromoRapido = (produtoId, valor) => {
    const mapa = { ...(configCommerce.produtosLoja || {}) };
    const cfgAtual = mapa[produtoId] || {};
    mapa[produtoId] = { ...cfgAtual, precoPromoBRL: valor };
    atualizarCampo('produtosLoja', mapa);
  };

  const ativarTodosComEstoque = () => {
    const mapa = { ...(configCommerce.produtosLoja || {}) };
    let total = 0;
    (produtos || []).forEach(p => {
      if (!p || !p.id) return;
      if (Number(p.estoque ?? 0) > 0) {
        mapa[p.id] = { ...(mapa[p.id] || {}), ativo: true };
        total++;
      }
    });
    atualizarCampo('produtosLoja', mapa);
    avisarZen('success', tx('Produtos Ativados', 'Productos Activados', 'Products Activated'), `${total} ${tx('produtos com estoque foram colocados na loja!', 'productos con stock agregados a la tienda.', 'products in stock added to the store.')}`);
  };

  const desativarTodosProdutos = () => {
    const mapa = { ...(configCommerce.produtosLoja || {}) };
    (produtos || []).forEach(p => {
      if (!p || !p.id) return;
      mapa[p.id] = { ...(mapa[p.id] || {}), ativo: false };
    });
    atualizarCampo('produtosLoja', mapa);
  };

  const aplicarDescontoEmLote = () => {
    const pct = Math.max(1, Math.min(95, Number(pctDescontoLote || 15)));
    const mapa = { ...(configCommerce.produtosLoja || {}) };
    let aplicados = 0;

    (produtos || []).forEach(p => {
      if (!p || !p.id) return;
      const precoNormal = Number(p.precoBRL ?? p.preco ?? p.precoVenda ?? 0);
      if (precoNormal > 0) {
        const promo = (Math.round((precoNormal * (1 - pct / 100)) * 100) / 100).toFixed(2);
        mapa[p.id] = {
          ...(mapa[p.id] || {}),
          precoPromoBRL: promo,
          tagPromo: `-${pct}%`,
          ativo: mapa[p.id]?.ativo !== false,
        };
        aplicados++;
      }
    });

    setConfigCommerce(prev => ({
      ...prev,
      produtosLoja: mapa,
      descontoGeralPorcentagem: pct,
    }));

    avisarZen('success', tx('Promoção em Massa Aplicada', 'Promoción en Masa Aplicada', 'Bulk Promo Applied'), `${aplicados} ${tx(`produtos receberam ${pct}% de desconto promocional na vitrine!`, `productos recibieron ${pct}% de descuento.`, `products received ${pct}% promotional discount.`)}`);
  };

  const limparDescontosEmLote = () => {
    const mapa = { ...(configCommerce.produtosLoja || {}) };
    Object.keys(mapa).forEach(id => {
      if (mapa[id]) {
        const { precoPromoBRL, tagPromo, ...demaisConfiguracoes } = mapa[id];
        mapa[id] = demaisConfiguracoes;
      }
    });
    setConfigCommerce(prev => ({
      ...prev,
      produtosLoja: mapa,
      descontoGeralPorcentagem: 0,
    }));
    avisarZen('info', tx('Promoções Removidas', 'Promociones Removidas', 'Promos Cleared'), tx('Preços promocionais foram removidos de todos os produtos.', 'Precios promocionales removidos.', 'Promo prices cleared.'));
  };

  const abrirModalEdicao = (p) => {
    const cfgP = (configCommerce.produtosLoja || {})[p.id] || {};
    setProdutoModalEdicao(p);

    let fotosIniciais = [];
    if (Array.isArray(cfgP.imagensLoja) && cfgP.imagensLoja.length > 0) {
      fotosIniciais = cfgP.imagensLoja.filter(Boolean).slice(0, 5);
    } else if (cfgP.imagemLoja) {
      fotosIniciais = [cfgP.imagemLoja];
    } else if (p.imagem || p.fotoUrl) {
      fotosIniciais = [p.imagem || p.fotoUrl];
    }

    setFormProdCustom({
      nomeLoja: cfgP.nomeLoja || p.nome || '',
      precoPromoBRL: cfgP.precoPromoBRL || '',
      tagPromo: cfgP.tagPromo || 'OFERTA',
      descricaoLoja: cfgP.descricaoLoja || p.descricao || '',
      imagemLoja: fotosIniciais[0] || '',
      imagensLoja: fotosIniciais,
      destaque: Boolean(cfgP.destaque),
      ativo: cfgP.ativo !== false,
    });
  };

  const salvarModalEdicao = () => {
    if (!produtoModalEdicao) return;
    const fotos = (formProdCustom.imagensLoja || []).filter(Boolean).slice(0, 5);
    const dadosSalvar = {
      ...formProdCustom,
      imagensLoja: fotos,
      imagemLoja: fotos[0] || '',
    };
    const mapa = {
      ...(configCommerce.produtosLoja || {}),
      [produtoModalEdicao.id]: {
        ...((configCommerce.produtosLoja || {})[produtoModalEdicao.id] || {}),
        ...dadosSalvar,
      },
    };
    atualizarCampo('produtosLoja', mapa);
    setProdutoModalEdicao(null);
  };

  const lidarUploadFotosProduto = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const fotosAtuais = formProdCustom.imagensLoja || [];
    const vagas = 5 - fotosAtuais.length;
    if (vagas <= 0) {
      avisarZen('warning', tx('Limite de Fotos', 'Límite de Fotos', 'Photo Limit'), tx('Cada produto permite até 5 fotos.', 'Hasta 5 fotos por producto.', 'Up to 5 photos per product.'));
      return;
    }

    const selecionados = files.filter(file => file.type.startsWith('image/')).slice(0, vagas);
    if (selecionados.length === 0) {
      avisarZen('warning', tx('Arquivo Inválido', 'Archivo Inválido', 'Invalid File'), tx('Selecione imagens PNG, JPG ou WebP.', 'Seleccione imágenes válidas.', 'Select PNG, JPG or WebP images.'));
      e.target.value = '';
      return;
    }
    try {
      const novas = [];
      for (const file of selecionados) {
        const compactada = await comprimirImagem(file, 800, 800, 0.8);
        if (compactada) novas.push(compactada);
      }
      setFormProdCustom(prev => {
        const combinadas = [...(prev.imagensLoja || []), ...novas].slice(0, 5);
        return {
          ...prev,
          imagensLoja: combinadas,
          imagemLoja: combinadas[0] || '',
        };
      });
    } catch (err) {
      console.warn('Erro ao processar fotos do produto:', err);
    } finally {
      e.target.value = '';
    }
  };

  const removerFotoProduto = (indexParaRemover) => {
    setFormProdCustom(prev => {
      const atualizadas = (prev.imagensLoja || []).filter((_, idx) => idx !== indexParaRemover);
      return {
        ...prev,
        imagensLoja: atualizadas,
        imagemLoja: atualizadas[0] || '',
      };
    });
  };

  const definirFotoPrincipal = (indexPrincipal) => {
    setFormProdCustom(prev => {
      const fotos = [...(prev.imagensLoja || [])];
      if (indexPrincipal <= 0 || indexPrincipal >= fotos.length) return prev;
      const [escolhida] = fotos.splice(indexPrincipal, 1);
      fotos.unshift(escolhida);
      return {
        ...prev,
        imagensLoja: fotos,
        imagemLoja: fotos[0] || '',
      };
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

      // As fotos ainda são armazenadas no documento de configurações do Commerce.
      // Impedir uma gravação grande demais até que a galeria tenha armazenamento dedicado.
      const temGaleriaMultipla = Object.values(configNormalizada.produtosLoja || {})
        .some(produto => Array.isArray(produto?.imagensLoja) && produto.imagensLoja.length > 1);
      if (temGaleriaMultipla && new TextEncoder().encode(JSON.stringify(configNormalizada)).length > 850_000) {
        notifyPersistenceStatus({ status: 'ERRO', field: 'commerce_config', error: 'commerce-gallery-size-limit' });
        avisarZen('warning', tx('Muitas Fotos', 'Demasiadas Fotos', 'Too Many Photos'),
          tx('As fotos ultrapassam o espaço seguro de configuração. Remova algumas fotos para salvar na nuvem.',
            'Las fotos exceden el espacio seguro. Quite algunas para guardar.',
            'The photos exceed the safe settings size. Remove some before saving.'));
        return;
      }

      const configuracoesRef = doc(db, 'lojas', lojaId, 'dados', 'configuracoes');
      const dadosConfiguracoes = {
        commerceConfig: configNormalizada,
        updatedAtClient: new Date().toISOString(),
        updatedAtServer: serverTimestamp(),
      };
      const apelido = configNormalizada.slug && configNormalizada.slug !== sanitizarSlugLoja(lojaId)
        ? configNormalizada.slug
        : '';

      if (apelido) {
        if (apelido === 'previa') {
          throw Object.assign(new Error('Este apelido é reservado.'), { code: 'commerce/slug-taken' });
        }
        // Cadastro e reserva do apelido na mesma transação. Nunca sobrescrever outra loja.
        await runTransaction(db, async (tx) => {
          const apelidoRef = doc(db, 'lojas_slugs', apelido);
          const lojaExistenteRef = doc(db, 'lojas', apelido);
          const [registroAtual, lojaExistente] = await Promise.all([
            tx.get(apelidoRef),
            tx.get(lojaExistenteRef),
          ]);
          if ((registroAtual.exists() && registroAtual.data()?.lojaId !== lojaId)
            || (lojaExistente.exists() && apelido !== lojaId)) {
            throw Object.assign(new Error('Este link personalizado já pertence a outra loja.'), {
              code: 'commerce/slug-taken',
            });
          }
          tx.set(apelidoRef, {
            lojaId,
            slug: apelido,
            nomeLoja: configNormalizada.nomeLoja || '',
            updatedAtServer: serverTimestamp(),
          }, { merge: true });
          tx.set(configuracoesRef, dadosConfiguracoes, { merge: true });
        });
      } else {
        // O link padrão continua por UID, sem escrita adicional nem leituras extras.
        await setDoc(configuracoesRef, dadosConfiguracoes, { merge: true });
      }
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
      if (err?.code === 'commerce/slug-taken') {
        avisarZen('warning',
          tx('Link Indisponível', 'Enlace No Disponible', 'Link Unavailable'),
          tx('Este apelido está reservado ou pertence a outra loja. Escolha um diferente.',
            'Este apodo está reservado o pertenece a otra tienda. Elija otro.',
            'This slug is reserved or belongs to another store. Choose another.'));
        return;
      }
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
                  <div className="commerce-field commerce-slug-field">
                    <label htmlFor="commerce-slug-input">{tx('Link Personalizado da Loja (Apelido)', 'Enlace Personalizado (Apodo)', 'Custom Store Link (Slug)')}</label>
                    <div className="commerce-slug-control">
                      <span className="commerce-slug-prefix">
                        {typeof window !== 'undefined' ? window.location.host : 'zenos.app.br'}/loja/
                      </span>
                      <input
                        id="commerce-slug-input"
                        className="commerce-slug-input"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={configCommerce.slug || ''}
                        placeholder="ex: minha-loja"
                        onChange={(e) => atualizarCampo('slug', sanitizarSlugLoja(e.target.value))}
                      />
                    </div>
                    <small style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                      {tx(
                        'Link direto para enviar aos seus clientes pelo WhatsApp ou redes sociais.',
                        'Enlace directo para enviar a sus clientes por WhatsApp o redes sociales.',
                        'Direct link to send to your customers via WhatsApp or social media.'
                      )}
                    </small>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-zen-secondary btn-sm"
                        onClick={copiarLinkVitrine}
                      >
                        📋 {linkCopiado ? tx('Link Copiado!', '¡Enlace Copiado!', 'Link Copied!') : tx('Copiar Link', 'Copiar Enlace', 'Copy Link')}
                      </button>
                      <a
                        href={urlVitrine}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-zen-secondary btn-sm"
                      >
                        🔗 {tx('Abrir Loja', 'Abrir Tienda', 'Open Store')}
                      </a>
                    </div>
                  </div>

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

            {/* SEÇÃO DE PRODUTOS NA VITRINE & PROMOÇÕES (FASE 2) */}
            <div className={`commerce-accordion-card ${secoesAbertas.produtos ? 'open' : 'closed'}`}>
              <button
                type="button"
                className="commerce-accordion-header"
                onClick={() => alternarSecao('produtos')}
                aria-expanded={secoesAbertas.produtos}
              >
                <div className="commerce-accordion-title-wrap">
                  <span className="commerce-accordion-icon">📦</span>
                  <div className="commerce-accordion-texts">
                    <strong>{tx('Produtos na Loja & Promoções', 'Productos en Tienda y Promociones', 'Storefront Products & Deals')}</strong>
                    <small>
                      {(() => {
                        const mapa = configCommerce.produtosLoja || {};
                        const ativos = (produtos || []).filter(p => p && (mapa[p.id]?.ativo ?? (Number(p.estoque ?? 0) > 0))).length;
                        return `${ativos} de ${(produtos || []).length} produtos ativos na vitrine`;
                      })()}
                    </small>
                  </div>
                </div>
                <span className="commerce-accordion-chevron">{secoesAbertas.produtos ? '▲' : '▼'}</span>
              </button>

              {secoesAbertas.produtos && (
                <div className="commerce-accordion-body commerce-products-panel">

                  {/* 1. BARRA DE AÇÕES EM MASSA (MÍNIMO DE CLIQUES) */}
                  <div className="commerce-bulk-actions-box">
                    <span className="commerce-bulk-label">⚡ {tx('Ações em 1 Clique:', 'Acciones en 1 Clic:', '1-Click Actions:')}</span>
                    <div className="commerce-bulk-buttons">
                      <button
                        type="button"
                        className="commerce-btn-bulk-active"
                        onClick={ativarTodosComEstoque}
                        title={tx('Ativa todos os produtos com saldo em estoque', 'Activa todos con stock', 'Activate all in stock')}
                      >
                        ✓ {tx('Ativar Todos com Estoque', 'Activar Todos con Stock', 'Activate All in Stock')}
                      </button>
                      <button
                        type="button"
                        className="commerce-btn-bulk-hide"
                        onClick={desativarTodosProdutos}
                      >
                        ✕ {tx('Ocultar Todos', 'Ocultar Todos', 'Hide All')}
                      </button>
                    </div>
                  </div>

                  {/* 2. FERRAMENTA DE PREÇO PROMOCIONAL EM LOTE */}
                  <div className="commerce-bulk-promo-box">
                    <div className="commerce-bulk-promo-header">
                      <strong>🏷️ {tx('Promoção Geral com Preço Riscado', 'Promoción General con Precio Tachado', 'Storewide Strikethrough Discount')}</strong>
                      <small>{tx('Aplica um preço promocional à vitrine (ex.: de R$ 100 por R$ 85), sem alterar o preço do balcão.', 'Aplica un precio promocional a la vitrina sin cambiar el precio de mostrador.', 'Applies storefront promo pricing without changing counter prices.')}</small>
                    </div>
                    <div className="commerce-bulk-promo-row">
                      <div className="commerce-bulk-promo-input-wrap">
                        <input
                          type="number"
                          min="1"
                          max="90"
                          value={pctDescontoLote}
                          onChange={(e) => setPctDescontoLote(e.target.value)}
                          className="commerce-input-pct"
                          placeholder="15"
                        />
                        <span>% OFF</span>
                      </div>
                      <button
                        type="button"
                        className="commerce-btn-apply-bulk-promo"
                        onClick={aplicarDescontoEmLote}
                      >
                        {tx('Aplicar % a Todos', 'Aplicar % a Todos', 'Apply % to All')}
                      </button>
                      <button
                        type="button"
                        className="commerce-btn-clear-promo"
                        onClick={limparDescontosEmLote}
                      >
                        {tx('Limpar Promoções', 'Quitar Promociones', 'Clear Promos')}
                      </button>
                    </div>
                  </div>

                  {/* 3. BARRA DE BUSCA E ABAS DE FILTRO */}
                  <div className="commerce-prod-filter-bar">
                    <input
                      type="text"
                      className="commerce-prod-search-input"
                      value={buscaProduto}
                      onChange={(e) => setBuscaProduto(e.target.value)}
                      placeholder={tx('🔍 Buscar produto por nome ou SKU…', '🔍 Buscar producto…', '🔍 Search products…')}
                    />

                    <div className="commerce-prod-tabs">
                      {(() => {
                        const mapa = configCommerce.produtosLoja || {};
                        const lista = produtos || [];
                        const total = lista.length;
                        const ativos = lista.filter(p => mapa[p.id]?.ativo ?? (Number(p.estoque ?? 0) > 0)).length;
                        const comPromo = lista.filter(p => mapa[p.id]?.precoPromoBRL).length;
                        const destaques = lista.filter(p => mapa[p.id]?.destaque).length;

                        return (
                          <>
                            <button
                              type="button"
                              className={`commerce-prod-tab-btn ${filtroProdutosTab === 'todos' ? 'active' : ''}`}
                              onClick={() => setFiltroProdutosTab('todos')}
                            >
                              {tx('Todos', 'Todos', 'All')} ({total})
                            </button>
                            <button
                              type="button"
                              className={`commerce-prod-tab-btn ${filtroProdutosTab === 'ativos' ? 'active' : ''}`}
                              onClick={() => setFiltroProdutosTab('ativos')}
                            >
                              🟢 {tx('Na Loja', 'En Tienda', 'In Store')} ({ativos})
                            </button>
                            <button
                              type="button"
                              className={`commerce-prod-tab-btn ${filtroProdutosTab === 'promo' ? 'active' : ''}`}
                              onClick={() => setFiltroProdutosTab('promo')}
                            >
                              🏷️ {tx('Em Promoção', 'En Promoción', 'On Sale')} ({comPromo})
                            </button>
                            <button
                              type="button"
                              className={`commerce-prod-tab-btn ${filtroProdutosTab === 'destaque' ? 'active' : ''}`}
                              onClick={() => setFiltroProdutosTab('destaque')}
                            >
                              ⭐ {tx('Destaques', 'Destacados', 'Featured')} ({destaques})
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 4. LISTA RÁPIDA DE PRODUTOS */}
                  <div className="commerce-prod-table-wrap">
                    {(() => {
                      const mapa = configCommerce.produtosLoja || {};
                      const termo = buscaProduto.toLowerCase().trim();

                      const filtrados = (produtos || []).filter(p => {
                        if (!p || !p.nome) return false;
                        if (termo && !p.nome.toLowerCase().includes(termo) && !String(p.sku || '').toLowerCase().includes(termo)) {
                          return false;
                        }

                        const cfgP = mapa[p.id] || {};
                        const isAtivo = cfgP.ativo !== undefined ? cfgP.ativo : Number(p.estoque ?? 0) > 0;

                        if (filtroProdutosTab === 'ativos') return isAtivo;
                        if (filtroProdutosTab === 'promo') return Boolean(cfgP.precoPromoBRL);
                        if (filtroProdutosTab === 'destaque') return Boolean(cfgP.destaque);
                        return true;
                      });

                      if (filtrados.length === 0) {
                        return (
                          <div className="commerce-prod-empty-box">
                            <span>📦</span>
                            <p>{tx('Nenhum produto encontrado neste filtro.', 'Ningún producto encontrado.', 'No products found.')}</p>
                          </div>
                        );
                      }

                      return (
                        <div className="commerce-prod-list">
                          {filtrados.slice(0, 100).map(p => {
                            const cfgP = mapa[p.id] || {};
                            const isAtivo = cfgP.ativo !== undefined ? cfgP.ativo : Number(p.estoque ?? 0) > 0;
                            const isDestaque = Boolean(cfgP.destaque);
                            const precoNormal = Number(p.precoBRL ?? p.preco ?? p.precoVenda ?? 0);
                            const precoPromo = cfgP.precoPromoBRL || '';
                            const fotosArr = Array.isArray(cfgP.imagensLoja) && cfgP.imagensLoja.length > 0
                              ? cfgP.imagensLoja.filter(Boolean)
                              : (cfgP.imagemLoja ? [cfgP.imagemLoja] : (p.imagem || p.fotoUrl ? [p.imagem || p.fotoUrl] : []));
                            const fotoThumb = fotosArr[0] || '';
                            const totalFotos = fotosArr.length;

                            return (
                              <div key={p.id} className={`commerce-prod-row ${isAtivo ? 'active' : 'inactive'}`}>
                                {/* Foto e Identificação */}
                                <div className="commerce-prod-row-main">
                                  <div className="commerce-prod-thumb">
                                    {fotoThumb ? (
                                      <img src={fotoThumb} alt={p.nome} />
                                    ) : (
                                      <span className="thumb-placeholder">📦</span>
                                    )}
                                    {totalFotos > 1 && <span className="thumb-count-tag" title={`${totalFotos} fotos na galeria`}>📷 {totalFotos}</span>}
                                  </div>
                                  <div className="commerce-prod-texts">
                                    <div className="commerce-prod-name-row">
                                      <strong>{cfgP.nomeLoja || p.nome}</strong>
                                      {isDestaque && <span className="badge-destaque-tag">⭐ DESTAQUE</span>}
                                      {precoPromo && <span className="badge-promo-tag">{cfgP.tagPromo || 'OFERTA'}</span>}
                                    </div>
                                    <small>
                                      SKU: {p.sku || p.id} • {p.grupo || p.categoria || 'Geral'} • Estoque: {p.estoque ?? 0}
                                      {totalFotos > 1 && ` • 📷 ${totalFotos} fotos`}
                                    </small>
                                  </div>
                                </div>

                                {/* Preço de Balcão vs Preço Promocional */}
                                <div className="commerce-prod-prices-col">
                                  <div className="price-balcao">
                                    <span className="price-label">Balcão:</span>
                                    <strong className={precoPromo ? 'riscado' : ''}>
                                      R$ {precoNormal.toFixed(2).replace('.', ',')}
                                    </strong>
                                  </div>

                                  <div className="price-promo-input-group">
                                    <span className="price-label">Promoção:</span>
                                    <div className="input-promo-wrap">
                                      <span className="currency-prefix">R$</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0,00"
                                        value={precoPromo}
                                        onChange={(e) => alterarPrecoPromoRapido(p.id, e.target.value)}
                                        className="input-promo-quick"
                                        title={tx('Preço promocional riscado na vitrine', 'Precio de oferta', 'Discounted promo price')}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Controles Rápidos: Na Loja, Destaque e Personalizar */}
                                <div className="commerce-prod-actions-col">
                                  <button
                                    type="button"
                                    className={`btn-toggle-store ${isAtivo ? 'active' : ''}`}
                                    onClick={() => alternarAtivoProduto(p.id)}
                                    title={isAtivo ? tx('Clique para ocultar da vitrine', 'Clic para ocultar', 'Click to hide') : tx('Clique para ativar na vitrine', 'Clic para activar', 'Click to activate')}
                                  >
                                    {isAtivo ? '🟢 Na Loja' : '⚪ Oculto'}
                                  </button>

                                  <button
                                    type="button"
                                    className={`btn-toggle-star ${isDestaque ? 'active' : ''}`}
                                    onClick={() => alternarDestaqueProduto(p.id)}
                                    title={isDestaque ? tx('Item em destaque na vitrine', 'Destacado', 'Featured') : tx('Marcar como destaque', 'Marcar destacado', 'Set as featured')}
                                  >
                                    {isDestaque ? '⭐' : '☆'}
                                  </button>

                                  <button
                                    type="button"
                                    className="btn-custom-product"
                                    onClick={() => abrirModalEdicao(p)}
                                    title={tx('Personalizar fotos e descrição para a loja', 'Personalizar', 'Customize')}
                                  >
                                    ✏️
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
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
              <div className="commerce-mockup-screen commerce-premium-scroll">
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

      {/* MODAL PARA PERSONALIZAR PRODUTO NA LOJA */}
      {produtoModalEdicao && (
        <div className="commerce-prod-modal-overlay">
          <div className="commerce-prod-modal-card">
            <div className="commerce-prod-modal-header">
              <div className="modal-title-box">
                <span className="modal-kicker">🌐 LOJA ONLINE</span>
                <h3>{tx('Personalizar Produto para a Vitrine', 'Personalizar Producto para Vitrina', 'Customize Product for Storefront')}</h3>
              </div>
              <button
                type="button"
                className="commerce-modal-close-btn"
                onClick={() => setProdutoModalEdicao(null)}
              >
                ✕
              </button>
            </div>

            <div className="commerce-prod-modal-body">
              <div className="commerce-field">
                <label>{tx('Nome do Produto na Vitrine', 'Nombre en Vitrina', 'Storefront Name')}</label>
                <input
                  type="text"
                  value={formProdCustom.nomeLoja}
                  onChange={(e) => setFormProdCustom(prev => ({ ...prev, nomeLoja: e.target.value }))}
                  placeholder={produtoModalEdicao.nome}
                />
              </div>

              {/* GALERIA DE FOTOS PARA A LOJA (ATÉ 5 FOTOS) */}
              <div className="commerce-media-block" style={{ marginTop: 12 }}>
                <div className="commerce-media-header-row">
                  <span className="commerce-media-label">📸 {tx('Fotos da Loja (Galeria de Detalhes)', 'Fotos de la Tienda (Galería)', 'Storefront Photo Gallery')}</span>
                  <span className="commerce-media-counter">{(formProdCustom.imagensLoja || []).length}/5 {tx('fotos', 'fotos', 'photos')}</span>
                </div>
                <small style={{ color: '#94a3b8', fontSize: '11px', display: 'block', margin: '4px 0 8px' }}>
                  {tx('Adicione fotos de diferentes ângulos e detalhes do material. A foto com selo ⭐ Capa será exibida primeiro no catálogo.', 'Añade fotos de diferentes ángulos y material.', 'Add photos of angles and material details. The ⭐ Cover photo appears first in the catalog.')}
                </small>

                <div className="commerce-prod-gallery-grid">
                  {(formProdCustom.imagensLoja || []).map((fotoUrl, idx) => (
                    <div key={idx} className={`commerce-gallery-item ${idx === 0 ? 'principal' : ''}`}>
                      <img src={fotoUrl} alt={`Foto ${idx + 1}`} />
                      <div className="gallery-item-overlay">
                        {idx === 0 ? (
                          <span className="badge-foto-principal">⭐ Capa</span>
                        ) : (
                          <button
                            type="button"
                            className="btn-set-principal"
                            onClick={() => definirFotoPrincipal(idx)}
                            title={tx('Definir como foto de capa', 'Fijar como portada', 'Set as cover photo')}
                          >
                            Tornar Capa
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-del-foto"
                          onClick={() => removerFotoProduto(idx)}
                          title={tx('Remover foto', 'Quitar foto', 'Remove photo')}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                  {(formProdCustom.imagensLoja || []).length < 5 && (
                    <label className="commerce-gallery-add-slot" title={tx('Adicionar foto (PNG, JPG, WebP)', 'Añadir foto', 'Add photo')}>
                      <span className="add-icon">➕</span>
                      <span className="add-text">{tx('Adicionar Foto', 'Añadir Foto', 'Add Photo')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={lidarUploadFotosProduto}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* PREÇO NORMAL VS PREÇO PROMOCIONAL */}
              <div className="commerce-prod-modal-prices-grid">
                <div className="commerce-field">
                  <label>{tx('Preço Normal de Balcão (R$)', 'Precio Normal', 'Normal Price')}</label>
                  <input
                    type="text"
                    disabled
                    value={`R$ ${(Number(produtoModalEdicao.precoBRL ?? produtoModalEdicao.preco ?? 0)).toFixed(2).replace('.', ',')}`}
                    style={{ opacity: 0.7 }}
                  />
                </div>

                <div className="commerce-field">
                  <label>{tx('Preço Promocional na Loja (R$)', 'Precio Promocional', 'Promo Price')}</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 89.90"
                    value={formProdCustom.precoPromoBRL}
                    onChange={(e) => setFormProdCustom(prev => ({ ...prev, precoPromoBRL: e.target.value }))}
                  />
                </div>
              </div>

              {/* SELO / ETIQUETA PROMOCIONAL */}
              <div className="commerce-field">
                <label>{tx('Etiqueta / Selo (Opcional)', 'Etiqueta de Oferta', 'Promo Tag')}</label>
                <div className="commerce-tag-options">
                  {['OFERTA', 'PROMOÇÃO', 'LANÇAMENTO', 'MAIS VENDIDO', 'DESTAQUE'].map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className={`commerce-tag-chip ${formProdCustom.tagPromo === tag ? 'active' : ''}`}
                      onClick={() => setFormProdCustom(prev => ({ ...prev, tagPromo: tag }))}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* DESCRIÇÃO COMERCIAL */}
              <div className="commerce-field">
                <label>{tx('Descrição Detalhada para o Cliente', 'Descripción para Clientes', 'Storefront Description')}</label>
                <textarea
                  rows={3}
                  value={formProdCustom.descricaoLoja}
                  onChange={(e) => setFormProdCustom(prev => ({ ...prev, descricaoLoja: e.target.value }))}
                  placeholder={tx('Ex: Produto de alta durabilidade, ideal para acabamento fino. Pronta entrega.', 'Descripción del producto...', 'Commercial description...')}
                />
              </div>

              {/* TOGGLES */}
              <div className="commerce-modal-toggles-row">
                <label className="commerce-modal-check">
                  <input
                    type="checkbox"
                    checked={formProdCustom.ativo}
                    onChange={(e) => setFormProdCustom(prev => ({ ...prev, ativo: e.target.checked }))}
                  />
                  <span>🟢 {tx('Publicar na Loja Online', 'Publicar en la Tienda', 'Show in Storefront')}</span>
                </label>

                <label className="commerce-modal-check">
                  <input
                    type="checkbox"
                    checked={formProdCustom.destaque}
                    onChange={(e) => setFormProdCustom(prev => ({ ...prev, destaque: e.target.checked }))}
                  />
                  <span>⭐ {tx('Colocar em Destaque na Página Inicial', 'Destacar en Inicio', 'Feature on Homepage')}</span>
                </label>
              </div>

            </div>

            <div className="commerce-prod-modal-footer">
              <button
                type="button"
                className="commerce-btn-modal-cancel"
                onClick={() => setProdutoModalEdicao(null)}
              >
                {tx('Cancelar', 'Cancelar', 'Cancel')}
              </button>
              <button
                type="button"
                className="commerce-btn-modal-save"
                onClick={salvarModalEdicao}
              >
                ✓ {tx('Confirmar Alterações', 'Confirmar Cambios', 'Confirm Changes')}
              </button>
            </div>
          </div>
        </div>
      )}

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
