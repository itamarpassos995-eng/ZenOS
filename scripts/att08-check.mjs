import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  REGRAS_COMISSAO_PADRAO,
  avaliarRegraBonus,
  calcularComissaoVenda,
  gerarRelatorioComissoes,
  normalizarRegrasComissao,
} from '../src/core/commissionEngine.js';

const root = path.resolve(process.cwd());
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
const comissoes = fs.readFileSync(path.join(root, 'src/components/Comissoes.jsx'), 'utf8');

let ok = 0;
const check = (nome, fn) => {
  fn();
  ok += 1;
  console.log(`[OK] ${nome}`);
};

const venda = (extra = {}) => ({
  estado: 'concluida', vendedorId: 'v1', vendedorNome: 'Vendedor 1', totalBRL: 1000, lucroBRL: 300, ...extra,
});

check('Padrão mantém base lucro e semáforo protegido', () => {
  const r = normalizarRegrasComissao(REGRAS_COMISSAO_PADRAO);
  assert.equal(r.baseCalculo, 'lucro');
  assert.equal(r.protecaoPrejuizo, true);
});

check('Comissão sobre lucro usa lucro líquido como base', () => {
  const r = calcularComissaoVenda(venda(), { baseCalculo: 'lucro', pctVerde: 10, pctAmarelo: 10, pctVermelho: 10 }, { margemIdeal: 25, margemMinima: 10 });
  assert.equal(r.valorBase, 300);
  assert.equal(r.comissao, 30);
});

check('Comissão sobre faturamento usa faturamento líquido como base', () => {
  const r = calcularComissaoVenda(venda(), { baseCalculo: 'faturamento', pctVerde: 2, pctAmarelo: 2, pctVermelho: 2 }, { margemIdeal: 25, margemMinima: 10 });
  assert.equal(r.valorBase, 1000);
  assert.equal(r.comissao, 20);
});

check('Prejuízo bloqueia comissão mesmo sobre faturamento', () => {
  const r = calcularComissaoVenda(venda({ lucroBRL: -50 }), { baseCalculo: 'faturamento', pctVerde: 10, pctAmarelo: 10, pctVermelho: 10 }, { margemIdeal: 25, margemMinima: 10 });
  assert.equal(r.houvePrejuizo, true);
  assert.equal(r.comissao, 0);
});

check('Comissão sobre faturamento nunca ultrapassa o lucro positivo da venda', () => {
  const r = calcularComissaoVenda(venda({ totalBRL: 1000, lucroBRL: 30 }), { baseCalculo: 'faturamento', pctVerde: 10, pctAmarelo: 10, pctVermelho: 10 }, { margemIdeal: 25, margemMinima: 10 });
  assert.equal(r.comissaoTeorica, 100);
  assert.equal(r.comissao, 30);
  assert.equal(r.limitadaPeloLucro, true);
});

check('Venda parcialmente devolvida usa valores líquidos', () => {
  const r = calcularComissaoVenda(venda({ totalBRL: 1000, lucroBRL: 300, valorDevolvidoBRL: 200, custoDevolvidoBRL: 120 }), { baseCalculo: 'lucro', pctVerde: 10, pctAmarelo: 10, pctVermelho: 10 }, { margemIdeal: 20, margemMinima: 10 });
  assert.equal(r.faturamentoLiquidoBRL, 800);
  assert.equal(r.lucroLiquidoBRL, 220);
  assert.equal(r.comissao, 22);
});

check('Percentuais são limitados entre 0 e 100', () => {
  const r = normalizarRegrasComissao({ pctVerde: 200, pctAmarelo: -5, pctVermelho: 'x' });
  assert.equal(r.pctVerde, 100);
  assert.equal(r.pctAmarelo, 0);
  assert.equal(r.pctVermelho, 0);
});

check('Bônus de faturamento qualifica automaticamente', () => {
  const b = avaliarRegraBonus({ id: 'b1', tipo: 'faturamento', meta: 1000, valorBonus: 200, ativo: true }, { totalVendas: 1200 });
  assert.equal(b.atingida, true);
  assert.equal(b.valorConquistado, 200);
  assert.equal(b.progressoPct, 100);
});

check('Bônus não atingido não soma valor', () => {
  const b = avaliarRegraBonus({ id: 'b2', tipo: 'lucro', meta: 500, valorBonus: 100, ativo: true }, { totalLucro: 300 });
  assert.equal(b.atingida, false);
  assert.equal(b.valorConquistado, 0);
});

check('Bônus numérico com meta zero não qualifica automaticamente', () => {
  const b = avaliarRegraBonus({ id: 'b-zero', tipo: 'faturamento', meta: 0, valorBonus: 500, ativo: true }, { totalVendas: 10000 });
  assert.equal(b.atingida, false);
  assert.equal(b.valorConquistado, 0);
});

check('Bônus sem devoluções exige vendas e zero devoluções', () => {
  const sim = avaliarRegraBonus({ id: 'b3', tipo: 'sem_devolucoes', valorBonus: 80, ativo: true }, { totalAtendimentos: 4, qtdDevolucoes: 0 });
  const nao = avaliarRegraBonus({ id: 'b3', tipo: 'sem_devolucoes', valorBonus: 80, ativo: true }, { totalAtendimentos: 4, qtdDevolucoes: 1 });
  assert.equal(sim.atingida, true);
  assert.equal(nao.atingida, false);
});

check('Múltiplas bonificações acumulam somente as qualificadas', () => {
  const regras = {
    baseCalculo: 'lucro', pctVerde: 0, pctAmarelo: 0, pctVermelho: 0, bonusFixo: 0,
    bonusRegras: [
      { id: 'fat', tipo: 'faturamento', meta: 1500, valorBonus: 100, ativo: true },
      { id: 'luc', tipo: 'lucro', meta: 1000, valorBonus: 200, ativo: true },
      { id: 'at', tipo: 'atendimentos', meta: 2, valorBonus: 50, ativo: true },
    ],
  };
  const rel = gerarRelatorioComissoes([venda(), venda({ totalBRL: 600, lucroBRL: 100 })], regras, { margemIdeal: 25, margemMinima: 10 });
  assert.equal(rel.length, 1);
  assert.equal(rel[0].bonusMetasTotal, 150);
  assert.equal(rel[0].comissaoTotal, 150);
});

check('Relatório conta vendas por faixa do semáforo', () => {
  const rel = gerarRelatorioComissoes([
    venda({ totalBRL: 100, lucroBRL: 40 }),
    venda({ totalBRL: 100, lucroBRL: 20 }),
    venda({ totalBRL: 100, lucroBRL: 5 }),
  ], { baseCalculo: 'lucro', pctVerde: 0, pctAmarelo: 0, pctVermelho: 0 }, { margemIdeal: 30, margemMinima: 15 });
  assert.equal(rel[0].qtdVerde, 1);
  assert.equal(rel[0].qtdAmarelo, 1);
  assert.equal(rel[0].qtdVermelho, 1);
});

check('Relatório identifica prejuízo separado do semáforo', () => {
  const rel = gerarRelatorioComissoes([venda({ totalBRL: 100, lucroBRL: -10 })], { baseCalculo: 'faturamento', pctVermelho: 50 }, { margemIdeal: 30, margemMinima: 15 });
  assert.equal(rel[0].qtdPrejuizo, 1);
  assert.equal(rel[0].comissaoBaseTotal, 0);
});

check('APP mantém regras de comissão em estado cloud-first', () => {
  assert.match(app, /const \[regrasComissao, setRegrasComissao\]/);
  assert.match(app, /field: 'regrasComissao'/);
  assert.match(app, /if \(d\.regrasComissao\)/);
});

check('Comissões recebe configuração sincronizada do App', () => {
  assert.match(app, /regrasComissao=\{regrasComissao\}/);
  assert.match(app, /setRegrasComissao=\{setRegrasComissao\}/);
});

check('Semáforo permanece explícito e independente da base', () => {
  assert.match(comissoes, /PROTEÇÃO FINANCEIRA SEMPRE ATIVA/);
  assert.match(comissoes, /prejuízo = comissão zero/);
});

check('Administrador pode escolher lucro ou faturamento', () => {
  assert.match(comissoes, /value="lucro"/);
  assert.match(comissoes, /value="faturamento"/);
});

check('Interface permite múltiplas bonificações', () => {
  assert.match(comissoes, /Nova bonificação/);
  assert.match(comissoes, /bonusRegras/);
  assert.match(comissoes, /Acompanhamento de metas/);
});

check('Comissões não introduz alert, confirm ou prompt nativos', () => {
  assert.equal(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(comissoes), false);
});

console.log(`\nATT 08: ${ok}/${ok} verificações aprovadas.`);
