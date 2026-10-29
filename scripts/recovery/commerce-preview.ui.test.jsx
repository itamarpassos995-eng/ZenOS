import React from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

test('banner personalizado mostra a arte original sem tonalização e sem textos por cima', () => {
  const css = readFileSync('src/commerce.css', 'utf8');
  const foto = css.match(/\.commerce-hero-with-photo \.commerce-hero-picture img\s*\{([^}]*)\}/)?.[1];
  expect(foto).toContain('object-fit:contain');
  expect(foto).toContain('opacity:1');
  expect(css).not.toContain('opacity:.38');
  expect(css).toMatch(/\.commerce-hero-with-photo:after\s*\{\s*display:none;\s*\}/);
  expect(css).toMatch(/\.commerce-hero-with-photo \.commerce-hero-picture\s*\{[^}]*position:relative/);
  expect(css).toMatch(/\.commerce-hero-with-photo \.commerce-hero-copy\s*\{[^}]*display:grid/);
  expect(css).toMatch(/\.commerce-hero-with-photo \.commerce-hero-art\s*\{\s*display:none;\s*\}/);
});

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
  expect(await screen.findByRole('heading', { name: 'Sua loja, sua identidade' })).toBeTruthy();
  expect(container.querySelector('.commerce-brand strong')?.textContent).toBe('Loja da Ana');
  expect(screen.getAllByText('Feito com carinho').length).toBeGreaterThan(0);
  expect(screen.getByText(/Entrega hoje/)).toBeTruthy();
  expect(mocks.getDoc).toHaveBeenCalledWith('lojas/loja-A/dados/configuracoes');
  expect(screen.queryByRole('button', { name: /Confirmar pedido/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /Atendimento/ })).toBeNull();
  expect(container.querySelector('.commerce-cart-row')).toBeNull();
  expect(container.querySelector('.commerce-product-price')).toBeNull();
  expect(container.querySelector('.commerce-product .commerce-btn')?.disabled).toBe(true);
  expect(container.querySelector('.commerce-preview-cart')).not.toBeNull();
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
  expect(await screen.findByRole('heading', { name: 'Sua loja, sua identidade' })).toBeTruthy();
  expect(mocks.doc).toHaveBeenCalledWith({}, 'lojas', 'loja-A', 'dados', 'configuracoes');
});

test('permite alternar a visualização entre computador e celular', async () => {
  const { container } = render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  expect(document.documentElement.classList.contains('commerce-document')).toBe(true);
  await screen.findByRole('heading', { name: 'Sua loja, sua identidade' });
  fireEvent.click(screen.getByRole('button', { name: /Computador/ }));
  expect(container.querySelector('.commerce-device-frame.desktop')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Celular/ }));
  expect(container.querySelector('.commerce-device-frame.mobile')).not.toBeNull();
  expect(screen.getByRole('button', { name: /Celular/ }).className).toBe('active');
});

test('restaura a rolagem global depois de fechar a prévia independente', async () => {
  const view = render(<CommerceVitrinePreview lojaIdRota="previa" />);
  expect(document.documentElement.classList.contains('commerce-document')).toBe(true);
  view.unmount();
  expect(document.documentElement.classList.contains('commerce-document')).toBe(false);
});

test('informa quando as configurações ainda não foram salvas', async () => {
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  expect(await screen.findByText(/Ainda não há configurações da vitrine salvas/)).toBeTruthy();
});

test('reproduz logo, banner e produto do lojista sem liberar WhatsApp ou carrinho', async () => {
  mocks.getDoc.mockImplementation(async path => path === 'lojas/loja-A/dados/configuracoes' ? {
    exists: () => true,
    data: () => ({ commerceConfig: {
      nomeLoja: 'Ateliê Aurora', logoUrl: 'data:image/png;base64,logo',
      bannerUrl: 'data:image/png;base64,banner', whatsapp: '5511999999999', mostrarPreco: true,
    } }),
  } : {
    exists: () => true,
    data: () => ({ produtos: [{ id: 'p-1', nome: 'Perfume demonstrativo', preco: 89.9, estoque: 3 }] }),
  });
  const { container } = render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  expect(await screen.findByRole('heading', { name: 'Sua loja, sua identidade' })).toBeTruthy();
  expect(container.querySelector('.commerce-brand img')?.getAttribute('src')).toBe('data:image/png;base64,logo');
  expect(container.querySelector('.commerce-hero-with-photo')).not.toBeNull();
  expect(container.querySelector('.commerce-hero-picture img')?.getAttribute('src')).toBe('data:image/png;base64,banner');
  expect(screen.getByRole('heading', { name: 'Perfume demonstrativo' })).toBeTruthy();
  expect(container.querySelector('.commerce-product .commerce-btn')?.disabled).toBe(true);
  expect(container.querySelector('a[href^="https://wa.me/"]')).toBeNull();
  expect(screen.queryByRole('button', { name: /Carrinho/ })).toBeNull();
  expect(container.querySelector('.commerce-cart-row')).toBeNull();
  expect(mocks.doc).toHaveBeenCalledWith({}, 'lojas', 'loja-A');
});

test('ao voltar à aba lê novamente alterações salvas sem fazer gravações', async () => {
  let versao = 'Antes';
  mocks.getDoc.mockImplementation(async path => ({
    exists: () => path.includes('configuracoes'),
    data: () => ({ commerceConfig: { nomeLoja: versao } }),
  }));
  const { container } = render(<CommerceVitrinePreview lojaIdRota="previa" />);
  await waitFor(() => expect(container.querySelector('.commerce-brand strong')?.textContent).toBe('Antes'));
  versao = 'Depois';
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(container.querySelector('.commerce-brand strong')?.textContent).toBe('Depois'));
  expect(mocks.getDoc).toHaveBeenCalledTimes(4);
});
