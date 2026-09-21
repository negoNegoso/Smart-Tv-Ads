// artifacts/api-server/src/routes/__tests__/tv-app.test.ts
import type { Express } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O router não toca no banco, mas app.ts/queries vizinhos exigem a variável
// assim que o módulo entra no grafo de importação do vitest.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const UPDATE_JSON = {
  versionName: "1.5.0",
  versionCode: 1005000,
  apk: "signage-tv-1.5.0.apk",
  sha256: "a".repeat(64),
};

const fetchMock = vi.fn();

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../tv-app");
  const app = express();
  app.use("/api", router);
  return app;
}

function okUpdateJson(body: unknown = UPDATE_JSON) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  // O cache do release vive no módulo: sem zerar, o segundo teste herdaria a
  // resposta do primeiro e nenhum deles provaria o que diz provar.
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/tv-app/apk", () => {
  it("redireciona para o APK da última release", async () => {
    fetchMock.mockResolvedValue(okUpdateJson());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/apk");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      "https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/signage-tv-1.5.0.apk",
    );
  });

  it("responde 503 quando o GitHub está fora", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/apk");
    expect(res.status).toBe(503);
    expect(res.text).toContain("Não foi possível");
  });

  it("recusa nome de APK fora do padrão publicado pela pipeline", async () => {
    // Defesa contra redirecionamento aberto: o destino é montado com um campo
    // que vem de fora, então o nome precisa ser o que a release gera.
    fetchMock.mockResolvedValue(okUpdateJson({ ...UPDATE_JSON, apk: "../../evil.apk" }));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/apk");
    expect(res.status).toBe(503);
  });
});

describe("GET /api/tv-app/latest", () => {
  it("devolve versão e hash do APK publicado", async () => {
    fetchMock.mockResolvedValue(okUpdateJson());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/latest");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      versionName: "1.5.0",
      apk: "signage-tv-1.5.0.apk",
      sha256: "a".repeat(64),
      url: "https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/signage-tv-1.5.0.apk",
    });
  });

  it("responde 503 quando o update.json vem sem o nome do APK", async () => {
    fetchMock.mockResolvedValue(okUpdateJson({ versionName: "1.5.0", versionCode: 1005000 }));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/latest");
    expect(res.status).toBe(503);
  });
});

describe("cache do update.json", () => {
  it("não repete o fetch dentro da janela", async () => {
    fetchMock.mockResolvedValue(okUpdateJson());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/api/tv-app/latest");
    await request(app).get("/api/tv-app/apk");
    await request(app).get("/api/tv-app/latest");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("volta a consultar depois que a janela expira", async () => {
    // Só o relógio é falso: fingir setTimeout/setInterval derrubaria o
    // servidor HTTP que o supertest levanta a cada requisição.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      fetchMock.mockResolvedValue(okUpdateJson());
      const app = await buildApp();
      const { default: request } = await import("supertest");
      await request(app).get("/api/tv-app/latest");
      vi.setSystemTime(Date.now() + 6 * 60 * 1000);
      await request(app).get("/api/tv-app/latest");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falha não fica em cache: a próxima visita tenta de novo", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValue(okUpdateJson());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/api/tv-app/apk")).status).toBe(503);
    expect((await request(app).get("/api/tv-app/apk")).status).toBe(302);
  });
});
