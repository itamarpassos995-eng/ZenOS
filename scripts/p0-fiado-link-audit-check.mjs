import assert from 'node:assert/strict';
import {auditarVinculosFiado,encontrarConflitosIdsRecebimento} from '../src/core/clientCreditLinkAudit.js';
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
assert(observed[0].problemas.some(p=>p.includes('Nome histórico da venda diferente')));
const consistent=run([{...clientes[0],nome:venda.clienteNome}],[
  {...venda,clienteId:'marcos-id'}
],[{...lancamento,clienteId:'marcos-id'}]);
assert.deepEqual(consistent,[]);
const renamed=run([{...clientes[0],nome:'itagay'}],[
  {...venda,clienteId:'marcos-id'}
],[{...lancamento,clienteId:'marcos-id'}]);
assert(renamed[0].problemas.some(p=>p.includes('informativo')));
const mixed=run(clientes,[{...venda,clienteId:'marcos-id'}],[lancamento]);
assert(mixed[0].problemas.some(p=>p.includes('ID do lançamento')));
const missing=run(clientes,[{...venda,clienteId:'removed-id'}],[]);
assert(missing[0].problemas.some(p=>p.includes('não encontrado')));
const prePedido=run(clientes,[{...venda,tipoDocumento:'pre_pedido',estado:'pendente'}],[lancamento]);
assert.deepEqual(prePedido,[]);
const before=JSON.stringify({clientes,historicoVendas:[venda],livroFinanceiro:[lancamento]});
run();
assert.equal(JSON.stringify({clientes,historicoVendas:[venda],livroFinanceiro:[lancamento]}),before);
// Evidência do usuário: nome antigo do comprovante ≠ nome atual do cadastro,
// mas venda + financeiro + cadastro têm o MESMO ID. Recebimento não pode ser bloqueado.
assert.deepEqual(encontrarConflitosIdsRecebimento({
  clienteId:1790633161249,historicoVendas:[venda],livroFinanceiro:[{...lancamento,createdAt:venda.createdAt}]
}),[]);
const conflicts=encontrarConflitosIdsRecebimento({
  clienteId:1790633161249,
  historicoVendas:[{...venda,clienteId:'another-client-id'}],
  livroFinanceiro:[{...lancamento,createdAt:venda.createdAt}],
});
assert.deepEqual(conflicts,[{
  vendaId:venda.id,clienteIdVenda:'another-client-id',clienteIdFinanceiro:'1790633161249',
}]);
assert.deepEqual(encontrarConflitosIdsRecebimento({
  clienteId:1790633161249,historicoVendas:[{...venda,clienteId:'another-client-id'}],
  livroFinanceiro:[{...lancamento,createdAt:'2026-10-15T10:00:00Z'}]
}),[]);
assert.deepEqual(encontrarConflitosIdsRecebimento({
  clienteId:1790633161249,historicoVendas:[],livroFinanceiro:[{...lancamento,createdAt:venda.createdAt}]
}),[]);
console.log('PASS P0: audit and ID-only receipt safety reading mismatched sale names, IDs and ledger, without modifying any data');
