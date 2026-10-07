// artifacts/api-server/src/routes/__tests__/urgent-alerts.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Banco falso com despacho por identidade de tabela (tabelas reais de
 * @workspace/db/schema). `where` não filtra: cada teste põe no estado só as
 * linhas que a consulta deveria achar.
 */
const state = vi.hoisted(() => ({
  alerts: [] as Array<Record<string, unknown>>,
  devices: [] as Array<Record<string, unknown>>,
  pieces: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  nextId: 100,
}));

const renderAlertMock = vi.hoisted(() => vi.fn());
const putMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const name = (table: unknown) =>
    table === schema.urgentAlertsTable
      ? "urgent_alerts"
      : table === schema.announcementsTable
        ? "announcements"
        : table === schema.devicesTable
          ? "devices"
          : "outra";
  const rowsOf = (table: unknown) =>
    (({ urgent_alerts: state.alerts, announcements: state.pieces, devices: state.devices }) as Record<
      string,
      Array<Record<string, unknown>>
    >)[name(table)] ?? [];
  const query = (rows: unknown) => {
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => void, fail?: (e: unknown) => void) => Promise.resolve(rows).then(ok, fail),
    };
    q.innerJoin = () => q;
    q.where = () => q;
    q.orderBy = () => q;
    q.limit = () => q;
    return q;
  };
  const db = {
    select: () => ({ from: (table: unknown) => query(rowsOf(table)) }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: name(table), values });
        const row = { id: state.nextId++, endedAt: null, ...values };
        return { returning: () => Promise.resolve([row]) };
      },
    }),
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => {
        state.updates.push({ table: name(table), patch });
        return { where: () => ({ returning: () => Promise.resolve([{ ...state.alerts[0], ...patch }]) }) };
      },
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };
  return { db, ...schema };
});

vi.mock("../../lib/alerts/render", () => ({ renderAlert: (...a: unknown[]) => renderAlertMock(...a) }));
vi.mock("../../lib/storage", () => ({ mediaStore: () => ({ put: (...a: unknown[]) => putMock(...a) }) }));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../urgent-alerts");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const corpo = (over: Record<string, unknown> = {}) => ({
  title: "Hoje fechamos às 18h",
  body: "Voltamos amanhã às 8h.",
  targetMode: "all",
  durationMinutes: 60,
  ...over,
});

const t = (iso: string) => new Date(iso);
function aviso(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    title: "Hoje fechamos às 18h",
    body: null,
    targetMode: "all",
    segmentIds: [],
    companyIds: [],
    startsAt: t("2026-10-07T14:00:00Z"),
    endsAt: t("2999-01-01T00:00:00Z"),
    endedAt: null,
    landscapeAnnouncementId: 901,
    portraitAnnouncementId: 902,
    createdAt: t("2026-10-07T14:00:00Z"),
    ...over,
  };
}

beforeEach(() => {
  state.alerts = [];
  state.devices = [];
  state.pieces = [];
  state.inserts = [];
  state.updates = [];
  state.nextId = 100;
  renderAlertMock.mockReset();
  renderAlertMock.mockResolvedValue(Buffer.from("png"));
  putMock.mockReset();
  putMock.mockImplementation((_b: Buffer, _m: string, name: string) => Promise.resolve(`/api/uploads/${name}`));
});

describe("POST /urgent-alerts", () => {
  it.each([
    ["título vazio", { title: "   " }],
    ["título longo", { title: "t".repeat(61) }],
    ["texto longo", { body: "b".repeat(141) }],
    ["segmentos sem segmento", { targetMode: "segments", segmentIds: [] }],
    ["empresas sem empresa", { targetMode: "companies", companyIds: [] }],
    ["duração fora da lista", { durationMinutes: 45 }],
    ["alvo desconhecido", { targetMode: "algumas" }],
  ])("400: %s, sem desenhar nada", async (_caso, over) => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts").send(corpo(over));
    expect(res.status).toBe(400);
    expect(renderAlertMock).not.toHaveBeenCalled();
    expect(state.inserts).toEqual([]);
  });

  it("desenha as duas artes, grava duas peças de aviso e o aviso", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts").send(corpo());
    expect(res.status).toBe(201);
    expect(renderAlertMock.mock.calls.map((c) => c[1]).sort()).toEqual(["landscape", "portrait"]);
    expect(renderAlertMock.mock.calls[0][0]).toEqual({ title: "Hoje fechamos às 18h", body: "Voltamos amanhã às 8h." });

    const pecas = state.inserts.filter((i) => i.table === "announcements").map((i) => i.values);
    expect(pecas.map((p) => [p.source, p.orientation, p.mediaKind])).toEqual([
      ["alert", "landscape", "image"],
      ["alert", "portrait", "image"],
    ]);

    const [gravado] = state.inserts.filter((i) => i.table === "urgent_alerts").map((i) => i.values);
    expect(gravado.landscapeAnnouncementId).toBe(100);
    expect(gravado.portraitAnnouncementId).toBe(101);
    const minutos = ((gravado.endsAt as Date).getTime() - (gravado.startsAt as Date).getTime()) / 60_000;
    expect(minutos).toBe(60);
    expect(res.body.status).toBe("active");
  });

  it("texto vazio vira nulo", async () => {
    const { default: request } = await import("supertest");
    await request(await buildApp()).post("/urgent-alerts").send(corpo({ body: "" }));
    const [gravado] = state.inserts.filter((i) => i.table === "urgent_alerts").map((i) => i.values);
    expect(gravado.body).toBeNull();
  });

  it("por segmento grava só os segmentos, mesmo vindo empresas", async () => {
    const { default: request } = await import("supertest");
    await request(await buildApp())
      .post("/urgent-alerts")
      .send(corpo({ targetMode: "segments", segmentIds: [5], companyIds: [9] }));
    const [gravado] = state.inserts.filter((i) => i.table === "urgent_alerts").map((i) => i.values);
    expect(gravado.segmentIds).toEqual([5]);
    expect(gravado.companyIds).toEqual([]);
  });

  it("falha ao desenhar → 500 e nada gravado", async () => {
    renderAlertMock.mockRejectedValue(new Error("satori"));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts").send(corpo());
    expect(res.status).toBe(500);
    expect(state.inserts).toEqual([]);
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("GET /urgent-alerts", () => {
  it("ativos primeiro, com TVs atingidas (sem a vitrine) e as artes", async () => {
    state.alerts = [
      aviso({ id: 8, endsAt: t("2026-10-07T15:00:00Z"), createdAt: t("2026-10-07T14:30:00Z") }),
      aviso({ id: 7 }),
    ];
    state.devices = [
      { companyId: 1, segmentId: 5, showcase: false },
      { companyId: 2, segmentId: null, showcase: false },
      { companyId: 3, segmentId: 5, showcase: true },
    ];
    state.pieces = [
      { id: 901, imageUrl: "/api/uploads/d.png" },
      { id: 902, imageUrl: "/api/uploads/e.png" },
    ];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/urgent-alerts");
    expect(res.status).toBe(200);
    expect(res.body.map((a: { id: number; status: string }) => [a.id, a.status])).toEqual([
      [7, "active"],
      [8, "expired"],
    ]);
    expect(res.body[0]).toMatchObject({
      reachedDevices: 2,
      landscapeImageUrl: "/api/uploads/d.png",
      portraitImageUrl: "/api/uploads/e.png",
    });
  });
});

describe("POST /urgent-alerts/:id/end", () => {
  it("grava o encerramento", async () => {
    state.alerts = [aviso()];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts/7/end");
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch.endedAt).toBeInstanceOf(Date);
    expect(res.body.status).toBe("ended");
  });

  it("já encerrado não regrava", async () => {
    state.alerts = [aviso({ endedAt: t("2026-10-07T14:10:00Z") })];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts/7/end");
    expect(res.status).toBe(200);
    expect(state.updates).toEqual([]);
  });

  it("aviso inexistente → 404", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/urgent-alerts/99/end");
    expect(res.status).toBe(404);
  });
});
