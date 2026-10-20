// Política conservadora para liberação MANUAL de identidade de cadastro rápido
// com confirmação perdida. Não autoriza excluir produto, estoque ou histórico.
export function avaliarLiberacaoOrfaoPDV({ownerId,sku,indices=[],atual=[],legado=null,vendas=[],compras=[],temAuditoria=false,agora=Date.now()}){
 const id=String(ownerId||''),codigo=String(sku||'').trim();
 if(!id.startsWith('PROD-BALCAO-')||!codigo)return {ok:false,motivo:'identidade_pdv_invalida'};
 if(!Array.isArray(atual)||!Array.isArray(legado)||!Array.isArray(indices))return {ok:false,motivo:'fonte_autoritativa_ou_legada_indisponivel'};
 if(!indices.length||indices.length>10)return {ok:false,motivo:'indices_incompletos'};
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const usados=indices.filter(x=>x.ativo!==false);
 if(!usados.length||indices.some(x=>String(x.produtoId||'')!==id))
  return {ok:false,motivo:'proprietario_mudou'};
 if(!usados.some(x=>norm(x.sku)===norm(codigo)))return {ok:false,motivo:'sku_nao_corresponde'};
 if(usados.some(x=>!Number.isFinite(Date.parse(x.updatedAt))||agora-Date.parse(x.updatedAt)<10*60*1000))
  return {ok:false,motivo:'indice_recente_ou_sem_data'};
 const assinaturas=new Set(usados.map(x=>norm(x.nome)).filter(Boolean));
 const colide=p=>p&&(String(p.id)===id||norm(p.sku)===norm(codigo)||assinaturas.has(norm(p.nome)));
 if(atual.some(colide)||legado.some(colide))return {ok:false,motivo:'cadastro_existe_em_alguma_fonte'};
 const referenced=list=>list.some(doc=>doc&&(
  String(doc.produtoId??'')===id||
  (Array.isArray(doc.itens)&&doc.itens.some(it=>it&&
    [it.id,it.produtoId,it.produtoOriginalId].some(v=>v!=null&&String(v)===id)))
 ));
 if(referenced(vendas)||referenced(compras)||temAuditoria)
  return {ok:false,motivo:'historico_estoque_ou_vendas_vinculado'};
 return {ok:true,ownerId:id};
}
