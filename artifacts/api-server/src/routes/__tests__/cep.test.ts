import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lookupCep` é mockado como uma função simples (não `vi.fn()`) porque o
 * rastreamento interno de resultados do `vi.fn()` (usado para `mock.results`/
 * `mock.resolves`) conflita com o ciclo assíncrono extra que o supertest
 * adiciona ao fechar o servidor efêmero após a resposta: quando o mock
 * rejeita ou lança, o vitest atribui esse erro ao teste em execução mesmo
 * a resposta HTTP e as asserções tendo sido corretas (reproduzido de forma
 * isolada: idêntico com `vi.fn()` + supertest falha sempre que o resultado
 * registrado é um erro, e passa com uma função simples ou sem supertest).
 * `calls` substitui `toHaveBeenCalledWith`.
 */
const calls: unknown[][] = [];
let impl: (...args: unknown[]) => unknown = () => {
  throw new Error("lookupCep mock não configurado neste teste.");
};

function lookupCepMock(...args: unknown[]): unknown {
  calls.push(args);
  return impl(...args);
}

vi.mock("../../lib/cep", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/cep")>()),
  lookupCep: (...a: unknown[]) => lookupCepMock(...a),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: cepRouter } = await import("../cep");
  const app = express();
  app.use(cepRouter);
  return app;
}

describe("GET /cep/:cep", () => {
  beforeEach(() => {
    calls.length = 0;
    impl = () => {
      throw new Error("lookupCep mock não configurado neste teste.");
    };
  });

  it("200 com o endereço", async () => {
    impl = () => Promise.resolve({ cep: "01310100", city: "São Paulo", state: "SP" });
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/cep/01310-100");
    expect(res.status).toBe(200);
    expect(res.body.city).toBe("São Paulo");
    expect(calls).toEqual([["01310-100"]]);
  });

  it.each([
    ["CepInvalidError", 400],
    ["CepNotFoundError", 404],
    ["CepUnavailableError", 502],
  ])("%s vira %i", async (errorName, status) => {
    const errors = await import("../../lib/cep");
    const ErrorClass = errors[errorName as "CepInvalidError"];
    impl = () => Promise.reject(new ErrorClass("x"));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/cep/00000000");
    expect(res.status).toBe(status);
    expect(typeof res.body.error).toBe("string");
  });
});
