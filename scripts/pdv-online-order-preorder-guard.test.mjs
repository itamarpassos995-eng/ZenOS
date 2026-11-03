import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');

test('pedido online entra no carrinho sem herdar ID de pré-pedido inexistente',()=>{
 const start=source.indexOf('const carregarPedidoOnline');
 const end=source.indexOf('const carregarPrePedido');
 // O resgate online ocorre antes do resgate do pré-pedido operacional.
 const online=source.slice(0,end);
 assert.match(online,/setPrePedidoEmAbertoId\(null\)/);
 assert.doesNotMatch(online,/setPrePedidoEmAbertoId\(pedido\.origem\s*===/);
});

test('guarda de liquidação de pré-pedido operacional permanece ativa',()=>{
 assert.match(source,/if\(tipoFinalizacao==='venda' && prePedidoEmAbertoId\)/);
 assert.match(source,/originais\.length!==1 \|\| originais\[0\]\.estado!=='pendente'/);
});
