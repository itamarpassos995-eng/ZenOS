import assert from 'node:assert/strict';
import {auditarVinculosFiado} from '../src/core/clientCreditLinkAudit.js';
const clientes=[{id:'marcos-id',nome:'itagay',saldoDevedorBRL:945},{id:1790633161249,nome:'Constructora del Este S.A.',saldoDevedorBRL:4999.70}];
const venda={id:'VENDA-1792235811140-08elus',tipoDocumento:'venda',estado:'concluida',
  createdAt:'2026-10-17T08:16:51Z',clienteId:1790633161249,clienteNome:'Marcos Roberto (Pinturas & Reformas)',
  pagamentos:[{formaId:'dinheiro_brl',valorConvertidoBRL:100},{formaId:'crediario',valorConvertidoBRL:799.70}]};
const lancamento={id:'F1',tipo:'venda_fiada',referenciaId:venda.id,clienteId:1790633161249,
  clienteNome:venda.clienteNome,valor:799.70};
const run=(c=clientes,v=[venda],l=[lancamento])=>auditarVinculosFiado({clientes:c,historicoVendas:v,livroFinanceiro:l});
const observed=run();
assert.equal(observed.length,1);
assert.equal(observed[0].clienteAtualNome,'Constructora del Este S.A.');
assert.equal(observed[0].valorFiadoBRL,799.70);
assert(observed[0].problemas.some(p=>p.includes('Nome da venda diferente')));
const consistent=run([{...clientes[0],nome:venda.clienteNome}],[
  {...venda,clienteId:'marcos-id'}
],[{...lancamento,clienteId:'marcos-id'}]);
assert.deepEqual(consistent,[]);
const renamed=run([{...clientes[0],nome:'itagay'}],[
  {...venda,clienteId:'marcos-id'}
],[{...lancamento,clienteId:'marcos-id'}]);
assert(renamed[0].problemas.some(p=>p.includes('renomeado')));
const mixed=run(clientes,[{...venda,clienteId:'marcos-id'}],[lancamento]);
assert(mixed[0].problemas.some(p=>p.includes('ID do lançamento')));
const missing=run(clientes,[{...venda,clienteId:'removed-id'}],[]);
assert(missing[0].problemas.some(p=>p.includes('não encontrado')));
const prePedido=run(clientes,[{...venda,tipoDocumento:'pre_pedido',estado:'pendente'}],[lancamento]);
assert.deepEqual(prePedido,[]);
const before=JSON.stringify({clientes,historicoVendas:[venda],livroFinanceiro:[lancamento]});
run();
assert.equal(JSON.stringify({clientes,historicoVendas:[venda],livroFinanceiro:[lancamento]}),before);
console.log('PASS P0: audit only reading mismatched sale names, IDs and ledger, without modifying any data');
