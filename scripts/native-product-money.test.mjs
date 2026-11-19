import test from 'node:test';
import assert from 'node:assert/strict';
import {registrarValoresProduto,produtoParaFormularioMonetario,quantiaOriginalProduto,valorProdutoBRL,projetarProdutoMonetario,custoFornecedorProdutoBRL,atualizarCotacaoPrecoItemPDV,atualizarQuantiaProduto} from '../src/core/productMoney.js';
import {mergeArrayThreeWay} from '../src/core/syncMerge.js';
import {validarComposicaoPagamento} from '../src/core/paymentValidation.js';
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

test('último custo do fornecedor mantém moeda original ao reabrir uma compra com novo câmbio',()=>{
 const p={ultimoCustoFornecedorBRL:50,ultimoCustoFornecedorOriginal:{valor:10,moeda:'USD'}};
 assert.equal(custoFornecedorProdutoBRL(p,to),50);
 assert.equal(custoFornecedorProdutoBRL(p,(v,m)=>v/({...rates,USD:0.25}[m])),40);
 assert.equal(p.ultimoCustoFornecedorOriginal.valor,10);
});

test('PDV em PYG preserva preço nativo após mudança de 1150 para 1100',()=>{
 const item={precoOrigemPDV:{valor:25000,moeda:'PYG'},precoPraticadoBRL:25000/1150,precoTexto:'25000',qtd:'1'};
 const taxaNova={...rates,PYG:1100};
 const novo=atualizarCotacaoPrecoItemPDV(item,'PYG',(v,m)=>v/taxaNova[m],(v,m)=>v*taxaNova[m]);
 assert.equal(novo.precoTexto,'25000');
 assert.equal(novo.precoPraticadoBRL,25000/1100);
 assert.equal(novo.precoPraticadoBRL*1100,25000);
 assert.equal(item.precoPraticadoBRL,25000/1150);
});
test('PDV em BRL mantém preço BRL estável quando cotação PYG muda',()=>{
 const item={precoOrigemPDV:{valor:50,moeda:'BRL'},precoPraticadoBRL:50,precoTexto:'50.00'};
 const taxaNova={...rates,PYG:1100};
 const novo=atualizarCotacaoPrecoItemPDV(item,'BRL',(v,m)=>v/taxaNova[m],(v,m)=>v*taxaNova[m]);
 assert.equal(novo.precoTexto,'50.00');
 assert.equal(novo.precoPraticadoBRL,50);
 const emGuarani=atualizarCotacaoPrecoItemPDV(novo,'PYG',(v,m)=>v/taxaNova[m],(v,m)=>v*taxaNova[m]);
 assert.equal(emGuarani.precoTexto,'55000');
});
test('PDV preserva preço digitado em guaranis; não infere moedas de itens legados',()=>{
 const taxaNova={...rates,PYG:1100},to=(v,m)=>v/taxaNova[m],from=(v,m)=>v*taxaNova[m];
 const manual={precoDigitadoOriginal:{valor:25000,moeda:'PYG'},precoPraticadoBRL:25000/1150,precoTexto:'25000'};
 assert.equal(atualizarCotacaoPrecoItemPDV(manual,'PYG',to,from).precoTexto,'25000');
 const legado={precoPraticadoBRL:25000/1150,precoTexto:'25000'};
 assert.equal(atualizarCotacaoPrecoItemPDV(legado,'PYG',to,from),legado);
});

test('BRL PYG USD EUR: recebimentos mistos preservam valor original e taxa aplicada',()=>{
 const cotacao={BRL:1,PYG:1100,USD:0.20,EUR:0.18};
 const pagamentos=[
  {moedaOrigem:'PYG',valorOriginal:11000,taxaCambioAplicada:1100,valorConvertidoBRL:10,formaId:'dinheiro_pyg'},
  {moedaOrigem:'BRL',valorOriginal:10,taxaCambioAplicada:1,valorConvertidoBRL:10,formaId:'dinheiro_brl'},
  {moedaOrigem:'USD',valorOriginal:2,taxaCambioAplicada:0.2,valorConvertidoBRL:10,formaId:'dinheiro_usd'},
  {moedaOrigem:'EUR',valorOriginal:1.8,taxaCambioAplicada:0.18,valorConvertidoBRL:10,formaId:'dinheiro_eur'}
 ];
 const original=JSON.stringify(pagamentos);
 const item={precoOrigemPDV:{valor:44000,moeda:'PYG'},precoPraticadoBRL:44000/1150,precoTexto:'44000'};
 const after=atualizarCotacaoPrecoItemPDV(item,'PYG',(v,m)=>v/cotacao[m],(v,m)=>v*cotacao[m]);
 assert.equal(after.precoTexto,'44000');
 assert.equal(after.precoPraticadoBRL,40);
 assert.equal(pagamentos.reduce((a,p)=>a+p.valorConvertidoBRL,0),40);
 assert.equal(validarComposicaoPagamento({totalBRL:after.precoPraticadoBRL,recebidoBRL:40,recebidoDinheiroBRL:40}).podeConcluir,true);
 assert.equal(JSON.stringify(pagamentos),original);
 assert.equal(cotacao.PYG,1100);
});
test('preço nativo USD e EUR não altera sua origem quando muda PYG',()=>{
 const cambioNovo={BRL:1,PYG:1100,USD:0.25,EUR:0.2};
 for(const [moeda,valor] of [['USD',12.5],['EUR',9.99]]){
  const item={precoOrigemPDV:{valor,moeda},precoPraticadoBRL:valor/(moeda==='USD'?0.2:0.18),precoTexto:String(valor)};
  const novo=atualizarCotacaoPrecoItemPDV(item,moeda,(v,m)=>v/cambioNovo[m],(v,m)=>v*cambioNovo[m]);
  assert.equal(Number(novo.precoTexto),valor);
  assert.equal(novo.precoPraticadoBRL,valor/cambioNovo[moeda]);
 }
});

test('recompra atualiza custo sem alterar preço original PYG nem bloquear valor positivo da venda',()=>{
 const produto={id:'v',...registrarValoresProduto({...form('PYG',25000),custoBRL:13000},'PYG',to)};
 const precoAntes=quantiaOriginalProduto(produto,'precoBRL');
 const custoAntes=quantiaOriginalProduto(produto,'custoBRL');
 const novo=atualizarQuantiaProduto(produto,'custoBRL',15000,'PYG',to);
 assert.equal(custoAntes.valor,13000);
 assert.equal(quantiaOriginalProduto(novo,'custoBRL').valor,15000);
 assert.deepEqual(quantiaOriginalProduto(novo,'precoBRL'),precoAntes);
 const valorVendaBRL=valorProdutoBRL(novo,'precoBRL',to);
 assert.ok(valorVendaBRL>0);
 assert.equal(Math.round(valorVendaBRL*rates.PYG),25000);
 assert.equal(validarComposicaoPagamento({totalBRL:valorVendaBRL,recebidoBRL:valorVendaBRL,recebidoDinheiroBRL:valorVendaBRL}).podeConcluir,true);
});
test('custo de recompra em outra moeda não modifica preço PYG',()=>{
 const produto={id:'v',...registrarValoresProduto({...form('PYG',25000),custoBRL:13000},'PYG',to)};
 const alterado=atualizarQuantiaProduto(produto,'custoBRL',14,'USD',to);
 assert.equal(quantiaOriginalProduto(alterado,'custoBRL').moeda,'USD');
 assert.equal(quantiaOriginalProduto(alterado,'custoBRL').valor,14);
 assert.equal(quantiaOriginalProduto(alterado,'precoBRL').valor,25000);
 assert.equal(quantiaOriginalProduto(produto,'custoBRL').valor,13000);
});
