import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {obterAdminFirestore} from './firebaseAdmin.js';
import {bootstrapCommercePermitido} from './commerceHmlBootstrapCore.js';
// Provisionamento idempotente EXCLUSIVO de uma loja fictícia no projeto autorizado.
export const commerceHmlBootstrap=onCall({region:'southamerica-east1',maxInstances:1},async request=>{
 if(!bootstrapCommercePermitido(process.env,request.auth))throw new HttpsError('permission-denied','Somente o proprietário autorizado pode preparar a loja fictícia no projeto isolado.');
 const db=await obterAdminFirestore(),uid=request.auth.uid,lojaId='hml-commerce-loja-a';
 const shop=db.doc(`lojas/${lojaId}`),op=db.doc(`lojas/${lojaId}/dados/operacao`),acl=db.doc(`commerce_operator_access/${uid}`),license=db.doc(`lojas/${lojaId}/commerce_private/licenca`);
 return db.runTransaction(async tx=>{
  const [s,o,a,l]=await Promise.all([tx.get(shop),tx.get(op),tx.get(acl),tx.get(license)]);
  if(s.exists){if(s.data()?.homologacaoProprietarioUid!==uid)throw new HttpsError('permission-denied','Loja fictícia já atribuída.');return {lojaId,jaPreparada:true};}
  if(o.exists||a.exists||l.exists)throw new HttpsError('failed-precondition','Existem registros anteriores. Nada foi sobrescrito.');
  tx.create(shop,{tipo:'homologacao',homologacaoProprietarioUid:uid,criadoEm:new Date().toISOString()});
  const imagem='data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAACwBgCdASp4AHgAPm02mUmkIyKhIIgAgA2JaW7hdJlwAAE9tiLxBUc9sReIKjntiLxBUc9sReIKjntiLxBNgAD+/paf//tTBJGUv//dBlnDdIAAAAAAAA==';
  tx.create(op,{produtos:[{id:'HML-001',sku:'HML-001',nome:'Produto de demonstração',grupo:'Demonstração',preco1BRL:29.9,estoque:10,estoqueVitrine:5,estoqueGalpao:5,imagem,descricaoPublica:'Produto fictício para validar o pedido. Não é uma oferta comercial.'}]});
  tx.create(acl,{ativo:true,papel:'admin',lojaId});
  tx.create(license,{status:'ativo',ativacaoConfirmadaServidor:true,planoId:'homologacao_sem_cobranca',homologacao:true});
  return {lojaId,jaPreparada:false};
 });
});
