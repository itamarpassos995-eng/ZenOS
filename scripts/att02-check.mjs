import assert from 'node:assert/strict';
import {
  aplicarEstoqueNormalizado,
  aplicarVendaAoEstoque,
  baixarEstoqueProduto,
  calcularAlocacaoReposicaoDevolucao,
  reporEstoqueProduto,
} from '../src/core/inventory.js';
import {
  calcularValorDevolucaoAtual,
  obterFinanceiroVenda,
  precoLiquidoUnitarioItem,
} from '../src/core/salesFinancials.js';
import fs from 'node:fs';

const ok = (nome) => console.log(`[OK] ${nome}`);
const quase = (a, b, eps = 0.001) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// Cenário real observado pelo usuário.
const deposito50 = { id: 'P1', nome: 'tinta teste', estoque: 50, estoqueVitrine: 0, estoqueGalpao: 50, tipoItem: 'mercadoria' };
const venda30 = aplicarVendaAoEstoque([deposito50], [{ id: 'linha-1', produtoOriginalId: 'P1', nome: 'tinta teste', qtd: '30', tipoItem: 'mercadoria', precoPraticadoBRL: 80, custoBRL: 50 }]);
assert.equal(venda30.produtos[0].estoque, 20);
assert.equal(venda30.produtos[0].estoqueVitrine, 0);
assert.equal(venda30.produtos[0].estoqueGalpao, 20);
assert.deepEqual(venda30.itens[0].movimentoEstoqueVenda, { vitrine: 0, galpao: 30, total: 30 });
ok('Cenário real: depósito 50 - venda 30 = depósito/total 20');

const alocRet10 = calcularAlocacaoReposicaoDevolucao(venda30.itens[0], 0, 10);
const retorno10 = reporEstoqueProduto(venda30.produtos[0], 10, alocRet10);
assert.equal(retorno10.produto.estoque, 30);
assert.equal(retorno10.produto.estoqueVitrine, 0);
assert.equal(retorno10.produto.estoqueGalpao, 30);
ok('Cenário real: devolução 10 repõe depósito e total para 30');

const misto = baixarEstoqueProduto({ id: 'P2', estoque: 50, estoqueVitrine: 10, estoqueGalpao: 40 }, 15);
assert.deepEqual(misto.movimento, { vitrine: 10, galpao: 5, total: 15 });
assert.equal(misto.produto.estoqueVitrine, 0);
assert.equal(misto.produto.estoqueGalpao, 35);
assert.equal(misto.produto.estoque, 35);
ok('Venda consome vitrine primeiro e depois galpão');

const retParcial1 = calcularAlocacaoReposicaoDevolucao({ movimentoEstoqueVenda: misto.movimento }, 0, 6);
assert.deepEqual(retParcial1, { vitrine: 6, galpao: 0, total: 6 });
const retParcial2 = calcularAlocacaoReposicaoDevolucao({ movimentoEstoqueVenda: misto.movimento }, 6, 6);
assert.deepEqual(retParcial2, { vitrine: 4, galpao: 2, total: 6 });
ok('Devoluções parciais cumulativas repõem a mesma origem da venda');

const legadoInconsistente = aplicarEstoqueNormalizado({ id: 'LEG', estoque: 20, estoqueVitrine: 0, estoqueGalpao: 50 });
assert.equal(legadoInconsistente.estoque, 20);
assert.equal(legadoInconsistente.estoqueVitrine, 0);
assert.equal(legadoInconsistente.estoqueGalpao, 20);
ok('Compatibilidade corrige divergência antiga sem aumentar o total canônico');

assert.throws(
  () => baixarEstoqueProduto({ id: 'P3', nome: 'P3', estoque: 3 }, 4),
  (erro) => erro?.code === 'ZENOS_ESTOQUE_INSUFICIENTE',
);
ok('Venda acima do estoque é bloqueada em vez de esconder saldo negativo');

const vendaSemDesconto = {
  totalBRL: 2400,
  lucroBRL: 900,
  itens: [{ id: 'linha-1', produtoOriginalId: 'P1', qtd: 30, precoPraticadoBRL: 80, custoBRL: 50 }],
};
const itensDev = { 'linha-1': { qtdSendoDevolvidaAgora: 10, precoBRL: 80, custoBRL: 50 } };
assert.equal(calcularValorDevolucaoAtual(vendaSemDesconto, itensDev), 800);
ok('Devolução sem desconto usa valor pago do item');

const vendaComDesconto = {
  totalBRL: 90,
  lucroBRL: 50,
  itens: [{ id: 'l1', qtd: 2, precoPraticadoBRL: 50, custoBRL: 20 }],
};
assert.equal(precoLiquidoUnitarioItem(vendaComDesconto, vendaComDesconto.itens[0]), 45);
assert.equal(calcularValorDevolucaoAtual(vendaComDesconto, { l1: { qtdSendoDevolvidaAgora: 1, precoBRL: 50, custoBRL: 20 } }), 45);
ok('Devolução respeita desconto global e não devolve mais do que foi pago');

const historicaParcial = {
  totalBRL: 100,
  lucroBRL: 60,
  itens: [{ qtd: 2, qtdDevolvida: 1, precoPraticadoBRL: 50, custoBRL: 20 }],
};
const fin = obterFinanceiroVenda(historicaParcial);
assert.equal(fin.valorDevolvidoBRL, 50);
assert.equal(fin.totalLiquidoBRL, 50);
assert.equal(fin.custoDevolvidoBRL, 20);
assert.equal(fin.lucroLiquidoBRL, 30);
ok('Venda parcial antiga ganha leitura financeira líquida sem reescrever total original');

const pdv = fs.readFileSync(new URL('../src/components/PDV.jsx', import.meta.url), 'utf8');
const vendas = fs.readFileSync(new URL('../src/components/Vendas.jsx', import.meta.url), 'utf8');
assert.match(pdv, /aplicarVendaAoEstoque/);
assert.match(pdv, /movimentoEstoqueVenda|resultadoEstoque\.itens/);
assert.match(vendas, /produtoOriginalId/);
assert.match(vendas, /valorDevolvidoBRL/);
assert.match(vendas, /totalLiquidoBRL/);
assert.doesNotMatch(vendas, /zenosStorage\.setItem\('zenos_produtos'/);
ok('PDV e devolução usam os novos motores sem persistência genérica concorrente');

console.log('\nATT 02: 10 grupos de verificações aprovados.');
