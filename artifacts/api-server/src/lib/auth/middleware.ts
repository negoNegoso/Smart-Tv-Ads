import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession } from "./session";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SESSION_SECRET ?? "";
  const token = req.cookies?.[SESSION_COOKIE];
  if (!secret || !verifySession(token, secret)) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}
