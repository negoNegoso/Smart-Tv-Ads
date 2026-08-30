// artifacts/api-server/src/lib/auth/middleware.ts
import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, sessionSubject } from "./session";
import type { AuthContext } from "./user-store";

export interface RequestAuth {
  isAdmin: boolean;
  user?: AuthContext;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: RequestAuth & {
        clientIds: number[];
        advertiserIds: number[];
      };
    }
  }
}

function unauthorized(res: Response): void {
  res.status(401).json({ error: "Não autenticado." });
}

/**
 * Resolve o cookie de sessão e anexa `req.auth`.
 * Admin (env) -> { isAdmin: true }. Usuário -> carrega contexto via user-store.
 * Não bloqueia por si só (exceto usuário desativado); as guardas decidem o acesso.
 */
export async function loadSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = process.env.SESSION_SECRET ?? "";
  const sub = secret ? sessionSubject(req.cookies?.[SESSION_COOKIE], secret) : null;
  if (!sub) {
    next();
    return;
  }
  if (sub === "admin") {
    req.auth = { isAdmin: true, clientIds: [], advertiserIds: [] };
    next();
    return;
  }
  const id = Number(sub);
  if (!Number.isInteger(id)) {
    next();
    return;
  }
  const { loadAuthContext } = await import("./user-store");
  const ctx = await loadAuthContext(id);
  if (!ctx || !ctx.isActive) {
    // Conta inexistente ou desativada: trata como não autenticado.
    unauthorized(res);
    return;
  }
  req.auth = {
    isAdmin: false,
    user: ctx,
    clientIds: ctx.clientIds,
    advertiserIds: ctx.advertiserIds,
  };
  next();
}

/** Exige sessão de admin (comportamento legado; usado nas rotas de gestão). */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SESSION_SECRET ?? "";
  const sub = secret ? sessionSubject(req.cookies?.[SESSION_COOKIE], secret) : null;
  if (sub !== "admin") {
    unauthorized(res);
    return;
  }
  req.auth = { isAdmin: true, clientIds: [], advertiserIds: [] };
  next();
}

/** Exige sessão válida (admin ou usuário). Requer loadSession antes. */
export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    unauthorized(res);
    return;
  }
  next();
}

function forbidden(res: Response): void {
  res.status(403).json({ error: "Sem permissão." });
}

/** Exige vínculo de anunciante (ou admin). Requer loadSession antes. */
export function requireAdvertiser(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    unauthorized(res);
    return;
  }
  if (req.auth.isAdmin) {
    next();
    return;
  }
  if (req.auth.advertiserIds.length === 0) {
    forbidden(res);
    return;
  }
  next();
}

/** Exige vínculo de cliente (ou admin). Requer loadSession antes. */
export function requireClient(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    unauthorized(res);
    return;
  }
  if (req.auth.isAdmin) {
    next();
    return;
  }
  if (req.auth.clientIds.length === 0) {
    forbidden(res);
    return;
  }
  next();
}
