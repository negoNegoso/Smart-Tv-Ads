import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A orientação da TV é trocada pelo admin e chega ao player no próximo
 * refresh. O PATCH tem de aceitar só os três valores: um valor fora do enum
 * gravado no banco viraria landscape em silêncio, e a TV girada ficaria de
 * lado sem ninguém entender por quê.
 */
const setMock = vi.fn();
let updateResult: unknown[] = [];
let selectResult: unknown[] = [];

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    returning: () => chain,
    set: (values: unknown) => {
      setMock(values);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectResult),
    update: () => makeChain(updateResult),
  },
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey", orientation: "orientation" },
  devicePlaylistTable: {},
  announcementsTable: {},
  clientsTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", name: "name", segmentId: "segmentId" },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../devices");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const DEVICE = {
  id: 1,
  clientId: 7,
  clientName: "Padaria Central",
  name: "TV do balcão",
  location: null,
  deviceKey: "A1B2C3D4E5F6A7B8",
  orientation: "portrait_right",
  lastSeenAt: null,
  createdAt: new Date("2026-09-01T12:00:00Z"),
};

beforeEach(() => {
  setMock.mockReset();
  updateResult = [{ id: 1 }];
  selectResult = [DEVICE];
});

describe("PATCH /devices/:id — orientação", () => {
  it("grava um retrato válido e devolve a TV com a orientação", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait_right" });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ orientation: "portrait_right" });
    expect(res.body.orientation).toBe("portrait_right");
  });

  it("recusa valor fora do enum sem tocar no banco", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait" });

    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });
});
