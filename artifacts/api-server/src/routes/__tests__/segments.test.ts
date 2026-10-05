import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  listSegmentsWithUsage: vi.fn(),
  getSegmentWithUsage: vi.fn(),
  findSegmentBySlug: vi.fn(),
  createSegment: vi.fn(),
  renameSegment: vi.fn(),
  deleteSegmentIfUnused: vi.fn(),
  mergeSegments: vi.fn(),
};
vi.mock("../../lib/segments/store", () => ({
  listSegmentsWithUsage: (...a: unknown[]) => store.listSegmentsWithUsage(...a),
  getSegmentWithUsage: (...a: unknown[]) => store.getSegmentWithUsage(...a),
  findSegmentBySlug: (...a: unknown[]) => store.findSegmentBySlug(...a),
  createSegment: (...a: unknown[]) => store.createSegment(...a),
  renameSegment: (...a: unknown[]) => store.renameSegment(...a),
  deleteSegmentIfUnused: (...a: unknown[]) => store.deleteSegmentIfUnused(...a),
  mergeSegments: (...a: unknown[]) => store.mergeSegments(...a),
  SegmentSlugConflictError: class SegmentSlugConflictError extends Error {},
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../segments");
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

async function http() {
  const { default: request } = await import("supertest");
  return request(await buildApp());
}

const padaria = { id: 1, slug: "padaria", name: "Padaria", companyCount: 4, campaignCount: 1 };

describe("rotas de segmentos", () => {
  beforeEach(() => Object.values(store).forEach((fn) => fn.mockReset()));

  it("lista com as contagens de uso", async () => {
    store.listSegmentsWithUsage.mockResolvedValue([padaria]);
    const res = await (await http()).get("/segments");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([padaria]);
  });

  it("criar com slug repetido é 409", async () => {
    store.findSegmentBySlug.mockResolvedValue(padaria);
    const res = await (await http()).post("/segments").send({ name: "Padaria " });
    expect(res.status).toBe(409);
    expect(store.createSegment).not.toHaveBeenCalled();
  });

  it("cria com nome aparado e slug calculado", async () => {
    store.findSegmentBySlug.mockResolvedValue(null);
    store.createSegment.mockResolvedValue({ id: 9, slug: "farmacia", name: "Farmácia" });
    const res = await (await http()).post("/segments").send({ name: " Farmácia " });
    expect(res.status).toBe(201);
    expect(store.createSegment).toHaveBeenCalledWith("Farmácia", "farmacia");
  });

  it("renomear só mudando caixa e acento não colide com ele mesmo", async () => {
    store.getSegmentWithUsage.mockResolvedValue(padaria);
    store.findSegmentBySlug.mockResolvedValue(padaria);
    store.renameSegment.mockResolvedValue({ ...padaria, name: "PADARIA" });
    const res = await (await http()).patch("/segments/1").send({ name: "PADARIA" });
    expect(res.status).toBe(200);
    expect(store.renameSegment).toHaveBeenCalledWith(1, "PADARIA", "padaria");
  });

  it("renomear para o nome de outro segmento é 409 sugerindo mesclar", async () => {
    store.getSegmentWithUsage.mockResolvedValue({ ...padaria, id: 2, slug: "panificadora", name: "Panificadora" });
    store.findSegmentBySlug.mockResolvedValue(padaria);
    const res = await (await http()).patch("/segments/2").send({ name: "padaria" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Já existe o segmento Padaria — use mesclar");
    expect(store.renameSegment).not.toHaveBeenCalled();
  });

  it("renomear segmento inexistente é 404", async () => {
    store.getSegmentWithUsage.mockResolvedValue(null);
    const res = await (await http()).patch("/segments/99").send({ name: "Mercado" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Segmento não encontrado.");
  });

  it("renomear para nome sem letra nem número é 400", async () => {
    const res = await (await http()).patch("/segments/1").send({ name: "!!!" });
    expect(res.status).toBe(400);
  });

  it("apagar livre é 204", async () => {
    store.deleteSegmentIfUnused.mockResolvedValue({ status: "deleted" });
    const res = await (await http()).delete("/segments/1");
    expect(res.status).toBe(204);
  });

  it("apagar em uso é 409 com as contagens", async () => {
    store.deleteSegmentIfUnused.mockResolvedValue({ status: "in_use", usage: { companyCount: 3, campaignCount: 1 } });
    const res = await (await http()).delete("/segments/1");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Usado por 3 empresas e 1 campanha", companyCount: 3, campaignCount: 1 });
  });

  it("apagar inexistente é 404", async () => {
    store.deleteSegmentIfUnused.mockResolvedValue({ status: "not_found" });
    expect((await (await http()).delete("/segments/1")).status).toBe(404);
  });

  it("mesclar devolve o destino com as contagens novas", async () => {
    store.mergeSegments.mockResolvedValue({ status: "merged", target: { ...padaria, companyCount: 6 } });
    const res = await (await http()).post("/segments/2/merge").send({ targetId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.companyCount).toBe(6);
    expect(store.mergeSegments).toHaveBeenCalledWith(2, 1);
  });

  it("mesclar com destino não inteiro é 400 sem gravar", async () => {
    const res = await (await http()).post("/segments/2/merge").send({ targetId: 1.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Escolha o segmento de destino");
    expect(store.mergeSegments).not.toHaveBeenCalled();
  });

  it("mesclar no próprio segmento é 400 sem gravar", async () => {
    const res = await (await http()).post("/segments/1/merge").send({ targetId: 1 });
    expect(res.status).toBe(400);
    expect(store.mergeSegments).not.toHaveBeenCalled();
  });

  it("mesclar com origem ou destino inexistente é 404", async () => {
    store.mergeSegments.mockResolvedValue({ status: "not_found" });
    expect((await (await http()).post("/segments/2/merge").send({ targetId: 1 })).status).toBe(404);
  });
});
