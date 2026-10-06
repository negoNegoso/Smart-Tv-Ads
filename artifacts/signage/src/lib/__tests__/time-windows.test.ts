import { describe, expect, it } from 'vitest';
import {
  END_OPTIONS,
  START_OPTIONS,
  isValidWindow,
  minutesToHHMM,
  timeWindowsLabel,
} from '../time-windows';

describe('minutesToHHMM', () => {
  it('formata com dois dígitos', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(420)).toBe('07:00');
    expect(minutesToHHMM(1305)).toBe('21:45');
  });

  it('1440 é 24:00, o fim do dia', () => {
    expect(minutesToHHMM(1440)).toBe('24:00');
  });
});

describe('timeWindowsLabel', () => {
  it('sem faixa é dia todo', () => {
    expect(timeWindowsLabel([])).toBe('Dia todo');
    expect(timeWindowsLabel(undefined)).toBe('Dia todo');
  });

  it('lista as faixas separadas por vírgula', () => {
    expect(timeWindowsLabel([{ start: 420, end: 600 }, { start: 1080, end: 1320 }])).toBe('07:00–10:00, 18:00–22:00');
  });
});

describe('isValidWindow', () => {
  it('fim precisa ser depois do início', () => {
    expect(isValidWindow({ start: 420, end: 600 })).toBe(true);
    expect(isValidWindow({ start: 600, end: 600 })).toBe(false);
    expect(isValidWindow({ start: 600, end: 420 })).toBe(false);
  });
});

describe('opções do seletor', () => {
  it('início vai de 00:00 a 23:45 de 15 em 15', () => {
    expect(START_OPTIONS[0]).toBe(0);
    expect(START_OPTIONS.at(-1)).toBe(1425);
    expect(START_OPTIONS).toHaveLength(96);
  });

  it('fim vai de 00:15 a 24:00 de 15 em 15', () => {
    expect(END_OPTIONS[0]).toBe(15);
    expect(END_OPTIONS.at(-1)).toBe(1440);
    expect(END_OPTIONS).toHaveLength(96);
  });
});
