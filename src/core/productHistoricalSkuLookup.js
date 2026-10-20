import {doc,getDocFromServer} from 'firebase/firestore';
import {getOperationalSnapshot,peekV2Session} from './operationalRepository.js';
import {chavesUnicidadeProduto} from './productRegistry.js';

// Busca dirigida por SKU antigo; não faz varredura de índices, não escreve nada.
// A cópia legada V1 é evidência histórica, nunca saldo pronto para restauração.
export function conciliarSkuHistorico({sku,indexData,catalogoAtual,catalogoLegado=null}){
 const skuLimpo=String(sku??'').trim();
 if(!skuLimpo||!Array.isArray(catalogoAtual))return {status:'unknown',reason:'missing_authoritative_catalog'};
 const owner=indexData?.ativo!==false?String(indexData?.produtoId||''):'';
 const clean=v=>String(v??'').trim().toLowerCase();
 const identificar=(items=[])=>items.filter(p=>p&&(owner?String(p.id)===owner:clean(p.sku)===clean(skuLimpo)));
 const atuais=identificar(catalogoAtual);
 if(atuais.length>1)return {status:'conflict',reason:'duplicate_live_ids',ownerId:owner};
 if(atuais.length===1)return {status:'found',source:'current',produto:atuais[0],ownerId:String(atuais[0].id)};
 const historicos=Array.isArray(catalogoLegado)?identificar(catalogoLegado):[];
 if(historicos.length>1)return {status:'conflict',reason:'duplicate_historical_ids',ownerId:owner};
 if(historicos.length===1){
  const produto=historicos[0];
  return {status:'historical_only',ownerId:String(produto.id),nome:String(produto.nome||''),sku:String(produto.sku||''),reason:'historical_not_authoritative'};
 }
 if(owner)return {status:'orphan_index',ownerId:owner,reason:'owner_not_found_in_catalogs'};
 return {status:'not_found',reason:'no_record_for_sku'};
}

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
