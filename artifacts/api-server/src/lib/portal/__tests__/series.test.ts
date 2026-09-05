import { describe, expect, it } from "vitest";
import { fillSeries } from "../series";

const KEYS = ["2026-09-01", "2026-09-02", "2026-09-03"];

describe("fillSeries", () => {
  it("devolve um ponto por chave, na ordem das chaves", () => {
    const out = fillSeries(KEYS, [{ day: "2026-09-02", plays: 5 }], ["plays"]);
    expect(out.map((p) => p.date)).toEqual(KEYS);
  });

  // Dia mudo é informação, não buraco: sem o zero o gráfico liga o dia 1 ao
  // dia 3 com uma reta e a TV parece ter rodado o tempo todo.
  it("preenche com zero os dias sem linha no banco", () => {
    const out = fillSeries(KEYS, [{ day: "2026-09-02", plays: 5 }], ["plays"]);
    expect(out).toEqual([
      { date: "2026-09-01", plays: 0 },
      { date: "2026-09-02", plays: 5 },
      { date: "2026-09-03", plays: 0 },
    ]);
  });

  it("preenche todas as métricas pedidas", () => {
    const rows = [{ day: "2026-09-01", plays: 10, scans: 2, uniqueVisitors: 2 }];
    const out = fillSeries(KEYS, rows, ["plays", "scans", "uniqueVisitors"]);
    expect(out[0]).toEqual({ date: "2026-09-01", plays: 10, scans: 2, uniqueVisitors: 2 });
    expect(out[1]).toEqual({ date: "2026-09-02", plays: 0, scans: 0, uniqueVisitors: 0 });
  });

  // Defesa contra desalinhamento de fuso entre a query e as chaves: uma linha
  // fora da janela deve sumir, não deslocar o gráfico.
  it("ignora linhas cujo dia não está entre as chaves", () => {
    const out = fillSeries(KEYS, [{ day: "2026-08-31", plays: 99 }], ["plays"]);
    expect(out.every((p) => p.plays === 0)).toBe(true);
  });

  it("devolve tudo zerado quando não há linha nenhuma", () => {
    const out = fillSeries(KEYS, [], ["plays"]);
    expect(out).toEqual([
      { date: "2026-09-01", plays: 0 },
      { date: "2026-09-02", plays: 0 },
      { date: "2026-09-03", plays: 0 },
    ]);
  });
});
