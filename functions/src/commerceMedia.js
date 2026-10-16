/** Upload privado, por callable autenticado, de fotos WebP otimizadas.
 * Nao disponibiliza Storage Rules permissivas; nao torna loja ou imagens publicas.
 * Requer ZENOS_COMMERCE_STORAGE_BUCKET configurado deliberadamente no ambiente.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { prepararMidiaCommerce, produtoPertenceLoja } from './commerceMediaServiceCore.js';

const BUCKET = /^[a-z0-9][a-z0-9.-]{2,180}$/;
const EXPIRACAO_MS = 30*60_000;
export function obterBucketCommerce(){
  if(process.env.ZENOS_COMMERCE_MEDIA_ENABLED!=='true')throw new HttpsError('failed-precondition','Upload do Commerce ainda não foi autorizado neste ambiente.');
  const nome=process.env.ZENOS_COMMERCE_STORAGE_BUCKET;
  if(!nome||!BUCKET.test(nome))throw new HttpsError('failed-precondition','Armazenamento Commerce não configurado. Nenhuma imagem foi enviada.');
  const app=getApps()[0];if(!app)throw new HttpsError('unavailable','Firebase Admin não inicializado.');
  return getStorage(app).bucket(nome);
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
  if(!caminhoCommerceValido(path,lojaId,produtoId,{origem}))throw new HttpsError('permission-denied','Imagem de outra loja ou produto.');
  const thumbPath=derivarMiniaturaPath(path,lojaId,produtoId,origem);
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
  if(request.data?.action!=='enviarFotoProduto')throw new HttpsError('invalid-argument','Ação de mídia inválida.');
  const lojaId=request.auth.uid,produtoId=request.data?.produtoId;
  // Qualquer erro de formato é tratado antes de acessar Storage.
  let plano;
  try{plano=prepararMidiaCommerce({lojaId,produtoId,origem:request.data?.origem||'galeria',
    principalBase64:request.data?.principalBase64,miniaturaBase64:request.data?.miniaturaBase64});}
  catch(e){throw new HttpsError('invalid-argument',String(e.message||'Imagem inválida.').slice(0,150));}
  const db=await obterAdminFirestore();
  const [loja,operacao]=await Promise.all([db.doc(`lojas/${lojaId}`).get(),db.doc(`lojas/${lojaId}/dados/operacao`).get()]);
  if(!loja.exists||!produtoPertenceLoja(operacao.data(),produtoId))throw new HttpsError('permission-denied','Produto não encontrado no cadastro desta loja.');
  const bucket=obterBucketCommerce();
  try {
    await gravarSeNovo(bucket,plano.path,plano.principal,{lojaId,produtoId,hash:plano.hash});
    await gravarSeNovo(bucket,plano.thumbPath,plano.miniatura,{lojaId,produtoId,hash:plano.hash});
    const [url,miniaturaUrl]=await Promise.all([assinarMidiaPrivada(bucket,plano.path),assinarMidiaPrivada(bucket,plano.thumbPath)]);
    return {id:plano.id,url,miniaturaUrl,storagePath:plano.path,status:'privado',publicado:false,expiraEm:new Date(Date.now()+EXPIRACAO_MS).toISOString()};
  }catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('unavailable','Não foi possível armazenar a imagem com segurança. Tente novamente.');}
});
