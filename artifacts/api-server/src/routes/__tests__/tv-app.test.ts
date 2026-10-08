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

const LATEST = "https://api.github.com/repos/negoNegoso/Smart-Tv-Ads/releases/latest";
/** Link temporário que o GitHub gera para o APK; é para onde a TV vai. */
const APK_ASSINADO = "https://assinado.example/2";

const fetchMock = vi.fn();

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../tv-app");
  const app = express();
  app.use("/api", router);
  return app;
}

/** GitHub de mentira: release → arquivos → links assinados → update.json. */
function github(manifest: unknown = UPDATE_JSON) {
  const apk = (manifest as { apk?: string }).apk ?? "signage-tv-1.5.0.apk";
  return async (url: string): Promise<Response> => {
    if (url === LATEST) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          assets: [
            { name: "update.json", url: "https://api.github.com/assets/1" },
            { name: apk, url: "https://api.github.com/assets/2" },
          ],
        }),
      } as unknown as Response;
    }
    const asset = url.match(/^https:\/\/api\.github\.com\/assets\/(\d+)$/);
    if (asset) {
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: `https://assinado.example/${asset[1]}` }),
      } as unknown as Response;
    }
    if (url === "https://assinado.example/1") {
      return { ok: true, status: 200, json: async () => manifest } as unknown as Response;
    }
    throw new Error(`URL inesperada no teste: ${url}`);
  };
}

function consultas() {
  return fetchMock.mock.calls.filter(([url]) => url === LATEST).length;
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
  it("redireciona para o link temporário do APK da última release", async () => {
    fetchMock.mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/apk");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(APK_ASSINADO);
    expect(res.headers["cache-control"]).toBe("no-store");
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
    // O nome vem de fora e decide qual arquivo é entregue: precisa ser o que a
    // release gera.
    fetchMock.mockImplementation(github({ ...UPDATE_JSON, apk: "../../evil.apk" }));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/apk");
    expect(res.status).toBe(503);
  });
});

// Caminho do atualizador do app: UPDATE_BASE_URL + "update.json" e + nome do APK.
describe("atualizador do app", () => {
  it("GET update.json devolve o manifesto que o app lê", async () => {
    fetchMock.mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/update.json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(UPDATE_JSON);
  });

  it("GET update.json responde 503 com o GitHub fora", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/api/tv-app/update.json")).status).toBe(503);
  });

  it("GET do APK da última release redireciona para o link temporário", async () => {
    fetchMock.mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/signage-tv-1.5.0.apk");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(APK_ASSINADO);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  // update.json velho na TV: ela tenta de novo na próxima checagem.
  it("GET de um APK que não é o da última release dá 404", async () => {
    fetchMock.mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/api/tv-app/signage-tv-1.4.0.apk")).status).toBe(404);
  });

  it("nome fora do padrão não é tratado pela rota do APK", async () => {
    fetchMock.mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/api/tv-app/qualquer.txt")).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/tv-app/latest", () => {
  it("devolve versão e hash do APK publicado, sem o endereço interno", async () => {
    fetchMock.mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/latest");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      versionName: "1.5.0",
      apk: "signage-tv-1.5.0.apk",
      sha256: "a".repeat(64),
    });
  });

  it("responde 503 quando o update.json vem sem o nome do APK", async () => {
    fetchMock.mockImplementation(github({ versionName: "1.5.0", versionCode: 1005000 }));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/tv-app/latest");
    expect(res.status).toBe(503);
  });
});

describe("cache do update.json", () => {
  it("não repete a consulta dentro da janela", async () => {
    fetchMock.mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/api/tv-app/latest");
    await request(app).get("/api/tv-app/apk");
    await request(app).get("/api/tv-app/latest");
    expect(consultas()).toBe(1);
  });

  it("volta a consultar depois que a janela expira", async () => {
    // Só o relógio é falso: fingir setTimeout/setInterval derrubaria o
    // servidor HTTP que o supertest levanta a cada requisição.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      fetchMock.mockImplementation(github());
      const app = await buildApp();
      const { default: request } = await import("supertest");
      await request(app).get("/api/tv-app/latest");
      vi.setSystemTime(Date.now() + 6 * 60 * 1000);
      await request(app).get("/api/tv-app/latest");
      expect(consultas()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falha não fica em cache: a próxima visita tenta de novo", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET")).mockImplementation(github());
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/api/tv-app/apk")).status).toBe(503);
    expect((await request(app).get("/api/tv-app/apk")).status).toBe(302);
  });
});
