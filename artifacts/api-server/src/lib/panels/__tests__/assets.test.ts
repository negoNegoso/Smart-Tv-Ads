import { describe, expect, it } from "vitest";
import { panelFonts } from "../assets";

describe("panelFonts", () => {
  it("carrega Inter, Fredoka e Barlow Condensed nos pesos esperados", async () => {
    const fonts = await panelFonts();
    expect(fonts.map((f) => `${f.name}-${f.weight}`).sort()).toEqual([
      "Barlow Condensed-700",
      "Barlow Condensed-800",
      "Fredoka-400",
      "Fredoka-700",
      "Inter-400",
      "Inter-700",
    ]);
    for (const font of fonts) expect(font.data.byteLength).toBeGreaterThan(10_000);
  });

  it("inclui Barlow Condensed 700 e 800 para o encarte", async () => {
    const fonts = await panelFonts();
    const barlow = fonts.filter((f) => f.name === "Barlow Condensed").map((f) => f.weight).sort();
    expect(barlow).toEqual([700, 800]);
  });
});
