import {consultarProdutosCommerce} from './commerceOperationalRead.js';
/** Upload privado, por callable autenticado, de fotos WebP otimizadas.
 * Nao disponibiliza Storage Rules permissivas; nao torna loja ou imagens publicas.
 * Requer ZENOS_COMMERCE_STORAGE_BUCKET configurado deliberadamente no ambiente.
 */
import { autorizarOperadorCommerce } from './commerceAuthorization.js';
import {createHash} from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { error as registrarErro } from 'firebase-functions/logger';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { protegerAmbienteMidiaCommerce } from './commerceStorageSafetyCore.js';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { prepararMidiaCommerce, prepararBannerCommerce, caminhoBannerValido, produtoPertenceLoja } from './commerceMediaServiceCore.js';

const EXPIRACAO_MS = 30*60_000;
export function obterBucketCommerce(){
  try {
    protegerAmbienteMidiaCommerce({
      mediaEnabled: process.env.ZENOS_COMMERCE_MEDIA_ENABLED,
      homologacao: process.env.ZENOS_COMMERCE_HOMOLOGACAO,
      projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT,
      bucket: process.env.ZENOS_COMMERCE_STORAGE_BUCKET,
      storageEmulatorHost: process.env.FIREBASE_STORAGE_EMULATOR_HOST,
    });
  } catch (e) {
    throw new HttpsError('failed-precondition', 'Armazenamento Commerce indisponível neste ambiente seguro.');
  }
  const app=getApps()[0];
  if(!app)throw new HttpsError('unavailable','Firebase Admin não inicializado.');
  return getStorage(app).bucket(process.env.ZENOS_COMMERCE_STORAGE_BUCKET);
}

export async function assinarMidiaPrivada(bucket,path){
  const file=bucket.file(path);
  const [exists]=await file.exists();
  if(!exists)throw new HttpsError('failed-precondition','A mídia solicitada não existe no armazenamento da loja.');
  const [link]=await file.getSignedUrl({action:'read',expires:Date.now()+EXPIRACAO_MS});
  return link;
}

export async function confirmarMidiaPrivada(bucket,path,{lojaId,produtoId,origem='galeria'}={}){
  const {caminhoCommerceValido,derivarMiniaturaPath}=await import('./commerceMediaServiceCore.js');
  const banner=origem==='desktop'||origem==='mobile';
  if(!(banner?caminhoBannerValido(path,lojaId,produtoId,origem):caminhoCommerceValido(path,lojaId,produtoId,{origem})))throw new HttpsError('permission-denied','Imagem de outra loja ou produto.');
  const thumbPath=banner?`commerce/${lojaId}/banners/${produtoId}/miniaturas/${path.split('/').at(-1)}`:derivarMiniaturaPath(path,lojaId,produtoId,origem);
  const [full,thumb]=await Promise.all([bucket.file(path).getMetadata(),bucket.file(thumbPath).getMetadata()]);
  if(full?.[0]?.contentType!=='image/webp'||thumb?.[0]?.contentType!=='image/webp'||
    full?.[0]?.metadata?.lojaId!==lojaId||full?.[0]?.metadata?.produtoId!==produtoId||
    thumb?.[0]?.metadata?.lojaId!==lojaId||thumb?.[0]?.metadata?.produtoId!==produtoId)
    throw new HttpsError('permission-denied','Metadados de mídia incompatíveis com a loja.');
  return {path,thumbPath};
}

async function gravarSeNovo(bucket,path,bytes,{lojaId,produtoId,hash}){
  const file=bucket.file(path);
  const [exists]=await file.exists();
  if(exists){
    const [meta]=await file.getMetadata();
    if(meta.contentType!=='image/webp'||meta.metadata?.lojaId!==lojaId||meta.metadata?.produtoId!==produtoId||meta.metadata?.hash!==hash)
      throw new HttpsError('failed-precondition','Arquivo já existente com metadados divergentes.');
    return;
  }
  try{await file.save(bytes,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{
    contentType:'image/webp',cacheControl:'private, no-store',metadata:{lojaId,produtoId,hash,visibilidade:'rascunho_privado'}
  }});}catch(e){
    // A criação pode competir com outra requisição idêntica. Verificar antes de prosseguir.
    const [nowExists]=await file.exists();
    if(!nowExists)throw e;
    const [meta]=await file.getMetadata();
    if(meta.contentType!=='image/webp'||meta.metadata?.hash!==hash||meta.metadata?.lojaId!==lojaId||meta.metadata?.produtoId!==produtoId)throw e;
  }
}

export const commerceMidia = onCall({region:'southamerica-east1',timeoutSeconds:90,memory:'512MiB',maxInstances:2},async request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Faça login no ZenOS.');
  if(request.data?.lojaId!==undefined)throw new HttpsError('invalid-argument','A loja é identificada exclusivamente pela sessão autenticada.');
  if(!['enviarFotoProduto','enviarBanner'].includes(request.data?.action))throw new HttpsError('invalid-argument','Ação de mídia inválida.');
  const db=await obterAdminFirestore();
  const {lojaId}=await autorizarOperadorCommerce(request.auth,db,request.data?.sessaoZenOS);
  const banner=request.data.action==='enviarBanner';
  const produtoId=banner?request.data?.bannerId:request.data?.produtoId;
  // Qualquer erro de formato é tratado antes de acessar Storage.
  let plano;
  try{const bytes={principalBase64:request.data?.principalBase64,miniaturaBase64:request.data?.miniaturaBase64};
    plano=banner?prepararBannerCommerce({lojaId,bannerId:produtoId,tipo:request.data.tipo,...bytes}):prepararMidiaCommerce({lojaId,produtoId,origem:request.data?.origem||'galeria',...bytes});}
  catch(e){throw new HttpsError('invalid-argument',String(e.message||'Imagem inválida.').slice(0,150));}
  const [loja,operacao]=await Promise.all([db.doc(`lojas/${lojaId}`).get(),banner?Promise.resolve([]):consultarProdutosCommerce(db,lojaId,{ids:[String(produtoId)]})]);
  if(!loja.exists||(!banner&&!produtoPertenceLoja({produtos:operacao},produtoId)))throw new HttpsError('permission-denied','Produto não encontrado no cadastro desta loja.');
  const bucket=obterBucketCommerce();
  const dia=new Date().toISOString().slice(0,10),bytes=plano.principal.length+plano.miniatura.length;
  const marca=db.doc(`lojas/${lojaId}/commerce_private/midia-${createHash('sha256').update(plano.path).digest('hex')}`);
  const quota=db.doc(`lojas/${lojaId}/commerce_private/midia-quota-${dia}`);
  await db.runTransaction(async tx=>{
    const [m,q]=await Promise.all([tx.get(marca),tx.get(quota)]);if(m.exists)return;
    const atual=q.data()||{};
    if((atual.bytes||0)+bytes>60_000_000||(atual.arquivos||0)>=256)throw new HttpsError('resource-exhausted','Limite diário de fotos atingido. Tente novamente amanhã.');
    tx.create(marca,{path:plano.path,bytes,dia});tx.set(quota,{bytes:(atual.bytes||0)+bytes,arquivos:(atual.arquivos||0)+1});
  });
  // A reserva de quota permanece se o upload falhar; retry idêntico não consome quota novamente.
  let etapa='armazenamento';
  try {
    await gravarSeNovo(bucket,plano.path,plano.principal,{lojaId,produtoId,hash:plano.hash});
    await gravarSeNovo(bucket,plano.thumbPath,plano.miniatura,{lojaId,produtoId,hash:plano.hash});
    etapa='assinatura';
    const [url,miniaturaUrl]=await Promise.all([assinarMidiaPrivada(bucket,plano.path),assinarMidiaPrivada(bucket,plano.thumbPath)]);
    return {id:plano.id,url,miniaturaUrl,storagePath:plano.path,status:'privado',publicado:false,expiraEm:new Date(Date.now()+EXPIRACAO_MS).toISOString()};
  }catch(e){
    if(e instanceof HttpsError)throw e;
    // Não registrar imagem, token, URL assinada ou dados do cliente.
    const codigo=String(e?.code||'desconhecido').slice(0,60);
    const motivo=/signBlob|iam.serviceAccounts/i.test(String(e?.message||''))?'permissao-assinatura':/permission|denied|forbidden/i.test(String(e?.message||''))?'permissao':/disabled|not been used/i.test(String(e?.message||''))?'api-indisponivel':'verificar-provedor';
    registrarErro('commerceMidia: falha de infraestrutura',{etapa,codigo,motivo});
    throw new HttpsError('unavailable',etapa==='assinatura'?'Não foi possível gerar o link privado da imagem. Verifique as permissões de assinatura da homologação.':'Não foi possível armazenar a imagem no bucket privado. Verifique as permissões da homologação.');
  }
});
