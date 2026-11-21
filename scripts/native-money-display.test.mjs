import test from 'node:test';
import assert from 'node:assert/strict';
import {formatNativeMinor,formatVerifiedOrPending,nativeCreditLimitMinor} from '../src/core/nativeMoneyDisplay.js';
test('PYG is sovereign, whole unit, Gs style no cents and never R$',()=>{
 assert.equal(formatNativeMinor('20278000','PYG'),'₲ 20.278.000');
 assert.equal(formatNativeMinor('0','PYG'),'₲ 0');
 assert.equal(formatNativeMinor('123450','BRL'),'R$ 1.234,50');
 assert.equal(formatNativeMinor('123450','USD'),'US$ 1,234.50');
});
test('unverified legacy BRL credit limit is not re-labelled as PYG',()=>{
 assert.equal(nativeCreditLimitMinor({limiteCreditoBRL:1000},'PYG'),null);
 assert.equal(formatVerifiedOrPending(null,'PYG'),'Em conciliação');
 assert.equal(nativeCreditLimitMinor({limiteCreditoNativo:{moeda:'PYG',valorMinor:'1000000'},limiteCreditoBRL:100},'PYG'),'1000000');
});
