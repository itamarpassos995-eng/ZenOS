import test from 'node:test';import assert from 'node:assert/strict';
import {calcularCarrinhoNativoPDV} from '../src/core/nativePdvAccounting.js';
import {apurarPrecoProdutoNativo} from '../src/core/productMoney.js';
import {readFileSync} from 'node:fs';
const rates={PYG:'1500',USD:'0.20',EUR:'0.18'};
test('catalog BRL original never becomes a floating PYG native price',()=>{
 const prod={valoresMonetarios:{versao:1,campos:{precoBRL:{valor:100,moeda:'BRL'}}}};
 assert.equal(apurarPrecoProdutoNativo(prod,'precoBRL','PYG',rates).status,'pendente_moeda_contratual');
 assert.equal(apurarPrecoProdutoNativo(prod,'precoBRL','PYG',rates).valorMinor,null);
 assert.throws(()=>calcularCarrinhoNativoPDV({itens:[{qtd:'1',precoOrigemPDV:{valor:100,moeda:'BRL'}}],moedaLoja:'PYG',desconto:'0',taxas:rates}),/contratual fixo/);
});
test('confirmed PYG price is invariant when exchange rate changes',()=>{
 const product={valoresMonetarios:{versao:1,campos:{precoBRL:{valor:30000,moeda:'PYG'}}}};
 assert.equal(apurarPrecoProdutoNativo(product,'precoBRL','PYG',rates).valorMinor,'30000');
 assert.equal(apurarPrecoProdutoNativo(product,'precoBRL','PYG',{...rates,PYG:'1200'}).valorMinor,'30000');
});
test('FX edit does not reprice existing cart items in React effect',()=>{
 const code=readFileSync(new URL('../src/components/PDV.jsx',import.meta.url),'utf8');
 assert.match(code,/Do not overwrite item prices when FX rates change/);
 assert.doesNotMatch(code,/return atualizarCotacaoPrecoItemPDV\(recuperado/);
});
