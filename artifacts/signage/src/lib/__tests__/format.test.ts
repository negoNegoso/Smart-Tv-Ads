import { describe, expect, it } from 'vitest';
import { formatDuration } from '@/lib/format';

describe('formatDuration', () => {
  it('mostra só segundos abaixo de um minuto', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('mostra minutos e segundos abaixo de uma hora', () => {
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('mostra horas e minutos acima de uma hora', () => {
    expect(formatDuration(3720)).toBe('1h 2m');
  });
});
