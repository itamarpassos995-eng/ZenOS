import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {obterAdminFirestore} from './firebaseAdmin.js';
import {authorizedOperationalHml,documentosOperacionaisFicticios,operatorHmlPath} from './commerceHmlOperationalCore.js';

// APENAS projeto isolado e proprietário Google verificado; nunca criar loja real.
export const commerceHmlOperationalSeed=onCall({region:'southamerica-east1',timeoutSeconds:30,memory:'256MiB',maxInstances:1},async request=>{
 if(!authorizedOperationalHml(process.env,request.auth))
  throw new HttpsError('permission-denied','Somente o proprietário da homologação isolada pode preparar o PDV fictício.');
 if(!['consultar','preparar'].includes(request.data?.action))
  throw new HttpsError('invalid-argument','Ação de homologação desconhecida.');
 const db=await obterAdminFirestore(),uid=request.auth.uid,root=`lojas/${uid}`;
 const shop=db.doc(root),op=db.doc(root+'/dados/operacao'),
  license=db.doc(root+'/commerce_private/licenca');
 const acl=[db.doc(operatorHmlPath(uid,'admin')),db.doc(operatorHmlPath(uid,'caixa-2'))];
 if(request.data.action==='consultar'){
  const [s,o,l,a,b]=await Promise.all([shop.get(),op.get(),license.get(),acl[0].get(),acl[1].get()]);
  if(!s.exists&&!o.exists&&!l.exists&&!a.exists&&!b.exists)return {preparada:false};
  if(s.data()?.tipo!=='homologacao_operacional'||s.data()?.homologacaoProprietarioUid!==uid||
     !o.exists||!l.exists||!a.exists||!b.exists)
   throw new HttpsError('failed-precondition','A homologação contém registros parciais ou divergentes. Não corrigir automaticamente.');
  return {preparada:true,lojaId:uid};
 }
 if(Object.keys(request.data).sort().join(',')!=='action,pinAdmin,pinSegundo')
  throw new HttpsError('invalid-argument','Parâmetros adicionais não permitidos.');
 let seed;try{seed=documentosOperacionaisFicticios(uid,request.data.pinAdmin,request.data.pinSegundo);}
 catch(e){throw new HttpsError('invalid-argument',e.message);}
 return db.runTransaction(async tx=>{
  const [s,o,l,a,b]=await Promise.all([tx.get(shop),tx.get(op),tx.get(license),tx.get(acl[0]),tx.get(acl[1])]);
  if([s,o,l,a,b].some(snap=>snap.exists))
   throw new HttpsError('already-exists','Há registros de homologação. Nenhum dado existente será modificado.');
  tx.create(shop,seed.shop);
  tx.create(op,seed.operacao);
  tx.create(license,seed.licenca);
  for(let i=0;i<acl.length;i++)tx.create(acl[i],seed.acessos[i].data);
  return {preparada:true,lojaId:uid};
 });
});
