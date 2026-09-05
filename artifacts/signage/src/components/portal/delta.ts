// artifacts/signage/src/components/portal/delta.ts

export interface Delta {
  label: string;
  direction: 'up' | 'down' | 'flat';
}

function direction(diff: number): Delta['direction'] {
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'flat';
}

/** Sinal de menos de verdade (U+2212), não hífen: alinha com os dígitos. */
function signed(value: number, suffix: string): string {
  if (value > 0) return `+${value}${suffix}`;
  if (value < 0) return `−${Math.abs(value)}${suffix}`;
  return `0${suffix}`;
}

/**
 * Variação percentual contra o período anterior.
 *
 * Sem período anterior não existe comparação: `null` faz o card mostrar um
 * traço. "+∞%" e "+100%" seriam duas mentiras diferentes sobre a primeira
 * semana de uma campanha nova.
 */
export function formatDelta(current: number, previous: number): Delta | null {
  if (!previous || previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  return { label: signed(change, '%'), direction: direction(change) };
}

/**
 * Variação de uma taxa, em pontos percentuais.
 *
 * "a taxa de resposta subiu 12%" sobre 0,81% é ambíguo — 12% do quê. "+0,1p"
 * não é.
 */
export function formatPointDelta(current: number, previous: number): Delta | null {
  if (!previous || previous <= 0) return null;
  const points = (current - previous) * 100;
  const rounded = Math.round(points * 10) / 10;
  const label = signed(rounded, 'p').replace('.', ',');
  return { label, direction: direction(rounded) };
}
