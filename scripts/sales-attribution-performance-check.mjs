import assert from 'node:assert/strict';
import { autoriaDoOperador, autoriaDoDocumento, resolverAutoriaVenda } from '../src/core/salesAttribution.js';
import { filtrarVendasHojeVisiveis } from '../src/core/salesTodayScope.js';
import { indexarProdutosPDV, indexarClientesPDV, buscarProdutosPDV, buscarClientesPDV } from '../src/core/pdvSearch.js';

const vendedor = { id: 'vend-ana', nome: 'Ana' };
const caixa = { id: 'cx-bruno', nome: 'Bruno' };
const prePedido = { id: 'pre-1', vendedorId: vendedor.id, vendedorNome: vendedor.nome, estado: 'pendente' };
assert.deepEqual(autoriaDoOperador(vendedor), { vendedorId: 'vend-ana', vendedorNome: 'Ana' });
assert.deepEqual(autoriaDoDocumento(prePedido), { vendedorId: 'vend-ana', vendedorNome: 'Ana' });

const autorConfirmado = resolverAutoriaVenda({
  operadorAtivo: caixa,
  autoriaAtendimento: { vendedorId: caixa.id, vendedorNome: caixa.nome },
  documentoConfirmado: prePedido,
});
assert.equal(autorConfirmado.vendedorId, vendedor.id, 'documento confirmado prevalece sobre caixa e rascunho');
assert.deepEqual(resolverAutoriaVenda({ operadorAtivo: caixa, autoriaAtendimento: autoriaDoOperador(vendedor) }),
  autoriaDoOperador(vendedor), 'o rascunho conserva a autoria do atendimento');
assert.deepEqual(resolverAutoriaVenda({ operadorAtivo: caixa }), autoriaDoOperador(caixa),
  'venda nova pertence ao operador que iniciou o atendimento');

const hoje = new Date(2026, 9, 25, 12).toISOString();
const vendas = [{ ...autorConfirmado, id: 'venda-paga', createdAt: hoje, estado: 'concluida', totalBRL: 125,
  finalizadoPorId: caixa.id, finalizadoPorNome: caixa.nome }];
const consultar = (operador, patente = 'vendedor') => filtrarVendasHojeVisiveis({
  historicoVendas: vendas, operadorAtivo: operador, patenteUsuario: patente,
  referencia: new Date(2026, 9, 25, 14),
});
assert.equal(consultar(vendedor).reduce((s, v) => s + v.totalBRL, 0), 125);
assert.equal(consultar(caixa).length, 0, 'o caixa não ganha o crédito comercial alheio');
assert.equal(consultar({ id: 'admin' }, 'gerencia').reduce((s, v) => s + v.totalBRL, 0), 125);
assert.equal(filtrarVendasHojeVisiveis({ historicoVendas: [{ ...prePedido, createdAt: hoje }],
  operadorAtivo: vendedor, referencia: new Date(2026, 9, 25, 14) }).length, 0,
  'pré-pedido ainda não pago não entra no faturamento');

const produtos = Array.from({ length: 5000 }, (_, i) => ({
  id: `p-${i}`, nome: `Produto ${i}`, sku: `SKU-${i}`, grupo: 'Geral', estoque: 10,
}));
const indiceProdutos = indexarProdutosPDV(produtos);
assert.equal(buscarProdutosPDV(indiceProdutos, '').length, 0, 'nenhuma busca não deve montar o catálogo');
assert.equal(buscarProdutosPDV(indiceProdutos, 'produto').length, 40, 'limite de sugestões evita DOM gigante');
assert.equal(buscarProdutosPDV(indiceProdutos, 'sku-4999')[0].id, 'p-4999');
const clientes = Array.from({ length: 3000 }, (_, i) => ({ id: `c-${i}`, nome: `Cliente ${i}` }));
assert.equal(buscarClientesPDV(indexarClientesPDV(clientes), 'cliente').length, 12);

console.log('Autoria protegida e busca local limitada: 13 cenários aprovados, sem consultas adicionais.');
