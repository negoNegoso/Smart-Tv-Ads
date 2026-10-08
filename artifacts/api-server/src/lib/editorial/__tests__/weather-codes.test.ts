import { describe, expect, it } from "vitest";
import { weatherLabel } from "../weather-codes";

describe("weatherLabel", () => {
  it.each([
    [0, "Céu limpo"],
    [1, "Predomínio de sol"],
    [2, "Parcialmente nublado"],
    [3, "Nublado"],
    [45, "Neblina"],
    [53, "Garoa"],
    [61, "Chuva fraca"],
    [63, "Chuva"],
    [65, "Chuva forte"],
    [80, "Pancadas de chuva"],
    [82, "Temporal"],
    [95, "Trovoadas"],
  ])("código %i → %s", (code, label) => {
    expect(weatherLabel(code)).toBe(label);
  });

  it("código desconhecido vira tempo instável", () => {
    expect(weatherLabel(42)).toBe("Tempo instável");
  });
});
