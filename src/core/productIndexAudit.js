import {collection,getDocsFromServer,query,limit} from 'firebase/firestore';
import {getOperationalSnapshot} from './operationalRepository.js';

// Auditoria sob demanda, sem escritas e com limite de custo.
// Não recupera estoques ausentes e não autoriza criar produtos substitutos.
export const MAX_PRODUCT_INDEX_AUDIT_READS = 2501;

export function compararIndicesCatalogo(indices, catalogo){
 if(!Array.isArray(indices)||!Array.isArray(catalogo)) throw new Error('Dados inválidos para auditoria.');
 const registrosPorId=new Map();
 for(const p of catalogo){
  if(!p||p.id==null)continue;
  const k=String(p.id);
  const registros=registrosPorId.get(k)||[];
  registros.push(p);
  registrosPorId.set(k,registros);
 }
 const indicePorDono=new Map();
 for(const item of indices){
  if(!item||item.ativo===false||!item.produtoId)continue;
  const id=String(item.produtoId);
  if(!indicePorDono.has(id))indicePorDono.set(id,{produtoId:id,nomes:new Set(),skus:new Set(),indices:0});
  const dono=indicePorDono.get(id);
  if(item.nome)dono.nomes.add(String(item.nome));
  if(item.sku)dono.skus.add(String(item.sku));
  dono.indices++;
 }
 const resultado={ausentes:[],inativos:[],duplicados:[],ativos:0,totalIndicesAtivos:0};
 for(const dono of indicePorDono.values()){
  const info={produtoId:dono.produtoId,nomes:[...dono.nomes],skus:[...dono.skus],indices:dono.indices};
  resultado.totalIndicesAtivos+=dono.indices;
  const registros=registrosPorId.get(dono.produtoId)||[];
  if(!registros.length)resultado.ausentes.push(info);
  else if(registros.length>1)resultado.duplicados.push(info);
  else if(registros[0].ativo===false)resultado.inativos.push(info);
  else resultado.ativos++;
 }
 for(const grupo of [resultado.ausentes,resultado.inativos,resultado.duplicados])
  grupo.sort((a,b)=>a.produtoId.localeCompare(b.produtoId));
 return resultado;
}

export async function auditarIndicesProdutosServidor({db,userId}){
 if(!db||!userId)throw new Error('Loja não identificada.');
 // Snapshot da coleção é limitado: com >2500 documentos a auditoria é inconclusiva.
 const [snap,catalogSnap]=await Promise.all([
  getDocsFromServer(query(collection(db,'lojas',String(userId),'produto_indices'),limit(MAX_PRODUCT_INDEX_AUDIT_READS))),
  getOperationalSnapshot(db,userId)
 ]);
 if(snap.size>=MAX_PRODUCT_INDEX_AUDIT_READS)
  return {status:'incomplete',readCount:snap.size,reason:'index_limit'};
 if(!catalogSnap.exists()||!Array.isArray(catalogSnap.data()?.produtos))
  return {status:'unknown',readCount:snap.size,reason:'catalog_unavailable'};
 const data=compararIndicesCatalogo(snap.docs.map(d=>d.data()),catalogSnap.data().produtos);
 return {status:'complete',readCount:snap.size,catalogCount:catalogSnap.data().produtos.length,...data};
}
