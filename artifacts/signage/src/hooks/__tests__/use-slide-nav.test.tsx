import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lerSlideDoHash, useSlideNav } from '../use-slide-nav';

beforeEach(() => {
  window.history.replaceState(null, '', '/apresentacao');
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('lerSlideDoHash', () => {
  it.each([
    ['#1', 0],
    ['#3', 2],
    ['#10', 9],
  ])('%s abre o índice %i', (hash, esperado) => {
    expect(lerSlideDoHash(hash, 10)).toBe(esperado);
  });

  it.each(['', '#', '#0', '#11', '#abc', '#2.5', '#-1'])('hash "%s" cai no primeiro slide', (hash) => {
    expect(lerSlideDoHash(hash, 10)).toBe(0);
  });
});

describe('useSlideNav', () => {
  it('abre no slide do hash', () => {
    window.history.replaceState(null, '', '/apresentacao#4');
    const { result } = renderHook(() => useSlideNav(10));
    expect(result.current.atual).toBe(3);
  });

  it('seta direita, espaço e PageDown avançam; seta esquerda e PageUp voltam', () => {
    const { result } = renderHook(() => useSlideNav(10));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(result.current.atual).toBe(3);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(result.current.atual).toBe(1);
  });

  it('não passa do último nem volta antes do primeiro', () => {
    const { result } = renderHook(() => useSlideNav(3));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(result.current.atual).toBe(0);
    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(result.current.atual).toBe(2);
  });

  it('ir() limita ao intervalo', () => {
    const { result } = renderHook(() => useSlideNav(10));
    act(() => result.current.ir(7));
    expect(result.current.atual).toBe(7);
    act(() => result.current.ir(50));
    expect(result.current.atual).toBe(9);
    act(() => result.current.ir(-2));
    expect(result.current.atual).toBe(0);
  });

  it('grava o slide atual no hash', () => {
    const { result } = renderHook(() => useSlideNav(10));
    act(() => result.current.avancar());
    act(() => result.current.avancar());
    expect(window.location.hash).toBe('#3');
    expect(window.location.pathname).toBe('/apresentacao');
  });

  it('trocar de slide não empilha histórico', () => {
    const antes = window.history.length;
    const { result } = renderHook(() => useSlideNav(10));
    for (let i = 0; i < 4; i++) act(() => result.current.avancar());
    expect(window.history.length).toBe(antes);
  });

  it('espaço com botão focado é clique no botão, não troca de slide', () => {
    const { result } = renderHook(() => useSlideNav(10));
    const botao = document.createElement('button');
    document.body.appendChild(botao);
    fireEvent.keyDown(botao, { key: ' ' });
    expect(result.current.atual).toBe(0);
    // Seta continua navegando mesmo com o botão focado.
    fireEvent.keyDown(botao, { key: 'ArrowRight' });
    expect(result.current.atual).toBe(1);
  });

  it('ignora atalhos com Ctrl, Alt ou Cmd', () => {
    const { result } = renderHook(() => useSlideNav(10));
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', metaKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    expect(result.current.atual).toBe(0);
  });
});
