import { doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { notifyPersistenceStatus } from './persistenceSafety.js';

export const criarMesasPadrao = () => {
  const iniciais=[];
  for(let i=1;i<=15;i++) iniciais.push({id:`M${i}`,tipo:'Mesa',rotulo:`Mesa ${String(i).padStart(2,'0')}`,status:'livre',itens:[],version:0});
  for(let i=1;i<=5;i++) iniciais.push({id:`C${i}`,tipo:'Comanda',rotulo:`Comanda ${String(i).padStart(2,'0')}`,status:'livre',itens:[],version:0});
  return iniciais;
};

const refMesas = (db,userId) => doc(db,'lojas',String(userId),'dados','mesas');

export async function garantirMesasV1({db,userId,mesasIniciais=null}) {
  if(!db||!userId) return;
  const mesas = Array.isArray(mesasIniciais) && mesasIniciais.length ? mesasIniciais : criarMesasPadrao();
  await setDoc(refMesas(db,userId),{schema:'MESAS_V1_ATT09',mesas,importedFromLocalV1:Array.isArray(mesasIniciais)&&mesasIniciais.length>0,updatedAtClient:new Date().toISOString(),updatedAtServer:serverTimestamp()},{merge:true});
}

export function assinarMesasV1({db,userId,onData,onError}) {
  if(!db||!userId) return ()=>{};
  return onSnapshot(refMesas(db,userId),snap=>{
    if(!snap.exists()){ onData?.(null); return; }
    onData?.(Array.isArray(snap.data()?.mesas)?snap.data().mesas:[]);
  },onError);
}

export async function atualizarMesaV1({db,userId,mesaId,mutator,operador}) {
  if(!db||!userId||!mesaId||typeof mutator!=='function') throw new Error('Parâmetros inválidos para atualizar mesa.');
  notifyPersistenceStatus({status:'SALVANDO',field:'mesas'});
  try {
    const resultado=await runTransaction(db,async tx=>{
      const ref=refMesas(db,userId);
      const snap=await tx.get(ref);
      const mesas=Array.isArray(snap.data()?.mesas)?snap.data().mesas:criarMesasPadrao();
      const idx=mesas.findIndex(m=>String(m.id)===String(mesaId));
      if(idx<0) throw new Error('Mesa/comanda não encontrada.');
      const atual=mesas[idx];
      const proxima=mutator({...atual,itens:[...(atual.itens||[])]});
      if(!proxima) return atual;
      const novas=[...mesas];
      novas[idx]={...proxima,version:Number(atual.version||0)+1,updatedBy:operador?.id||'admin',updatedByName:operador?.nome||'Administrador',updatedAtClient:new Date().toISOString()};
      tx.set(ref,{schema:'MESAS_V1_ATT09',mesas:novas,updatedAtServer:serverTimestamp()},{merge:true});
      return novas[idx];
    });
    notifyPersistenceStatus({status:'SINCRONIZADO',field:'mesas'});
    return resultado;
  } catch(error) {
    notifyPersistenceStatus({status:'ERRO',field:'mesas',error:error?.message||String(error)});
    throw error;
  }
}
