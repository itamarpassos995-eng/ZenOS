import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {obterAdminFirestore} from './firebaseAdmin.js';
import {
 conferirSolicitanteCommerce,registrarInteresseCommerce,respostaInteresseCommerce,
 COLECAO_COMMERCE_INTERESSE,DOCUMENTO_COMMERCE_INTERESSE,
} from './commerceInteresseCore.js';

/**
 * Solicitação pública para o TITULAR LOGADO da loja.
 * Não usa/retorna preço, cliente, saldo, PDV, V1/V2 ou autorização do módulo.
 * Não há endpoint de aprovação nesta função.
 */
export const commerceSolicitacaoCliente=onCall({
 region:'southamerica-east1',timeoutSeconds:30,memory:'256MiB',
},async request=>{
 const action=request.data?.action;
 if(!['consultar','solicitar'].includes(action))
   throw new HttpsError('invalid-argument','Operação de solicitação inválida.');
 const identity=conferirSolicitanteCommerce(request.auth,request.data?.lojaId);
 if(!identity.ok)
   throw new HttpsError(identity.code,identity.reason==='WRONG_TENANT'?'Esta loja não pertence ao usuário autenticado.':'Faça login na loja para solicitar o módulo.');
 const {lojaId}=identity;
 const db=await obterAdminFirestore();
 // DOCUMENTO PRINCIPAL DA LOJA SÓ É LIDO. Nenhum merge/array é realizado.
 const loja=await db.doc(`lojas/${lojaId}`).get();
 if(!loja.exists)throw new HttpsError('permission-denied','Esta loja ainda não possui cadastro confirmado no ZenOS.');
 const ref=db.doc(`lojas/${lojaId}/${COLECAO_COMMERCE_INTERESSE}/${DOCUMENTO_COMMERCE_INTERESSE}`);
 if(action==='consultar')return respostaInteresseCommerce((await ref.get()).data());
 const now=new Date().toISOString();
 return db.runTransaction(async tx=>{
   const old=await tx.get(ref);
   const {criar,doc}=registrarInteresseCommerce(old.exists?old.data():null,{
     lojaId,solicitadoPor:request.auth.uid,agora:now,
     email:request.auth.token?.email,
   });
   if(criar)tx.create(ref,doc); // idempotente: clique duplo e refresh não duplicam pedidos
   return respostaInteresseCommerce(doc);
 });
});