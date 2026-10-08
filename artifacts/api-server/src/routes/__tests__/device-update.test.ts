import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A orientação da TV é trocada pelo admin e chega ao player no próximo
 * refresh. O PATCH tem de aceitar só os três valores: um valor fora do enum
 * gravado no banco viraria landscape em silêncio, e a TV girada ficaria de
 * lado sem ninguém entender por quê.
 */
const setMock = vi.fn();
let updateResult: unknown[] = [];
// O PATCH faz até três selects: TV atual, outras vitrines (só se o estado
// final é vitrine) e a TV com cliente (resposta). Cada um consome um item.
let selectQueue: unknown[][] = [];

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    returning: () => chain,
    set: (values: unknown) => {
      setMock(values);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectQueue.shift() ?? []),
    update: () => makeChain(updateResult),
  },
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey", orientation: "orientation", showcase: "showcase", musicUrl: "musicUrl", showWeather: "showWeather", tickerMessages: "tickerMessages" },
  devicePlaylistTable: {},
  announcementsTable: {},
  clientsTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", name: "name", segmentId: "segmentId", lat: "lat", lng: "lng" },
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
  id: 1,
  clientId: 7,
  clientName: "Padaria Central",
  name: "TV do balcão",
  location: null,
  deviceKey: "A1B2C3D4E5F6A7B8",
  orientation: "portrait_right",
  lastSeenAt: null,
  showcase: false,
  createdAt: new Date("2026-09-01T12:00:00Z"),
};

beforeEach(() => {
  setMock.mockReset();
  updateResult = [{ id: 1 }];
  selectQueue = [];
});

describe("PATCH /devices/:id — orientação", () => {
  it("grava um retrato válido e devolve a TV com a orientação", async () => {
    // 1) TV atual  2) TV com cliente (resposta)
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait_right" });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ orientation: "portrait_right" });
    expect(res.body.orientation).toBe("portrait_right");
  });

  it("recusa valor fora do enum sem tocar no banco", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait" });

    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("devolve se a TV é vitrine", async () => {
    selectQueue = [[{ id: 1, showcase: true, orientation: "landscape" }], [], [{ ...DEVICE, showcase: true }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ name: "Vitrine horizontal" });

    expect(res.status).toBe(200);
    expect(res.body.showcase).toBe(true);
  });
});

describe("PATCH /devices/:id — vitrine", () => {
  it("liga a vitrine quando não há outra na mesma orientação", async () => {
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "landscape" }],
      [{ id: 9, name: "Vitrine vertical", orientation: "portrait_right" }],
      [{ ...DEVICE, orientation: "landscape", showcase: true }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showcase: true });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ showcase: true });
  });

  it("409 com o nome da vitrine que já ocupa a orientação, sem gravar", async () => {
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "portrait_left" }],
      [{ id: 9, name: "Vitrine vertical", orientation: "portrait_right" }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showcase: true });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Já existe uma vitrine vertical: Vitrine vertical");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("girar uma vitrine para a orientação de outra também é 409", async () => {
    selectQueue = [
      [{ id: 1, showcase: true, orientation: "landscape" }],
      [{ id: 9, name: "Vitrine vertical", orientation: "portrait_right" }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait_left" });

    expect(res.status).toBe(409);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("desligar a vitrine não consulta as outras", async () => {
    selectQueue = [
      [{ id: 1, showcase: true, orientation: "landscape" }],
      [{ ...DEVICE, orientation: "landscape", showcase: false }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showcase: false });

    expect(res.status).toBe(200);
    expect(res.body.showcase).toBe(false);
  });

  it("TV inexistente é 404", async () => {
    selectQueue = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/99").send({ showcase: true });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /devices/:id — música de fundo", () => {
  it("grava link de vídeo e devolve musicUrl", async () => {
    const link = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: link }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: link });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: link });
    expect(res.body.musicUrl).toBe(link);
  });

  it("grava link de playlist sem os espaços das pontas", async () => {
    const link = "https://www.youtube.com/playlist?list=PL1234567890abc";
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: link }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: `  ${link}  ` });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: link });
  });

  it("link inválido é 400 e não toca no banco", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: "https://open.spotify.com/playlist/abc" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Link do YouTube inválido" });
    expect(setMock).not.toHaveBeenCalled();
  });

  it("null tira a música", async () => {
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: null }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: null });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: null });
    expect(res.body.musicUrl).toBeNull();
  });

  it("string vazia também tira a música", async () => {
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [{ ...DEVICE, musicUrl: null }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ musicUrl: "   " });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ musicUrl: null });
  });

  it("PATCH de outro campo não mexe na música", async () => {
    selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [DEVICE]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).patch("/devices/1").send({ name: "TV nova" });

    expect(setMock).toHaveBeenCalledWith({ name: "TV nova" });
  });
});

describe("PATCH /devices/:id — clima e hora", () => {
  it("grava showWeather e devolve a TV com a chave e as coordenadas da empresa", async () => {
    // 1) TV atual  2) TV com cliente (resposta)
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "landscape" }],
      [{ ...DEVICE, showWeather: true, companyHasCoordinates: true }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showWeather: true });
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ showWeather: true }));
    expect(res.body).toMatchObject({ showWeather: true, companyHasCoordinates: true });
  });

  it("recusa showWeather que não é booleano, sem tocar no banco", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showWeather: "sim" });
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /devices/:id — faixa de recados", () => {
  it("grava os recados normalizados e devolve a TV com eles", async () => {
    // 1) TV atual  2) TV com cliente (resposta)
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "landscape" }],
      [{ ...DEVICE, tickerMessages: ["Pão às 17h", "Siga @padaria"] }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .patch("/devices/1")
      .send({ tickerMessages: ["  Pão às 17h  ", "", "Siga @padaria"] });
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ tickerMessages: ["Pão às 17h", "Siga @padaria"] }));
    expect(res.body.tickerMessages).toEqual(["Pão às 17h", "Siga @padaria"]);
  });

  it.each([
    ["6 recados", ["a", "b", "c", "d", "e", "f"], "Até 5 recados."],
    ["recado longo", ["x".repeat(81)], "Cada recado tem até 80 caracteres."],
  ])("400 com a mensagem: %s, sem tocar no banco", async (_caso, tickerMessages, error) => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ tickerMessages });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(setMock).not.toHaveBeenCalled();
  });
});
