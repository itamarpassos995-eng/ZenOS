import {test} from 'node:test';
import assert from 'node:assert/strict';
import {criarCheckoutCommerce,comPrazoCommerce} from '../src/core/commerceCheckout.js';
test('resposta perdida exige consulta, sem segundo envio',async()=>{
 let pending=false,writes=0;const pedido={id:'a'.repeat(32),totalCentavos:100};
 const c=criarCheckoutCommerce({guardarPendente:v=>pending=v,enviar:async()=>{writes++;throw Error('timeout');},consultar:async()=>({encontrado:true,pedido})});
 await assert.rejects(c.confirmar('key',{}),/timeout/);assert.equal(pending,true);
 assert.deepEqual(await c.recuperar('key'),pedido);assert.equal(pending,false);assert.equal(writes,1);
});
test('falha na consulta mantém pendência; ausência autoritativa libera nova conferência',async()=>{
 let pending=true,offline=true;const c=criarCheckoutCommerce({guardarPendente:v=>pending=v,enviar:async()=>{},consultar:async()=>{if(offline)throw Error('offline');return {encontrado:false};}});
 await assert.rejects(c.recuperar('key'),/offline/);assert.equal(pending,true);
 offline=false;assert.equal(await c.recuperar('key'),null);assert.equal(pending,false);
});
test('duplo clique bloqueado sincronamente; nenhuma rede sem persistência local',async()=>{
 let release,writes=0;const c=criarCheckoutCommerce({guardarPendente:()=>{},consultar:async()=>{},enviar:()=>{writes++;return new Promise(r=>release=r);}});
 const first=c.confirmar('key',{});await assert.rejects(c.confirmar('key',{}),/Aguarde/);assert.equal(writes,1);release({id:'a'.repeat(32)});await first;
 const blocked=criarCheckoutCommerce({guardarPendente:()=>{throw Error('storage');},enviar:async()=>writes++,consultar:async()=>{}});
 await assert.rejects(blocked.confirmar('key',{}),/storage/);assert.equal(writes,1);
});
test('resposta inválida nunca libera envio pendente',async()=>{
 let pending=false;const c=criarCheckoutCommerce({guardarPendente:v=>pending=v,enviar:async()=>({}),consultar:async()=>({})});
 await assert.rejects(c.confirmar('key',{}),/inválida/);assert.equal(pending,true);
 await assert.rejects(c.recuperar('key'),/verificar/);assert.equal(pending,true);
});

test('prazo devolve controle mesmo quando a autenticação ou rede não responde',async()=>{
 await assert.rejects(comPrazoCommerce(()=>new Promise(()=>{}),5),/conexão demorou/);
 assert.equal(await comPrazoCommerce(async()=>42,100),42);
});
