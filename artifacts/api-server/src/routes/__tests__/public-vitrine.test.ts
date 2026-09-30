import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetVitrineFeedResponse } from "@workspace/api-zod";

// vitrine.ts e device-feed.ts importam @workspace/db, que lança sem DATABASE_URL.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const findShowcaseDevice = vi.fn();
const loadDeviceSlides = vi.fn();
const dbUpdate = vi.fn();

vi.mock("../../lib/vitrine", () => ({
  findShowcaseDevice: (...a: unknown[]) => findShowcaseDevice(...a),
}));
vi.mock("../../lib/device-feed", () => ({
  loadDeviceSlides: (...a: unknown[]) => loadDeviceSlides(...a),
}));
vi.mock("@workspace/db", () => {
  const chain = { set: () => chain, where: () => Promise.resolve() };
  return {
    db: { update: (...a: unknown[]) => (dbUpdate(...a), chain) },
    devicesTable: { id: "id", lastSeenAt: "lastSeenAt" },
  };
});

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../public-vitrine");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const VITRINE = { id: 5, clientId: 1, companyId: 1, segmentId: null, orientation: "portrait_right", showcase: true };
const SLIDE = {
  announcementId: 10,
  campaignId: 3,
  title: "Pão",
  displayText: "Pão quente",
  imageUrl: "/api/storage/objects/p.jpg",
  duration: 8,
  qrImageUrl: "/api/qr/abc.png",
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  videoIds: null,
  source: "campaign",
};

beforeEach(() => {
  findShowcaseDevice.mockReset();
  loadDeviceSlides.mockReset();
  dbUpdate.mockReset();
});

describe("GET /public/vitrine/:orientation/feed", () => {
  it("devolve a rotação da vitrine no formato do feed da TV, sem a origem", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/portrait/feed");

    expect(res.status).toBe(200);
    expect(findShowcaseDevice).toHaveBeenCalledWith("portrait");
    expect(res.body.screen.orientation).toBe("portrait_right");
    expect(res.body.slides[0]).not.toHaveProperty("source");
    expect(() => GetVitrineFeedResponse.parse(res.body)).not.toThrow();
  });

  it("marca a vitrine como vista e libera cache curto de CDN", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([]);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/portrait/feed");

    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=60, stale-while-revalidate=120");
  });

  it("sem vitrine na orientação, 404 com corpo fixo e sem cache", async () => {
    findShowcaseDevice.mockResolvedValue(null);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/landscape/feed");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Showcase not found" });
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("orientação fora do enum é 400 sem consultar nada", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/portrait_right/feed");

    expect(res.status).toBe(400);
    expect(findShowcaseDevice).not.toHaveBeenCalled();
  });
});
