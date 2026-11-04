import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeFromOperatorInputs, operatorInputsFromRates, displayOperatorInputs } from '../src/core/exchangeOperatorConfig.js';
import { money,formatMoney } from '../src/core/money.js';
import { bridgeConvert } from '../src/core/moneyProductBridge.js';
const at='2026-11-04T18:00:00.000Z';
test('uses the exact operator convention and parameters from the screenshots',()=>{
  const exchange=exchangeFromOperatorInputs({USD:'5.40',EUR:'6.05',PYG:'1150'});
  assert.deepEqual(displayOperatorInputs(exchange.inputs),{USD:'5.40',EUR:'6.05',PYG:'1150'});
  const original=money('39990','PYG','screenshot-regression');
  const brl=bridgeConvert(original,'BRL',exchange.rates,at).value;
  assert.equal(formatMoney(brl,{locale:'pt-BR'}),'BRL 34,77');
  assert.equal(formatMoney(original,{locale:'pt-BR'}),'PYG 39.990');
  assert.equal(bridgeConvert(money('1','USD','test'),'BRL',exchange.rates,at).value.amount,'5.4');
  assert.equal(bridgeConvert(money('1','EUR','test'),'BRL',exchange.rates,at).value.amount,'6.05');
  assert.equal(bridgeConvert(money('1','BRL','test'),'PYG',exchange.rates,at).value.amount,'1150');
  assert.deepEqual(operatorInputsFromRates(exchange.rates),exchange.inputs);
  assert.equal(original.amount,'39990');
});
test('accepts the existing official dot/comma input formats without reversing the quote',()=>{
  const a=exchangeFromOperatorInputs({USD:'5,40',EUR:'6,05',PYG:'1.150'});
  const b=exchangeFromOperatorInputs({USD:'5.40',EUR:'6.05',PYG:'1150'});
  assert.deepEqual(a,b);
  assert.equal(bridgeConvert(money('1','USD','test'),'PYG',a.rates,at).value.amount,'6210');
});
test('invalid or missing operator input does not produce replacement rates',()=>{
  for(const value of ['','0','-1','abc','5.4.0']) assert.throws(()=>exchangeFromOperatorInputs({USD:value,EUR:'6.05',PYG:'1150'}));
  assert.throws(()=>exchangeFromOperatorInputs({USD:'5.40',EUR:'6.05',PYG:'1150,50'}));
});
