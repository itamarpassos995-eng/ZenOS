import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { resolverLojaFiscalAutorizada } from './fiscalAuthorization.js';
import { validarCadastroSolicitacao, FiscalSolicitacaoError } from './fiscalSolicitacaoCore.js';
import { createHash } from 'node:crypto';
import { validarConfiguracaoFiscal, avaliarConfiguracaoFiscal } from './fiscalAtivacaoCore.js';
import { obterTokenFocus, validarEmpresaFocus } from './fiscalFocusOnboarding.js';
import { registrarInteresseFiscal } from './fiscalInteresseCore.js';

const validar = (data,configuracao=false) => {
  try { return configuracao?validarConfiguracaoFiscal(data):validarCadastroSolicitacao(data); }
  catch(error) {
    if(error instanceof FiscalSolicitacaoError) throw new HttpsError('invalid-argument',error.message);
    throw error;
  }
};
const hashConfiguracao=({pais,cadastro,tiposDocumento=[]})=>createHash('sha256').update(JSON.stringify({pais,cadastro,tiposDocumento})).digest('hex');
const respostaCadastro=d=>({status:d.status||'em_analise',cadastro:d.cadastro||null,pais:d.pais||null,habilitado:d.habilitado===true,createdAt:d.createdAt||null,tiposDocumento:d.tiposDocumento||[],ativacao:avaliarConfiguracaoFiscal(d)});
export const fiscalSolicitacaoCliente = onCall({region:'southamerica-east1',timeoutSeconds:60,memory:'256MiB'}, async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated','Faça login no ZenOS.');
  const action = request.data?.action;
  if (!['consultar','solicitar','solicitarModulo','configurar','validarConfiguracao'].includes(action)) throw new HttpsError('invalid-argument','Operação inválida.');
  const db = await obterAdminFirestore();
  const lojaId = await resolverLojaFiscalAutorizada({auth:request.auth,requestedLojaId:request.data?.lojaId,firestore:db});
  const ref = db.doc(`lojas/${lojaId}/fiscal_configuracao/solicitacao`);
  if(action==='solicitarModulo') {
    if(!['BR','PY'].includes(request.data?.pais))throw new HttpsError('invalid-argument','Selecione o país da empresa.');
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const novo=registrarInteresseFiscal(snap.exists?snap.data():null,{pais:request.data.pais,uid:request.auth.uid,agora:new Date().toISOString()});
      if(!snap.exists)tx.create(ref,novo);
      return respostaCadastro(novo);
    });
  }
  if (action==='consultar') {
    const snap=await ref.get();
    if(!snap.exists)return {status:'nao_solicitado',cadastro:null,pais:null,habilitado:false};
    const d=snap.data();
    return respostaCadastro(d);
  }
  if(action==='validarConfiguracao') {
    const snap=await ref.get();
    if(!snap.exists)throw new HttpsError('failed-precondition','Salve a configuração da empresa antes de verificar.');
    const atual=snap.data();
    if(atual.pais!=='BR')throw new HttpsError('failed-precondition','A integração brasileira não se aplica ao país desta empresa.');
    if(atual.habilitado===true)throw new HttpsError('failed-precondition','A empresa já possui ativação. Alterações exigem revisão.');
    const avaliacao=avaliarConfiguracaoFiscal(atual);
    if(!avaliacao.cadastroCompleto)return respostaCadastro(atual);
    if(request.data?.aceiteCompartilhamentoFocus!==true)throw new HttpsError('invalid-argument','Autorize a validação dos dados da empresa pela Focus NFe.');
    const hash=hashConfiguracao(atual);
    let validacao;
    try {validacao=await validarEmpresaFocus({cadastro:atual.cadastro,token:await obterTokenFocus()});}
    catch {validacao={cadastroValidado:false,codigo:'FOCUS_INDISPONIVEL'};}
    validacao.verificadoEm=new Date().toISOString();
    return db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      if(!current.exists||hashConfiguracao(current.data())!==hash||current.data().habilitado===true)throw new HttpsError('aborted','O cadastro foi alterado durante a verificação. Consulte a configuração atual.');
      const update={validacaoProvedor:validacao,compartilhamentoFocus:{versao:1,por:request.auth.uid,em:validacao.verificadoEm,configuracaoHash:hash},updatedAt:validacao.verificadoEm};
      tx.update(ref,update);
      return respostaCadastro({...current.data(),...update});
    });
  }
  const configuracao=action==='configurar';
  const dados=validar(request.data,configuracao);
  const {pais,cadastro}=dados;
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const atual=snap.exists?snap.data():null;
    const editaveis=configuracao?[null,'nao_solicitado','solicitado','em_analise','rejeitado','aguardando_credenciamento','configuracao_pendente']:[null,'nao_solicitado','solicitado','em_analise','rejeitado'];
    if(atual?.habilitado===true || !editaveis.includes(atual?.status??null)) throw new HttpsError('failed-precondition','Módulo já aprovado. Alterações exigem análise.');
    const createdAt=atual?.createdAt||new Date().toISOString();
    const agora=new Date().toISOString();
    const historico=Array.isArray(atual?.historico)?atual.historico.slice(-29):[];
    historico.push({tipo:configuracao?'configuracao_salva':atual?'cadastro_atualizado':'solicitacao_criada',por:request.auth.uid,em:agora});
    const novo={pais,cadastro,status:configuracao?'configuracao_pendente':'em_analise',habilitado:false,createdAt,updatedAt:agora,solicitadoPor:request.auth.uid,historico};
    if(atual?.interesse)novo.interesse=atual.interesse;
    if(configuracao)Object.assign(novo,{tiposDocumento:dados.tiposDocumento,fluxo:'autoatendimento',aceiteConfiguracao:{versao:1,por:request.auth.uid,em:agora},configuracaoHash:hashConfiguracao(dados),validacaoProvedor:null,compartilhamentoFocus:null});
    tx.set(ref,novo);
    return configuracao?respostaCadastro(novo):{status:novo.status,habilitado:false,pais,createdAt};
  });
});
