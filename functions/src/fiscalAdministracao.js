import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { obterAdminFirestore } from './firebaseAdmin.js';
import { resumirDemandaFiscal } from './fiscalInteresseCore.js';
import { avaliarConfiguracaoFiscal } from './fiscalAtivacaoCore.js';
const validoId = v=>typeof v==='string'&&/^[a-zA-Z0-9._:-]{1,180}$/.test(v);
const proteger = request=>{
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','Login necessário.');
  if(request.auth.token?.zenosFiscalAdmin!==true)throw new HttpsError('permission-denied','Acesso exclusivo à administração fiscal.');
};
// O administrador só analisa solicitações comerciais. NUNCA ativa emissão diretamente.
export const fiscalAdministracao = onCall({region:'southamerica-east1',timeoutSeconds:30,memory:'256MiB'},async request=>{
 proteger(request);
 const action=request.data?.action;
 if(!['listar','analisar'].includes(action))throw new HttpsError('invalid-argument','Operação fiscal administrativa inválida.');
 const db=await obterAdminFirestore();
 if(action==='listar'){
   const snap=await db.collectionGroup('fiscal_configuracao').limit(250).get();
   const itens=snap.docs.filter(d=>d.id==='solicitacao').map(doc=>{
     const d=doc.data();
     return {lojaId:doc.ref.parent.parent?.id||null,pais:d.pais||null,integracao:d.integracao||null,
       razaoSocial:d.pais==='PY'?d.cadastro?.razonSocial||'':d.cadastro?.razaoSocial||'',
       status:d.status||'em_analise',email:d.cadastro?.email||'',telefone:d.cadastro?.telefone||'',
       createdAt:d.createdAt||null,tiposDocumento:d.tiposDocumento||[],cadastroCompleto:avaliarConfiguracaoFiscal(d).cadastroCompleto,
       updatedAt:d.updatedAt||d.createdAt||null,habilitado:d.habilitado===true};
   }).filter(x=>x.lojaId).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
   return {solicitacoes:itens,limitado:snap.size===250,demanda:resumirDemandaFiscal(itens)};
 }
 const lojaId=request.data?.lojaId;
 const decisao=request.data?.decisao;
 if(!validoId(lojaId)||!['aguardando_credenciamento','rejeitado'].includes(decisao))
   throw new HttpsError('invalid-argument','Loja ou decisão inválida.');
 const ref=db.doc(`lojas/${lojaId}/fiscal_configuracao/solicitacao`);
 return db.runTransaction(async tx=>{
   const snap=await tx.get(ref);
   if(!snap.exists)throw new HttpsError('not-found','Solicitação não encontrada.');
   const atual=snap.data();
   if(atual.status!=='em_analise')throw new HttpsError('failed-precondition','Solicitação não está em análise.');
   if(atual.habilitado)throw new HttpsError('failed-precondition','Loja fiscal já habilitada.');
   const agora=new Date().toISOString();
   const historico=Array.isArray(atual.historico)?atual.historico.slice(-29):[];
   historico.push({tipo:'analise_administrativa',decisao,por:request.auth.uid,em:agora});
   tx.update(ref,{status:decisao,habilitado:false,updatedAt:agora,analisadoPor:request.auth.uid,historico});
   return {lojaId,status:decisao,habilitado:false};
 });
});
