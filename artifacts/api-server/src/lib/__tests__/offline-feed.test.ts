import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mesmo truque do display-slides.test: o db devolve, em ordem, playlist e
 * campanhas; painéis e aviso são mockados à parte.
 */
const panelSlidesForClientMock = vi.fn();
const findActiveAlertPieceMock = vi.fn();
let selectResults: unknown[] = [];
let selectCallIndex = 0;

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "orderBy"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void, reject?: (r: unknown) => void) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: { select: () => makeChain(selectResults[selectCallIndex++]) },
  devicePlaylistTable: { deviceId: "deviceId", isActive: "isActive", displayOrder: "displayOrder", announcementId: "announcementId" },
  announcementsTable: { id: "id", title: "title", displayText: "displayText", showText: "showText", imageUrl: "imageUrl", duration: "duration", mediaKind: "mediaKind", youtubeId: "youtubeId", playbackMode: "playbackMode", audioMode: "audioMode", orientation: "orientation", displayOrder: "displayOrder" },
  campaignsTable: { id: "id", advertiserId: "advertiserId", isActive: "isActive", startsAt: "startsAt", endsAt: "endsAt", weekdays: "weekdays", timeWindows: "timeWindows", targetMode: "targetMode", loopInsertions: "loopInsertions" },
  campaignAnnouncementsTable: { campaignId: "campaignId", announcementId: "announcementId", destinationUrl: "destinationUrl", scanCode: "scanCode" },
  advertisersTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", segmentId: "segmentId" },
}));

vi.mock("../panels/device-slides", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../panels/device-slides")>();
  return { ...actual, panelSlidesForClient: (...a: unknown[]) => panelSlidesForClientMock(...a) };
});

vi.mock("../alerts/active-alert", () => ({
  findActiveAlertPiece: (...a: unknown[]) => findActiveAlertPieceMock(...a),
}));

const { loadOfflineFeed } = await import("../offline-feed");

const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never;
const NOW = new Date("2026-10-08T18:00:00Z"); // 15:00 em São Paulo
const DEVICE = { id: 1, clientId: 7, companyId: 70, segmentId: null, orientation: "landscape" };

const linha = (over: Record<string, unknown>) => ({
  announcementId: 1,
  campaignId: null,
  title: "Peça",
  displayText: null,
  showText: false,
  imageUrl: "https://x.public.blob.vercel-storage.com/a.png",
  duration: 10,
  scanCode: null,
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  orientation: "landscape",
  advertiserSegmentId: null,
  advertiserCompanyId: 99,
  targetMode: "all",
  deviceIds: [],
  segmentIds: [],
  weekdays: [],
  timeWindows: [],
  loopInsertions: 1,
  panelId: null,
  ...over,
});

const campanha = (over: Record<string, unknown>) =>
  linha({
    campaignId: 5,
    startsAt: new Date("2026-10-01T03:00:00Z"),
    endsAt: new Date("2026-10-31T03:00:00Z"),
    ...over,
  });

beforeEach(() => {
  selectResults = [];
  selectCallIndex = 0;
  panelSlidesForClientMock.mockReset().mockResolvedValue([]);
  findActiveAlertPieceMock.mockReset().mockResolvedValue(null);
});

describe("loadOfflineFeed", () => {
  it("campanha fora do horário de agora entra, com a agenda", async () => {
    selectResults = [[], [campanha({ announcementId: 2, weekdays: [1, 2], timeWindows: [{ start: 1080, end: 1320 }] })]];
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.geradoEm).toBe(NOW.toISOString());
    expect(feed!.slides).toEqual([
      expect.objectContaining({
        announcementId: 2,
        campaignId: 5,
        agenda: {
          inicio: "2026-10-01T03:00:00.000Z",
          fim: "2026-10-31T03:00:00.000Z",
          dias: [1, 2],
          faixas: [{ start: 1080, end: 1320 }],
        },
      }),
    ]);
  });

  it("horizonte da lista é de 7 dias", async () => {
    // A consulta com `startsBy` tem teste próprio (device-feed-query.test);
    // aqui fica a constante que a liga ao `now`.
    const { OFFLINE_HORIZON_MS } = await import("../offline-feed");
    expect(OFFLINE_HORIZON_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("concorrente e campanha de outra TV não entram", async () => {
    selectResults = [
      [],
      [
        campanha({ announcementId: 2, advertiserSegmentId: 3 }),
        campanha({ announcementId: 3, campaignId: 6, targetMode: "devices", deviceIds: [999] }),
      ],
    ];
    const feed = await loadOfflineFeed({ ...DEVICE, segmentId: 3 }, log, NOW);
    expect(feed!.slides).toEqual([]);
  });

  it("YouTube não entra (não toca sem internet)", async () => {
    selectResults = [[linha({ announcementId: 4, mediaKind: "youtube_video", youtubeId: "abc" })], []];
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.slides).toEqual([]);
  });

  it("playlist e painéis entram sem agenda; QR e legenda resolvidos", async () => {
    selectResults = [
      [linha({ announcementId: 7, showText: true, displayText: "Oi" })],
      [campanha({ announcementId: 2, scanCode: "abc123" })],
    ];
    panelSlidesForClientMock.mockResolvedValue([linha({ announcementId: 8, panelId: 3 })]);
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    const porId = Object.fromEntries(feed!.slides.map((s) => [s.announcementId, s]));
    expect(porId[2]!.qrImageUrl).toBe("/api/qr/abc123.png");
    expect(porId[7]).not.toHaveProperty("agenda");
    expect(porId[7]!.displayText).toBe("Oi");
    expect(porId[8]).not.toHaveProperty("agenda");
  });

  it("aviso urgente vai na frente com agenda.fim e a volta normal segue atrás", async () => {
    selectResults = [[linha({ announcementId: 7 })], []];
    findActiveAlertPieceMock.mockResolvedValue({
      announcementId: 50,
      title: "Fechamos às 18h",
      imageUrl: "https://x.public.blob.vercel-storage.com/alerta.png",
      duration: 15,
      endsAt: new Date("2026-10-08T21:00:00Z"),
    });
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.slides.map((s) => s.announcementId)).toEqual([50, 7]);
    expect(feed!.slides[0]!.agenda).toEqual({ fim: "2026-10-08T21:00:00.000Z" });
  });

  it("falha no aviso não derruba a lista", async () => {
    selectResults = [[linha({ announcementId: 7 })], []];
    findActiveAlertPieceMock.mockRejectedValue(new Error("db"));
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.slides.map((s) => s.announcementId)).toEqual([7]);
  });

  it("vitrine → null", async () => {
    expect(await loadOfflineFeed({ ...DEVICE, showcase: true }, log, NOW)).toBeNull();
  });

  it("falha na montagem → null e log, sem lançar", async () => {
    selectResults = [Promise.reject(new Error("db fora"))];
    await expect(loadOfflineFeed(DEVICE, log, NOW)).resolves.toBeNull();
  });
});
