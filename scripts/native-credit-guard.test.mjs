import test from 'node:test';import assert from 'node:assert/strict';
import {validarCapacidadeCreditoNativa} from '../src/core/nativeCreditGuard.js';
const c={saldoDevedorBRL:0,limiteCreditoNativo:{moeda:'PYG',valorMinor:'100000'},titulosFiadoNativos:[]};
test('native PYG capacity does not depend on current FX',()=>{
 assert.equal(validarCapacidadeCreditoNativa(c,'PYG','90000').ok,true);
 assert.equal(validarCapacidadeCreditoNativa(c,'PYG','100001').codigo,'NATIVE_CREDIT_LIMIT_EXCEEDED');
});
test('unverified historical amount cannot be treated as PYG',()=>{
 assert.equal(validarCapacidadeCreditoNativa({...c,saldoDevedorBRL:10},'PYG','1').codigo,'NATIVE_CREDIT_LEGACY_RECONCILIATION_REQUIRED');
});
test('concurrent native titles must be part of guarded customer snapshot',()=>{
 const x={...c,saldoDevedorBRL:20,titulosFiadoNativos:[{
 idVenda:'v',moeda:'PYG',valorOriginal:30000,saldoOriginal:30000,saldoContabilBRL:20}]};
 assert.equal(validarCapacidadeCreditoNativa(x,'PYG','70000').ok,true);
 assert.equal(validarCapacidadeCreditoNativa(x,'PYG','70001').ok,false);
});
