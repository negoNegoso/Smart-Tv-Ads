import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPricing = vi.fn();
const loadQuoteNetwork = vi.fn();
const loadAdvertiserIdentity = vi.fn();

vi.mock("../store", () => ({
  loadPricing: (...a: unknown[]) => loadPricing(...a),
  loadQuoteNetwork: (...a: unknown[]) => loadQuoteNetwork(...a),
}));
vi.mock("../../campaigns/reach", () => ({
  loadAdvertiserIdentity: (...a: unknown[]) => loadAdvertiserIdentity(...a),
}));

const TABELA = { pricePerTvCents: 1500, minMonthlyCents: 5000, quarterlyDiscountPct: 10, annualDiscountPct: 20 };
const PADARIA = 1;
const REDE = [
  { id: 1, companyId: 20, segmentId: PADARIA },
  { id: 2, companyId: 30, segmentId: PADARIA },
  { id: 3, companyId: 40, segmentId: 2 },
];
const BASE = { targetMode: "all" as const, deviceIds: [], segmentIds: [], loopInsertions: 1, period: "monthly" as const };

beforeEach(() => {
  loadPricing.mockReset().mockResolvedValue({ ...TABELA, updatedAt: new Date() });
  loadQuoteNetwork.mockReset().mockResolvedValue(REDE);
  loadAdvertiserIdentity.mockReset();
});

describe("computeQuote", () => {
  it("sem tabela de preço → unavailable", async () => {
    loadPricing.mockResolvedValue(null);
    const { computeQuote } = await import("../compute");
    expect(await computeQuote(BASE)).toEqual({ status: "unavailable" });
    expect(loadQuoteNetwork).not.toHaveBeenCalled();
  });

  it("anunciante inexistente → advertiser-not-found", async () => {
    loadAdvertiserIdentity.mockResolvedValue(null);
    const { computeQuote } = await import("../compute");
    expect(await computeQuote({ ...BASE, advertiserId: 99 })).toEqual({ status: "advertiser-not-found" });
  });

  it("ok: alcance e orçamento da rede sem vitrine", async () => {
    const { computeQuote } = await import("../compute");
    const r = await computeQuote(BASE);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.reach).toEqual({ tvs: 3, blockedByCompetitor: 0 });
    expect(r.quote.tvs).toBe(3);
    expect(r.quote.monthlyCents).toBe(5000); // 3 × 1500 = 4500 → mínimo
  });

  it("concorrente só conta se estiver dentro do alvo", async () => {
    // Anunciante da padaria (empresa 10): TVs 1 e 2 são concorrentes da rede inteira.
    loadAdvertiserIdentity.mockResolvedValue({ segmentId: PADARIA, companyId: 10 });
    const { computeQuote } = await import("../compute");

    const fora = await computeQuote({ ...BASE, advertiserId: 7, targetMode: "devices", deviceIds: [3] });
    expect(fora.status === "ok" && fora.reach).toEqual({ tvs: 1, blockedByCompetitor: 0 });

    const dentro = await computeQuote({ ...BASE, advertiserId: 7, targetMode: "devices", deviceIds: [1, 3] });
    expect(dentro.status === "ok" && dentro.reach).toEqual({ tvs: 1, blockedByCompetitor: 1 });
  });
});
