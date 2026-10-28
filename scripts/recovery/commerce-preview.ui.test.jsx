import React from 'react';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  usuario: { uid: 'loja-A' },
  onAuthStateChanged: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('../../src/firebase', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: mocks.onAuthStateChanged }));
vi.mock('firebase/firestore', () => ({ doc: mocks.doc, getDoc: mocks.getDoc }));

import CommerceVitrinePreview from '../../src/components/CommerceVitrinePreview';

beforeEach(() => {
  mocks.usuario = { uid: 'loja-A' };
  mocks.onAuthStateChanged.mockImplementation((_auth, callback) => {
    callback(mocks.usuario);
    return () => {};
  });
  mocks.doc.mockImplementation((_db, ...partes) => partes.join('/'));
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ commerceConfig: { nomeLoja: 'Loja da Ana', slogan: 'Feito com carinho', avisoTopo: 'Entrega hoje', mostrarPreco: false } }),
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test('carrega a vitrine da própria loja com dados salvos e sem ações de compra', async () => {
  const { container } = render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  expect(await screen.findByRole('heading', { name: 'Loja da Ana' })).toBeTruthy();
  expect(screen.getByText('Feito com carinho')).toBeTruthy();
  expect(screen.getByText(/Entrega hoje/)).toBeTruthy();
  expect(mocks.getDoc).toHaveBeenCalledWith('lojas/loja-A/dados/configuracoes');
  expect(screen.getByText(/Pedido por WhatsApp · Exemplo/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Fazer Pedido/ })).toBeNull();
  expect(container.querySelector('.mock-price')).toBeNull();
});

test('bloqueia visitantes não autenticados antes de ler o Firestore', () => {
  mocks.usuario = null;
  render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  expect(screen.getByText(/Entre na sua conta ZenOS/)).toBeTruthy();
  expect(mocks.getDoc).not.toHaveBeenCalled();
});

test('não consulta nem exibe dados de outra loja', () => {
  render(<CommerceVitrinePreview lojaIdRota="loja-B" />);
  expect(screen.getByText(/Este link pertence a outra loja/)).toBeTruthy();
  expect(mocks.getDoc).not.toHaveBeenCalled();
});

test('o link /loja/previa resolve apenas a loja do usuário autenticado', async () => {
  render(<CommerceVitrinePreview lojaIdRota="previa" />);
  expect(await screen.findByRole('heading', { name: 'Loja da Ana' })).toBeTruthy();
  expect(mocks.doc).toHaveBeenCalledWith({}, 'lojas', 'loja-A', 'dados', 'configuracoes');
});

test('permite alternar a visualização entre computador e celular', async () => {
  const { container } = render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  await screen.findByRole('heading', { name: 'Loja da Ana' });
  expect(container.querySelector('.commerce-mockup-wrapper.desktop')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Celular/ }));
  expect(container.querySelector('.commerce-mockup-wrapper.mobile')).not.toBeNull();
  expect(screen.getByRole('button', { name: /Celular/ }).getAttribute('aria-pressed')).toBe('true');
});

test('informa quando as configurações ainda não foram salvas', async () => {
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  expect(await screen.findByText(/Ainda não há configurações da vitrine salvas/)).toBeTruthy();
});
