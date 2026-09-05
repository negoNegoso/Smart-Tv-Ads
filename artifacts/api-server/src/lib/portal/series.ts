export type SeriesRow<K extends string> = { day: string } & Record<K, number>;
export type SeriesPoint<K extends string> = { date: string } & Record<K, number>;

/**
 * Casa as linhas agregadas do banco com o calendário completo da janela.
 *
 * O banco só devolve linha para dia que teve evento. Sem este preenchimento o
 * gráfico ligaria dois dias distantes com uma reta e o dia em que a TV ficou
 * muda viraria um trecho de operação normal.
 */
export function fillSeries<K extends string>(
  keys: string[],
  rows: SeriesRow<K>[],
  metrics: readonly K[],
): SeriesPoint<K>[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return keys.map((date) => {
    const row = byDay.get(date);
    const point: Record<string, any> = { date };
    for (const metric of metrics) {
      point[metric] = row ? Number(row[metric] ?? 0) : 0;
    }
    return point as SeriesPoint<K>;
  });
}
