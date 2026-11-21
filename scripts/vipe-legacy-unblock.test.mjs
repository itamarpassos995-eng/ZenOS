import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyPYGMinor,vipeLegacyPYG,VIPE_STORE_ID} from '../src/core/vipeLegacyNative.js';
import {apurarPrecoProdutoNativo} from '../src/core/productMoney.js';
import {calcularCarrinhoNativoPDV} from '../src/core/nativePdvAccounting.js';
const rates={PYG:'1200',USD:'0.2',EUR:'0.18'};
test('VIPE legacy raw PYG price is stable across currency quotations',()=>{
 const legacy={id:'VIPE-PROD-A',precoBRL:160000};
 assert.equal(apurarPrecoProdutoNativo(legacy,'precoBRL','PYG',rates,VIPE_STORE_ID).valorMinor,'160000');
 assert.equal(apurarPrecoProdutoNativo(legacy,'precoBRL','PYG',{...rates,PYG:'1600'},VIPE_STORE_ID).valorMinor,'160000');
 assert.equal(apurarPrecoProdutoNativo(legacy,'precoBRL','PYG',rates,'ANOTHER_STORE').valorMinor,null);
});
test('native PYG source always overrides fallback',()=>{
 const item={precoBRL:150,valoresMonetarios:{versao:1,campos:{precoBRL:{valor:30000,moeda:'PYG'}}}};
 assert.equal(apurarPrecoProdutoNativo(item,'precoBRL','PYG',rates,VIPE_STORE_ID).valorMinor,'30000');
 assert.equal(apurarPrecoProdutoNativo(item,'precoBRL','PYG',{...rates,PYG:'700'},VIPE_STORE_ID).valorMinor,'30000');
});
test('VIPE legacy cart can be sold in PYG, another store cannot silently infer it',()=>{
 const item={qtd:'1',precoBRL:30000};
 assert.equal(calcularCarrinhoNativoPDV({itens:[item],desconto:'0',moedaLoja:'PYG',taxas:rates,storeId:VIPE_STORE_ID}).totalMinor,'30000');
 assert.throws(()=>calcularCarrinhoNativoPDV({itens:[item],desconto:'0',moedaLoja:'PYG',taxas:rates,storeId:'OTHER'}),/original comprovada/);
});
test('legacy PYG limits are interpreted as exact shop numbers, with no mutation',()=>{
 const client=Object.freeze({limiteCreditoBRL:100000, saldoDevedorBRL:25000});
 assert.equal(legacyPYGMinor(client.limiteCreditoBRL,VIPE_STORE_ID,'PYG'),'100000');
 assert.equal(legacyPYGMinor(client.saldoDevedorBRL,VIPE_STORE_ID,'PYG'),'25000');
 assert.equal(legacyPYGMinor(client.limiteCreditoBRL,'another','PYG'),null);
 assert.equal(client.limiteCreditoBRL,100000);
 assert.equal(vipeLegacyPYG(VIPE_STORE_ID,'BRL'),false);
});
