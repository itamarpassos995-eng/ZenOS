// Documento operacional pendente: nao fatura, nao movimenta estoque/caixa.
export const idPrePedidoCommerce = id => `PRE-COMMERCE-${id}`;

export function montarPrePedidoCommerce({pedido,produtos,operadorId,operadorNome}) {
 if(!pedido || pedido.faturado || !/^[a-f0-9]{32}$/.test(pedido.pedidoId||'') ||
    pedido.vendaId !== `COMMERCE-${pedido.pedidoId}` || !Array.isArray(pedido.itens) || !pedido.itens.length)
   throw Error('Pedido Commerce sem preparacao valida.');
 const itens = pedido.itens.map((item,index)=>{
  const matches=(produtos||[]).filter(p=>String(p.id)===String(item.produtoId));
  if(matches.length!==1||!Number.isSafeInteger(item.quantidade)||item.quantidade<1||
     !Number.isSafeInteger(item.precoUnitarioCentavos)||item.precoUnitarioCentavos<=0)
    throw Error('O produto do pedido online mudou. Confira o cadastro.');
  const p=matches[0];
  const {imagem,imagens,fotos,galeria,...leve}=p;
  return {...leve,id:`${pedido.vendaId}-${index}`,produtoOriginalId:p.id,produtoOriginalSku:p.sku,
   qtd:String(item.quantidade),precoPraticadoBRL:item.precoUnitarioCentavos/100,
   precoTexto:(item.precoUnitarioCentavos/100).toFixed(2)};
 });
 return {
  id:idPrePedidoCommerce(pedido.pedidoId),createdAt:pedido.preparadoEm,
  dataHora:new Date(pedido.preparadoEm).toLocaleString('pt-BR'),
  origem:'commerce',commercePedidoId:pedido.pedidoId,commerceVendaId:pedido.vendaId,
  clienteNome:String(pedido.clienteNome||'Consumidor'),clienteId:null,
  vendedorId:String(operadorId||'admin'),vendedorNome:String(operadorNome||'Operador'),
  estado:'pendente',tipoDocumento:'pre_pedido',itens,
  totalBRL:pedido.itens.reduce((t,i)=>t+i.quantidade*i.precoUnitarioCentavos/100,0),
  pagamentos:[],clienteQuerFiscal:false,
 };
}
export function recuperarPrePedidoCommerce(historico,pedidoId){
 const encontrados=(historico||[]).filter(v=>v.id===idPrePedidoCommerce(pedidoId));
 if(encontrados.length>1)throw Error('Pre-pedido duplicado; bloqueado para conferencia.');
 const doc=encontrados[0]||null;
 if(doc&&(doc.origem!=='commerce'||doc.commercePedidoId!==pedidoId||doc.estado!=='pendente'))
  throw Error('Vinculo do pre-pedido mudou; bloqueado para conferencia.');
 return doc;
}
