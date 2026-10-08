import { describe, expect, it } from "vitest";
import { normalizeTickerMessages, tickerText } from "../ticker";

describe("tickerText", () => {
  it("junta os recados com ponto médio", () => {
    expect(tickerText(["Pão quentinho às 17h", "Siga @padaria"])).toBe("Pão quentinho às 17h · Siga @padaria");
  });

  it("sem recados não há faixa", () => {
    expect(tickerText([])).toBeNull();
  });
});

describe("normalizeTickerMessages", () => {
  it("tira espaços das pontas e descarta recados vazios", () => {
    expect(normalizeTickerMessages(["  Pão às 17h  ", "", "   ", "Siga @padaria"])).toEqual({
      ok: true,
      messages: ["Pão às 17h", "Siga @padaria"],
    });
  });

  it("lista vazia é válida (tira a faixa)", () => {
    expect(normalizeTickerMessages([])).toEqual({ ok: true, messages: [] });
  });

  it("aceita 5 recados de 80 caracteres", () => {
    const cinco = Array.from({ length: 5 }, (_, i) => `${i}`.padEnd(80, "x"));
    expect(normalizeTickerMessages(cinco)).toEqual({ ok: true, messages: cinco });
  });

  it("recusa 6 recados", () => {
    expect(normalizeTickerMessages(["a", "b", "c", "d", "e", "f"])).toEqual({ ok: false, error: "Até 5 recados." });
  });

  it("recusa recado com mais de 80 caracteres", () => {
    expect(normalizeTickerMessages(["x".repeat(81)])).toEqual({ ok: false, error: "Cada recado tem até 80 caracteres." });
  });

  it("vazios não contam no limite de 5", () => {
    expect(normalizeTickerMessages(["a", "", "b", "c", "d", "e", " "])).toEqual({
      ok: true,
      messages: ["a", "b", "c", "d", "e"],
    });
  });

  it.each([["texto solto", "oi"], ["número na lista", ["a", 2]], ["nulo", null]])(
    "entrada inválida (%s) é recusada",
    (_caso, entrada) => {
      expect(normalizeTickerMessages(entrada)).toEqual({ ok: false, error: "Recados inválidos." });
    },
  );
});
