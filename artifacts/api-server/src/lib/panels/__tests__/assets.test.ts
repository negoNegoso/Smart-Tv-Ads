import { describe, expect, it } from "vitest";
import { panelFonts } from "../assets";

describe("panelFonts", () => {
  it("carrega Inter e Fredoka nos pesos 400 e 700", async () => {
    const fonts = await panelFonts();
    expect(fonts.map((f) => `${f.name}-${f.weight}`).sort()).toEqual([
      "Fredoka-400",
      "Fredoka-700",
      "Inter-400",
      "Inter-700",
    ]);
    for (const font of fonts) expect(font.data.byteLength).toBeGreaterThan(10_000);
  });
});
