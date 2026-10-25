import React from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ZenAssistenteIA from '../../src/components/ZenAssistenteIA.jsx';

const vendedores = [
  { id: 'ana', nome: 'Ana Oliveira', patente: 'vendedor' },
  { id: 'bruno', nome: 'Bruno Lima', patente: 'vendedor' },
];
const hoje = new Date();
const dataHojeLegada = hoje.toLocaleDateString('pt-BR');
const historicoVendas = [
  { id: 'a1', estado: 'concluida', vendedorId: 'ana', vendedorNome: 'Ana Oliveira',
    dataHora: `${dataHojeLegada} 10:00`, totalBRL: 100, cmvBRL: 50, lucroBRL: 50,
    valorDevolvidoBRL: 20, custoDevolvidoBRL: 10, itens: [] },
  { id: 'b1', estado: 'concluida', vendedorId: 'bruno', vendedorNome: 'Bruno Lima',
    createdAt: hoje.toISOString(), totalBRL: 50, cmvBRL: 30, lucroBRL: 20, itens: [] },
  { id: 'a2', estado: 'pendente', vendedorId: 'ana', dataHora: `${dataHojeLegada} 10:50`, totalBRL: 1000 },
  { id: 'b2', estado: 'orcamento', vendedorId: 'bruno', dataHora: `${dataHojeLegada} 10:50`, totalBRL: 900 },
  { id: 'a3', estado: 'cancelado', vendedorId: 'ana', dataHora: `${dataHojeLegada} 10:50`, totalBRL: 700 },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

const montar = (operadorAtivo, patenteUsuario) => render(
  <ZenAssistenteIA aberto onAbrir={vi.fn()} onFechar={vi.fn()}
    operadorAtivo={operadorAtivo} patenteUsuario={patenteUsuario}
    temPermissao={modulo => Boolean(operadorAtivo.permissoes?.[modulo]) || patenteUsuario === 'gerencia'}
    navegarPara={vi.fn()} vendedores={vendedores} historicoVendas={historicoVendas}
    produtos={[]} clientes={[]} fmt={valor => `R$ ${Number(valor).toFixed(2)}`} />
);

const perguntar = (pergunta) => {
  fireEvent.change(screen.getByPlaceholderText(/Pergunte algo/), { target: { value: pergunta } });
  fireEvent.click(screen.getByTitle('Enviar pergunta'));
};

test('gerência vê faturamento líquido por vendedor, sem pré-pedidos, orçamentos nem cancelamentos', () => {
  const { container } = montar({ id: 'admin', nome: 'Gestor', permissoes: { admin: true } }, 'gerencia');
  perguntar('quanto cada vendedor vendeu no geral');
  expect(container.textContent).toContain('A equipe faturou **R$ 130.00** em **2 venda(s)**');
  expect(container.textContent).toContain('Ana Oliveira');
  expect(container.textContent).toContain('Bruno Lima');
  expect(container.textContent).toContain('R$ 80.00');
  expect(container.textContent).toContain('R$ 50.00');
  perguntar('quanto cada vendedor vendeu hoje');
  expect(container.textContent).toContain('A equipe faturou **R$ 130.00** em **2 venda(s)**');
});

test('permissão de Vendas não expõe ranking nem faturamento de outros vendedores', () => {
  const { container } = montar({ id: 'ana', nome: 'Ana Oliveira', permissoes: { vendas: true, pdv: true } }, 'vendedor');
  perguntar('quanto cada vendedor vendeu no geral');
  expect(container.textContent).toContain('Seu Desempenho');
  expect(container.textContent).toContain('R$ 80.00');
  expect(container.textContent).not.toContain('A equipe faturou');
  expect(container.textContent).not.toContain('Bruno Lima');
  perguntar('quanto Bruno vendeu no geral');
  expect(container.textContent).toContain('Consulta de desempenho de outros vendedores é restrita à gerência');
});

test('resumo da própria loja usa devoluções e apenas vendas concluídas', () => {
  const { container } = montar({ id: 'admin', nome: 'Gestor', permissoes: { admin: true } }, 'gerencia');
  perguntar('quanto faturou no geral');
  expect(container.textContent).toContain('Total Faturado: **R$ 130.00**');
  expect(container.textContent).toContain('Pedidos Finalizados: **2 venda(s)**');
  perguntar('total de hoje');
  expect(container.textContent).toContain('Resumo de Vendas (Hoje)');
  expect(container.textContent).toContain('Total Faturado: **R$ 130.00**');
});

test('atalho Ctrl+K continua fechando o assistente', () => {
  const onFechar = vi.fn();
  render(<ZenAssistenteIA aberto onAbrir={vi.fn()} onFechar={onFechar}
    operadorAtivo={{ id: 'admin', nome: 'Gestor' }} patenteUsuario="gerencia"
    temPermissao={() => true} navegarPara={vi.fn()} />);
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(onFechar).toHaveBeenCalledTimes(1);
});
