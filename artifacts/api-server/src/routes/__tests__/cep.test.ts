import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupCep = vi.fn();
vi.mock("../../lib/cep", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/cep")>()),
  lookupCep: (...a: unknown[]) => lookupCep(...a),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: cepRouter } = await import("../cep");
  const app = express();
  app.use(cepRouter);
  return app;
}

describe("GET /cep/:cep", () => {
  beforeEach(() => lookupCep.mockReset());

  it("200 com o endereço", async () => {
    lookupCep.mockResolvedValue({ cep: "01310100", city: "São Paulo", state: "SP" });
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/cep/01310-100");
    expect(res.status).toBe(200);
    expect(res.body.city).toBe("São Paulo");
    expect(lookupCep).toHaveBeenCalledWith("01310-100");
  });

  it.each([
    ["CepInvalidError", 400],
    ["CepNotFoundError", 404],
    ["CepUnavailableError", 502],
  ])("%s vira %i", async (errorName, status) => {
    const errors = await import("../../lib/cep");
    const ErrorClass = errors[errorName as "CepInvalidError"];
    lookupCep.mockRejectedValue(new ErrorClass("x"));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/cep/00000000");
    expect(res.status).toBe(status);
    expect(typeof res.body.error).toBe("string");
  });
});
