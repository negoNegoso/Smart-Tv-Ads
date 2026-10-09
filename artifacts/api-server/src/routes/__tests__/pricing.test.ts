import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPricing = vi.fn();
const savePricing = vi.fn();
const loadQuoteNetwork = vi.fn();
const loadAdvertiserIdentity = vi.fn();

vi.mock("../../lib/pricing/store", () => ({
  loadPricing: (...a: unknown[]) => loadPricing(...a),
  savePricing: (...a: unknown[]) => savePricing(...a),
  loadQuoteNetwork: (...a: unknown[]) => loadQuoteNetwork(...a),
}));
vi.mock("../../lib/campaigns/reach", () => ({
  loadAdvertiserIdentity: (...a: unknown[]) => loadAdvertiserIdentity(...a),
}));

async function app(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../pricing");
  const a = express();
  a.use(express.json());
  a.use(router);
  return a;
}

async function req() {
  const { default: request } = await import("supertest");
  return request(await app());
}

const TABELA = { pricePerTvCents: 1500, minMonthlyCents: 5000, quarterlyDiscountPct: 10, annualDiscountPct: 20 };
const ATUALIZADO = new Date("2026-10-08T12:00:00Z");
const PADARIA = 1;
// TVs da rede já sem a vitrine (loadQuoteNetwork filtra).
const REDE = [
  { id: 1, companyId: 20, segmentId: PADARIA },
  { id: 2, companyId: 30, segmentId: PADARIA },
  { id: 3, companyId: 40, segmentId: 2 },
];

beforeEach(() => {
  loadPricing.mockReset().mockResolvedValue({ ...TABELA, updatedAt: ATUALIZADO });
  savePricing.mockReset().mockImplementation(async (p) => ({ ...p, updatedAt: ATUALIZADO }));
  loadQuoteNetwork.mockReset().mockResolvedValue(REDE);
  loadAdvertiserIdentity.mockReset();
});

describe("GET /pricing", () => {
  it("devolve a tabela", async () => {
    const res = await (await req()).get("/pricing");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...TABELA, updatedAt: "2026-10-08T12:00:00.000Z" });
  });

  it("sem tabela → null", async () => {
    loadPricing.mockResolvedValue(null);
    const res = await (await req()).get("/pricing");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("PUT /pricing", () => {
  it("salva e devolve a tabela", async () => {
    const res = await (await req()).put("/pricing").send(TABELA);
    expect(res.status).toBe(200);
    expect(savePricing).toHaveBeenCalledWith(TABELA);
    expect(res.body.pricePerTvCents).toBe(1500);
  });

  it.each([
    [{ ...TABELA, pricePerTvCents: -1 }],
    [{ ...TABELA, minMonthlyCents: 100_000_001 }],
    [{ ...TABELA, quarterlyDiscountPct: 91 }],
    [{ ...TABELA, annualDiscountPct: -1 }],
    [{ ...TABELA, pricePerTvCents: 15.5 }],
    [{ ...TABELA, pricePerTvCents: "1500" }],
    [{ pricePerTvCents: 1500 }],
  ])("recusa %j com 400 e mensagem", async (corpo) => {
    const res = await (await req()).put("/pricing").send(corpo);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(savePricing).not.toHaveBeenCalled();
  });
});

describe("POST /quotes/preview", () => {
  it("sem tabela → available false, sem consultar a rede", async () => {
    loadPricing.mockResolvedValue(null);
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
    expect(loadQuoteNetwork).not.toHaveBeenCalled();
  });

  it("rede toda, sem anunciante: todas as TVs, preço calculado", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all", loopInsertions: 2, period: "annual" });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.reach).toEqual({ tvs: 3, blockedByCompetitor: 0 });
    expect(res.body.quote).toMatchObject({ tvs: 3, loopInsertions: 2, period: "annual", monthlyListCents: 9000, monthlyCents: 7200 });
  });

  it("com anunciante: TV de concorrente fica fora e é contada à parte", async () => {
    loadAdvertiserIdentity.mockResolvedValue({ companyId: 20, segmentId: PADARIA });
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all", advertiserId: 7 });
    expect(res.body.reach).toEqual({ tvs: 2, blockedByCompetitor: 1 });
    expect(loadAdvertiserIdentity).toHaveBeenCalledWith(7);
  });

  it("por TVs escolhidas", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "devices", deviceIds: [1, 3] });
    expect(res.body.reach.tvs).toBe(2);
  });

  it("por segmento", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "segments", segmentIds: [PADARIA] });
    expect(res.body.reach.tvs).toBe(2);
  });

  it("padrões: 1 inserção, mensal", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all" });
    expect(res.body.quote).toMatchObject({ loopInsertions: 1, period: "monthly" });
  });

  it("anunciante inexistente → 404", async () => {
    loadAdvertiserIdentity.mockResolvedValue(null);
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all", advertiserId: 7 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Anunciante não encontrado.");
  });

  it.each([[{ targetMode: "all", loopInsertions: 0 }], [{ targetMode: "all", loopInsertions: 6 }], [{ targetMode: "all", period: "semanal" }], [{ targetMode: "outro" }]])(
    "recusa %j com 400",
    async (corpo) => {
      expect((await (await req()).post("/quotes/preview").send(corpo)).status).toBe(400);
    },
  );
});
