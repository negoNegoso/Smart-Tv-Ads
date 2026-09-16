import { describe, expect, it } from "vitest";
import { VALE_DO_RIBEIRA, VALE_DO_RIBEIRA_IBGE } from "@workspace/db/vale-do-ribeira";
import { coverageFromRows } from "../coverage";

describe("lista do Vale do Ribeira", () => {
  it("tem os 24 municípios, sem repetição", () => {
    expect(VALE_DO_RIBEIRA).toHaveLength(24);
    expect(new Set(VALE_DO_RIBEIRA_IBGE).size).toBe(24);
  });

  it("guarda código de 7 dígitos de São Paulo (prefixo 35)", () => {
    for (const ibge of VALE_DO_RIBEIRA_IBGE) {
      expect(ibge).toMatch(/^35\d{5}$/);
    }
  });

  it("está em ordem alfabética de nome", () => {
    const nomes = VALE_DO_RIBEIRA.map((m) => m.nome);
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
});

describe("coverageFromRows", () => {
  it("mantém só municípios da lista", () => {
    const rows = [
      { ibge: "3542602", companies: 4 }, // Registro
      { ibge: "3550308", companies: 9 }, // São Paulo, fora do Vale
    ];
    expect(coverageFromRows(rows)).toEqual([{ ibge: "3542602", companies: 4 }]);
  });

  it("descarta empresa sem código IBGE", () => {
    expect(coverageFromRows([{ ibge: null, companies: 3 }])).toEqual([]);
  });

  it("descarta contagem zero ou negativa", () => {
    const rows = [
      { ibge: "3542602", companies: 0 },
      { ibge: "3509254", companies: -1 },
    ];
    expect(coverageFromRows(rows)).toEqual([]);
  });

  it("ordena por contagem desc, empate pelo código", () => {
    const rows = [
      { ibge: "3529906", companies: 2 }, // Miracatu
      { ibge: "3542602", companies: 7 }, // Registro
      { ibge: "3509254", companies: 2 }, // Cajati
    ];
    expect(coverageFromRows(rows)).toEqual([
      { ibge: "3542602", companies: 7 },
      { ibge: "3509254", companies: 2 },
      { ibge: "3529906", companies: 2 },
    ]);
  });
});
