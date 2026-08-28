import type { Express } from "express";
import { beforeAll, describe, expect, it } from "vitest";

// The announcements router imports @workspace/db, which throws unless
// DATABASE_URL is set, and reads MAX_UPLOAD_BYTES at module scope to size the
// multer limit. Both must exist before the dynamic import runs. The 413 and 400
// branches short-circuit before any query, so a dummy connection string that is
// never dialed is enough — no database is required.
async function buildApp(): Promise<Express> {
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  process.env.MAX_UPLOAD_BYTES = "4000000";
  const { default: express } = await import("express");
  const { default: router } = await import("../announcements");
  const app = express();
  app.use(router);
  return app;
}

describe("uploadImage no POST /announcements", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("responde 413 quando a imagem excede o limite configurado", async () => {
    const { default: request } = await import("supertest");
    const oversized = Buffer.alloc(4000001, 0);
    const res = await request(app)
      .post("/announcements")
      .attach("image", oversized, { filename: "grande.png", contentType: "image/png" });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "Imagem acima do limite de 4 MB." });
  });

  it("responde 400 quando o arquivo não é uma imagem", async () => {
    const { default: request } = await import("supertest");
    const notAnImage = Buffer.from("texto qualquer");
    const res = await request(app)
      .post("/announcements")
      .attach("image", notAnImage, { filename: "arquivo.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Apenas arquivos de imagem são aceitos." });
  });
});
