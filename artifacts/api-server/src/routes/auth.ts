// artifacts/api-server/src/routes/auth.ts
import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, createSession } from "../lib/auth/session";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { findUserByEmail, setPassword } from "../lib/auth/user-store";
import { maxUploadBytes } from "../lib/upload-limit";

const router: IRouter = Router();

function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

function cookieOptions() {
  const secure = !!process.env.VERCEL || process.env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}

function isAdminLogin(username: string, password: string): boolean {
  return (
    safeEqual(username, process.env.ADMIN_USERNAME ?? "") &&
    safeEqual(password, process.env.ADMIN_PASSWORD ?? "")
  );
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  const secret = process.env.SESSION_SECRET ?? "";
  if (typeof username !== "string" || typeof password !== "string" || !secret) {
    res.status(401).json({ error: "Usuário ou senha inválidos." });
    return;
  }

  if (isAdminLogin(username, password)) {
    res.cookie(SESSION_COOKIE, createSession(secret, "admin"), {
      ...cookieOptions(),
      maxAge: SESSION_MAX_AGE_MS,
    });
    res.json({ ok: true, mustChangePassword: false });
    return;
  }

  const user = await findUserByEmail(username);
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Usuário ou senha inválidos." });
    return;
  }

  res.cookie(SESSION_COOKIE, createSession(secret, String(user.id)), {
    ...cookieOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
  res.json({ ok: true, mustChangePassword: user.mustChangePassword });
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  if (!req.auth || req.auth.isAdmin || !req.auth.user) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  const { currentPassword, newPassword } = (req.body ?? {}) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "Senha atual inválida ou nova senha muito curta (mín. 8)." });
    return;
  }
  const user = await findUserByEmail(req.auth.user.email);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: "Senha atual incorreta." });
    return;
  }
  await setPassword(user.id, hashPassword(newPassword));
  res.json({ ok: true });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ ok: true });
});

/**
 * maxUploadBytes viaja junto porque o painel valida o arquivo antes de subir.
 * O limite é configurável por MAX_UPLOAD_BYTES; um número fixo no cliente
 * rejeitaria localmente arquivos que o servidor aceitaria.
 */
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ authenticated: false });
    return;
  }
  if (req.auth.isAdmin) {
    res.json({
      authenticated: true,
      isAdmin: true,
      roles: ["admin"],
      clientIds: [],
      advertiserIds: [],
      mustChangePassword: false,
      maxUploadBytes: maxUploadBytes(),
    });
    return;
  }
  const u = req.auth.user!;
  const roles: string[] = [];
  if (u.advertiserIds.length > 0) roles.push("advertiser");
  if (u.clientIds.length > 0) roles.push("client");
  res.json({
    authenticated: true,
    isAdmin: false,
    roles,
    clientIds: u.clientIds,
    advertiserIds: u.advertiserIds,
    mustChangePassword: u.mustChangePassword,
    maxUploadBytes: maxUploadBytes(),
  });
});

export default router;
