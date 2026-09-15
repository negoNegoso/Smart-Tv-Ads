import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  listCompanies: vi.fn(),
  getCompany: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  deleteCompany: vi.fn(),
};
vi.mock("../../lib/companies/store", () => ({
  listCompanies: (...a: unknown[]) => store.listCompanies(...a),
  getCompany: (...a: unknown[]) => store.getCompany(...a),
  createCompany: (...a: unknown[]) => store.createCompany(...a),
  updateCompany: (...a: unknown[]) => store.updateCompany(...a),
  deleteCompany: (...a: unknown[]) => store.deleteCompany(...a),
  CompanyConflictError: class CompanyConflictError extends Error {},
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: companiesRouter } = await import("../companies");
  const app = express();
  app.use(express.json());
  app.use(companiesRouter);
  return app;
}

const none = { devices: 0, panels: 0, campaigns: 0 };
const detail = (over: Record<string, unknown> = {}) => ({
  id: 5, name: "Padaria Central", status: "active", clientId: 1, advertiserId: null, advertiserCompany: null,
  dependencies: none, ...over,
});

describe("rotas de empresas", () => {
  beforeEach(() => Object.values(store).forEach((fn) => fn.mockReset()));

  it("cria com os dois papéis", async () => {
    store.createCompany.mockResolvedValue(detail({ advertiserId: 2 }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/companies")
      .send({ name: "Padaria Central", isClient: true, isAdvertiser: true, cep: "01310-100" });
    expect(res.status).toBe(201);
    expect(store.createCompany).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Padaria Central", isClient: true, isAdvertiser: true, cep: "01310100" }),
    );
  });

  it("criar sem papel é 400", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/companies").send({ name: "X", isClient: false, isAdvertiser: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Marque cliente e/ou anunciante.");
    expect(store.createCompany).not.toHaveBeenCalled();
  });

  it("lista repassando os filtros", async () => {
    store.listCompanies.mockResolvedValue([]);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/companies?status=paused&role=client&q=pada");
    expect(res.status).toBe(200);
    expect(store.listCompanies).toHaveBeenCalledWith({ status: "paused", role: "client", q: "pada" });
  });

  it("empresa inexistente é 404", async () => {
    store.getCompany.mockResolvedValue(null);
    const { default: request } = await import("supertest");
    expect((await request(await buildApp()).get("/companies/99")).status).toBe(404);
  });

  it("ligar anunciante manda o plano para o store", async () => {
    store.getCompany.mockResolvedValue(detail());
    store.updateCompany.mockResolvedValue(detail({ advertiserId: 2 }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/companies/5").send({ isAdvertiser: true, advertiserCompany: "Pão Quente" });
    expect(res.status).toBe(200);
    expect(store.updateCompany).toHaveBeenCalledWith(
      5,
      {},
      { createClient: false, removeClient: false, createAdvertiser: true, removeAdvertiser: false },
      "Pão Quente",
    );
  });

  it("desligar cliente com TV é 409 e não grava", async () => {
    store.getCompany.mockResolvedValue(detail({ advertiserId: 2, dependencies: { devices: 3, panels: 0, campaigns: 0 } }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/companies/5").send({ isClient: false });
    expect(res.status).toBe(409);
    expect(res.body.dependencies).toEqual({ devices: 3, panels: 0, campaigns: 0 });
    expect(store.updateCompany).not.toHaveBeenCalled();
  });

  it("excluir com dependência é 409", async () => {
    store.getCompany.mockResolvedValue(detail({ dependencies: { devices: 1, panels: 0, campaigns: 0 } }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).delete("/companies/5");
    expect(res.status).toBe(409);
    expect(store.deleteCompany).not.toHaveBeenCalled();
  });

  it("excluir sem dependência é 204", async () => {
    store.getCompany.mockResolvedValue(detail());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).delete("/companies/5");
    expect(res.status).toBe(204);
    expect(store.deleteCompany).toHaveBeenCalledWith(5);
  });
});
