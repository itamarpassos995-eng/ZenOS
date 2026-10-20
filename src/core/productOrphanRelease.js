import {doc,collection,query,where,limit,getDocFromServer,getDocsFromServer,runTransaction,serverTimestamp} from 'firebase/firestore';
import {getOperationalSnapshot,peekV2Session} from './operationalRepository.js';
import {v2ControlPath,v2RootPath,encodeV2Id} from './operationalV2Schema.js';
import {chaveAuditoriaProduto} from './productIdentity.js';
import {avaliarLiberacaoOrfaoPDV} from './productOrphanReleaseCore.js';

// Nunca apagar índices: arquivar o bloqueio órfão preservando o ID original
// e a data para auditoria. A operação NUNCA recadastra produtos automaticamente.
export async function liberarIndiceOrfaoPDV({db,userId,sku,ownerId,operadorId}){
 if(!db||!userId||!operadorId)return {status:'blocked',reason:'unauthorized'};
 const base=['lojas',String(userId)];
 const id=String(ownerId||'');
 if(!id.startsWith('PROD-BALCAO-'))return {status:'blocked',reason:'not_a_pdv_identity'};
 try {
  const snapshot=await getOperationalSnapshot(db,userId);
  if(!snapshot.exists()||!Array.isArray(snapshot.data()?.produtos))return {status:'blocked',reason:'catalog_unavailable'};
  const atual=snapshot.data();
  const indicesSnaps=await getDocsFromServer(query(collection(db,...base,'produto_indices'),where('produtoId','==',id),limit(11)));
  if(indicesSnaps.size===0||indicesSnaps.size>10)return {status:'blocked',reason:'owner_indices_missing_or_excessive'};
  const indices=indicesSnaps.docs.map(d=>({key:d.id,...d.data()}));
  const v2=peekV2Session(db,userId);
  const v1Ref=doc(db,...base,'dados','operacao');
  const [historico,v2Control,v2Head,v2Product,audit1,audit2]=await Promise.all([
   getDocFromServer(v1Ref),
   v2?getDocFromServer(doc(db,...v2ControlPath(userId))):Promise.resolve(null),
   v2?getDocFromServer(doc(db,...v2RootPath(userId,v2.generation))):Promise.resolve(null),
   v2?getDocFromServer(doc(db,...v2RootPath(userId,v2.generation),'produtos',encodeV2Id(id))):Promise.resolve(null),
   getDocsFromServer(query(collection(db,...base,'estoque_auditoria',chaveAuditoriaProduto(id,sku),'movimentos'),limit(1))),
   getDocsFromServer(query(collection(db,...base,'estoque_auditoria',id,'movimentos'),limit(1))),
  ]);
  if(!historico.exists()||!Array.isArray(historico.data()?.produtos))
   return {status:'blocked',reason:'legacy_catalog_unavailable'};
  if(v2&&(!v2Head?.exists()||v2Product?.exists()||v2Control?.data()?.generation!==v2.generation
   ||Number(v2Head.data()?.sequence)!==v2.sequence))
   return {status:'blocked',reason:'v2_original_or_generation_changed'};
  const avaliar=origem=>avaliarLiberacaoOrfaoPDV({
    ownerId:id,sku,indices:origem,atual:atual.produtos,legado:historico.data().produtos,
    vendas:[...(atual.historicoVendas||[]),...(historico.data().historicoVendas||[])],
    compras:[...(atual.historicoCompras||[]),...(historico.data().historicoCompras||[])],
    temAuditoria:!audit1.empty||!audit2.empty,
  });
  const pre=avaliar(indices);
  if(!pre.ok)return {status:'blocked',reason:pre.motivo};
  // A transação revalida todos os índices contra mudanças concorrentes.
  // V1 lê a coleção operacional; V2 lê a geração, seu documento original e
  // controle de rota, impedindo liberar durante um novo commit.
  const refs=indicesSnaps.docs.map(d=>d.ref);
  await runTransaction(db,async tx=>{
    const snaps=[];
    const checkRefs=[v1Ref,...(v2?[doc(db,...v2ControlPath(userId)),
      doc(db,...v2RootPath(userId,v2.generation)),
      doc(db,...v2RootPath(userId,v2.generation),'produtos',encodeV2Id(id))]:[]),...refs];
    for(const ref of checkRefs)snaps.push(await tx.get(ref));
    const legacy=snaps[0];
    if(!legacy.exists()||!Array.isArray(legacy.data()?.produtos))
      throw new Error('Catálogo legado não confirmado na transação.');
    if(v2){
      if(snaps[1].data()?.generation!==v2.generation||
        Number(snaps[2].data()?.sequence)!==v2.sequence||snaps[3].exists())
        throw new Error('Geração V2 mudou. Nenhum índice foi liberado.');
    }
    const indexedSnaps=snaps.slice(v2?4:1);
    const atuaisIndice=indexedSnaps.map((s,i)=>s.exists()?{key:refs[i].id,...s.data()}:null);
    if(atuaisIndice.some(x=>!x))throw new Error('Índice alterado em outro terminal.');
    for(let i=0;i<indices.length;i++){
      if(JSON.stringify({...indices[i],key:undefined})!==JSON.stringify({...atuaisIndice[i],key:undefined}))
       throw new Error('Índice recebeu nova alteração; operação cancelada.');
    }
    const policy=avaliarLiberacaoOrfaoPDV({
     ownerId:id,sku,indices:atuaisIndice,atual:atual.produtos,legado:legacy.data().produtos,
     vendas:[...(atual.historicoVendas||[]),...(legacy.data().historicoVendas||[])],
     compras:[...(atual.historicoCompras||[]),...(legacy.data().historicoCompras||[])],
     temAuditoria:!audit1.empty||!audit2.empty,
    });
    if(!policy.ok)throw new Error('Verificação de integridade bloqueou liberação: '+policy.motivo);
    const agora=new Date().toISOString();
    for(let i=0;i<refs.length;i++){
      if(atuaisIndice[i].ativo===false)continue; // preservar auditoria das reservas já inativadas
      tx.set(refs[i],{
        ativo:false,liberadoEm:agora,liberadoPor:String(operadorId),
        motivoLiberacao:'indice_orfao_cadastro_pdv_confirmado',
        produtoIdOriginal:id,updatedAtServer:serverTimestamp(),
      },{merge:true});
    }
  });
  return {status:'released',ownerId:id,indices:indices.length};
 }catch(error){
  return {status:'blocked',reason:error?.code||error?.message||'server_unavailable'};
 }
}
