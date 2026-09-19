import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QR que a TV não vinculada mostra. O device ainda não existe, então a rota
 * não pode depender do banco — só da key, validada por formato.
 */
const toBuffer = vi.fn();

vi.mock("qrcode", async (importOriginal) => {
  const real = (await importOriginal()) as { default: { toBuffer: (...a: unknown[]) => Promise<Buffer> } };
  return {
    default: {
      toBuffer: (...args: unknown[]) => {
        toBuffer(...args);
        return real.default.toBuffer(...args);
      },
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: { select: () => { throw new Error("QR de pareamento não deve consultar o banco"); } },
  campaignAnnouncementsTable: { id: "id", scanCode: "scanCode" },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../qr");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

beforeEach(() => {
  toBuffer.mockReset();
  process.env.PUBLIC_BASE_URL = "https://painel.test";
});

describe("GET /qr/pair/:key.png", () => {
  it("gera PNG apontando para /parear/KEY", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/qr/pair/A1B2C3D4E5F6A7B8.png");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(toBuffer.mock.calls[0][0]).toBe("https://painel.test/parear/A1B2C3D4E5F6A7B8");
  });

  it("normaliza minúsculas e traços", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/qr/pair/a1b2-c3d4-e5f6-a7b8.png");

    expect(res.status).toBe(200);
    expect(toBuffer.mock.calls[0][0]).toBe("https://painel.test/parear/A1B2C3D4E5F6A7B8");
  });

  it("key inválida dá 404", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    expect((await request(app).get("/qr/pair/CURTA.png")).status).toBe(404);
    expect((await request(app).get("/qr/pair/A1B2C3D4E5F6A7B8.jpg")).status).toBe(404);
  });
});
