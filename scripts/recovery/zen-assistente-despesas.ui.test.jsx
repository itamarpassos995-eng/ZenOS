import React from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ZenAssistenteIA from '../../src/components/ZenAssistenteIA.jsx';

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => cleanup());

const montar = ({ permitido = true, commit } = {}) => {
  const setDespesas = vi.fn();
  const commitOperacaoNegocio = commit === undefined ? vi.fn(async ({ changes }) => ({ cloudOk: true, values: { despesas: changes[0].value } })) : commit;
  render(<ZenAssistenteIA aberto onAbrir={vi.fn()} onFechar={vi.fn()}
    operadorAtivo={{ id: permitido ? 'admin' : 'vendedor', nome: 'Teste', permissoes: {} }}
    patenteUsuario={permitido ? 'gerencia' : 'vendedor'}
    temPermissao={() => permitido} navegarPara={vi.fn()} despesas={[]}
    setDespesas={setDespesas} commitOperacaoNegocio={commitOperacaoNegocio}
    converterParaBRL={v => Number(v)} fmt={valor => `R$ ${Number(valor).toFixed(2)}`} />);
  return { commitOperacaoNegocio, setDespesas };
};

const perguntar = (texto) => {
  fireEvent.change(screen.getByPlaceholderText(/Pergunte algo/), { target: { value: texto } });
  fireEvent.click(screen.getByTitle('Enviar pergunta'));
};

test('confirmação registra despesa com valor, categoria, status e confirmação da nuvem', async () => {
  const { commitOperacaoNegocio, setDespesas } = montar();
  perguntar('lança aluguel nos custos 2.000,50 reais');
  expect(screen.getByText(/Descrição:.*Aluguel/).textContent).toContain('Aluguel');
  fireEvent.click(screen.getByText(/Confirmar e Lançar Despesa/));
  await waitFor(() => expect(commitOperacaoNegocio).toHaveBeenCalledTimes(1));
  const req = commitOperacaoNegocio.mock.calls[0][0];
  expect(req.changes).toHaveLength(1);
  expect(req.changes[0].field).toBe('despesas');
  expect(req.changes[0].value[0]).toMatchObject({ descricao: 'Aluguel', categoria: 'Infraestrutura', valorBRL: 2000.5, status: 'pendente' });
  await waitFor(() => expect(setDespesas).toHaveBeenCalledTimes(1));
});

test('falha na nuvem não atualiza a lista de despesas', async () => {
  const commit = vi.fn(async () => ({ cloudOk: false, error: new Error('Falha de teste') }));
  const { setDespesas } = montar({ commit });
  perguntar('lancar despesa internet 100');
  fireEvent.click(screen.getByText(/Confirmar e Lançar Despesa/));
  await waitFor(() => expect(screen.getByText(/Não foi possível salvar a despesa/)).toBeTruthy());
  expect(setDespesas).not.toHaveBeenCalled();
});

test('ausência de serviço de nuvem não produz confirmação falsa', async () => {
  const { setDespesas } = montar({ commit: null });
  perguntar('lancar despesa luz 100');
  fireEvent.click(screen.getByText(/Confirmar e Lançar Despesa/));
  await waitFor(() => expect(screen.getByText(/Serviço de confirmação de despesas indisponível/)).toBeTruthy());
  expect(setDespesas).not.toHaveBeenCalled();
});

test('operador sem permissão não recebe cartão de gravação', () => {
  const { commitOperacaoNegocio } = montar({ permitido: false });
  perguntar('lancar despesa aluguel 2000');
  expect(screen.queryByText(/Confirmar e Lançar Despesa/)).toBeNull();
  expect(commitOperacaoNegocio).not.toHaveBeenCalled();
});

test('cartão confirmado não permite gravar a mesma despesa novamente', async () => {
  const { commitOperacaoNegocio } = montar();
  perguntar('lancar despesa aluguel 2000');
  fireEvent.click(screen.getByText(/Confirmar e Lançar Despesa/));
  await waitFor(() => expect(screen.getByText(/Despesa registrada com sucesso/)).toBeTruthy());
  expect(screen.queryByText(/Confirmar e Lançar Despesa/)).toBeNull();
  expect(commitOperacaoNegocio).toHaveBeenCalledTimes(1);
});
