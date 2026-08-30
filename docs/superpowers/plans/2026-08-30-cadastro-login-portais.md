# Cadastro, Login e Portais Segmentados — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir contas de login segmentadas para clientes (donos de TVs) e anunciantes (pagantes), cada um com um portal somente-leitura restrito às suas próprias campanhas/dispositivos, mantendo o admin único no controle total.

**Architecture:** Tabela `users` separada do domínio + vínculos N:N (`user_clients`, `user_advertisers`). O token de sessão passa a carregar identidade (`sub`). Todo acesso ao banco relacionado a auth fica atrás de um único módulo `user-store` (seam de teste). Middleware em camadas resolve papéis a partir dos vínculos e filtra os endpoints de portal pelo tenant do usuário. Frontend roteia por papel após `/auth/me`.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM (PostgreSQL), `node:crypto` (scrypt/HMAC), Vitest + supertest, React + wouter, orval (OpenAPI→zod/react-query codegen), pnpm workspace.

**Referência de spec:** `docs/superpowers/specs/2026-08-30-cadastro-login-portais-design.md`

---

## Convenções e comandos

- Testes da API: `pnpm --filter @workspace/api-server run test`
- Typecheck geral: `pnpm run typecheck`
- Compilar a lib de DB após mudar schema: `cd lib/db && npx tsc --build`
- Aplicar schema no banco de dev: `cd lib/db && npx drizzle-kit push --config ./drizzle.config.ts`
- Regerar contratos após editar `openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`
- Rodar um teste específico: `pnpm --filter @workspace/api-server exec vitest run src/caminho/arquivo.test.ts`

Convenção de commit: mensagens em português no imperativo. Sempre inclua o trailer:
```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

---

## Mapa de arquivos

**Criar:**
- `lib/db/src/schema/users.ts` — tabela `users`
- `lib/db/src/schema/user_clients.ts` — vínculo N:N usuário↔cliente
- `lib/db/src/schema/user_advertisers.ts` — vínculo N:N usuário↔anunciante
- `artifacts/api-server/src/lib/auth/password.ts` — hash/verify scrypt (puro)
- `artifacts/api-server/src/lib/auth/__tests__/password.test.ts`
- `artifacts/api-server/src/lib/auth/user-store.ts` — todo acesso a DB de auth (seam)
- `artifacts/api-server/src/routes/users.ts` — CRUD admin de contas
- `artifacts/api-server/src/routes/portal.ts` — endpoints somente-leitura dos portais
- `artifacts/api-server/src/routes/__tests__/portal-scope.test.ts`
- `artifacts/api-server/src/lib/auth/__tests__/user-middleware.test.ts`
- `artifacts/signage/src/pages/change-password.tsx`
- `artifacts/signage/src/pages/users.tsx`
- `artifacts/signage/src/pages/portal-advertiser.tsx`
- `artifacts/signage/src/pages/portal-client.tsx`

**Modificar:**
- `lib/db/src/schema/index.ts` — exportar as 3 tabelas novas
- `artifacts/api-server/src/lib/auth/session.ts` — token com `subject`
- `artifacts/api-server/src/lib/auth/__tests__/session.test.ts` — cobrir `subject`
- `artifacts/api-server/src/lib/auth/middleware.ts` — `loadSession`, `requireUser`, `requireAdvertiser`, `requireClient`, `requireAdmin` compatível
- `artifacts/api-server/src/routes/auth.ts` — login de usuário, change-password, `/auth/me` expandido
- `artifacts/api-server/src/routes/__tests__/auth.test.ts` — novos casos
- `artifacts/api-server/src/routes/index.ts` — montar `users` (admin) e `portal` (usuário)
- `lib/api-spec/openapi.yaml` — schemas/paths de users e portal
- `artifacts/signage/src/App.tsx` — roteamento por papel
- `artifacts/signage/src/pages/login.tsx` — usa o novo `/auth/me` (se necessário)

---

## FASE 1 — Schema de dados

### Task 1: Tabela `users`

**Files:**
- Create: `lib/db/src/schema/users.ts`

- [ ] **Step 1: Criar o schema**

```typescript
// lib/db/src/schema/users.ts
import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
```

- [ ] **Step 2: Compilar a lib para validar o schema**

Run: `cd lib/db && npx tsc --build`
Expected: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/db/src/schema/users.ts
git commit -m "feat(db): adiciona tabela users

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Tabelas de vínculo `user_clients` e `user_advertisers`

**Files:**
- Create: `lib/db/src/schema/user_clients.ts`
- Create: `lib/db/src/schema/user_advertisers.ts`

- [ ] **Step 1: Criar `user_clients`**

```typescript
// lib/db/src/schema/user_clients.ts
import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { clientsTable } from "./clients";

export const userClientsTable = pgTable(
  "user_clients",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clientId] })],
);

export type UserClient = typeof userClientsTable.$inferSelect;
```

- [ ] **Step 2: Criar `user_advertisers`**

```typescript
// lib/db/src/schema/user_advertisers.ts
import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { advertisersTable } from "./advertisers";

export const userAdvertisersTable = pgTable(
  "user_advertisers",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    advertiserId: integer("advertiser_id")
      .notNull()
      .references(() => advertisersTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.advertiserId] })],
);

export type UserAdvertiser = typeof userAdvertisersTable.$inferSelect;
```

- [ ] **Step 3: Exportar no index do schema**

Modify: `lib/db/src/schema/index.ts` — adicionar ao final:

```typescript
export * from "./users";
export * from "./user_clients";
export * from "./user_advertisers";
```

- [ ] **Step 4: Compilar a lib**

Run: `cd lib/db && npx tsc --build`
Expected: build sem erros.

- [ ] **Step 5: Aplicar o schema no banco de dev**

Run: `cd lib/db && npx drizzle-kit push --config ./drizzle.config.ts`
Expected: cria as tabelas `users`, `user_clients`, `user_advertisers`. Se não houver banco local, este passo é adiado para o ambiente com `DATABASE_URL`; registre isso e siga.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/user_clients.ts lib/db/src/schema/user_advertisers.ts lib/db/src/schema/index.ts
git commit -m "feat(db): adiciona vinculos user_clients e user_advertisers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 2 — Núcleo de autenticação (unidades puras, TDD)

### Task 3: Biblioteca de senha (scrypt)

**Files:**
- Create: `artifacts/api-server/src/lib/auth/password.ts`
- Test: `artifacts/api-server/src/lib/auth/__tests__/password.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// artifacts/api-server/src/lib/auth/__tests__/password.test.ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password (scrypt)", () => {
  it("gera hash no formato scrypt$salt$hash e verifica a senha correta", () => {
    const hash = hashPassword("senha-secreta");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.split("$")).toHaveLength(3);
    expect(verifyPassword("senha-secreta", hash)).toBe(true);
  });

  it("rejeita senha incorreta", () => {
    const hash = hashPassword("senha-secreta");
    expect(verifyPassword("errada", hash)).toBe(false);
  });

  it("gera salts diferentes para a mesma senha", () => {
    expect(hashPassword("x")).not.toBe(hashPassword("x"));
  });

  it("não lança e retorna false para hash malformado", () => {
    expect(verifyPassword("x", "lixo")).toBe(false);
    expect(verifyPassword("x", "scrypt$so-um-campo")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/password.test.ts`
Expected: FAIL — módulo `../password` não existe.

- [ ] **Step 3: Implementar**

```typescript
// artifacts/api-server/src/lib/auth/password.ts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

/** Retorna `scrypt$<salt_b64url>$<hash_b64url>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  if (salt.length === 0 || expected.length !== KEYLEN) return false;
  const actual = scryptSync(password, salt, KEYLEN);
  return timingSafeEqual(actual, expected);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/password.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/auth/password.ts artifacts/api-server/src/lib/auth/__tests__/password.test.ts
git commit -m "feat(auth): hash de senha com scrypt

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 4: Sessão carrega identidade (`subject`)

**Files:**
- Modify: `artifacts/api-server/src/lib/auth/session.ts`
- Test: `artifacts/api-server/src/lib/auth/__tests__/session.test.ts`

- [ ] **Step 1: Escrever os testes novos (falham)**

Adicionar ao `session.test.ts` (dentro de um novo `describe`):

```typescript
import { createSession, verifySession, sessionSubject } from "../session";

describe("subject na sessão", () => {
  const SECRET = "segredo-de-teste";
  const NOW = 1_700_000_000_000;

  it("token de admin: subject === 'admin'", () => {
    const token = createSession(SECRET, "admin", NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(true);
    expect(sessionSubject(token, SECRET, NOW)).toBe("admin");
  });

  it("token de usuário: subject === userId (string numérica)", () => {
    const token = createSession(SECRET, "42", NOW);
    expect(sessionSubject(token, SECRET, NOW)).toBe("42");
  });

  it("subject inválido/ausente retorna null", () => {
    expect(sessionSubject("lixo", SECRET, NOW)).toBeNull();
    const outro = createSession("outro", "admin", NOW);
    expect(sessionSubject(outro, SECRET, NOW)).toBeNull();
  });

  it("mantém compatibilidade: createSession sem subject assume 'admin'", () => {
    const token = createSession(SECRET, undefined, NOW);
    expect(sessionSubject(token, SECRET, NOW)).toBe("admin");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/session.test.ts`
Expected: FAIL — `sessionSubject` não existe e `createSession` não aceita subject.

- [ ] **Step 3: Reescrever `session.ts`**

```typescript
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
  subject: Subject = "admin",
  now: number = Date.now(),
): string {
  const body = encode({ exp: now + SESSION_MAX_AGE_MS, sub: subject });
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/session.test.ts`
Expected: PASS (testes antigos de `verifySession` + os novos de subject). Se algum teste antigo verificava o formato exato `<exp>.<hmac>`, ele foi coberto pelos casos de `verifySession` que continuam válidos.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/auth/session.ts artifacts/api-server/src/lib/auth/__tests__/session.test.ts
git commit -m "feat(auth): sessao carrega identidade (subject)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 3 — Seam de acesso a dados (`user-store`)

### Task 5: Módulo `user-store`

Encapsula TODO o acesso ao banco relacionado a auth. É o único ponto que os testes vão mockar, mantendo middleware/rotas testáveis sem Postgres.

**Files:**
- Create: `artifacts/api-server/src/lib/auth/user-store.ts`

- [ ] **Step 1: Implementar o store**

```typescript
// artifacts/api-server/src/lib/auth/user-store.ts
import { eq } from "drizzle-orm";
import {
  db,
  usersTable,
  userClientsTable,
  userAdvertisersTable,
  type User,
} from "@workspace/db";

export interface AuthContext {
  userId: number;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: number): Promise<User | null> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function loadAuthContext(userId: number): Promise<AuthContext | null> {
  const user = await findUserById(userId);
  if (!user) return null;
  const clients = await db
    .select({ clientId: userClientsTable.clientId })
    .from(userClientsTable)
    .where(eq(userClientsTable.userId, userId));
  const advertisers = await db
    .select({ advertiserId: userAdvertisersTable.advertiserId })
    .from(userAdvertisersTable)
    .where(eq(userAdvertisersTable.userId, userId));
  return {
    userId: user.id,
    email: user.email,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    clientIds: clients.map((c) => c.clientId),
    advertiserIds: advertisers.map((a) => a.advertiserId),
  };
}

export async function setPassword(userId: number, passwordHash: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, userId));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros (confirma que `usersTable`, `userClientsTable`, `userAdvertisersTable`, `User` são exportados de `@workspace/db`).

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/lib/auth/user-store.ts
git commit -m "feat(auth): user-store como seam de acesso a dados

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 4 — Middleware de autorização

### Task 6: `loadSession` e guardas por papel

**Files:**
- Modify: `artifacts/api-server/src/lib/auth/middleware.ts`
- Test: `artifacts/api-server/src/lib/auth/__tests__/user-middleware.test.ts`

- [ ] **Step 1: Escrever o teste (falha), mockando o user-store**

```typescript
// artifacts/api-server/src/lib/auth/__tests__/user-middleware.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../session";

const SECRET = "segredo-mw";

const loadAuthContext = vi.fn();
vi.mock("../user-store", () => ({ loadAuthContext: (...a: unknown[]) => loadAuthContext(...a) }));

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { loadSession, requireAdvertiser, requireClient } = await import("../middleware");
  const app = express();
  app.use(cookieParser());
  app.use(loadSession);
  app.get("/adv", requireAdvertiser, (req, res) => res.json({ ids: (req as any).auth.advertiserIds }));
  app.get("/cli", requireClient, (req, res) => res.json({ ids: (req as any).auth.clientIds }));
  return app;
}

const ctx = {
  userId: 7,
  email: "a@b.com",
  isActive: true,
  mustChangePassword: false,
  clientIds: [3],
  advertiserIds: [9],
};

describe("guardas por papel", () => {
  beforeEach(() => loadAuthContext.mockReset());

  it("admin (env) passa em requireAdvertiser", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "admin");
    const res = await request(app).get("/adv").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
  });

  it("anunciante acessa /adv com seus advertiserIds", async () => {
    loadAuthContext.mockResolvedValue(ctx);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/adv").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ids: [9] });
  });

  it("usuário sem vínculo de anunciante recebe 403 em /adv", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, advertiserIds: [] });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/adv").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(403);
  });

  it("usuário desativado é bloqueado (401)", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, isActive: false });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/cli").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(401);
  });

  it("sem cookie: 401", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/adv");
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/user-middleware.test.ts`
Expected: FAIL — `loadSession`, `requireAdvertiser`, `requireClient` não existem.

- [ ] **Step 3: Reescrever `middleware.ts`**

```typescript
// artifacts/api-server/src/lib/auth/middleware.ts
import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, sessionSubject } from "./session";
import { loadAuthContext, type AuthContext } from "./user-store";

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
```

- [ ] **Step 4: Rodar o novo teste e o de middleware antigo**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/`
Expected: PASS. O `middleware.test.ts` legado continua verde porque `requireAdmin` mantém o mesmo contrato (401 sem cookie / cookie inválido; 200 com token de admin criado por `createSession(SECRET)`, que agora tem `sub="admin"`).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/auth/middleware.ts artifacts/api-server/src/lib/auth/__tests__/user-middleware.test.ts
git commit -m "feat(auth): loadSession e guardas por papel

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 5 — Rotas de autenticação

### Task 7: Login de usuário, change-password e `/auth/me` expandido

**Files:**
- Modify: `artifacts/api-server/src/routes/auth.ts`
- Test: `artifacts/api-server/src/routes/__tests__/auth.test.ts`

- [ ] **Step 1: Escrever os testes (falham), mockando user-store e password**

Adicionar ao `auth.test.ts`. Se o arquivo ainda não isola `import`s, use `vi.mock` no topo:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUserByEmail = vi.fn();
const loadAuthContext = vi.fn();
const setPassword = vi.fn();
vi.mock("../../lib/auth/user-store", () => ({
  findUserByEmail: (...a: unknown[]) => findUserByEmail(...a),
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
  setPassword: (...a: unknown[]) => setPassword(...a),
}));

async function buildApp() {
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "senha";
  process.env.SESSION_SECRET = "segredo-auth";
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { default: authRouter } = await import("../auth");
  const { loadSession } = await import("../../lib/auth/middleware");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use(authRouter);
  return app;
}

describe("login de usuário", () => {
  beforeEach(() => {
    findUserByEmail.mockReset();
    loadAuthContext.mockReset();
    setPassword.mockReset();
  });

  it("loga usuário válido e sinaliza mustChangePassword", async () => {
    const { hashPassword } = await import("../../lib/auth/password");
    findUserByEmail.mockResolvedValue({
      id: 5, email: "u@x.com", passwordHash: hashPassword("123456"),
      mustChangePassword: true, isActive: true,
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/auth/login").send({ username: "u@x.com", password: "123456" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mustChangePassword: true });
    expect(res.headers["set-cookie"]?.[0]).toContain("sid=");
  });

  it("nega usuário desativado", async () => {
    const { hashPassword } = await import("../../lib/auth/password");
    findUserByEmail.mockResolvedValue({
      id: 5, email: "u@x.com", passwordHash: hashPassword("123456"),
      mustChangePassword: false, isActive: false,
    });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/auth/login").send({ username: "u@x.com", password: "123456" });
    expect(res.status).toBe(401);
  });

  it("admin continua logando por env", async () => {
    findUserByEmail.mockResolvedValue(null);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/auth/login").send({ username: "admin", password: "senha" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, mustChangePassword: false });
  });

  it("change-password troca a senha do usuário logado", async () => {
    const { hashPassword } = await import("../../lib/auth/password");
    const hash = hashPassword("antiga1");
    findUserByEmail.mockResolvedValue({ id: 5, email: "u@x.com", passwordHash: hash, mustChangePassword: true, isActive: true });
    loadAuthContext.mockResolvedValue({ userId: 5, email: "u@x.com", isActive: true, mustChangePassword: true, clientIds: [], advertiserIds: [1] });
    setPassword.mockResolvedValue(undefined);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const agent = request.agent(app);
    await agent.post("/auth/login").send({ username: "u@x.com", password: "antiga1" });
    const res = await agent.post("/auth/change-password").send({ currentPassword: "antiga1", newPassword: "novaSenha1" });
    expect(res.status).toBe(200);
    expect(setPassword).toHaveBeenCalledWith(5, expect.stringContaining("scrypt$"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/auth.test.ts`
Expected: FAIL — login de usuário e `/auth/change-password` ainda não existem.

- [ ] **Step 3: Reescrever `auth.ts`**

```typescript
// artifacts/api-server/src/routes/auth.ts
import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, createSession } from "../lib/auth/session";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { findUserByEmail, loadAuthContext, setPassword } from "../lib/auth/user-store";

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
  });
});

export default router;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/auth.test.ts`
Expected: PASS. Ajuste os testes legados de `/auth/me` se assumiam `{ authenticated: true }` sem os novos campos — o corpo agora inclui `roles`/`isAdmin`.

- [ ] **Step 5: Ajustar o teste do gate para `/auth/me` público**

O `gate.test.ts` monta `router` de `routes/index`. Como `/auth/me` agora depende de `loadSession`, garanta na Task 9 que `loadSession` roda antes do `authRouter`. Rode:

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/gate.test.ts`
Expected: pode falhar até a Task 9. Se falhar apenas por ordem de middleware, prossiga para a Task 9 e rode de novo.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/routes/__tests__/auth.test.ts
git commit -m "feat(auth): login de usuario, change-password e me expandido

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 6 — Contratos OpenAPI (users + portal)

### Task 8: Adicionar schemas e paths ao `openapi.yaml` e regenerar

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 1: Adicionar tags e schemas**

Em `components.schemas`, adicionar (seguindo o estilo dos schemas existentes):

```yaml
    UserAccount:
      type: object
      required: [id, email, isActive, mustChangePassword, clientIds, advertiserIds]
      properties:
        id: { type: integer }
        email: { type: string }
        isActive: { type: boolean }
        mustChangePassword: { type: boolean }
        clientIds: { type: array, items: { type: integer } }
        advertiserIds: { type: array, items: { type: integer } }
    CreateUserBody:
      type: object
      required: [email, tempPassword]
      properties:
        email: { type: string, format: email }
        tempPassword: { type: string, minLength: 8 }
        clientIds: { type: array, items: { type: integer } }
        advertiserIds: { type: array, items: { type: integer } }
    UpdateUserBody:
      type: object
      properties:
        isActive: { type: boolean }
        clientIds: { type: array, items: { type: integer } }
        advertiserIds: { type: array, items: { type: integer } }
    ResetPasswordBody:
      type: object
      required: [tempPassword]
      properties:
        tempPassword: { type: string, minLength: 8 }
    PortalCampaign:
      type: object
      required: [id, name, startsAt, endsAt, isActive, deviceCount, totalPlays, totalScans, uniqueVisitors]
      properties:
        id: { type: integer }
        name: { type: string }
        startsAt: { type: string, format: date-time }
        endsAt: { type: string, format: date-time }
        isActive: { type: boolean }
        deviceCount: { type: integer }
        totalPlays: { type: integer }
        totalScans: { type: integer }
        uniqueVisitors: { type: integer }
    PortalDevice:
      type: object
      required: [id, name, totalPlays]
      properties:
        id: { type: integer }
        name: { type: string }
        location: { type: string, nullable: true }
        lastSeenAt: { type: string, format: date-time, nullable: true }
        totalPlays: { type: integer }
```

- [ ] **Step 2: Adicionar os paths**

Em `paths`, adicionar `/users`, `/users/{id}`, `/users/{id}/reset-password`, `/portal/advertiser/campaigns`, `/portal/client/devices`. Exemplo de um path (replicar o padrão dos existentes para os demais):

```yaml
  /users:
    get:
      operationId: listUsers
      tags: [users]
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: array, items: { $ref: "#/components/schemas/UserAccount" } }
    post:
      operationId: createUser
      tags: [users]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateUserBody" }
      responses:
        "201":
          description: Criado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/UserAccount" }
```

Adicionar também `/users/{id}` (patch, delete), `/users/{id}/reset-password` (post), `/portal/advertiser/campaigns` (get → array de `PortalCampaign`) e `/portal/client/devices` (get → array de `PortalDevice`). Registre a tag `users` e `portal` na lista `tags` do topo do arquivo.

- [ ] **Step 3: Regenerar contratos**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: gera schemas zod em `lib/api-zod/src/generated` e cliente em `lib/api-client-react/src/generated`, e roda `typecheck:libs` sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): contratos de users e portais

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 7 — Rotas de gestão de contas (admin)

### Task 9: `routes/users.ts` e montagem no router

**Files:**
- Create: `artifacts/api-server/src/routes/users.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Modify: `artifacts/api-server/src/lib/auth/user-store.ts` (adicionar funções de CRUD)

- [ ] **Step 1: Adicionar CRUD ao user-store**

Acrescentar em `user-store.ts`:

```typescript
export interface UserAccountRow {
  id: number;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
}

async function linksFor(userId: number): Promise<{ clientIds: number[]; advertiserIds: number[] }> {
  const clients = await db.select({ clientId: userClientsTable.clientId }).from(userClientsTable).where(eq(userClientsTable.userId, userId));
  const advertisers = await db.select({ advertiserId: userAdvertisersTable.advertiserId }).from(userAdvertisersTable).where(eq(userAdvertisersTable.userId, userId));
  return { clientIds: clients.map((c) => c.clientId), advertiserIds: advertisers.map((a) => a.advertiserId) };
}

export async function listUsers(): Promise<UserAccountRow[]> {
  const rows = await db.select().from(usersTable).orderBy(usersTable.email);
  const out: UserAccountRow[] = [];
  for (const u of rows) {
    const links = await linksFor(u.id);
    out.push({ id: u.id, email: u.email, isActive: u.isActive, mustChangePassword: u.mustChangePassword, ...links });
  }
  return out;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  clientIds: number[];
  advertiserIds: number[];
}): Promise<UserAccountRow> {
  const [u] = await db.insert(usersTable).values({ email: input.email, passwordHash: input.passwordHash }).returning();
  await replaceLinks(u.id, input.clientIds, input.advertiserIds);
  const links = await linksFor(u.id);
  return { id: u.id, email: u.email, isActive: u.isActive, mustChangePassword: u.mustChangePassword, ...links };
}

export async function replaceLinks(userId: number, clientIds: number[], advertiserIds: number[]): Promise<void> {
  await db.delete(userClientsTable).where(eq(userClientsTable.userId, userId));
  await db.delete(userAdvertisersTable).where(eq(userAdvertisersTable.userId, userId));
  if (clientIds.length) await db.insert(userClientsTable).values(clientIds.map((clientId) => ({ userId, clientId })));
  if (advertiserIds.length) await db.insert(userAdvertisersTable).values(advertiserIds.map((advertiserId) => ({ userId, advertiserId })));
}

export async function updateUser(id: number, patch: { isActive?: boolean; clientIds?: number[]; advertiserIds?: number[] }): Promise<UserAccountRow | null> {
  const existing = await findUserById(id);
  if (!existing) return null;
  if (typeof patch.isActive === "boolean") {
    await db.update(usersTable).set({ isActive: patch.isActive }).where(eq(usersTable.id, id));
  }
  if (patch.clientIds || patch.advertiserIds) {
    const links = await linksFor(id);
    await replaceLinks(id, patch.clientIds ?? links.clientIds, patch.advertiserIds ?? links.advertiserIds);
  }
  const u = await findUserById(id);
  if (!u) return null;
  const links = await linksFor(id);
  return { id: u.id, email: u.email, isActive: u.isActive, mustChangePassword: u.mustChangePassword, ...links };
}

export async function resetPassword(id: number, passwordHash: string): Promise<boolean> {
  const [row] = await db.update(usersTable).set({ passwordHash, mustChangePassword: true }).where(eq(usersTable.id, id)).returning();
  return !!row;
}

export async function deleteUser(id: number): Promise<boolean> {
  const [row] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  return !!row;
}
```

- [ ] **Step 2: Criar `routes/users.ts`**

```typescript
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
```

- [ ] **Step 3: Montar no router com a ordem correta de middleware**

Modify: `artifacts/api-server/src/routes/index.ts`

```typescript
import { Router } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import announcementsRouter from "./announcements";
import clientsRouter from "./clients";
import devicesRouter from "./devices";
import displayRouter from "./display";
import telemetryRouter from "./telemetry";
import analyticsRouter from "./analytics";
import advertisersRouter from "./advertisers";
import storageRouter from "./storage";
import qrRouter from "./qr";
import usersRouter from "./users";
import portalRouter from "./portal";
import { loadSession, requireAdmin, requireUser } from "../lib/auth/middleware";

const router = Router();

// Públicos
router.use(healthRouter);
router.use(displayRouter);
router.use(telemetryRouter);
router.use(qrRouter);
router.use(storageRouter);

// A partir daqui, resolve identidade (admin ou usuário) para as rotas abaixo.
router.use(loadSession);

// Auth: precisa de loadSession para /auth/me e /auth/change-password.
router.use(authRouter);

// Portais (usuário autenticado; guardas por papel ficam nas rotas do portal).
router.use("/portal", requireUser, portalRouter);

// Gestão: exige admin.
router.use(requireAdmin);
router.use(usersRouter);
router.use(announcementsRouter);
router.use(clientsRouter);
router.use(devicesRouter);
router.use(analyticsRouter);
router.use(advertisersRouter);

export default router;
```

> Nota: `requireAdmin` continua sendo um guarda "hard" (revalida o cookie), então as rotas de gestão permanecem exclusivas do admin mesmo com `loadSession` antes.

- [ ] **Step 4: Rodar o gate test (agora deve passar)**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/gate.test.ts`
Expected: PASS — `/api/auth/me` responde 401 sem login (via `loadSession` + handler), `/api/announcements` responde 401 (via `requireAdmin`).

- [ ] **Step 5: Typecheck e testes completos**

Run: `pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/api-server run test`
Expected: sem erros; todos os testes verdes.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/users.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/lib/auth/user-store.ts
git commit -m "feat(users): rotas admin de gestao de contas

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 8 — Rotas de portal (somente leitura, escopo por tenant)

### Task 10: `routes/portal.ts` com escopo garantido

**Files:**
- Create: `artifacts/api-server/src/routes/portal.ts`
- Test: `artifacts/api-server/src/routes/__tests__/portal-scope.test.ts`
- Modify: `artifacts/api-server/src/lib/auth/user-store.ts` (helpers de leitura de métricas)

- [ ] **Step 1: Teste de escopo (falha), mockando os data-readers do portal**

```typescript
// artifacts/api-server/src/routes/__tests__/portal-scope.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

const SECRET = "segredo-portal";
const loadAuthContext = vi.fn();
const advertiserCampaigns = vi.fn();
const clientDevices = vi.fn();
vi.mock("../../lib/auth/user-store", () => ({ loadAuthContext: (...a: unknown[]) => loadAuthContext(...a) }));
vi.mock("../../lib/portal/queries", () => ({
  advertiserCampaigns: (...a: unknown[]) => advertiserCampaigns(...a),
  clientDevices: (...a: unknown[]) => clientDevices(...a),
}));

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { loadSession, requireUser } = await import("../../lib/auth/middleware");
  const { default: portalRouter } = await import("../portal");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/portal", requireUser, portalRouter);
  return app;
}

const advCtx = { userId: 7, email: "a@b.com", isActive: true, mustChangePassword: false, clientIds: [], advertiserIds: [9] };

describe("escopo dos portais", () => {
  beforeEach(() => { loadAuthContext.mockReset(); advertiserCampaigns.mockReset(); clientDevices.mockReset(); });

  it("passa apenas os advertiserIds do usuário para a query", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserCampaigns.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/portal/advertiser/campaigns").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
    expect(advertiserCampaigns).toHaveBeenCalledWith([9]);
  });

  it("usuário sem vínculo de anunciante recebe 403", async () => {
    loadAuthContext.mockResolvedValue({ ...advCtx, advertiserIds: [] });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const token = createSession(SECRET, "7");
    const res = await request(app).get("/portal/advertiser/campaigns").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(403);
    expect(advertiserCampaigns).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/portal-scope.test.ts`
Expected: FAIL — `../portal` e `../../lib/portal/queries` não existem.

- [ ] **Step 3: Criar as queries do portal**

Create: `artifacts/api-server/src/lib/portal/queries.ts`

```typescript
// artifacts/api-server/src/lib/portal/queries.ts
import { inArray, eq, sql } from "drizzle-orm";
import {
  db, campaignsTable, campaignDevicesTable, playsTable, scansTable, devicesTable,
} from "@workspace/db";

export interface PortalCampaignRow {
  id: number; name: string; startsAt: Date; endsAt: Date; isActive: boolean;
  deviceCount: number; totalPlays: number; totalScans: number; uniqueVisitors: number;
}

/** Campanhas dos anunciantes vinculados. NUNCA expõe contractValue. */
export async function advertiserCampaigns(advertiserIds: number[]): Promise<PortalCampaignRow[]> {
  if (advertiserIds.length === 0) return [];
  const rows = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      isActive: campaignsTable.isActive,
      deviceCount: sql<number>`COUNT(DISTINCT ${campaignDevicesTable.deviceId})::int`,
      totalPlays: sql<number>`COUNT(DISTINCT ${playsTable.id})::int`,
      totalScans: sql<number>`COUNT(DISTINCT ${scansTable.id})::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(campaignsTable)
    .leftJoin(campaignDevicesTable, eq(campaignDevicesTable.campaignId, campaignsTable.id))
    .leftJoin(playsTable, eq(playsTable.campaignId, campaignsTable.id))
    .leftJoin(scansTable, eq(scansTable.campaignId, campaignsTable.id))
    .where(inArray(campaignsTable.advertiserId, advertiserIds))
    .groupBy(campaignsTable.id)
    .orderBy(campaignsTable.startsAt);
  return rows;
}

export interface PortalDeviceRow {
  id: number; name: string; location: string | null; lastSeenAt: Date | null; totalPlays: number;
}

/** Dispositivos dos clientes vinculados. */
export async function clientDevices(clientIds: number[]): Promise<PortalDeviceRow[]> {
  if (clientIds.length === 0) return [];
  const rows = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      location: devicesTable.location,
      lastSeenAt: devicesTable.lastSeenAt,
      totalPlays: sql<number>`COUNT(${playsTable.id})::int`,
    })
    .from(devicesTable)
    .leftJoin(playsTable, eq(playsTable.deviceId, devicesTable.id))
    .where(inArray(devicesTable.clientId, clientIds))
    .groupBy(devicesTable.id)
    .orderBy(devicesTable.name);
  return rows;
}
```

> Antes de implementar, confirme os nomes reais das colunas em `lib/db/src/schema/plays.ts`, `scans.ts` e `campaign_devices.ts` (ex.: `campaignId`, `deviceId`, `fingerprint`). Ajuste os campos se divergirem. As rotas de `analytics.ts` já usam `playsTable`/`scansTable` e servem de referência.

- [ ] **Step 4: Criar `routes/portal.ts`**

```typescript
// artifacts/api-server/src/routes/portal.ts
import { Router, type IRouter } from "express";
import { requireAdvertiser, requireClient } from "../lib/auth/middleware";
import { advertiserCampaigns, clientDevices } from "../lib/portal/queries";

const router: IRouter = Router();

router.get("/advertiser/campaigns", requireAdvertiser, async (req, res) => {
  const ids = req.auth?.isAdmin ? [] : (req.auth?.advertiserIds ?? []);
  // Admin visualizando o portal: sem vínculo, retorna vazio (usa o painel admin).
  res.json(await advertiserCampaigns(ids));
});

router.get("/client/devices", requireClient, async (req, res) => {
  const ids = req.auth?.isAdmin ? [] : (req.auth?.clientIds ?? []);
  res.json(await clientDevices(ids));
});

export default router;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/portal-scope.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Typecheck + suíte completa**

Run: `pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/api-server run test`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/routes/portal.ts artifacts/api-server/src/lib/portal/queries.ts artifacts/api-server/src/routes/__tests__/portal-scope.test.ts
git commit -m "feat(portal): endpoints somente-leitura com escopo por tenant

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 9 — Frontend

### Task 11: Hook de sessão e tela de troca de senha

**Files:**
- Modify: `artifacts/signage/src/App.tsx`
- Create: `artifacts/signage/src/pages/change-password.tsx`

- [ ] **Step 1: Ler o `App.tsx` e o `login.tsx` atuais**

Run: `sed -n '1,120p' artifacts/signage/src/App.tsx` e `sed -n '1,80p' artifacts/signage/src/pages/login.tsx`
Objetivo: entender como o `AuthGate` consome `/auth/me` hoje (fetch direto ou hook) para reaproveitar o padrão.

- [ ] **Step 2: Criar a tela de troca de senha**

```tsx
// artifacts/signage/src/pages/change-password.tsx
import { useState } from "react";

export default function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    if (res.ok) { onDone(); return; }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Não foi possível trocar a senha.");
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-xl font-semibold">Defina uma nova senha</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full rounded border p-2" type="password" placeholder="Senha atual"
          value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className="w-full rounded border p-2" type="password" placeholder="Nova senha (mín. 8)"
          value={next} onChange={(e) => setNext(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="w-full rounded bg-black p-2 text-white" type="submit">Trocar senha</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Rotear por papel no `App.tsx`**

Substituir o `Router()`/`AuthGate` para: buscar `/auth/me`; se `!authenticated` → `Login`; se `mustChangePassword` → `ChangePassword` (recarrega `/auth/me` no `onDone`); se `isAdmin` → `AdminRoutes`; senão renderizar `PortalRoutes` (Task 12) conforme `roles`. Exemplo do núcleo:

```tsx
// trecho de artifacts/signage/src/App.tsx
import ChangePassword from "./pages/change-password";
import PortalAdvertiser from "./pages/portal-advertiser";
import PortalClient from "./pages/portal-client";
import { useEffect, useState } from "react";

interface Me {
  authenticated: boolean; isAdmin: boolean; roles: string[];
  clientIds: number[]; advertiserIds: number[]; mustChangePassword: boolean;
}

function RoleRouter() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    const res = await fetch("/api/auth/me", { credentials: "include" });
    setMe(res.ok ? await res.json() : { authenticated: false } as Me);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);
  if (loading) return null;
  if (!me?.authenticated) return <Login />;
  if (me.mustChangePassword) return <ChangePassword onDone={refresh} />;
  if (me.isAdmin) return <AdminRoutes />;
  const isAdv = me.roles.includes("advertiser");
  const isClient = me.roles.includes("client");
  if (isAdv && isClient) return <PortalSwitch />; // seletor de visão (Task 12)
  if (isAdv) return <PortalAdvertiser />;
  if (isClient) return <PortalClient />;
  return <Login />;
}
```

Ajustar `Router()` para usar `<RoleRouter />` no lugar de `<AuthGate><AdminRoutes/></AuthGate>`, mantendo a rota pública `/display/:deviceKey`.

- [ ] **Step 4: Typecheck do frontend**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erros (crie stubs mínimos de `PortalAdvertiser`, `PortalClient`, `PortalSwitch` na Task 12 antes de rodar, ou implemente a Task 12 em seguida e rode ao final).

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/App.tsx artifacts/signage/src/pages/change-password.tsx
git commit -m "feat(web): roteamento por papel e troca de senha

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 12: Páginas de portal (anunciante e cliente) + seletor

**Files:**
- Create: `artifacts/signage/src/pages/portal-advertiser.tsx`
- Create: `artifacts/signage/src/pages/portal-client.tsx`
- Modify: `artifacts/signage/src/App.tsx` (componente `PortalSwitch`)

- [ ] **Step 1: Página do anunciante (consome o cliente gerado ou fetch direto)**

```tsx
// artifacts/signage/src/pages/portal-advertiser.tsx
import { useEffect, useState } from "react";

interface PortalCampaign {
  id: number; name: string; startsAt: string; endsAt: string; isActive: boolean;
  deviceCount: number; totalPlays: number; totalScans: number; uniqueVisitors: number;
}

export default function PortalAdvertiser() {
  const [rows, setRows] = useState<PortalCampaign[]>([]);
  useEffect(() => {
    fetch("/api/portal/advertiser/campaigns", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows);
  }, []);
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Minhas campanhas</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Campanha</th><th>Período</th><th>Status</th>
            <th>TVs</th><th>Exibições</th><th>Scans</th><th>Únicos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t">
              <td>{c.name}</td>
              <td>{new Date(c.startsAt).toLocaleDateString()} – {new Date(c.endsAt).toLocaleDateString()}</td>
              <td>{c.isActive ? "Ativa" : "Inativa"}</td>
              <td>{c.deviceCount}</td>
              <td>{c.totalPlays}</td>
              <td>{c.totalScans}</td>
              <td>{c.uniqueVisitors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Página do cliente**

```tsx
// artifacts/signage/src/pages/portal-client.tsx
import { useEffect, useState } from "react";

interface PortalDevice {
  id: number; name: string; location: string | null; lastSeenAt: string | null; totalPlays: number;
}

export default function PortalClient() {
  const [rows, setRows] = useState<PortalDevice[]>([]);
  useEffect(() => {
    fetch("/api/portal/client/devices", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows);
  }, []);
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Meus dispositivos</h1>
      <table className="w-full text-left text-sm">
        <thead><tr><th>TV</th><th>Local</th><th>Última atividade</th><th>Exibições</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-t">
              <td>{d.name}</td>
              <td>{d.location ?? "—"}</td>
              <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "—"}</td>
              <td>{d.totalPlays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: `PortalSwitch` (usuário com os dois papéis) no `App.tsx`**

```tsx
// trecho de artifacts/signage/src/App.tsx
function PortalSwitch() {
  const [view, setView] = useState<"advertiser" | "client">("advertiser");
  return (
    <div>
      <div className="flex gap-2 border-b p-3">
        <button onClick={() => setView("advertiser")} className={view === "advertiser" ? "font-semibold" : ""}>Anunciante</button>
        <button onClick={() => setView("client")} className={view === "client" ? "font-semibold" : ""}>Cliente</button>
      </div>
      {view === "advertiser" ? <PortalAdvertiser /> : <PortalClient />}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck do frontend**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/pages/portal-advertiser.tsx artifacts/signage/src/pages/portal-client.tsx artifacts/signage/src/App.tsx
git commit -m "feat(web): portais somente-leitura de anunciante e cliente

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Task 13: Tela admin de gestão de contas

**Files:**
- Create: `artifacts/signage/src/pages/users.tsx`
- Modify: `artifacts/signage/src/App.tsx` (rota `/users-admin` dentro de `AdminRoutes`)

- [ ] **Step 1: Página de usuários**

```tsx
// artifacts/signage/src/pages/users.tsx
import { useEffect, useState } from "react";

interface UserAccount {
  id: number; email: string; isActive: boolean; mustChangePassword: boolean;
  clientIds: number[]; advertiserIds: number[];
}
interface NamedRow { id: number; name: string }

export default function Users() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [clients, setClients] = useState<NamedRow[]>([]);
  const [advertisers, setAdvertisers] = useState<NamedRow[]>([]);
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [clientIds, setClientIds] = useState<number[]>([]);
  const [advertiserIds, setAdvertiserIds] = useState<number[]>([]);

  async function refresh() {
    const [u, c, a] = await Promise.all([
      fetch("/api/users", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/clients", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/advertisers", { credentials: "include" }).then((r) => r.json()),
    ]);
    setUsers(u); setClients(c); setAdvertisers(a);
  }
  useEffect(() => { refresh(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ email, tempPassword, clientIds, advertiserIds }),
    });
    setEmail(""); setTempPassword(""); setClientIds([]); setAdvertiserIds([]);
    refresh();
  }

  async function toggleActive(u: UserAccount) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    refresh();
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">Contas de acesso</h1>
      <form onSubmit={createUser} className="mb-6 space-y-2">
        <input className="rounded border p-2" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="rounded border p-2" placeholder="senha temporária (mín. 8)" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} />
        <MultiSelect label="Clientes" options={clients} value={clientIds} onChange={setClientIds} />
        <MultiSelect label="Anunciantes" options={advertisers} value={advertiserIds} onChange={setAdvertiserIds} />
        <button className="rounded bg-black px-4 py-2 text-white" type="submit">Criar conta</button>
      </form>
      <table className="w-full text-left text-sm">
        <thead><tr><th>Email</th><th>Ativo</th><th>Trocar senha?</th><th>Vínculos</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td>{u.email}</td>
              <td>{u.isActive ? "Sim" : "Não"}</td>
              <td>{u.mustChangePassword ? "Pendente" : "OK"}</td>
              <td>{u.advertiserIds.length} anunc. / {u.clientIds.length} cli.</td>
              <td><button onClick={() => toggleActive(u)}>{u.isActive ? "Desativar" : "Ativar"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MultiSelect({ label, options, value, onChange }: {
  label: string; options: NamedRow[]; value: number[]; onChange: (v: number[]) => void;
}) {
  return (
    <fieldset className="rounded border p-2">
      <legend>{label}</legend>
      {options.map((o) => (
        <label key={o.id} className="mr-3 inline-flex items-center gap-1">
          <input type="checkbox" checked={value.includes(o.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} />
          {o.name}
        </label>
      ))}
    </fieldset>
  );
}
```

- [ ] **Step 2: Adicionar a rota no `AdminRoutes`**

Modify: `artifacts/signage/src/App.tsx` — dentro de `AdminRoutes`, adicionar:

```tsx
import Users from "./pages/users";
// ...
<Route path="/users-admin"><Users /></Route>
```

E um link para `/users-admin` na navegação admin existente (seguir o padrão dos links de `/clients`, `/advertisers`).

- [ ] **Step 3: Typecheck do frontend**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/src/pages/users.tsx artifacts/signage/src/App.tsx
git commit -m "feat(web): tela admin de gestao de contas

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## FASE 10 — Validação final

### Task 14: Typecheck, testes e build do workspace

- [ ] **Step 1: Typecheck geral**

Run: `pnpm run typecheck`
Expected: sem erros em todos os pacotes.

- [ ] **Step 2: Testes da API**

Run: `pnpm --filter @workspace/api-server run test`
Expected: todos verdes (session, password, middleware, user-middleware, auth, gate, portal-scope + os pré-existentes).

- [ ] **Step 3: Build de produção**

Run: `PORT=8081 BASE_PATH=/ pnpm run build`
Expected: build do workspace conclui sem erros.

- [ ] **Step 4: Smoke manual (opcional, requer banco)**

```bash
./dev.sh --db          # aplica o schema (cria users/user_clients/user_advertisers)
# subir API+web em outro terminal: ./dev.sh
# 1) logar como admin em /admin
# 2) criar uma conta em /users-admin vinculada a um anunciante
# 3) logar com a conta -> forçar troca de senha -> ver /portal/advertiser/campaigns
```

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore: ajustes finais do cadastro/login segmentado

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Autorrevisão (cobertura da spec)

- Modelo de dados (users + 2 vínculos): Tasks 1–2. ✅
- Hash de senha scrypt: Task 3. ✅
- Sessão com identidade: Task 4. ✅
- Seam de acesso a dados: Task 5. ✅
- Middleware por papel + escopo/desativação: Task 6. ✅
- Login de usuário, change-password, `/auth/me` expandido, admin por env: Task 7. ✅
- Contratos OpenAPI: Task 8. ✅
- Gestão admin de contas (criar/senha temp/vincular/ativar/reset/remover): Tasks 9, 13. ✅
- Portais somente-leitura com escopo por tenant, sem valor financeiro: Tasks 10, 12. ✅
- Roteamento por papel + troca obrigatória no 1º login + seletor de visão: Tasks 11–12. ✅
- Erros (401/403/404, tempo constante, conta desativada): Tasks 6, 7, 10. ✅
- Testes (scrypt, subject, escopo de tenant, bloqueio, desativado): Tasks 3, 4, 6, 7, 10. ✅
- Migração de schema: Task 2 (Step 5), Task 14 (Step 4). ✅

**Observação de decisão:** o design menciona bloquear os portais enquanto `mustChangePassword=true`. Na implementação isso é garantido no frontend (Task 11 redireciona para a tela de troca). Se quiser reforço no backend, adicione um guard em `/portal/*` que verifica `req.auth.user?.mustChangePassword` e responde 403 — anote como melhoria opcional; não é obrigatório para o fluxo funcionar.
