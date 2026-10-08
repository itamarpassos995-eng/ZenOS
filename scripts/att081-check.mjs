import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { classificarMargem, normalizarRegrasMargem } from '../src/core/profitability.js';
import { formatarEquivalenciaBRL, moedasAtivasRecibo, normalizarCotacoesRecibo } from '../src/core/receiptCurrency.js';

const root = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const app = read('src/App.jsx');
const pdv = read('src/components/PDV.jsx');
const produtos = read('src/components/Produtos.jsx');
const vendas = read('src/components/Vendas.jsx');
const mesas = read('src/components/Mesas.jsx');
const config = read('src/components/Configuracoes.jsx');
const storeProfile = read('src/core/storeProfile.js');

let ok = 0;
const check = (nome, fn) => {
  fn();
  ok += 1;
  console.log(`[OK] ${nome}`);
};

check('Perfil local é obrigatoriamente namespaceado por UID', () => {
  assert.match(storeProfile, /`zenos_\$\{uid\}_perfil_loja`/);
  assert.doesNotMatch(storeProfile, /getItem\(['"]zenos_perfil_loja['"]\)/);
  assert.doesNotMatch(storeProfile, /setItem\(['"]zenos_perfil_loja['"]\)/);
});

check('App não inicializa perfil de uma conta a partir de cache genérico', () => {
  assert.match(app, /useState\(\(\) => normalizarPerfilLoja\(\{\}\)\)/);
  assert.match(app, /lerPerfilLojaLocal\(user\.uid\)/);
});

check('Troca/login de conta zera perfil, margem e câmbio antes de carregar a nova loja', () => {
  assert.match(app, /setRegrasDesconto\(\{ \.\.\.REGRAS_DESCONTO_PADRAO \}\)/);
  assert.match(app, /setTaxasCambio\(\{ \.\.\.TAXAS_CAMBIO_PADRAO \}\)/);
  assert.match(app, /setPerfilLoja\(perfilCacheUsuario\)/);
});

check('Configuração inexistente na nuvem limpa perfil/cache daquele UID', () => {
  assert.match(app, /if \(!snap\.exists\(\)\) \{[\s\S]*limparPerfilLojaLocal\(userId\)/);
});

check('Fallback offline lê somente chaves específicas do UID', () => {
  assert.match(app, /zenos_\$\{user\.uid\}_\$\{chave\}/);
  assert.doesNotMatch(app, /const legado = zenosStorage\.getItem\(`zenos_\$\{chave\}`\)/);
});

check('Regras de comissão locais são específicas do UID', () => {
  assert.match(app, /zenos_\$\{user\.uid\}_regras_comissao/);
  assert.doesNotMatch(app, /getItem\(['"]zenos_regras_comissao['"]\)/);
});

check('Mesas locais são específicas do UID', () => {
  assert.match(mesas, /zenos_\$\{userId\}_mesas_ativas/);
  assert.doesNotMatch(mesas, /getItem\(['"]zenos_mesas_ativas['"]\)/);
});

check('Configurações salva cache de perfil usando o UID autenticado', () => {
  assert.match(config, /salvarPerfilLojaLocal\(user\?\.uid, perfilLoja\)/);
});

check('Semáforo não aceita configuração vazia 0\/0 como margem saudável universal', () => {
  const regras = normalizarRegrasMargem({ margemIdeal: 0, margemMinima: 0 });
  assert.deepEqual(regras, { margemIdeal: 30, margemMinima: 15 });
  const vermelho = classificarMargem(10, { margemIdeal: 0, margemMinima: 0 });
  assert.equal(vermelho.faixa, 'vermelho');
  const verde = classificarMargem(35, { margemIdeal: 0, margemMinima: 0 });
  assert.equal(verde.faixa, 'verde');
});

check('Defaults do App persistem margem ideal e mínima seguras', () => {
  assert.match(app, /margemIdeal: 30/);
  assert.match(app, /margemMinima: 15/);
  assert.match(app, /normalizarRegrasDescontoSeguras/);
});

check('Cadastro rápido do PDV usa Vitrine e Depósito separados', () => {
  assert.match(pdv, /Vitrine \/ Loja/);
  assert.match(pdv, /Galpão \/ Depósito/);
  assert.match(pdv, /estoqueVitrineNovo \+ estoqueGalpaoNovo/);
});

check('Edição rápida no PDV preserva distribuição física já existente', () => {
  assert.match(pdv, /produtoEmEdicaoPDV \? normalizarProduto\(produtoEmEdicaoPDV\)\.estoqueVitrine/);
  assert.match(pdv, /produtoEmEdicaoPDV \? normalizarProduto\(produtoEmEdicaoPDV\)\.estoqueGalpao/);
});

check('Cadastro rápido com saldo inicial registra auditoria de estoque', () => {
  assert.match(pdv, /tipo: 'cadastro_inicial'/);
  assert.match(pdv, /origem: 'cadastro_pdv'/);
});

check('Cotações do recibo suportam BRL, USD, PYG e EUR', () => {
  const t = normalizarCotacoesRecibo({ USD: 0.2, EUR: 0.18, PYG: 1400 });
  assert.deepEqual(moedasAtivasRecibo(t), ['BRL', 'USD', 'PYG', 'EUR']);
  assert.match(formatarEquivalenciaBRL(100, 'USD', t), /20/);
  assert.match(formatarEquivalenciaBRL(100, 'PYG', t), /140[.\s]?000|140000/);
});

check('Venda guarda snapshot das cotações usadas no momento da venda', () => {
  assert.match(pdv, /taxasCambio: \{ BRL: 1, \.\.\.\(taxasCambio \|\| \{\}\) \}/);
});

check('Cupom mostra totais equivalentes nas moedas disponíveis', () => {
  assert.match(pdv, /Total \{codigo\}/);
  assert.match(pdv, /formatarEquivalenciaBRL\(vendaConcluidaObj\.totalBRL/);
  assert.match(vendas, /formatarEquivalenciaBRL\(cupomParaImprimir\.totalBRL/);
});

check('Troco do cupom respeita a moeda escolhida para o troco', () => {
  assert.match(pdv, /formatarEquivalenciaBRL\(vendaConcluidaObj\.trocoBRL, vendaConcluidaObj\.moedaTrocoInfo/);
});

check('Cotações ficam em configuração por loja e sincronizam em realtime', () => {
  assert.match(app, /taxasCambio: novasTaxas/);
  if (fs.existsSync(path.join(root, 'src/core/backupRecovery.js'))) assert.match(app, /updatedAtServer:serverTimestamp\(\)/);
  assert.match(app, /if \(config\.taxasCambio\)/);
});

check('Gerência pode selecionar qualquer caixa aberto como origem de reembolso em dinheiro', () => {
  assert.match(vendas, /CAIXA DE ORIGEM DO DINHEIRO/);
  assert.match(vendas, /caixasAbertos\.map/);
  assert.match(vendas, /sessaoReembolsoId/);
});

check('Reembolso em dinheiro é bloqueado quando o caixa escolhido não tem saldo suficiente', () => {
  assert.match(vendas, /Saldo insuficiente no caixa selecionado/);
  assert.match(vendas, /Use Pix\/Banco ou Voucher/);
});

check('Formulário de produto mantém os cinco campos de preço\/estoque alinhados', () => {
  assert.match(produtos, /repeat\(auto-fit, minmax\(135px, 1fr\)\)/);
  assert.match(produtos, /Margem calculada sobre a venda\. Máx\. 99,9%/);
  const bloco = produtos.slice(produtos.indexOf("Margem sobre venda (%)") - 300, produtos.indexOf("Margem calculada sobre a venda") + 250);
  assert.doesNotMatch(bloco, /<br\s*\/?>/);
});

check('ATT 08.1 não adiciona novos diálogos nativos nos arquivos alterados', () => {
  const native = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g;
  const maxima = new Map([
    ['src/App.jsx', 8],
    ['src/components/Configuracoes.jsx', 12],
    ['src/components/Mesas.jsx', 0],
    ['src/components/PDV.jsx', 0],
    ['src/components/Produtos.jsx', 0],
    ['src/components/Vendas.jsx', 0],
  ]);
  for (const [rel, max] of maxima) {
    const count = (read(rel).match(native) || []).length;
    assert.ok(count <= max, `${rel}: ${count} > baseline ${max}`);
  }
});

check('Nenhuma operação destrutiva Firestore foi introduzida no escopo da ATT 08.1', () => {
  for (const rel of ['src/App.jsx','src/components/Configuracoes.jsx','src/components/Mesas.jsx','src/components/PDV.jsx','src/components/Produtos.jsx','src/components/Vendas.jsx','src/core/storeProfile.js','src/core/profitability.js','src/core/receiptCurrency.js']) {
    const s = read(rel);
    assert.doesNotMatch(s, /\bdeleteDoc\s*\(/, rel);
    assert.doesNotMatch(s, /\bdeleteField\s*\(/, rel);
    assert.doesNotMatch(s, /localStorage\.clear\s*\(/, rel);
  }
});

check('ATT 08.1 não ativa V2 nem migração automática', () => {
  assert.doesNotMatch(app, /useV2Database\s*=\s*true/);
  assert.doesNotMatch(app, /schemaVersion\s*:\s*2/);
});

console.log(`\nATT 08.1: ${ok}/${ok} verificações de isolamento, recibo, reembolso, estoque e semáforo aprovadas.`);
