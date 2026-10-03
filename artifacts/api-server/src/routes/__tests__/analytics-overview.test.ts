import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

const adminOverview = vi.fn();
const adminHourly = vi.fn();
const adminRankings = vi.fn();

vi.mock("../../lib/admin-overview/queries", () => ({
  adminOverview: (...a: unknown[]) => adminOverview(...a),
  adminHourly: (...a: unknown[]) => adminHourly(...a),
  adminRankings: (...a: unknown[]) => adminRankings(...a),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: analyticsRouter } = await import("../analytics");
  const app = express();
  app.use(express.json());
  app.use(analyticsRouter);
  return app;
}

async function get(path: string) {
  const { default: request } = await import("supertest");
  return request(await buildApp()).get(path);
}

const PERIOD = { days: 30, from: "2026-09-03", to: "2026-10-02" };
const TOTALS = { plays: 0, durationSeconds: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 };
const OVERVIEW = {
  period: PERIOD,
  totals: { ...TOTALS, previous: TOTALS },
  now: { devices: 0, devicesOnline: 0, clients: 0 },
  series: [],
};

describe("GET /analytics/overview", () => {
  beforeEach(() => {
    adminOverview.mockReset();
    adminOverview.mockResolvedValue(OVERVIEW);
  });

  it("usa 30 dias quando days está ausente", async () => {
    const res = await get("/analytics/overview");
    expect(res.status).toBe(200);
    expect(adminOverview).toHaveBeenCalledWith(30);
    expect(res.body).toEqual(OVERVIEW);
  });

  it("repassa days=7", async () => {
    await get("/analytics/overview?days=7");
    expect(adminOverview).toHaveBeenCalledWith(7);
  });

  it.each(["15", "abc"])("days=%s responde 400 sem consultar o banco", async (days) => {
    const res = await get(`/analytics/overview?days=${days}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Período inválido. Use days=7, 30 ou 90." });
    expect(adminOverview).not.toHaveBeenCalled();
  });
});
