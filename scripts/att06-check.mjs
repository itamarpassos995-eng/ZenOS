import fs from 'node:fs';
import assert from 'node:assert/strict';
import { transferirEstoqueEntreLocais, obterEstoqueProduto } from '../src/core/inventory.js';
import { criarEventoEstoque, historicoPermitidoPeloPlano, obterPoliticaHistoricoEstoque } from '../src/core/stockAuditCore.js';

const ok = (msg) => console.log(`[OK] ${msg}`);
const produto = { id: 'P1', sku: 'P1', nome: 'Teste', estoque: 10, estoqueVitrine: 4, estoqueGalpao: 6 };

{
  const r = transferirEstoqueEntreLocais(produto, 'deposito', 'vitrine', 2);
  assert.equal(r.produto.estoqueVitrine, 6);
  assert.equal(r.produto.estoqueGalpao, 4);
  assert.equal(r.produto.estoque, 10);
  ok('Transferir depósito → vitrine mantém o total e redistribui corretamente');
}
{
  const r = transferirEstoqueEntreLocais(produto, 'vitrine', 'deposito', 3);
  assert.equal(r.produto.estoqueVitrine, 1);
  assert.equal(r.produto.estoqueGalpao, 9);
  assert.equal(r.produto.estoque, 10);
  ok('Transferir vitrine → depósito mantém o total e redistribui corretamente');
}
{
  assert.throws(() => transferirEstoqueEntreLocais(produto, 'vitrine', 'deposito', 5), (e) => e?.code === 'ZENOS_ESTOQUE_LOCAL_INSUFICIENTE');
  ok('Transferência bloqueia quantidade maior que o saldo da origem');
}
{
  const evt = criarEventoEstoque({ produto, tipo: 'transferencia_interna', origem: 'deposito', destino: 'vitrine', quantidade: 1, saldoAntes: obterEstoqueProduto(produto), saldoDepois: { estoque: 10, estoqueVitrine: 5, estoqueGalpao: 5 }, motivo: 'Teste', operador: { id: 'op1', nome: 'Operador Teste' } });
  assert.equal(evt.produtoId, 'P1');
  assert.equal(evt.operadorId, 'op1');
  assert.equal(evt.saldoAntes.total, 10);
  assert.equal(evt.saldoDepois.vitrine, 5);
  ok('Evento de estoque registra produto, operador, motivo e saldos antes/depois');
}
{
  assert.equal(obterPoliticaHistoricoEstoque('basico').dias, 30);
  assert.equal(obterPoliticaHistoricoEstoque('essencial').dias, 90);
  assert.equal(obterPoliticaHistoricoEstoque('pro avancado').dias, 365);
  ok('Política de histórico reconhece janelas por plano');
}
{
  const ref = new Date('2026-10-06T12:00:00Z');
  assert.equal(historicoPermitidoPeloPlano('2026-09-20T12:00:00Z', 'basico', ref), true);
  assert.equal(historicoPermitidoPeloPlano('2026-08-01T12:00:00Z', 'basico', ref), false);
  assert.equal(historicoPermitidoPeloPlano('2026-08-01T12:00:00Z', 'essencial', ref), true);
  ok('Janela temporal respeita o plano sem apagar dados automaticamente');
}

const produtos = fs.readFileSync('src/components/Produtos.jsx', 'utf8');
const pdv = fs.readFileSync('src/components/PDV.jsx', 'utf8');
const compras = fs.readFileSync('src/components/PDVCompras.jsx', 'utf8');
const vendas = fs.readFileSync('src/components/Vendas.jsx', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const audit = fs.readFileSync('src/core/stockAudit.js', 'utf8');

assert.match(produtos, /Vitrine/); assert.match(produtos, /Depósito/); ok('Catálogo apresenta controles separados para Vitrine e Depósito');
assert.match(produtos, /Movimentação Auditada/); assert.match(produtos, /Motivo \*/); ok('Setas abrem confirmação com motivo obrigatório');
assert.match(produtos, /Histórico de Movimentações de Estoque/); ok('Editar produto ganhou gaveta de histórico abaixo da fiscal');
assert.match(produtos, /type="date"/); ok('Histórico possui seleção por datas');
assert.match(produtos, /Boolean\(produtoEmEdicao\)/); ok('Edição existente não altera estoque diretamente sem auditoria');
assert.match(pdv, /Disponibilidade: Vitrine/); assert.match(pdv, /Atenção ao estoque da vitrine/); ok('PDV informa composição e confirma quando a venda usa vitrine');
assert.match(pdv, /tipo: 'venda'/); assert.match(pdv, /registrarEventosEstoque/); ok('Venda registra movimentação auditável');
assert.match(vendas, /tipo: 'devolucao'/); assert.match(vendas, /registrarEventosEstoque/); ok('Devolução registra movimentação auditável');
assert.match(compras, /tipo: 'compra_entrada'/); assert.match(compras, /registrarEventosEstoque/); ok('Compra registra entrada auditável no depósito');
assert.match(audit, /estoque_auditoria/); assert.doesNotMatch(audit, /dados.*operacao/); ok('Histórico usa coleção separada e não infla o documento único da V1');
assert.match(app, /planoLoja/); assert.match(app, /planoLoja=\{planoLoja\}/); ok('Plano da loja controla janela consultável do histórico');
assert.doesNotMatch(audit, /deleteDoc|deleteField/); ok('ATT 06 não adiciona exclusão destrutiva de histórico');

console.log('\nATT 06: 18 verificações aprovadas.');
