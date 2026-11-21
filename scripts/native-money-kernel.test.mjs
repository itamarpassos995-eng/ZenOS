import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoney,formatMoneyMinor,convertMinorDirect,createNativeContract,sumNative,prepareIncomingPayment,settleNativeDebt} from '../src/core/nativeMoneyKernel.js';
const rates={PYG:'1500',USD:'0.20',EUR:'0.18'};
test('precision: PYG whole only; BRL USD EUR cents',()=>{
 assert.equal(parseMoney('75000','PYG'),'75000');
 assert.throws(()=>parseMoney('75000.50','PYG'),/fraction/);
 assert.equal(parseMoney('10.09','USD'),'1009');
 assert.equal(formatMoneyMinor('1009','USD'),'10.09');
 assert.equal(formatMoneyMinor('75000','PYG'),'75000');
});
test('store USD: PYG received converts directly to USD, with frozen rates',()=>{
 const sale=createNativeContract({id:'v',storeCurrency:'USD',amountMinor:1000});
 assert.equal(convertMinorDirect('75000','PYG','USD',rates),'1000');
 const event=prepareIncomingPayment({paymentId:'p1',storeCurrency:'USD',paymentCurrency:'PYG',receivedMinor:'75000',rates});
 assert.equal(event.receivedMinor,'75000');
 assert.equal(event.creditedMinor,'1000');
 assert.equal(settleNativeDebt({debt:sale,paidEvents:[event]}).outstandingMinor,'0');
 assert.equal(settleNativeDebt({debt:sale,paidEvents:[event]}).currency,'USD');
 const changed={...rates,PYG:'1200'};
 assert.equal(convertMinorDirect('75000','PYG','USD',changed),'1250');
 assert.equal(event.creditedMinor,'1000');
});
test('PYG 30000 is immutable if exchange rate changes',()=>{
 const debt=createNativeContract({id:'v',storeCurrency:'PYG',amountMinor:'30000'});
 const half=prepareIncomingPayment({paymentId:'p',storeCurrency:'PYG',paymentCurrency:'BRL',receivedMinor:'1000',rates:{...rates,PYG:'1200'}});
 assert.equal(half.creditedMinor,'12000');
 assert.equal(settleNativeDebt({debt,paidEvents:[half]}).outstandingMinor,'18000');
 assert.equal(debt.amountMinor,'30000');
 assert.equal(convertMinorDirect('30000','PYG','BRL',rates),'2000');
 assert.equal(convertMinorDirect('30000','PYG','BRL',{...rates,PYG:'1200'}),'2500');
});
test('mixed payments in USD store add native USD without double rounding',()=>{
 const e1=prepareIncomingPayment({paymentId:'a',storeCurrency:'USD',paymentCurrency:'PYG',receivedMinor:'37500',rates});
 const e2=prepareIncomingPayment({paymentId:'b',storeCurrency:'USD',paymentCurrency:'USD',receivedMinor:'500',rates});
 assert.equal(sumNative([e1,e2],'USD'),'1000');
 assert.throws(()=>sumNative([{currency:'BRL',amountMinor:'100'}],'USD'),/Mixed/);
});
test('non-terminating direct conversion only rounds once at destination',()=>{
 assert.equal(convertMinorDirect('1','PYG','USD',{...rates,PYG:'3'}),'7');
 assert.equal(convertMinorDirect('1','PYG','PYG',rates),'1');
 assert.throws(()=>convertMinorDirect('1','PYG','USD',{...rates,PYG:'0'}),/positive/);
});
