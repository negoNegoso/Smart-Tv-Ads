import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * announcements.ts fala com @workspace/db direto via drizzle (sem uma camada de
 * queries própria), então o mock reproduz só a parte da API que as rotas usam:
 * select().from().where() (e .orderBy() para a listagem), update().set().where().returning()
 * e delete().where().returning(). Mesma ideia do fakeTx em publish.test.ts, mas achatado.
 *
 * dbUpdate marca toda chamada a db.update(...), inclusive as do reorder, que
 * nunca chama .returning() — só faz `await ...where(...)` direto. É o único
 * jeito de provar "nada foi escrito" nesse caminho específico.
 */
const dbSelectWhere = vi.fn();
const dbUpdate = vi.fn();
const dbUpdateReturning = vi.fn();
const dbDeleteReturning = vi.fn();

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...a: unknown[]) => dbSelectWhere(...a),
        orderBy: () => Promise.resolve([]),
      }),
    }),
    update: (table: unknown) => {
      dbUpdate(table);
      return {
        set: (patch: unknown) => ({
          where: (_cond: unknown) => ({
            returning: () => dbUpdateReturning(patch),
            then: (resolve: (v: unknown) => void) => resolve(undefined),
          }),
        }),
      };
    },
    delete: (_table: unknown) => ({
      where: (_cond: unknown) => ({
        returning: () => dbDeleteReturning(),
      }),
    }),
  },
  announcementsTable: { id: "id", source: "source", isActive: "isActive", displayOrder: "displayOrder" },
}));

const put = vi.fn();
const remove = vi.fn();
vi.mock("../../lib/storage", () => ({ mediaStore: () => ({ put, remove }) }));

async function buildApp(): Promise<Express> {
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  const { default: express } = await import("express");
  const { default: router } = await import("../announcements");
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

const panelRow = {
  id: 1,
  title: "Cardápio do dia",
  displayText: null,
  showText: false,
  imageUrl: "/api/uploads/painel.png",
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  isActive: true,
  displayOrder: 0,
  source: "panel",
  duration: 10,
  createdAt: new Date(),
};

const adminRow = { ...panelRow, id: 2, source: "admin", imageUrl: null };

describe("peça gerada por painel não é editável no admin", () => {
  let app: Express;

  beforeEach(async () => {
    dbSelectWhere.mockReset();
    dbUpdate.mockReset();
    dbUpdateReturning.mockReset();
    dbDeleteReturning.mockReset();
    put.mockReset();
    remove.mockReset();
    app = await buildApp();
  });

  it("PATCH numa peça com source 'panel' responde 409 e não escreve", async () => {
    dbSelectWhere.mockResolvedValueOnce([panelRow]);
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/1").send({ title: "Novo título" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça gerada por painel do cliente. Edite o painel." });
    expect(dbUpdateReturning).not.toHaveBeenCalled();
  });

  it("PATCH numa peça com source 'admin' continua funcionando", async () => {
    dbSelectWhere.mockResolvedValueOnce([adminRow]);
    dbUpdateReturning.mockResolvedValueOnce([{ ...adminRow, title: "Novo título" }]);
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/2").send({ title: "Novo título" });
    expect(res.status).toBe(200);
    expect(dbUpdateReturning).toHaveBeenCalled();
  });

  it("PATCH /toggle numa peça com source 'panel' responde 409 e não escreve", async () => {
    dbSelectWhere.mockResolvedValueOnce([panelRow]);
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/1/toggle");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça gerada por painel do cliente. Edite o painel." });
    expect(dbUpdateReturning).not.toHaveBeenCalled();
  });

  it("PATCH /toggle numa peça com source 'admin' continua funcionando", async () => {
    dbSelectWhere.mockResolvedValueOnce([adminRow]);
    dbUpdateReturning.mockResolvedValueOnce([{ ...adminRow, isActive: false }]);
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/2/toggle");
    expect(res.status).toBe(200);
    expect(dbUpdateReturning).toHaveBeenCalled();
  });

  it("DELETE numa peça com source 'panel' responde 409 e não apaga", async () => {
    dbSelectWhere.mockResolvedValueOnce([panelRow]);
    const { default: request } = await import("supertest");
    const res = await request(app).delete("/announcements/1");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça gerada por painel do cliente. Edite o painel." });
    expect(dbDeleteReturning).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("DELETE numa peça com source 'admin' continua funcionando", async () => {
    dbSelectWhere.mockResolvedValueOnce([adminRow]);
    dbDeleteReturning.mockResolvedValueOnce([adminRow]);
    const { default: request } = await import("supertest");
    const res = await request(app).delete("/announcements/2");
    expect(res.status).toBe(204);
    expect(dbDeleteReturning).toHaveBeenCalled();
  });

  it("POST /announcements/reorder com um id de peça de painel no payload responde 409 e não escreve", async () => {
    // O payload inteiro é recusado mesmo que o id do painel não mude de
    // posição: reordenar qualquer coisa nesta lista teria que reescrever o
    // displayOrder de todo mundo incluído no array, e a peça de painel não
    // pode ter seu displayOrder alterado por aqui.
    dbSelectWhere.mockResolvedValueOnce([adminRow, panelRow]);
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/announcements/reorder")
      .send({ ids: [panelRow.id, adminRow.id] });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça gerada por painel do cliente. Edite o painel." });
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("POST /announcements/reorder sem id de painel continua funcionando", async () => {
    dbSelectWhere.mockResolvedValueOnce([adminRow]);
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/announcements/reorder")
      .send({ ids: [adminRow.id] });
    expect(res.status).toBe(200);
    expect(dbUpdate).toHaveBeenCalled();
  });
});
