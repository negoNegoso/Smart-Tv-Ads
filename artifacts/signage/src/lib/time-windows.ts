/**
 * Faixa do dia em que a campanha vai ao ar, em minutos desde 00:00 no fuso do
 * negócio — o mesmo formato que a API guarda. Fim exclusivo; 1440 é "24:00".
 * Lista vazia é "dia todo".
 */
export type TimeWindow = { start: number; end: number };

/** Mesmo teto da API. */
export const MAX_TIME_WINDOWS = 4;

/** Faixa que o "+ faixa" cria: um ponto de partida comum, fácil de ajustar. */
export const DEFAULT_TIME_WINDOW: TimeWindow = { start: 480, end: 720 };

const STEP = 15;
const SLOTS = 1440 / STEP;

/** Início: 00:00 … 23:45. Fim: 00:15 … 24:00. O passo de 15 fica garantido pelo próprio seletor. */
export const START_OPTIONS = Array.from({ length: SLOTS }, (_, i) => i * STEP);
export const END_OPTIONS = Array.from({ length: SLOTS }, (_, i) => (i + 1) * STEP);

export function minutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function isValidWindow(window: TimeWindow): boolean {
  return window.start < window.end;
}

export function timeWindowsLabel(windows: TimeWindow[] | null | undefined): string {
  if (!windows || windows.length === 0) return 'Dia todo';
  return windows.map((w) => `${minutesToHHMM(w.start)}–${minutesToHHMM(w.end)}`).join(', ');
}
