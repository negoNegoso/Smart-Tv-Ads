import { describe, expect, it } from 'vitest';
import { precisaDeMoldura } from '../art-fit';

// Tela da TV em pé (9:16) e deitada (16:9), em pixels do palco.
const EM_PE = [1080, 1920] as const;
const DEITADA = [1920, 1080] as const;

describe('precisaDeMoldura', () => {
  it('story 9:16 na TV em pé ocupa a tela, sem moldura', () => {
    expect(precisaDeMoldura(1080, 1920, ...EM_PE)).toBe(false);
  });

  it('arte 16:9 na TV deitada ocupa a tela, sem moldura', () => {
    expect(precisaDeMoldura(1920, 1080, ...DEITADA)).toBe(false);
  });

  it('diferença pequena (até 10%) segue em tela cheia', () => {
    // 1080×1800 é 6,7% mais larga que 9:16: o corte é mínimo.
    expect(precisaDeMoldura(1080, 1800, ...EM_PE)).toBe(false);
  });

  it.each([
    ['feed 4:5', 1080, 1350],
    ['feed 3:4', 1080, 1440],
    ['quadrada', 1080, 1080],
    ['deitada 16:9', 1920, 1080],
  ])('%s na TV em pé ganha moldura', (_caso, w, h) => {
    expect(precisaDeMoldura(w, h, ...EM_PE)).toBe(true);
  });

  it.each([
    ['feed 4:5', 1080, 1350],
    ['story 9:16', 1080, 1920],
  ])('%s na TV deitada ganha moldura', (_caso, w, h) => {
    expect(precisaDeMoldura(w, h, ...DEITADA)).toBe(true);
  });

  it('medida desconhecida (0) não arrisca: fica em tela cheia', () => {
    expect(precisaDeMoldura(0, 0, ...EM_PE)).toBe(false);
    expect(precisaDeMoldura(1080, 1350, 0, 0)).toBe(false);
  });
});
