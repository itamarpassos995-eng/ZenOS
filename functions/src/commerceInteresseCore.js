/**
 * Fluxo de INTERESSE no Commerce Premium, totalmente separado da ativação.
 * Esta API nunca libera funcionalidades, licença, produtos nem acesso às vendas.
 */
export const STATUS_INTERESSE_COMMERCE = Object.freeze([
  'nao_solicitado', 'pendente_analise', 'em_analise', 'aprovado', 'rejeitado',
]);
export const DOCUMENTO_COMMERCE_INTERESSE = 'solicitacao';
export const COLECAO_COMMERCE_INTERESSE = 'commerce_solicitacoes';

export function conferirSolicitanteCommerce(auth, requestedLojaId) {
  const uid = typeof auth?.uid === 'string' ? auth.uid.trim() : '';
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid))
    return {ok:false,code:'unauthenticated',reason:'AUTH_REQUIRED'};
  if (requestedLojaId !== undefined && requestedLojaId !== null &&
     (typeof requestedLojaId !== 'string' || requestedLojaId !== uid))
    return {ok:false,code:'permission-denied',reason:'WRONG_TENANT'};
  return {ok:true,lojaId:uid};
}

export function registrarInteresseCommerce(atual, {lojaId,solicitadoPor,agora,email}={}) {
  if (atual) return {criar:false,doc:atual};
  if (!lojaId || lojaId!==solicitadoPor || !Number.isFinite(Date.parse(agora)))
    throw new Error('COMMERCE_REQUEST_INVALID');
  const doc = {
    versao:1,modulo:'commerce',lojaId,status:'pendente_analise',habilitado:false,
    solicitadoPor,createdAt:agora,updatedAt:agora,origem:'zenos_app'
  };
  if (typeof email==='string' && email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))doc.emailContato=email;
  return {criar:true,doc};
}

export function respostaInteresseCommerce(doc) {
  if (!doc)return {status:'nao_solicitado',habilitado:false,createdAt:null};
  const status=STATUS_INTERESSE_COMMERCE.includes(doc.status)?doc.status:'em_analise';
  // Mesmo um registro adulterado/antigo não habilita o Commerce pelo status!
  return {status,habilitado:false,createdAt:typeof doc.createdAt==='string'?doc.createdAt:null};
}
