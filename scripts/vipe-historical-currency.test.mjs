import test from 'node:test';
import assert from 'node:assert/strict';
import {VIPE_STORE_ID,legacyPYGMinor,legacyCreditPYGMinor,vipeReceivableMinor} from '../src/core/vipeLegacyNative.js';
import {apurarCarteiraNativa} from '../src/core/nativeReceivables.js';
import {receberFiadoLegadoVipe} from '../src/core/vipeCreditSettlement.js';
import {validarCapacidadeCreditoNativa} from '../src/core/nativeCreditGuard.js';
const vipe=VIPE_STORE_ID,rate={PYG:'1150',USD:'0.2',EUR:'0.18'};
test('11,706.81 BRL historical credit becomes 13,462,832 PYG, never 11,707',()=>{
 assert.equal(legacyCreditPYGMinor(11706.81,vipe,'PYG'),'13462832');
 assert.equal(legacyCreditPYGMinor(1000,vipe,'PYG'),'1150000');
 assert.equal(legacyCreditPYGMinor(11706.81,vipe,'BRL'),null);
 assert.equal(legacyCreditPYGMinor(11706.81,'other','PYG'),null);
 const c={saldoDevedorBRL:11706.81};
 const carteira=apurarCarteiraNativa(c,'PYG');
 assert.equal(vipeReceivableMinor(c,carteira,vipe,'PYG'),'13462832');
 assert.equal(vipeReceivableMinor(c,carteira,'other','PYG'),null);
});
test('legacy credit remains the same after changes of current payment FX',()=>{
 const c={saldoDevedorBRL:11706.81};
 const r=apurarCarteiraNativa(c,'PYG');
 assert.equal(vipeReceivableMinor(c,r,vipe,'PYG'),'13462832');
 const changed={...rate,PYG:'1800'};
 assert.equal(vipeReceivableMinor(c,apurarCarteiraNativa(c,'PYG'),vipe,'PYG'),'13462832');
 assert.equal(changed.PYG,'1800');
});
test('old PYG product numeric price remains nominal without multiplying by 1150',()=>{
 assert.equal(legacyPYGMinor(160000,vipe,'PYG'),'160000');
 assert.equal(legacyPYGMinor(160000,'other','PYG'),null);
});
test('partial legacy PYG receipt freezes the original remainder irrespective of FX',()=>{
 const c={id:'C1',saldoDevedorBRL:11706.81,limiteCreditoBRL:20000};
 const r=receberFiadoLegadoVipe(c,apurarCarteiraNativa(c,'PYG'),{
  storeId:vipe,moedaPadrao:'PYG',moedaPagamento:'PYG',valorPago:1150000,taxasCambio:rate
 });
 assert.equal(r.valorAplicadoNativo,1150000);
 assert.equal(r.saldoNativo,12312832);
 assert.equal(vipeReceivableMinor(r.cliente,apurarCarteiraNativa(r.cliente,'PYG'),vipe,'PYG'),'12312832');
 assert.equal(r.cliente.fiadoLegadoSaldoOriginalMinor,'12312832');
 assert.equal(r.cliente.saldoDevedorBRL,10706.81);
 assert.equal(vipeReceivableMinor(r.cliente,apurarCarteiraNativa(r.cliente,'PYG'),vipe,'PYG'),'12312832');
});
test('legacy credit capacity validated in native PYG with fixed historical rate',()=>{
 const c={saldoDevedorBRL:11706.81,limiteCreditoBRL:12000};
 assert.equal(validarCapacidadeCreditoNativa(c,'PYG','100000',vipe).ok,true);
 assert.equal(validarCapacidadeCreditoNativa(c,'PYG','400000',vipe).codigo,'NATIVE_CREDIT_LIMIT_EXCEEDED');
 assert.equal(validarCapacidadeCreditoNativa(c,'PYG','100000','other').ok,false);
});
test('historical BRL values cannot be accidentally relabeled as native in other stores',()=>{
 assert.equal(legacyCreditPYGMinor(1000,'another','PYG'),null);
 assert.throws(()=>receberFiadoLegadoVipe({saldoDevedorBRL:1},{status:'legado_pendente',legadoBRL:1,nativoComprovado:0},{
  storeId:'another',moedaPadrao:'PYG',moedaPagamento:'PYG',valorPago:100,taxasCambio:rate
 }),/não autorizado/);
});
