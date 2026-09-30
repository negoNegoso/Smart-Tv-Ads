import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APRESENTACAO } from '@/lib/apresentacao-content';
import { LANDING } from '@/lib/landing-content';
import Apresentacao from '../apresentacao';

function renderPagina() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Apresentacao />
    </QueryClientProvider>,
  );
}

// jsdom: window.innerWidth = 1024. Metade direita > 512.
const DIREITA = { clientX: 900, clientY: 300 };
const ESQUERDA = { clientX: 100, clientY: 300 };

function slideAtual() {
  return screen.getByRole('progressbar').getAttribute('aria-valuenow');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/apresentacao');
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('Apresentacao', () => {
  it('abre na capa', () => {
    renderPagina();
    expect(screen.getByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
    expect(slideAtual()).toBe('1');
  });

  it('clique na metade direita avança e na esquerda volta', () => {
    renderPagina();
    const palco = screen.getByTestId('palco');
    fireEvent.click(palco, DIREITA);
    expect(screen.getByRole('heading', { level: 2, name: APRESENTACAO.problema.titulo })).toBeInTheDocument();
    fireEvent.click(palco, ESQUERDA);
    expect(screen.getByText(APRESENTACAO.capa.tagline)).toBeInTheDocument();
  });

  it('clique num botão do slide não troca de slide', async () => {
    window.history.replaceState(null, '', '/apresentacao#3');
    renderPagina();
    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.portrait }));
    expect(slideAtual()).toBe('3');
  });

  it('índice pula para o bloco escolhido e fecha', async () => {
    renderPagina();
    await userEvent.click(screen.getByRole('button', { name: APRESENTACAO.navegacao.indice }));
    const dialogo = screen.getByRole('dialog', { name: APRESENTACAO.navegacao.indice });
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(APRESENTACAO.blocos.ponto) }),
    );
    expect(dialogo).not.toBeInTheDocument();
    expect(slideAtual()).toBe('9');
  });

  it('depois de usar o botão do índice, espaço avança em vez de reabrir o índice', async () => {
    renderPagina();
    const botao = screen.getByRole('button', { name: APRESENTACAO.navegacao.indice });
    await userEvent.click(botao);
    fireEvent.keyDown(window, { key: 'Escape' });
    await userEvent.keyboard(' ');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(slideAtual()).toBe('2');
  });

  it('tecla I abre o índice e Esc fecha', () => {
    renderPagina();
    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByRole('dialog', { name: APRESENTACAO.navegacao.indice })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clique dentro do índice fora dos botões não troca de slide', async () => {
    renderPagina();
    await userEvent.click(screen.getByRole('button', { name: APRESENTACAO.navegacao.indice }));
    fireEvent.click(screen.getByRole('dialog'), DIREITA);
    expect(slideAtual()).toBe('1');
  });

  it('tecla F sem Fullscreen API não quebra', () => {
    // jsdom não implementa requestFullscreen, igual ao Safari de iPhone.
    renderPagina();
    expect(() => fireEvent.keyDown(window, { key: 'f' })).not.toThrow();
    expect(slideAtual()).toBe('1');
  });

  it('pede para não ser indexada e devolve a meta original ao sair', () => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'index, follow';
    document.head.appendChild(meta);
    const { unmount } = renderPagina();
    expect(meta.content).toBe('noindex');
    unmount();
    expect(meta.content).toBe('index, follow');
    meta.remove();
  });
});
