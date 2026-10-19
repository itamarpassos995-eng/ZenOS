import {doc,getDocFromServer} from 'firebase/firestore';
import {getOperationalSnapshot} from './operationalRepository.js';
import {chavesUnicidadeProduto} from './productRegistry.js';

const normalized = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

/** Somente leitura do catálogo autoritativo; jamais cria itens ou ajusta saldo. */
export async function localizarProdutoExistenteServidor({db,userId,produto}){
 if(!db||!userId||!produto?.nome) return {status:'unknown',reason:'invalid_input'};
 try{
  const keys=chavesUnicidadeProduto(produto);
  const [indexSnaps,snap]=await Promise.all([
   Promise.all(keys.map(key=>getDocFromServer(doc(db,'lojas',String(userId),'produto_indices',key)))),
   getOperationalSnapshot(db,userId),
  ]);
  if(!snap.exists())return {status:'unknown',reason:'catalog_not_found'};
  const catalog=snap.data()?.produtos;
  if(!Array.isArray(catalog))return {status:'unknown',reason:'catalog_missing'};
  const owners=new Set(indexSnaps.filter(s=>s.exists()&&s.data()?.ativo!==false).map(s=>String(s.data()?.produtoId||'')).filter(Boolean));
  const indexed=catalog.filter(p=>p&&owners.has(String(p.id)));
  if(indexed.length===1)return {status:'found',produto:indexed[0],catalog,source:'index'};
  if(indexed.length>1)return {status:'conflict',reason:'multiple_index_owners'};
  // Sem SKU: pesquisa por nome exato normalizado, sem adivinhar qual pneu é.
  const name=normalized(produto.nome);
  const nameMatches=catalog.filter(p=>p&&normalized(p.nome)===name);
  if(nameMatches.length===1 && !owners.size)
   return {status:'found',produto:nameMatches[0],catalog,source:'exact_name'};
  if(nameMatches.length>1)return {status:'conflict',reason:'ambiguous_name'};
  if(owners.size)return {status:'orphan_index',reason:'index_without_catalog_record'};
  return {status:'not_found',reason:'no_matching_record'};
 }catch(error){return {status:'unknown',reason:'server_unavailable',code:String(error?.code||'unknown')};}
}
