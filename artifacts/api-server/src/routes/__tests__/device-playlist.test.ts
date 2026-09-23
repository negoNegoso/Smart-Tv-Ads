import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Peça sem imagem na playlist do device.
 *
 * `announcements.image_url` é nulável, e nulo é estado normal: a peça nasce sem
 * imagem quando não há upload, e o poster é zerado ao trocar a peça para
 * YouTube. As três rotas de playlist (listar, adicionar, alternar) validam a
 * resposta com o mesmo schema — se ele proibir nulo, a linha entra no banco, a
 * TV passa a exibir a peça, e mesmo assim a requisição falha. A listagem é pior:
 * valida um array, então um item sem imagem derruba a lista inteira.
 *
 * Mesmo mock de device-preview.test.ts, com a cadeia de insert acrescentada.
 */
const dbSelect = vi.fn();
const dbInsert = vi.fn();

let selectResults: unknown[] = [];
let selectCallIndex = 0;
let insertResult: unknown = [];

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    values: () => chain,
    onConflictDoNothing: () => chain,
    returning: () => chain,
    then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      dbSelect(...args);
      return makeChain(selectResults[selectCallIndex++]);
    },
    insert: (...args: unknown[]) => {
      dbInsert(...args);
      return makeChain(insertResult);
    },
  },
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey", orientation: "orientation" },
  devicePlaylistTable: {
    id: "id",
    deviceId: "deviceId",
    announcementId: "announcementId",
    displayOrder: "displayOrder",
    isActive: "isActive",
  },
  announcementsTable: { id: "id", title: "title", imageUrl: "imageUrl", duration: "duration", orientation: "orientation" },
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

/** Peça de vídeo/YouTube: entrou sem poster, então `imageUrl` é nulo. */
const SEM_IMAGEM = {
  id: 2,
  deviceId: 1,
  announcementId: 102,
  displayOrder: 1,
  isActive: true,
  title: "Vídeo do cliente",
  imageUrl: null,
  duration: 10,
};

const COM_IMAGEM = {
  id: 1,
  deviceId: 1,
  announcementId: 101,
  displayOrder: 0,
  isActive: true,
  title: "Cartaz da padaria",
  imageUrl: "/api/uploads/cartaz.png",
  duration: 10,
};

beforeEach(() => {
  selectResults = [];
  selectCallIndex = 0;
  insertResult = [];
  dbSelect.mockReset();
  dbInsert.mockReset();
});

describe("POST /devices/:id/playlist/add", () => {
  it("aceita peça sem imagem", async () => {
    // Primeiro: orientação (landscape/landscape OK), depois maxOrder, depois a linha recém-inserida com o join de announcements.
    selectResults = [[{ deviceOrientation: "landscape", pieceOrientation: "landscape" }], [{ maxOrder: 0 }], [SEM_IMAGEM]];
    insertResult = [{ id: SEM_IMAGEM.id }];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 102 });

    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBeNull();
    expect(res.body.announcementId).toBe(102);
  });

  it("recusa peça vertical em TV horizontal, sem inserir", async () => {
    selectResults = [[{ deviceOrientation: "landscape", pieceOrientation: "portrait" }]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 102 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Peça vertical não toca em TV horizontal" });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("recusa peça horizontal em TV retrato", async () => {
    selectResults = [[{ deviceOrientation: "portrait_left", pieceOrientation: "landscape" }]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 102 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Peça horizontal não toca em TV retrato" });
  });

  it("aceita peça vertical em TV retrato", async () => {
    selectResults = [
      [{ deviceOrientation: "portrait_right", pieceOrientation: "portrait" }],
      [{ maxOrder: 0 }],
      [SEM_IMAGEM],
    ];
    insertResult = [{ id: SEM_IMAGEM.id }];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 102 });

    expect(res.status).toBe(201);
  });

  it("404 quando a TV ou a peça não existe", async () => {
    selectResults = [[]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 999 });

    expect(res.status).toBe(404);
  });
});

describe("GET /devices/:id/playlist", () => {
  it("lista peça sem imagem junto das demais", async () => {
    // device encontrado, depois as linhas da playlist.
    selectResults = [[{ id: 1 }], [COM_IMAGEM, SEM_IMAGEM]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/devices/1/playlist");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[1].imageUrl).toBeNull();
  });

  it("continua listando quando todas têm imagem", async () => {
    selectResults = [[{ id: 1 }], [COM_IMAGEM]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/devices/1/playlist");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
