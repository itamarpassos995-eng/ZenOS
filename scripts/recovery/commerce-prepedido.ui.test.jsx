import {test,expect} from 'vitest';
import {montarPrePedidoCommerce,recuperarPrePedidoCommerce,idPrePedidoCommerce} from '../../src/core/commercePrePedido';
const id='ab'.repeat(16);
const pedido={pedidoId:id,vendaId:'COMMERCE-'+id,preparadoEm:'2026-10-18T18:00:00Z',clienteNome:'Comprador',itens:[{produtoId:'x',quantidade:2,precoUnitarioCentavos:1250}]};
const produtos=[{id:'x',sku:'SKU1',nome:'Produto',precoBRL:200,imagem:'data:image/jpeg;base64,AAAA'}];
test('cria documento pendente sem venda, caixa, estoque ou pagamentos',()=>{
 const p=montarPrePedidoCommerce({pedido,produtos,operadorId:'o',operadorNome:'Operador'});
 expect(p).toMatchObject({id:idPrePedidoCommerce(id),estado:'pendente',origem:'commerce',commercePedidoId:id,tipoDocumento:'pre_pedido',totalBRL:25});
 expect(p.itens[0]).toMatchObject({produtoOriginalId:'x',qtd:'2',precoPraticadoBRL:12.5});
 expect(p.pagamentos).toEqual([]);expect(p.itens[0].imagem).toBeUndefined();
 expect(produtos[0].precoBRL).toBe(200);
 expect(recuperarPrePedidoCommerce([p],id)?.id).toBe(p.id);
});
test('nega duplicidade e vinculo inconsistente',()=>{
 const p=montarPrePedidoCommerce({pedido,produtos});
 expect(()=>recuperarPrePedidoCommerce([p,p],id)).toThrow(/duplicado/);
 expect(()=>recuperarPrePedidoCommerce([{...p,origem:'balcao'}],id)).toThrow(/Vinculo/);
 expect(()=>montarPrePedidoCommerce({pedido:{...pedido,vendaId:'outra'},produtos})).toThrow(/valida/);
});
