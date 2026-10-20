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

