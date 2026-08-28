import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sid";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sign(exp: number, secret: string): string {
  return createHmac("sha256", secret).update(String(exp)).digest("base64url");
}

/** Token stateless: `<expEpochMs>.<hmacBase64url>`. Não carrega dados sensíveis. */
export function createSession(secret: string, now: number = Date.now()): string {
  const exp = now + SESSION_MAX_AGE_MS;
  return `${exp}.${sign(exp, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const exp = Number(token.slice(0, dot));
  if (!Number.isInteger(exp) || exp <= now) return false;

  const provided = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(exp, secret));
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
