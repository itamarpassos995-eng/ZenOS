import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {idClienteOnline,prepararCadastroOnline} from '../src/commerceCustomersCore.js';

const pedido={cadastroSolicitado:true,aceitePromocoes:true,
 cliente:{nome:'Consumidor fictício',telefone:'5567999999999'}};
const p1='a'.repeat(32),p2='b'.repeat(32);
const agora='2026-10-19T13:00:00.000Z';

test('cadastro online estável em novas sessões, mas isolado entre lojas',()=>{
 assert.equal(idClienteOnline('lojaA',pedido.cliente.telefone),
  idClienteOnline('lojaA',pedido.cliente.telefone));
 assert.notEqual(idClienteOnline('lojaA',pedido.cliente.telefone),
  idClienteOnline('lojaB',pedido.cliente.telefone));
 assert.notEqual(idClienteOnline('lojaA',pedido.cliente.telefone),
  idClienteOnline('lojaA','5567999999998'));
 assert.throws(()=>idClienteOnline('lojaA','123'),/inválida/);
});
test('novo contato: marketing nunca fica automaticamente autorizado',()=>{
 const r=prepararCadastroOnline({pedido,pedidoId:p1,anterior:null,agora});
 assert.equal(r.primeiroPedido,p1);assert.equal(r.ultimoPedido,p1);
 assert.equal(r.marketingStatus,'pendente_verificacao');
 assert.equal(r.marketingAutorizado,false);
 assert.equal(r.titularidadeVerificada,false);
 assert.equal(r.consentimentoEm,agora);
});
test('mesma pessoa em outro pedido: reaproveita ficha e primeiro pedido',()=>{
 const inicial=prepararCadastroOnline({pedido,pedidoId:p1,anterior:null,agora});
 const depois=prepararCadastroOnline({pedido:{...pedido,aceitePromocoes:false},
  pedidoId:p2,anterior:inicial,agora:'2026-10-19T14:00:00.000Z'});
 assert.equal(depois.primeiroPedido,p1);assert.equal(depois.ultimoPedido,p2);
 assert.equal(depois.marketingStatus,'nao_autorizado');
 assert.equal(depois.marketingAutorizado,false);
 assert.equal(depois.consentimentoEm,null);
});
test('checkout anônimo não substitui nome, consentimento nem número verificados',()=>{
 const anterior={nome:'Dona da conta',telefone:pedido.cliente.telefone,
  titularidadeVerificada:true,marketingAutorizado:true,
  marketingStatus:'ativo',consentimentoEm:'2026-01-01T00:00:00.000Z',primeiroPedido:p1};
 const alteracao=prepararCadastroOnline({pedido:{...pedido,cliente:{nome:'Invasor',telefone:pedido.cliente.telefone}},
  pedidoId:p2,anterior,agora});
 assert.equal(alteracao,null,'pedido anônimo não pode alterar nem relacionar pedidos ao cadastro verificado');
});
test('sem opt-in de cadastro não pode gerar ficha',()=>{
 assert.throws(()=>prepararCadastroOnline({pedido:{...pedido,cadastroSolicitado:false},
  pedidoId:p1,anterior:null,agora}),/não solicitado/);
});
test('navegador não persiste carrinho nem recibo; o servidor mantém idempotência',()=>{
 const pub=readFileSync(new URL('../src/commerceOrders.js',import.meta.url),'utf8');
 const storefront=readFileSync(new URL('../../src/components/ZenCommerceStorefront.jsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../../src/core/commercePublicApi.js',import.meta.url),'utf8');
 assert.match(pub,/idClienteOnline\(lojaId,pedido\.cliente\.telefone\)/);
 assert.match(pub,/prepararCadastroOnline\(\{/);
 assert.match(pub,/if\(dados\)tx\.set\(clienteRef,dados,\{merge:true\}\)/);
 assert.match(pub,/tx\.create\(ref,data\)/);
 assert.match(pub,/if\(action==='listarClientesOnline'\)/);
 assert.match(pub,/autorizarOperadorCommerce\(request\.auth,db,request\.data\?\.sessaoZenOS\)/);
 assert.doesNotMatch(pub,/[\s]tx\.(?:set|update)\(db\.doc\(`lojas\/\$\{lojaId\}\/dados\/operacao`/);
 assert.doesNotMatch(storefront,/sessionStorage\.setItem|localStorage\.setItem/);
 assert.match(storefront,/sessionStorage\.removeItem\(chaveSessao\(idPublico\)\)/);
 assert.match(storefront,/setCarrinho\(\{\}\);setCliente\(novoCliente\(\)\);setRecibo\(r\)/);
 assert.match(api,/inMemoryPersistence/);
 assert.doesNotMatch(api,/browserSessionPersistence/);
});
