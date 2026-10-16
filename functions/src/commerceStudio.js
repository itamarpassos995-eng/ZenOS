import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { validarRascunhoCommerce, resumoLicencaCommerce, validarRevisao, construirInteresseCommerce, configInicialCommerce } from './commerceStudioCore.js';

const codigoErro=e=>String(e?.message||'').slice(0,160);
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
   regras:d.data()?.regras||{},licenca:resumoLicencaCommerce(l.data()),interesse:p.data()?.status||'nao_solicitado',
   // Link ainda não disponível: endereço depende de domínio e diretório publicados pelo servidor.
   idPublico:null,publicacaoHabilitada:false};
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
