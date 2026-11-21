import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateNativeCart,applyNativePayments,summarizeNativeCash,quoteDisplayOnly} from '../src/core/nativeOperationalAccounting.js';
const rates={BRL:'1',PYG:'1500',USD:'0.20',EUR:'0.18'};
test('USD cart totals in cents, independent of BRL',()=>{
 const c=calculateNativeCart({storeCurrency:'USD',items:[{currency:'USD',priceMinor:'1199',quantity:2},{currency:'USD',priceMinor:'601',quantity:1}],discountMinor:'100'});
 assert.deepEqual(c,{currency:'USD',subtotalMinor:'2999',discountMinor:'100',totalMinor:'2899'});
});
test('PYG cart has no cents and mixed currency products fail closed',()=>{
 const c=calculateNativeCart({storeCurrency:'PYG',items:[{currency:'PYG',priceMinor:'30000',quantity:2}]});
 assert.equal(c.totalMinor,'60000');
 assert.throws(()=>calculateNativeCart({storeCurrency:'PYG',items:[{currency:'USD',priceMinor:'100',quantity:1}]}),/currency/);
});
test('cash drawer keeps physical PYG and USD book credit independent',()=>{
 const ev=applyNativePayments({saleId:'V',storeCurrency:'USD',totalMinor:'1000',rates,
 payments:[{id:'P',currency:'PYG',receivedMinor:'75000'}]});
 const cash=summarizeNativeCash({storeCurrency:'USD',opening:{PYG:'5000',USD:'100'},events:ev.events});
 assert.equal(cash.physicalByCurrency.PYG,'80000');
 assert.equal(cash.physicalByCurrency.USD,'100');
 assert.equal(cash.creditedMinor,'1000');
 assert.equal(ev.settled.outstandingMinor,'0');
 assert.equal(quoteDisplayOnly({nativeAmountMinor:'1000',nativeCurrency:'USD',targetCurrency:'PYG',rates}).amountMinor,'75000');
});
test('duplicate IDs rejected instead of double booking',()=>{
 const ev=applyNativePayments({saleId:'V',storeCurrency:'USD',totalMinor:'1000',rates,
 payments:[{id:'same',currency:'USD',receivedMinor:'500'},{id:'same',currency:'USD',receivedMinor:'500'}]});
 assert.throws(()=>summarizeNativeCash({storeCurrency:'USD',events:ev.events}),/Duplicate/);
});
