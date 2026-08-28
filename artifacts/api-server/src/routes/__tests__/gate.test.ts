import type { Express } from "express";
import { beforeAll, describe, expect, it } from "vitest";

async function buildApp(): Promise<Express> {
  process.env.SCAN_SALT = "sal";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "senha";
  process.env.SESSION_SECRET = "segredo-do-gate";
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { default: router } = await import("../index");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", router);
  return app;
}

describe("porteiro de rotas", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("mantém /api/healthz público", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("mantém /api/auth/me público (responde 401 sem login, não bloqueio do porteiro)", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("protege /api/announcements sem login", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/announcements");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });
});
