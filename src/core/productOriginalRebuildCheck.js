import {collection,doc,getDocFromServer,getDocsFromServer,query,where,limit} from 'firebase/firestore';
import {getOperationalSnapshot,peekV2Session} from './operationalRepository.js';
import {v2RootPath,encodeV2Id} from './operationalV2Schema.js';
import {chaveAuditoriaProduto} from './productIdentity.js';
import {avaliarRecomposicaoOriginal,idOriginalRecomponivel} from './productOriginalRebuildPolicy.js';

// Confere apenas o ID selecionado, nunca varre o estoque a cada clique.
// Identidade original é preservada. Sem gravar, apagar ou reconstruir saldos históricos.
export async function verificarRecomposicaoOriginal({db,userId,ownerId}){
 const id=String(ownerId??'').trim();
 if(!db||!userId||!idOriginalRecomponivel(id))
  return {ok:false,reason:'identificacao_invalida'};
 try{
  const snapshot=await getOperationalSnapshot(db,userId);
  const current=snapshot.exists()?snapshot.data():null;
  if(!Array.isArray(current?.produtos))return {ok:false,reason:'catalogo_nao_confirmado'};
  const owned=await getDocsFromServer(query(collection(db,'lojas',String(userId),'produto_indices'),
   where('produtoId','==',id),limit(11)));
  if(owned.empty||owned.size>10)return {ok:false,reason:'indices_nao_confirmados'};
  const indices=owned.docs.map(d=>({key:d.id,...d.data()}));
  const sku=indices.find(x=>x.sku)?.sku||'';
  const v2=peekV2Session(db,userId);
  const legacyRef=doc(db,'lojas',String(userId),'dados','operacao');
  const [v1Snap,v2Snap,auditA,auditB]=await Promise.all([
   v2?getDocFromServer(legacyRef):Promise.resolve(snapshot),
   v2?getDocFromServer(doc(db,...v2RootPath(userId,v2.generation),'produtos',encodeV2Id(id))):Promise.resolve(null),
   getDocsFromServer(query(collection(db,'lojas',String(userId),'estoque_auditoria',chaveAuditoriaProduto(id,sku),'movimentos'),limit(1))),
   getDocsFromServer(query(collection(db,'lojas',String(userId),'estoque_auditoria',id,'movimentos'),limit(1)))
  ]);
  const legacy=v1Snap?.exists()?v1Snap.data():null;
  // Se a evidência legada não estiver disponível, nunca liberar reconstituição.
  if(!Array.isArray(legacy?.produtos)||!Array.isArray(legacy?.historicoVendas)||!Array.isArray(legacy?.historicoCompras))
   return {ok:false,reason:'fonte_historica_incompleta'};
  if(!Array.isArray(current.historicoVendas)||!Array.isArray(current.historicoCompras))
   return {ok:false,reason:'movimentacoes_incompletas'};
  const policy=avaliarRecomposicaoOriginal({
   ownerId:id,indices,catalogo:current.produtos,legado:legacy.produtos,
   vendas:[...current.historicoVendas,...legacy.historicoVendas],
   compras:[...current.historicoCompras,...legacy.historicoCompras],
   movimentoEncontrado:!auditA.empty||!auditB.empty,
   modoV2:!!v2,registroV2:v2Snap?.exists()?v2Snap.data():null
  });
  if(!policy.ok)return policy;
  return {...policy,catalogCount:current.produtos.length};
 }catch(error){
  return {ok:false,reason:'servidor_indisponivel',code:error?.code||'unknown'};
 }
}
