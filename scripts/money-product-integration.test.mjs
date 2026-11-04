import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoneyTestStore, MONEY_TEST_TENANT } from '../src/homologacao/moneyTestStore.js';
import { money } from '../src/core/money.js';
import { saveProductMoney, projectProductMoney, productMoneyForm, decorateMoneySale, formatProductMoney } from '../src/core/moneyProductBridge.js';
import { gerarPdfComprovante } from '../src/core/zenReceiptPdf.js';
const at='2026-11-04T16:00:00.000Z';
const memory=()=>{const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const mutex=()=>{let chain=Promise.resolve();return(key,fn)=>{const next=chain.then(fn);chain=next.catch(()=>{});return next;};};
test('native price and cost persist across FX changes, editing and JSON reload',()=>{
  const rates={BRL:1,PYG:230,USD:0.2,EUR:0.18};
  const product=saveProductMoney({id:'p',nome:'synthetic'}, {custoBRL:'20.000',precoBRL:'39.990',moneyCostCurrency:'PYG',moneyPriceCurrency:'PYG'},
    {tenantId:MONEY_TEST_TENANT,actor:'admin',locale:'pt-BR',rates,at});
  assert.equal(product.moneyPrices.values.sale.amount,'39990');
  const old=JSON.stringify(product), changed={...rates,PYG:460};
  assert.equal(projectProductMoney(product,changed,at).precoBRL,86.934782608696);
  assert.match(formatProductMoney(product,'precoBRL','PYG',changed,'pt-BR',at),/39\.990/);
  const form=productMoneyForm(JSON.parse(old),{defaultCurrency:'BRL',locale:'pt-BR'});
  assert.equal(form.moneyPriceCurrency,'PYG');assert.equal(form.precoBRL,'39990');
  const edited=saveProductMoney(product,form,{tenantId:MONEY_TEST_TENANT,actor:'admin',locale:'pt-BR',rates:changed,at});
  assert.equal(edited.moneyPrices.values.sale.amount,'39990');assert.equal(edited.moneyPrices.revision,2);
  assert.equal(JSON.stringify(product),old);
});
function fixtureSale(state,payments,trocoOriginal=0,moedaTrocoInfo=null){
  const p=projectProductMoney(state.produtos[0],state.rates,at);
  return decorateMoneySale({id:'synthetic-sale',createdAt:at,moneyTenantId:MONEY_TEST_TENANT,finalizadoPorId:'admin',tipoDocumento:'venda',
    itens:[{...p,id:'line-1',qtd:'1',precoPraticadoBRL:p.precoBRL,custoNaVendaBRL:p.custoBRL}],totalBRL:p.precoBRL,
    pagamentos:payments,trocoOriginal,moedaTrocoInfo}, {currency:'PYG',rates:state.rates,locale:'pt-BR',discountText:'0',
      resolvePaymentAccount:p=>`synthetic-account:${p.formaId}`,changeAccountId:'synthetic-drawer'});
}
test('mixed BRL cash/PYG card and native change reconciled in actual POS adapter',()=>{
  const state=createMoneyTestStore(memory(),mutex()).read();
  const sale=fixtureSale(state,[{id:1,formaId:'cartaoCredito_pyg',moedaOrigem:'PYG',valorOriginal:20000},
    {id:2,formaId:'dinheiro_brl',moedaOrigem:'BRL',valorOriginal:20}],3010,'PYG');
  assert.equal(sale.moneySnapshot.total.amount,'39990');
  assert.equal(sale.moneySettlement.outstanding.amount,'0');
  assert.equal(sale.moneySettlement.change[0].amount.amount,'3010');
  assert.equal(sale.moneySettlement.payments[0].amount.currency,'PYG');
});
test('local transport rejects stale revisions and does not drop ambiguous legacy data',async()=>{
  const store=createMoneyTestStore(memory(),mutex());const state=store.read();
  const product=projectProductMoney(state.produtos[0],{...state.rates,PYG:460},at);
  const operation={changes:[{field:'produtos',value:[{...product,estoque:19,estoqueVitrine:19}]}],operationKey:'stock-1'};
  const [a,b]=await Promise.all([store.commit(operation,state.revision),store.commit({...operation,operationKey:'stock-2'},state.revision)]);
  assert.equal(a.cloudOk,true);assert.equal(b.cloudOk,false);assert.equal(b.error.code,'MONEY_TEST_CONFLICT');
  const saved=store.read();assert.equal(saved.produtos.length,2);
  assert.equal(saved.produtos[0].precoBRL,state.produtos[0].precoBRL);
  assert.equal(saved.produtos[1].precoBRL,39990);
  assert.equal((await store.commit(operation,state.revision)).cloudOk,true);
  assert.equal(store.read().revision,1);
});
test('quota failure cannot return a successful acknowledgement',async()=>{
  const storage=memory(),store=createMoneyTestStore(storage,mutex()),before=store.read();
  storage.setItem=()=>{throw Error('synthetic quota');};
  const result=await store.commit({changes:[],operationKey:'quota'},before.revision);
  assert.equal(result.cloudOk,false);assert.equal(store.read().revision,before.revision);
});
test('ambiguous legacy cannot have its price silently rewritten',async()=>{
  const store=createMoneyTestStore(memory(),mutex()),state=store.read();
  const result=await store.commit({changes:[{field:'produtos',value:state.produtos.map(p=>p.id==='fixture-ambiguous'?{...p,precoBRL:1}:p)}]},state.revision);
  assert.equal(result.cloudOk,false);assert.equal(result.error.code,'MONEY_LEGACY_AMBIGUOUS');
  assert.equal(store.read().produtos[1].precoBRL,39990);
});
test('PDF is generated from original native sale snapshot, independent of current FX',async()=>{
  const state=createMoneyTestStore(memory(),mutex()).read();
  const sale=fixtureSale(state,[{id:1,formaId:'dinheiro_pyg',moedaOrigem:'PYG',valorOriginal:39990}]);
  state.rates.PYG=999;
  const pdf=await gerarPdfComprovante(sale,{nomeFantasia:'SYNTHETIC TEST',mostrarLogoRecibo:false});
  const text=new TextDecoder('latin1').decode(pdf.bytes);
  assert.match(text,/PYG 39\.990/);assert.doesNotMatch(text,/9\.197\.700/);
  assert.equal(sale.moneySnapshot.total.amount,'39990');
});
