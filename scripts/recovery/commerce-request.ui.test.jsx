import React from 'react';
import { readFileSync } from 'node:fs';
import { test, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

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

test('layout de celular usa a largura da vitrine, mesmo dentro do ZenOS em tela grande', () => {
  const css = readFileSync('src/commerce.css', 'utf8');
  expect(css).toMatch(/\.commerce-store\s*\{[^}]*container:\s*commerce-store\s*\/\s*inline-size/);
  // Campos do formulário administrativo não podem receber o fundo branco da vitrine.
  expect(css).toMatch(/\.commerce-store\s+\.commerce-field\s*\{/);
  expect(css).not.toMatch(/(?:^|\n)\.commerce-field\s*\{/);
  const cssDoPainel = readFileSync('src/components/CommerceSolicitacao.css', 'utf8');
  expect(cssDoPainel).toMatch(/\.commerce-mockup-wrapper\.mobile\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*360px;/);
  const mobileRules = css.split('@container commerce-store (max-width:640px) {')[1]?.split('@container commerce-store (max-width:350px)')[0];
  expect(mobileRules).toBeTruthy();
  expect(mobileRules).toMatch(/\.commerce-header-links\s*\{\s*display:none/);
  expect(mobileRules).toMatch(/\.commerce-hero\s*\{[^}]*grid-template-columns:1fr/);
  expect(mobileRules).toMatch(/\.commerce-cart-label\s*\{\s*display:none/);
});

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
  fireEvent.click(screen.getByRole('button', { name: /Apresentação da Loja/ }));
  expect(await screen.findByDisplayValue('Loja na Nuvem')).toBeTruthy();
  expect(mocks.getDoc).toHaveBeenCalledWith('lojas/loja-A/dados/configuracoes');
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

test('salva as configurações somente no documento da loja autenticada com merge', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'nao_solicitado', habilitado: false } });
  render(<CommerceSolicitacao lojaId="loja-A" />);
  fireEvent.click(screen.getByRole('button', { name: /Apresentação da Loja/ }));

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

test('painéis retráteis atualizam a prévia ao vivo em celular e computador', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'nao_solicitado', habilitado: false } });
  const { container } = render(<CommerceSolicitacao lojaId="loja-A" />);

  expect(container.querySelector('.commerce-mockup-wrapper.mobile')).not.toBeNull();
  const areaRolavel = container.querySelector('.commerce-premium-scroll');
  expect(areaRolavel).not.toBeNull();
  expect(areaRolavel.hasAttribute('style')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: /Computador/ }));
  expect(container.querySelector('.commerce-mockup-wrapper.desktop')).not.toBeNull();
  expect(container.querySelector('.commerce-premium-scroll')).toBe(areaRolavel);

  fireEvent.click(screen.getByRole('button', { name: /Recolher Tudo/ }));
  expect(screen.queryByPlaceholderText('Ex: Loja Modelo Tintas & Ferragens')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Apresentação da Loja/ }));
  fireEvent.change(screen.getByPlaceholderText('Ex: Loja Modelo Tintas & Ferragens'), {
    target: { value: 'Minha Vitrine' },
  });
  expect(container.querySelector('.commerce-store .commerce-brand strong')?.textContent).toContain('Minha Vitrine');

  fireEvent.change(screen.getByPlaceholderText(/Promoção de Tintas/), {
    target: { value: 'Entrega hoje' },
  });
  expect(container.querySelector('.commerce-store .commerce-announcement')?.textContent).toContain('Entrega hoje');
  expect(container.querySelector('.commerce-store .commerce-preview-cart')).not.toBeNull();
  expect(container.querySelector('.commerce-store .commerce-product .commerce-btn')?.disabled).toBe(true);
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

test('ocultar um produto preserva os outros e ocultar todos não mostra produto demonstrativo', () => {
  const produtos = [
    { id: 'p-1', nome: 'Produto Azul', preco: 100, estoque: 3 },
    { id: 'p-2', nome: 'Produto Verde', preco: 50, estoque: 4 },
  ];
  const { container } = render(<CommerceSolicitacao lojaId="loja-A" produtos={produtos} />);
  expect(container.querySelectorAll('.commerce-store .commerce-product')).toHaveLength(2);

  const linhaAzul = screen.getAllByText('Produto Azul')[0].closest('.commerce-prod-row');
  fireEvent.click(within(linhaAzul).getByRole('button', { name: /Na Loja/ }));
  expect(container.querySelectorAll('.commerce-store .commerce-product')).toHaveLength(1);
  expect(container.querySelector('.commerce-store .commerce-product h3')?.textContent).toBe('Produto Verde');

  fireEvent.click(screen.getByRole('button', { name: /Ocultar Todos/ }));
  expect(container.querySelectorAll('.commerce-store .commerce-product')).toHaveLength(0);
  expect(container.querySelector('.commerce-store')?.textContent).not.toContain('Mademoiselle');
  expect(mocks.setDoc).not.toHaveBeenCalled();
});

test('desconto em lote atualiza somente a vitrine local até clicar em salvar', () => {
  const produtos = [{ id: 'p-1', nome: 'Produto Teste', preco: 100, estoque: 2 }];
  const { container } = render(<CommerceSolicitacao lojaId="loja-A" produtos={produtos} />);
  fireEvent.click(screen.getByRole('button', { name: /Aplicar % a Todos/ }));

  expect(container.querySelector('.commerce-store .commerce-price-original')?.textContent).toContain('100,00');
  expect(container.querySelector('.commerce-store .commerce-product-price.promo')?.textContent).toContain('85,00');
  expect(produtos[0].preco).toBe(100);
  expect(mocks.setDoc).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /Limpar Promoções/ }));
  expect(container.querySelector('.commerce-store .commerce-product-price.promo')).toBeNull();
  expect(container.querySelector('.commerce-store .commerce-product-price')?.textContent).toContain('100,00');
});

test('salvamento exibe confirmação visível na tela', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'nao_solicitado', habilitado: false } });
  render(<CommerceSolicitacao lojaId="loja-A" />);
  fireEvent.click(screen.getByRole('button', { name: /Salvar Configurações/ }));

  expect(await screen.findByText(/Configurações Salvas!/)).toBeTruthy();
  expect(mocks.setDoc).toHaveBeenCalledTimes(1);
});

test('resposta inesperada não habilita o Commerce Premium', async () => {
  mocks.callable.mockResolvedValue({ data: { status: 'aprovado', habilitado: true } });
  render(<CommerceSolicitacao lojaId="loja-A" />);
  abrirAbaModulo();

  await screen.findByRole('alert');
  expect(screen.queryByText('Aprovação registrada — ativação pendente')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Solicitar Ativação do Módulo' })).toBeNull();
  expect(mocks.setDoc).not.toHaveBeenCalled();
});
