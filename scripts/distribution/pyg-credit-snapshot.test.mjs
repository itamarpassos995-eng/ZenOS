import assert from 'node:assert/strict';
import test from 'node:test';
import {pygCreditSnapshot} from '../../src/core/distribution/trips.js';

const sale={currency:'PYG',totalOriginal:199950,totalCentsBRL:15000,creditCentsBRL:15000,rate:1333};

test('preserves the original whole-guarani amount for verified full credit',()=>{
 assert.deepEqual(pygCreditSnapshot(sale),{currency:'PYG',amountMinor:199950,historicalRate:'1333'});
});

test('leaves unsupported or unreconciled obligations without native evidence',()=>{
 for(const changes of [
  {currency:'BRL'},
  {totalOriginal:199950.5},
  {creditCentsBRL:10000},
  {rate:1400},
  {rate:undefined},
 ]){
  assert.equal(pygCreditSnapshot({...sale,...changes}),null);
 }
});
