import {test} from 'node:test';
import assert from 'node:assert/strict';
import {atenderPedidoPDV} from '../src/commercePDV.js';
const id='ab'.repeat(16),lojaId='shop',operadorUid='op1',vendaId=`COMMERCE-${id}`;
function fixture(){
 const records={
  [`lojas/shop/commerce_private/licenca`]:{status:'ativo',ativacaoConfirmadaServidor:true},
  [`lojas/shop/commerce_pedidos/${id}`]:{status:'recebido',cliente:{nome:'Teste'},itens:[{produtoId:'P1',quantidade:2,precoUnitarioCentavos:1250}]},
  'lojas/shop/dados/operacao':{produtos:[{id:'P1',sku:'S1',precoBRL:17,estoque:3}],historicoVendas:[]},
 };
 const writes=[];
 const db={doc:path=>path,runTransaction:async fn=>{
  const pending=[];
  const result=await fn({get:async path=>({exists:records[path]!==undefined,data:()=>records[path]}),update:(path,value)=>pending.push([path,value])});
  for(const [path,value] of pending){records[path]={...records[path],...value};writes.push(path);}
  return result;
 }};
 return {db,records,writes};
}
test('prepara rascunho sem tocar preço, estoque, financeiro ou histórico; mantém dono e ID',async()=>{
 const f=fixture(),before=JSON.stringify(f.records['lojas/shop/dados/operacao']);
 const first=await atenderPedidoPDV(f.db,{lojaId,operadorUid,id});
 const retry=await atenderPedidoPDV(f.db,{lojaId,operadorUid,id});
 assert.deepEqual(first,retry);assert.equal(first.vendaId,vendaId);
 assert.equal(first.itens[0].precoUnitarioCentavos,1250);
 assert.equal(JSON.stringify(f.records['lojas/shop/dados/operacao']),before);
 assert.ok(f.writes.every(path=>path===`lojas/shop/commerce_pedidos/${id}`));
 await assert.rejects(atenderPedidoPDV(f.db,{lojaId,operadorUid:'op2',id}),/Outro operador/);
 await assert.rejects(atenderPedidoPDV(f.db,{lojaId,operadorUid,id,confirmar:true}),/ainda não confirmada/);
});
test('só encerra com venda canônica e trava durável; recupera confirmação interrompida',async()=>{
 const f=fixture();await atenderPedidoPDV(f.db,{lojaId,operadorUid,id});
 f.records[`lojas/shop/commerce_faturamentos/${id}`]={vendaId};
 await assert.rejects(atenderPedidoPDV(f.db,{lojaId,operadorUid,id}),/Não refature/);
 f.records['lojas/shop/dados/operacao'].historicoVendas=[{id:vendaId,origem:'commerce',commercePedidoId:id,tipoDocumento:'venda',estado:'concluida',createdAt:'2026-10-18T00:00:00Z'}];
 assert.deepEqual(await atenderPedidoPDV(f.db,{lojaId,operadorUid:'op2',id,confirmar:true}),{faturado:true,vendaId,lojaId,pedidoId:id});
 assert.equal(f.records[`lojas/shop/commerce_pedidos/${id}`].status,'encerrado');
});
test('V2 usa vendas certificadas, nunca histórico V1 antigo',async()=>{
 const f=fixture(),generation='cd'.repeat(12),sourceChecksum='test';
 f.records['lojas/shop/dados/storage_control']={mode:'v2',generation,sourceChecksum,certificate:{sourceChecksum,productionReady:true,v1WritersFenced:true,finalReconciliationPassed:true,pdvIntegrationPassed:true,rollbackPrepared:true}};
 const root=`lojas/shop/v2_generations/${generation}`;
 f.records[root]={schema:2,state:'ready',sourceChecksum,fieldManifest:{historicoVendas:{kind:'array',collection:'vendas'}}};
 f.records[`${root}/vendas/${vendaId}`]={legacyField:'historicoVendas',deleted:false,data:{id:vendaId,origem:'commerce',commercePedidoId:id,tipoDocumento:'venda',createdAt:'2026-10-18T00:00:00Z'}};
 f.records[`lojas/shop/commerce_faturamentos/${id}`]={vendaId};
 assert.equal((await atenderPedidoPDV(f.db,{lojaId,operadorUid,id,confirmar:true})).faturado,true);
 f.records[`${root}/vendas/${vendaId}`].deleted=true;
 await assert.rejects(atenderPedidoPDV(f.db,{lojaId,operadorUid,id}),/removida/);
 f.records['lojas/shop/dados/storage_control'].mode='maintenance';
 await assert.rejects(atenderPedidoPDV(f.db,{lojaId,operadorUid,id}),/manutenção/);
});
