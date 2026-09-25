import { describe, expect, it } from "vitest";
import { contrastRatio } from "../color-contrast";
import { DEFAULT_FLYER_BACKGROUND, DEFAULT_FLYER_BAND, flyerPalette } from "../flyer-palette";

describe("flyerPalette", () => {
  it("usa verde e amarelo quando a loja não escolheu cor", () => {
    const p = flyerPalette(null, null);
    expect(p.background).toBe(DEFAULT_FLYER_BACKGROUND);
    expect(p.band).toBe(DEFAULT_FLYER_BAND);
  });

  it("cor inválida cai no padrão em vez de lançar", () => {
    expect(flyerPalette("red", "#abc").background).toBe(DEFAULT_FLYER_BACKGROUND);
  });

  it("texto branco sobre fundo escuro e escuro sobre faixa clara", () => {
    const p = flyerPalette("#0B6B3A", "#FFC20E");
    expect(p.textOnBackground).toBe("#FFFFFF");
    expect(p.textOnBand).toBe("#1F1B2E");
  });

  it("preço da grade usa a cor da faixa quando contrasta com o fundo", () => {
    const p = flyerPalette("#0B6B3A", "#FFC20E");
    expect(p.priceOnBackground).toBe("#FFC20E");
    expect(p.priceOnBand).toBe("#0B6B3A");
  });

  it("preço cai para a cor do texto quando as duas cores são parecidas", () => {
    const p = flyerPalette("#FFFFFF", "#FFFFF0");
    expect(contrastRatio(p.background, p.band)).toBeLessThan(3);
    expect(p.priceOnBackground).toBe(p.textOnBackground);
    expect(p.priceOnBand).toBe(p.textOnBand);
  });
});
