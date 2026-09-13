import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetDevicePreviewResponse } from "@workspace/api-zod";

/**
 * /devices/:id/preview é a prévia do admin: tem de mostrar a mesma rotação que
 * a TV recebe de /display/:deviceKey/slides, só que sem os efeitos colaterais
 * da TV — nada de lastSeenAt, que marcaria a TV como online sem ela estar.
 *
 * Mesmo mock de display-slides.test.ts: as consultas via `db` (device,
 * playlist, campanhas) saem em ordem de uma fila, e `panelSlidesForClient` é
 * mockada à parte para simular a falha isolada da fonte de painéis.
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
  clientsTable: { id: "id", segmentId: "segmentId", name: "name" },
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
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../devices");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

const DEVICE_ROW = { id: 1, clientId: 7, segmentId: null };

const SLIDE_BASE = {
  campaignId: null,
  displayText: null,
  showText: false,
  duration: 10,
  scanCode: null,
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
};

const CAMPAIGN_ONLY_DEFAULTS = {
  advertiserSegmentId: null,
  advertiserClientId: null,
  targetMode: "all" as const,
  deviceIds: [],
  segmentIds: [],
  weekdays: [],
};

const PLAYLIST_ROW = {
  ...SLIDE_BASE,
  ...CAMPAIGN_ONLY_DEFAULTS,
  announcementId: 101,
  title: "Playlist do device",
  imageUrl: "/api/uploads/playlist.png",
};

const CAMPAIGN_ROW = {
  ...SLIDE_BASE,
  ...CAMPAIGN_ONLY_DEFAULTS,
  announcementId: 202,
  campaignId: 5,
  title: "Campanha ativa",
  imageUrl: "/api/uploads/campanha.png",
};

const PANEL_ROW = {
  ...SLIDE_BASE,
  announcementId: 303,
  title: "Cardápio do dia",
  imageUrl: "/api/uploads/painel.png",
};

async function getPreview(path = "/devices/1/preview") {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return request(app).get(path);
}

describe("GET /devices/:id/preview", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
  });

  it("devolve a rotação da TV na ordem campanha → painel → playlist, com a origem de cada slide", async () => {
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([PANEL_ROW]);

    const res = await getPreview();

    expect(res.status).toBe(200);
    expect(() => GetDevicePreviewResponse.parse(res.body)).not.toThrow();
    const rotation = (res.body as Array<{ announcementId: number; source: string }>).map(
      ({ announcementId, source }) => ({ announcementId, source }),
    );
    expect(rotation).toEqual([
      { announcementId: CAMPAIGN_ROW.announcementId, source: "campaign" },
      { announcementId: PANEL_ROW.announcementId, source: "panel" },
      { announcementId: PLAYLIST_ROW.announcementId, source: "playlist" },
    ]);
  });

  // A prévia não é a TV: gravar lastSeenAt daria a TV como online só porque
  // alguém abriu a página dela no admin.
  it("não grava lastSeenAt do device", async () => {
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([]);

    const res = await getPreview();

    expect(res.status).toBe(200);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("responde 404 quando o device não existe", async () => {
    selectResults = [[]];

    const res = await getPreview("/devices/999/preview");

    expect(res.status).toBe(404);
  });

  it("quando os painéis falham, ainda mostra campanha e playlist", async () => {
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockRejectedValue(new Error("relation \"panel_slides\" does not exist"));

    const res = await getPreview();

    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ announcementId: number }>).map((s) => s.announcementId);
    expect(ids).toEqual([CAMPAIGN_ROW.announcementId, PLAYLIST_ROW.announcementId]);
  });
});
