import { criarSnapshotCommercePublico, conferirCarrinhoContraSnapshot } from '../../src/core/commercePublicCatalog.js';
import { normalizarApelidoPublico } from '../../src/core/commerceCdnClient.js';
import { verifyOwnerFirebaseIdToken, getOfficialDocument, migrarFotosPublicas, putPublicBlob } from './_lib/commerceGoogle.js';

export async function publicarCatalogoCore(uid,{authToken,load=getOfficialDocument,migrate=migrarFotosPublicas,put=putPublicBlob,at=()=>new Date().toISOString()}={}){
  if(!uid||typeof uid!=='string'||uid.length>128||uid.includes('/'))throw Error('identidade-invalida');
  // Somente três leituras pontuais; nenhuma busca de coleções, onSnapshot ou listener.
  const [settings,shop]=await Promise.all([
    load(['lojas',uid,'dados','configuracoes'],{token:authToken}),
    load(['lojas',uid],{token:authToken}),
  ]);
  if(!settings?.commerceConfig||!shop||!Array.isArray(shop.produtos))throw Error('loja-sem-configuracoes');
  const slug=normalizarApelidoPublico(settings.commerceConfig.slug);
  if(slug==='previa')throw Error('apelido-reservado');
  const owner=await load(['lojas_slugs',slug],{token:authToken});
  if(owner?.lojaId!==uid)throw Error('apelido-nao-confirmado');
  const snapshot=criarSnapshotCommercePublico({lojaId:uid,config:settings.commerceConfig,
    produtos:shop.produtos,publicadoEm:at()});
  await migrate(snapshot);
  const json=JSON.stringify(snapshot);
  if(Buffer.byteLength(json)>1_800_000)throw Error('catalogo-grande-demais');
  const url=await put('commerce/catalogos/'+slug+'.json',json,
    {contentType:'application/json',maxAge:60});
  return {slug,url,quantidadeProdutos:snapshot.produtos.length,publicadoEm:snapshot.publicadoEm};
}
export function createPublishHandler({verify=verifyOwnerFirebaseIdToken,publish=publicarCatalogoCore}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({erro:'metodo-nao-permitido'});}
    // Nunca roda acidentalmente em produção, mesmo com segredo configurado.
    if(process.env.VERCEL_ENV!=='preview'||process.env.ZENOS_COMMERCE_PUBLISH_ENABLED!=='true')
      return res.status(503).json({erro:'homologacao-desativada'});
    const bearer=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers?.authorization||'');
    if(!bearer)return res.status(401).json({erro:'login-necessario'});
    if(req.headers?.['content-length']&&Number(req.headers['content-length'])>1024)
      return res.status(413).json({erro:'requisicao-grande-demais'});
    try{
      const owner=await verify(bearer[1]);
      // O mesmo ID token autenticado governa as regras reais de leitura do Firestore.
      // Não exige credencial de serviço e só lê na publicação solicitada pelo proprietário.
      const result=await publish(owner.uid,{authToken:bearer[1]});
      return res.status(200).json({status:'publicado',...result});
    }catch(error){
      const message=String(error?.message||'erro');
      if(['login-invalido','identidade-invalida'].includes(message))return res.status(401).json({erro:'login-invalido'});
      if(['apelido-nao-confirmado','apelido-reservado','apelido-invalido'].includes(message))
        return res.status(409).json({erro:'link-nao-confirmado'});
      if(['limite-fotos-publicas','catalogo-grande-demais','blob-grande-demais'].includes(message))
        return res.status(422).json({erro:'fotos-ou-catalogo-excedem-limite'});
      console.error('[Commerce CDN] Falha na publicacao:',message);
      return res.status(503).json({erro:'publicacao-indisponivel'});
    }
  };
}
export default createPublishHandler();