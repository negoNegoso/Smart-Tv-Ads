export interface HourPoint {
  hour: number;
  plays: number;
}

/**
 * As 24 horas do dia, de 0 a 23. O banco só devolve hora que teve exibição;
 * sem o preenchimento, o gráfico de barras pularia a madrugada e o horário de
 * pico pareceria mais perto do resto do que é.
 */
export function fillHours(rows: HourPoint[]): HourPoint[] {
  const byHour = new Map(rows.map((row) => [row.hour, row.plays]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, plays: byHour.get(hour) ?? 0 }));
}
