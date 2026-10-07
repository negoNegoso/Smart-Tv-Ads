import { describe, expect, it } from "vitest";
import { buildLoop, type LoopBlock } from "../loop-schedule";

const bloco = (weight: number, ...slides: string[]): LoopBlock<string> => ({ weight, slides });

describe("buildLoop", () => {
  it("com tudo em 1× a volta é a concatenação na ordem de entrada (igual a hoje)", () => {
    expect(buildLoop([bloco(1, "a"), bloco(1, "b"), bloco(1, "c")])).toEqual(["a", "b", "c"]);
  });

  it("espalha as inserções: A 3× com B e C sai A B A C A", () => {
    expect(buildLoop([bloco(3, "a"), bloco(1, "b"), bloco(1, "c")])).toEqual(["a", "b", "a", "c", "a"]);
  });

  describe("sem repetição colada na virada da volta", () => {
    // Cada bloco é uma letra (A, B, C…) com o peso dado, na ordem de entrada.
    const letras = (pesos: number[]) => pesos.map((w, i) => bloco(w, String.fromCharCode(65 + i)));
    const ordem = (pesos: number[]) => buildLoop(letras(pesos)).join(" ");

    it.each([
      [[1, 1, 1], "A B C"],
      [[2, 1, 1], "A B A C"],
      [[2, 1, 1, 1], "A B C A D"],
      [[2, 1, 1, 1, 1, 1], "A B C D E A F"],
      [[3, 1, 1, 1, 1], "A B C A D A E"],
      [[3, 2, 1], "A B A C A B"],
      [[3, 1, 1], "A B A C A"],
      [[2, 1], "A B A"],
    ])("pesos %j dão %s", (pesos, esperado) => {
      expect(ordem(pesos)).toBe(esperado);
    });

    it.each([[[2, 1, 1]], [[2, 1, 1, 1]], [[2, 1, 1, 1, 1, 1]], [[3, 1, 1, 1, 1]], [[3, 2, 1]], [[2, 2, 1, 1]]])(
      "pesos %j: cada bloco entra `peso` vezes e nenhum encosta em si mesmo, nem na virada",
      (pesos) => {
        const volta = buildLoop(letras(pesos));
        const total = pesos.reduce((a, b) => a + b, 0);
        expect(volta).toHaveLength(total);
        pesos.forEach((w, i) => {
          expect(volta.filter((x) => x === String.fromCharCode(65 + i))).toHaveLength(w);
        });
        // Só vale quando dá: peso > total/2 obriga encostar.
        expect(pesos.every((w) => 2 * w <= total)).toBe(true);
        volta.forEach((x, i) => expect(x).not.toBe(volta[(i + 1) % volta.length]));
      },
    );
  });

  it("cada bloco aparece exatamente o número de vezes do peso", () => {
    const volta = buildLoop([bloco(2, "a"), bloco(3, "b"), bloco(1, "c"), bloco(1, "d")]);
    const conta = (x: string) => volta.filter((s) => s === x).length;
    expect([conta("a"), conta("b"), conta("c"), conta("d")]).toEqual([2, 3, 1, 1]);
    expect(volta).toHaveLength(7);
  });

  it("o bloco toca as peças em sequência a cada inserção", () => {
    expect(buildLoop([bloco(2, "a1", "a2"), bloco(1, "b")])).toEqual(["a1", "a2", "b", "a1", "a2"]);
  });

  it("bloco sem peça some e não ocupa inserção", () => {
    expect(buildLoop([bloco(3), bloco(1, "b"), bloco(1, "c")])).toEqual(["b", "c"]);
  });

  it("sem blocos a volta é vazia", () => {
    expect(buildLoop([])).toEqual([]);
  });

  it("mesma entrada, mesma volta (a TV recomeça quando a lista muda)", () => {
    const entrada = () => [bloco(2, "a"), bloco(3, "b"), bloco(1, "c")];
    expect(buildLoop(entrada())).toEqual(buildLoop(entrada()));
  });

  it("não altera os blocos recebidos", () => {
    const blocos = [bloco(2, "a1", "a2"), bloco(1, "b")];
    buildLoop(blocos);
    expect(blocos).toEqual([bloco(2, "a1", "a2"), bloco(1, "b")]);
  });

  it("peso inválido vale 1 e fração vale a parte inteira", () => {
    expect(buildLoop([bloco(0, "a"), bloco(Number.NaN, "b"), bloco(-2, "c")])).toEqual(["a", "b", "c"]);
    expect(buildLoop([bloco(2.9, "a"), bloco(1, "b")])).toEqual(["a", "b", "a"]);
  });
});
