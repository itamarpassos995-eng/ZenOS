import React, { useEffect, useMemo, useState } from 'react';
import CommerceDialog from './CommerceDialog';
import '../commerce.css';

const moeda = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((n || 0) / 100);

const paths = {
  bag: 'M6 7h12l2 14H4L6 7Zm3 0V5a3 3 0 0 1 6 0v2',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0ZM7 10h8m-8 4h5',
  check: 'm5 12 4 4L19 6',
  box: 'm3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5m-9 5v10',
  truck: 'M2 5h12v12H2V5Zm12 5h4l4 4v3h-8M5 17a2 2 0 1 0 4 0m8 0a2 2 0 1 0 4 0',
  spark: 'm12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z'
};

function Icon({ name }) {
  return (
    <svg
      className="commerce-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.bag} />
    </svg>
  );
}

const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

const chaveSessao = id => 'zenos:commerce:carrinho:' + (id || 'default');

function recuperarSessao(id) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(chaveSessao(id)) || '{}');
    const carrinho = Object.fromEntries(
      Object.entries(draft.carrinho || {})
        .slice(0, 50)
        .filter(([sku, n]) => typeof sku === 'string' && sku.length <= 100 && Number.isSafeInteger(n) && n > 0 && n <= 1000)
    );
    const chave = /^[a-zA-Z0-9_-]{16,80}$/.test(draft.chave || '') ? draft.chave : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sess-' + Date.now());
    return { carrinho, chave };
  } catch {
    return { carrinho: {}, chave: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sess-' + Date.now() };
  }
}

export function montarLojaAPartirDeConfig(configCommerce = {}, produtos = [], lojaId = '') {
  const corPrincipal = configCommerce.corTema || '#193d4e';
  const nomeLoja = configCommerce.nomeLoja || 'Minha Loja';
  const slogan = configCommerce.slogan || 'Sua seleção, em um só lugar';
  const textoTopo = configCommerce.avisoTopo || 'Conheça nossas novidades';
  const taxaEntregaTexto = configCommerce.taxaEntrega ? `Entrega: ${configCommerce.taxaEntrega}` : 'Consulte entrega e retirada';

  const banners = [
    {
      id: 'b-1',
      ativo: true,
      titulo: 'Sua loja, sua identidade',
      subtitulo: configCommerce.slogan || 'Conheça os produtos selecionados.',
      selo: 'NOVIDADES',
      chamada: 'Ver catálogo',
      caminho: '/catalogo',
      corFundo: corPrincipal,
      alinhamento: 'esquerda',
      imagemDesktop: configCommerce.bannerUrl || '',
      imagemMobile: configCommerce.bannerUrl || ''
    }
  ];

  const produtosValidos = Array.isArray(produtos) ? produtos.filter(p => p && p.nome) : [];
  let catalogo = [];

  if (produtosValidos.length > 0) {
    catalogo = produtosValidos.slice(0, 24).map((p, idx) => {
      const precoNumerico = Number(p.preco || p.precoVenda || p.precoUnitario || 0);
      return {
        skuPublico: String(p.id || `p-${idx + 1}`),
        nome: p.nome,
        categoria: p.categoria || 'Geral',
        precoCentavos: Math.round(precoNumerico * 100),
        disponivel: Number(p.estoque ?? 1) > 0,
        imagemUrl: p.imagem || p.fotoUrl || (idx === 0 ? '/demo-mademoiselle-elegance.png' : ''),
        descricao: p.descricao || p.detalhes || '',
        quantidadeMaxima: Math.max(1, Number(p.estoque || 10)),
        imagens: (p.imagem || p.fotoUrl)
          ? [{ id: 'f-1', url: p.imagem || p.fotoUrl }]
          : (idx === 0 ? [{ id: 'f-demo', url: '/demo-mademoiselle-elegance.png' }] : [])
      };
    });
  }

  // Se nenhum produto tiver foto, garantimos o produto clássico e elegante da demonstração
  if (catalogo.length === 0 || !catalogo.some(p => p.imagemUrl)) {
    catalogo = [
      {
        skuPublico: 'demo-mademoiselle',
        nome: 'Body Splash Mademoiselle Élégance',
        categoria: 'PERFUMARIA',
        precoCentavos: 8990,
        disponivel: true,
        imagemUrl: '/demo-mademoiselle-elegance.png',
        descricao: 'Fragrância inspirada em Coco Mademoiselle. Perfumação corporal feminina com notas de laranja, rosa, patchouli e baunilha.',
        quantidadeMaxima: 10,
        imagens: [{ id: 'f-1', url: '/demo-mademoiselle-elegance.png' }]
      }
    ];
  }

  return {
    idPublico: lojaId || configCommerce.lojaId || 'preview',
    whatsapp: (configCommerce.whatsapp || '').replace(/\D/g, ''),
    revision: 1,
    aparencia: {
      nomeLoja,
      slogan,
      textoTopo,
      etiquetaFrete: taxaEntregaTexto,
      corPrincipal,
      corDestaque: '#d9a65b',
      corSuperficie: '#f7f6f3',
      corTexto: '#162d38',
      layoutGrade: '4',
      exibirCategorias: true,
      exibirPesquisa: true,
      exibirWhatsapp: Boolean(configCommerce.whatsapp),
      mostrarPreco: configCommerce.mostrarPreco !== false,
      logoUrl: configCommerce.logoUrl || '',
      banners
    },
    catalogo
  };
}

export default function ZenCommerceStorefront({
  idPublico,
  lojaInicial = null,
  configCommerce = null,
  produtos = [],
  isLivePreview = true
}) {
  // Prévia privada: nunca recuperar carrinho anterior nem dados de cliente.
  const [sessaoInicial] = useState(() => isLivePreview ? { carrinho: {}, chave: 'preview' } : recuperarSessao(idPublico));
  const lojaDerivada = useMemo(() => {
    if (lojaInicial) return lojaInicial;
    if (configCommerce) return montarLojaAPartirDeConfig(configCommerce, produtos, idPublico);
    return null;
  }, [lojaInicial, configCommerce, produtos, idPublico]);

  const [loja, setLoja] = useState(lojaDerivada);
  const [filtro, setFiltro] = useState('');
  const [categoria, setCategoria] = useState('');
  const [carrinho, setCarrinho] = useState(sessaoInicial.carrinho);
  const [detalhe, setDetalhe] = useState(null);
  const [foto, setFoto] = useState(0);
  const [banner, setBanner] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [cliente, setCliente] = useState({ nome: '', telefone: '', observacao: '', aceiteContato: false });
  const [recibo, setRecibo] = useState(null);
  const [chave, setChave] = useState(sessaoInicial.chave);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (lojaDerivada) setLoja(lojaDerivada);
  }, [lojaDerivada]);

  useEffect(() => {
    if (isLivePreview) return;
    try {
      sessionStorage.setItem(chaveSessao(idPublico), JSON.stringify({ carrinho, chave }));
    } catch {
      /* Modo anônimo ou storage indisponível */
    }
  }, [idPublico, carrinho, chave, isLivePreview]);

  const cfg = loja?.aparencia || {};
  const catalogo = loja?.catalogo || [];

  const itens = useMemo(() => {
    return Object.entries(carrinho).flatMap(([skuPublico, quantidade]) => {
      const p = catalogo.find(item => item.skuPublico === skuPublico);
      return p && quantidade > 0 ? [{ ...p, quantidade }] : [];
    });
  }, [carrinho, catalogo]);

  const total = itens.reduce((n, p) => n + (p.precoCentavos || 0) * p.quantidade, 0);
  const quantidade = itens.reduce((n, p) => n + p.quantidade, 0);

  const alterar = (sku, delta) => {
    if (isLivePreview) return;
    if (recibo) {
      setRecibo(null);
      setChave(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sess-' + Date.now());
    }
    setCarrinho(prev => {
      const p = catalogo.find(item => item.skuPublico === sku);
      const novaQtd = (prev[sku] || 0) + delta;
      const maximo = p?.quantidadeMaxima || 99;
      return {
        ...prev,
        [sku]: Math.max(0, Math.min(maximo, novaQtd))
      };
    });
  };

  const abrirProduto = p => {
    setDetalhe(p);
    setFoto(0);
  };

  const bannerDestino = e => {
    e.preventDefault();
    const el = document.getElementById('catalogo');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const enviarPedido = async e => {
    e.preventDefault();
    if (isLivePreview || busy) return;
    setBusy(true);
    setErro('');

    try {
      const idSimulado = 'ZN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const numeroWhats = loja?.whatsapp || '';
      const textoMensagem = encodeURIComponent(
        `Olá! Gostaria de confirmar meu pedido na vitrine *${cfg.nomeLoja}*:\n\n` +
        itens.map(i => `• ${i.quantidade}x ${i.nome} (${moeda(i.precoCentavos)})`).join('\n') +
        `\n\n*Total:* ${moeda(total)}\n*Cliente:* ${cliente.nome}\n*Telefone:* ${cliente.telefone}` +
        (cliente.observacao ? `\n*Obs:* ${cliente.observacao}` : '')
      );
      const whatsUrl = numeroWhats ? `https://wa.me/${numeroWhats}?text=${textoMensagem}` : '';

      setRecibo({
        id: idSimulado,
        totalCentavos: total,
        whatsappUrl: whatsUrl,
        isSimulacao: isLivePreview || !numeroWhats
      });
    } catch (err) {
      setErro('Não foi possível processar o pedido. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  if (!loja) {
    return (
      <main className="commerce-store">
        <div className="commerce-shell" style={{ paddingBlock: 90 }}>
          <div className="commerce-empty">
            <span className="commerce-empty-icon"><Icon name="bag" /></span>
            <h1>Preparando sua vitrine…</h1>
            <p>Carregando as informações da loja.</p>
          </div>
        </div>
      </main>
    );
  }

  const banners = cfg.banners?.filter(b => b.ativo) || [];
  const hero = banners[banner % (banners.length || 1)] || banners[0];
  const monograma = (cfg.nomeLoja || 'Z').trim().charAt(0).toUpperCase();
  const filtrados = catalogo.filter(p => {
    const atendeCategoria = !categoria || p.categoria === categoria;
    const atendeFiltro = !filtro || `${p.nome} ${p.categoria}`.toLowerCase().includes(filtro.toLowerCase());
    return atendeCategoria && atendeFiltro;
  });
  const destaque = catalogo.find(p => p.imagemUrl);

  const vars = {
    '--c-primary': cfg.corPrincipal || '#193d4e',
    '--c-accent': cfg.corDestaque || '#d9a65b',
    '--c-surface': cfg.corSuperficie || '#f7f6f3',
    '--c-text': cfg.corTexto || '#162d38',
    '--commerce-columns': cfg.layoutGrade || '4'
  };

  return (
    <main className="commerce-store" style={vars}>
      {/* 1. TOPO: HOMOLOGAÇÃO & ANÚNCIO */}
      <div className="commerce-test-note">
        HOMOLOGAÇÃO · Esta é uma loja de teste
      </div>
      {cfg.textoTopo && (
        <div className="commerce-announcement">
          {cfg.textoTopo}
        </div>
      )}

      {/* 2. CABEÇALHO ELEGANTE BRANCO */}
      <header className="commerce-header">
        <div className="commerce-shell commerce-header-row">
          <a className="commerce-brand" href="#inicio" aria-label={`${cfg.nomeLoja} — início`}>
            {cfg.logoUrl ? (
              <img
                src={cfg.logoUrl}
                alt={cfg.nomeLoja}
                style={{ width: 47, height: 50, objectFit: 'contain', borderRadius: '8px' }}
              />
            ) : (
              <span className="commerce-brand-mark" aria-hidden="true">{monograma}</span>
            )}
            <span>
              <strong>{cfg.nomeLoja}</strong>
              <small>{cfg.slogan ? cfg.slogan.slice(0, 42) : 'Sua seleção, em um só lugar'}</small>
            </span>
          </a>

          <nav className="commerce-header-links" aria-label="Menu da loja">
            <a href="#catalogo">Explorar catálogo</a>
            {!isLivePreview && cfg.exibirWhatsapp && loja.whatsapp && (
              <a href={`https://wa.me/${loja.whatsapp}`} target="_blank" rel="noopener noreferrer">
                Atendimento
              </a>
            )}
          </nav>

          {isLivePreview ? (
            <span className="commerce-btn commerce-preview-cart" aria-label="Carrinho ilustrativo, indisponível na prévia">
              <Icon name="bag" /><span className="commerce-cart-label">Carrinho</span><span className="commerce-cart-count">0</span>
            </span>
          ) : (
            <button type="button" className="commerce-btn" onClick={() => setAberto(true)} aria-label={`Abrir carrinho com ${quantidade} itens`}>
              <Icon name="bag" /><span className="commerce-cart-label">Carrinho</span><span className="commerce-cart-count">{quantidade}</span>
            </button>
          )}
        </div>
      </header>

      {/* 3. CONTEÚDO PRINCIPAL */}
      <div className="commerce-shell" id="inicio">
        {/* Barra de Pesquisa */}
        {cfg.exibirPesquisa && (
          <label className="commerce-search">
            <Icon name="search" />
            <input
              aria-label="Buscar produtos"
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              placeholder="O que você está procurando?"
            />
            {filtro && (
              <button
                type="button"
                className="commerce-icon-button"
                aria-label="Limpar pesquisa"
                onClick={() => setFiltro('')}
              >
                ×
              </button>
            )}
          </label>
        )}

        {/* Hero Banner Sofisticado */}
        {hero && (
          <section
            className={`commerce-hero${hero.imagemDesktop || hero.imagemMobile ? ' commerce-hero-with-photo' : ''}`}
            style={{ '--hero-bg': hero.corFundo || cfg.corPrincipal, marginTop: cfg.exibirPesquisa ? 0 : 24 }}
          >
            {(hero.imagemDesktop || hero.imagemMobile) && (
              <picture className="commerce-hero-picture">
                <source media="(max-width:640px)" srcSet={hero.imagemMobile || hero.imagemDesktop} />
                <img src={hero.imagemDesktop || hero.imagemMobile} alt="" />
              </picture>
            )}
            <div className="commerce-hero-copy" style={hero.alinhamento === 'centro' ? { textAlign: 'center' } : undefined}>
              <span className="commerce-eyebrow">{hero.selo || 'NOVIDADES'}</span>
              <h1>{hero.titulo}</h1>
              <p>{hero.subtitulo || cfg.slogan}</p>
              <a className="commerce-btn commerce-btn-gold" href="#catalogo" onClick={bannerDestino}>
                {hero.chamada || 'Ver catálogo'}
                <Icon name="arrow" />
              </a>
            </div>
            <div className="commerce-hero-art" aria-hidden="true">
              <div className="commerce-hero-orbit" />
              {destaque && !hero.imagemDesktop ? (
                <figure className="commerce-hero-product">
                  <img src={destaque.imagemUrl} alt="" />
                  <figcaption>
                    {destaque.nome}
                    <small style={{ display: 'block', color: '#7b8788', fontSize: '10px', marginTop: 2 }}>
                      Produto de demonstração
                    </small>
                  </figcaption>
                </figure>
              ) : (
                <div className="commerce-hero-seal">
                  <strong>{monograma}</strong>
                  <span>{cfg.nomeLoja}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {banners.length > 1 && (
          <div className="commerce-dots">
            {banners.map((b, i) => (
              <button
                key={b.id || i}
                type="button"
                aria-label={`Mostrar banner ${i + 1}`}
                aria-current={banner === i}
                onClick={() => setBanner(i)}
              />
            ))}
          </div>
        )}

        {/* 4. Faixa de Benefícios */}
        <div className="commerce-benefits">
          <div className="commerce-benefit">
            <Icon name="check" />
            <div>
              <strong>Pedido identificado</strong>
              <small>Receba um número após confirmar</small>
            </div>
          </div>
          <div className="commerce-benefit">
            <Icon name="truck" />
            <div>
              <strong>Entrega ou retirada</strong>
              <small>Combine diretamente com a loja</small>
            </div>
          </div>
          <div className="commerce-benefit">
            <Icon name="chat" />
            <div>
              <strong>Atendimento próximo</strong>
              <small>Converse pelo WhatsApp</small>
            </div>
          </div>
        </div>

        {/* 5. Seção de Catálogo / Curadoria */}
        <section className="commerce-catalog" id="catalogo">
          <div className="commerce-catalog-head">
            <div>
              <span className="commerce-eyebrow">CURADORIA DA LOJA</span>
              <h2>{filtro ? 'Encontre sua escolha' : 'Escolhidos para você'}</h2>
            </div>
            {catalogo.length > 0 && (
              <span>
                {filtrados.length} {filtrados.length === 1 ? 'produto' : 'produtos'} na seleção
              </span>
            )}
          </div>

          {cfg.exibirCategorias && catalogo.length > 0 && (
            <nav className="commerce-categories" aria-label="Categorias">
              {['', ...new Set(catalogo.map(p => p.categoria).filter(Boolean))].map(c => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={categoria === c}
                  onClick={() => setCategoria(c)}
                >
                  {c || 'Todos os produtos'}
                </button>
              ))}
            </nav>
          )}

          <div className="commerce-public-grid">
            {filtrados.map(p => (
              <article key={p.skuPublico} className="commerce-product">
                <button
                  type="button"
                  className="commerce-product-image"
                  aria-label={`Ver ${p.nome}`}
                  onClick={() => abrirProduto(p)}
                >
                  {p.imagemUrl ? <img src={p.imagemUrl} alt={p.nome} loading="lazy" /> : <span>◇</span>}
                </button>
                <div className="commerce-product-details">
                  <small>{p.categoria}</small>
                  <h3>{p.nome}</h3>
                  {cfg.mostrarPreco && <strong className="commerce-product-price">{moeda(p.precoCentavos)}</strong>}
                  <button
                    type="button"
                    className="commerce-btn"
                    disabled={isLivePreview || !p.disponivel}
                    onClick={() => alterar(p.skuPublico, 1)}
                  >
                    <Icon name="bag" />
                    {p.disponivel
                      ? carrinho[p.skuPublico]
                        ? `Adicionar mais (${carrinho[p.skuPublico]})`
                        : 'Adicionar'
                      : 'Indisponível'}
                  </button>
                </div>
              </article>
            ))}
          </div>

          {!filtrados.length && (
            <div className="commerce-empty">
              <span className="commerce-empty-icon"><Icon name={catalogo.length ? 'search' : 'box'} /></span>
              <h3>{catalogo.length ? 'Não encontramos essa combinação' : 'Nossa seleção está chegando'}</h3>
              <p>
                {catalogo.length
                  ? 'Experimente outro termo ou explore todas as categorias.'
                  : 'Estamos preparando os produtos da loja. Enquanto isso, fale com nossa equipe para conhecer as opções.'}
              </p>
              {catalogo.length ? (
                <button
                  type="button"
                  className="commerce-btn commerce-btn-secondary"
                  onClick={() => { setFiltro(''); setCategoria(''); }}
                >
                  Ver todos os produtos <Icon name="arrow" />
                </button>
              ) : !isLivePreview && cfg.exibirWhatsapp && loja.whatsapp && (
                <a
                  className="commerce-btn commerce-btn-secondary"
                  href={`https://wa.me/${loja.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Conversar com a loja <Icon name="chat" />
                </a>
              )}
            </div>
          )}
        </section>

        {/* 6. Atendimento Direto */}
        <section className="commerce-contact" id="atendimento">
          <div>
            <h3>Uma boa escolha começa com uma conversa.</h3>
            <p>{cfg.etiquetaFrete || 'Consulte entrega e retirada'}. Confirme disponibilidade, entrega e pagamento diretamente com a loja.</p>
          </div>
          {!isLivePreview && cfg.exibirWhatsapp && loja.whatsapp && (
            <a
              className="commerce-btn"
              href={`https://wa.me/${loja.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="chat" /> Falar com a loja
            </a>
          )}
        </section>
      </div>

      {/* 7. Rodapé Sofisticado */}
      <footer className="commerce-footer">
        <div className="commerce-shell">
          <div className="commerce-footer-main">
            <div>
              <strong>{cfg.nomeLoja}</strong>
              <p>{cfg.slogan}</p>
            </div>
            <a href="#catalogo">Explorar a seleção ↗</a>
          </div>
          <div className="commerce-footer-bottom">
            <span>{isLivePreview ? 'Prévia demonstrativa · Sem pedidos, pagamentos ou atendimento externo.' : 'Pedidos sujeitos à confirmação da loja. Pagamento e entrega a combinar.'}</span>
            <span>Feito com ZenOS Commerce</span>
          </div>
        </div>
      </footer>

      {/* MODAL DETALHE DO PRODUTO */}
      {detalhe && (
        <CommerceDialog title={detalhe.nome} onClose={() => setDetalhe(null)}>
          {detalhe.imagens?.[foto]?.url ? (
            <img className="commerce-full-image" src={detalhe.imagens[foto].url} alt={detalhe.nome} />
          ) : detalhe.imagemUrl ? (
            <img className="commerce-full-image" src={detalhe.imagemUrl} alt={detalhe.nome} />
          ) : null}
          {detalhe.imagens?.length > 1 && (
            <div className="commerce-thumbs">
              {detalhe.imagens.map((img, i) => (
                <button
                  key={img.id || i}
                  type="button"
                  aria-label={`Foto ${i + 1}`}
                  aria-pressed={foto === i}
                  onClick={() => setFoto(i)}
                >
                  <img src={img.miniaturaUrl || img.url} alt="" />
                </button>
              ))}
            </div>
          )}
          <p style={{ marginTop: 16 }}>{detalhe.descricao || detalhe.categoria}</p>
          {cfg.mostrarPreco && <strong className="commerce-product-price">{moeda(detalhe.precoCentavos)}</strong>}
          <button
            type="button"
            className="commerce-btn"
            disabled={isLivePreview || !detalhe.disponivel}
            onClick={() => {
              alterar(detalhe.skuPublico, 1);
              setDetalhe(null);
              setAberto(true);
            }}
          >
            <Icon name="bag" />
            {detalhe.disponivel ? 'Adicionar ao carrinho' : 'Indisponível'}
          </button>
        </CommerceDialog>
      )}

      {/* MODAL CARRINHO */}
      {!isLivePreview && aberto && (
        <CommerceDialog title="Seu carrinho" busy={busy} onClose={() => setAberto(false)}>
          {recibo ? (
            <div className="commerce-receipt" role="status">
              <span className="commerce-empty-icon"><Icon name="check" /></span>
              <h3>Seu pedido foi recebido</h3>
              <p>
                Pedido <strong>{recibo.id}</strong> · Subtotal: {moeda(recibo.totalCentavos)}
              </p>
              <p>
                {recibo.isSimulacao
                  ? 'Demonstração de pedido concluída com sucesso! Na vitrine online, o pedido envia os dados diretamente para o WhatsApp da sua loja.'
                  : 'Agora converse com a loja para confirmar disponibilidade, entrega e pagamento.'}
              </p>
              {recibo.whatsappUrl ? (
                <a className="commerce-btn" href={recibo.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="chat" /> Continuar pelo WhatsApp
                </a>
              ) : null}
              <button
                type="button"
                className="commerce-btn commerce-btn-secondary"
                onClick={() => {
                  setCarrinho({});
                  setRecibo(null);
                  setCliente({ nome: '', telefone: '', observacao: '', aceiteContato: false });
                  setChave(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'sess-' + Date.now());
                }}
              >
                Começar novo pedido
              </button>
            </div>
          ) : !itens.length ? (
            <div className="commerce-empty" style={{ border: 0 }}>
              <span className="commerce-empty-icon"><Icon name="bag" /></span>
              <h3>Espaço para suas próximas escolhas</h3>
              <p>Os produtos que você adicionar aparecem aqui. Explore o catálogo e monte seu pedido.</p>
              <button type="button" className="commerce-btn" onClick={() => setAberto(false)}>
                Continuar explorando <Icon name="arrow" />
              </button>
            </div>
          ) : (
            <form onSubmit={enviarPedido}>
              {itens.map(p => (
                <div key={p.skuPublico} className="commerce-cart-row">
                  <div>
                    <strong>{p.nome}</strong>
                    <small>{moeda(p.precoCentavos)} por unidade</small>
                  </div>
                  <div className="commerce-quantity">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => alterar(p.skuPublico, -1)}
                      aria-label={`Diminuir ${p.nome}`}
                    >
                      −
                    </button>
                    <span>{p.quantidade}</span>
                    <button
                      type="button"
                      disabled={busy || p.quantidade >= (p.quantidadeMaxima || 99)}
                      onClick={() => alterar(p.skuPublico, 1)}
                      aria-label={`Aumentar ${p.nome}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              <div className="commerce-order-summary">
                <span>Subtotal dos produtos</span>
                <strong>{moeda(total)}</strong>
              </div>
              <p style={{ fontSize: 11, color: '#73817e', margin: '8px 0 14px' }}>
                Este é um pedido de atendimento. A loja confirmará disponibilidade, frete e pagamento diretamente com você.
              </p>

              <fieldset className="commerce-form" disabled={busy}>
                <label>
                  Seu nome
                  <input
                    className="commerce-field"
                    required
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    value={cliente.nome}
                    onChange={e => setCliente({ ...cliente, nome: e.target.value })}
                  />
                </label>
                <label>
                  WhatsApp com DDD
                  <input
                    className="commerce-field"
                    required
                    type="tel"
                    autoComplete="tel"
                    maxLength={25}
                    placeholder="(11) 99999-9999"
                    value={cliente.telefone}
                    onChange={e => setCliente({ ...cliente, telefone: e.target.value })}
                  />
                </label>
                <label>
                  Quer deixar alguma observação?
                  <textarea
                    className="commerce-field"
                    maxLength={500}
                    placeholder="Preferências de entrega, retirada ou dúvidas sobre o pedido"
                    value={cliente.observacao}
                    onChange={e => setCliente({ ...cliente, observacao: e.target.value })}
                  />
                </label>
                <label className="commerce-consent">
                  <input
                    required
                    type="checkbox"
                    checked={cliente.aceiteContato}
                    onChange={e => setCliente({ ...cliente, aceiteContato: e.target.checked })}
                  />
                  Autorizo esta loja a usar meu nome, telefone e dados deste pedido para atendimento.
                </label>
                <button type="submit" className="commerce-btn" disabled={total <= 0}>
                  <Icon name="check" />
                  {busy ? 'Processando pedido…' : 'Confirmar pedido e continuar pelo WhatsApp'}
                </button>
              </fieldset>
            </form>
          )}

          {erro && (
            <div role="alert" className="commerce-feedback">
              {erro}
            </div>
          )}
        </CommerceDialog>
      )}
    </main>
  );
}
