import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT_COLOR,
  discountPercent,
  normalizeAccentColor,
  promoPalette,
  resolvePromoStyle,
} from "../promo-palette";

describe("normalizeAccentColor", () => {
  it("cor válida sai em maiúsculas", () => {
    expect(normalizeAccentColor("#d63a6a")).toBe("#D63A6A");
  });

  it.each([null, undefined, "", "red", "#abc", "#12345G"])("%s vira a cor padrão", (color) => {
    expect(normalizeAccentColor(color)).toBe(DEFAULT_ACCENT_COLOR);
  });
});

describe("promoPalette", () => {
  it("rosa padrão: texto branco e preço num tom escuro da própria cor", () => {
    expect(promoPalette(null)).toEqual({ panel: "#D63A6A", text: "#FFFFFF", price: "#3A2037" });
  });

  it("cor clara: texto escuro", () => {
    expect(promoPalette("#FFE600").text).toBe("#1F1B2E");
  });

  it("cor muito escura: preço usa o texto, o tom escurecido sumiria", () => {
    expect(promoPalette("#1A1A1A")).toEqual({ panel: "#1A1A1A", text: "#FFFFFF", price: "#FFFFFF" });
  });

  it("azul médio: tom escurecido não chega a 3:1, preço usa o texto", () => {
    expect(promoPalette("#2563EB").price).toBe("#FFFFFF");
  });
});

describe("discountPercent", () => {
  it("14,99 por 8,99 é 40%", () => {
    expect(discountPercent(1499, 899)).toBe(40);
  });

  it("arredonda para o inteiro mais próximo", () => {
    expect(discountPercent(3000, 2000)).toBe(33);
  });
});

describe("resolvePromoStyle", () => {
  const item = (priceCents: number, oldPriceCents: number | null) => ({ priceCents, oldPriceCents });

  it("nulo vale price", () => {
    expect(resolvePromoStyle(null, item(899, 1499))).toBe("price");
  });

  it("percent com desconto de verdade fica percent", () => {
    expect(resolvePromoStyle("percent", item(899, 1499))).toBe("percent");
  });

  it.each([
    ["sem preço antigo", item(899, null)],
    ["preço antigo igual", item(899, 899)],
    ["preço antigo menor", item(899, 500)],
    ["preço zero", item(0, 1499)],
    ["desconto que arredonda para 0%", item(99_600, 100_000)],
    ["sem item", undefined],
  ])("percent %s cai para price", (_caso, it_) => {
    expect(resolvePromoStyle("percent", it_)).toBe("price");
  });

  it("valor desconhecido vale price", () => {
    expect(resolvePromoStyle("bogo", item(899, 1499))).toBe("price");
  });
});
