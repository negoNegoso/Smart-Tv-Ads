import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// queries.ts importa @workspace/db, que lança se DATABASE_URL não existir.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const publicPieces = vi.fn();
vi.mock("../../lib/public-pieces/queries", async () => {
  const actual = await vi.importActual<typeof import("../../lib/public-pieces/queries")>(
    "../../lib/public-pieces/queries",
  );
  return { ...actual, publicPieces: (...a: unknown[]) => publicPieces(...a) };
});

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../public-pieces");
  const app = express();
  app.use(router);
  return app;
}

async function get() {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return request(app).get("/public/pieces");
}

describe("consulta das peças públicas", () => {
  it("só traz peça ativa de campanha no ar ou de playlist ativa", async () => {
    const { buildPublicPiecesQuery } = await import("../../lib/public-pieces/queries");
    const now = new Date("2026-09-25T12:00:00.000Z");
    const { sql, params } = buildPublicPiecesQuery(now).toSQL();
    expect(sql).toContain('"announcements"."is_active" = $');
    expect(sql).toContain('"campaigns"."is_active" = $');
    expect(sql).toContain('"campaigns"."starts_at" <= $');
    expect(sql).toContain('"campaigns"."ends_at" >= $');
    expect(sql).toContain('"device_playlist"."is_active" = $');
    expect(params).toContain(now.toISOString());
  });
});

describe("GET /public/pieces", () => {
  beforeEach(() => {
    publicPieces.mockReset();
  });

  it("responde as peças no ar", async () => {
    publicPieces.mockResolvedValue([
      { imageUrl: "/api/storage/objects/a.jpg", caption: "Pão quente", orientation: "landscape", kind: "image" },
      { imageUrl: "/api/storage/objects/b.jpg", caption: null, orientation: "portrait", kind: "flyer" },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.pieces).toHaveLength(2);
    expect(res.body.pieces[1]).toEqual({
      imageUrl: "/api/storage/objects/b.jpg",
      caption: null,
      orientation: "portrait",
      kind: "flyer",
    });
  });

  it("descarta campo extra que a consulta porventura traga", async () => {
    // Linha suja de propósito: título interno e anunciante nunca podem sair
    // numa rota sem sessão; quem barra é o schema da rota.
    publicPieces.mockResolvedValue([
      { imageUrl: "/a.jpg", caption: null, orientation: "landscape", kind: "image", title: "Rascunho", advertiser: "Padaria" },
    ]);
    const res = await get();
    expect(res.body.pieces[0]).toEqual({ imageUrl: "/a.jpg", caption: null, orientation: "landscape", kind: "image" });
  });

  it("permite cache no CDN e não exige sessão", async () => {
    publicPieces.mockResolvedValue([]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });
});
