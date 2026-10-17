import { podePublicarCommerce } from './commerceTenancy.js';
/** Layout público seguro — validação antes de renderizar/publicar. */
const CORES = Object.freeze({ principal:'#193D4E', destaque:'#D9A65B', superficie:'#F7F6F3', texto:'#162D38' });
const corta = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const corSegura = (v, fallback) => /^#[a-fA-F0-9]{6}$/.test(v || '') ? v.toUpperCase() : fallback;
const hostImagem = value => {
  if (!value) return '';
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash && u.href.length < 1200 ? u.href : '';
  } catch { return ''; }
};
const caminhoInterno = value => {
  const path = corta(value || '/catalogo', 120);
  return /^(\/catalogo|\/categoria\/[a-z0-9-]{1,60}|\/produto\/[a-z0-9-]{1,80}|\/colecao\/[a-z0-9-]{1,60})$/.test(path) ? path : '/catalogo';
};
export function normalizarBanner(banner = {}, indice = 0) {
  return {
    id: /^b-[a-z0-9-]{1,30}$/.test(banner.id || '') ? banner.id : `b-${indice + 1}`,
    ativo: banner.ativo !== false,
    titulo: corta(banner.titulo || 'Novidades para você', 90),
    subtitulo: corta(banner.subtitulo, 180),
    selo: corta(banner.selo, 36),
    chamada: corta(banner.chamada || 'Ver produtos', 32),
    caminho: caminhoInterno(banner.caminho),
    imagemDesktop: hostImagem(banner.imagemDesktop),
    imagemMobile: hostImagem(banner.imagemMobile),
    imagemDesktopStoragePath: String(banner.imagemDesktopStoragePath||'').slice(0,350),
    imagemMobileStoragePath: String(banner.imagemMobileStoragePath||'').slice(0,350),
    alinhamento: banner.alinhamento === 'centro' ? 'centro' : 'esquerda',
    corFundo: corSegura(banner.corFundo, '#193D4E'),
    ordem: Math.max(0,Math.min(99,Math.trunc(Number(banner.ordem)||indice))),
  };
}

export const aparenciaPadrao = Object.freeze({
  versao:2, nomeLoja:'Minha Loja', slogan:'Escolha com confiança. Receba com praticidade.',
  textoTopo:'Novidades selecionadas especialmente para você',
  etiquetaFrete:'Consulte entrega e retirada',
  corPrincipal:CORES.principal, corDestaque:CORES.destaque,
  corSuperficie:CORES.superficie, corTexto:CORES.texto,
  layoutGrade:'4', exibirCategorias:true, exibirPesquisa:true, exibirWhatsapp:true,
  banners:[
    {id:'b-1',ativo:true,titulo:'Escolhas que transformam o seu dia',subtitulo:'Produtos selecionados, compra simples e atendimento de verdade.',selo:'COLEÇÃO ESPECIAL',chamada:'Explorar catálogo',caminho:'/catalogo',corFundo:'#193D4E',alinhamento:'esquerda',imagemDesktop:'',imagemMobile:'',ordem:0},
    {id:'b-2',ativo:true,titulo:'Seus favoritos, em destaque',subtitulo:'Confira as novidades e encontre tudo em um só lugar.',selo:'NOVIDADES',chamada:'Ver novidades',caminho:'/catalogo',corFundo:'#755E75',alinhamento:'esquerda',imagemDesktop:'',imagemMobile:'',ordem:1},
  ],
});

export function normalizarAparencia(source = {}) {
  const src = source && typeof source === 'object' ? source : {};
  const input = Array.isArray(src.banners) ? src.banners.slice(0,5) : aparenciaPadrao.banners;
  const seen = new Set();
  const banners = input.map((b,i)=>normalizarBanner(b,i)).map((b,i)=> {
    if (seen.has(b.id)) b.id=`b-${i+1}`;
    seen.add(b.id);
    return b;
  }).sort((a,b)=>a.ordem-b.ordem);
  return {
    versao:2,
    nomeLoja:corta(src.nomeLoja || aparenciaPadrao.nomeLoja,65),
    slogan:corta(src.slogan || aparenciaPadrao.slogan,120),
    textoTopo:corta(src.textoTopo || aparenciaPadrao.textoTopo,100),
    etiquetaFrete:corta(src.etiquetaFrete || aparenciaPadrao.etiquetaFrete,90),
    corPrincipal:corSegura(src.corPrincipal,CORES.principal),
    corDestaque:corSegura(src.corDestaque,CORES.destaque),
    corSuperficie:corSegura(src.corSuperficie,CORES.superficie),
    corTexto:corSegura(src.corTexto,CORES.texto),
    layoutGrade:src.layoutGrade === '3' ? '3' : '4',
    exibirCategorias:src.exibirCategorias !== false,
    exibirPesquisa:src.exibirPesquisa !== false,
    exibirWhatsapp:src.exibirWhatsapp !== false,
    banners,
  };
}

export function projetarAparenciaPublica(config = {}, entitlement = {}) {
  if (!podePublicarCommerce(entitlement)) return null;
  const cfg=normalizarAparencia(config);
  return {...cfg,banners:cfg.banners.filter(b=>b.ativo)};
}

export function atualizarBannerDaVitrine(aparencia, bannerId, alteracoes) {
  const cfg=normalizarAparencia(aparencia);
  if (!cfg.banners.some(b=>b.id===bannerId)) throw new Error('Banner inexistente.');
  cfg.banners=cfg.banners.map((banner,i)=> banner.id===bannerId ? normalizarBanner({...banner,...alteracoes},i) : banner);
  return normalizarAparencia(cfg);
}
