import { normalizarApelidoPublico, validarSnapshotPublico } from '../../src/core/commerceCdnClient.js';

// GET público. Apenas Blob CDN: nenhuma chamada Firebase, Auth ou Firestore.
// A origem é configurada exclusivamente pelo servidor, nunca pela URL recebida.
export default async function handler(req,res) {
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({erro:'metodo-nao-permitido'});
  }
  let slug;
  try{slug=normalizarApelidoPublico(req.query?.slug);}
  catch{return res.status(400).json({erro:'link-invalido'});}
  const configured=process.env.ZENOS_COMMERCE_CDN_ORIGIN;
  if(!configured)return res.status(503).json({erro:'catalogo-em-homologacao'});
  let origin;
  try{
    origin=new URL(configured);
    if(origin.protocol!=='https:'||
      !origin.hostname.endsWith('.public.blob.vercel-storage.com')||
      origin.username||origin.password||origin.port||
      origin.pathname!=='/'||origin.search||origin.hash)
      throw new Error('origem-invalida');
  }catch{
    return res.status(503).json({erro:'catalogo-indisponivel'});
  }
  try{
    const url=new URL('/commerce/catalogos/'+encodeURIComponent(slug)+'.json',origin);
    const upstream=await fetch(url,{method:'GET',redirect:'error',
      headers:{'Accept':'application/json'},signal:AbortSignal.timeout(5000)});
    if(upstream.status===404)return res.status(404).json({erro:'loja-nao-publicada'});
    if(!upstream.ok)return res.status(503).json({erro:'catalogo-indisponivel'});
    const declared=Number(upstream.headers.get('content-length')||0);
    if(declared>2_000_000)return res.status(502).json({erro:'catalogo-grande-demais'});
    // Leitura limitada para evitar arquivos inesperados no bucket público.
    let total=0;const chunks=[];const reader=upstream.body?.getReader();
    if(!reader)return res.status(503).json({erro:'catalogo-indisponivel'});
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>2_000_000){await reader.cancel();return res.status(502).json({erro:'catalogo-grande-demais'});}
      chunks.push(value);
    }
    const raw=Buffer.concat(chunks.map(v=>Buffer.from(v))).toString('utf8');
    const data=JSON.parse(raw);
    validarSnapshotPublico(data,slug);
    res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
    res.setHeader('X-Content-Type-Options','nosniff');
    return res.status(200).json(data);
  }catch{
    return res.status(503).json({erro:'catalogo-indisponivel'});
  }
}
