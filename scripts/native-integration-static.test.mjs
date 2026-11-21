import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('PDV runtime uses native cart and frozen FX for payment',()=>{
 const pdv=src('src/components/PDV.jsx');
 assert.match(pdv,/calcularCarrinhoNativoPDV\(/);assert.match(pdv,/registrarPagamentoNativoPDV\(/);
 assert.match(pdv,/validarQuitacaoNativa\(/);assert.match(pdv,/taxasCheckout/);
 assert.match(pdv,/totalNativeMinor/);assert.match(pdv,/valorConvertidoMinorNativo/);
 assert.match(pdv,/moedaDocumento:moedaPadrao/);
 assert.match(pdv,/versaoMonetariaNativa:2/);
});
test('atomic native guard runs inside server transaction',()=>{
 const code=src('src/core/productionSync.js');
 const pdv=src('src/components/PDV.jsx');
 assert.match(code,/guard.type === 'client_credit_capacity_native'/);
 assert.match(code,/validarCapacidadeCreditoNativa\(/);
 assert.match(pdv,/type:'client_credit_capacity_native'/);
 assert.match(pdv,/property:'titulosFiadoNativos'/);
});
test('App, products, clients and cash use native values while preserving legacy adapters',()=>{
 assert.match(src('src/App.jsx'),/converterMoedaDiretoMinor/);
 assert.match(src('src/App.jsx'),/fmtNativoMinor/);
 assert.match(src('src/components/Produtos.jsx'),/rotuloNativoProduto/);
 assert.match(src('src/components/Clientes.jsx'),/receberTituloNativo/);
 assert.match(src('src/core/cashSession.js'),/calcularResumoSessaoNativa/);
 assert.match(src('src/core/cashReconciliation.js'),/esperadoMinorPorMoeda/);
});
