import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import official from '../src/data/vipeOfficialPrices20261031.js';
import {precoOficialVipePYG} from '../src/core/vipeOfficialCatalog.js';
import {apurarPrecoProdutoNativo} from '../src/core/productMoney.js';
import {VIPE_STORE_ID} from '../src/core/vipeLegacyNative.js';
import {calcularCarrinhoNativoPDV} from '../src/core/nativePdvAccounting.js';
import {criarSnapshotCommercePublico,conferirCarrinhoContraSnapshot} from '../src/core/commercePublicCatalog.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('31 October source preserved with exactly 450 unique migration IDs and integer PYG prices',()=>{
 assert.equal(official.source,'produtos_estoque_tratado.csv');
 assert.equal(official.createdAt,'2026-10-31');
 assert.equal(official.moeda,'PYG');
 assert.equal(official.count,450);
 assert.equal(Object.keys(official.rows).length,450);
 assert.equal(new Set(Object.keys(official.rows)).size,450);
 for(const [id,row] of Object.entries(official.rows)){
  assert.match(id,/^\d+$/);
  assert.equal(row.length,3);
  assert.ok(row[0]&&Number.isSafeInteger(row[1])&&row[1]>=0&&Number.isSafeInteger(row[2])&&row[2]>0);
 }
});
test('all 450 imported records map to their exact contractual source prices',()=>{
 for(const [id,[sku,,price]] of Object.entries(official.rows)){
  const p={id:'VIPE-PROD-'+id,sku,origemMigracao:'VIPE-FPX',idOrigemMigracao:id,precoBRL:1};
  assert.equal(precoOficialVipePYG(p,'precoBRL',VIPE_STORE_ID,'PYG'),price);
 }
});
test('PDV line item uses the current stored price across exchange rates',()=>{
 const p={id:'VIPE-PROD-103',sku:'7891344018126',precoBRL:47000};
 const price=Number(apurarPrecoProdutoNativo(p,'precoBRL','PYG',{},VIPE_STORE_ID).valorMinor);
 assert.equal(calcularCarrinhoNativoPDV({itens:[{id:p.id,qtd:'2',precoOrigemPDV:{valor:price,moeda:'PYG'}}],
  moedaLoja:'PYG',taxas:{PYG:1200},desconto:'0',storeId:VIPE_STORE_ID}).totalMinor,'94000');
 assert.equal(calcularCarrinhoNativoPDV({itens:[{id:p.id,qtd:'2',precoOrigemPDV:{valor:price,moeda:'PYG'}}],
  moedaLoja:'PYG',taxas:{PYG:2000},desconto:'0',storeId:VIPE_STORE_ID}).totalMinor,'94000');
});
test('public commerce price also stays native to PYG when publishing VIPE source',()=>{
 const price=40000;
 const catalog=criarSnapshotCommercePublico({lojaId:VIPE_STORE_ID,
  config:{slug:'vipe-test',moedaPadrao:'PYG',taxasCambio:{PYG:1150}},
  produtos:[{id:'VIPE-PROD-103',nome:'80W90 LUBRAX',estoque:3,precoOriginal:{valor:price,moeda:'PYG'},precoBRL:price/1150}]});
 assert.equal(catalog.produtos[0].precoOriginal.valor,price);
 assert.equal(conferirCarrinhoContraSnapshot(catalog,[{id:'VIPE-PROD-103',quantidade:1}]).totalCentavos,40000);
});
test('stock, POS and public commerce use registered prices without a historical catalog dependency',()=>{
 const stock=read('src/components/Produtos.jsx'),pos=read('src/components/PDV.jsx'),shop=read('src/components/CommerceSolicitacao.jsx');
 assert.match(stock,/apurarPrecoProdutoNativo\(prod,'precoBRL',moedaPadrao,taxasCambio,userId\)/);
 assert.match(pos,/precoOrigemNativaProduto\(itemParaAdicionar,clienteSelecionadoPDV\)/);
 assert.doesNotMatch(shop + read('src/core/productMoney.js'),/vipeOfficialCatalog/);
 assert.match(shop,/precoOriginal: p\.precoOriginal\|\|quantiaOriginalProduto/);
 assert.match(pos,/produtoParaFormularioMonetario\(prod,moeda,converterDeBRL,userId,moedaPadrao\)/);
});
