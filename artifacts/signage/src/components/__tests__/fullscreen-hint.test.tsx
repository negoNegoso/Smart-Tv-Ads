import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenHint } from '../fullscreen-hint';

/**
 * TV box não entra em tela cheia sozinha: o navegador exige um gesto. O aviso
 * convida o operador a apertar OK, a tecla pede a tela cheia, e o aviso some
 * enquanto a tela cheia estiver ativa para não cobrir as peças.
 */
let noFullscreen: Element | null = null;
let pedir: ReturnType<typeof vi.fn>;

function entrarEmTelaCheia() {
  noFullscreen = document.documentElement;
  document.dispatchEvent(new Event('fullscreenchange'));
}

function sairDaTelaCheia() {
  noFullscreen = null;
  document.dispatchEvent(new Event('fullscreenchange'));
}

beforeEach(() => {
  noFullscreen = null;
  pedir = vi.fn(() => Promise.resolve());
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => noFullscreen,
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: pedir,
  });
});

afterEach(() => {
  delete (document as { fullscreenElement?: unknown }).fullscreenElement;
  delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
});

describe('FullscreenHint', () => {
  it('mostra o aviso fora da tela cheia', () => {
    render(<FullscreenHint />);
    expect(screen.getByText('Pressione OK para tela cheia')).toBeInTheDocument();
  });

  it('uma tecla do controle pede a tela cheia', () => {
    render(<FullscreenHint />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('um clique também pede a tela cheia', () => {
    render(<FullscreenHint />);
    fireEvent.click(document.body);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('some em tela cheia e volta ao sair', () => {
    render(<FullscreenHint />);
    act(() => entrarEmTelaCheia());
    expect(screen.queryByText('Pressione OK para tela cheia')).not.toBeInTheDocument();

    act(() => sairDaTelaCheia());
    expect(screen.getByText('Pressione OK para tela cheia')).toBeInTheDocument();
  });

  it('em tela cheia a tecla não pede de novo', () => {
    render(<FullscreenHint />);
    act(() => entrarEmTelaCheia());
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(pedir).not.toHaveBeenCalled();
  });

  it('navegador que recusa não derruba a página', async () => {
    pedir.mockImplementation(() => Promise.reject(new Error('negado')));
    render(<FullscreenHint />);
    fireEvent.keyDown(document, { key: 'Enter' });
    await Promise.resolve();
    expect(screen.getByText('Pressione OK para tela cheia')).toBeInTheDocument();
  });

  it('sem suporte a tela cheia não mostra aviso', () => {
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
    render(<FullscreenHint />);
    expect(screen.queryByText('Pressione OK para tela cheia')).not.toBeInTheDocument();
  });

  it('usa a versão webkit em TV box antiga', () => {
    delete (document.documentElement as { requestFullscreen?: unknown }).requestFullscreen;
    const webkit = vi.fn();
    Object.defineProperty(document.documentElement, 'webkitRequestFullscreen', {
      configurable: true,
      value: webkit,
    });
    render(<FullscreenHint />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(webkit).toHaveBeenCalledTimes(1);
    delete (document.documentElement as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen;
  });
});
