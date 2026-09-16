import { describe, expect, it } from 'vitest';
import { VALE_DO_RIBEIRA_IBGE } from '@workspace/db/vale-do-ribeira';
import { VALE_MUNICIPIOS, VALE_VIEW_BOX } from '../mapa-vale';

describe('asset do mapa do Vale', () => {
  it('tem um município para cada código do servidor', () => {
    expect([...VALE_MUNICIPIOS.map((m) => m.ibge)].sort()).toEqual([...VALE_DO_RIBEIRA_IBGE].sort());
  });

  it('desenha um path fechado para cada município', () => {
    for (const municipio of VALE_MUNICIPIOS) {
      expect(municipio.path.startsWith('M')).toBe(true);
      expect(municipio.path.endsWith('Z')).toBe(true);
      expect(municipio.path.length).toBeGreaterThan(20);
    }
  });

  it('tem nome legível em todo município', () => {
    for (const municipio of VALE_MUNICIPIOS) {
      expect(municipio.nome.trim().length).toBeGreaterThan(2);
    }
  });

  it('declara uma viewBox começando na origem', () => {
    expect(VALE_VIEW_BOX).toMatch(/^0 0 1000 \d+(\.\d+)?$/);
  });

  it('mantém a ordem alfabética', () => {
    const nomes = VALE_MUNICIPIOS.map((m) => m.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  it('tem proporção plausível para a região, não uma tira achatada', () => {
    // A razão real entre as extensões de latitude e longitude dos 24
    // municípios é ~0,61; com a esticada do Mercator nessa latitude a altura
    // fica perto de 672 para largura 1000. Uma projeção com unidades
    // misturadas cai para ~12 e passaria em todos os outros testes.
    const altura = Number(VALE_VIEW_BOX.split(' ')[3]);
    expect(altura).toBeGreaterThan(550);
    expect(altura).toBeLessThan(750);
  });
});
