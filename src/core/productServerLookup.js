import {doc,getDocFromServer} from 'firebase/firestore';
import {getOperationalSnapshot} from './operationalRepository.js';
import {chavesUnicidadeProduto} from './productRegistry.js';

/** Diagnóstico sem escrita: índice por loja + catálogo autoritativo V1/V2. */
export async function localizarProdutoExistenteServidor({db,userId,produto}){
 if(!db||!userId||!produto) return {status:'unknown'};
 try{
  const keys=chavesUnicidadeProduto(produto);
  const indexSnaps=await Promise.all(keys.map(key=>getDocFromServer(doc(db,'lojas',String(userId),'produto_indices',key))));
  const owners=new Set(indexSnaps.filter(s=>s.exists()&&s.data()?.ativo!==false).map(s=>String(s.data()?.produtoId||'')).filter(Boolean));
  const snap=await getOperationalSnapshot(db,userId);
  if(!snap.exists())return {status:'unknown',reason:'catalog_not_found'};
  const catalog=snap.data()?.produtos;
  if(!Array.isArray(catalog))return {status:'unknown',reason:'catalog_missing'};
  const matches=catalog.filter(p=>p&&owners.has(String(p.id)));
  if(matches.length===1)return {status:'found',produto:matches[0],catalog};
  if(matches.length>1)return {status:'conflict',reason:'multiple_index_owners'};
  if(owners.size)return {status:'orphan_index',reason:'index_without_catalog_record'};
  return {status:'not_found',reason:'no_active_index'};
 }catch(error){return {status:'unknown',reason:'server_unavailable',code:String(error?.code||'unknown')};}
}
