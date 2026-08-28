import type { Express } from "express";
import { beforeAll, describe, expect, it } from "vitest";
import { createSession } from "../session";

const SECRET = "segredo-do-middleware";

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { requireAdmin } = await import("../middleware");
  const app = express();
  app.use(cookieParser());
  app.get("/protegido", requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("requireAdmin", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("bloqueia sem cookie de sessão", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/protegido");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });

  it("bloqueia com cookie inválido", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/protegido").set("Cookie", "sid=abc.def");
    expect(res.status).toBe(401);
  });

  it("permite com cookie de sessão válido", async () => {
    const { default: request } = await import("supertest");
    const token = createSession(SECRET);
    const res = await request(app).get("/protegido").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
