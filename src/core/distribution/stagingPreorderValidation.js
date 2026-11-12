// Preview-only, pure validation of the synthetic PDV contract. No Firestore reads or writes.
// The distribution server remains the sole authority for catalog, price, stock and idempotency.
const failure=(code,message)=>({ok:false,code,message});
export const STAGING_PREORDER_ERRORS=Object.freeze({
 CUSTOMER_REQUIRED:'Selecione um cliente cadastrado da lista antes de finalizar.',
 INVALID_PREORDER_SNAPSHOT:'Este ambiente aceita somente pré-pedidos PYG sem pagamentos ou alterações adicionais.',
 INVALID_COMMAND:'Identificador ou conteúdo do pré-pedido inválido. Preserve o carrinho.',
 INVALID_QUANTITY:'Informe uma quantidade inteira e positiva, de no máximo 999 unidades por item.',
 DUPLICATE_LINE:'Há um produto repetido no pedido. Agrupe a quantidade em uma única linha.',
 PRODUCT_NOT_FOUND:'O produto não pertence ao catálogo PYG disponível para homologação.',
 INSUFFICIENT_STOCK:'Quantidade superior ao saldo disponível no depósito. Reduza a quantidade.',
 ORDER_SNAPSHOT_CHANGED:'O total ou preço não corresponde ao catálogo original PYG. Recarregue o catálogo antes de continuar.',
 IDEMPOTENCY_CONFLICT:'Este pedido já tem uma tentativa diferente. Verifique a Central antes de repetir.',
 ORDER_ALREADY_EXISTS:'Este identificador de pedido já existe. Consulte a Central antes de repetir.',
 SESSION_EXPIRED:'Sua sessão do operador expirou. Entre novamente, preservando o carrinho.',
 UNAUTHENTICATED:'Sua sessão de empresa ou operador não está autenticada.',
 FORBIDDEN:'Operador ou empresa sem autorização para o PDV de homologação.',
 MODULE_DISABLED:'O Romaneio não está habilitado para esta empresa.',
 STAGING_PROFILE_REQUIRED:'A empresa não possui o perfil PYG homologado.',
 PAYMENT_RATE_REQUIRED:'Não foi possível validar a cotação original PYG.',
 STAGING_CATALOG_LIMIT:'O catálogo de homologação ultrapassou o limite de segurança.',
 REQUEST_FAILED:'Não foi possível confirmar o pedido. Consulte a Central antes de reenviar.'
});
export function stagingPreorderErrorMessage(code){
 return STAGING_PREORDER_ERRORS[code]||'Pré-pedido não confirmado ('+String(code||'REQUEST_FAILED')+'). Confira a Central antes de repetir.';
}
export function validateStagingPreorderDraft(request,catalog){
 const order=request?.changes?.find(c=>c.field==='historicoVendas')?.value?.[0];
 if(request?.changes?.length!==1||request?.financialEntries?.length||request?.stockEvents?.length||
    !order||order.tipoDocumento!=='pre_pedido'||order.estado!=='pendente'||order.pagamentos?.length||
    order.moedaDocumento!=='PYG')
  return failure('INVALID_PREORDER_SNAPSHOT',STAGING_PREORDER_ERRORS.INVALID_PREORDER_SNAPSHOT);
 if(!order.clienteId||!catalog?.customers?.some(c=>String(c.id)===String(order.clienteId)))
  return failure('CUSTOMER_REQUIRED',STAGING_PREORDER_ERRORS.CUSTOMER_REQUIRED);
 if(typeof request.operationKey!=='string'||!/^pdv:PRÉ-PEDIDO-\d{13}-[a-z0-9]{6}$/u.test(request.operationKey))
  return failure('INVALID_COMMAND',STAGING_PREORDER_ERRORS.INVALID_COMMAND);
 if(!Array.isArray(order.itens)||!order.itens.length||order.itens.length>20)
  return failure('INVALID_COMMAND',STAGING_PREORDER_ERRORS.INVALID_COMMAND);
 const rate=catalog?.rates?.PYG;
 if(!(Number.isFinite(rate)&&rate>0))return failure('PAYMENT_RATE_REQUIRED',STAGING_PREORDER_ERRORS.PAYMENT_RATE_REQUIRED);
 const byId=new Map((catalog.products||[]).map(p=>[String(p.id),p]));
 const lines=[];let total=0;const seen=new Set();
 for(const item of order.itens){
  const productId=String(item.produtoOriginalId??item.id??'');
  const quantity=Number(item.qtd);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>999)
   return failure('INVALID_QUANTITY',STAGING_PREORDER_ERRORS.INVALID_QUANTITY);
  if(seen.has(productId))return failure('DUPLICATE_LINE',STAGING_PREORDER_ERRORS.DUPLICATE_LINE);
  seen.add(productId);
  const product=byId.get(productId),price=product?.valoresMonetarios?.campos?.precoVenda;
  if(!product||price?.moeda!=='PYG'||!Number.isSafeInteger(price.valor)||price.valor<=0||!product.sku||
     product.tipoItem==='servico'||product.usoUnicoEncomendado)
   return failure('PRODUCT_NOT_FOUND',STAGING_PREORDER_ERRORS.PRODUCT_NOT_FOUND);
  const available=Number(product.estoqueGalpao??0)-Number(product.estoqueReservadoDistribuicao??0);
  if(quantity>available)return failure('INSUFFICIENT_STOCK',STAGING_PREORDER_ERRORS.INSUFFICIENT_STOCK);
  const lineTotal=price.valor*quantity;
  if(!Number.isSafeInteger(lineTotal))return failure('INVALID_PREORDER_SNAPSHOT',STAGING_PREORDER_ERRORS.INVALID_PREORDER_SNAPSHOT);
  total+=lineTotal;lines.push({productId,quantity});
 }
 if(!Number.isSafeInteger(total)||!Number.isFinite(order.totalOriginal)||
    Math.round(order.totalOriginal)!==total)
  return failure('ORDER_SNAPSHOT_CHANGED',STAGING_PREORDER_ERRORS.ORDER_SNAPSHOT_CHANGED);
 return {ok:true,payload:{type:'create',key:request.operationKey,customerId:order.clienteId,lines,totalOriginal:total,pygRate:rate}};
}
