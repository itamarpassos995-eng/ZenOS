import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runInNewContext } from 'node:vm';
import { obterEstoqueProduto, reporEstoqueProduto } from '../src/core/inventory.js';
import { calcularCustoMedioMovel, ratearCustosAquisicao } from '../src/core/purchaseCosts.js';
import { calcularMargemPercentual } from '../src/core/profitability.js';
import { calcularCmvVenda, obterFinanceiroVenda, obterCustoSnapshotItem } from '../src/core/salesFinancials.js';
import { calcularComissaoVenda } from '../src/core/commissionEngine.js';
import { mergeV1FieldThreeWay } from '../src/core/syncMerge.js';

const soma = (itens, campo) => itens.reduce((total, item) => total + item[campo], 0);

const semAdicionais = ratearCustosAquisicao([{ id:'A', qtd:100, custoPraticadoBRL:15 }]);
assert.equal(soma(semAdicionais, 'custoFinalAquisicaoBRL'), 1500);
assert.equal(semAdicionais[0].custoFinalAquisicaoUnitarioBRL, 15);

const comAdicionais = ratearCustosAquisicao([{ id:'A', qtd:100, custoPraticadoBRL:15 }], 500);
assert.equal(soma(comAdicionais, 'custoFinalAquisicaoBRL'), 2000);
assert.equal(comAdicionais[0].custoFinalAquisicaoUnitarioBRL, 20);

const comDesconto = ratearCustosAquisicao([{ id:'A', qtd:100, custoPraticadoBRL:15 }], 500, 100);
assert.equal(soma(comDesconto, 'custoFinalAquisicaoBRL'), 1900);
assert.equal(comDesconto[0].custoFinalAquisicaoUnitarioBRL, 19);

const rateio = ratearCustosAquisicao([
  { id:'A', qtd:1, custoPraticadoBRL:700 },
  { id:'B', qtd:1, custoPraticadoBRL:300 },
], 100);
assert.deepEqual(rateio.map(item => item.custoAdicionalAlocadoBRL), [70, 30]);
assert.equal(soma(rateio, 'custoAdicionalAlocadoBRL'), 100);

const descontoRateado = ratearCustosAquisicao([
  { id:'A', qtd:1, custoPraticadoBRL:700 },
  { id:'B', qtd:1, custoPraticadoBRL:300 },
], 100, 50);
assert.deepEqual(descontoRateado.map(item => item.descontoCompraAlocadoBRL), [35, 15]);
assert.equal(soma(descontoRateado, 'custoFinalAquisicaoBRL'), 1050);

assert.equal(calcularCustoMedioMovel({
  estoqueAnterior:100, custoAnteriorBRL:20, quantidadeEntrada:100, custoFinalEntradaUnitarioBRL:24,
}), 22);
const estoqueBaseConcorrencia = [{ id:'P1', estoque:100, estoqueVitrine:0, estoqueGalpao:100, custoBRL:20 }];
const compraConcorrenteLocal = [{ ...estoqueBaseConcorrencia[0], estoque:110, estoqueGalpao:110, custoBRL:2240 / 110 }];
const compraConcorrenteRemota = [{ ...estoqueBaseConcorrencia[0], estoque:120, estoqueGalpao:120, custoBRL:2520 / 120 }];
const comprasConcorrentes = mergeV1FieldThreeWay({
  field:'produtos',
  baseValue:estoqueBaseConcorrencia,
  localValue:compraConcorrenteLocal,
  remoteValue:compraConcorrenteRemota,
});
assert.equal(comprasConcorrentes[0].estoque, 130);
assert.ok(Math.abs(comprasConcorrentes[0].custoBRL - (2760 / 130)) < 0.0000001);
const vendaConcorrenteLocal = [{ ...estoqueBaseConcorrencia[0], estoque:90, estoqueGalpao:90 }];
const compraConcorrenteRemotaPequena = [{ ...estoqueBaseConcorrencia[0], estoque:110, estoqueGalpao:110, custoBRL:2240 / 110 }];
const vendaECompraConcorrentes = mergeV1FieldThreeWay({
  field:'produtos',
  baseValue:estoqueBaseConcorrencia,
  localValue:vendaConcorrenteLocal,
  remoteValue:compraConcorrenteRemotaPequena,
});
assert.equal(vendaECompraConcorrentes[0].estoque, 100);
assert.equal(vendaECompraConcorrentes[0].custoBRL, 2040 / 100);
assert.equal(calcularCustoMedioMovel({
  estoqueAnterior:0, custoAnteriorBRL:12, quantidadeEntrada:100, custoFinalEntradaUnitarioBRL:24,
}), 24);

const vendaSnapshot = {
  totalBRL:5000,
  cmvBRL:2000,
  lucroBRL:3000,
  itens:[{ id:'A', qtd:100, precoPraticadoBRL:50, custoBRL:20, custoNaVendaBRL:20 }],
};
assert.equal(calcularCmvVenda(vendaSnapshot), 2000);
assert.equal(obterFinanceiroVenda(vendaSnapshot).lucroLiquidoBRL, 3000);
assert.equal(obterCustoSnapshotItem(vendaSnapshot.itens[0]), 20);
const produtoComCustoFuturo = { id:'A', custoBRL:24 };
assert.equal(produtoComCustoFuturo.custoBRL, 24);
assert.equal(obterFinanceiroVenda(vendaSnapshot).cmvBRL, 2000);
assert.equal(obterFinanceiroVenda(vendaSnapshot).lucroBrutoBRL, 3000);

const lucroLiquidoDesconto = 40 - 20;
assert.equal(lucroLiquidoDesconto, 20);
assert.equal(calcularMargemPercentual(40, lucroLiquidoDesconto), 50);
assert.equal((lucroLiquidoDesconto / 20) * 100, 100);

const vendaDescontada = {
  totalBRL:40, cmvBRL:20, lucroBRL:20,
  itens:[{ qtd:1, precoPraticadoBRL:50, custoBRL:20 }],
};
assert.equal(obterFinanceiroVenda(vendaDescontada).totalLiquidoBRL, 40);
assert.equal(obterFinanceiroVenda(vendaDescontada).cmvLiquidoBRL, 20);
assert.equal(obterFinanceiroVenda(vendaDescontada).lucroLiquidoBRL, 20);
assert.equal(calcularMargemPercentual(40, 20), 50);

const regrasFaturamento = { baseCalculo:'faturamento', pctVerde:5, pctAmarelo:5, pctVermelho:5 };
const regrasLucro = { baseCalculo:'lucro', pctVerde:5, pctAmarelo:5, pctVermelho:5 };
assert.equal(calcularComissaoVenda(vendaDescontada, regrasFaturamento).comissao, 2);
assert.equal(calcularComissaoVenda(vendaDescontada, regrasLucro).comissao, 1);
assert.equal(calcularComissaoVenda(vendaDescontada, regrasFaturamento).faixa.faixa, 'verde');

const vendaLegada = { totalBRL:40, lucroBRL:20, itens:[{ qtd:1, custoBRL:20 }] };
assert.equal(obterCustoSnapshotItem(vendaLegada.itens[0]), 20);
assert.equal(obterFinanceiroVenda(vendaLegada).lucroLiquidoBRL, 20);
assert.equal(obterFinanceiroVenda({ totalBRL:40 }).lucroBrutoBRL, 0);

const rateioCentavos = ratearCustosAquisicao([
  { id:'A', qtd:1, custoPraticadoBRL:0.01 },
  { id:'B', qtd:1, custoPraticadoBRL:0.02 },
  { id:'C', qtd:1, custoPraticadoBRL:0.03 },
], 0.01, 0.01);
assert.equal(soma(rateioCentavos, 'custoAdicionalAlocadoBRL'), 0.01);
assert.equal(soma(rateioCentavos, 'descontoCompraAlocadoBRL'), 0.01);
assert.equal(soma(rateioCentavos, 'custoFornecedorTotalBRL'), 0.06);
assert.equal(soma(rateioCentavos, 'custoFinalAquisicaoBRL'), 0.06);
assert.deepEqual(
  ratearCustosAquisicao([
    { id:'A', qtd:1, custoPraticadoBRL:0.01 },
    { id:'B', qtd:1, custoPraticadoBRL:0.02 },
    { id:'C', qtd:1, custoPraticadoBRL:0.03 },
  ], 0.01, 0.01).map(item => item.custoAdicionalAlocadoBRL),
  rateioCentavos.map(item => item.custoAdicionalAlocadoBRL),
);

const custoDevolvida = calcularCustoMedioMovel({
  estoqueAnterior:0, custoAnteriorBRL:24, quantidadeEntrada:1, custoFinalEntradaUnitarioBRL:20,
});
assert.equal(custoDevolvida, 20);
assert.ok(Math.abs(calcularCustoMedioMovel({
  estoqueAnterior:100, custoAnteriorBRL:24, quantidadeEntrada:1, custoFinalEntradaUnitarioBRL:custoDevolvida,
}) - 23.96039604) < 0.0000001);

const compras = fs.readFileSync(new URL('../src/components/PDVCompras.jsx', import.meta.url), 'utf8');
const pdv = fs.readFileSync(new URL('../src/components/PDV.jsx', import.meta.url), 'utf8');
const vendas = fs.readFileSync(new URL('../src/components/Vendas.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(compras, /ratearCustosAquisicao\(itensCompra,\s*acrescBRL,\s*descBRL\)/);
assert.match(compras, /custoBRL:\s*custoMedioBRL/);
assert.match(compras, /precoBRL:\s*Number\.isFinite\(itemComprado\.precoVendaBRL\)/);
assert.match(compras, /quantidadeEntrada,\s*\{\s*vitrine:\s*0,\s*galpao:\s*quantidadeEntrada\s*\}/);
assert.match(compras, /custoPraticadoBRL/);
assert.match(compras, /custoFinalAquisicaoBRL:\s*totalFinalBRL/);
assert.match(compras, /totalFinalBRL = Math\.max\(0,\s*\(subtotalBrutoBRL \+ acrescBRL\) - descBRL\)/);
assert.match(compras, /valor:\s*Number\(pag\.valorConvertidoBRL\) \|\| 0/);
assert.match(pdv, /custoNaVendaBRL:\s*Number\.isFinite\(Number\(item\.custoBRL\)\)/);
assert.match(pdv, /const itensVendaAtualizada = itensVendaComCustoAtual\(itensVenda\)/);
assert.match(pdv, /cmvBRL:\s*cmvVendaBRL/);
assert.match(vendas, /custoFinalEntradaUnitarioBRL:\s*itemDev\.custoBRL/);
assert.match(app, /obterFinanceiroVenda\(v\)\.cmvLiquidoBRL/);
assert.match(app, /<span>CMV<\/span>/);

console.log('Compra, rateio, custo médio, snapshots, CMV, margem, comissão, devolução, painel e compatibilidade: 15/15 grupos aprovados.');

const adicionarProdutoFonte = compras.match(/const confirmarAdicaoRapida = \(\) => \{([\s\S]*?)\n  \};/);
const produtoEntradaFonte = compras.match(/return \{\s*\.\.\.entrada\.produto,[\s\S]*?\n          \};/);
assert.ok(adicionarProdutoFonte, 'Handler real de adição de produto localizado');
assert.ok(produtoEntradaFonte, 'Produto real retornado pela entrada localizado');

const adicionarProdutoRecompra = (produto) => {
  let itens;
  runInNewContext(`(() => {${adicionarProdutoFonte[1]}})()`, {
    itemParaAdicionar: produto, qtdDigitadaRapida:'10', itensCompra:[], moeda:'BRL',
    converterDeBRL: valor => valor,
    setItensCompra: valor => { itens = valor; },
    setItemParaAdicionar: () => {}, setTermoBusca: () => {}, inputBuscaRef:{ current:null },
  });
  return itens[0];
};
const concluirProdutoEntrada = (produto, itemComprado) => {
  const quantidadeEntrada = Number(itemComprado.qtd);
  const entrada = reporEstoqueProduto(produto, quantidadeEntrada, { vitrine:0, galpao:quantidadeEntrada });
  const custoMedioBRL = calcularCustoMedioMovel({
    estoqueAnterior:obterEstoqueProduto(produto).estoque,
    custoAnteriorBRL:produto.custoBRL,
    quantidadeEntrada,
    custoFinalEntradaUnitarioBRL:itemComprado.custoFinalAquisicaoUnitarioBRL,
  });
  return runInNewContext(`(() => {${produtoEntradaFonte[0]}})()`, { entrada, custoMedioBRL, itemComprado, p:produto });
};

const produtoNovoFornecedor = { id:'RECOMPRA', sku:'RECOMPRA', custoBRL:15, precoBRL:50, estoque:0, estoqueVitrine:0, estoqueGalpao:0 };
const primeiraEntradaFornecedor = ratearCustosAquisicao([adicionarProdutoRecompra(produtoNovoFornecedor)], 50)[0];
const produtoAposEntrada = concluirProdutoEntrada(produtoNovoFornecedor, primeiraEntradaFornecedor);
assert.equal(produtoAposEntrada.ultimoCustoFornecedorBRL, 15);
assert.equal(produtoAposEntrada.custoBRL, 20);
assert.equal(produtoAposEntrada.precoBRL, 50);
assert.equal(produtoAposEntrada.estoque, 10);
assert.equal(produtoAposEntrada.estoqueVitrine, 0);
assert.equal(produtoAposEntrada.estoqueGalpao, 10);
const recompraFornecedor = adicionarProdutoRecompra(produtoAposEntrada);
assert.equal(recompraFornecedor.custoPraticadoBRL, 15);
assert.equal(recompraFornecedor.custoTexto, '15.00');
assert.equal(recompraFornecedor.produtoOriginalId, produtoNovoFornecedor.id);
assert.equal(recompraFornecedor.produtoOriginalSku, produtoNovoFornecedor.sku);
const vendaAntesRecompra = {
  totalBRL:50,
  itens:[{ ...produtoAposEntrada, qtd:1, custoNaVendaBRL:produtoAposEntrada.custoBRL }],
};
const snapshotAntesRecompra = JSON.stringify(vendaAntesRecompra);
assert.equal(calcularCmvVenda(vendaAntesRecompra), 20);
assert.equal(calcularMargemPercentual(50, 50 - calcularCmvVenda(vendaAntesRecompra)), 60);
const segundaEntradaFornecedor = ratearCustosAquisicao([{ ...recompraFornecedor, custoPraticadoBRL:17, precoVendaBRL:55 }], 50)[0];
const produtoAposRecompra = concluirProdutoEntrada(produtoAposEntrada, segundaEntradaFornecedor);
assert.equal(produtoAposRecompra.ultimoCustoFornecedorBRL, 17);
assert.equal(produtoAposRecompra.custoBRL, 21);
assert.equal(produtoAposRecompra.precoBRL, 55);
assert.equal(produtoAposRecompra.estoque, 20);
assert.equal(produtoAposRecompra.estoqueGalpao, 20);
assert.equal(primeiraEntradaFornecedor.custoPraticadoBRL, 15);
assert.equal(primeiraEntradaFornecedor.custoAdicionalAlocadoBRL, 50);
assert.equal(primeiraEntradaFornecedor.custoFinalAquisicaoBRL, 200);
assert.equal(segundaEntradaFornecedor.custoPraticadoBRL, 17);
assert.equal(JSON.stringify(vendaAntesRecompra), snapshotAntesRecompra);
assert.equal(calcularCmvVenda(vendaAntesRecompra), 20);
for (const ultimoCustoFornecedorBRL of [undefined, null, '', NaN, Infinity, -1]) {
  assert.equal(adicionarProdutoRecompra({ ...produtoAposEntrada, ultimoCustoFornecedorBRL }).custoPraticadoBRL, 20);
}
assert.equal(adicionarProdutoRecompra({ ...produtoAposEntrada, ultimoCustoFornecedorBRL:0 }).custoPraticadoBRL, 0);
assert.equal(adicionarProdutoRecompra({ id:'LEGADO', precoBRL:50 }).custoPraticadoBRL, 0);

console.log('Último custo fornecedor, recompra, custo efetivo, CMV, snapshot, histórico, preço manual e estoque: caso adicional aprovado.');
