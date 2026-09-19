import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pareamento: a TV gera a própria key e o admin cria o device com ela. A key
 * precisa chegar intacta ao insert, e uma key que já existe é 409 — o banco é
 * quem garante unicidade (constraint `devices_device_key_unique`).
 */
const dbInsertValues = vi.fn();

let selectResults: unknown[] = [];
let selectCallIndex = 0;
let insertResult: unknown = [];

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: (v: unknown) => {
      dbInsertValues(v);
      return chain;
    },
    returning: () => chain,
    then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
      (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectResults[selectCallIndex++]),
    insert: () => makeChain(insertResult),
  },
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey" },
  devicePlaylistTable: { id: "id", deviceId: "deviceId" },
  announcementsTable: { id: "id" },
  clientsTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", name: "name" },
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
  id: 7,
  clientId: 3,
  clientName: "Padaria Central",
  name: "TV do caixa",
  location: null,
  deviceKey: "A1B2C3D4E5F6A7B8",
  lastSeenAt: null,
  createdAt: new Date("2026-09-18T12:00:00Z"),
};

beforeEach(() => {
  selectResults = [];
  selectCallIndex = 0;
  insertResult = [];
  dbInsertValues.mockReset();
});

describe("POST /devices com deviceKey", () => {
  it("usa a key enviada, normalizada", async () => {
    insertResult = [{ id: 7 }];
    selectResults = [[DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/devices")
      .send({ clientId: 3, name: "TV do caixa", deviceKey: "a1b2-c3d4-e5f6-a7b8" });

    expect(res.status).toBe(201);
    expect(dbInsertValues.mock.calls[0][0]).toMatchObject({ deviceKey: "A1B2C3D4E5F6A7B8", clientId: 3 });
    expect(res.body.deviceKey).toBe("A1B2C3D4E5F6A7B8");
  });

  it("sem key gera uma no formato de sempre", async () => {
    insertResult = [{ id: 7 }];
    selectResults = [[DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices").send({ clientId: 3, name: "TV do caixa" });

    expect(res.status).toBe(201);
    expect(dbInsertValues.mock.calls[0][0].deviceKey).toMatch(/^[0-9A-F]{16}$/);
  });

  it("key com formato inválido é 400", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices").send({ clientId: 3, name: "TV", deviceKey: "XYZ" });

    expect(res.status).toBe(400);
    expect(dbInsertValues).not.toHaveBeenCalled();
  });

  it("key que já existe é 409", async () => {
    insertResult = Object.assign(new Error("duplicate key"), { code: "23505" });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/devices")
      .send({ clientId: 3, name: "TV", deviceKey: "A1B2C3D4E5F6A7B8" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Esta TV já está vinculada." });
  });
});

describe("GET /devices/by-key/:key", () => {
  it("devolve o device com o nome da empresa", async () => {
    selectResults = [[DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/devices/by-key/a1b2-c3d4-e5f6-a7b8");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 7, clientName: "Padaria Central", deviceKey: "A1B2C3D4E5F6A7B8" });
  });

  it("key livre é 404", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/devices/by-key/A1B2C3D4E5F6A7B8")).status).toBe(404);
  });

  it("formato inválido é 400", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/devices/by-key/CURTA");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Código de TV inválido." });
  });
});
