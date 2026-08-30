import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../lib/auth/password";

const USER = "admin";
const PASS = "senha-secreta";

const findUserByEmail = vi.fn();
const loadAuthContext = vi.fn();
const setPassword = vi.fn();
vi.mock("../../lib/auth/user-store", () => ({
  findUserByEmail: (...a: unknown[]) => findUserByEmail(...a),
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
  setPassword: (...a: unknown[]) => setPassword(...a),
}));

async function buildApp(): Promise<Express> {
  process.env.ADMIN_USERNAME = USER;
  process.env.ADMIN_PASSWORD = PASS;
  process.env.SESSION_SECRET = "segredo-das-rotas";
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { loadSession } = await import("../../lib/auth/middleware");
  const { default: authRouter } = await import("../auth");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/api", authRouter);
  return app;
}

beforeEach(() => {
  findUserByEmail.mockReset();
  loadAuthContext.mockReset();
  setPassword.mockReset();
});

describe("rotas de autenticação (admin)", () => {
  it("faz login com credenciais corretas e seta o cookie sid", async () => {
    const { default: request } = await import("supertest");
    const app = await buildApp();
    const res = await request(app).post("/api/auth/login").send({ username: USER, password: PASS });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mustChangePassword: false });
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("sid="))).toBe(true);
    expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  it("recusa senha errada com 401", async () => {
    findUserByEmail.mockResolvedValue(null);
    const { default: request } = await import("supertest");
    const app = await buildApp();
    const res = await request(app).post("/api/auth/login").send({ username: USER, password: "errada" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Usuário ou senha inválidos." });
  });

  it("GET /auth/me sem cookie responde 401", async () => {
    const { default: request } = await import("supertest");
    const app = await buildApp();
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("GET /auth/me com cookie do admin responde 200 e isAdmin", async () => {
    const { default: request } = await import("supertest");
    const app = await buildApp();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: USER, password: PASS });
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ authenticated: true, isAdmin: true, roles: ["admin"] });
  });

  it("logout limpa o cookie sid", async () => {
    const { default: request } = await import("supertest");
    const app = await buildApp();
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("sid=") && /Expires|Max-Age=0/i.test(c))).toBe(true);
  });
});

describe("login de usuário", () => {
  it("loga usuário válido e sinaliza mustChangePassword", async () => {
    findUserByEmail.mockResolvedValue({
      id: 5, email: "u@x.com", passwordHash: hashPassword("123456"),
      mustChangePassword: true, isActive: true,
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/api/auth/login").send({ username: "u@x.com", password: "123456" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mustChangePassword: true });
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toContain("sid=");
  });

  it("nega usuário desativado", async () => {
    findUserByEmail.mockResolvedValue({
      id: 5, email: "u@x.com", passwordHash: hashPassword("123456"),
      mustChangePassword: false, isActive: false,
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/api/auth/login").send({ username: "u@x.com", password: "123456" });
    expect(res.status).toBe(401);
  });

  it("change-password troca a senha do usuário logado", async () => {
    const hash = hashPassword("antiga1");
    findUserByEmail.mockResolvedValue({ id: 5, email: "u@x.com", passwordHash: hash, mustChangePassword: true, isActive: true });
    loadAuthContext.mockResolvedValue({ userId: 5, email: "u@x.com", isActive: true, mustChangePassword: true, clientIds: [], advertiserIds: [1] });
    setPassword.mockResolvedValue(undefined);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: "u@x.com", password: "antiga1" });
    const res = await agent.post("/api/auth/change-password").send({ currentPassword: "antiga1", newPassword: "novaSenha1" });
    expect(res.status).toBe(200);
    expect(setPassword).toHaveBeenCalledWith(5, expect.stringContaining("scrypt$"));
  });
});
