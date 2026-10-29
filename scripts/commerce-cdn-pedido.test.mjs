import test from 'node:test';
import assert from 'node:assert/strict';
import {validarPedidoPublico,montarDocumentoPedido,registrarPedidoTransacional,
  createCheckoutHandler,encodeOrderDoc} from '../api/commerce/pedido.js';

const original={env:process.env.VERCEL_ENV,checkout:process.env.ZENOS_COMMERCE_CHECKOUT_ENABLED,
  anti:process.env.ZENOS_COMMERCE_ABUSE_PROTECTION_READY};
test.after(()=>{for(const [name,val] of Object.entries({
  VERCEL_ENV:original.env,ZENOS_COMMERCE_CHECKOUT_ENABLED:original.checkout,
  ZENOS_COMMERCE_ABUSE_PROTECTION_READY:original.anti
})){if(val===undefined)delete process.env[name];else process.env[name]=val;}});
const base={slug:'loja-teste',requestId:'8d63a15d-86de-444b-abfd-5c2d2448ab35',
  cliente:{nome:'Comprador Teste',telefone:'(67) 99999-0000',observacao:'Retirar tarde'},
  entrega:{tipo:'retirada'},pagamento:{forma:'pix'},
  itens:[{id:'p-1',quantidade:2,precoCentavos:1}],turnstileToken:'valid-challenge-0123456789'};
const settings={slug:'loja-teste',nomeLoja:'Loja Teste',produtosLoja:{'p-1':{ativo:true,precoPromoBRL:35}}};
const shop={produtos:[{id:'p-1',nome:'Tinta premium',precoBRL:50,estoque:8}]};
function res(){return {code:200,setHeader(){return this;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};}
test('rejeita pedidos inválidos sem consultar Firestore',()=>{
 for(const x of [
  {...base,itens:[]},{...base,requestId:'repetido'},{...base,entrega:{tipo:'entrega'}},
  {...base,pagamento:{forma:'criptomoeda'}},{...base,cliente:{nome:'',telefone:'abc'}}
 ])assert.throws(()=>validarPedidoPublico(x));
});
test('recalcula os valores oficiais, nunca usa preços manipulados pelo browser',()=>{
 const parsed=validarPedidoPublico(base);
 const order=montarDocumentoPedido({pedido:parsed,uid:'loja-1',shop,config:settings,at:()=>new Date('2026-10-29T10:00:00Z')});
 assert.equal(order.totalCentavos,7000);
 assert.equal(order.itens[0].precoUnitarioBRL,35);
 assert.equal(order.clienteNome,base.cliente.nome);
 assert.equal(order.tipoDocumento,'pre_pedido');
 assert.equal(order.statusAtendimento,'pendente');
 assert.equal(encodeOrderDoc(order,'projects/p/databases/(default)/documents/lojas/x/pedidos_online/y').fields.totalCentavos.integerValue,'7000');
});
test('rejeita estoque insuficiente',()=>{
 assert.throws(()=>montarDocumentoPedido({
  pedido:validarPedidoPublico({...base,itens:[{id:'p-1',quantidade:999}]}),
  uid:'loja-1',shop,config:settings
 }),/estoque-ou-quantidade-invalida/);
});
test('uma transação lê documentos pontuais e grava somente um pré-pedido',async()=>{
 const paths=[];let commitDoc;
 const fetchImpl=async (url,opt)=>{
   paths.push({url,method:opt.method});
   if(url.endsWith(':beginTransaction'))return {ok:true,json:async()=>({transaction:'txn-123'})};
   if(url.includes('/pedidos_online/'))return {status:404,ok:false};
   if(url.includes('/dados/configuracoes'))return {ok:true,json:async()=>({fields:{
     commerceConfig:{mapValue:{fields:{
       slug:{stringValue:'loja-teste'},
       nomeLoja:{stringValue:'Loja Teste'},
       produtosLoja:{mapValue:{fields:{'p-1':{mapValue:{fields:{ativo:{booleanValue:true},precoPromoBRL:{doubleValue:35}}}}}}}
     }}}
   }})};
   if(url.includes('/documents/lojas/loja-1?'))return {ok:true,json:async()=>({fields:{
     produtos:{arrayValue:{values:[{mapValue:{fields:{
       id:{stringValue:'p-1'},nome:{stringValue:'Tinta premium'},precoBRL:{integerValue:'50'},estoque:{integerValue:'8'}
     }}}]}}
   }})};
   if(url.endsWith(':commit')){
     commitDoc=JSON.parse(opt.body);
     return {ok:true,json:async()=>({writeResults:[{}]})};
   }
   throw Error('unexpected url '+url);
 };
 const result=await registrarPedidoTransacional(validarPedidoPublico(base),{
   getSlug:async p=>{assert.deepEqual(p,['lojas_slugs','loja-teste']);return {lojaId:'loja-1'};},
   tokenGetter:async()=> 'mock-token',fetchImpl,at:()=>new Date('2026-10-29T10:00:00Z')
 });
 assert.equal(result.duplicado,false);
 assert.equal(result.totalCentavos,7000);
 assert.equal(paths.length,5);
 assert.equal(commitDoc.writes.length,1);
 assert.equal(commitDoc.writes[0].currentDocument.exists,false);
 assert.equal(commitDoc.transaction,'txn-123');
 assert.equal(commitDoc.writes[0].update.fields.totalCentavos.integerValue,'7000');
});
test('não declara sucesso quando a escrita do pedido falha',async()=>{
 const fetchImpl=async (url,opt)=>{
   if(url.endsWith(':beginTransaction'))return {ok:true,json:async()=>({transaction:'txn'})};
   if(url.includes('/pedidos_online/'))return {status:404,ok:false};
   if(url.includes('/dados/configuracoes'))return {ok:true,json:async()=>({fields:{
     commerceConfig:{mapValue:{fields:{slug:{stringValue:'loja-teste'}}}}
   }})};
   if(url.includes('/documents/lojas/loja-1?'))return {ok:true,json:async()=>({fields:{
     produtos:{arrayValue:{values:[{mapValue:{fields:{
       id:{stringValue:'p-1'},nome:{stringValue:'Tinta'},preco:{integerValue:'50'},estoque:{integerValue:'8'}
     }}}]}}
   }})};
   if(url.endsWith(':commit'))return {ok:false,status:403};
   throw Error(url);
 };
 await assert.rejects(registrarPedidoTransacional(validarPedidoPublico(base),{
  getSlug:async()=>({lojaId:'loja-1'}),tokenGetter:async()=>'token',fetchImpl
 }),/firestore-operacao-indisponivel/);
});
test('checkout continua totalmente desligado em produção',async()=>{
 let verified=0,recorded=0;
 const h=createCheckoutHandler({verify:async()=>{verified++;},record:async()=>{recorded++;}});
 process.env.VERCEL_ENV='production';process.env.ZENOS_COMMERCE_CHECKOUT_ENABLED='true';
 process.env.ZENOS_COMMERCE_ABUSE_PROTECTION_READY='true';
 const response=res();await h({method:'POST',body:base,headers:{}},response);
 assert.equal(response.code,503);assert.equal(verified,0);assert.equal(recorded,0);
});
test('checkout só confirma após desafio antifraude e gravação',async()=>{
 process.env.VERCEL_ENV='preview';process.env.ZENOS_COMMERCE_CHECKOUT_ENABLED='true';
 process.env.ZENOS_COMMERCE_ABUSE_PROTECTION_READY='true';
 let recorded=0;
 const h=createCheckoutHandler({verify:async()=>{throw Error('desafio-antifraude-invalido');},
   record:async()=>{recorded++;}});
 const blocked=res();await h({method:'POST',body:base,headers:{}},blocked);
 assert.equal(recorded,0);assert.equal(blocked.code,422);
 const h2=createCheckoutHandler({verify:async()=>true,record:async()=>({id:'ON-TEST',totalCentavos:7000,duplicado:false})});
 const accepted=res();await h2({method:'POST',body:base,headers:{}},accepted);
 assert.equal(accepted.code,200);assert.equal(accepted.body.id,'ON-TEST');
});

test('reenvio idempotente retorna o pedido existente sem segunda escrita',async()=>{
 const pedido=validarPedidoPublico(base);
 let writes=0,reads=0;
 const fetchImpl=async (url)=>{
   if(url.endsWith(':beginTransaction'))return {ok:true,json:async()=>({transaction:'txn-duplicada'})};
   if(url.includes('/pedidos_online/')){
     reads++;
     return {ok:true,json:async()=>({fields:{
       commerceIdempotencyHash:{stringValue:pedido.hash},
       totalCentavos:{integerValue:'7000'}
     }})};
   }
   writes++;
   throw Error('Não deveria acessar estoque nem gravar pedido duplicado: '+url);
 };
 const result=await registrarPedidoTransacional(pedido,{
   getSlug:async()=>({lojaId:'loja-1'}),tokenGetter:async()=>'token',fetchImpl
 });
 assert.equal(result.duplicado,true);
 assert.equal(result.totalCentavos,7000);
 assert.equal(reads,1);
 assert.equal(writes,0);
});
test('chave de pedido reutilizada com dados diferentes gera conflito, sem gravação',async()=>{
 const pedido=validarPedidoPublico(base);
 const alterado=validarPedidoPublico({...base,cliente:{...base.cliente,nome:'Outro Comprador'}});
 let writes=0;
 const fetchImpl=async url=>{
   if(url.endsWith(':beginTransaction'))return {ok:true,json:async()=>({transaction:'txn-conflict'})};
   if(url.includes('/pedidos_online/'))return {ok:true,json:async()=>({fields:{
     commerceIdempotencyHash:{stringValue:pedido.hash},totalCentavos:{integerValue:'7000'}
   }})};
   writes++;
   throw Error('Não deve gravar conflito');
 };
 await assert.rejects(registrarPedidoTransacional(alterado,{
   getSlug:async()=>({lojaId:'loja-1'}),tokenGetter:async()=>'token',fetchImpl
 }),/pedido-conflitante/);
 assert.equal(writes,0);
});
