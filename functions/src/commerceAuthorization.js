import {autorizarSessaoZenOS} from './commerceZenOSSession.js';
import { HttpsError } from 'firebase-functions/v2/https';
import {authorizedOperationalHml} from './commerceHmlOperationalCore.js';

export const CONTRATO_HML_ISOLAMENTO='zenos-commerce-tenant-20261019-v1';
export const executandoHmlCommerce=()=> (process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT)==='zenos-commerce-homologacao';

// Provisionado exclusivamente pelo Admin SDK. Nunca confiar no papel enviado pelo cliente
// nem no login compartilhado do estabelecimento.
export async function autorizarOperadorCommerce(auth, firestore, sessaoZenOS) {
 if(executandoHmlCommerce()){
  // Exclusivo da HML: nunca cair no vínculo legado de contas individuais.
  // Nenhum documento operacional privado pode ser lido antes desta validação.
  if(!authorizedOperationalHml(process.env,auth)||typeof sessaoZenOS!=='string')
   throw new HttpsError('permission-denied','Acesso Commerce da loja fictícia não confirmado.');
  const sessao=await autorizarSessaoZenOS(auth,firestore,sessaoZenOS);
  if(sessao.lojaId!==auth.uid)
   throw new HttpsError('permission-denied','Identidade da loja incompatível. Operação bloqueada.');
  const raiz=await firestore.doc(`lojas/${auth.uid}`).get();
  const loja=raiz.data();
  if(!raiz.exists||loja?.tipo!=='homologacao_operacional'||
     loja?.testeSomente!==true||loja?.homologacaoProprietarioUid!==auth.uid)
   throw new HttpsError('permission-denied','Cadastro fictício não pertence ao titular autenticado.');
  return sessao;
 }
 if(sessaoZenOS!==undefined)return autorizarSessaoZenOS(auth,firestore,sessaoZenOS);
 if(!auth?.uid)throw new HttpsError('unauthenticated','Entre com sua conta individual para acessar o Commerce.');
 const provider=auth.token?.firebase?.sign_in_provider;
 if(auth.token?.email_verified!==true||!['google.com','password'].includes(provider))
  throw new HttpsError('permission-denied','Use uma conta individual com e-mail verificado.');
 const snap=await firestore.doc(`commerce_operator_access/${auth.uid}`).get();
 const acesso=snap.data();
 if(!snap.exists||acesso?.ativo!==true||acesso?.papel!=='admin'||
   typeof acesso?.lojaId!=='string'||!acesso.lojaId||acesso.lojaId.includes('/')||
   acesso.lojaId===auth.uid)
  throw new HttpsError('permission-denied','Operador sem autorização administrativa individual para o Commerce.');
 return {lojaId:acesso.lojaId,operadorUid:auth.uid};
}
