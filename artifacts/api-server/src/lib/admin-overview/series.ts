import { fillSeries } from "../portal/series";
import type { AvailabilityPoint } from "./availability";

export interface AnalyticsDayPoint {
  date: string;
  plays: number;
  scans: number;
  activeDevices: number | null;
  totalDevices: number;
}

/**
 * Junta exibições, scans e disponibilidade num ponto por dia do período.
 *
 * Exibições e scans são preenchidos cada um sobre o calendário completo — e
 * não a partir dos dias com exibição — para um scan num dia sem exibição não
 * sumir da série.
 */
export function overviewSeries(
  keys: string[],
  playRows: Array<{ day: string; plays: number }>,
  scanRows: Array<{ day: string; scans: number }>,
  availability: AvailabilityPoint[],
): AnalyticsDayPoint[] {
  const plays = fillSeries(keys, playRows, ["plays"]);
  const scans = fillSeries(keys, scanRows, ["scans"]);
  const byDay = new Map(availability.map((point) => [point.date, point]));
  return keys.map((date, index) => ({
    date,
    plays: plays[index].plays,
    scans: scans[index].scans,
    activeDevices: byDay.get(date)?.activeDevices ?? null,
    totalDevices: byDay.get(date)?.totalDevices ?? 0,
  }));
}
