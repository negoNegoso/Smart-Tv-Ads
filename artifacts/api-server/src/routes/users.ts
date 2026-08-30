// artifacts/api-server/src/routes/users.ts
import { Router, type IRouter } from "express";
import { hashPassword } from "../lib/auth/password";
import {
  listUsers, createUser, updateUser, resetPassword, deleteUser,
} from "../lib/auth/user-store";

const router: IRouter = Router();

router.get("/users", async (_req, res) => {
  res.json(await listUsers());
});

router.post("/users", async (req, res) => {
  const { email, tempPassword, clientIds, advertiserIds } = (req.body ?? {}) as {
    email?: unknown; tempPassword?: unknown; clientIds?: unknown; advertiserIds?: unknown;
  };
  if (typeof email !== "string" || !email.includes("@") || typeof tempPassword !== "string" || tempPassword.length < 8) {
    res.status(400).json({ error: "Email inválido ou senha temporária muito curta (mín. 8)." });
    return;
  }
  const created = await createUser({
    email,
    passwordHash: hashPassword(tempPassword),
    clientIds: Array.isArray(clientIds) ? (clientIds as number[]) : [],
    advertiserIds: Array.isArray(advertiserIds) ? (advertiserIds as number[]) : [],
  });
  res.status(201).json(created);
});

router.patch("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { isActive, clientIds, advertiserIds } = (req.body ?? {}) as {
    isActive?: boolean; clientIds?: number[]; advertiserIds?: number[];
  };
  const updated = await updateUser(id, { isActive, clientIds, advertiserIds });
  if (!updated) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
  res.json(updated);
});

router.post("/users/:id/reset-password", async (req, res) => {
  const id = Number(req.params.id);
  const { tempPassword } = (req.body ?? {}) as { tempPassword?: unknown };
  if (!Number.isInteger(id) || typeof tempPassword !== "string" || tempPassword.length < 8) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }
  const ok = await resetPassword(id, hashPassword(tempPassword));
  if (!ok) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
  res.json({ ok: true });
});

router.delete("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const ok = await deleteUser(id);
  if (!ok) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
  res.sendStatus(204);
});

export default router;
