import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

let companyRows: unknown[] = [];
const fetchForecastMock = vi.hoisted(() => vi.fn());
const renderWeatherMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => companyRows }) }) },
  companiesTable: { id: "id", name: "name", city: "city", lat: "lat", lng: "lng" },
}));
vi.mock("../../lib/editorial/forecast", () => ({ fetchForecast: (...a: unknown[]) => fetchForecastMock(...a) }));
vi.mock("../../lib/editorial/render", () => ({ renderWeather: (...a: unknown[]) => renderWeatherMock(...a) }));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../editorial");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

const LOJA = { name: "Padaria Pão Bom", city: "São José dos Campos", lat: -23.18, lng: -45.89, usesWeather: true };
const PREVISAO = { current: { temperature: 27, code: 2 }, today: { max: 31, min: 18, code: 2 }, nextDays: [] };

beforeEach(() => {
  companyRows = [LOJA];
  fetchForecastMock.mockReset();
  fetchForecastMock.mockResolvedValue(PREVISAO);
  renderWeatherMock.mockReset();
  renderWeatherMock.mockResolvedValue(Buffer.from("png"));
});

describe("GET /editorial/weather.png", () => {
  it("desenha o clima da cidade da loja e manda cache de 1 min", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/editorial/weather.png?company=12&o=landscape&m=29331234");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["cache-control"]).toBe("public, s-maxage=60, max-age=60");
    expect(fetchForecastMock).toHaveBeenCalledWith(-23.18, -45.89);
    const [art, orientation] = renderWeatherMock.mock.calls[0];
    expect(orientation).toBe("landscape");
    expect(art.city).toBe("São José dos Campos");
    expect(art.forecast).toEqual(PREVISAO);
    expect(art.clock).toMatch(/ · \d{2}:\d{2}$/);
  });

  it("em pé quando o=portrait; sem o, deitado", async () => {
    const { default: request } = await import("supertest");
    const app = await buildApp();
    await request(app).get("/editorial/weather.png?company=12&o=portrait");
    await request(app).get("/editorial/weather.png?company=12");
    expect(renderWeatherMock.mock.calls.map((c) => c[1])).toEqual(["portrait", "landscape"]);
  });

  it("empresa sem cidade usa o nome", async () => {
    companyRows = [{ ...LOJA, city: null }];
    const { default: request } = await import("supertest");
    await request(await buildApp()).get("/editorial/weather.png?company=12");
    expect(renderWeatherMock.mock.calls[0][0].city).toBe("Padaria Pão Bom");
  });

  it("Open-Meteo fora do ar ainda dá 200, com a arte sem previsão", async () => {
    fetchForecastMock.mockResolvedValue(null);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/editorial/weather.png?company=12");
    expect(res.status).toBe(200);
    expect(renderWeatherMock.mock.calls[0][0].forecast).toBeNull();
  });

  it.each([
    ["empresa inexistente", [], "12"],
    ["empresa sem coordenadas", [{ ...LOJA, lat: null }], "12"],
    ["empresa sem TV com o clima ligado", [{ ...LOJA, usesWeather: false }], "12"],
    ["company inválido", [LOJA], "abc"],
    ["company zero", [LOJA], "0"],
  ])("404: %s, sem buscar o clima", async (_caso, rows, company) => {
    companyRows = rows;
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get(`/editorial/weather.png?company=${company}`);
    expect(res.status).toBe(404);
    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it("falha ao desenhar → 500", async () => {
    renderWeatherMock.mockRejectedValue(new Error("satori"));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/editorial/weather.png?company=12");
    expect(res.status).toBe(500);
  });
});
