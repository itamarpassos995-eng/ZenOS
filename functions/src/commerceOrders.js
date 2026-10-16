import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {randomBytes} from 'node:crypto';
import {obterAdminFirestore} from './firebaseAdmin.js';
import {autorizarOperadorCommerce} from './commerceAuthorization.js';
import {validarRascunhoCommerce,resumoLicencaCommerce} from './commerceStudioCore.js';
import {ambienteMidiaCommercePronto} from './commerceStorageSafetyCore.js';
import {hidratarUrlsPrivadas,validarReferenciasNoStorage} from './commerceStudio.js';
import {validarCatalogoPublicavel,urlImagemCommerce,publicIdValido,telefoneCommerce,catalogoCommerceServidor,validarPedidoCommerce,chavePedidoCommerce,assinaturaPedidoCommerce,respostaPedidoCommerce} from './commerceOrdersCore.js';
const opts={region:'southamerica-east1',timeoutSeconds:60,memory:'512MiB',maxInstances:2};
const habilitado=()=>{if(!ambienteMidiaCommercePronto(process.env))throw new HttpsError('failed-precondition','Loja online indisponível neste ambiente.');};
const draftRef=(db,loja,id)=>db.doc(`lojas/${loja}/commerce_private/${id}`);
const gerarId=()=>{const letras='abcdefghjkmnpqrstuvwxyz23456789';return 'zc-'+[...randomBytes(14)].map(n=>letras[n%letras.length]).join('');};
const invalid=e=>new HttpsError('invalid-argument',String(e.message||'Dados inválidos.').slice(0,180));
const exigirLicenca=snap=>{if(!resumoLicencaCommerce(snap.data()).ativo)throw new HttpsError('permission-denied','Módulo Commerce não autorizado para esta loja.');};
async function resolverPublicacao(db,id){
 if(!publicIdValido(id))throw new HttpsError('not-found','Loja indisponível.');
 const directory=await db.doc(`commerce_public/${id}`).get();
 if(!directory.exists)throw new HttpsError('not-found','Loja indisponível.');
 const lojaId=directory.data().lojaId;
 const [publication,license,operation]=await Promise.all([draftRef(db,lojaId,'publicacao').get(),draftRef(db,lojaId,'licenca').get(),db.doc(`lojas/${lojaId}/dados/operacao`).get()]);
 exigirLicenca(license);
 if(!publication.exists||publication.data().ativo!==true||publication.data().idPublico!==id)throw new HttpsError('not-found','Loja indisponível.');
 return {lojaId,publication:publication.data(),produtos:operation.data()?.produtos||[]};
}
export const commercePedidosAdmin=onCall(opts,async request=>{
 habilitado();const db=await obterAdminFirestore();const {lojaId,operadorUid}=await autorizarOperadorCommerce(request.auth,db);
 if(request.data?.lojaId!==undefined)throw new HttpsError('invalid-argument','Loja definida pelo servidor.');
 const pubRef=draftRef(db,lojaId,'publicacao'),action=request.data?.action;
 if(action==='consultarLoja'){
  const shop=await db.doc(`lojas/${lojaId}`).get();if(!shop.exists)throw new HttpsError('not-found','Loja de homologação não configurada.');
  const op=await db.doc(`lojas/${lojaId}/dados/operacao`).get();return {lojaId,produtos:op.data()?.produtos||[]};
 }
 if(action==='publicar'){
  const [draft,license,shop]=await Promise.all([draftRef(db,lojaId,'rascunho').get(),draftRef(db,lojaId,'licenca').get(),db.doc(`lojas/${lojaId}`).get()]);
  exigirLicenca(license);if(!shop.exists||!draft.exists)throw new HttpsError('failed-precondition','Salve o rascunho antes de publicar.');
  if(request.data.expectedRevision!==draft.data().revision)throw new HttpsError('aborted','O rascunho mudou. Salve e tente novamente.');
  let limpo,whatsapp;try{limpo=validarRascunhoCommerce(draft.data(),lojaId);whatsapp=telefoneCommerce(request.data.whatsapp);}catch(e){throw invalid(e);}
  await validarReferenciasNoStorage(limpo.regras,lojaId);
  return db.runTransaction(async tx=>{
   const [current,latestDraft,latestLicense,latestOperation]=await Promise.all([tx.get(pubRef),tx.get(draftRef(db,lojaId,'rascunho')),tx.get(draftRef(db,lojaId,'licenca')),tx.get(db.doc(`lojas/${lojaId}/dados/operacao`))]);
   exigirLicenca(latestLicense);if(latestDraft.data()?.revision!==draft.data().revision)throw new HttpsError('aborted','Rascunho alterado durante a publicação.');
   try{validarCatalogoPublicavel(latestOperation.data()?.produtos||[],limpo.regras);}catch(e){throw new HttpsError('failed-precondition',e.message);}
   const idPublico=current.data()?.idPublico||gerarId();const directory=db.doc(`commerce_public/${idPublico}`);const old=await tx.get(directory);
   if(old.exists&&old.data().lojaId!==lojaId)throw new HttpsError('aborted','Identificador indisponível. Tente novamente.');
   const revision=(current.data()?.revision||0)+1;
   tx.set(directory,{lojaId});tx.set(pubRef,{...limpo,idPublico,whatsapp,revision,ativo:true,publicadoEm:new Date().toISOString(),por:operadorUid});
   return {idPublico,revision,ativo:true};
  });
 }
 if(action==='despublicar'){await pubRef.set({ativo:false,alteradoEm:new Date().toISOString(),por:operadorUid},{merge:true});return {ativo:false};}
 if(action==='listarPedidos'){
  const snaps=await db.collection(`lojas/${lojaId}/commerce_pedidos`).orderBy('criadoEm','desc').limit(50).get();
  return {pedidos:snaps.docs.map(d=>({id:d.id,...d.data(),clienteUid:undefined,assinatura:undefined})).map(({clienteUid,assinatura,...d})=>d)};
 }
 if(action==='atualizarStatus'){
  if(!/^[a-f0-9]{32}$/.test(request.data.id||'')||!['em_atendimento','encerrado','cancelado'].includes(request.data.status))throw new HttpsError('invalid-argument','Pedido ou status inválido.');
  const ref=db.doc(`lojas/${lojaId}/commerce_pedidos/${request.data.id}`);
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new HttpsError('not-found','Pedido não encontrado.');
   if(['encerrado','cancelado'].includes(snap.data().status)&&snap.data().status!==request.data.status)throw new HttpsError('failed-precondition','Pedido já encerrado.');
   tx.update(ref,{status:request.data.status,atualizadoEm:new Date().toISOString(),alteradoPor:operadorUid});});return {status:request.data.status};
 }
 throw new HttpsError('invalid-argument','Ação inválida.');
});
export const commerceLoja=onCall(opts,async request=>{
 habilitado();const db=await obterAdminFirestore(),action=request.data?.action,id=request.data?.idPublico;
 if(!['catalogo','criarPedido'].includes(action))throw new HttpsError('invalid-argument','Ação inválida.');
 const {lojaId,publication,produtos}=await resolverPublicacao(db,id);
 if(action==='catalogo'){
  const regras=await hidratarUrlsPrivadas(publication.regras,lojaId);
  const catalogo=catalogoCommerceServidor(produtos,regras).map(p=>{
   const r=regras[p.produtoId],original=r.fotoCadastroPreviewUrl||urlImagemCommerce(produtos.find(prod=>String(prod.id)===p.produtoId)?.imagem);const fotos=[...(r.usarFotoCadastro!==false&&original?[{id:'cadastro',url:original,alt:p.nome}]:[]),...(r.galeriaImagens||[]).map(f=>({id:f.id,url:f.url,alt:f.alt,miniaturaUrl:f.miniaturaUrl}))];
   const capa=fotos.find(f=>f.id===r.capaImagemId)||fotos[0];
   const {produtoId,...publico}=p;return {...publico,imagens:fotos,imagemUrl:urlImagemCommerce(r.imagemPublica)||capa?.url||null};
  });
  return {idPublico:id,revision:publication.revision,aparencia:publication.aparencia,whatsapp:publication.whatsapp,catalogo};
 }
 if(!request.auth?.uid)throw new HttpsError('unauthenticated','Identifique a sessão para enviar seu pedido.');
 let key,assinatura;try{if(JSON.stringify(request.data.pedido||{}).length>15000)throw Error('Pedido excede o tamanho permitido.');key=chavePedidoCommerce(request.auth.uid,request.data.chaveEnvio);assinatura=assinaturaPedidoCommerce(request.data.pedido||{});}catch(e){throw invalid(e);}
 const ref=db.doc(`lojas/${lojaId}/commerce_pedidos/${key}`),dia=new Date().toISOString().slice(0,10);
 const quota=draftRef(db,lojaId,'quota-pedidos-'+dia),userQuota=db.doc(`lojas/${lojaId}/commerce_quotas/${chavePedidoCommerce(request.auth.uid,'quota-'+dia+'-pedidos')}`);
 return db.runTransaction(async tx=>{
  const [old,q,u,pub,license,op]=await Promise.all([tx.get(ref),tx.get(quota),tx.get(userQuota),tx.get(draftRef(db,lojaId,'publicacao')),tx.get(draftRef(db,lojaId,'licenca')),tx.get(db.doc(`lojas/${lojaId}/dados/operacao`))]);
  exigirLicenca(license);if(pub.data()?.ativo!==true||pub.data()?.idPublico!==id)throw new HttpsError('not-found','Loja indisponível.');
  if(old.exists){if(old.data().assinatura!==assinatura)throw new HttpsError('already-exists','Esse envio já foi usado para outro pedido.');return respostaPedidoCommerce(old.data(),key,pub.data().whatsapp);}
  if(request.data.revision!==pub.data().revision)throw new HttpsError('aborted','O catálogo mudou. Atualize antes de enviar.');
  if((q.data()?.total||0)>=500||(u.data()?.total||0)>=10)throw new HttpsError('resource-exhausted','Limite de pedidos atingido. Entre em contato com a loja.');
  let pedido;try{pedido=validarPedidoCommerce(request.data.pedido,catalogoCommerceServidor(op.data()?.produtos,pub.data().regras));}catch(e){throw invalid(e);}
  // O preço exibido deve coincidir com o canônico atual; alteração exige nova confirmação do cliente.
  if(request.data.totalCentavos!==pedido.totalCentavos)throw new HttpsError('aborted','Preço alterado. Atualize o catálogo e confira o novo total.');
  const data={...pedido,clienteUid:request.auth.uid,assinatura,criadoEm:new Date().toISOString(),idPublico:id};
  tx.create(ref,data);tx.set(quota,{total:(q.data()?.total||0)+1});tx.set(userQuota,{total:(u.data()?.total||0)+1});
  return respostaPedidoCommerce(data,key,pub.data().whatsapp);
 });
});
