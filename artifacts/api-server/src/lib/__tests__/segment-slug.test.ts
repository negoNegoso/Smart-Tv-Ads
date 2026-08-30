import { describe, expect, it } from "vitest";
import { toSegmentSlug } from "../segment-slug";

describe("toSegmentSlug", () => {
  it("põe em minúsculas e troca espaço por hífen", () => {
    expect(toSegmentSlug("Pet Shop")).toBe("pet-shop");
  });

  it("remove acentos para o slug bater com o cadastro inicial", () => {
    expect(toSegmentSlug("Salão de beleza")).toBe("salao-de-beleza");
    expect(toSegmentSlug("Farmácia")).toBe("farmacia");
  });

  it("descarta pontuação e espaço das pontas", () => {
    expect(toSegmentSlug("  Oficina/Mecânica!  ")).toBe("oficina-mecanica");
  });

  it("colapsa separadores repetidos", () => {
    expect(toSegmentSlug("Loja   de -- roupas")).toBe("loja-de-roupas");
  });
})
