import {getFunctions,httpsCallable} from 'firebase/functions';
import {getApps} from 'firebase/app';
import {getAuth} from 'firebase/auth';
let sessao=null,erro='',geracao=0;
const ouvintes=new Set();
const avisar=()=>{for(const fn of ouvintes)fn();};
export function observarSessaoCommerceZenOS(fn){ouvintes.add(fn);return()=>ouvintes.delete(fn);}
export const ponteCommerceZenOSHabilitada=import.meta.env.VITE_ZENOS_COMMERCE_OPERATOR_BRIDGE==='true';
export function limparSessaoCommerceZenOS(){geracao++;sessao=null;erro='';avisar();}
export function obterAuthCommerceZenOS(){const app=getApps().find(a=>a.name==='[DEFAULT]');if(!app)throw Error('Entre no ZenOS.');return getAuth(app);}
export function estadoSessaoCommerceZenOS(){return {pronto:!!sessao&&sessao.expiraEm>Date.now(),erro};}
export async function iniciarSessaoCommerceZenOS(auth,operadorId,pin){
 limparSessaoCommerceZenOS();if(!ponteCommerceZenOSHabilitada)return;
 const turno=geracao,uid=auth.currentUser?.uid;if(!uid)return;
 try{
  const r=(await httpsCallable(getFunctions(auth.app,'southamerica-east1'),'commerceSessaoZenOS',{timeout:20000})({operadorId:String(operadorId),pin})).data;
  if(turno!==geracao||auth.currentUser?.uid!==uid)return;
  if(r.lojaId!==uid||r.operadorId!==String(operadorId)||!/^[a-f0-9]{64}$/.test(r.sessaoZenOS||''))throw Error('Acesso à loja online não confirmado.');
  sessao={...r,uid};avisar();
 }catch{if(turno===geracao){erro='O acesso à Loja Online não foi confirmado. A operação normal do ZenOS continua disponível.';avisar();}}
}
export function callableCommerceZenOS(nome){
 const auth=obterAuthCommerceZenOS();
 return async dados=>{
  if(!sessao||sessao.uid!==auth.currentUser?.uid||sessao.expiraEm<=Date.now())throw Error(erro||'Acesso à Loja Online ainda não confirmado para este operador.');
  const turno=geracao,uid=auth.currentUser.uid;
  const result=await httpsCallable(getFunctions(auth.app,'southamerica-east1'),nome)({...dados,sessaoZenOS:sessao.sessaoZenOS});
  if(turno!==geracao||auth.currentUser?.uid!==uid)throw Error('Operador alterado durante o atendimento. Entre novamente na Loja Online.');
  return result;
 };
}
