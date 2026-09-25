import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Lê os tokens de index.css e mede contraste WCAG dos pares texto/fundo. O
 * tema virou escuro e o teal claro: um token errado aqui vira botão ilegível
 * no portal inteiro, então a conta fica num teste e não no olho.
 */
const CSS = readFileSync(resolve(import.meta.dirname, '../index.css'), 'utf8');

function bloco(inicio: RegExp): Record<string, string> {
  const m = inicio.exec(CSS);
  if (!m) throw new Error(`bloco não encontrado: ${inicio}`);
  const corpo = CSS.slice(m.index + m[0].length, CSS.indexOf('}', m.index + m[0].length));
  const vars: Record<string, string> = {};
  for (const [, nome, valor] of corpo.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[nome] = valor.trim();
  return vars;
}

function luminancia(hsl: string): number {
  const [h, s, l] = hsl.replace(/%/g, '').split(/\s+/).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PARES: Array<[string, string]> = [
  ['foreground', 'background'],
  ['card-foreground', 'card'],
  ['popover-foreground', 'popover'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['primary', 'card'],
  ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'],
];

describe('tokens de tema', () => {
  const tela = bloco(/^:root\s*\{/m);

  it('tela é escura com o teal da marca', () => {
    expect(tela.background).toBe('0 0% 0%');
    expect(tela.primary).toBe('167 69% 50%');
    expect(tela['primary-foreground']).toBe('0 0% 0%');
  });

  it.each(PARES)('tela: %s sobre %s ≥ 4,5:1', (texto, fundo) => {
    expect(contraste(tela[texto], tela[fundo])).toBeGreaterThanOrEqual(4.5);
  });

  it('não sobra bloco .dark', () => {
    expect(CSS).not.toMatch(/^\.dark\s*\{/m);
  });

  describe('impressão', () => {
    it('papel é branco', () => {
      const papel = { ...tela, ...bloco(/@media print\s*\{[\s\S]*?:root\s*\{/) };
      expect(papel.background).toBe('0 0% 100%');
      expect(papel.card).toBe('0 0% 100%');
    });

    it.each(PARES)('papel: %s sobre %s ≥ 4,5:1', (texto, fundo) => {
      const papel = { ...tela, ...bloco(/@media print\s*\{[\s\S]*?:root\s*\{/) };
      expect(contraste(papel[texto], papel[fundo])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
