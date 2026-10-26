import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ZenNavigationLayout } from '../../src/components/ZenVisualLayout.jsx';

afterEach(() => cleanup());

test('abrir, fechar e compactar o menu não renderiza novamente a tela ativa', () => {
  const renderConteudo = vi.fn();
  const irParaPDV = vi.fn();
  const TelaAtiva = () => {
    renderConteudo();
    return <div data-testid="tela-ativa">PDV com carrinho preservado</div>;
  };

  const { container } = render(
    <ZenNavigationLayout
      sidebarProps={{
        ecraAtual: 'hub',
        grupos: [{ id: 'vendas', titulo: 'Vendas', icone: '🛒', itens: [
          { id: 'pdv', tela: 'pdv', icone: '🛒', rotulo: 'PDV', onClick: irParaPDV },
        ] }],
        perfilLoja: { nomeFantasia: 'Loja Teste' },
        usuarioAutenticado: 'gestor@teste.com',
        patenteUsuario: 'gerencia',
        userId: 'loja-teste',
        onHome: vi.fn(),
        onSair: vi.fn(),
      }}
      topbarProps={{
        status: 'SINCRONIZADO', idioma: 'pt', setIdioma: vi.fn(),
        moeda: 'BRL', setMoeda: vi.fn(), onCambio: vi.fn(),
        operador: 'Gerente', patente: 'gerencia', onTrocarOperador: vi.fn(),
        tema: 'dark', onAlternarTema: vi.fn(), onAbrirIA: vi.fn(),
      }}
    >
      <TelaAtiva />
    </ZenNavigationLayout>
  );

  expect(renderConteudo).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '☰' }));
  expect(container.querySelector('.zen-sidebar.is-mobile-open')).toBeTruthy();
  expect(renderConteudo).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));
  expect(container.querySelector('.zen-sidebar.is-mobile-open')).toBeNull();
  expect(renderConteudo).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByTitle('Recolher menu'));
  expect(container.querySelector('.zen-shell.sidebar-compact')).toBeTruthy();
  expect(renderConteudo).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: '☰' }));
  fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));
  expect(renderConteudo).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('tela-ativa').textContent).toContain('carrinho preservado');
});

test('escolher uma tela fecha o menu e conserva a navegação existente', () => {
  const navegar = vi.fn();
  const { container } = render(
    <ZenNavigationLayout
      sidebarProps={{
        ecraAtual: 'hub',
        grupos: [{ id: 'vendas', titulo: 'Vendas', icone: '🛒', itens: [
          { id: 'pdv', tela: 'pdv', icone: '🛒', rotulo: 'PDV', onClick: navegar },
        ] }],
        onHome: vi.fn(), onSair: vi.fn(),
      }}
      topbarProps={{ status: 'SINCRONIZADO', idioma: 'pt', moeda: 'BRL' }}
    >
      <main>Conteúdo da loja</main>
    </ZenNavigationLayout>
  );

  fireEvent.click(screen.getByRole('button', { name: '☰' }));
  fireEvent.click(screen.getByRole('button', { name: /PDV$/ }));
  expect(navegar).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.zen-sidebar.is-mobile-open')).toBeNull();
});
