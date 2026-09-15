import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

/**
 * /portal/client/devices/:id/preview é a prévia da TV vista pelo lojista. O
 * `:id` vem da barra de endereços, então a rota é quem garante que a TV é de
 * uma loja do usuário — TV de outra loja responde igual a TV inexistente,
 * para não confirmar que ela existe.
 *
 * Mesmo esquema de portal-scope.test.ts: contexto de auth e consultas
 * mockados, sem banco.
 */
const SECRET = "segredo-portal";
const loadAuthContext = vi.fn();
const previewDevice = vi.fn();
const loadDeviceSlides = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({ loadAuthContext: (...a: unknown[]) => loadAuthContext(...a) }));
vi.mock("../../lib/portal/queries", () => ({
  advertiserCampaigns: vi.fn(),
  clientDevices: vi.fn(),
  clientsOf: vi.fn(),
  previewDevice: (...a: unknown[]) => previewDevice(...a),
}));
vi.mock("../../lib/device-feed", () => ({
  loadDeviceSlides: (...a: unknown[]) => loadDeviceSlides(...a),
}));
// Os mocks abaixo só existem para o import de portal.ts não exigir banco —
// ver as notas em portal-scope.test.ts.
vi.mock("../../lib/portal/overview", () => ({
  advertiserOverview: vi.fn(),
  clientOverview: vi.fn(),
}));
vi.mock("../../lib/panels/queries", () => ({
  listPanels: vi.fn(),
  getPanel: vi.fn(),
  createPanel: vi.fn(),
  updatePanel: vi.fn(),
  replaceItems: vi.fn(),
  deletePanel: vi.fn(),
  panelClientId: vi.fn(),
}));
vi.mock("../../lib/panels/publish", () => ({
  publishPanel: vi.fn(),
  unpublishPanel: vi.fn(),
  PanelRenderError: class extends Error {},
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

const lojistaCtx = {
  userId: 7,
  email: "loja@b.com",
  isActive: true,
  mustChangePassword: false,
  clientIds: [7, 12],
  advertiserIds: [],
};

const SLIDES = [{ announcementId: 1, title: "Cardápio", source: "panel" }];

async function getPreview(deviceId: number | string) {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  const token = createSession(SECRET, "7");
  return request(app).get(`/portal/client/devices/${deviceId}/preview`).set("Cookie", `sid=${token}`);
}

describe("GET /portal/client/devices/:id/preview", () => {
  beforeEach(() => {
    loadAuthContext.mockReset();
    previewDevice.mockReset();
    loadDeviceSlides.mockReset();
  });

  it("TV de uma loja do usuário devolve a rotação dela", async () => {
    loadAuthContext.mockResolvedValue(lojistaCtx);
    const device = { id: 3, clientId: 12, companyId: 120, segmentId: null };
    previewDevice.mockResolvedValue(device);
    loadDeviceSlides.mockResolvedValue(SLIDES);

    const res = await getPreview(3);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(SLIDES);
    expect(previewDevice).toHaveBeenCalledWith(3);
    expect(loadDeviceSlides).toHaveBeenCalledWith(device, undefined);
  });

  it("TV de outra loja responde 404 e não monta a rotação", async () => {
    loadAuthContext.mockResolvedValue(lojistaCtx);
    previewDevice.mockResolvedValue({ id: 4, clientId: 99, companyId: 990, segmentId: null });

    const res = await getPreview(4);

    expect(res.status).toBe(404);
    expect(loadDeviceSlides).not.toHaveBeenCalled();
  });

  it("TV inexistente responde 404", async () => {
    loadAuthContext.mockResolvedValue(lojistaCtx);
    previewDevice.mockResolvedValue(null);

    const res = await getPreview(404);

    expect(res.status).toBe(404);
    expect(loadDeviceSlides).not.toHaveBeenCalled();
  });

  it("id que não é número responde 400 sem consultar a TV", async () => {
    loadAuthContext.mockResolvedValue(lojistaCtx);

    const res = await getPreview("abc");

    expect(res.status).toBe(400);
    expect(previewDevice).not.toHaveBeenCalled();
  });

  // Admin passa pelo requireClient, mas o portal não é o lugar dele: o escopo
  // de lojas do admin é vazio, como nas outras rotas do portal.
  it("admin no portal recebe 404, sem consultar a TV", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "admin");

    const res = await request(app).get("/portal/client/devices/3/preview").set("Cookie", `sid=${token}`);

    expect(res.status).toBe(404);
    expect(loadDeviceSlides).not.toHaveBeenCalled();
  });

  it("usuário sem loja vinculada recebe 403", async () => {
    loadAuthContext.mockResolvedValue({ ...lojistaCtx, clientIds: [] });

    const res = await getPreview(3);

    expect(res.status).toBe(403);
    expect(previewDevice).not.toHaveBeenCalled();
  });
});
