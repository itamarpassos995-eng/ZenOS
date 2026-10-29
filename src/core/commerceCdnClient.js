/**
 * Transporte público da vitrine: não importa Firebase, Auth ou Firestore.
 * O endpoint /api/commerce/catalogo permanece inativo até homologação do servidor.
 */
import {COMMERCE_MAX_PRODUTOS,COMMERCE_TAMANHO_PAGINA} from './commercePublicCatalog.js';

export function normalizarApelidoPublico(value) {
  const s=String(value||'').trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(s) || s.includes('--')) {
    throw new Error('apelido-invalido');
  }
  return s;
}

export function validarSnapshotPublico(data,apelido) {
  if(!data||typeof data!=='object'||Array.isArray(data)||![1,2].includes(data.versao))throw new Error('catalogo-invalido');
  if(typeof data.lojaId!=='string'||!data.lojaId||data.lojaId.length>128)throw new Error('catalogo-sem-loja');
  if(!data.config||typeof data.config!=='object'||Array.isArray(data.config))throw new Error('catalogo-sem-configuracoes');
  if(data.versao===1 && (!Array.isArray(data.produtos)||data.produtos.length>COMMERCE_MAX_PRODUTOS))
    throw new Error('catalogo-invalido');
  if(data.versao===2 && (
    !/^[a-z0-9-]{8,48}$/.test(String(data.publicacaoId||''))||
    !Number.isInteger(data.totalProdutos)||data.totalProdutos<0||
    data.totalProdutos>COMMERCE_MAX_PRODUTOS||
    !Number.isInteger(data.totalPaginas)||
    data.totalPaginas!==Math.max(1,Math.ceil(data.totalProdutos/COMMERCE_TAMANHO_PAGINA))
  ))throw new Error('catalogo-invalido');
  if(data.config.habilitado===false)throw new Error('loja-indisponivel');
  if(data.config.slug && data.config.slug!==apelido)throw new Error('apelido-nao-corresponde');
  const ids=new Set();
  for(const produto of data.versao===1 ? data.produtos : []) {
    if(!produto||typeof produto!=='object'||!produto.id||!produto.nome)throw new Error('produto-invalido');
    const id=String(produto.id);
    if(ids.has(id)||id.length>128)throw new Error('produto-duplicado');
    ids.add(id);
    if(!Number.isFinite(Number(produto.precoBRL))||Number(produto.precoBRL)<0)throw new Error('preco-invalido');
  }
  return {
    idPublico:data.lojaId,
    // Contrato de componentes permanece o mesmo; nenhum layout é recriado.
    configCommerce:data.config,
    produtos:data.versao===1?data.produtos:[],
    publicadoEm:data.publicadoEm||null,
    versao:data.versao,
    publicacaoId:data.versao===2?data.publicacaoId:null,
    totalProdutos:data.versao===2?data.totalProdutos:data.produtos.length,
    totalPaginas:data.versao===2?data.totalPaginas:1
  };
}

export async function carregarCatalogoPublico(apelido, {fetchImpl=fetch, signal,endpoint='/api/commerce/catalogo'}={}) {
  const slug=normalizarApelidoPublico(apelido);
  const url=endpoint+(endpoint.includes('?')?'&':'?')+'slug='+encodeURIComponent(slug);
  const res=await fetchImpl(url,{method:'GET',credentials:'omit',redirect:'follow',cache:'default',
    headers:{'Accept':'application/json'},signal});
  if(!res.ok) {
    if(res.status===404)throw new Error('loja-nao-publicada');
    if(res.status===503)throw new Error('catalogo-indisponivel');
    throw new Error('falha-catalogo');
  }
  const declared=Number(res.headers?.get?.('content-length')||0);
  if(declared>2_000_000)throw new Error('catalogo-grande-demais');
  const body=await res.text();
  if(body.length>2_000_000)throw new Error('catalogo-grande-demais');
  let data;
  try{data=JSON.parse(body);}catch{throw new Error('catalogo-invalido');}
  const result=validarSnapshotPublico(data,slug);
  if(result.versao===1)return result;
  // Catálogos extensos: baixa lotes da CDN em grupos de quatro. Não existe
  // fallback para Firebase ou leitura de estoque por visitante.
  const seen=new Set();
  const todos=[];
  const custom={};
  for(let start=1;start<=result.totalPaginas;start+=4){
    const pages=Array.from({length:Math.min(4,result.totalPaginas-start+1)},
      (_,index)=>start+index);
    const lotes=await Promise.all(pages.map(async pagina=>{
      const sep=endpoint.includes('?')?'&':'?';
      const query=sep+'slug='+encodeURIComponent(slug)+'&pagina='+pagina+
        '&versao='+encodeURIComponent(result.publicacaoId);
      const pageResponse=await fetchImpl(endpoint+query,{
        method:'GET',credentials:'omit',cache:'default',signal,
        headers:{Accept:'application/json'}});
      if(!pageResponse.ok)throw Error('lote-indisponivel');
      const length=Number(pageResponse.headers?.get?.('content-length')||0);
      if(length>2_000_000)throw Error('catalogo-grande-demais');
      const raw=await pageResponse.text();
      if(raw.length>2_000_000)throw Error('catalogo-grande-demais');
      let page;
      try{page=JSON.parse(raw);}catch{throw Error('lote-invalido');}
      if(page.versao!==2||page.slug!==slug||page.publicacaoId!==result.publicacaoId||
        page.lojaId!==result.idPublico||page.pagina!==pagina||
        !Array.isArray(page.produtos)||page.produtos.length>COMMERCE_TAMANHO_PAGINA||
        !page.produtosLoja||typeof page.produtosLoja!=='object')
        throw Error('lote-invalido');
      return page;
    }));
    for(const lote of lotes){
      for(const p of lote.produtos){
        if(!p||!p.id||!p.nome||seen.has(String(p.id)))throw Error('lote-invalido');
        seen.add(String(p.id));todos.push(p);
      }
      Object.assign(custom,lote.produtosLoja);
    }
  }
  if(todos.length!==result.totalProdutos)throw Error('catalogo-incompleto');
  return {...result,produtos:todos,
    configCommerce:{...result.configCommerce,produtosLoja:custom}};
}
