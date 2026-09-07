import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

const SECRET = "segredo-paineis";
const loadAuthContext = vi.fn();
const listPanels = vi.fn();
const getPanel = vi.fn();
const createPanel = vi.fn();
const updatePanel = vi.fn();
const replaceItems = vi.fn();
const deletePanel = vi.fn();
const panelClientId = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
}));
vi.mock("../../lib/panels/queries", () => ({
  listPanels: (...a: unknown[]) => listPanels(...a),
  getPanel: (...a: unknown[]) => getPanel(...a),
  createPanel: (...a: unknown[]) => createPanel(...a),
  updatePanel: (...a: unknown[]) => updatePanel(...a),
  replaceItems: (...a: unknown[]) => replaceItems(...a),
  deletePanel: (...a: unknown[]) => deletePanel(...a),
  panelClientId: (...a: unknown[]) => panelClientId(...a),
}));
// portal.ts monta as rotas de anunciante/cliente e de painéis no mesmo router;
// os dois módulos abaixo puxam @workspace/db no import e este arquivo nunca
// chega a chamá-los — mockar evita precisar de DATABASE_URL só para o import
// não falhar (mesmo padrão de portal-scope.test.ts).
vi.mock("../../lib/portal/queries", () => ({
  advertiserCampaigns: vi.fn(),
  clientDevices: vi.fn(),
}));
vi.mock("../../lib/portal/overview", () => ({
  advertiserOverview: vi.fn(),
  clientOverview: vi.fn(),
}));

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { loadSession, requireUser } = await import("../../lib/auth/middleware");
  const { default: portalRouter } = await import("../portal");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/portal", requireUser, portalRouter);
  return app;
}

const ctx = {
  userId: 7,
  email: "lojista@example.com",
  isActive: true,
  mustChangePassword: false,
  clientIds: [7],
  advertiserIds: [],
};

const adminCtx = {
  userId: 0,
  email: "admin",
  isActive: true,
  mustChangePassword: false,
  clientIds: [],
  advertiserIds: [],
};

async function agent() {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return { app, request, cookie: `sid=${createSession(SECRET, "7")}` };
}

async function adminAgent() {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return { app, request, cookie: `sid=${createSession(SECRET, "admin")}` };
}

describe("escopo das rotas de painéis", () => {
  beforeEach(() => {
    for (const fn of [loadAuthContext, listPanels, getPanel, createPanel, updatePanel, replaceItems, deletePanel, panelClientId]) {
      fn.mockReset();
    }
    loadAuthContext.mockResolvedValue(ctx);
  });

  it("lista apenas os painéis dos clientes do usuário", async () => {
    listPanels.mockResolvedValue([]);
    const { request, app, cookie } = await agent();
    const res = await request(app).get("/portal/client/panels").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(listPanels).toHaveBeenCalledWith([7]);
  });

  it("usuário sem vínculo de cliente recebe 403", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, clientIds: [] });
    const { request, app, cookie } = await agent();
    const res = await request(app).get("/portal/client/panels").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("PATCH em painel de outro cliente recebe 403 e não escreve", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ name: "Invadido" });
    expect(res.status).toBe(403);
    expect(updatePanel).not.toHaveBeenCalled();
  });

  it("PUT de itens em painel de outro cliente recebe 403 e não escreve", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .put("/portal/client/panels/5/items")
      .set("Cookie", cookie)
      .send({ items: [] });
    expect(res.status).toBe(403);
    expect(replaceItems).not.toHaveBeenCalled();
  });

  it("DELETE em painel de outro cliente recebe 403 e não apaga", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app).delete("/portal/client/panels/5").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(deletePanel).not.toHaveBeenCalled();
  });

  it("painel inexistente responde 404, não 403", async () => {
    panelClientId.mockResolvedValue(null);
    const { request, app, cookie } = await agent();
    const res = await request(app).delete("/portal/client/panels/5").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("cria painel no cliente do usuário sem ele informar o id", async () => {
    createPanel.mockResolvedValue({ id: 1 });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels")
      .set("Cookie", cookie)
      .send({ kind: "menu", name: "Cardápio", template: "menu-basico" });
    expect(res.status).toBe(201);
    expect(createPanel).toHaveBeenCalledWith({
      clientId: 7,
      kind: "menu",
      name: "Cardápio",
      template: "menu-basico",
    });
  });

  it("recusa kind fora do enum", async () => {
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels")
      .set("Cookie", cookie)
      .send({ kind: "banner", name: "X", template: "menu-basico" });
    expect(res.status).toBe(400);
    expect(createPanel).not.toHaveBeenCalled();
  });

  it("recusa preço negativo na lista de itens", async () => {
    panelClientId.mockResolvedValue(7);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .put("/portal/client/panels/5/items")
      .set("Cookie", cookie)
      .send({ items: [{ name: "Erro", priceCents: -1 }] });
    expect(res.status).toBe(400);
    expect(replaceItems).not.toHaveBeenCalled();
  });

  it("clientId inexistente na criação (violação de FK) responde 400", async () => {
    loadAuthContext.mockResolvedValue(adminCtx);
    const fkError = Object.assign(new Error("insert or update on table \"panels\" violates foreign key constraint"), {
      code: "23503",
    });
    createPanel.mockRejectedValue(fkError);
    const { request, app, cookie } = await adminAgent();
    const res = await request(app)
      .post("/portal/client/panels")
      .set("Cookie", cookie)
      .send({ kind: "menu", name: "Cardápio", template: "menu-basico", clientId: 999 });
    expect(res.status).toBe(400);
  });
});
