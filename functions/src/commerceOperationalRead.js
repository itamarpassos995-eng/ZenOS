import {HttpsError} from 'firebase-functions/v2/https';
// Read-only adapter. Certificate contract mirrors the approved ZenOS router.
// Never migrate, rewrite or silently fall back to V1 after cutover.
export function rotaOperacionalCommerce(c){
 if(c==null||c.mode==='legacy')return null;
 if(!['shadow','v2','maintenance'].includes(c.mode)||!/^[a-f0-9]{24}$/.test(c.generation||''))throw new HttpsError('failed-precondition','Armazenamento da loja precisa ser verificado.');
 if(c.mode==='shadow')return null;
 if(c.mode==='maintenance')throw new HttpsError('failed-precondition','Loja temporariamente em manutenção.');
 const cert=c.certificate;
 if(!cert||!c.sourceChecksum||cert.sourceChecksum!==c.sourceChecksum||!['productionReady','v1WritersFenced','finalReconciliationPassed','pdvIntegrationPassed','rollbackPrepared'].every(k=>cert[k]===true))throw new HttpsError('failed-precondition','Armazenamento V2 ainda não certificado.');
 return c.generation;
}
const encode=id=>encodeURIComponent(String(id)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
export async function lerProdutosCommerce(db,lojaId,tx,{ids=null}={}){
 const control=await tx.get(db.doc(`lojas/${lojaId}/dados/storage_control`));
 const c=control.exists?control.data():null,generation=rotaOperacionalCommerce(c);
 if(!generation){
  const op=await tx.get(db.doc(`lojas/${lojaId}/dados/operacao`));
  if(!op.exists||!Array.isArray(op.data()?.produtos))throw new HttpsError('failed-precondition','Cadastro da loja indisponível.');
  return ids?op.data().produtos.filter(p=>ids.includes(String(p?.id))):op.data().produtos;
 }
 const root=`lojas/${lojaId}/v2_generations/${generation}`,head=await tx.get(db.doc(root)),h=head.data();
 if(!head.exists||h.schema!==2||h.state!=='ready'||h.sourceChecksum!==c.sourceChecksum||h.fieldManifest?.produtos?.kind!=='array'||h.fieldManifest.produtos.collection!=='produtos')throw new HttpsError('failed-precondition','Catálogo V2 não certificado.');
 let docs;
 if(ids){
  const unicos=[...new Set(ids.map(String))];
  if(unicos.length>3000)throw new HttpsError('resource-exhausted','Catálogo excede o limite desta versão.');
  docs=await Promise.all(unicos.map(id=>tx.get(db.doc(`${root}/produtos/${encode(id)}`))));
 }else{
  const snap=await tx.get(db.collection(`${root}/produtos`).limit(3001));docs=snap.docs;
  if(docs.length>3000)throw new HttpsError('resource-exhausted','Catálogo exige paginação adicional.');
 }
 const result=[];
 for(const d of docs){
  if(!d.exists)continue;const v=d.data();
  if(v.legacyField!=='produtos'||!v.data||v.data.id==null||encode(v.data.id)!==d.id)throw new HttpsError('failed-precondition','Identidade de produto V2 inválida.');
  if(!v.deleted)result.push(v.data);
 }
 if(!ids){const count=h.fieldCounts?.produtos??h.fieldManifest.produtos.count;if(!Number.isSafeInteger(count)||result.length!==count)throw new HttpsError('failed-precondition','Catálogo V2 incompleto.');}
 return result;
}
export const consultarProdutosCommerce=(db,lojaId,opts)=>db.runTransaction(tx=>lerProdutosCommerce(db,lojaId,tx,opts));
