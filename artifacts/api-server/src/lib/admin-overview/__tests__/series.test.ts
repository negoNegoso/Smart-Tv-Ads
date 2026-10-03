import { describe, expect, it } from "vitest";
import { overviewSeries } from "../series";

const KEYS = ["2026-09-10", "2026-09-11", "2026-09-12"];
const DISP = KEYS.map((date) => ({ date, activeDevices: 1, totalDevices: 2 }));

describe("overviewSeries", () => {
  it("um ponto por dia, zeros onde o banco não devolveu linha", () => {
    const serie = overviewSeries(KEYS, [{ day: "2026-09-11", plays: 40 }], [], DISP);
    expect(serie.map((p) => p.plays)).toEqual([0, 40, 0]);
    expect(serie.map((p) => p.scans)).toEqual([0, 0, 0]);
  });

  // O overview do portal monta a série só a partir dos dias com exibição;
  // aqui o scan de um dia sem exibição tem de aparecer.
  it("scan em dia sem exibição não some", () => {
    const serie = overviewSeries(KEYS, [], [{ day: "2026-09-12", scans: 3 }], DISP);
    expect(serie[2]).toEqual({ date: "2026-09-12", plays: 0, scans: 3, activeDevices: 1, totalDevices: 2 });
  });

  it("leva a disponibilidade do dia, inclusive null", () => {
    const disp = [
      { date: "2026-09-10", activeDevices: null, totalDevices: 2 },
      { date: "2026-09-11", activeDevices: 2, totalDevices: 2 },
      { date: "2026-09-12", activeDevices: 1, totalDevices: 3 },
    ];
    const serie = overviewSeries(KEYS, [], [], disp);
    expect(serie.map((p) => [p.activeDevices, p.totalDevices])).toEqual([[null, 2], [2, 2], [1, 3]]);
  });
});
