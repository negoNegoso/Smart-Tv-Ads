import type { Express } from "express";
import { describe, expect, it } from "vitest";

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../youtube");
  const app = express();
  app.use(router);
  return app;
}

describe("GET /youtube/meta", () => {
  it("devolve tipo, ID e orientação de um Short", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .get("/youtube/meta")
      .query({ url: "https://www.youtube.com/shorts/abc123def45" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "youtube_video", id: "abc123def45", orientation: "portrait" });
  });

  it("400 para link que não é do YouTube", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/youtube/meta").query({ url: "https://vimeo.com/1" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Link do YouTube inválido" });
  });

  it("400 sem url", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/youtube/meta");
    expect(res.status).toBe(400);
  });
});
