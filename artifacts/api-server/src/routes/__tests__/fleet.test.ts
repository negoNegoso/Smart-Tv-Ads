import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetDeviceSessionsResponse, GetFleetResponse } from "@workspace/api-zod";

/**
 * As duas rotas só leem. O mock reproduz o encadeamento do drizzle que elas
 * usam (select().from().innerJoin().where()/.orderBy()), como em
 * device-update.test.ts; cada select consome um item da fila.
 */
let selectQueue: unknown[][] = [];
const setMock = vi.fn();
const whereMock = vi.fn();
let updated: unknown[] = [];
const latestTvAppReleaseMock = vi.fn();
const listDeviceSessionsMock = vi.fn();

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: (cond: unknown) => {
      whereMock(cond);
      return chain;
    },
    orderBy: () => chain,
    set: (values: unknown) => {
      setMock(values);
      return chain;
    },
    returning: () => chain,
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectQueue.shift() ?? []),
    update: () => makeChain(updated),
  },
  devicesTable: {
    id: "id", clientId: "clientId", name: "name", location: "location",
    showcase: "showcase", lastSeenAt: "lastSeenAt", appVersion: "appVersion",
    updateRequestedAt: "updateRequestedAt",
  },
  clientsTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", name: "name" },
}));

vi.mock("../../lib/tv-app-release", () => ({
  latestTvAppRelease: (...args: unknown[]) => latestTvAppReleaseMock(...args),
}));

vi.mock("../../lib/device-sessions", () => ({
  listDeviceSessions: (...args: unknown[]) => listDeviceSessionsMock(...args),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../fleet");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const minutosAtras = (min: number) => new Date(Date.now() - min * 60 * 1000);

function tv(over: Record<string, unknown>) {
  return {
    id: 1, clientId: 7, clientName: "Padaria Central", name: "TV do balcão", location: null,
    showcase: false, lastSeenAt: minutosAtras(1), appVersion: "1.9.0", updateRequestedAt: null,
    ...over,
  };
}

async function get(path: string) {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return request(app).get(path);
}

beforeEach(() => {
  selectQueue = [];
  latestTvAppReleaseMock.mockReset();
  listDeviceSessionsMock.mockReset();
  setMock.mockReset();
  whereMock.mockReset();
  updated = [];
  latestTvAppReleaseMock.mockResolvedValue({ versionName: "1.9.0" });
});

describe("GET /fleet", () => {
  it("marca online quem falou nos últimos 5 minutos", async () => {
    selectQueue = [[
      tv({ id: 1, lastSeenAt: minutosAtras(1) }),
      tv({ id: 2, lastSeenAt: minutosAtras(10) }),
      tv({ id: 3, lastSeenAt: null, appVersion: null }),
    ]];
    const res = await get("/fleet");

    expect(res.status).toBe(200);
    expect(res.body.devices.map((d: { id: number; isOnline: boolean }) => [d.id, d.isOnline])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
    expect(() => GetFleetResponse.parse(res.body)).not.toThrow();
  });

  it("marca desatualizada a TV com versão menor que a última release", async () => {
    selectQueue = [[
      tv({ id: 1, appVersion: "1.9.0" }),
      tv({ id: 2, appVersion: "1.8.2" }),
      tv({ id: 3, appVersion: null }),
      tv({ id: 4, appVersion: "1.0.1-rc1" }),
    ]];
    const res = await get("/fleet");

    expect(res.body.latestVersion).toBe("1.9.0");
    expect(res.body.devices.map((d: { id: number; outdated: boolean }) => [d.id, d.outdated])).toEqual([
      [1, false],
      [2, true],
      [3, false],
      [4, false],
    ]);
  });

  // GitHub fora não pode esconder o parque: é quando o admin mais precisa dele.
  it("com o GitHub fora, responde 200 sem marcar ninguém", async () => {
    latestTvAppReleaseMock.mockRejectedValue(new Error("Falha ao ler update.json"));
    selectQueue = [[tv({ appVersion: "1.0.0" })]];
    const res = await get("/fleet");

    expect(res.status).toBe(200);
    expect(res.body.latestVersion).toBeNull();
    expect(res.body.devices[0].outdated).toBe(false);
    expect(res.body.devices[0].appVersion).toBe("1.0.0");
  });

  it("devolve a vitrine marcada", async () => {
    selectQueue = [[tv({ id: 9, showcase: true })]];
    const res = await get("/fleet");
    expect(res.body.devices[0].showcase).toBe(true);
  });

  it("devolve quando o admin pediu atualização de cada TV", async () => {
    const pedido = minutosAtras(2);
    selectQueue = [[tv({ id: 1, updateRequestedAt: pedido }), tv({ id: 2 })]];
    const res = await get("/fleet");
    expect(res.body.devices.map((d: { updateRequestedAt: string | null }) => d.updateRequestedAt)).toEqual([
      pedido.toISOString(),
      null,
    ]);
    expect(() => GetFleetResponse.parse(res.body)).not.toThrow();
  });

  it("parque vazio responde lista vazia", async () => {
    selectQueue = [[]];
    const res = await get("/fleet");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ latestVersion: "1.9.0", devices: [] });
  });
});

describe("GET /devices/:id/sessions", () => {
  it("devolve as sessões e se a TV está online agora", async () => {
    selectQueue = [[{ id: 1, lastSeenAt: minutosAtras(1) }]];
    const startedAt = minutosAtras(120);
    const lastSeenAt = minutosAtras(1);
    listDeviceSessionsMock.mockResolvedValue([{ startedAt, lastSeenAt }]);
    const res = await get("/devices/1/sessions");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isOnline: true,
      sessions: [{ startedAt: startedAt.toISOString(), lastSeenAt: lastSeenAt.toISOString() }],
    });
    expect(listDeviceSessionsMock).toHaveBeenCalledWith(1, expect.any(Date));
    expect(() => GetDeviceSessionsResponse.parse(res.body)).not.toThrow();
  });

  it("TV offline devolve isOnline falso", async () => {
    selectQueue = [[{ id: 1, lastSeenAt: minutosAtras(30) }]];
    listDeviceSessionsMock.mockResolvedValue([]);
    const res = await get("/devices/1/sessions");
    expect(res.body).toEqual({ isOnline: false, sessions: [] });
  });

  it("TV inexistente responde 404 sem consultar sessões", async () => {
    selectQueue = [[]];
    const res = await get("/devices/99/sessions");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
    expect(listDeviceSessionsMock).not.toHaveBeenCalled();
  });

  it("id que não é número responde 400", async () => {
    const res = await get("/devices/abc/sessions");
    expect(res.status).toBe(400);
    expect(listDeviceSessionsMock).not.toHaveBeenCalled();
  });
});

describe("POST /fleet/update-requests", () => {
  async function post(body?: unknown) {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const req = request(app).post("/fleet/update-requests");
    return body === undefined ? req : req.send(body as object);
  }

  it("marca o pedido nas TVs escolhidas", async () => {
    updated = [{ id: 1 }, { id: 3 }];
    const res = await post({ deviceIds: [1, 3] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 2 });
    expect(setMock).toHaveBeenCalledWith({ updateRequestedAt: expect.any(Date) });
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("sem lista, marca todas (sem filtro)", async () => {
    updated = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const res = await post({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 3 });
    expect(setMock).toHaveBeenCalledWith({ updateRequestedAt: expect.any(Date) });
    expect(whereMock).not.toHaveBeenCalled();
  });

  it("requisição sem corpo vale como todas", async () => {
    updated = [{ id: 1 }];
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 1 });
    expect(whereMock).not.toHaveBeenCalled();
  });

  // Lista vazia não pode virar "todas" por engano: quem mandou [] quis
  // escolher e não escolheu nada.
  it("lista vazia é erro, não 'todas'", async () => {
    const res = await post({ deviceIds: [] });
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("id que não é inteiro é erro", async () => {
    const res = await post({ deviceIds: ["abc"] });
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("id de TV que não existe conta zero, sem erro", async () => {
    updated = [];
    const res = await post({ deviceIds: [999] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 0 });
  });
});
