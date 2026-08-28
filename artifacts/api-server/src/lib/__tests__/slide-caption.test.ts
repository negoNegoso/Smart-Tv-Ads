import { describe, expect, it } from "vitest";
import { normalizeDisplayText, resolveSlideCaption } from "../slide-caption";

describe("resolveSlideCaption", () => {
  it("devolve o texto quando a exibição está ligada", () => {
    expect(resolveSlideCaption({ showText: true, displayText: "Padaria do Zé" })).toBe("Padaria do Zé");
  });

  it("devolve null quando a exibição está desligada", () => {
    expect(resolveSlideCaption({ showText: false, displayText: "Padaria do Zé" })).toBeNull();
  });

  it("devolve null quando o texto é nulo", () => {
    expect(resolveSlideCaption({ showText: true, displayText: null })).toBeNull();
  });

  it("devolve null quando o texto só tem espaços", () => {
    expect(resolveSlideCaption({ showText: true, displayText: "   " })).toBeNull();
  });

  it("remove espaços das pontas do texto exibido", () => {
    expect(resolveSlideCaption({ showText: true, displayText: "  Promoção  " })).toBe("Promoção");
  });
});

describe("normalizeDisplayText", () => {
  it("remove espaços das pontas", () => {
    expect(normalizeDisplayText("  Promoção  ")).toBe("Promoção");
  });

  it("grava null quando o campo vem vazio do formulário", () => {
    expect(normalizeDisplayText("")).toBeNull();
    expect(normalizeDisplayText("   ")).toBeNull();
  });

  it("mantém undefined quando o campo não foi enviado", () => {
    expect(normalizeDisplayText(undefined)).toBeUndefined();
  });

  it("aceita null explícito", () => {
    expect(normalizeDisplayText(null)).toBeNull();
  });
});
