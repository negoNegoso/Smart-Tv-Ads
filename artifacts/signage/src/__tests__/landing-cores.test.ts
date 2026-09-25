import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A landing passou a usar só tokens de tema. Cor fixa aqui é resquício do
 * tema claro/ultramarine: vira texto cinza-escuro no fundo preto ou botão
 * teal com letra branca ilegível.
 */
const RAIZ = resolve(import.meta.dirname, '..');
const ARQUIVOS = [
  'pages/landing.tsx',
  ...readdirSync(resolve(RAIZ, 'components/landing')).map((f) => `components/landing/${f}`),
].filter((f) => f.endsWith('.tsx'));

const PROIBIDO: Array<[string, RegExp]> = [
  ['neutro fixo', /\b(?:text|bg|border|from|via|to)-(?:zinc|slate|gray)-\d+/],
  ['bg-white', /\bbg-white\b(?!\/)/],
  ['índigo', /indigo-/],
  ['texto branco sobre primary', /bg-primary\b[^'"`]*text-white|text-white[^'"`]*bg-primary\b/],
  ['cor rgb fixa', /rgb\(\d/],
  ['--primary sobrescrito', /'--primary'/],
  // --muted sobre o cartão dá 1,1:1: o contorno do mapa some.
  ['mapa com --muted', /'hsl\(var\(--muted\)\)'/],
];

describe('landing sem cores fixas', () => {
  it.each(ARQUIVOS)('%s', (arquivo) => {
    const texto = readFileSync(resolve(RAIZ, arquivo), 'utf8');
    const achados = PROIBIDO.filter(([, re]) => re.test(texto)).map(([nome]) => nome);
    expect(achados).toEqual([]);
  });
});
