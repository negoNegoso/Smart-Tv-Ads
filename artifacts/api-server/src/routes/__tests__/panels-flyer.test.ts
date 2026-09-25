import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

const SECRET = "segredo-paineis";
const loadAuthContext = vi.fn();
const listPanels = vi.fn();
const listAllPanels = vi.fn();
const copyPanel = vi.fn();
const getPanel = vi.fn();
const createPanel = vi.fn();
const updatePanel = vi.fn();
const replaceItems = vi.fn();
const deletePanel = vi.fn();
const panelClientId = vi.fn();
const publishPanel = vi.fn();
const unpublishPanel = vi.fn();
const campaignOptionsForClient = vi.fn();
const campaignBelongsToClient = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
}));
vi.mock("../../lib/panels/queries", () => ({
  listPanels: (...a: unknown[]) => listPanels(...a),
  listAllPanels: (...a: unknown[]) => listAllPanels(...a),
  copyPanel: (...a: unknown[]) => copyPanel(...a),
  getPanel: (...a: unknown[]) => getPanel(...a),
  createPanel: (...a: unknown[]) => createPanel(...a),
  updatePanel: (...a: unknown[]) => updatePanel(...a),
  replaceItems: (...a: unknown[]) => replaceItems(...a),
  deletePanel: (...a: unknown[]) => deletePanel(...a),
  panelClientId: (...a: unknown[]) => panelClientId(...a),
  campaignOptionsForClient: (...a: unknown[]) => campaignOptionsForClient(...a),
  campaignBelongsToClient: (...a: unknown[]) => campaignBelongsToClient(...a),
}));
vi.mock("../../lib/panels/publish", () => ({
  publishPanel: (...a: unknown[]) => publishPanel(...a),
  unpublishPanel: (...a: unknown[]) => unpublishPanel(...a),
  PanelRenderError: class extends Error {
    constructor(
      message: string,
      public pageNo: number,
    ) {
      super(message);
    }
  },
}));
const getStoreIdentity = vi.fn();
const updateStoreIdentity = vi.fn();
vi.mock("../../lib/panels/store-identity", () => ({
  getStoreIdentity: (...a: unknown[]) => getStoreIdentity(...a),
  updateStoreIdentity: (...a: unknown[]) => updateStoreIdentity(...a),
}));
const renderFlyerPreview = vi.fn();
vi.mock("../../lib/panels/flyer-preview", () => ({
  renderFlyerPreview: (...a: unknown[]) => renderFlyerPreview(...a),
}));
// portal.ts monta as rotas de anunciante/cliente e de painéis no mesmo router;
// os dois módulos abaixo puxam @workspace/db no import e este arquivo nunca
// chega a chamá-los — mockar evita precisar de DATABASE_URL só para o import
// não falhar (mesmo padrão de panels-scope.test.ts).
vi.mock("../../lib/device-feed", () => ({ loadDeviceSlides: vi.fn() }));
vi.mock("../../lib/portal/queries", () => ({
  advertiserCampaigns: vi.fn(),
  clientDevices: vi.fn(),
}));
vi.mock("../../lib/portal/overview", () => ({
  advertiserOverview: vi.fn(),
  clientOverview: vi.fn(),
}));
const put = vi.fn();
vi.mock("../../lib/storage", () => ({ mediaStore: () => ({ put, remove: vi.fn() }) }));

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

async function agent() {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return { app, request, cookie: `sid=${createSession(SECRET, "7")}` };
}

describe("rotas do encarte", () => {
  beforeEach(() => {
    for (const fn of [
      loadAuthContext,
      listPanels,
      listAllPanels,
      copyPanel,
      getPanel,
      createPanel,
      updatePanel,
      replaceItems,
      deletePanel,
      panelClientId,
      publishPanel,
      unpublishPanel,
      campaignOptionsForClient,
      campaignBelongsToClient,
      getStoreIdentity,
      updateStoreIdentity,
      renderFlyerPreview,
    ]) {
      fn.mockReset();
    }
    put.mockReset();
    loadAuthContext.mockResolvedValue(ctx);
  });

  it("cria encarte", async () => {
    createPanel.mockResolvedValue({ id: 1 });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels")
      .set("Cookie", cookie)
      .send({ kind: "flyer", name: "Encarte de sexta", template: "flyer-basico" });
    expect(res.status).toBe(201);
    expect(createPanel).toHaveBeenCalledWith({
      clientId: 7,
      kind: "flyer",
      name: "Encarte de sexta",
      template: "flyer-basico",
    });
  });

  it("PATCH com campanha de outra empresa → 400", async () => {
    panelClientId.mockResolvedValue(7);
    campaignBelongsToClient.mockResolvedValue(false);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ campaignId: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("A campanha escolhida não é desta loja.");
    expect(updatePanel).not.toHaveBeenCalled();
  });

  it("PATCH com campanha da empresa grava", async () => {
    panelClientId.mockResolvedValue(7);
    campaignBelongsToClient.mockResolvedValue(true);
    updatePanel.mockResolvedValue({ id: 5 });
    getPanel.mockResolvedValue({ id: 5, items: [] });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ campaignId: 3 });
    expect(res.status).toBe(200);
    expect(campaignBelongsToClient).toHaveBeenCalledWith(3, 7);
    expect(updatePanel).toHaveBeenCalledWith(5, { campaignId: 3 });
  });

  it("PATCH campaignId null volta para a loja sem consultar posse", async () => {
    panelClientId.mockResolvedValue(7);
    updatePanel.mockResolvedValue({ id: 5 });
    getPanel.mockResolvedValue({ id: 5, items: [] });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ campaignId: null });
    expect(res.status).toBe(200);
    expect(campaignBelongsToClient).not.toHaveBeenCalled();
    expect(updatePanel).toHaveBeenCalledWith(5, { campaignId: null });
  });

  it("itens com unidade e destaque", async () => {
    panelClientId.mockResolvedValue(7);
    getPanel.mockResolvedValue({ id: 5, kind: "menu", items: [] });
    replaceItems.mockResolvedValue([]);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .put("/portal/client/panels/5/items")
      .set("Cookie", cookie)
      .send({ items: [{ name: "Arroz", priceCents: 2199, unit: "kg", featured: true }] });
    expect(res.status).toBe(200);
    expect(replaceItems).toHaveBeenCalledWith(
      5,
      expect.arrayContaining([expect.objectContaining({ name: "Arroz", unit: "kg", featured: true })]),
    );
  });

  it("encarte com 61 itens → 400", async () => {
    panelClientId.mockResolvedValue(7);
    getPanel.mockResolvedValue({ id: 5, kind: "flyer", items: [] });
    const items = Array.from({ length: 61 }, (_, i) => ({ name: `Item ${i}`, priceCents: 100 }));
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .put("/portal/client/panels/5/items")
      .set("Cookie", cookie)
      .send({ items });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("O encarte aceita até 60 produtos.");
    expect(replaceItems).not.toHaveBeenCalled();
  });

  it("opções de campanha só do dono", async () => {
    panelClientId.mockResolvedValue(7);
    campaignOptionsForClient.mockResolvedValue([
      { id: 1, name: "Semana do cliente", startsAt: new Date("2026-09-20T00:00:00Z"), endsAt: new Date("2026-09-27T00:00:00Z") },
    ]);
    const { request, app, cookie } = await agent();
    const res = await request(app).get("/portal/client/panels/5/campaign-options").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Semana do cliente", startsAt: "2026-09-20T00:00:00.000Z", endsAt: "2026-09-27T00:00:00.000Z" },
    ]);

    loadAuthContext.mockResolvedValue({ ...ctx, clientIds: [8] });
    campaignOptionsForClient.mockClear();
    const { request: request2, app: app2, cookie: cookie2 } = await agent();
    const res2 = await request2(app2).get("/portal/client/panels/5/campaign-options").set("Cookie", cookie2);
    expect(res2.status).toBe(403);
    expect(campaignOptionsForClient).not.toHaveBeenCalled();
  });

  it("identidade: lojista de outra loja → 403", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, clientIds: [7] });
    const { request, app, cookie } = await agent();
    const res = await request(app).get("/portal/client/stores/99/identity").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(getStoreIdentity).not.toHaveBeenCalled();
  });

  it("identidade: hex inválido → 400", async () => {
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/stores/7/identity")
      .set("Cookie", cookie)
      .send({ brandColor: "red" });
    expect(res.status).toBe(400);
    expect(updateStoreIdentity).not.toHaveBeenCalled();
  });

  it("identidade: grava cor em maiúsculas", async () => {
    updateStoreIdentity.mockResolvedValue({
      clientId: 7,
      companyName: "Mercado",
      logoUrl: null,
      openingHours: null,
      brandColor: "#0B6B3A",
      brandAccentColor: null,
      address: null,
    });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/stores/7/identity")
      .set("Cookie", cookie)
      .send({ brandColor: "#0b6b3a" });
    expect(res.status).toBe(200);
    expect(updateStoreIdentity).toHaveBeenCalledWith(7, { brandColor: "#0B6B3A" });
  });

  it("prévia devolve PNG", async () => {
    panelClientId.mockResolvedValue(7);
    renderFlyerPreview.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels/1/preview")
      .set("Cookie", cookie)
      .send({
        orientation: "portrait",
        page: 1,
        campaignId: null,
        headline: null,
        body: null,
        items: [],
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^image\/png/);
    expect(renderFlyerPreview).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 7, orientation: "portrait", page: 1 }),
    );
  });

  it("prévia com orientação inválida → 400", async () => {
    panelClientId.mockResolvedValue(7);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels/1/preview")
      .set("Cookie", cookie)
      .send({
        orientation: "diagonal",
        page: 1,
        campaignId: null,
        headline: null,
        body: null,
        items: [],
      });
    expect(res.status).toBe(400);
    expect(renderFlyerPreview).not.toHaveBeenCalled();
  });
});
