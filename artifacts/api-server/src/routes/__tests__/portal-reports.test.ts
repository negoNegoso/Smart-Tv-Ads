import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

const SECRET = "segredo-relatorios";
const loadAuthContext = vi.fn();
const campaignOwner = vi.fn();
const campaignReport = vi.fn();
const deviceOwner = vi.fn();
const deviceReport = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
}));
vi.mock("../../lib/portal/reports", () => ({
  campaignOwner: (...a: unknown[]) => campaignOwner(...a),
  campaignReport: (...a: unknown[]) => campaignReport(...a),
  deviceOwner: (...a: unknown[]) => deviceOwner(...a),
  deviceReport: (...a: unknown[]) => deviceReport(...a),
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
const clientCtx = { userId: 8, email: "c@b.com", isActive: true, mustChangePassword: false, clientIds: [4], advertiserIds: [] };

async function get(path: string, sub: string) {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return request(app).get(path).set("Cookie", [`sid=${createSession(SECRET, sub)}`]);
}

const REPORT = { campaign: { id: 5 } };

beforeEach(() => {
  for (const fn of [loadAuthContext, campaignOwner, campaignReport, deviceOwner, deviceReport]) fn.mockReset();
});

describe("GET /portal/advertiser/campaigns/:id/report", () => {
  it("id inválido responde 400", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    const res = await get("/portal/advertiser/campaigns/abc/report", "7");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Campanha inválida." });
  });

  // Não confirma que a campanha de outro anunciante existe, e nem calcula o relatório.
  it("campanha de outro anunciante responde 404 sem calcular o relatório", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    campaignOwner.mockResolvedValue(10);
    const res = await get("/portal/advertiser/campaigns/5/report", "7");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Campaign not found" });
    expect(campaignReport).not.toHaveBeenCalled();
  });

  it("campanha inexistente responde 404", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    campaignOwner.mockResolvedValue(null);
    const res = await get("/portal/advertiser/campaigns/5/report", "7");
    expect(res.status).toBe(404);
    expect(campaignReport).not.toHaveBeenCalled();
  });

  // Admin do env não tem usuário no banco: escopo vazio, então nem consulta o dono.
  it("admin do env (escopo vazio) responde 404 sem consultar dono nem calcular", async () => {
    const res = await get("/portal/advertiser/campaigns/5/report", "admin");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Campaign not found" });
    expect(campaignOwner).not.toHaveBeenCalled();
    expect(campaignReport).not.toHaveBeenCalled();
  });

  it("campanha do anunciante devolve o relatório", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    campaignOwner.mockResolvedValue(9);
    campaignReport.mockResolvedValue(REPORT);
    const res = await get("/portal/advertiser/campaigns/5/report", "7");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(REPORT);
    expect(campaignReport).toHaveBeenCalledWith(5);
  });
});

describe("GET /portal/client/devices/:id/report", () => {
  it("id inválido responde 400", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/client/devices/0/report", "8");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "TV inválida." });
  });

  it("days inválido responde 400", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/client/devices/2/report?days=15", "8");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Período inválido. Use days=7, 30 ou 90." });
  });

  it("TV de outra loja responde 404 sem calcular o relatório", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    deviceOwner.mockResolvedValue(99);
    const res = await get("/portal/client/devices/2/report", "8");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
    expect(deviceReport).not.toHaveBeenCalled();
  });

  it("admin do env (escopo vazio) responde 404 sem consultar dono nem calcular", async () => {
    const res = await get("/portal/client/devices/2/report", "admin");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
    expect(deviceOwner).not.toHaveBeenCalled();
    expect(deviceReport).not.toHaveBeenCalled();
  });

  it("TV da loja devolve o relatório com 30 dias por padrão", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    deviceOwner.mockResolvedValue(4);
    deviceReport.mockResolvedValue({ device: { id: 2 } });
    const res = await get("/portal/client/devices/2/report", "8");
    expect(res.status).toBe(200);
    expect(deviceReport).toHaveBeenCalledWith(2, 30);
  });

  it("repassa days=7", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    deviceOwner.mockResolvedValue(4);
    deviceReport.mockResolvedValue({ device: { id: 2 } });
    await get("/portal/client/devices/2/report?days=7", "8");
    expect(deviceReport).toHaveBeenCalledWith(2, 7);
  });
});
