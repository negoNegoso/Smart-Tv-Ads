// artifacts/api-server/src/lib/auth/session.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sid";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Subject = string; // "admin" ou o id numérico do usuário como string

interface Payload {
  exp: number;
  sub: Subject;
}

function encode(payload: Payload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Token stateless `<base64url(payload)>.<hmac>`. Não carrega dados sensíveis. */
export function createSession(
  secret: string,
  subject: Subject | number = "admin",
  now?: number,
): string {
  // Backward compatibility: if subject is a number, treat it as the old 'now' parameter
  let actualSubject: Subject = "admin";
  let actualNow: number;

  if (typeof subject === "number") {
    // Old signature: createSession(secret, now)
    actualNow = subject;
  } else {
    // New signature: createSession(secret, subject, now)
    actualSubject = subject;
    actualNow = now ?? Date.now();
  }

  const body = encode({ exp: actualNow + SESSION_MAX_AGE_MS, sub: actualSubject });
  return `${body}.${sign(body, secret)}`;
}

/** Retorna o subject se o token for válido e não expirado; senão null. */
export function sessionSubject(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): Subject | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(body, secret));
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== "string") return null;
  if (!Number.isInteger(payload.exp) || payload.exp <= now) return null;
  return payload.sub;
}

/** Compatibilidade: valida sem se importar com o subject. */
export function verifySession(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  return sessionSubject(token, secret, now) !== null;
}
