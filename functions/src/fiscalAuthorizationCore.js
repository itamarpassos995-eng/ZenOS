// Pure authorization precheck: no network, no mutable state, no Firestore.
export const validarIdentidadeFiscal = (auth, requestedLojaId = null) => {
  const uid = typeof auth?.uid === 'string' ? auth.uid.trim() : '';
  if (!uid) return { ok:false, httpsCode:'unauthenticated', fiscalCode:'FISCAL_NAO_AUTENTICADO' };
  // Conservative compatibility with the existing ZenOS ownership mapping.
  // Do not grant employees/multistore access until their authorization schema is audited.
  if (requestedLojaId != null &&
      (typeof requestedLojaId !== 'string' || requestedLojaId.trim() !== uid)) {
    return { ok:false, httpsCode:'permission-denied', fiscalCode:'FISCAL_LOJA_DIVERGENTE' };
  }
  return {ok:true, lojaId:uid};
};
