// artifacts/api-server/src/routes/users.ts
import { Router, type IRouter } from "express";
import { hashPassword } from "../lib/auth/password";
import {
  listUsers, createUser, updateUser, resetPassword, deleteUser, LastAdminError,
} from "../lib/auth/user-store";

const router: IRouter = Router();

function nameOf(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

router.get("/users", async (_req, res) => {
  res.json(await listUsers());
});

router.post("/users", async (req, res) => {
  const { email, tempPassword, name, isAdmin, clientIds, advertiserIds } = (req.body ?? {}) as {
    email?: unknown; tempPassword?: unknown; name?: unknown; isAdmin?: unknown; clientIds?: unknown; advertiserIds?: unknown;
  };
  if (typeof email !== "string" || !email.includes("@") || typeof tempPassword !== "string" || tempPassword.length < 8) {
    res.status(400).json({ error: "Email inválido ou senha temporária muito curta (mín. 8)." });
    return;
  }
  const created = await createUser({
    email,
    passwordHash: hashPassword(tempPassword),
    name: nameOf(name) ?? null,
    isAdmin: isAdmin === true,
    clientIds: Array.isArray(clientIds) ? (clientIds as number[]) : [],
    advertiserIds: Array.isArray(advertiserIds) ? (advertiserIds as number[]) : [],
  });
  res.status(201).json(created);
});

router.patch("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { name, isAdmin, isActive, clientIds, advertiserIds } = (req.body ?? {}) as {
    name?: unknown; isAdmin?: boolean; isActive?: boolean; clientIds?: number[]; advertiserIds?: number[];
  };
  try {
    const updated = await updateUser(id, { name: nameOf(name), isAdmin, isActive, clientIds, advertiserIds });
    if (!updated) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.json(updated);
  } catch (err) {
    if (err instanceof LastAdminError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
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
  try {
    const ok = await deleteUser(id);
    if (!ok) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.sendStatus(204);
  } catch (err) {
    if (err instanceof LastAdminError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
});

export default router;
