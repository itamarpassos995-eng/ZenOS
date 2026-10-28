import React from 'react';
import { test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  currentUser: { uid: 'loja-A' },
  callable: vi.fn(),
  getFunctions: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('../../src/firebase', () => ({
  auth: { get currentUser() { return mocks.currentUser; } },
  db: {},
}));
vi.mock('firebase/functions', () => ({
  getFunctions: mocks.getFunctions,
  httpsCallable: () => mocks.callable,
}));
vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc,
  setDoc: mocks.setDoc,
  serverTimestamp: mocks.serverTimestamp,
}));

import CommerceSolicitacao from '../../src/components/CommerceSolicitacao';

const abrirAbaModulo = () => {
  fireEvent.click(screen.getByRole('button', { name: /Módulo & Licença/ }));
};

beforeEach(() => {
  mocks.currentUser = { uid: 'loja-A' };
  mocks.doc.mockImplementation((_db, ...segments) => segments.join('/'));
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.serverTimestamp.mockReturnValue('timestamp-do-servidor');
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
});

test('consulta a licença sem ativar o módulo nem salvar configurações', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'nao_solicitado', habilitado: false, createdAt: null } });
  render(<CommerceSolicitacao lojaId="loja-A" />);
  abrirAbaModulo();

  const solicitar = await screen.findByRole('button', { name: 'Solicitar Ativação do Módulo' });
  expect(solicitar.disabled).toBe(false);
  expect(mocks.callable).toHaveBeenCalledTimes(1);
  expect(mocks.callable).toHaveBeenCalledWith({ action: 'consultar', lojaId: 'loja-A' });
  expect(screen.getByText('Disponível para solicitar')).toBeTruthy();
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

test('solicita somente interesse e preserva o status após remontar a tela', async () => {
  let status = 'nao_solicitado';
  mocks.callable.mockImplementation(async ({ action }) => {
    if (action === 'solicitar') status = 'pendente_analise';
    return { data: { status, habilitado: false, createdAt: '2026-10-19T18:00:00Z' } };
  });

  const view = render(<CommerceSolicitacao lojaId="loja-A" />);
  abrirAbaModulo();
  fireEvent.click(await screen.findByRole('button', { name: 'Solicitar Ativação do Módulo' }));
  await screen.findByText('Solicitação recebida');
  expect(screen.queryByRole('button', { name: 'Solicitar Ativação do Módulo' })).toBeNull();
  expect(mocks.callable).toHaveBeenCalledWith({ action: 'solicitar', lojaId: 'loja-A' });

  view.unmount();
  render(<CommerceSolicitacao lojaId="loja-A" />);
  abrirAbaModulo();
  await screen.findByText('Solicitação recebida');
  expect(mocks.callable.mock.calls.filter(([args]) => args.action === 'solicitar')).toHaveLength(1);
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

test('bloqueia consulta e gravação quando o usuário não pertence à loja', async () => {
  mocks.currentUser = { uid: 'loja-B' };
  render(<CommerceSolicitacao lojaId="loja-A" />);
  abrirAbaModulo();

  await screen.findByRole('alert');
  expect(mocks.callable).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Solicitar Ativação do Módulo' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Salvar Configurações/ }));
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

test('erro temporário permite consultar novamente sem duplicar solicitação', async () => {
  mocks.callable.mockRejectedValue(new Error('unavailable'));
  render(<CommerceSolicitacao lojaId="loja-A" />);
  abrirAbaModulo();

  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: /Atualizar Situação/ }));
  await waitFor(() => expect(mocks.callable).toHaveBeenCalledTimes(2));
  expect(mocks.callable.mock.calls.some(([args]) => args.action === 'solicitar')).toBe(false);
});

test('carrega a configuração da loja no Firestore', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'nao_solicitado', habilitado: false } });
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ commerceConfig: { nomeLoja: 'Loja na Nuvem', whatsapp: '5544999999999' } }),
  });

  render(<CommerceSolicitacao lojaId="loja-A" />);
  expect(await screen.findByDisplayValue('Loja na Nuvem')).toBeTruthy();
  expect(mocks.getDoc).toHaveBeenCalledWith('lojas/loja-A/dados/configuracoes');
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

test('salva as configurações somente no documento da loja autenticada com merge', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'nao_solicitado', habilitado: false } });
  render(<CommerceSolicitacao lojaId="loja-A" />);

  fireEvent.change(screen.getByPlaceholderText('Ex: Loja Modelo Tintas & Ferragens'), {
    target: { value: 'Loja Exemplo' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Salvar Configurações/ }));

  await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledTimes(1));
  const [path, payload, options] = mocks.setDoc.mock.calls[0];
  expect(path).toBe('lojas/loja-A/dados/configuracoes');
  expect(payload.commerceConfig.nomeLoja).toBe('Loja Exemplo');
  expect(payload.updatedAtServer).toBe('timestamp-do-servidor');
  expect(options).toEqual({ merge: true });
  expect(mocks.callable.mock.calls.some(([args]) => args.action === 'solicitar')).toBe(false);
});
