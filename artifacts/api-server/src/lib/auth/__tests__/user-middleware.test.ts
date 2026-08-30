// artifacts/api-server/src/lib/auth/__tests__/user-middleware.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../session";

const SECRET = "segredo-mw";

const loadAuthContext = vi.fn();
vi.mock("../user-store", () => ({ loadAuthContext: (...a: unknown[]) => loadAuthContext(...a) }));

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { loadSession, requireAdvertiser, requireClient } = await import("../middleware");
  const app = express();
  app.use(cookieParser());
  app.use(loadSession);
  app.get("/adv", requireAdvertiser, (req, res) => res.json({ ids: (req as any).auth.advertiserIds }));
  app.get("/cli", requireClient, (req, res) => res.json({ ids: (req as any).auth.clientIds }));
  return app;
}

const ctx = {
  userId: 7,
  email: "a@b.com",
  isActive: true,
  mustChangePassword: false,
  clientIds: [3],
  advertiserIds: [9],
};

describe("guardas por papel", () => {
  beforeEach(() => loadAuthContext.mockReset());

  it("admin (env) passa em requireAdvertiser", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "admin");
    const res = await request(app).get("/adv").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
  });

  it("anunciante acessa /adv com seus advertiserIds", async () => {
    loadAuthContext.mockResolvedValue(ctx);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/adv").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ids: [9] });
  });

  it("usuário sem vínculo de anunciante recebe 403 em /adv", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, advertiserIds: [] });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/adv").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(403);
  });

  it("usuário desativado é bloqueado (401)", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, isActive: false });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/cli").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(401);
  });

  it("sem cookie: 401", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/adv");
    expect(res.status).toBe(401);
  });
});
