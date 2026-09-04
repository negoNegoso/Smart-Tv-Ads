// artifacts/api-server/src/routes/__tests__/reset-telemetry.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// advertisers.ts importa @workspace/db, que lança sem DATABASE_URL.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const resetCampaignTelemetry = vi.fn();
vi.mock("../../lib/campaigns/reset-telemetry", () => ({
  resetCampaignTelemetry: (...a: unknown[]) => resetCampaignTelemetry(...a),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../advertisers");
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

describe("POST /campaigns/:id/reset-telemetry", () => {
  beforeEach(() => {
    resetCampaignTelemetry.mockReset();
  });

  it("responde as contagens apagadas", async () => {
    resetCampaignTelemetry.mockResolvedValue({ deletedPlays: 142, deletedScans: 8 });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns/12/reset-telemetry");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deletedPlays: 142, deletedScans: 8 });
    expect(resetCampaignTelemetry).toHaveBeenCalledWith(12);
  });

  it("404 quando a campanha não existe", async () => {
    resetCampaignTelemetry.mockResolvedValue(null);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns/999/reset-telemetry");
    expect(res.status).toBe(404);
  });

  it("400 quando o id não é um número", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns/abc/reset-telemetry");
    expect(res.status).toBe(400);
    expect(resetCampaignTelemetry).not.toHaveBeenCalled();
  });
});
