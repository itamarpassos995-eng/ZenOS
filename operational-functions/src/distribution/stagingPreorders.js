import {FieldValue} from 'firebase-admin/firestore';
import {error,hash,id} from './security.js';

const field='historicoVendas';
const maxCatalog=50;
function productPrice(product){
 const value=product?.valoresMonetarios?.campos?.precoVenda;
 return value?.moeda==='PYG'&&Number.isSafeInteger(value.valor)&&value.valor>0?value.valor:null;
}
// The test PDV consumes a BRL-priced view, while the canonical catalog stores PYG.
// This projection is response-only; the stored product and its original currency stay unchanged.
export function projectStagingCatalogProduct(product,rate){
 const price=productPrice(product);
 if(price==null||!(Number.isFinite(rate)&&rate>0))return null;
 return {...product,precoBRL:Math.round(price/rate*100)/100};
}
export function buildStagingPreorders({db,ctx,authorize,now}){
 return async function stagingPreorder(uid,session,input){
  return db.runTransaction(async tx=>{
   const c=await ctx(tx,uid),actor=await authorize(tx,uid,session,c,'pdv');
   const [tenant,rateSale]=await tx.getAll(db.doc(c.root),db.doc(c.base+'/vendas/O001'));
   if(tenant.data()?.synthetic!==true||c.config.pilotProfile!=='PYG_CREDIT_CASH_V1')error('FORBIDDEN');
   // Use the original PYG fixture quote in both the cart and the writer.
   const quote=rateSale.data()?.data;
   const ratio=Number(quote?.totalOriginal)/Number(quote?.totalBRL);
   const rate=quote?.taxasCambio?.PYG??(Number.isSafeInteger(ratio)&&quote?.moedaDocumento==='PYG'?ratio:null);
   if(rateSale.data()?.deleted||!/^\d+(\.\d{1,8})?$/.test(String(rate))||!(Number(rate)>0))error('PAYMENT_RATE_REQUIRED');
   const rates={BRL:1,PYG:Number(rate)};
   if(input?.type==='catalog'){
    const [products,customers]=await Promise.all(['produtos','clientes'].map(name=>tx.get(db.collection(c.base+'/'+name).limit(maxCatalog+1))));
    if(products.size>maxCatalog||customers.size>maxCatalog)error('STAGING_CATALOG_LIMIT');
    const data=q=>q.docs.filter(s=>!s.data().deleted).map(s=>s.data().data);
    return {actor:{operatorId:actor.operatorId,name:actor.name},rates,products:data(products).map(p=>projectStagingCatalogProduct(p,rates.PYG)).filter(Boolean),customers:data(customers).map(({id,nome,cidade,endereco})=>({id,nome,cidade:cidade??'',endereco:endereco??''}))};
   }
   if(input?.type!=='create'||!/^pdv:PRÉ-PEDIDO-\d{13}-[a-z0-9]{6}$/u.test(input.key||'')||!Array.isArray(input.lines)||!input.lines.length||input.lines.length>20)error('INVALID_COMMAND');
   const orderId=input.key.slice(4),receiptId=hash(input.key);
   const orderRef=db.doc(c.base+'/vendas/'+id(orderId)),receiptRef=db.doc(c.base+'/operations/'+receiptId);
   const lines=input.lines.map(({productId,quantity})=>{
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999)error('INVALID_QUANTITY');
    return {productId:id(productId),quantity};
   });
   if(new Set(lines.map(l=>l.productId)).size!==lines.length)error('DUPLICATE_LINE');
   const fingerprint=hash({customerId:input.customerId,lines,totalOriginal:input.totalOriginal,pygRate:input.pygRate,operatorId:actor.operatorId});
   const [prior,order,customer,...products]=await tx.getAll(receiptRef,orderRef,db.doc(c.base+'/clientes/'+id(input.customerId)),...lines.map(l=>db.doc(c.base+'/produtos/'+l.productId)));
   if(prior.exists){
    if(prior.data().fingerprint!==fingerprint)error('IDEMPOTENCY_CONFLICT');
    return {sale:prior.data().patches[0].data,replayed:true};
   }
   if(order.exists)error('ORDER_ALREADY_EXISTS');
   if(!customer.exists||customer.data().deleted)error('CUSTOMER_REQUIRED');
   const items=products.map((snap,index)=>{
    const p=snap.data()?.data,price=productPrice(p),quantity=lines[index].quantity;
    if(!p||snap.data().deleted||price==null||!p.sku||p.usoUnicoEncomendado||p.tipoItem==='servico')error('PRODUCT_NOT_FOUND');
    if(quantity>Number(p.estoqueGalpao??0)-Number(p.estoqueReservadoDistribuicao??0))error('INSUFFICIENT_STOCK');
    const original=price*quantity;
    if(!Number.isSafeInteger(original))error('INVALID_CURRENCY_PRECISION');
    return {id:p.id,sku:p.sku,nome:p.nome,unidadeMedida:p.unidadeMedida||'UN',qtd:quantity,precoPraticadoBRL:Math.round(price/rates.PYG*100)/100,totalBRL:Math.round(original/rates.PYG*100)/100,totalOriginal:original};
   });
   const totalOriginal=items.reduce((sum,item)=>sum+item.totalOriginal,0);
   if(!Number.isSafeInteger(totalOriginal))error('INVALID_CURRENCY_PRECISION');
   if(input.totalOriginal!==totalOriginal||input.pygRate!==rates.PYG)error('ORDER_SNAPSHOT_CHANGED');
   const client=customer.data().data,createdAt=new Date(now()).toISOString();
   const sale={id:orderId,createdAt,tipoDocumento:'pre_pedido',estado:'pendente',clienteId:client.id,clienteNome:client.nome,vendedorId:actor.operatorId,vendedorNome:actor.name,itens:items,moedaDocumento:'PYG',taxasCambio:rates,totalOriginal,totalBRL:Math.round(totalOriginal/rates.PYG*100)/100,pagamentos:[]};
   const sequence=c.head.sequence+1,legacyIndex=c.head.fieldCounts[field];
   const revisions={...c.head.fieldRevisions,[field]:(c.head.fieldRevisions[field]||0)+1};
   const envelope={data:sale,legacyField:field,legacyIndex,version:sequence,deleted:false,commandId:receiptId};
   tx.create(orderRef,envelope);
   tx.create(receiptRef,{schema:2,key:input.key,fingerprint,sequence,revisions,patches:[{field,routeId:orderRef.id,...envelope}],financialEntries:[],createdAtClient:createdAt});
   tx.update(db.doc(c.base),{sequence,fieldRevisions:revisions,fieldCounts:{...c.head.fieldCounts,[field]:legacyIndex+1},lastReceipt:receiptId,updatedAtServer:FieldValue.serverTimestamp()});
   tx.create(db.doc(c.root+'/distribution_audit/'+receiptId),{type:'STAGING_PDV_PREORDER',orderId,operatorId:actor.operatorId,sequence,at:now()});
   return {sale,replayed:false};
  });
 };
}
