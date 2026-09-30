import { describe, expect, it } from "vitest";
import { showcaseConflictMessage } from "../showcase";

const OUTRAS = [
  { id: 2, name: "Vitrine horizontal", orientation: "landscape" },
  { id: 3, name: "Vitrine vertical", orientation: "portrait_right" },
];

describe("showcaseConflictMessage", () => {
  it("TV que não é vitrine nunca conflita", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: false, orientation: "landscape" }, OUTRAS)).toBeNull();
  });

  it("segunda vitrine horizontal conflita, com o nome da primeira", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: true, orientation: "landscape" }, OUTRAS)).toBe(
      "Já existe uma vitrine horizontal: Vitrine horizontal",
    );
  });

  it("retrato para a esquerda conflita com retrato para a direita: a tela é a mesma vertical", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: true, orientation: "portrait_left" }, OUTRAS)).toBe(
      "Já existe uma vitrine vertical: Vitrine vertical",
    );
  });

  it("a própria TV não conta como outra", () => {
    expect(
      showcaseConflictMessage({ id: 2, showcase: true, orientation: "landscape" }, OUTRAS),
    ).toBeNull();
  });

  it("vitrine sozinha na orientação passa", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: true, orientation: "landscape" }, [OUTRAS[1]])).toBeNull();
  });
});
