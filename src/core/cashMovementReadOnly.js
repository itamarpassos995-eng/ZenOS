import {doc,getDocFromServer} from 'firebase/firestore';
import {getOperationalSnapshot} from './operationalRepository.js';

// Apenas leitura; não reenvia, cancela nem refaz movimentos monetários.
export function classificarMovimentoCaixaConfirmado({tentativa,movimentos,lancamento}){
 if(!tentativa||!Array.isArray(movimentos))return {status:'unknown',reason:'invalid_authoritative_data'};
 const iguais=movimentos.filter(m=>String(m?.id)===String(tentativa.id));
 if(iguais.length!==1 || !lancamento) return {status:'unknown',reason:'missing_or_duplicate_record'};
 const item=iguais[0];
 const valor=Number(tentativa.valorBRL);
 if(!Number.isFinite(valor)||valor<=0)return {status:'unknown',reason:'invalid_attempt'};
 const matches=[
  String(item.sessaoId)===String(tentativa.sessaoId),
  String(item.tipo)===String(tentativa.tipo),
  Math.abs(Number(item.valorBRL)-valor)<0.001,
  String(lancamento.referenciaId)===String(tentativa.id),
  String(lancamento.sessaoId)===String(tentativa.sessaoId),
  String(lancamento.tipo)===String(tentativa.tipo),
  String(lancamento.origem)==='caixa_manual',
  Math.abs(Number(lancamento.valor)-valor)<0.001,
 ].every(Boolean);
 return matches?{status:'confirmed'}:{status:'conflict',reason:'cash_vs_ledger_mismatch'};
}

export async function verificarMovimentoCaixaNoServidor({db,userId,tentativa}){
 if(!db||!userId||!tentativa?.id)return {status:'unknown',reason:'invalid_input'};
 try{
  const [operacao,livro]=await Promise.all([
   getOperationalSnapshot(db,userId),
   getDocFromServer(doc(db,'lojas',String(userId),'financeiro_livro','CAIXA-'+tentativa.id)),
  ]);
  if(!operacao.exists()||!Array.isArray(operacao.data()?.caixaMovimentos))
   return {status:'unknown',reason:'cash_not_readable'};
  return { ...classificarMovimentoCaixaConfirmado({
   tentativa,movimentos:operacao.data().caixaMovimentos,lancamento:livro.exists()?livro.data():null
  }), movimentos:operacao.data().caixaMovimentos};
 }catch(error){return {status:'unknown',reason:'server_unavailable',code:error?.code||'unknown'};}
}
