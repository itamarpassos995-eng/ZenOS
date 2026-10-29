/**
 * Transporte público da vitrine: não importa Firebase, Auth ou Firestore.
 * O endpoint /api/commerce/catalogo permanece inativo até homologação do servidor.
 */
export function normalizarApelidoPublico(value) {
  const s=String(value||'').trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(s) || s.includes('--')) {
    throw new Error('apelido-invalido');
  }
  return s;
}

export function validarSnapshotPublico(data,apelido) {
  if(!data||typeof data!=='object'||Array.isArray(data)||data.versao!==1)throw new Error('catalogo-invalido');
  if(typeof data.lojaId!=='string'||!data.lojaId||data.lojaId.length>128)throw new Error('catalogo-sem-loja');
  if(!data.config||typeof data.config!=='object'||Array.isArray(data.config))throw new Error('catalogo-sem-configuracoes');
  if(!Array.isArray(data.produtos)||data.produtos.length>48)throw new Error('catalogo-invalido');
  if(data.config.habilitado===false)throw new Error('loja-indisponivel');
  if(data.config.slug && data.config.slug!==apelido)throw new Error('apelido-nao-corresponde');
  const ids=new Set();
  for(const produto of data.produtos) {
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
    produtos:data.produtos,
    publicadoEm:data.publicadoEm||null
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
  return validarSnapshotPublico(data,slug);
}
