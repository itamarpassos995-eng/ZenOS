// Reconstrução SOMENTE do cadastro cujo ID foi reservado pelo Novo Produto.
// Não copia saldos históricos e nunca transfere um ID a um nome/SKU diferente.
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const referenced=(entries=[],id,sku)=>entries.some(record=>record&&(
 String(record.produtoId??'')===id||
 (Array.isArray(record.itens)&&record.itens.some(it=>it&&
  ([it.id,it.produtoId,it.produtoOriginalId].some(v=>v!=null&&String(v)===id)||
   norm(it.produtoOriginalSku||it.sku)===norm(sku))))
));
export function avaliarRecomposicaoOriginal({
 ownerId,indices=[],catalogo=[],legado=null,vendas=[],compras=[],movimentoEncontrado=false,
 modoV2=false,registroV2=null,legacyConfiavel=true
}){
 const id=String(ownerId??'').trim();
 if(!/^PROD-LEGACY-[A-Z0-9]+$/i.test(id))
  return {ok:false,reason:'origem_de_cadastro_nao_suportada'};
 if(!Array.isArray(indices)||indices.length<2||indices.length>10||
    indices.some(x=>!x||String(x.produtoId)!==id))
  return {ok:false,reason:'reserva_ausente_ou_inconsistente'};
 if(!Array.isArray(catalogo)||!Array.isArray(legado)||!legacyConfiavel)
  return {ok:false,reason:'catalogos_nao_confirmados'};
 if(modoV2&&registroV2)return {ok:false,reason:'registro_v2_ja_ocupado_ou_removido'};
 const owners=indices.filter(x=>x.ativo!==false);
 if(owners.length!==indices.length)return {ok:false,reason:'reserva_ja_alterada'};
 const nomes=[...new Set(indices.map(x=>String(x.nome||'').trim()).filter(Boolean).map(norm))];
 const skus=[...new Set(indices.map(x=>String(x.sku||'').trim()).filter(Boolean).map(norm))];
 if(nomes.length!==1||skus.length!==1)
  return {ok:false,reason:'nomes_ou_skus_conflitantes'};
 const nome=String(indices.find(x=>x.nome)?.nome||'').trim();
 const sku=String(indices.find(x=>x.sku)?.sku||'').trim();
 if(!nome||!sku)return {ok:false,reason:'identidade_incompleta'};
 const match=p=>p&&(String(p.id)===id||norm(p.sku)===norm(sku)||norm(p.nome)===norm(nome));
 if(catalogo.some(match)||legado.some(match))return {ok:false,reason:'cadastro_existente_ou_conflitante'};
 if(referenced(vendas,id,sku)||referenced(compras,id,sku)||movimentoEncontrado)
  return {ok:false,reason:'movimentacoes_ou_vendas_existentes'};
 return {ok:true,ownerId:id,sku,nome};
}
