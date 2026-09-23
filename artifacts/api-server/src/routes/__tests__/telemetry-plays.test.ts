import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O mock reproduz só a parte do drizzle que a rota usa: select().from().where()
 * (device, peças, campanhas — nessa ordem, resolvidas por uma fila) e
 * insert().values().onConflictDoNothing().returning(). O ON CONFLICT de verdade
 * foi testado contra Postgres na migração 0013; aqui o que se testa é a rota.
 */
let selectResults: unknown[][] = [];
let inserted: Array<Record<string, unknown>> = [];
let returningRows: unknown[] = [];
let conflictTarget: unknown = null;

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = () => c;
  c.then = (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => chain(selectResults.shift() ?? []),
    insert: () => ({
      values: (rows: Array<Record<string, unknown>>) => {
        inserted = rows;
        return {
          onConflictDoNothing: (opts: { target: unknown }) => {
            conflictTarget = opts.target;
            return { returning: () => Promise.resolve(returningRows) };
          },
        };
      },
    }),
  },
  devicesTable: { id: "id", deviceKey: "deviceKey" },
  playsTable: { id: "id", deviceId: "deviceId", clientPlayId: "clientPlayId" },
  announcementsTable: { id: "id" },
  campaignsTable: { id: "id" },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../telemetry");
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

async function post(app: Express, body: unknown) {
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/telemetry/plays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    server.close();
  }
}

const play = (playId: string, over: Record<string, unknown> = {}) => ({
  playId, announcementId: 1, campaignId: 10, durationSeconds: 77.7, ageSeconds: 30, ...over,
});

beforeEach(() => {
  selectResults = [];
  inserted = [];
  returningRows = [];
  conflictTarget = null;
});

describe("POST /api/telemetry/plays", () => {
  it("grava o lote e conta as aceitas", async () => {
    selectResults = [[{ id: 5 }], [{ id: 1 }], [{ id: 10 }]];
    returningRows = [{ id: 100 }, { id: 101 }];
    const app = await buildApp();
    const res = await post(app, { deviceKey: "K1", plays: [play("abcdefgh0001"), play("abcdefgh0002")] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 2, duplicates: 0, discarded: 0 });
    expect(inserted.map((r) => r.clientPlayId)).toEqual(["abcdefgh0001", "abcdefgh0002"]);
    expect(inserted[0].deviceId).toBe(5);
    expect(conflictTarget).toEqual(["deviceId", "clientPlayId"]);
  });

  it("lote reenviado (resposta perdida) volta como duplicadas", async () => {
    selectResults = [[{ id: 5 }], [{ id: 1 }], [{ id: 10 }]];
    returningRows = []; // ON CONFLICT DO NOTHING não devolveu nada: já existiam
    const app = await buildApp();
    const res = await post(app, { deviceKey: "K1", plays: [play("abcdefgh0001"), play("abcdefgh0002")] });
    expect(res.body).toEqual({ accepted: 0, duplicates: 2, discarded: 0 });
  });

  it("peça apagada é descartada e o resto do lote grava", async () => {
    selectResults = [[{ id: 5 }], [{ id: 1 }], [{ id: 10 }]];
    returningRows = [{ id: 100 }];
    const app = await buildApp();
    const res = await post(app, {
      deviceKey: "K1",
      plays: [play("abcdefgh0001", { announcementId: 99 }), play("abcdefgh0002")],
    });
    expect(res.body).toEqual({ accepted: 1, duplicates: 0, discarded: 1 });
    expect(inserted.map((r) => r.clientPlayId)).toEqual(["abcdefgh0002"]);
  });

  it("lote só com peças apagadas não chama o insert", async () => {
    selectResults = [[{ id: 5 }], [], [{ id: 10 }]];
    const app = await buildApp();
    const res = await post(app, { deviceKey: "K1", plays: [play("abcdefgh0001")] });
    expect(res.body).toEqual({ accepted: 0, duplicates: 0, discarded: 1 });
    expect(inserted).toEqual([]);
  });

  it("key desconhecida responde 404 com o corpo que a TV reconhece", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const res = await post(app, { deviceKey: "NAOEXISTE", plays: [play("abcdefgh0001")] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
  });

  it.each([
    ["lote vazio", { deviceKey: "K1", plays: [] }],
    ["mais de 200", { deviceKey: "K1", plays: Array.from({ length: 201 }, (_, i) => play(`abcdefgh${String(i).padStart(4, "0")}`)) }],
    ["playId curto", { deviceKey: "K1", plays: [play("curto")] }],
    ["duração negativa", { deviceKey: "K1", plays: [play("abcdefgh0001", { durationSeconds: -1 })] }],
    ["idade negativa", { deviceKey: "K1", plays: [play("abcdefgh0001", { ageSeconds: -5 })] }],
  ])("%s responde 400", async (_nome, body) => {
    const app = await buildApp();
    const res = await post(app, body);
    expect(res.status).toBe(400);
  });
});
