import { describe, expect, it } from "vitest";
import { fillHours } from "../hours";

describe("fillHours", () => {
  it("devolve as 24 horas em ordem, com zero onde não houve exibição", () => {
    const horas = fillHours([
      { hour: 19, plays: 40 },
      { hour: 7, plays: 3 },
    ]);
    expect(horas).toHaveLength(24);
    expect(horas.map((h) => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(horas[7]).toEqual({ hour: 7, plays: 3 });
    expect(horas[19]).toEqual({ hour: 19, plays: 40 });
    expect(horas[0]).toEqual({ hour: 0, plays: 0 });
  });

  it("sem linhas, 24 zeros", () => {
    expect(fillHours([]).every((h) => h.plays === 0)).toBe(true);
  });
});
