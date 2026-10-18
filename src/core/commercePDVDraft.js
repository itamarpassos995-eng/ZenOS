import {lerRascunhoPDV,salvarRascunhoPDV,apagarRascunhoPDV} from './pdvDraft.js';

export function reconciliarRascunhoCommerceFaturado({lojaId,operadorId,pedido}) {
 if(pedido?.faturado!==true||pedido.lojaId!==lojaId||!/^[a-f0-9]{32}$/.test(pedido.pedidoId||'')||
    pedido.vendaId!==`COMMERCE-${pedido.pedidoId}`)throw Error('Faturamento não confirmado pelo servidor.');
 const atual=lerRascunhoPDV(lojaId,operadorId);
 if(atual?.commerceOrigem?.pedidoId===pedido.pedidoId&&!apagarRascunhoPDV(lojaId,operadorId))
  throw Error('Venda confirmada, mas o rascunho local não pôde ser encerrado. Não refature.');
}

export function importarRascunhoCommerce({lojaId,operadorId,pedido,produtos,converterDeBRL=v=>v}) {
 if(pedido?.faturado)throw Error('Este pedido já foi faturado.');
 if(pedido?.lojaId!==lojaId||!/^[a-f0-9]{32}$/.test(pedido?.pedidoId||'')||
    pedido.vendaId!==`COMMERCE-${pedido.pedidoId}`||!Number.isFinite(Date.parse(pedido.preparadoEm))||
    !Array.isArray(pedido.itens)||!pedido.itens.length)throw Error('Pedido não confirmado pelo servidor.');
 const atual=lerRascunhoPDV(lojaId,operadorId);
 if(atual?.commerceOrigem?.pedidoId===pedido.pedidoId)return atual;
 if(atual?.itensVenda?.length||atual?.prePedidoEmAbertoId||atual?.commerceOrigem)
  throw Error('Há um atendimento no PDV. Conclua-o antes de abrir outro pedido.');
 const ids=new Set();
 const itensVenda=pedido.itens.map((item,index)=>{
  const matches=produtos.filter(p=>String(p.id)===String(item.produtoId));
  if(matches.length!==1||ids.has(String(item.produtoId))||!Number.isSafeInteger(item.quantidade)||item.quantidade<=0||
     !Number.isSafeInteger(item.precoUnitarioCentavos)||item.precoUnitarioCentavos<=0)
   throw Error('Produto ou quantidade não confere. Sincronize o cadastro antes de abrir o PDV.');
  ids.add(String(item.produtoId));const produto=matches[0],preco=item.precoUnitarioCentavos/100;
  return {...produto,id:`${pedido.vendaId}-${index}`,produtoOriginalId:produto.id,produtoOriginalSku:produto.sku,
   qtd:String(item.quantidade),precoPraticadoBRL:preco,precoTexto:converterDeBRL(preco).toFixed(2)};
 });
 const draft={itensVenda,nomeClienteVulso:pedido.clienteNome,descontoTexto:'0',pagamentosLancados:[],
  prePedidoEmAbertoId:null,modalFechamentoAberto:false,clienteQuerFiscal:false,
  commerceOrigem:{pedidoId:pedido.pedidoId,vendaId:pedido.vendaId,preparadoEm:pedido.preparadoEm},
  operacaoDocumento:{assinatura:null,id:pedido.vendaId,instante:pedido.preparadoEm}};
 if(!salvarRascunhoPDV(lojaId,operadorId,draft))throw Error('Não foi possível proteger o rascunho neste dispositivo.');
 return draft;
}
