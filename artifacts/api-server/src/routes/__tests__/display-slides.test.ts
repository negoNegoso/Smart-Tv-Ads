import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetDeviceSlidesResponse, GetDisplayFeedResponse } from "@workspace/api-zod";

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
const setMock = vi.fn();
const touchDeviceSessionMock = vi.fn();
const latestTvAppReleaseForFeedMock = vi.fn();

let selectResults: unknown[] = [];
let selectCallIndex = 0;

function makeChain(result: unknown) {
  const chain: {
    from: () => typeof chain;
    innerJoin: () => typeof chain;
    where: () => typeof chain;
    orderBy: () => typeof chain;
    set: (values?: unknown) => typeof chain;
    then: (
      resolve: (value: unknown) => void,
      reject?: (reason: unknown) => void,
    ) => Promise<unknown>;
  } = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    set: (values) => {
      setMock(values);
      return chain;
    },
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
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey", orientation: "orientation", showcase: "showcase", musicUrl: "musicUrl" },
  devicePlaylistTable: { deviceId: "deviceId", isActive: "isActive", displayOrder: "displayOrder", announcementId: "announcementId" },
  announcementsTable: { id: "id", isActive: "isActive", orientation: "orientation" },
  campaignsTable: { id: "id", advertiserId: "advertiserId", isActive: "isActive", startsAt: "startsAt", endsAt: "endsAt", weekdays: "weekdays", targetMode: "targetMode" },
  campaignDevicesTable: { campaignId: "campaignId", deviceId: "deviceId" },
  campaignAnnouncementsTable: { campaignId: "campaignId", announcementId: "announcementId", destinationUrl: "destinationUrl", scanCode: "scanCode" },
  advertisersTable: { id: "id", companyId: "companyId" },
  clientsTable: { id: "id", companyId: "companyId", name: "name" },
  companiesTable: { id: "id", segmentId: "segmentId", name: "name" },
}));

vi.mock("../../lib/panels/device-slides", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/panels/device-slides")>();
  return {
    ...actual,
    panelSlidesForClient: (...args: unknown[]) => panelSlidesForClientMock(...args),
  };
});

// O histórico de conexão tem teste próprio (lib/__tests__/device-sessions*);
// aqui só interessa que a rota o chame e sobreviva à falha dele.
vi.mock("../../lib/device-sessions", () => ({
  touchDeviceSession: (...args: unknown[]) => touchDeviceSessionMock(...args),
}));

// Sem este mock o feed iria ao GitHub de verdade a cada teste.
vi.mock("../../lib/tv-app-release", () => ({
  latestTvAppReleaseForFeed: (...args: unknown[]) => latestTvAppReleaseForFeedMock(...args),
}));

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

const DEVICE_ROW = { id: 1, clientId: 7, companyId: 70, segmentId: null, orientation: "landscape" };

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
  orientation: "landscape",
  advertiserSegmentId: null,
  advertiserCompanyId: null,
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
  orientation: "landscape",
  advertiserSegmentId: null,
  advertiserCompanyId: null,
  targetMode: "all" as const,
  deviceIds: [],
  segmentIds: [],
  weekdays: [],
};

const PANEL_ROW = {
  announcementId: 303,
  campaignId: null,
  title: "Tabela de preços do dia",
  displayText: null,
  showText: false,
  imageUrl: "/api/uploads/painel.png",
  duration: 10,
  scanCode: null,
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  orientation: "landscape",
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

  it("TV retrato recebe só as peças verticais, sem o campo orientation", async () => {
    const vertical = { ...PLAYLIST_ROW, announcementId: 111, orientation: "portrait" };
    selectResults = [[{ ...DEVICE_ROW, orientation: "portrait_left" }], [PLAYLIST_ROW, vertical], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([PANEL_ROW]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect(res.status).toBe(200);
    expect((res.body as Array<{ announcementId: number }>).map((s) => s.announcementId)).toEqual([111]);
    expect(res.body[0]).not.toHaveProperty("orientation");
  });

  it("TV deitada não recebe peça vertical", async () => {
    const vertical = { ...CAMPAIGN_ROW, announcementId: 222, orientation: "portrait" };
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], [vertical]];
    panelSlidesForClientMock.mockResolvedValue([]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect((res.body as Array<{ announcementId: number }>).map((s) => s.announcementId)).toEqual([
      PLAYLIST_ROW.announcementId,
    ]);
  });
});

describe("GET /display/:deviceKey/feed", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
  });

  it("devolve a orientação da TV junto com a rotação filtrada", async () => {
    const vertical = { ...PLAYLIST_ROW, announcementId: 111, orientation: "portrait" };
    selectResults = [[{ ...DEVICE_ROW, orientation: "portrait_right" }], [PLAYLIST_ROW, vertical], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect(res.body.screen).toEqual({ orientation: "portrait_right" });
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([111]);
    expect(res.body.slides[0]).not.toHaveProperty("source");
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
    // Como o /slides: a TV que pergunta está no ar.
    expect(dbUpdate).toHaveBeenCalledTimes(1);
  });

  // Regressão do item 1: linha estranha no banco (fora do enum) não pode
  // derrubar o parse do openapi e apagar o feed inteiro da TV.
  it("orientação desconhecida no banco não derruba o feed: vale landscape", async () => {
    selectResults = [[{ ...DEVICE_ROW, orientation: "diagonal" }], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect(res.body.screen).toEqual({ orientation: "landscape" });
  });

  it("404 com o mesmo corpo do /slides quando a key não existe", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/nao-existe/feed");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
  });
});

describe("GET /display/:deviceKey/feed — TV vitrine", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
  });

  // Campanha mirada em outra TV, e de concorrente do mesmo segmento: a TV
  // comum não mostra; a vitrine mostra, porque ela é a amostra da rede.
  const MIRADA_EM_OUTRA = {
    ...CAMPAIGN_ROW,
    announcementId: 404,
    campaignId: 6,
    targetMode: "devices" as const,
    deviceIds: [99],
    advertiserSegmentId: 3,
    advertiserCompanyId: 30,
  };

  it("vitrine recebe campanha de qualquer alvo e ignora concorrência", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, segmentId: 3, showcase: true }],
      [PLAYLIST_ROW],
      [CAMPAIGN_ROW, MIRADA_EM_OUTRA],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    const ids = res.body.slides.map((s: { announcementId: number }) => s.announcementId);
    expect(ids).toEqual(expect.arrayContaining([CAMPAIGN_ROW.announcementId, 404, PLAYLIST_ROW.announcementId]));
  });

  it("vitrine não carrega painéis de lojista", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: true }], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([PANEL_ROW]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(panelSlidesForClientMock).not.toHaveBeenCalled();
    const ids = res.body.slides.map((s: { announcementId: number }) => s.announcementId);
    expect(ids).not.toContain(PANEL_ROW.announcementId);
  });

  it("vitrine respeita os dias da semana da campanha", async () => {
    // Data fixa (quarta ao meio-dia em São Paulo): o teste e o feed leem o
    // mesmo "agora", sem risco de virar o dia entre um e outro.
    vi.useFakeTimers({ now: new Date("2026-09-30T15:00:00Z"), toFake: ["Date"] });
    try {
      // Lista com um dia só, que não é hoje: basta escolher um dia diferente
      // do atual em São Paulo.
      const hoje = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date());
      const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(hoje);
      const outroDia = (idx + 1) % 7;
      selectResults = [
        [{ ...DEVICE_ROW, showcase: true }],
        [],
        [{ ...CAMPAIGN_ROW, weekdays: [outroDia] }],
      ];
      const app = await buildApp();
      const { default: request } = await import("supertest");
      const res = await request(app).get("/display/tv-1/feed");

      expect(res.body.slides).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("TV comum segue filtrando pelo alvo", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [], [MIRADA_EM_OUTRA]];
    panelSlidesForClientMock.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.slides).toEqual([]);
  });
});

describe("GET /display/:deviceKey/feed — música de fundo", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
    panelSlidesForClientMock.mockResolvedValue([]);
  });

  it("TV com link de vídeo recebe music com tipo e ID", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://youtu.be/dQw4w9WgXcQ" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect(res.body.music).toEqual({ kind: "youtube_video", youtubeId: "dQw4w9WgXcQ" });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV com link de playlist recebe a playlist sem resolver os vídeos", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://www.youtube.com/playlist?list=PL1234567890abc" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.music).toEqual({ kind: "youtube_playlist", youtubeId: "PL1234567890abc" });
  });

  it("TV sem link recebe music null", async () => {
    selectResults = [[{ ...DEVICE_ROW, musicUrl: null }], [PLAYLIST_ROW], []];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.music).toBeNull();
  });

  it("link gravado que deixou de ser reconhecido vira music null, sem derrubar o feed", async () => {
    selectResults = [[{ ...DEVICE_ROW, musicUrl: "isto não é link" }], [PLAYLIST_ROW], []];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect(res.body.music).toBeNull();
    expect(res.body.slides).toHaveLength(1);
  });

  it("a música não vira slide", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://youtu.be/dQw4w9WgXcQ" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([101]);
  });

  it("/slides (tv.html antigo) segue sendo só a lista", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, musicUrl: "https://youtu.be/dQw4w9WgXcQ" }],
      [PLAYLIST_ROW],
      [],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /display/:deviceKey/feed — presença e versão do app", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    setMock.mockReset();
    touchDeviceSessionMock.mockReset();
    panelSlidesForClientMock.mockReset();
    panelSlidesForClientMock.mockResolvedValue([]);
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], []];
    selectCallIndex = 0;
  });

  it("grava a versão do app lida do User-Agent", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .get("/display/tv-1/feed")
      .set("User-Agent", "Mozilla/5.0 (Linux; Android 11) SignageApp/1.9.0");

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ lastSeenAt: expect.any(Date), appVersion: "1.9.0" });
  });

  // TV aberta em navegador: a versão anterior não pode ficar parada na tela
  // do admin como se o app ainda estivesse lá.
  it("contato sem o marcador do app grava versão nula", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/display/tv-1/feed").set("User-Agent", "Mozilla/5.0 (SmartTV)");

    expect(setMock).toHaveBeenCalledWith({ lastSeenAt: expect.any(Date), appVersion: null });
  });

  it("registra a sessão com o mesmo instante do lastSeenAt", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/display/tv-1/feed");

    const gravado = setMock.mock.calls[0][0] as { lastSeenAt: Date };
    expect(touchDeviceSessionMock).toHaveBeenCalledWith(DEVICE_ROW.id, gravado.lastSeenAt);
  });

  it("falha ao gravar a sessão não derruba o feed", async () => {
    touchDeviceSessionMock.mockRejectedValue(new Error('relation "device_sessions" does not exist'));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect((res.body.slides as unknown[]).length).toBe(1);
  });

  it("/slides (tv.html antigo) também registra presença", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/display/tv-1/slides").set("User-Agent", "Mozilla/5.0 SignageApp/1.4.2");

    expect(setMock).toHaveBeenCalledWith({ lastSeenAt: expect.any(Date), appVersion: "1.4.2" });
    expect(touchDeviceSessionMock).toHaveBeenCalledTimes(1);
  });

  it("key desconhecida não grava nada", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/nao-existe/feed");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
    expect(setMock).not.toHaveBeenCalled();
    expect(touchDeviceSessionMock).not.toHaveBeenCalled();
  });
});

describe("GET /display/:deviceKey/feed — aviso de atualização do app", () => {
  const APP = (versao: string) => `Mozilla/5.0 (Linux; Android 11) SignageApp/${versao}`;

  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    setMock.mockReset();
    touchDeviceSessionMock.mockReset();
    latestTvAppReleaseForFeedMock.mockReset();
    latestTvAppReleaseForFeedMock.mockResolvedValue({ versionName: "1.16.0" });
    panelSlidesForClientMock.mockReset();
    panelSlidesForClientMock.mockResolvedValue([]);
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], []];
    selectCallIndex = 0;
  });

  async function feed(userAgent: string) {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    return request(app).get("/display/tv-1/feed").set("User-Agent", userAgent);
  }

  it("TV em versão antiga recebe o aviso com a última release", async () => {
    const res = await feed(APP("1.15.1"));
    expect(res.status).toBe(200);
    expect(res.body.appUpdate).toEqual({ version: "1.16.0", forcedAt: null });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV em dia não recebe aviso", async () => {
    const res = await feed(APP("1.16.0"));
    expect(res.body.appUpdate).toBeNull();
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV no navegador não recebe aviso", async () => {
    const res = await feed("Mozilla/5.0 (SmartTV)");
    expect(res.body.appUpdate).toBeNull();
  });

  it("pedido recente do admin vai no aviso, mesmo com a TV em dia", async () => {
    const pedido = new Date(Date.now() - 60 * 1000);
    selectResults = [[{ ...DEVICE_ROW, updateRequestedAt: pedido }], [PLAYLIST_ROW], []];
    const res = await feed(APP("1.16.0"));
    expect(res.body.appUpdate).toEqual({ version: "1.16.0", forcedAt: pedido.toISOString() });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("pedido de mais de 15 minutos não vai", async () => {
    const pedido = new Date(Date.now() - 16 * 60 * 1000);
    selectResults = [[{ ...DEVICE_ROW, updateRequestedAt: pedido }], [PLAYLIST_ROW], []];
    const res = await feed(APP("1.16.0"));
    expect(res.body.appUpdate).toBeNull();
  });

  it("sem release conhecida, o pedido do admin vai com versão nula", async () => {
    latestTvAppReleaseForFeedMock.mockResolvedValue(null);
    const pedido = new Date(Date.now() - 60 * 1000);
    selectResults = [[{ ...DEVICE_ROW, updateRequestedAt: pedido }], [PLAYLIST_ROW], []];
    const res = await feed(APP("1.0.0"));
    expect(res.status).toBe(200);
    expect(res.body.appUpdate).toEqual({ version: null, forcedAt: pedido.toISOString() });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV sem peças também recebe o aviso", async () => {
    selectResults = [[DEVICE_ROW], [], []];
    const res = await feed(APP("1.15.1"));
    expect(res.body.slides).toEqual([]);
    expect(res.body.appUpdate).toEqual({ version: "1.16.0", forcedAt: null });
  });

  it("/slides (tv.html antigo) segue sendo só a lista e não consulta a release", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides").set("User-Agent", APP("1.15.1"));
    expect(Array.isArray(res.body)).toBe(true);
    expect(latestTvAppReleaseForFeedMock).not.toHaveBeenCalled();
  });
});
