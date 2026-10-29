/* ZenOS Commerce CDN: apenas contrato de publicação, sem Firestore ou rede. */
const texto=(v,n=240)=>String(v??'').trim().slice(0,n);
const numero=v=>Number.isFinite(Number(v))?Number(v):0;
export const COMMERCE_MAX_PRODUTOS=10000;
export const COMMERCE_TAMANHO_PAGINA=80;
const imagem=v=>{
  const s=texto(v,1500000);
  return /^(https:\/\/[^\s]+|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(s)?s:'';
};
export function criarSnapshotCommercePublico({lojaId,config={},produtos=[],publicadoEm}){
  const uid=texto(lojaId,128);
  if(!uid||uid.includes('/')||uid.includes('..'))throw Error('loja-id-invalido');
  if(!Array.isArray(produtos)||produtos.length>COMMERCE_MAX_PRODUTOS)throw Error('produtos-invalidos');
  const c=config&&typeof config==='object'?config:{};
  const ajustes=c.produtosLoja&&typeof c.produtosLoja==='object'?c.produtosLoja:{};
  const desconto=Math.max(0,Math.min(100,numero(c.descontoGeralPorcentagem)));
  const visiveis=[],personalizacoes={};
  for(const p of produtos){
    if(visiveis.length>=COMMERCE_MAX_PRODUTOS)throw Error('limite-produtos-excedido');
    if(!p||!p.nome)continue;
    const id=texto(p.id,128);
    if(!id||id.includes('/'))continue;
    const x=ajustes[id]&&typeof ajustes[id]==='object'?ajustes[id]:{};
    const estoque=Math.max(0,Math.trunc(numero(p.estoque)));
    if(!(x.ativo!==undefined?x.ativo!==false:estoque>0))continue;
    const preco=Math.max(0,numero(p.precoBRL??p.preco??p.precoVenda??p.precoUnitario));
    const fotos=Array.isArray(x.imagensLoja)&&x.imagensLoja.length
      ?x.imagensLoja.slice(0,5).map(imagem).filter(Boolean)
      :[imagem(x.imagemLoja||p.imagem||p.fotoUrl)].filter(Boolean);
    // Não exportar custo, fornecedor, clientes, vendas, finanças nem metadados internos.
    visiveis.push({id,nome:texto(p.nome,200),grupo:texto(p.grupo||p.categoria||'Geral',80),
      precoBRL:preco,estoque,descricao:texto(p.descricao||p.detalhes,1200),fotoUrl:fotos[0]||''});
    personalizacoes[id]={ativo:x.ativo!==false,nomeLoja:texto(x.nomeLoja,200),
      descricaoLoja:texto(x.descricaoLoja,1200),
      precoPromoBRL:numero(x.precoPromoBRL)>0?numero(x.precoPromoBRL):'',
      tagPromo:texto(x.tagPromo,40),destaque:Boolean(x.destaque),
      imagemLoja:fotos[0]||'',imagensLoja:fotos};
  }
  return {versao:1,lojaId:uid,publicadoEm:texto(publicadoEm,40),config:{
    habilitado:c.habilitado!==false,slug:texto(c.slug,40),nomeLoja:texto(c.nomeLoja,200),
    slogan:texto(c.slogan,300),descricao:texto(c.descricao,1200),
    whatsapp:texto(c.whatsapp,40),mensagemPadrao:texto(c.mensagemPadrao,500),
    logoUrl:imagem(c.logoUrl),bannerUrl:imagem(c.bannerUrl),
    corTema:/^#[0-9a-fA-F]{6}$/.test(c.corTema||'')?c.corTema:'#0284c7',
    aceitaRetirada:c.aceitaRetirada!==false,enderecoRetirada:texto(c.enderecoRetirada,300),
    aceitaEntrega:c.aceitaEntrega!==false,taxaEntrega:texto(c.taxaEntrega,120),
    prazoEstimado:texto(c.prazoEstimado,120),horarioFuncionamento:texto(c.horarioFuncionamento,300),
    avisoTopo:texto(c.avisoTopo,300),mostrarPreco:c.mostrarPreco!==false,
    chavePix:texto(c.chavePix,160),descontoGeralPorcentagem:desconto,
    produtosLoja:personalizacoes},produtos:c.habilitado===false?[]:visiveis};
}
/* Pedidos só serão aceitos após validação de preço e estoque OFICIAIS no servidor. */
export function conferirCarrinhoContraSnapshot(snapshot,itens){
  if(!snapshot||snapshot.versao!==1||snapshot.config?.habilitado===false)throw Error('loja-inativa');
  if(!Array.isArray(itens)||!itens.length||itens.length>30)throw Error('quantidade-itens-invalida');
  const catalogo=new Map(snapshot.produtos.map(p=>[String(p.id),p]));
  const ids=new Set(),resumo=[];let totalCentavos=0;
  for(const item of itens){
    const id=String(item?.id??item?.skuPublico??'');
    if(!id||ids.has(id))throw Error('item-duplicado-ou-invalido');
    ids.add(id);
    const p=catalogo.get(id);
    if(!p)throw Error('produto-nao-publicado');
    const q=Number(item.quantidade);
    if(!Number.isInteger(q)||q<1||q>99||q>p.estoque)throw Error('estoque-ou-quantidade-invalida');
    const x=snapshot.config.produtosLoja?.[id]||{};
    if(x.ativo===false)throw Error('produto-inativo');
    const normal=numero(p.precoBRL),promocional=numero(x.precoPromoBRL);
    const desconto=numero(snapshot.config.descontoGeralPorcentagem);
    const preco=promocional>0&&promocional<normal?promocional
      :desconto>0?Math.round(normal*(1-desconto/100)*100)/100:normal;
    const centavos=Math.round(preco*100);
    if(!Number.isSafeInteger(centavos)||centavos<=0)throw Error('preco-invalido');
    totalCentavos+=centavos*q;
    if(!Number.isSafeInteger(totalCentavos))throw Error('total-invalido');
    resumo.push({id,quantidade:q,precoUnitarioCentavos:centavos,subtotalCentavos:centavos*q});
  }
  return {itens:resumo,totalCentavos};
}

/**
 * Publicação atômica do catálogo: os lotes imutáveis são enviados antes do
 * manifesto. Um visitante recebe a versão antiga até o novo manifesto existir.
 * Nenhuma leitura Firestore é necessária para abrir ou paginar o catálogo.
 */
export function dividirCatalogoPublico(snapshot,publicacaoId,{tamanhoPagina=COMMERCE_TAMANHO_PAGINA}={}){
  if(!snapshot||snapshot.versao!==1||!Array.isArray(snapshot.produtos))throw Error('catalogo-invalido');
  if(!/^[a-z0-9-]{8,48}$/.test(String(publicacaoId)))throw Error('versao-publicacao-invalida');
  if(!Number.isInteger(tamanhoPagina)||tamanhoPagina<1||tamanhoPagina>100)throw Error('pagina-invalida');
  const {produtos,config}=snapshot;
  const paginaTotal=Math.max(1,Math.ceil(produtos.length/tamanhoPagina));
  const paginas=[];
  for(let i=0;i<paginaTotal;i++){
    const lote=produtos.slice(i*tamanhoPagina,(i+1)*tamanhoPagina);
    const personalizacoes=Object.fromEntries(lote.map(p=>[p.id,config.produtosLoja?.[p.id]||{}]));
    paginas.push({versao:2,lojaId:snapshot.lojaId,slug:config.slug,publicacaoId,pagina:i+1,
      produtos:lote,produtosLoja:personalizacoes});
  }
  return {
    manifesto:{versao:2,lojaId:snapshot.lojaId,publicadoEm:snapshot.publicadoEm,
      publicacaoId,totalProdutos:produtos.length,totalPaginas:paginaTotal,
      config:{...config,produtosLoja:{}}},
    paginas
  };
}
