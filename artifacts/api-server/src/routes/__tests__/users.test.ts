import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = { listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetPassword: vi.fn(), deleteUser: vi.fn() };
vi.mock("../../lib/auth/user-store", () => {
  class LastAdminError extends Error {
    constructor() {
      super("Não dá para remover o último administrador ativo.");
    }
  }
  return {
    listUsers: (...a: unknown[]) => store.listUsers(...a),
    createUser: (...a: unknown[]) => store.createUser(...a),
    updateUser: (...a: unknown[]) => store.updateUser(...a),
    resetPassword: (...a: unknown[]) => store.resetPassword(...a),
    deleteUser: (...a: unknown[]) => store.deleteUser(...a),
    LastAdminError,
  };
});

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: usersRouter } = await import("../users");
  const app = express();
  app.use(express.json());
  app.use(usersRouter);
  return app;
}

describe("rotas de usuários", () => {
  beforeEach(() => Object.values(store).forEach((fn) => fn.mockReset()));

  it("cria com nome e admin", async () => {
    store.createUser.mockResolvedValue({ id: 1 });
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/users")
      .send({ email: "yuri@ex.com", tempPassword: "12345678", name: " Yuri ", isAdmin: true });
    expect(res.status).toBe(201);
    expect(store.createUser).toHaveBeenCalledWith(expect.objectContaining({ name: "Yuri", isAdmin: true }));
  });

  it("rebaixar o último admin é 409", async () => {
    const { LastAdminError } = await import("../../lib/auth/user-store");
    store.updateUser.mockRejectedValue(new LastAdminError());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/users/1").send({ isAdmin: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Não dá para remover o último administrador ativo.");
  });

  it("apagar o último admin é 409", async () => {
    const { LastAdminError } = await import("../../lib/auth/user-store");
    store.deleteUser.mockRejectedValue(new LastAdminError());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).delete("/users/1");
    expect(res.status).toBe(409);
  });
});
