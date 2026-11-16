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
import {compactProductReceiptPatch,expandProductReceiptPatch} from '../src/core/v2ReceiptDelta.js';

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

// Large tenant regression: legacy catalog fields must not become incidental
// writes when a cashier sells one product. This was triggering V2 size limits.
const catalogoLegado = Array.from({ length: 1200 }, (_, index) => ({
  id: `LEGADO-${index}`, nome: `Produto legado ${index}`, estoque: 15,
  observacao: 'informação comercial existente',
}));
const vendaLojaGrande = aplicarVendaAoEstoque(catalogoLegado, [
  { id: 'linha-venda', produtoOriginalId: 'LEGADO-5', qtd: 2, tipoItem: 'mercadoria' },
]);
assert.equal(vendaLojaGrande.produtos.length, 1200);
assert.equal(vendaLojaGrande.produtos[5].estoque, 13);
assert.equal(vendaLojaGrande.produtos[5].estoqueVitrine, 13);
assert.equal(vendaLojaGrande.produtos[5].estoqueGalpao, 0);
assert.strictEqual(vendaLojaGrande.produtos[0], catalogoLegado[0]);
assert.strictEqual(vendaLojaGrande.produtos[1199], catalogoLegado[1199]);
assert.equal(vendaLojaGrande.produtos[0].estoqueVitrine, undefined);
assert.equal(vendaLojaGrande.produtos.filter((produto, index) => produto !== catalogoLegado[index]).length, 1);
assert.equal(catalogoLegado[5].estoque, 15);
ok('Loja grande: venda altera somente o SKU vendido sem normalizar os demais 1199 registros');

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

// VIPE incident: 48 changed entities produced a 738 KiB receipt.
// Keep the receipt below Firestore's 1 MiB document ceiling while retaining
// the smaller atomic write payload / request guards and entity budget.
const v2 = fs.readFileSync(new URL('../src/core/operationalV2.js', import.meta.url), 'utf8');
assert.match(v2, /requireSize\(receipt,900_000,'V2_RECEIPT_SIZE'/);
assert.match(v2, /requireSize\(\[\.\.\.writes,\.\.\.ledger,\.\.\.audit\]\.map\(w=>w\.value\),2_000_000,'V2_COMMIT_SIZE'/);
assert.match(v2, /requireSize\(patch,256_000,'V2_ENTITY_SIZE'/);
assert.ok(738 * 1024 < 900_000 && 900_000 < 1024 * 1024);
ok('VIPE: recibo de 738 KiB permitido com limite conservador abaixo de 1 MiB');

// Regression VIPE 16/11: 84 changed products previously placed full catalogue
// images into a 1.238 MiB receipt, even though only stock changed.
const fullProductImage='data:image/jpeg;base64,'+'R'.repeat(15000);
const beforeProductRecords=Array.from({length:84},(_,i)=>({
 field:'produtos',routeId:'V-'+i,deleted:false,version:5,
 data:{id:'V-'+i,nome:'Produto '+i,imagem:fullProductImage,estoque:12,estoqueVitrine:12,estoqueGalpao:0,precoBRL:20},
}));
const fullProductPatches=beforeProductRecords.map(record=>({
 ...record,version:6,data:{...record.data,estoque:11,estoqueVitrine:11},commandId:'VENDA-VIPE',
}));
const compacted=fullProductPatches.map((patch,i)=>compactProductReceiptPatch(patch,beforeProductRecords[i]));
assert.ok(JSON.stringify(fullProductPatches).length>1000000);
assert.ok(JSON.stringify(compacted).length<900000);
for(let i=0;i<compacted.length;i++){
 assert.equal(compacted[i].data,undefined);
 assert.deepEqual(expandProductReceiptPatch(compacted[i],beforeProductRecords[i]),fullProductPatches[i]);
}
assert.throws(()=>expandProductReceiptPatch(compacted[0],null),{code:'V2_RECEIPT_DELTA_BASE'});
const removalFull={...fullProductPatches[0],data:{id:'V-0',nome:'Produto 0',estoque:11}};
assert.deepEqual(expandProductReceiptPatch(compactProductReceiptPatch(removalFull,beforeProductRecords[0]),beforeProductRecords[0]),removalFull);
assert.deepEqual(compactProductReceiptPatch(fullProductPatches[0],null),fullProductPatches[0]);
ok('VIPE: 84 alterações com imagens grandes geram recibo compacto e replay idêntico');

console.log('\nATT 02: 10 grupos de verificações aprovados.');
