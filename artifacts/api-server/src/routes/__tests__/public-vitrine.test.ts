import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetVitrineFeedResponse } from "@workspace/api-zod";

// vitrine.ts e device-feed.ts importam @workspace/db, que lança sem DATABASE_URL.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const findShowcaseDevice = vi.fn();
const loadDeviceSlides = vi.fn();
const dbUpdate = vi.fn();
const dbInsert = vi.fn();
const state = vi.hoisted(() => ({ insertReturning: [] as unknown[] }));

vi.mock("../../lib/vitrine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/vitrine")>()),
  findShowcaseDevice: (...a: unknown[]) => findShowcaseDevice(...a),
}));
vi.mock("../../lib/device-feed", () => ({
  loadDeviceSlides: (...a: unknown[]) => loadDeviceSlides(...a),
}));
vi.mock("@workspace/db", () => {
  const chain = { set: () => chain, where: () => Promise.resolve() };
  return {
    db: {
      update: (...a: unknown[]) => (dbUpdate(...a), chain),
      insert: () => ({
        values: (rows: unknown) => {
          dbInsert(rows);
          return { onConflictDoNothing: () => ({ returning: () => Promise.resolve(state.insertReturning) }) };
        },
      }),
    },
    devicesTable: { id: "id", lastSeenAt: "lastSeenAt" },
    playsTable: { deviceId: "deviceId", clientPlayId: "clientPlayId", id: "id" },
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
  dbInsert.mockReset();
  state.insertReturning = [];
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

const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const PLAY = { playId: "a1b2c3d4-0000-4000-8000-000000000001", announcementId: 10, campaignId: 3, durationSeconds: 8, ageSeconds: 2 };

async function post(body: object, ua = UA) {
  const { default: request } = await import("supertest");
  return request(await buildApp()).post("/public/vitrine/plays").set("User-Agent", ua).send(body);
}

describe("POST /public/vitrine/plays", () => {
  it("grava a exibição de peça no ar na vitrine", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    state.insertReturning = [{ id: 1 }];
    const res = await post({ orientation: "portrait", plays: [PLAY] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 1, duplicates: 0, discarded: 0 });
    const [rows] = dbInsert.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(rows[0]).toMatchObject({ deviceId: 5, announcementId: 10, campaignId: 3, clientPlayId: PLAY.playId });
  });

  it("descarta peça fora do ar e campanha trocada", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    const res = await post({
      orientation: "portrait",
      plays: [
        { ...PLAY, playId: "fora-do-ar-0001", announcementId: 77 },
        { ...PLAY, playId: "campanha-errada-01", campaignId: 999 },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 0, duplicates: 0, discarded: 2 });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("playId repetido conta como duplicata", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    state.insertReturning = []; // ON CONFLICT DO NOTHING não devolveu linha
    const res = await post({ orientation: "portrait", plays: [PLAY] });

    expect(res.body).toEqual({ accepted: 0, duplicates: 1, discarded: 0 });
  });

  it("lote com mais de 10 é 400", async () => {
    const plays = Array.from({ length: 11 }, (_, i) => ({ ...PLAY, playId: `lote-grande-${String(i).padStart(4, "0")}` }));
    const res = await post({ orientation: "portrait", plays });

    expect(res.status).toBe(400);
    expect(findShowcaseDevice).not.toHaveBeenCalled();
  });

  it("robô recebe 202 e nada é gravado", async () => {
    const res = await post({ orientation: "portrait", plays: [PLAY] }, "Googlebot/2.1");

    expect(res.status).toBe(202);
    expect(findShowcaseDevice).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("sem vitrine, 404 com o corpo do feed", async () => {
    findShowcaseDevice.mockResolvedValue(null);
    const res = await post({ orientation: "landscape", plays: [PLAY] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Showcase not found" });
  });
});
