import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSession,
  verifySession,
} from "../lib/auth/session";

const router: IRouter = Router();

/** Compara em tempo constante e sem vazar o comprimento (hash de tamanho fixo). */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

function cookieOptions() {
  const secure = !!process.env.VERCEL || process.env.NODE_ENV === "production";
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
}

router.post("/auth/login", (req, res) => {
  const { username, password } = (req.body ?? {}) as {
    username?: unknown;
    password?: unknown;
  };
  const secret = process.env.SESSION_SECRET ?? "";
  const ok =
    typeof username === "string" &&
    typeof password === "string" &&
    safeEqual(username, process.env.ADMIN_USERNAME ?? "") &&
    safeEqual(password, process.env.ADMIN_PASSWORD ?? "");

  if (!ok || !secret) {
    res.status(401).json({ error: "Usuário ou senha inválidos." });
    return;
  }

  res.cookie(SESSION_COOKIE, createSession(secret), {
    ...cookieOptions(),
    maxAge: SESSION_MAX_AGE_MS,
  });
  res.json({ ok: true });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ ok: true });
});

router.get("/auth/me", (req, res) => {
  const secret = process.env.SESSION_SECRET ?? "";
  const token = req.cookies?.[SESSION_COOKIE];
  if (!secret || !verifySession(token, secret)) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({ authenticated: true });
});

export default router;
