import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const SECRET = "segredo-portal";
const loadAuthContext = vi.fn();
const advertiserOverview = vi.fn();
const clientOverview = vi.fn();
const advertiserCampaigns = vi.fn();
const clientDevices = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
}));
vi.mock("../../lib/portal/overview", () => ({
  advertiserOverview: (...a: unknown[]) => advertiserOverview(...a),
  clientOverview: (...a: unknown[]) => clientOverview(...a),
}));
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

const advCtx = {
  userId: 7, email: "a@b.com", isActive: true, mustChangePassword: false,
  clientIds: [], advertiserIds: [9],
};
const clientCtx = {
  userId: 8, email: "c@b.com", isActive: true, mustChangePassword: false,
  clientIds: [4], advertiserIds: [],
};

const EMPTY_ADV = {
  period: { days: 30, from: "2026-08-07", to: "2026-09-05" },
  totals: {
    plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0,
    activeCampaigns: 0, reachedDevices: 0,
    previous: { plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 },
  },
  series: [],
};

async function get(path: string, sub: string) {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  const token = createSession(SECRET, sub);
  return request(app).get(path).set("Cookie", [`sid=${token}`]);
}

describe("GET /portal/advertiser/overview", () => {
  beforeEach(() => {
    loadAuthContext.mockReset();
    advertiserOverview.mockReset();
    clientOverview.mockReset();
    advertiserCampaigns.mockReset();
    clientDevices.mockReset();
  });

  it("passa apenas os advertiserIds da sessão", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserOverview.mockResolvedValue(EMPTY_ADV);
    const res = await get("/portal/advertiser/overview", "7");
    expect(res.status).toBe(200);
    expect(advertiserOverview).toHaveBeenCalledWith([9], 30);
  });

  it("usa 30 dias quando days está ausente", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserOverview.mockResolvedValue(EMPTY_ADV);
    await get("/portal/advertiser/overview", "7");
    expect(advertiserOverview).toHaveBeenCalledWith([9], 30);
  });

  it("aceita os presets", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserOverview.mockResolvedValue(EMPTY_ADV);
    await get("/portal/advertiser/overview?days=7", "7");
    expect(advertiserOverview).toHaveBeenCalledWith([9], 7);
  });

  // Sem isso, ?days=3650 vira uma varredura de dez anos na maior tabela.
  it("responde 400 para days fora do enum, sem tocar na query", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    const res = await get("/portal/advertiser/overview?days=3650", "7");
    expect(res.status).toBe(400);
    expect(advertiserOverview).not.toHaveBeenCalled();
  });

  it("nega quem não é anunciante", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/advertiser/overview", "8");
    expect(res.status).toBe(403);
    expect(advertiserOverview).not.toHaveBeenCalled();
  });
});

describe("GET /portal/client/overview", () => {
  beforeEach(() => {
    loadAuthContext.mockReset();
    clientOverview.mockReset();
  });

  it("passa apenas os clientIds da sessão", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    clientOverview.mockResolvedValue({
      period: { days: 30, from: "2026-08-07", to: "2026-09-05" },
      totals: { plays: 0, devices: 0, devicesOnline: 0, previous: { plays: 0 } },
      series: [],
    });
    const res = await get("/portal/client/overview?days=90", "8");
    expect(res.status).toBe(200);
    expect(clientOverview).toHaveBeenCalledWith([4], 90);
  });

  it("responde 400 para days inválido", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/client/overview?days=0", "8");
    expect(res.status).toBe(400);
    expect(clientOverview).not.toHaveBeenCalled();
  });
});

describe("days nas rotas de lista", () => {
  beforeEach(() => {
    loadAuthContext.mockReset();
    advertiserCampaigns.mockReset();
    clientDevices.mockReset();
  });

  it("repassa o período para a lista de campanhas", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserCampaigns.mockResolvedValue([]);
    await get("/portal/advertiser/campaigns?days=7", "7");
    expect(advertiserCampaigns).toHaveBeenCalledWith([9], 7);
  });

  it("repassa o período para a lista de TVs", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    clientDevices.mockResolvedValue([]);
    await get("/portal/client/devices?days=90", "8");
    expect(clientDevices).toHaveBeenCalledWith([4], 90);
  });

  it("recusa days inválido também nas listas", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    const res = await get("/portal/advertiser/campaigns?days=5", "7");
    expect(res.status).toBe(400);
    expect(advertiserCampaigns).not.toHaveBeenCalled();
  });
});
