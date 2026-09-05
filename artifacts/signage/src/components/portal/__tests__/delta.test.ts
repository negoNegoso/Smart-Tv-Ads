import { describe, expect, it } from 'vitest';
import { formatDelta, formatPointDelta } from '../delta';

describe('formatDelta', () => {
  it('mostra crescimento com sinal e seta para cima', () => {
    expect(formatDelta(112, 100)).toEqual({ label: '+12%', direction: 'up' });
  });

  it('mostra queda', () => {
    expect(formatDelta(90, 100)).toEqual({ label: '−10%', direction: 'down' });
  });

  it('trata estabilidade como estável, não como alta', () => {
    expect(formatDelta(100, 100)).toEqual({ label: '0%', direction: 'flat' });
  });

  // Sem período anterior não existe comparação. "+∞%" ou "+100%" seriam duas
  // mentiras diferentes sobre a primeira semana de uma campanha nova.
  it('devolve null quando o período anterior é zero', () => {
    expect(formatDelta(50, 0)).toBeNull();
  });

  it('arredonda para inteiro', () => {
    expect(formatDelta(103, 100)).toEqual({ label: '+3%', direction: 'up' });
    expect(formatDelta(1015, 1000)).toEqual({ label: '+2%', direction: 'up' });
  });
});

describe('formatPointDelta', () => {
  // Taxa se compara em pontos percentuais. "a taxa subiu 12%" sobre 0,81% é
  // ambíguo; "+0,1p" não é.
  it('mostra a diferença em pontos percentuais', () => {
    expect(formatPointDelta(0.0081, 0.0071)).toEqual({ label: '+0,1p', direction: 'up' });
  });

  it('mostra queda em pontos', () => {
    expect(formatPointDelta(0.0071, 0.0081)).toEqual({ label: '−0,1p', direction: 'down' });
  });

  it('devolve null quando o período anterior é zero', () => {
    expect(formatPointDelta(0.01, 0)).toBeNull();
  });
});
