import { doc, runTransaction, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { notifyPersistenceStatus } from './persistenceSafety';

const norm = (v='') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const hash = (s='') => { let h=2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619); } return (h>>>0).toString(36); };
export const assinaturaLogicaProduto = (p={}) => norm([p.nome,p.marca||p.fornecedor,p.unidadeMedida||'UN'].join('|'));
export const chavesUnicidadeProduto = (p={}) => {
  const sku = norm(p.sku);
  const assinatura = assinaturaLogicaProduto(p);
  return [sku ? `sku_${hash(sku)}` : null, assinatura ? `sig_${hash(assinatura)}` : null].filter(Boolean);
};
export async function reservarIdentidadeProduto({db,userId,produto,produtoAnterior=null}){
  if(!db||!userId) return;
  const novas=chavesUnicidadeProduto(produto);
  const antigas=new Set(chavesUnicidadeProduto(produtoAnterior||{}));
  const refsNovas=novas.map(chave=>({chave,ref:doc(db,'lojas',userId,'produto_indices',chave)}));
  await runTransaction(db, async tx=>{
    // Firestore exige TODAS as leituras antes da primeira escrita.
    const leituras=[];
    for(const item of refsNovas){ leituras.push({item,snap:await tx.get(item.ref)}); }

    for(const {item,snap} of leituras){
      if(!snap.exists()) continue;
      const d=snap.data();
      const mesmo=String(d.produtoId||'')===String(produtoAnterior?.id||produto.id||'');
      if(!mesmo && d.ativo!==false){
        const e=new Error(`Já existe um produto semelhante cadastrado (${d.sku||d.nome||item.chave}). Abra o cadastro existente em vez de duplicar.`);
        e.code='ZENOS_PRODUTO_DUPLICADO';
        throw e;
      }
    }

    const agora=new Date().toISOString();
    for(const {ref} of refsNovas){
      tx.set(ref,{produtoId:produto.id,sku:produto.sku||'',nome:produto.nome||'',ativo:true,updatedAt:agora,updatedAtServer:serverTimestamp()},{merge:true});
    }
    for(const chave of antigas){
      if(!novas.includes(chave)){
        const ref=doc(db,'lojas',userId,'produto_indices',chave);
        tx.set(ref,{ativo:false,liberadoEm:agora,updatedAtServer:serverTimestamp()},{merge:true});
      }
    }
  });
}
export async function liberarIdentidadeProduto({db,userId,produto}){
  if(!db||!userId||!produto) return;
  notifyPersistenceStatus({status:'SALVANDO',field:'produto_indices'});
  try {
    for(const chave of chavesUnicidadeProduto(produto)) await deleteDoc(doc(db,'lojas',userId,'produto_indices',chave));
    notifyPersistenceStatus({status:'SINCRONIZADO',field:'produto_indices'});
  } catch(error) {
    notifyPersistenceStatus({status:'ERRO',field:'produto_indices',error:error?.message||String(error)});
    throw error;
  }
}
