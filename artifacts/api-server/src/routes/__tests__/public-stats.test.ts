// artifacts/api-server/src/routes/__tests__/public-stats.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// queries.ts importa @workspace/db, que lança se DATABASE_URL não existir. O
// describe de janelas de tempo importa o módulo real (via importActual) antes
// de qualquer chamada a buildApp(), então a variável precisa existir aqui em
// cima: uma falha na primeira importação envenena o módulo para o arquivo
// inteiro, e mesmo as chamadas a buildApp() feitas depois não recuperam.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const publicStats = vi.fn();
vi.mock("../../lib/public-stats/queries", async () => {
  const actual = await vi.importActual<typeof import("../../lib/public-stats/queries")>(
    "../../lib/public-stats/queries",
  );
  return { ...actual, publicStats: (...a: unknown[]) => publicStats(...a) };
});

async function buildApp(): Promise<Express> {
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  const { default: express } = await import("express");
  const { default: router } = await import("../public-stats");
  const app = express();
  app.use(router);
  return app;
}

describe("janelas de tempo dos números públicos", () => {
  it("plays30d olha 30 dias para trás", async () => {
    const { playsSince } = await import("../../lib/public-stats/queries");
    const now = new Date("2026-03-31T12:00:00.000Z");
    expect(playsSince(now).toISOString()).toBe("2026-03-01T12:00:00.000Z");
  });

  it("activeScreens olha 24 horas para trás", async () => {
    const { activeSince } = await import("../../lib/public-stats/queries");
    const now = new Date("2026-03-31T12:00:00.000Z");
    expect(activeSince(now).toISOString()).toBe("2026-03-30T12:00:00.000Z");
  });
});

describe("GET /public/stats", () => {
  const VAZIO = { plays30d: 0, activeScreens: 0, clients: 0, segments: 0, cities: [] };

  beforeEach(() => {
    publicStats.mockReset();
  });

  it("responde os contadores e a cobertura por cidade", async () => {
    publicStats.mockResolvedValue({
      plays30d: 1204,
      activeScreens: 7,
      clients: 5,
      segments: 3,
      cities: [
        { ibge: "3542602", companies: 4 },
        { ibge: "3509254", companies: 1 },
      ],
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      plays30d: 1204,
      activeScreens: 7,
      clients: 5,
      segments: 3,
      cities: [
        { ibge: "3542602", companies: 4 },
        { ibge: "3509254", companies: 1 },
      ],
    });
  });

  it("aceita rede sem nenhuma cidade parceira", async () => {
    publicStats.mockResolvedValue(VAZIO);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).toBe(200);
    expect(res.body.cities).toEqual([]);
  });

  it("descarta campo extra que a consulta porventura traga", async () => {
    publicStats.mockResolvedValue({
      plays30d: 1,
      activeScreens: 1,
      clients: 1,
      segments: 1,
      // Linha suja de propósito: se um dia a consulta passar a trazer o nome do
      // estabelecimento, o schema da rota é o que precisa barrar — este teste é
      // o que prova isso. Mockar uma linha já limpa (como antes) não provava
      // nada além de a rota repassar o que recebeu.
      cities: [{ ibge: "3542602", companies: 1, name: "Padaria Central" }],
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.body.cities[0]).toEqual({ ibge: "3542602", companies: 1 });
    expect(res.body.cities[0].name).toBeUndefined();
  });

  it("permite cache no CDN", async () => {
    publicStats.mockResolvedValue(VAZIO);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });

  it("não exige sessão", async () => {
    publicStats.mockResolvedValue(VAZIO);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).not.toBe(401);
  });
});
