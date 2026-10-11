import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { resolverLojaFiscalAutorizada } from './fiscalAuthorization.js';

const letras = (v,max=180) => typeof v==='string' ? v.trim().slice(0,max) : '';
const campos = ['razaoSocial','cnpj','inscricaoEstadual','inscricaoMunicipal','uf','municipioCodigoIbge','endereco','cep','codigoServico','razonSocial','ruc','dv','direccion','departamento','distrito','establecimiento','puntoExpedicion','timbrado','responsavel','telefone','email'];
const validar = data => {
  const pais = data?.pais;
  if (!['BR','PY'].includes(pais)) throw new HttpsError('invalid-argument','Selecione Brasil ou Paraguai.');
  const cadastro = {};
  for (const campo of campos) cadastro[campo] = letras(data?.cadastro?.[campo],campo==='endereco'||campo==='direccion'?300:180);
  if (!(pais==='BR'? cadastro.razaoSocial && /^\d{14}$/.test(cadastro.cnpj.replace(/\D/g,'')) : cadastro.razonSocial && /^\d{3,12}$/.test(cadastro.ruc.replace(/\D/g,'')))) {
    throw new HttpsError('invalid-argument','Informe a razão social e o documento fiscal válido no formato esperado.');
  }
  if (cadastro.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cadastro.email)) throw new HttpsError('invalid-argument','E-mail inválido.');
  return {pais,cadastro};
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
    if(atual?.habilitado===true || ['aprovado','ativo'].includes(atual?.status)) throw new HttpsError('failed-precondition','Módulo já aprovado. Alterações exigem análise.');
    const createdAt=atual?.createdAt||new Date().toISOString();
    const novo={pais,cadastro,status:'em_analise',habilitado:false,createdAt,updatedAt:new Date().toISOString(),solicitadoPor:request.auth.uid};
    tx.set(ref,novo);
    return {status:novo.status,habilitado:false,pais,createdAt};
  });
});
