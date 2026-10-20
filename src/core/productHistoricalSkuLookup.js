import {conciliarSkuHistorico} from './productHistoricalSkuCore.js';
import {doc,getDocFromServer} from 'firebase/firestore';
import {getOperationalSnapshot,peekV2Session} from './operationalRepository.js';
import {chavesUnicidadeProduto} from './productRegistry.js';

// Busca dirigida por SKU antigo; não faz varredura de índices, não escreve nada.
// A cópia legada V1 é evidência histórica, nunca saldo pronto para restauração.
export {conciliarSkuHistorico} from './productHistoricalSkuCore.js';
export async function localizarSkuHistoricoServidor({db,userId,sku}){
 if(!db||!userId||!String(sku||'').trim())return {status:'unknown',reason:'invalid_input'};
 const key=chavesUnicidadeProduto({sku}).find(x=>x.startsWith('sku_'));
 if(!key)return {status:'unknown',reason:'invalid_sku'};
 try {
  const indexSnap=await getDocFromServer(doc(db,'lojas',String(userId),'produto_indices',key));
  const snap=await getOperationalSnapshot(db,userId);
  if(!snap.exists()||!Array.isArray(snap.data()?.produtos))
   return {status:'unknown',reason:'catalog_unavailable'};
  let historico=null,legacyReadStatus='not_needed';
  if(peekV2Session(db,userId)){
   try{
    const legado=await getDocFromServer(doc(db,'lojas',String(userId),'dados','operacao'));
    historico=legado.exists()&&Array.isArray(legado.data()?.produtos)?legado.data().produtos:null;
    legacyReadStatus=historico?'available':'not_found';
   }catch(error){legacyReadStatus='read_failed';}
  }
  const result=conciliarSkuHistorico({
   sku,indexData:indexSnap.exists()?indexSnap.data():null,
   catalogoAtual:snap.data().produtos,catalogoLegado:historico
  });
  return {...result,legacyReadStatus,catalogCount:snap.data().produtos.length,
   catalog:result.status==='found'?snap.data().produtos:undefined};
 }catch(error){
  return {status:'unknown',reason:'server_unavailable',code:error?.code||'unknown'};
 }
}
