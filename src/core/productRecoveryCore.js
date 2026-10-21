// Classifica o ID original sem escolher produtos por semelhança ou inventar estoque.
// O documento V1 e eventual tombstone V2 servem só como evidência.
export function classificarCadastroOculto({ownerId,catalogoAtual,catalogoLegado=null,indices=[],registroV2=null,modoV2=false}){
 const id=String(ownerId||'').trim();
 if(!id||!Array.isArray(catalogoAtual)||!Array.isArray(indices))
  return {status:'inconclusivo',reason:'fontes_invalidas',ownerId:id};
 const idx=indices.filter(x=>String(x?.produtoId||'')===id);
 if(!idx.length)return {status:'inconclusivo',reason:'indices_do_id_nao_encontrados',ownerId:id};
 if(indices.length!==idx.length)return {status:'conflito',reason:'indice_de_outro_proprietario',ownerId:id};
 const atuais=catalogoAtual.filter(p=>p&&String(p.id)===id);
 const antigos=Array.isArray(catalogoLegado)?catalogoLegado.filter(p=>p&&String(p.id)===id):[];
 const dados=(p)=>p?{nome:p.nome||'',sku:p.sku||'',ativo:p.ativo!==false,estoque:p.estoque??null,
  estoqueVitrine:p.estoqueVitrine??null,estoqueGalpao:p.estoqueGalpao??null,precoBRL:p.precoBRL??null}:null;
 const resumo={ownerId:id,indices:idx.length,indicesAtivos:idx.filter(x=>x.ativo!==false).length,
  produtoLegado:antigos.length===1?dados(antigos[0]):null,v2Deleted:modoV2?registroV2?.deleted===true:null};
 if(atuais.length>1||antigos.length>1)return {...resumo,status:'conflito',reason:'id_duplicado'};
 if(atuais.length===1){
  const p=atuais[0];
  const otherSKU=catalogoAtual.some(x=>x&&String(x.id)!==id&&String(x.sku||'').trim().toUpperCase()===String(p.sku||'').trim().toUpperCase()&&String(p.sku||'').trim());
  if(otherSKU)return {...resumo,status:'conflito',reason:'sku_em_mais_de_um_cadastro'};
  return {...resumo,status:p.ativo===false?'original_inativo':'original_ativo',
   produto:dados(p),produtoAtual:p};
 }
 if(modoV2&&registroV2?.deleted===false&&registroV2?.data?.id!=null)
  return {...resumo,status:'divergencia_v2',reason:'documento_v2_existe_mas_nao_esta_na_lista'};
 if(modoV2&&registroV2?.deleted===true)
  return {...resumo,status:'removido_v2',reason:'tombstone_v2_exige_revisao'};
 if(antigos.length===1)return {...resumo,status:'somente_legado',reason:'registro_historico_nao_e_saldo_atual'};
 return {...resumo,status:resumo.indicesAtivos?'indice_sem_cadastro':'indice_inativo_sem_cadastro',
  reason:'apenas_reserva_de_identidade'};
}

export function prepararReativacaoOriginal({diagnostico,catalogo,ownerId}){
 const id=String(ownerId||'');
 if(diagnostico?.status!=='original_inativo'||String(diagnostico.ownerId)!==id||
  diagnostico.indicesAtivos<1||!Array.isArray(catalogo))
  return {ok:false,reason:'original_nao_confirmado'};
 const found=catalogo.filter(p=>p&&String(p.id)===id);
 if(found.length!==1||found[0].ativo!==false)
  return {ok:false,reason:'original_alterado_ou_duplicado'};
 const current=found[0],sku=String(current.sku||'').trim().toUpperCase();
 if(!sku)return {ok:false,reason:'sku_original_ausente'};
 if(catalogo.some(p=>p&&String(p.id)!==id&&String(p.sku||'').trim().toUpperCase()===sku))
  return {ok:false,reason:'sku_em_outro_produto'};
 const updated={...current,ativo:true,reativadoEm:new Date().toISOString()};
 const next=catalogo.map(p=>p===current?updated:p);
 return {ok:true,antes:current,depois:updated,lista:next};
}
