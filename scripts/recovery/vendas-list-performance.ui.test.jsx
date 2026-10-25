import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../src/firebase', () => ({ db: {} }));
import Vendas from '../../src/components/Vendas.jsx';

const historico = Array.from({ length: 220 }, (_, i) => ({
  id: `VENDA-${i}`, estado: 'concluida', tipoDocumento: 'venda',
  dataHora: '25/10/2026 11:00', createdAt: '2026-10-25T11:00:00.000Z',
  clienteNome: `Cliente ${i}`, detalhesPagamento: 'Pix', totalBRL: 20, lucroBRL: 5,
  itens: [{ id: `item-${i}`, nome: 'Serviço', qtd: '1', precoPraticadoBRL: 20, custoBRL: 15 }],
}));

test('histórico extenso monta 50 linhas e expande apenas por escolha do usuário', () => {
  const { container } = render(<Vendas
    historicoVendas={historico} historicoVendasCompleto={historico}
    setHistoricoVendas={vi.fn()} produtos={[]} setProdutos={vi.fn()}
    clientes={[]} setClientes={vi.fn()} sessoesCaixa={[]} caixaMovimentos={[]}
    operadorAtivo={{id:'admin'}} patenteUsuario="gerencia" moeda="BRL"
    fmt={v=>String(v)} tx={v=>v} t={v=>v} converterDeBRL={v=>v}
    perfilLoja={{nomeFantasia:'Loja Teste'}} taxasCambio={{BRL:1}} />);
  expect(container.querySelectorAll('tbody > tr').length).toBe(50);
  expect(screen.getByText('VENDA-0')).toBeTruthy();
  expect(screen.queryByText('VENDA-50')).toBe(null);
  fireEvent.click(screen.getByRole('button',{name:/Mostrar mais 50 registros/}));
  expect(container.querySelectorAll('tbody > tr').length).toBe(100);
  expect(screen.getByText('VENDA-50')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Pré-pedidos'}));
  expect(container.querySelectorAll('tbody > tr').length).toBe(1);
  expect(screen.queryByText('VENDA-50')).toBe(null);
});
