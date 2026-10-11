import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { resolverLojaFiscalAutorizada } from './fiscalAuthorization.js';
import { validarCadastroSolicitacao, FiscalSolicitacaoError } from './fiscalSolicitacaoCore.js';

const validar = data => {
  try { return validarCadastroSolicitacao(data); }
  catch(error) {
    if(error instanceof FiscalSolicitacaoError) throw new HttpsError('invalid-argument',error.message);
    throw error;
  }
};
export const fiscalSolicitacaoCliente = onCall({region:'southamerica-east1',timeoutSeconds:30,memory:'256MiB'}, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Faça login no ZenOS.');
  const action = request.data?.action;
  if (!['consultar','solicitar'].includes(action)) throw new HttpsError('invalid-argument','Operação inválida.');
  const db = await obterAdminFirestore();
  const lojaId = await resolverLojaFiscalAutorizada({auth:request.auth,requestedLojaId:request.data?.lojaId,firestore:db});
  const ref = db.doc(`lojas/${lojaId}/fiscal_configuracao/solicitacao`);
  if (action==='consultar') {
    const snap=await ref.get();
    if(!snap.exists)return {status:'nao_solicitado',cadastro:null,pais:null,habilitado:false};
    const d=snap.data();
    return {status:d.status||'em_analise',cadastro:d.cadastro||null,pais:d.pais||null,habilitado:d.habilitado===true,createdAt:d.createdAt||null};
  }
  const {pais,cadastro}=validar(request.data);
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const atual=snap.exists?snap.data():null;
    if(atual?.habilitado===true || ![null,'nao_solicitado','em_analise','rejeitado'].includes(atual?.status??null)) throw new HttpsError('failed-precondition','Módulo já aprovado. Alterações exigem análise.');
    const createdAt=atual?.createdAt||new Date().toISOString();
    const agora=new Date().toISOString();
    const historico=Array.isArray(atual?.historico)?atual.historico.slice(-29):[];
    historico.push({tipo:atual?'cadastro_atualizado':'solicitacao_criada',por:request.auth.uid,em:agora});
    const novo={pais,cadastro,status:'em_analise',habilitado:false,createdAt,updatedAt:agora,solicitadoPor:request.auth.uid,historico};
    tx.set(ref,novo);
    return {status:novo.status,habilitado:false,pais,createdAt};
  });
});
