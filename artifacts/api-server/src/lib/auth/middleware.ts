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
    // Conta inexistente ou desativada: segue como anônimo, sem `req.auth`.
    //
    // Responder 401 aqui trancava o navegador: este middleware roda ANTES de
    // /auth/login, então um cookie assinado para um usuário que não existe mais
    // derrubava a própria tentativa de entrar — a mesma credencial funcionava
    // em outra máquina, que não tinha o cookie. Quem exige sessão são as
    // guardas adiante; elas devolvem 401 sozinhas.
    //
    // O cookie morto sai junto: mantê-lo faria o navegador repetir a viagem ao
    // banco a cada requisição, para nada.
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    next();
    return;
  }
  req.auth = {
    // Admin do banco tem o mesmo acesso do admin do env nas rotas de gestão.
    isAdmin: ctx.isAdmin,
    user: ctx,
    clientIds: ctx.clientIds,
    advertiserIds: ctx.advertiserIds,
  };
  next();
}

/** Exige admin: o do env (cookie "admin") ou usuário do banco com is_admin. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SESSION_SECRET ?? "";
  const sub = secret ? sessionSubject(req.cookies?.[SESSION_COOKIE], secret) : null;
  if (sub === "admin") {
    req.auth = { isAdmin: true, clientIds: [], advertiserIds: [] };
    next();
    return;
  }
  if (req.auth?.isAdmin && req.auth.user) {
    if (req.auth.user.mustChangePassword) {
      res.status(403).json({ error: "Troque a senha antes de continuar." });
      return;
    }
    next();
    return;
  }
  unauthorized(res);
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
