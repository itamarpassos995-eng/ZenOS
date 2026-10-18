import {HttpsError} from 'firebase-functions/v2/https';
import {rotaOperacionalCommerce,lerProdutosCommerce} from './commerceOperationalRead.js';
import {resumoLicencaCommerce} from './commerceStudioCore.js';

async function lerVenda(db,tx,lojaId,vendaId){
 const control=await tx.get(db.doc(`lojas/${lojaId}/dados/storage_control`));
 const generation=rotaOperacionalCommerce(control.exists?control.data():null);
 if(!generation){
  const snap=await tx.get(db.doc(`lojas/${lojaId}/dados/operacao`));
  const sales=(snap.data()?.historicoVendas||[]).filter(v=>v.id===vendaId);
  if(sales.length>1)throw new HttpsError('failed-precondition','Identidade de venda duplicada. Solicite conferência.');
  return sales[0]||null;
 }
 const root=`lojas/${lojaId}/v2_generations/${generation}`;
 const head=await tx.get(db.doc(root)),h=head.data();
 if(!head.exists||h.schema!==2||h.state!=='ready'||h.sourceChecksum!==control.data().sourceChecksum||
   h.fieldManifest?.historicoVendas?.kind!=='array'||h.fieldManifest.historicoVendas.collection!=='vendas')
  throw new HttpsError('failed-precondition','Histórico V2 ainda não certificado.');
 const snap=await tx.get(db.doc(`${root}/vendas/${encodeURIComponent(vendaId)}`));
 if(!snap.exists)return null;
 const v=snap.data();
 if(v.legacyField!=='historicoVendas'||v.data?.id!==vendaId||v.deleted)
  throw new HttpsError('failed-precondition','Venda removida ou identidade inválida. Solicite conferência.');
 return v.data;
}

export async function atenderPedidoPDV(db,{lojaId,operadorUid,id,confirmar=false}){
 if(!/^[a-f0-9]{32}$/.test(id||''))throw new HttpsError('invalid-argument','Pedido inválido.');
 return db.runTransaction(async tx=>{
  const orderRef=db.doc(`lojas/${lojaId}/commerce_pedidos/${id}`),vendaId=`COMMERCE-${id}`;
  const [snap,license,marker]=await Promise.all([tx.get(orderRef),tx.get(db.doc(`lojas/${lojaId}/commerce_private/licenca`)),tx.get(db.doc(`lojas/${lojaId}/commerce_faturamentos/${id}`))]);
  if(!resumoLicencaCommerce(license.data()).ativo)throw new HttpsError('permission-denied','Módulo Commerce não autorizado.');
  if(!snap.exists)throw new HttpsError('not-found','Pedido não encontrado.');
  const p=snap.data(),sale=await lerVenda(db,tx,lojaId,vendaId);
  if(sale||marker.exists){
   if(!sale||!marker.exists||marker.data().vendaId!==vendaId||sale.commercePedidoId!==id||sale.origem!=='commerce'||sale.tipoDocumento!=='venda')
    throw new HttpsError('failed-precondition','Vínculo financeiro precisa de conferência. Não refature este pedido.');
   tx.update(orderRef,{status:'encerrado',vendaId,faturadoEm:sale.createdAt,atualizadoEm:new Date().toISOString()});
   return {faturado:true,vendaId,lojaId,pedidoId:id};
  }
  if(confirmar)throw new HttpsError('failed-precondition','Venda ainda não confirmada no servidor. O pedido continua em atendimento.');
  if(['cancelado','encerrado'].includes(p.status))throw new HttpsError('failed-precondition','Pedido já encerrado.');
  if(p.pdv?.operadorUid&&p.pdv.operadorUid!==operadorUid)throw new HttpsError('failed-precondition','Outro operador está atendendo este pedido no PDV.');
  const produtos=await lerProdutosCommerce(db,lojaId,tx,{ids:p.itens.map(i=>String(i.produtoId))});
  for(const item of p.itens){
   const matches=produtos.filter(prod=>String(prod.id)===String(item.produtoId));
   if(matches.length!==1||matches[0].usoUnicoEncomendado||matches[0].tipoItem==='servico')
    throw new HttpsError('failed-precondition','Produto original indisponível. Confira o pedido antes de atender.');
  }
  const preparadoEm=p.pdv?.preparadoEm||new Date().toISOString();
  tx.update(orderRef,{status:'em_atendimento',pdv:{operadorUid,vendaId,preparadoEm},atualizadoEm:new Date().toISOString()});
  // No images or customer UID. The operational records are never written here.
  return {faturado:false,lojaId,pedidoId:id,vendaId,preparadoEm,clienteNome:p.cliente.nome,
   itens:p.itens.map(i=>({produtoId:i.produtoId,quantidade:i.quantidade,precoUnitarioCentavos:i.precoUnitarioCentavos}))};
 });
}
