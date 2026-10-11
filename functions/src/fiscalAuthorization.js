import { HttpsError } from 'firebase-functions/v2/https';
import { validarIdentidadeFiscal } from './fiscalAuthorizationCore.js';

const mensagens = Object.freeze({
  FISCAL_NAO_AUTENTICADO: 'Autenticação Firebase obrigatória para acessar o backend fiscal.',
  FISCAL_LOJA_DIVERGENTE: 'A loja solicitada não corresponde à identidade autenticada.',
  FISCAL_LOJA_NAO_AUTORIZADA: 'A identidade autenticada não possui uma loja ZenOS autorizada.',
});
export const exigirIdentidadeFiscal = (auth, requestedLojaId = null) => {
  const resultado = validarIdentidadeFiscal(auth, requestedLojaId);
  if (!resultado.ok) throw new HttpsError(resultado.httpsCode, mensagens[resultado.fiscalCode], {fiscalCode:resultado.fiscalCode});
  return resultado.lojaId;
};

export const resolverLojaFiscalAutorizada = async ({auth, requestedLojaId = null, firestore}) => {
  const lojaAutorizada = exigirIdentidadeFiscal(auth, requestedLojaId);
  const lojaSnapshot = await firestore.doc(`lojas/${lojaAutorizada}`).get();
  if (!lojaSnapshot.exists) throw new HttpsError('permission-denied', mensagens.FISCAL_LOJA_NAO_AUTORIZADA, {fiscalCode:'FISCAL_LOJA_NAO_AUTORIZADA'});
  return lojaAutorizada;
};
