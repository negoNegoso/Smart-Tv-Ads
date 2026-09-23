import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O formulário manda a orientação detectada (ou corrigida pelo operador). Peça
 * gravada com a orientação errada some das TVs certas, então valor fora do
 * enum é 400, e ausência (cliente antigo) cai no default do banco.
 */
const insertValues = vi.fn();
const updateSet = vi.fn();
let selectQueue: unknown[] = [];

function makeChain(result: unknown, onValues?: (v: unknown) => void) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    returning: () => chain,
    values: (v: unknown) => {
      onValues?.(v);
      return chain;
    },
    set: (v: unknown) => {
      onValues?.(v);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const ROW = {
  id: 9,
  title: "Short da padaria",
  displayText: null,
  showText: false,
  imageUrl: null,
  mediaKind: "youtube_video",
  youtubeId: "abc123def45",
  playbackMode: "capped",
  audioMode: "muted",
  orientation: "portrait",
  isActive: true,
  displayOrder: 0,
  source: "admin",
  duration: 10,
  createdAt: new Date("2026-09-22T12:00:00Z"),
  updatedAt: new Date("2026-09-22T12:00:00Z"),
};

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectQueue.shift()),
    insert: () => makeChain([ROW], insertValues),
    update: () => makeChain([ROW], updateSet),
  },
  announcementsTable: { id: "id", displayOrder: "displayOrder", createdAt: "createdAt", isActive: "isActive" },
}));

async function buildApp(): Promise<Express> {
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  process.env.MAX_UPLOAD_BYTES = "4000000";
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../announcements");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

const SHORT = "https://www.youtube.com/shorts/abc123def45";

beforeEach(() => {
  insertValues.mockReset();
  updateSet.mockReset();
  selectQueue = [];
});

describe("POST /announcements — orientação", () => {
  it("grava a orientação enviada", async () => {
    selectQueue = [[{ maxOrder: -1 }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/announcements")
      .field("title", "Short da padaria")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("orientation", "portrait");

    expect(res.status).toBe(201);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ orientation: "portrait" }));
  });

  it("sem o campo, não manda orientação (vale o default do banco)", async () => {
    selectQueue = [[{ maxOrder: -1 }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app)
      .post("/announcements")
      .field("title", "Vídeo antigo")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT);

    expect(insertValues.mock.calls[0][0]).not.toHaveProperty("orientation");
  });

  it("recusa orientação inválida", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/announcements")
      .field("title", "X")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("orientation", "portrait_right");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Orientação inválida" });
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe("PATCH /announcements/:id — orientação", () => {
  it("atualiza só a orientação", async () => {
    selectQueue = [[{ ...ROW, orientation: "landscape" }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/9").field("orientation", "portrait");

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ orientation: "portrait" });
  });

  it("recusa orientação inválida", async () => {
    selectQueue = [[ROW]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/9").field("orientation", "deitada");

    expect(res.status).toBe(400);
    expect(updateSet).not.toHaveBeenCalled();
  });
});

describe("PATCH /announcements/:id — poster ao reenviar campos de YouTube", () => {
  // Regressão do item 3: o formulário de edição sempre manda mediaKind, mesmo
  // quando a peça já era YouTube antes do PATCH. Isso não pode apagar um
  // poster próprio que já estava salvo — só a troca de imagem→YouTube limpa.
  it("peça já era YouTube: reenviar mediaKind/youtubeUrl não apaga o poster", async () => {
    const jaEraYoutube = {
      ...ROW,
      mediaKind: "youtube_video",
      youtubeId: "abc123def45",
      imageUrl: "/api/uploads/poster-proprio.png",
    };
    selectQueue = [[jaEraYoutube]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .patch("/announcements/9")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("orientation", "portrait");

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet.mock.calls[0][0]).not.toHaveProperty("imageUrl");
  });

  it("peça era imagem e virou YouTube sem novo arquivo: limpa o poster antigo", async () => {
    const eraImagem = { ...ROW, mediaKind: "image", imageUrl: "/api/uploads/cartaz.png" };
    selectQueue = [[eraImagem]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .patch("/announcements/9")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT);

    expect(res.status).toBe(200);
    expect(updateSet.mock.calls[0][0]).toHaveProperty("imageUrl", null);
  });
});
