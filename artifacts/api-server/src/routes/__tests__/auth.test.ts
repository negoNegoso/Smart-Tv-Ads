import type { Express } from "express";
import { beforeAll, describe, expect, it } from "vitest";

const USER = "admin";
const PASS = "senha-secreta";

async function buildApp(): Promise<Express> {
  process.env.ADMIN_USERNAME = USER;
  process.env.ADMIN_PASSWORD = PASS;
  process.env.SESSION_SECRET = "segredo-das-rotas";
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { default: authRouter } = await import("../auth");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", authRouter);
  return app;
}

describe("rotas de autenticação", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("faz login com credenciais corretas e seta o cookie sid", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: USER, password: PASS });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("sid="))).toBe(true);
    expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  it("recusa senha errada com 401", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: USER, password: "errada" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Usuário ou senha inválidos." });
  });

  it("GET /auth/me sem cookie responde 401", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("GET /auth/me com cookie do login responde 200", async () => {
    const { default: request } = await import("supertest");
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: USER, password: PASS });
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: true });
  });

  it("logout limpa o cookie sid", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("sid=") && /Expires|Max-Age=0/i.test(c))).toBe(true);
  });
});
