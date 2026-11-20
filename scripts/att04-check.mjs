import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ehEncomendaUsoUnico, ajustarSkuPorTipoProdutoRapido } from '../src/core/orderItems.js';
import { classificarMargem, normalizarRegrasMargem } from '../src/core/profitability.js';
import { registroEhDoIntervaloLocal } from '../src/core/dates.js';
import { vendaElegivelParaComissao } from '../src/core/commissions.js';
import { reporEstoqueProduto } from '../src/core/inventory.js';

const checks = [];
const ok = (nome, fn) => { fn(); checks.push(nome); console.log(`[OK] ${nome}`); };

ok('Produto rápido novo classificado como estoque não vira encomenda pelo SKU', () => {
  assert.equal(ehEncomendaUsoUnico({ sku: 'ENCOMENDA-123', usoUnicoEncomendado: false, classificacaoUso: 'estoque' }), false);
});
ok('Encomenda nova explícita é reconhecida', () => {
  assert.equal(ehEncomendaUsoUnico({ classificacaoUso: 'encomenda_unica', usoUnicoEncomendado: true }), true);
});
ok('Encomenda legada por SKU continua reconhecida para permitir estorno sem catálogo', () => {
  assert.equal(ehEncomendaUsoUnico({ sku: 'ENCOMENDA-999' }), true);
});
ok('SKU automático muda de encomenda para balcão quando desmarcado', () => {
  assert.match(ajustarSkuPorTipoProdutoRapido('ENCOMENDA-123456', false), /^BALCAO-\d+$/);
});
ok('Entrada de compra aumenta galpão e mantém total coerente', () => {
  const r = reporEstoqueProduto({ id: 'P1', estoque: 20, estoqueVitrine: 5, estoqueGalpao: 15 }, 10, { vitrine: 0, galpao: 10 });
  assert.equal(r.produto.estoqueVitrine, 5);
  assert.equal(r.produto.estoqueGalpao, 25);
  assert.equal(r.produto.estoque, 30);
});
ok('Semáforo verde usa margem ideal configurada', () => {
  assert.equal(classificarMargem(30, { margemIdeal: 30, margemMinima: 15 }).faixa, 'verde');
});
ok('Semáforo amarelo usa intervalo de margem', () => {
  assert.equal(classificarMargem(20, { margemIdeal: 30, margemMinima: 15 }).faixa, 'amarelo');
});
ok('Semáforo vermelho usa margem mínima', () => {
  assert.equal(classificarMargem(14.99, { margemIdeal: 30, margemMinima: 15 }).faixa, 'vermelho');
});
ok('Regras invertidas são normalizadas com segurança', () => {
  assert.deepEqual(normalizarRegrasMargem({ margemIdeal: 10, margemMinima: 25 }), { margemIdeal: 25, margemMinima: 10 });
});
ok('Filtro de comissão aceita período personalizado', () => {
  const venda = { estado: 'concluida', createdAt: '2026-09-15T15:00:00.000Z', totalBRL: 100, custoTotalBRL: 50, lucroBRL: 50 };
  assert.equal(vendaElegivelParaComissao(venda, { tipo: 'intervalo', inicio: '2026-09-01', fim: '2026-09-30' }), true);
  assert.equal(vendaElegivelParaComissao(venda, { tipo: 'intervalo', inicio: '2026-10-01', fim: '2026-10-31' }), false);
});
ok('Período personalizado tolera datas inicial/final invertidas', () => {
  assert.equal(registroEhDoIntervaloLocal({ createdAt: '2026-09-15T15:00:00.000Z' }, '2026-09-30', '2026-09-01'), true);
});

const pdv = fs.readFileSync('src/components/PDV.jsx', 'utf8');
const vendas = fs.readFileSync('src/components/Vendas.jsx', 'utf8');
const compras = fs.readFileSync('src/components/PDVCompras.jsx', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const comissoes = fs.readFileSync('src/components/Comissoes.jsx', 'utf8');

ok('Produto Balcão abre desmarcado como uso único', () => assert.match(pdv, /usoUnicoEncomendado:\s*false,\s*classificacaoUso:\s*'estoque'/));
ok('Produto Balcão usa SKU BALCAO por padrão', () => assert.match(pdv, /gerarSkuProdutoBalcao\('BALCAO'\)/));
ok('Venda remove do catálogo apenas item classificado como encomenda', () => assert.match(pdv, /filter\(it => ehEncomendaUsoUnico\(it\)\)/));
ok('Estorno usa compatibilidade de encomenda legada', () => assert.match(vendas, /usoUnicoEncomendado:\s*ehEncomendaUsoUnico\(it\)/));
ok('Compra de estoque é marcada como ativo e não afeta resultado', () => {
  assert.match(compras, /naturezaContabil:\s*'estoque_ativo'/);
  assert.match(compras, /afetaResultado:\s*false/);
});
ok('Compra imediata aparece como conta paga', () => assert.match(compras, /status:\s*pagamentoImediato\s*\?\s*'paga'\s*:\s*'pendente'/));
ok('Compra em dinheiro gera saída de gaveta quando há turno aberto', () => assert.match(compras, /tipo:\s*'saida_compra'/));
ok('Lucro líquido exclui mercadoria para revenda das despesas operacionais', () => assert.match(app, /d\.afetaResultado !== false[\s\S]*d\.naturezaContabil !== 'estoque_ativo'/));
ok('Saldo físico do caixa desconta compra em dinheiro', () => assert.match(app, /saidasComprasDinheiroSessaoBRL/));
ok('Comissões possuem período personalizado', () => assert.match(comissoes, /Período personalizado/));
ok('Comissões possuem navegação mês anterior e seguinte', () => assert.match(comissoes, /deslocarMesYYYYMM\(filtroMes, -1\)[\s\S]*deslocarMesYYYYMM\(filtroMes, 1\)/));
ok('Comissões mostram margem média real', () => assert.match(comissoes, /Margem Média/));
ok('PDV e comissões compartilham classificador de margem', () => {
  assert.match(pdv, /classificarMargem/);
  assert.match(comissoes, /classificarMargem/);
});

console.log(`\nATT 04: ${checks.length} verificações aprovadas.`);
