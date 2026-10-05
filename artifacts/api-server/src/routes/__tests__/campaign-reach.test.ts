import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAdvertiserIdentity = vi.fn();
const loadNetwork = vi.fn();
vi.mock("../../lib/campaigns/reach", () => ({
  loadAdvertiserIdentity: (...a: unknown[]) => loadAdvertiserIdentity(...a),
}));
vi.mock("../../lib/portal/queries", () => ({
  loadNetwork: (...a: unknown[]) => loadNetwork(...a),
}));

async function post(body: unknown) {
  const { default: express } = await import("express");
  const { default: router } = await import("../campaign-reach");
  const app: Express = express();
  app.use(express.json());
  app.use(router);
  const { default: request } = await import("supertest");
  return request(app).post("/campaigns/reach-preview").send(body as object);
}

const PADARIA = 1;
const rede = [
  { id: 1, companyId: 20, segmentId: PADARIA },
  { id: 2, companyId: 30, segmentId: PADARIA },
  { id: 3, companyId: 40, segmentId: 2 },
];

describe("POST /campaigns/reach-preview", () => {
  beforeEach(() => {
    loadAdvertiserIdentity.mockReset();
    loadNetwork.mockReset().mockResolvedValue(rede);
  });

  it("conta o alcance com a regra do concorrente e identifica o anunciante", async () => {
    loadAdvertiserIdentity.mockResolvedValue({ companyId: 20, segmentId: PADARIA });
    const res = await post({ advertiserId: 7, targetMode: "all" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reachedCount: 2,
      totalDevices: 3,
      competitorDeviceIds: [2],
      advertiserSegmentId: PADARIA,
      advertiserHasSegment: true,
      advertiserCompanyId: 20,
    });
    expect(loadAdvertiserIdentity).toHaveBeenCalledWith(7);
  });

  it("anunciante sem segmento avisa e não marca concorrente", async () => {
    loadAdvertiserIdentity.mockResolvedValue({ companyId: 50, segmentId: null });
    const res = await post({ advertiserId: 7, targetMode: "devices", deviceIds: [1, 2] });
    expect(res.body).toMatchObject({ reachedCount: 2, competitorDeviceIds: [], advertiserHasSegment: false, advertiserCompanyId: 50 });
  });

  it("anunciante inexistente é 404", async () => {
    loadAdvertiserIdentity.mockResolvedValue(null);
    const res = await post({ advertiserId: 7, targetMode: "all" });
    expect(res.status).toBe(404);
    expect(loadNetwork).not.toHaveBeenCalled();
  });

  it("corpo sem anunciante é 400", async () => {
    expect((await post({ targetMode: "all" })).status).toBe(400);
  });
});
