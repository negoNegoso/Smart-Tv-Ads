// artifacts/api-server/src/routes/__tests__/portal-scope.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

const SECRET = "segredo-portal";
const loadAuthContext = vi.fn();
const advertiserCampaigns = vi.fn();
const clientDevices = vi.fn();
vi.mock("../../lib/auth/user-store", () => ({ loadAuthContext: (...a: unknown[]) => loadAuthContext(...a) }));
vi.mock("../../lib/portal/queries", () => ({
  advertiserCampaigns: (...a: unknown[]) => advertiserCampaigns(...a),
  clientDevices: (...a: unknown[]) => clientDevices(...a),
}));

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { loadSession, requireUser } = await import("../../lib/auth/middleware");
  const { default: portalRouter } = await import("../portal");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/portal", requireUser, portalRouter);
  return app;
}

const advCtx = { userId: 7, email: "a@b.com", isActive: true, mustChangePassword: false, clientIds: [], advertiserIds: [9] };

describe("escopo dos portais", () => {
  beforeEach(() => { loadAuthContext.mockReset(); advertiserCampaigns.mockReset(); clientDevices.mockReset(); });

  it("passa apenas os advertiserIds do usuário para a query", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserCampaigns.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/portal/advertiser/campaigns").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
    expect(advertiserCampaigns).toHaveBeenCalledWith([9]);
  });

  it("usuário sem vínculo de anunciante recebe 403", async () => {
    loadAuthContext.mockResolvedValue({ ...advCtx, advertiserIds: [] });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/portal/advertiser/campaigns").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(403);
    expect(advertiserCampaigns).not.toHaveBeenCalled();
  });
});
