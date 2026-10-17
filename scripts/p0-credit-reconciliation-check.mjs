import assert from 'node:assert/strict';
import {planejarReconciliacoesFiado} from '../src/core/creditReconciliation.js';
const cliente={id:'C1',nome:'Teste',saldoDevedorBRL:0};
const venda={id:'V1',clienteId:'C1',estado:'concluida',tipoDocumento:'venda',pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:200},{formaId:'crediario',valorConvertidoBRL:135}]};
const fiado={id:'F1',tipo:'venda_fiada',formaPagamento:'crediario',referenciaId:'V1',clienteId:'C1',createdAt:'2026-10-17T08:00:00Z',valor:135,saldoClienteAntes:0,saldoClienteDepois:135};
const run=(c=cliente,v=venda,f=[fiado])=>planejarReconciliacoesFiado({clientes:[c],historicoVendas:[v],livroFinanceiro:f});
assert.deepEqual(run(),[{clienteId:'C1',vendaId:'V1',lancamentoId:'F1',saldoAnteriorBRL:0,saldoNovoBRL:135,operationKey:'reconcile-credit:F1'}]);
assert.deepEqual(run({...cliente,saldoDevedorBRL:135}),[]);
assert.deepEqual(run({...cliente,saldoDevedorBRL:20}),[]);
assert.deepEqual(run(cliente,venda,[fiado,{id:'R1',tipo:'recebimento_fiado',clienteId:'C1',valor:25}]),[]);
assert.deepEqual(run(cliente,{...venda,estado:'cancelada'}),[]);
assert.deepEqual(run(cliente,{...venda,pagamentos:[{formaId:'crediario',valorConvertidoBRL:130}]}),[]);
assert.deepEqual(run(cliente,venda,[{...fiado,saldoClienteDepois:130}]),[]);
assert.deepEqual(run(cliente,{...venda,devolucoes:[{id:'D1'}]}),[]);
assert.deepEqual(run(cliente,venda,[fiado,{...fiado,id:'F2',createdAt:'2026-10-17T08:00:01Z'}]),[]);
assert.deepEqual(run({...cliente,saldoDevedorBRL:80},
  venda,[{id:'P',tipo:'recebimento_fiado',clienteId:'C1',createdAt:'2026-10-16T11:00:00Z',saldoClienteDepois:80}, {...fiado,saldoClienteAntes:80,saldoClienteDepois:215}]),
  [{clienteId:'C1',vendaId:'V1',lancamentoId:'F1',saldoAnteriorBRL:80,saldoNovoBRL:215,operationKey:'reconcile-credit:F1'}]);
assert.deepEqual(run({...cliente,saldoDevedorBRL:80},venda,
  [{id:'P',tipo:'recebimento_fiado',clienteId:'C1',createdAt:'2026-10-16T11:00:00Z',saldoClienteDepois:90},{...fiado,saldoClienteAntes:80,saldoClienteDepois:215}]),[]);
assert.deepEqual(run(cliente,venda,[{...fiado,createdAt:'2026-10-15T08:00:00Z'}]),[]);
console.log('PASS: evidence-only credit reconciliation planner (12 cases, no database writes)');
