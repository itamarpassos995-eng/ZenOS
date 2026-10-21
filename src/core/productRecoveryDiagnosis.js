import {collection,doc,getDocFromServer,getDocsFromServer,query,where,limit} from 'firebase/firestore';
import {getOperationalSnapshot,peekV2Session} from './operationalRepository.js';
import {v2RootPath,encodeV2Id} from './operationalV2Schema.js';
import {classificarCadastroOculto} from './productRecoveryCore.js';

// Diagnóstico por ID original, em clique explícito da gerência.
// Até 11 índices + 1 V1 + 1 V2; não escreve nem varre milhares de documentos.
export async function diagnosticarCadastroOcultoServidor({db,userId,ownerId}){
 const id=String(ownerId||'').trim();
 if(!db||!userId||!id||id.length>512)return {status:'inconclusivo',reason:'identificacao_invalida'};
 try{
  const snapshot=await getOperationalSnapshot(db,userId);
  if(!snapshot.exists()||!Array.isArray(snapshot.data()?.produtos))
   return {status:'inconclusivo',ownerId:id,reason:'catalogo_atual_indisponivel'};
  const indices=await getDocsFromServer(query(collection(db,'lojas',String(userId),'produto_indices'),
    where('produtoId','==',id),limit(12)));
  if(indices.size>=12)return {status:'inconclusivo',ownerId:id,reason:'indices_em_excesso'};
  const sessaoV2=peekV2Session(db,userId);
  let legado=null,registroV2=null,legacyReadStatus='not_required',v2ReadStatus='not_required';
  if(sessaoV2){
   const [v1,v2]=await Promise.allSettled([
    getDocFromServer(doc(db,'lojas',String(userId),'dados','operacao')),
    getDocFromServer(doc(db,...v2RootPath(userId,sessaoV2.generation),'produtos',encodeV2Id(id)))
   ]);
   if(v1.status==='fulfilled'&&v1.value.exists()&&Array.isArray(v1.value.data()?.produtos)){
    legado=v1.value.data().produtos;legacyReadStatus='available';
   }else legacyReadStatus='unavailable';
   if(v2.status==='fulfilled'){
    registroV2=v2.value.exists()?v2.value.data():null;
    v2ReadStatus=v2.value.exists()?'available':'not_found';
   }else v2ReadStatus='unavailable';
   // Sem evidência V2 íntegra, não classificar reativação como segura.
   if(v2ReadStatus==='unavailable')
    return {status:'inconclusivo',ownerId:id,reason:'leitura_v2_nao_confirmada'};
  }
  const result=classificarCadastroOculto({
   ownerId:id,catalogoAtual:snapshot.data().produtos,
   catalogoLegado:legado,indices:indices.docs.map(x=>x.data()),
   registroV2,modoV2:!!sessaoV2
  });
  return {...result,legacyReadStatus,v2ReadStatus,
    catalogCount:snapshot.data().produtos.length};
 }catch(error){
  return {status:'inconclusivo',ownerId:id,reason:'servidor_indisponivel',code:error?.code||'unknown'};
 }
}
