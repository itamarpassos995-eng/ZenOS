import fs from 'node:fs';
import assert from 'node:assert/strict';
import { normalizarProduto, normalizarCliente, produtosIniciais, clientesIniciais } from '../src/data.js';
import { detectarConflitosIdentidadeProdutos, chaveAuditoriaProduto, localizarIndiceProdutoUnico } from '../src/core/productIdentity.js';
import { aplicarVendaAoEstoque, preverBaixaEstoqueProduto } from '../src/core/inventory.js';

const ok = (msg) => console.log(`[OK] ${msg}`);

assert.equal(new Set(produtosIniciais.map(p => String(p.id))).size, produtosIniciais.length);
ok('Produtos padrão possuem IDs distintos');
assert.equal(new Set(clientesIniciais.map(c => String(c.id))).size, clientesIniciais.length);
ok('Clientes padrão possuem IDs distintos');

const ids = new Set(Array.from({length: 200}, () => String(normalizarProduto({}).id)));
assert.equal(ids.size, 200);
ok('Geração de novos produtos não colide em lote');
const idsCli = new Set(Array.from({length: 200}, () => String(normalizarCliente({}).id)));
assert.equal(idsCli.size, 200);
ok('Geração de novos clientes não colide em lote');

const catalogo = [
  { id: 'MESMO', sku: 'A', nome: 'A', estoque: 5, estoqueVitrine: 2, estoqueGalpao: 3 },
  { id: 'MESMO', sku: 'B', nome: 'B', estoque: 7, estoqueVitrine: 0, estoqueGalpao: 7 },
];
assert.equal(localizarIndiceProdutoUnico(catalogo, {id:'MESMO', sku:'B'}), 1);
ok('ID legado duplicado pode ser desambiguado por SKU');
assert.throws(() => localizarIndiceProdutoUnico([{...catalogo[0]}, {...catalogo[0]}], {id:'MESMO', sku:'A'}), /Conflito de identidade/);
ok('Duplicata exata é bloqueada em vez de alterar dois produtos');
assert.equal(detectarConflitosIdentidadeProdutos(catalogo).length, 1);
ok('Diagnóstico detecta IDs duplicados');
assert.notEqual(chaveAuditoriaProduto('MESMO','A'), chaveAuditoriaProduto('MESMO','B'));
ok('Histórico de estoque usa chave distinta por ID + SKU');

const venda = aplicarVendaAoEstoque(catalogo, [{ id:'linha', produtoOriginalId:'MESMO', produtoOriginalSku:'A', sku:'A', nome:'A', qtd:1 }]);
assert.equal(venda.produtos[0].estoque, 4);
assert.equal(venda.produtos[1].estoque, 7);
ok('Venda com ID legado repetido altera somente o SKU correto');

const misto = { id:'P1', sku:'P1', estoque:10, estoqueVitrine:2, estoqueGalpao:8 };
const prev = preverBaixaEstoqueProduto(misto, 5);
assert.deepEqual(prev.movimento, {vitrine:2, galpao:3, total:5});
ok('Prévia informa exatamente quanto sairá da vitrine e do depósito');

const pdv = fs.readFileSync('src/components/PDV.jsx','utf8');
const att081Ativa = fs.existsSync('scripts/att081-check.mjs');
if (att081Ativa) {
  assert.match(pdv, /Vitrine \/ Loja/);
  assert.match(pdv, /Galpão \/ Depósito/);
  assert.match(pdv, /estoqueVitrineNovo \+ estoqueGalpaoNovo/);
  ok('ATT 08.1 autorizada: produto rápido do PDV informa Vitrine e Depósito separadamente');
} else {
  assert.match(pdv, /estoqueVitrine: 0,\s*estoqueGalpao: usoUnicoEncomendado \? 0 : estoque/);
  ok('Produto rápido do PDV entra no depósito, não automaticamente na vitrine');
}
assert.match(pdv, /Disponibilidade: Vitrine/);
assert.match(pdv, /Atenção ao estoque da vitrine/);
ok('PDV avisa composição de estoque e confirma uso da vitrine');
assert.match(pdv, /produtoOriginalSku: itemParaAdicionar\.sku/);
ok('Venda preserva SKU original para identidade segura');
assert.match(pdv, /obterProdutoCatalogoSeguro/);
assert.match(pdv, /reprecificação por cliente/);
ok('Reprecificação do PDV usa produto original, não o ID temporário da linha');

const compras = fs.readFileSync('src/components/PDVCompras.jsx','utf8');
assert.match(compras, /produtoOriginalSku: itemParaAdicionar\.sku/);
assert.match(compras, /preflight de identidade/);
ok('Compras preservam SKU original e fazem preflight antes de alterar estoque');

const produtos = fs.readFileSync('src/components/Produtos.jsx','utf8');
assert.match(produtos, /Conflito de identidade detectado/);
assert.match(produtos, /produtoSku: produtoEmEdicao\?\.sku/);
ok('Catálogo exibe conflito de identidade e histórico filtra por SKU');

const app = fs.readFileSync('src/App.jsx','utf8');
assert.match(app, /setProdutos\(\[\]\);\s*setClientes\(\[\]\);/);
assert.doesNotMatch(app, /CONTA NOVA[\s\S]{0,250}setProdutos\(produtosIniciais/);
ok('Conta nova nasce sem produtos/clientes demonstrativos');

const audit = fs.readFileSync('src/core/stockAudit.js','utf8');
assert.match(audit, /produtoAuditKey/);
assert.match(audit, /chaveAuditoriaProduto/);
assert.match(audit, /normalizarSkuProduto/);
ok('Histórico novo é segregado por identidade e legado é filtrado por SKU');

console.log('\nATT 06.1: 18/18 verificações aprovadas.');
