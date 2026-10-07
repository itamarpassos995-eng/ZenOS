import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  parseZenOSDate,
  obterDataRegistro,
  chaveDiaLocal,
  chaveMesLocal,
  registroEhDoDiaLocal,
  registroEhDoMesLocal,
} from '../src/core/dates.js';
import { obterBaseComissaoVenda, vendaElegivelParaComissao } from '../src/core/commissions.js';

let aprovados = 0;
const check = (nome, fn) => {
  try {
    fn();
    aprovados += 1;
    console.log(`[OK] ${nome}`);
  } catch (erro) {
    console.error(`[FALHA] ${nome}`);
    throw erro;
  }
};

check('Lê data histórica pt-BR DD/MM/YYYY', () => {
  const d = parseZenOSDate('05/10/2026, 14:30:00');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 5);
  assert.equal(d.getHours(), 14);
});

check('Lê data histórica es-ES sem zero à esquerda', () => {
  const d = parseZenOSDate('5/10/2026, 09:05:01');
  assert.equal(chaveDiaLocal(d), '2026-10-05');
});

check('Lê data histórica en-US com AM/PM', () => {
  const d = parseZenOSDate('10/5/2026, 2:30:00 PM');
  assert.equal(chaveDiaLocal(d), '2026-10-05');
  assert.equal(d.getHours(), 14);
});

check('Lê createdAt ISO novo', () => {
  const d = parseZenOSDate('2026-10-05T17:30:00.000Z');
  assert.ok(d instanceof Date && !Number.isNaN(d.getTime()));
});

check('Lê Firestore Timestamp compatível', () => {
  const d = parseZenOSDate({ seconds: 1791221400, nanoseconds: 0 });
  assert.ok(d instanceof Date && !Number.isNaN(d.getTime()));
});

check('createdAt tem prioridade sobre dataHora', () => {
  const d = obterDataRegistro({ createdAt: '2026-10-05T12:00:00.000Z', dataHora: '01/01/2020, 00:00:00' });
  assert.equal(d.getUTCFullYear(), 2026);
});

check('Venda histórica entra no mês correto', () => {
  assert.equal(registroEhDoMesLocal({ dataHora: '05/10/2026, 14:30:00' }, '2026-10'), true);
});

check('Venda histórica não entra em outro mês', () => {
  assert.equal(registroEhDoMesLocal({ dataHora: '05/09/2026, 14:30:00' }, '2026-10'), false);
});

check('Venda do dia é reconhecida pelo calendário local', () => {
  const referencia = new Date(2026, 9, 5, 23, 0, 0);
  assert.equal(registroEhDoDiaLocal({ dataHora: '05/10/2026, 08:00:00' }, referencia), true);
});

check('Venda de outro dia não entra em Vendido Hoje', () => {
  const referencia = new Date(2026, 9, 5, 23, 0, 0);
  assert.equal(registroEhDoDiaLocal({ dataHora: '04/10/2026, 23:59:59' }, referencia), false);
});

check('Data impossível não é normalizada silenciosamente', () => {
  assert.equal(parseZenOSDate('31/02/2026, 10:00:00'), null);
});

const vendaBase = {
  id: 'VENDA-TESTE',
  dataHora: '05/10/2026, 10:00:00',
  estado: 'concluida',
  totalBRL: 100,
  lucroBRL: 30,
  itens: [{ qtd: 1, precoPraticadoBRL: 100, custoBRL: 70 }],
};

check('Venda concluída histórica é elegível à comissão do mês', () => {
  assert.equal(vendaElegivelParaComissao(vendaBase, '2026-10'), true);
});

check('Venda parcial válida continua elegível à comissão', () => {
  assert.equal(vendaElegivelParaComissao({ ...vendaBase, estado: 'parcial', totalLiquidoBRL: 80 }, '2026-10'), true);
});

check('Venda cancelada não gera comissão', () => {
  assert.equal(vendaElegivelParaComissao({ ...vendaBase, estado: 'cancelada' }, '2026-10'), false);
});

check('Pré-pedido/pendente não gera comissão', () => {
  assert.equal(vendaElegivelParaComissao({ ...vendaBase, estado: 'pendente' }, '2026-10'), false);
});

check('Comissão usa faturamento e lucro líquidos após devolução', () => {
  const base = obterBaseComissaoVenda({
    ...vendaBase,
    estado: 'parcial',
    valorDevolvidoBRL: 20,
    custoDevolvidoBRL: 10,
    totalLiquidoBRL: 80,
    lucroLiquidoBRL: 20,
  });
  assert.equal(base.faturamentoLiquidoBRL, 80);
  assert.equal(base.lucroLiquidoBRL, 20);
  assert.equal(base.margemLiquidaPct, 25);
});

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const pdv = fs.readFileSync(new URL('../src/components/PDV.jsx', import.meta.url), 'utf8');
const mesas = fs.readFileSync(new URL('../src/components/Mesas.jsx', import.meta.url), 'utf8');
const comissoes = fs.readFileSync(new URL('../src/components/Comissoes.jsx', import.meta.url), 'utf8');

check('Card Vendido Hoje usa faturamentoHojeBRL', () => {
  assert.match(app, /Vendido Hoje[\s\S]*?fmt\(faturamentoHojeBRL\)/);
});

check('App preserva faturamento total separado do Vendido Hoje', () => {
  assert.match(app, /const faturamentoTotalBRL =/);
  assert.match(app, /const faturamentoHojeBRL =/);
});

check('PDV grava createdAt novo sem remover dataHora legado', () => {
  assert.match(pdv, /createdAt:\s*instanteVenda\.toISOString\(\)/);
  assert.match(pdv, /dataHora:\s*instanteVenda\.toLocaleString/);
});

check('Mesas grava createdAt novo sem remover dataHora legado', () => {
  assert.match(mesas, /createdAt:\s*instanteVenda\.toISOString\(\)/);
  assert.match(mesas, /dataHora:\s*instanteVenda\.toLocaleString/);
});

check('Comissões não filtram mais mês com startsWith em dataHora', () => {
  assert.doesNotMatch(comissoes, /dataHora\.startsWith\(filtroMes\)/);
  assert.match(comissoes, /vendaElegivelParaComissao/);
});

console.log(`\nATT 03: ${aprovados} verificações aprovadas.`);
