import { describe, expect, it } from "vitest";
import { formatPriceBRL, truncate } from "../format";

describe("formatPriceBRL", () => {
  it("formata centavos em real", () => {
    expect(formatPriceBRL(1990)).toBe("R$ 19,90");
  });

  it("preenche o centavo à esquerda", () => {
    expect(formatPriceBRL(5)).toBe("R$ 0,05");
  });

  it("zero é preço válido (item de cortesia)", () => {
    expect(formatPriceBRL(0)).toBe("R$ 0,00");
  });

  it("usa ponto de milhar", () => {
    expect(formatPriceBRL(123456)).toBe("R$ 1.234,56");
  });
});

describe("truncate", () => {
  it("devolve o texto intacto quando cabe", () => {
    expect(truncate("Pão de queijo", 20)).toBe("Pão de queijo");
  });

  it("corta com reticência e respeita o limite", () => {
    const out = truncate("Pão de queijo mineiro artesanal", 15);
    expect(out).toBe("Pão de queijo…");
    expect(out.length).toBeLessThanOrEqual(15);
  });

  it("não deixa espaço antes da reticência", () => {
    expect(truncate("Coxinha de frango", 12)).toBe("Coxinha de…");
  });
});
