import test from 'node:test';
import assert from 'node:assert/strict';
import {registrarValoresProduto,produtoParaFormularioMonetario,quantiaOriginalProduto,valorProdutoBRL,projetarProdutoMonetario} from '../src/core/productMoney.js';
import {mergeArrayThreeWay} from '../src/core/syncMerge.js';
import {criarSnapshotCommercePublico,conferirCarrinhoContraSnapshot,minorCommerceParaBRL} from '../src/core/commercePublicCatalog.js';
const rates={BRL:1,PYG:1150,USD:0.2,EUR:0.18};
const to=(v,m)=>v/rates[m],from=(v,m)=>v*rates[m];
const form=(moeda,valor)=>({custoBRL:0,precoBRL:valor,preco2BRL:0,preco3BRL:0,moedaCusto:moeda,moedaPreco:moeda});
for(const origem of Object.keys(rates))for(const destino of Object.keys(rates))test(origem+' mantém preço original após preferência '+destino,()=>{
 const valor=origem==='PYG'?39990:39.99;
 const p={id:'p',...registrarValoresProduto(form(origem,valor),origem,to)};
 const before=JSON.stringify(p);
 const edited=produtoParaFormularioMonetario(p,destino,from);
 assert.equal(edited.moedaPreco,origem);assert.equal(Number(edited.precoBRL),valor);
 assert.equal(quantiaOriginalProduto(p,'precoBRL').valor,valor);
 const saved=registrarValoresProduto(edited,destino,to,p,from);
 assert.deepEqual(saved.valoresMonetarios,p.valoresMonetarios);
 assert.equal(saved.precoBRL,p.precoBRL);assert.equal(JSON.stringify(p),before);
});
test('custo e preço independentes; nova cotação altera somente equivalente e não o documento antigo',()=>{
 const p={id:'p',...registrarValoresProduto({...form('PYG',39990),custoBRL:10,moedaCusto:'USD'},'PYG',to)};
 assert.equal(p.custoBRL,50);assert.equal(p.precoBRL,39990/1150);
 const history={itens:[{...p,custoNaVendaBRL:p.custoBRL}],taxasCambio:{...rates}};
 const before=JSON.stringify(history),newTo=(v,m)=>v/({...rates,PYG:2000,USD:0.25}[m]);
 const view=projetarProdutoMonetario(p,newTo);
 assert.equal(view.precoBRL,19.995);assert.equal(view.custoBRL,40);
 assert.equal(quantiaOriginalProduto(view,'precoBRL').valor,39990);
 assert.equal(JSON.stringify(history),before);
});
test('legado não é reclassificado pela moeda atual e versões inválidas são bloqueadas',()=>{
 const old={id:'old',custoBRL:10,precoBRL:50,preco2BRL:0,preco3BRL:0};
 const saved=registrarValoresProduto(produtoParaFormularioMonetario(old,'USD',from),'USD',to,old,from);
 assert.equal(saved.precoBRL,50);assert.equal(quantiaOriginalProduto(saved,'precoBRL'),null);
 assert.throws(()=>quantiaOriginalProduto({valoresMonetarios:{versao:7}},'precoBRL'));
});
test('quantia e equivalente não podem ser mesclados entre dois preços concorrentes',()=>{
 const base={id:'p',...registrarValoresProduto(form('PYG',39990),'PYG',to)};
 const local={...base,...registrarValoresProduto(form('PYG',40000),'PYG',to,base,from)};
 const remote={...base,...registrarValoresProduto(form('USD',12),'USD',to,base,from)};
 assert.throws(()=>mergeArrayThreeWay({field:'produtos',base:[base],local:[local],remote:[remote]}),e=>e.code==='ZENOS_MONEY_CONFLICT');
 const named=mergeArrayThreeWay({field:'produtos',base:[base],local:[{...base,nome:'Nome novo'}],remote:[remote]})[0];
 assert.equal(named.nome,'Nome novo');assert.deepEqual(named.valoresMonetarios,remote.valoresMonetarios);assert.equal(named.precoBRL,remote.precoBRL);
});
test('vitrine PYG cobra exatamente 39.990, sem perda por centavos intermediários de BRL',()=>{
 const snapshot=criarSnapshotCommercePublico({lojaId:'test',config:{slug:'test-shop',moedaPadrao:'PYG',taxasCambio:rates},produtos:[{id:'p',nome:'Massa',estoque:10,precoBRL:39990/1150,precoOriginal:{valor:39990,moeda:'PYG',custoSecreto:99}}]});
 assert.deepEqual(snapshot.produtos[0].precoOriginal,{valor:39990,moeda:'PYG'});
 const cart=conferirCarrinhoContraSnapshot(snapshot,[{id:'p',quantidade:2}]);
 assert.equal(cart.totalCentavos,79980);assert.equal(minorCommerceParaBRL(cart.totalCentavos,snapshot.config),79980/1150);
 for(const moeda of ['BRL','USD','EUR']){
   const s={...snapshot,config:{...snapshot.config,moedaPadrao:moeda}};
   const c=conferirCarrinhoContraSnapshot(s,[{id:'p',quantidade:1}]);
   assert.equal(c.totalCentavos,Math.round(39990/1150*rates[moeda]*100));
 }
});
test('pedido privado PYG congela moeda, valor e equivalentes e é idempotente',async()=>{
 const {submitOrder}=await import('../api/commerce/inbox.js');
 const shop=criarSnapshotCommercePublico({lojaId:'test',config:{slug:'test-shop',moedaPadrao:'PYG',taxasCambio:rates},produtos:[{id:'p',nome:'Massa',estoque:10,precoOriginal:{valor:39990,moeda:'PYG'}}]});
 const body={slug:'test-shop',requestId:'f9ac2474-5469-4cc3-8a67-9c524b33a0af',cliente:{nome:'Cliente teste',telefone:'(67) 99999-0000'},entrega:{tipo:'retirada'},pagamento:{forma:'dinheiro'},itens:[{id:'p',quantidade:1}]};
 let recorded;
 const result=await submitOrder(body,{catalog:async()=>shop,read:async()=>null,write:async(_,d)=>{recorded=d;}});
 assert.equal(result.moedaDocumento,'PYG');assert.equal(result.totalCentavos,39990);
 assert.equal(recorded.totalOriginal,39990);assert.equal(recorded.totalBRL,39990/1150);
 assert.equal(recorded.itens[0].precoUnitarioBRL,39990/1150);
 const before=JSON.stringify(recorded);
 const duplicate=await submitOrder(body,{catalog:async()=>shop,read:async()=>recorded,write:async()=>assert.fail('duplicate')});
 assert.equal(duplicate.duplicado,true);assert.equal(duplicate.moedaDocumento,'PYG');assert.equal(JSON.stringify(recorded),before);
});

test('custo nativo não usa média antiga se outra venda mudou a quantidade em paralelo',()=>{
 const base={id:'p',estoque:10,estoqueGalpao:10,...registrarValoresProduto({...form('USD',10),custoBRL:4},'USD',to)};
 const local={...base,estoque:20,estoqueGalpao:20,...registrarValoresProduto({...produtoParaFormularioMonetario(base,'USD',from),custoBRL:4.4},'USD',to,base,from)};
 const remote={...base,estoque:9,estoqueGalpao:9};
 assert.throws(()=>mergeArrayThreeWay({field:'produtos',base:[base],local:[local],remote:[remote]}),e=>e.code==='ZENOS_MONEY_CONFLICT');
 const stockOnly=mergeArrayThreeWay({field:'produtos',base:[base],local:[{...base,estoque:8,estoqueGalpao:8}],remote:[remote]})[0];
 assert.equal(stockOnly.estoque,7);assert.deepEqual(stockOnly.valoresMonetarios,base.valoresMonetarios);
});
