import { describe, expect, it } from 'vitest';
import { formatCents, parseReais } from '../money';

describe('formatCents', () => {
  it.each([
    [0, 'R$ 0,00'],
    [1500, 'R$ 15,00'],
    [123456, 'R$ 1.234,56'],
    [5, 'R$ 0,05'],
  ])('%d → %s', (n, texto) => {
    // Intl põe espaço não separável depois de "R$"; o teste normaliza.
    expect(formatCents(n).replace(/\s/g, ' ')).toBe(texto);
  });
});

describe('parseReais', () => {
  it.each([
    ['15', 1500],
    ['15,5', 1550],
    ['1234,56', 123456],
    ['1.234,56', 123456],
    [' 150,00 ', 15000],
    ['0', 0],
  ])('%s → %d', (texto, centavos) => {
    expect(parseReais(texto)).toBe(centavos);
  });

  it.each([[''], ['abc'], ['-1'], ['1,234'], ['1.2.3']])('%s → null', (texto) => {
    expect(parseReais(texto)).toBeNull();
  });
});
