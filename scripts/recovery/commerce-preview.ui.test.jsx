import React from 'react';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  usuario: { uid: 'loja-A' },
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('../../src/firebase', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInAnonymously: mocks.signInAnonymously,
}));
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
  mocks.signInAnonymously.mockResolvedValue({ user: { uid: 'anonimo' } });
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
  expect(container.querySelector('.commerce-product')).toBeNull();
  expect(container.querySelector('.commerce-empty h3')?.textContent).toBe('Nossa seleção está chegando');
  expect(container.querySelector('.commerce-preview-cart')).not.toBeNull();
});

test('visitante não autenticado inicia login anônimo sem consultar loja antes da autenticação', () => {
  mocks.usuario = null;
  render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  expect(screen.getByText(/Verificando o acesso à vitrine/)).toBeTruthy();
  expect(mocks.signInAnonymously).toHaveBeenCalled();
  expect(mocks.getDoc).not.toHaveBeenCalled();
});

test('vitrine pública consulta somente a loja solicitada, sem ler dados da conta conectada', async () => {
  mocks.getDoc.mockImplementation(async path => {
    if (path === 'lojas/loja-B/dados/configuracoes') return {
      exists: () => true,
      data: () => ({ commerceConfig: { nomeLoja: 'Loja Pública B' } }),
    };
    if (path === 'lojas/loja-B') return {
      exists: () => true,
      data: () => ({ produtos: [{ id: 'b-1', nome: 'Produto da Loja B', preco: 12, estoque: 2 }] }),
    };
    throw Error('Consulta fora da loja solicitada: ' + path);
  });
  const { container } = render(<CommerceVitrinePreview lojaIdRota="loja-B" />);
  await screen.findByRole('heading', { name: 'Produto da Loja B' });
  expect(container.querySelector('.commerce-brand strong')?.textContent).toBe('Loja Pública B');
  expect(mocks.getDoc).toHaveBeenCalledTimes(2);
  expect(mocks.doc).not.toHaveBeenCalledWith({}, 'lojas', 'loja-A', 'dados', 'configuracoes');
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

test('primeiro produto sem foto não recebe imagem demonstrativa na prévia', async () => {
  mocks.getDoc.mockImplementation(async path => path === 'lojas/loja-A/dados/configuracoes' ? {
    exists: () => true,
    data: () => ({ commerceConfig: { produtosLoja: { 'p-1': { ativo: true } } } }),
  } : {
    exists: () => true,
    data: () => ({ produtos: [
      { id: 'p-1', nome: 'Meia cana de Forro PVC', preco: 38, estoque: 10 },
      { id: 'p-2', nome: 'Outro produto com foto', preco: 20, estoque: 2, fotoUrl: '/foto-correta.webp' },
    ] }),
  });
  const { container } = render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  await screen.findByRole('heading', { name: 'Meia cana de Forro PVC' });

  const cards = container.querySelectorAll('.commerce-product');
  expect(cards).toHaveLength(2);
  expect(cards[0].querySelector('.commerce-product-image img')).toBeNull();
  expect(cards[1].querySelector('.commerce-product-image img')?.getAttribute('src')).toBe('/foto-correta.webp');
  expect(container.querySelector('.commerce-store')?.textContent).not.toContain('Mademoiselle');
  expect(mocks.getDoc).toHaveBeenCalledTimes(2);
});

test('galeria com várias fotos navega na prévia somente leitura', async () => {
  // O jsdom não implementa o elemento <dialog> nativo do navegador.
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  mocks.getDoc.mockImplementation(async path => path === 'lojas/loja-A/dados/configuracoes' ? {
    exists: () => true,
    data: () => ({ commerceConfig: { produtosLoja: {
      'p-1': { imagensLoja: ['/foto-a.jpg', '/foto-b.jpg', '/foto-c.jpg'] },
    } } }),
  } : {
    exists: () => true,
    data: () => ({ produtos: [{ id: 'p-1', nome: 'Produto Galeria', preco: 50, estoque: 3 }] }),
  });
  const { container } = render(<CommerceVitrinePreview lojaIdRota="loja-A" />);
  await screen.findByRole('heading', { name: 'Produto Galeria' });
  const indicadores = container.querySelectorAll('.commerce-card-photo-dots .commerce-card-photo-dot');
  expect(indicadores).toHaveLength(3);
  expect(indicadores[0].classList.contains('active')).toBe(true);
  expect(container.querySelector('.commerce-badge-multi-fotos')).toBeNull();
  expect(container.querySelector('.commerce-product-image')?.textContent).not.toContain('📷');

  fireEvent.click(screen.getByRole('button', { name: 'Ver Produto Galeria' }));
  expect(container.querySelector('.commerce-full-image')?.getAttribute('src')).toBe('/foto-a.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'Próxima foto' }));
  expect(container.querySelector('.commerce-full-image')?.getAttribute('src')).toBe('/foto-b.jpg');
  fireEvent.click(screen.getByRole('button', { name: 'Foto 3' }));
  expect(container.querySelector('.commerce-full-image')?.getAttribute('src')).toBe('/foto-c.jpg');
  expect(container.querySelector('.commerce-gallery-dots button[aria-pressed="true"]')).not.toBeNull();
  expect(container.querySelector('.commerce-cart-row')).toBeNull();
  expect(container.querySelector('.commerce-btn[disabled]')).not.toBeNull();
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
