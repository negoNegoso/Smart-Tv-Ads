import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetDeviceSlidesResponse } from "@workspace/api-zod";

/**
 * /display/:deviceKey/slides é o endpoint que toda TV da frota consulta a
 * cada 60s. Como em announcement-source.test.ts, o mock reproduz só a parte
 * da API do drizzle que a rota usa: select().from().innerJoin()...where()
 * (com ou sem .orderBy() no fim) e update().set().where(). As três consultas
 * via `db` (device, playlist, campanhas) são resolvidas em ordem por uma
 * fila; `panelSlidesForClient` — a consulta da terceira fonte, painéis do
 * cliente — é mockada à parte, mantendo o resto do módulo real
 * (`composeDeviceSlides`), para poder simular a falha isolada do item 2.
 */
const dbSelect = vi.fn();
const dbUpdate = vi.fn();
const panelSlidesForClientMock = vi.fn();

let selectResults: unknown[] = [];
let selectCallIndex = 0;

function makeChain(result: unknown) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    where: () => typeof chain;
    orderBy: () => typeof chain;
    set: () => typeof chain;
    then: (
      resolve: (value: unknown) => void,
      reject?: (reason: unknown) => void,
    ) => Promise<unknown>;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    set: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      dbSelect(...args);
      return makeChain(selectResults[selectCallIndex++]);
    },
    update: (...args: unknown[]) => {
      dbUpdate(...args);
      return makeChain(undefined);
    },
  },
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey" },
  devicePlaylistTable: { deviceId: "deviceId", isActive: "isActive", displayOrder: "displayOrder", announcementId: "announcementId" },
  announcementsTable: { id: "id", isActive: "isActive" },
  campaignsTable: { id: "id", advertiserId: "advertiserId", isActive: "isActive", startsAt: "startsAt", endsAt: "endsAt", weekdays: "weekdays", targetMode: "targetMode" },
  campaignDevicesTable: { campaignId: "campaignId", deviceId: "deviceId" },
  campaignAnnouncementsTable: { campaignId: "campaignId", announcementId: "announcementId", destinationUrl: "destinationUrl", scanCode: "scanCode" },
  advertisersTable: { id: "id", segmentId: "segmentId", clientId: "clientId" },
  clientsTable: { id: "id", segmentId: "segmentId" },
}));

vi.mock("../../lib/panels/device-slides", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/panels/device-slides")>();
  return {
    ...actual,
    panelSlidesForClient: (...args: unknown[]) => panelSlidesForClientMock(...args),
  };
});

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  // O middleware de log real (pino-http) preenche req.log; o catch do item 2
  // depende dele existir.
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../display");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

const DEVICE_ROW = { id: 1, clientId: 7, segmentId: null };

const PLAYLIST_ROW = {
  announcementId: 101,
  campaignId: null,
  title: "Playlist do device",
  displayText: null,
  showText: false,
  imageUrl: "/api/uploads/playlist.png",
  duration: 10,
  scanCode: null,
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  advertiserSegmentId: null,
  advertiserClientId: null,
  targetMode: "all" as const,
  deviceIds: [],
  segmentIds: [],
  weekdays: [],
};

const CAMPAIGN_ROW = {
  announcementId: 202,
  campaignId: 5,
  title: "Campanha ativa",
  displayText: null,
  showText: false,
  imageUrl: "/api/uploads/campanha.png",
  duration: 10,
  scanCode: null,
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  advertiserSegmentId: null,
  advertiserClientId: null,
  targetMode: "all" as const,
  deviceIds: [],
  segmentIds: [],
  weekdays: [],
};

const PANEL_ROW = {
  announcementId: 303,
  campaignId: null,
  title: "Cardápio do dia",
  displayText: null,
  showText: false,
  imageUrl: "/api/uploads/painel.png",
  duration: 10,
  scanCode: null,
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
};

describe("GET /display/:deviceKey/slides", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
  });

  it("inclui um slide de painel e a resposta inteira satisfaz o contrato do openapi", async () => {
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([PANEL_ROW]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect(res.status).toBe(200);
    const announcementIds = (res.body as Array<{ announcementId: number }>).map((s) => s.announcementId);
    expect(announcementIds).toContain(PANEL_ROW.announcementId);
    // Toda linha exigida pelo GetDeviceSlidesResponse do openapi.yaml populada
    // — não só o slide de painel, a resposta inteira.
    expect(() => GetDeviceSlidesResponse.parse(res.body)).not.toThrow();
  });

  // Regressão do item 2: uma fonte de painel quebrada não pode derrubar a
  // resposta inteira e apagar campanha paga + playlist do device na TV.
  it("quando panelSlidesForClient falha, a resposta ainda é 200 com campanha e playlist", async () => {
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockRejectedValue(new Error("relation \"panel_slides\" does not exist"));

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect(res.status).toBe(200);
    const announcementIds = (res.body as Array<{ announcementId: number }>).map((s) => s.announcementId);
    expect(announcementIds).toEqual(
      expect.arrayContaining([CAMPAIGN_ROW.announcementId, PLAYLIST_ROW.announcementId]),
    );
    expect(announcementIds).not.toContain(PANEL_ROW.announcementId);
    expect(() => GetDeviceSlidesResponse.parse(res.body)).not.toThrow();
  });
});
