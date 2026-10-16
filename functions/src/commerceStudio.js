import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { validarRascunhoCommerce, resumoLicencaCommerce, validarRevisao, construirInteresseCommerce, configInicialCommerce } from './commerceStudioCore.js';
import {obterBucketCommerce,assinarMidiaPrivada,confirmarMidiaPrivada} from './commerceMedia.js';

const codigoErro=e=>String(e?.message||'').slice(0,160);
const obterReferenciasMidia = regras => Object.entries(regras||{}).flatMap(([produtoId,regra]) => [
 ...(regra?.fotoCadastroStoragePath?[{produtoId,path:regra.fotoCadastroStoragePath,origem:'cadastro'}]:[]),
 ...(regra?.galeriaImagens||[]).filter(img=>img.storagePath).map(img=>({produtoId,path:img.storagePath,origem:'galeria'}))
]);
async function validarReferenciasNoStorage(regras,lojaId) {
 const refs=obterReferenciasMidia(regras);
 if(!refs.length)return;
 const bucket=obterBucketCommerce();
 // Lotes pequenos preservam os limites de memoria e concorrencia do provedor.
 for(let i=0;i<refs.length;i+=8){await Promise.all(refs.slice(i,i+8).map(ref=>confirmarMidiaPrivada(bucket,ref.path,{lojaId,...ref})));}
}
async function hidratarUrlsPrivadas(regras,lojaId) {
 const refs=obterReferenciasMidia(regras);
 if(!refs.length)return regras;
 const bucket=obterBucketCommerce();
 const resultado=Object.fromEntries(Object.entries(regras).map(([id,r])=>[id,{...r,galeriaImagens:(r.galeriaImagens||[]).map(img=>({...img}))}]));
 for(let i=0;i<refs.length;i+=8){
  await Promise.all(refs.slice(i,i+8).map(async ref=>{
   const confirmado=await confirmarMidiaPrivada(bucket,ref.path,{lojaId,...ref});
   const [url,miniaturaUrl]=await Promise.all([assinarMidiaPrivada(bucket,confirmado.path),assinarMidiaPrivada(bucket,confirmado.thumbPath)]);
   if(ref.origem==='cadastro')resultado[ref.produtoId].fotoCadastroPreviewUrl=url;
   else {const img=resultado[ref.produtoId].galeriaImagens.find(f=>f.storagePath===ref.path);if(img){img.url=url;img.miniaturaUrl=miniaturaUrl;}}
  }));
 }
 return resultado;
}
/**
 * Somente a identidade proprietária autenticada (auth.uid) acessa o próprio rascunho.
 * NÃO aceita lojaId do navegador, NÃO publica nada e NÃO concede licença.
 * Importante: login do estabelecimento pode ser compartilhado por operadores; o
 * bloqueio de UI por admin não substitui uma futura autenticação individual de operadores.
 */
export const commerceStudio = onCall({region:'southamerica-east1',timeoutSeconds:30,memory:'256MiB',maxInstances:2},async request=>{
 if(!request.auth?.uid)throw new HttpsError('unauthenticated','Faça login no ZenOS.');
 if(request.data?.lojaId!==undefined)throw new HttpsError('invalid-argument','A identidade da loja não pode ser fornecida pelo navegador.');
 const action=request.data?.action;
 if(!['consultar','salvarRascunho','solicitarProposta'].includes(action))throw new HttpsError('invalid-argument','Ação inválida.');
 const lojaId=request.auth.uid;
 const db=await obterAdminFirestore();
 const loja=db.doc(`lojas/${lojaId}`);
 const rascunho=db.doc(`lojas/${lojaId}/commerce_private/rascunho`);
 const licenca=db.doc(`lojas/${lojaId}/commerce_private/licenca`);
 const interesse=db.doc(`lojas/${lojaId}/commerce_private/interesse`);
 const lojaSnap=await loja.get();
 if(!lojaSnap.exists)throw new HttpsError('permission-denied','Loja não autorizada.');
 if(action==='consultar'){
  const [d,l,p]=await Promise.all([rascunho.get(),licenca.get(),interesse.get()]);
  return {revision:d.data()?.revision||0,aparencia:d.data()?.aparencia||configInicialCommerce,
   regras:await hidratarUrlsPrivadas(d.data()?.regras||{},lojaId),licenca:resumoLicencaCommerce(l.data()),interesse:p.data()?.status||'nao_solicitado',
   // Link ainda não disponível: endereço depende de domínio e diretório publicados pelo servidor.
   idPublico:null,publicacaoHabilitada:false,
   midiaDisponivel:process.env.ZENOS_COMMERCE_MEDIA_ENABLED==='true'&&Boolean(process.env.ZENOS_COMMERCE_STORAGE_BUCKET)};
 }
 if(action==='solicitarProposta'){
  const perfil=await db.doc(`lojas/${lojaId}/dados/configuracoes`).get();
  const pais=perfil.data()?.perfilLoja?.pais;
  if(!['BR','PY'].includes(pais))throw new HttpsError('failed-precondition','Configure o país da empresa no ZenOS.');
  if(request.data?.confirmacaoContato!==true)throw new HttpsError('invalid-argument','Confirme a solicitação de proposta comercial.');
  return db.runTransaction(async tx=>{
   const [docInteresse,docLicenca]=await Promise.all([tx.get(interesse),tx.get(licenca)]);
   const autorizacao=resumoLicencaCommerce(docLicenca.data());
   if(autorizacao.ativo)return {status:'ativo',semCobranca:true};
   const {documento,jaSolicitado}=construirInteresseCommerce(docInteresse.data(),lojaId,pais,new Date().toISOString());
   if(!jaSolicitado)tx.set(interesse,documento);
   return {status:'solicitado',jaSolicitado,semCobranca:true,nenhumaAtivacao:true};
  });
 }
 let normalizado;
 try{normalizado=validarRascunhoCommerce(request.data?.rascunho,lojaId);}
 catch(e){throw new HttpsError('invalid-argument',codigoErro(e));}
 try{await validarReferenciasNoStorage(normalizado.regras,lojaId);}
 catch(e){if(e instanceof HttpsError)throw e;throw new HttpsError('failed-precondition','Imagens da galeria não foram confirmadas no armazenamento desta loja.');}
 const expectedRevision=request.data?.expectedRevision;
 return db.runTransaction(async tx=>{
  const snap=await tx.get(rascunho);
  const revision=snap.data()?.revision||0;
  if(!validarRevisao(expectedRevision,revision))throw new HttpsError('aborted','Rascunho modificado em outro dispositivo. Atualize antes de salvar.');
  const next=revision+1;
  tx.set(rascunho,{...normalizado,revision:next,status:'rascunho_privado',atualizadoEm:new Date().toISOString(),alteradoPor:lojaId});
  return {revision:next,status:'rascunho_privado',publicado:false};
 });
});
