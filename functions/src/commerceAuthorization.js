import { HttpsError } from 'firebase-functions/v2/https';

// Provisionado exclusivamente pelo Admin SDK. Nunca confiar no papel enviado pelo cliente
// nem no login compartilhado do estabelecimento.
export async function autorizarOperadorCommerce(auth, firestore) {
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
