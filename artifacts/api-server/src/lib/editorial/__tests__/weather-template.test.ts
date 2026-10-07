import { describe, expect, it } from "vitest";
import { weatherNode, weekdayShort } from "../weather-template";
import type { Forecast } from "../forecast";

function texts(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (!tree || typeof tree !== "object") return [];
  const children = (tree as { props?: { children?: unknown } }).props?.children;
  return Array.isArray(children) ? children.flatMap(texts) : texts(children);
}

const PREVISAO: Forecast = {
  current: { temperature: 27.6, code: 2 },
  today: { max: 31.2, min: 18.4, code: 2 },
  nextDays: [
    { date: "2026-10-08", max: 26.4, min: 17.0, code: 61 },
    { date: "2026-10-09", max: 24.9, min: 16.2, code: 3 },
    { date: "2026-10-10", max: 29.1, min: 15.8, code: 0 },
  ],
};

describe("weekdayShort", () => {
  it("dia curto, com inicial maiúscula e sem ponto", () => {
    expect(weekdayShort("2026-10-08")).toBe("Qui");
    expect(weekdayShort("2026-10-10")).toBe("Sáb");
  });
});

describe("weatherNode", () => {
  it.each(["landscape", "portrait"] as const)("mostra cidade, agora, hoje, 3 dias e relógio (%s)", (orientation) => {
    const out = texts(weatherNode({ city: "São José dos Campos", clock: "quarta, 7 de outubro · 15:42", forecast: PREVISAO }, orientation));
    expect(out).toEqual([
      "São José dos Campos",
      "28°",
      "Parcialmente nublado",
      "máx 31° · mín 18°",
      "Qui",
      "26° / 17°",
      "Sex",
      "25° / 16°",
      "Sáb",
      "29° / 16°",
      "quarta, 7 de outubro · 15:42",
    ]);
  });

  it("sem previsão, só cidade, aviso e relógio", () => {
    const out = texts(weatherNode({ city: "Taubaté", clock: "quarta, 7 de outubro · 15:42", forecast: null }, "landscape"));
    expect(out).toEqual(["Taubaté", "Previsão indisponível", "quarta, 7 de outubro · 15:42"]);
  });
});
