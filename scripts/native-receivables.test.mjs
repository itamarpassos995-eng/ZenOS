import test from 'node:test';
import assert from 'node:assert/strict';
import {apurarCarteiraNativa,adicionarTituloNativo,receberTituloNativo} from '../src/core/nativeReceivables.js';
const taxas={BRL:1,PYG:1500,USD:0.2,EUR:0.18};
test('PYG permanece nativo após câmbio mudar 1500→1200, sem recalcular contrato',()=>{
 const cliente=adicionarTituloNativo({id:'C',saldoDevedorBRL:20},
  {idVenda:'V1',moedaObrigacao:'PYG',valorOriginal:30000,valorContabilBRL:20});
 assert.equal(apurarCarteiraNativa(cliente,'PYG').totalNativo,30000);
 assert.equal(apurarCarteiraNativa(cliente,'PYG').totalNativo,30000);
 const pagamento=receberTituloNativo(cliente,{moedaPadrao:'PYG',moedaPagamento:'BRL',valorPago:10,taxasCambio:{...taxas,PYG:1200}});
 assert.equal(pagamento.valorAplicadoNativo,12000);
 assert.equal(pagamento.saldoNativo,18000);
 assert.equal(pagamento.cliente.saldoDevedorBRL,12);
 assert.equal(pagamento.variacaoCambialRealizadaBRL,2);
 assert.equal(apurarCarteiraNativa(cliente,'PYG').totalNativo,30000);
});
test('pagamento integral na moeda da dívida não depende de FX',()=>{
 const cliente=adicionarTituloNativo({saldoDevedorBRL:20},{idVenda:'V1',moedaObrigacao:'PYG',valorOriginal:30000,valorContabilBRL:20});
 const r=receberTituloNativo(cliente,{moedaPadrao:'PYG',moedaPagamento:'PYG',valorPago:30000,taxasCambio:{PYG:1200}});
 assert.equal(r.saldoNativo,0);
 assert.equal(r.cliente.saldoDevedorBRL,0);
});
test('legado BRL sem origem documentada nunca vira dívida PYG',()=>{
 const c={saldoDevedorBRL:11706.81};
 assert.equal(apurarCarteiraNativa(c,'PYG').status,'legado_pendente');
 assert.throws(()=>receberTituloNativo(c,{moedaPadrao:'PYG',moedaPagamento:'BRL',valorPago:10,taxasCambio:taxas}),/legado/);
});
test('legado e título novo são contas separadas; não confirmar soma falsa',()=>{
 const c=adicionarTituloNativo({saldoDevedorBRL:100},{idVenda:'V2',moedaObrigacao:'PYG',valorOriginal:30000,valorContabilBRL:20});
 assert.equal(apurarCarteiraNativa(c,'PYG').status,'legado_pendente');
});
test('rejeitar títulos duplicados e dívidas fracionárias em guaranis',()=>{
 const c=adicionarTituloNativo({saldoDevedorBRL:0},{idVenda:'V',moedaObrigacao:'PYG',valorOriginal:1000,valorContabilBRL:1});
 assert.throws(()=>adicionarTituloNativo(c,{idVenda:'V',moedaObrigacao:'PYG',valorOriginal:1000,valorContabilBRL:1}),/duplicado/);
 assert.throws(()=>adicionarTituloNativo(c,{idVenda:'V2',moedaObrigacao:'PYG',valorOriginal:1000.5,valorContabilBRL:1}),/Precisão/);
});
