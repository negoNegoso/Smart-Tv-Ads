import { describe, expect, it } from "vitest";
import { flyerPriceParts, flyerValidityLabel, formatStoreAddress, normalizeUnit } from "../flyer-format";

describe("flyerValidityLabel", () => {
  it("mesmo ano: sem ano", () => {
    expect(flyerValidityLabel(new Date("2026-09-20T03:00:00Z"), new Date("2026-09-28T02:59:59Z"))).toBe(
      "OFERTAS VÁLIDAS DE 20/09 A 27/09",
    );
  });

  it("usa o dia de Brasília, não o de UTC", () => {
    // 02:00 UTC do dia 21 ainda é dia 20 em Brasília.
    expect(flyerValidityLabel(new Date("2026-09-21T02:00:00Z"), new Date("2026-09-21T02:00:00Z"))).toBe(
      "OFERTAS VÁLIDAS DE 20/09 A 20/09",
    );
  });

  it("cruzando o ano: com ano nas duas datas", () => {
    expect(flyerValidityLabel(new Date("2026-12-28T12:00:00Z"), new Date("2027-01-03T12:00:00Z"))).toBe(
      "OFERTAS VÁLIDAS DE 28/12/2026 A 03/01/2027",
    );
  });
});

describe("formatStoreAddress", () => {
  it("monta rua, número, bairro e cidade/UF", () => {
    expect(
      formatStoreAddress({ street: "Rua A", number: "10", district: "Centro", city: "Taubaté", state: "SP" }),
    ).toBe("Rua A, 10 - Centro, Taubaté/SP");
  });

  it("pula o que falta e devolve null sem nada", () => {
    expect(formatStoreAddress({ street: "Rua A", number: null, district: null, city: "Taubaté", state: null })).toBe(
      "Rua A, Taubaté",
    );
    expect(formatStoreAddress({ street: null, number: null, district: null, city: null, state: null })).toBeNull();
  });
});

describe("flyerPriceParts", () => {
  it("separa inteiro e centavos em pt-BR", () => {
    expect(flyerPriceParts(899)).toEqual({ integer: "8", decimals: ",99" });
    expect(flyerPriceParts(123456789)).toEqual({ integer: "1.234.567", decimals: ",89" });
    expect(flyerPriceParts(0)).toEqual({ integer: "0", decimals: ",00" });
  });
});

describe("normalizeUnit", () => {
  it("maiúsculas, corta em 12 e vazio vira null", () => {
    expect(normalizeUnit(" kg ")).toBe("KG");
    expect(normalizeUnit("bandeja com 12 unidades")).toBe("BANDEJA COM ");
    expect(normalizeUnit("  ")).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });
});
