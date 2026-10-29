import { normalizarApelidoPublico, validarSnapshotPublico } from '../../src/core/commerceCdnClient.js';

// API exclusivamente CDN: nenhuma importação Firebase, Auth ou Firestore.
// O manifesto público escolhe a versão ativa; páginas são imutáveis.
async function lerBlob(url) {
  const upstream=await fetch(url,{method:'GET',redirect:'error',
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
  if(upstream.status===404)return null;
  if(!upstream.ok)throw Error('blob-indisponivel');
  const declared=Number(upstream.headers.get('content-length')||0);
  if(declared>2_000_000)throw Error('catalogo-grande-demais');
  let total=0;const parts=[];const reader=upstream.body?.getReader();
  if(!reader)throw Error('blob-indisponivel');
  for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>2_000_000){await reader.cancel();throw Error('catalogo-grande-demais');}
    parts.push(value);
  }
  return JSON.parse(Buffer.concat(parts.map(x=>Buffer.from(x))).toString('utf8'));
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({erro:'metodo-nao-permitido'});
  }
  let slug;
  try{slug=normalizarApelidoPublico(req.query?.slug);}
  catch{return res.status(400).json({erro:'link-invalido'});}
  const configured=process.env.ZENOS_COMMERCE_CDN_ORIGIN;
  if(!configured)return res.status(503).json({erro:'catalogo-indisponivel'});
  let origin;
  try{
    origin=new URL(configured);
    if(origin.protocol!=='https:'||
      !origin.hostname.endsWith('.public.blob.vercel-storage.com')||
      origin.username||origin.password||origin.port||
      origin.pathname!=='/'||origin.search||origin.hash)throw Error('origem-invalida');
  }catch{return res.status(503).json({erro:'catalogo-indisponivel'});}
  try{
    const manifesto=await lerBlob(new URL('/commerce/catalogos/'+slug+'.json',origin));
    if(!manifesto)return res.status(404).json({erro:'loja-nao-publicada'});
    validarSnapshotPublico(manifesto,slug);
    const wantsPage=req.query?.pagina!==undefined||req.query?.versao!==undefined;
    let data=manifesto;
    if(wantsPage){
      const numero=Number(req.query?.pagina);
      const version=req.query?.versao;
      if(manifesto.versao!==2||!Number.isInteger(numero)||numero<1||
        numero>manifesto.totalPaginas||!Number.isSafeInteger(numero)||
        typeof version!=='string'||version!==manifesto.publicacaoId)
        return res.status(400).json({erro:'pagina-invalida'});
      data=await lerBlob(new URL('/commerce/catalogos/'+slug+
        '/versoes/'+version+'/pagina-'+numero+'.json',origin));
      if(!data||data.versao!==2||data.lojaId!==manifesto.lojaId||
        data.publicacaoId!==version||data.pagina!==numero||
        !Array.isArray(data.produtos)||data.produtos.length>80||
        !data.produtosLoja||typeof data.produtosLoja!=='object')
        throw Error('lote-invalido');
    }
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-Content-Type-Options','nosniff');
    return res.status(200).json(data);
  }catch{
    return res.status(503).json({erro:'catalogo-indisponivel'});
  }
}
