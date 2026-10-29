import { criarSnapshotCommercePublico, dividirCatalogoPublico, COMMERCE_MAX_PRODUTOS } from '../../src/core/commercePublicCatalog.js';
import { randomBytes } from 'node:crypto';
import { normalizarApelidoPublico } from '../../src/core/commerceCdnClient.js';
import { verifyOwnerFirebaseIdToken, getOfficialDocument, migrarFotosPublicas, putPublicBlob } from './_lib/commerceGoogle.js';

export async function publicarCatalogoCore(uid,{authToken,produtosPublicos,load=getOfficialDocument,migrate=migrarFotosPublicas,put=putPublicBlob,at=()=>new Date().toISOString()}={}){
  if(!uid||typeof uid!=='string'||uid.length>128||uid.includes('/'))throw Error('identidade-invalida');
  // Os produtos já estão disponíveis no painel operacional do lojista (inclusive V2).
  // Receber SOMENTE seus campos públicos evita baixar coleções ou reconstruir a V2.
  // O dono já pode editar seu catálogo no ZenOS; o servidor valida autoria e publica
  // apenas os campos explicitamente permitidos pelo contrato da vitrine.
  if(!Array.isArray(produtosPublicos)||produtosPublicos.length<1||produtosPublicos.length>COMMERCE_MAX_PRODUTOS)
    throw Error('produtos-publicos-invalidos');
  const settings=await load(['lojas',uid,'dados','configuracoes'],{token:authToken});
  if(!settings?.commerceConfig)throw Error('loja-sem-configuracoes');
  const slug=normalizarApelidoPublico(settings.commerceConfig.slug);
  if(slug==='previa')throw Error('apelido-reservado');
  const owner=await load(['lojas_slugs',slug],{token:authToken});
  if(owner?.lojaId!==uid)throw Error('apelido-nao-confirmado');
  const snapshot=criarSnapshotCommercePublico({lojaId:uid,config:settings.commerceConfig,
    produtos:produtosPublicos,publicadoEm:at()});
  if(snapshot.config.habilitado!==false&&snapshot.produtos.length===0)
    throw Error('catalogo-sem-produtos');
  await migrate(snapshot);
  const publicacaoId=Date.now().toString(36)+'-'+randomBytes(6).toString('hex');
  const {manifesto,paginas}=dividirCatalogoPublico(snapshot,publicacaoId);
  // Versão imutável primeiro; manifesto (ponteiro da loja) por último.
  // Se um lote falhar, a versão antiga da loja continua visível.
  for(let i=0;i<paginas.length;i+=4){
    await Promise.all(paginas.slice(i,i+4).map(async pagina=>{
      const path='commerce/catalogos/'+slug+'/versoes/'+publicacaoId+'/pagina-'+pagina.pagina+'.json';
      const body=JSON.stringify(pagina);
      if(Buffer.byteLength(body)>1_800_000)throw Error('catalogo-grande-demais');
      await put(path,body,{contentType:'application/json',maxAge:31536000});
    }));
  }
  const json=JSON.stringify(manifesto);
  if(Buffer.byteLength(json)>1_800_000)throw Error('catalogo-grande-demais');
  const url=await put('commerce/catalogos/'+slug+'.json',json,
    {contentType:'application/json',maxAge:60});
  return {slug,url,quantidadeProdutos:snapshot.produtos.length,
    totalPaginas:paginas.length,publicadoEm:snapshot.publicadoEm};
}
export function createPublishHandler({verify=verifyOwnerFirebaseIdToken,publish=publicarCatalogoCore}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({erro:'metodo-nao-permitido'});}
    // Publicação explicitamente habilitada pelo ambiente, autenticada por loja.
    // Não há execução por visita; apenas clique do proprietário no painel.
    if(!['preview','production'].includes(process.env.VERCEL_ENV)||
       process.env.ZENOS_COMMERCE_PUBLISH_ENABLED!=='true')
      return res.status(503).json({erro:'homologacao-desativada'});
    const bearer=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers?.authorization||'');
    if(!bearer)return res.status(401).json({erro:'login-necessario'});
    if(Number(req.headers?.['content-length']||0)>3_000_000||
       JSON.stringify(req.body||{}).length>3_000_000)
      return res.status(413).json({erro:'requisicao-grande-demais'});
    if(!req.body||!Array.isArray(req.body.produtos)||req.body.produtos.length>COMMERCE_MAX_PRODUTOS)
      return res.status(400).json({erro:'catalogo-invalido'});
    try{
      const owner=await verify(bearer[1]);
      // O mesmo ID token autenticado governa as regras reais de leitura do Firestore.
      // Não exige credencial de serviço e só lê na publicação solicitada pelo proprietário.
      const result=await publish(owner.uid,{authToken:bearer[1],produtosPublicos:req.body.produtos});
      return res.status(200).json({status:'publicado',...result});
    }catch(error){
      const message=String(error?.message||'erro');
      if(['login-invalido','identidade-invalida'].includes(message))return res.status(401).json({erro:'login-invalido'});
      if(['apelido-nao-confirmado','apelido-reservado','apelido-invalido'].includes(message))
        return res.status(409).json({erro:'link-nao-confirmado'});
      if(['limite-fotos-publicas','catalogo-grande-demais','blob-grande-demais','catalogo-sem-produtos','produtos-publicos-invalidos'].includes(message))
        return res.status(422).json({erro:'fotos-ou-catalogo-excedem-limite'});
      console.error('[Commerce CDN] Falha na publicacao:',message);
      return res.status(503).json({erro:'publicacao-indisponivel'});
    }
  };
}
export default createPublishHandler();