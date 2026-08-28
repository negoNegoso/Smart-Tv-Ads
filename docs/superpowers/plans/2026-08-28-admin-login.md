# Login simples para proteger o painel admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir login de um único admin (usuário + senha) para acessar o painel e a API administrativa, mantendo TVs e QR codes públicos.

**Architecture:** Sessão stateless por cookie HttpOnly assinado com HMAC-SHA256 (`SESSION_SECRET`), verificável sem store — ideal para a função serverless da Vercel. Um middleware `requireAdmin` protege os routers administrativos; routers de TV/QR ficam antes do porteiro. No frontend, um `AuthGate` consulta `GET /api/auth/me` e mostra a tela de login quando não autenticado.

**Tech Stack:** Express 5, `node:crypto` (HMAC), `cookie-parser` (já instalado), Vitest + Supertest, React + wouter + @tanstack/react-query.

---

## Estrutura de arquivos

Backend (`artifacts/api-server/src/`):
- Create `lib/auth/session.ts` — criar/verificar o token de sessão + constantes do cookie (funções puras).
- Create `lib/auth/__tests__/session.test.ts` — testes do token.
- Create `lib/auth/middleware.ts` — `requireAdmin`.
- Create `lib/auth/__tests__/middleware.test.ts` — testes do middleware + acesso público.
- Create `routes/auth.ts` — `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- Create `routes/__tests__/auth.test.ts` — testes das rotas de auth.
- Modify `lib/required-env.ts` — exigir `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`.
- Modify `lib/__tests__/required-env.test.ts` — cobrir as novas variáveis.
- Modify `app.ts` — montar `cookie-parser`.
- Modify `routes/index.ts` — montar `authRouter` e o porteiro `requireAdmin`.

Frontend (`artifacts/signage/src/`):
- Create `lib/auth-fetch-guard.ts` — wrapper de `window.fetch` que dispara evento em respostas 401.
- Create `pages/login.tsx` — formulário de login.
- Modify `main.tsx` — instalar o guard antes do render.
- Modify `App.tsx` — `AuthGate` + rota pública de TV fora do gate.
- Modify `components/layout.tsx` — botão "Sair".

Docs:
- Modify `README.md` — variáveis de ambiente + seção de deploy.

Provisionamento (efeito externo, no fim):
- Definir `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` na Vercel (production **e** preview) e no Replit; deploy e verificação.

---

## Task 1: Token de sessão (assinar/verificar)

**Files:**
- Create: `artifacts/api-server/src/lib/auth/session.ts`
- Test: `artifacts/api-server/src/lib/auth/__tests__/session.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `artifacts/api-server/src/lib/auth/__tests__/session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSession,
  verifySession,
} from "../session";

const SECRET = "segredo-de-teste";
const NOW = 1_700_000_000_000;

describe("sessão assinada", () => {
  it("expõe o nome do cookie e a validade de 7 dias", () => {
    expect(SESSION_COOKIE).toBe("sid");
    expect(SESSION_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("verifica um token recém-criado", () => {
    const token = createSession(SECRET, NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(true);
  });

  it("rejeita token com assinatura adulterada", () => {
    const token = createSession(SECRET, NOW);
    const adulterado = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifySession(adulterado, SECRET, NOW)).toBe(false);
  });

  it("rejeita token expirado", () => {
    const token = createSession(SECRET, NOW);
    const depois = NOW + SESSION_MAX_AGE_MS + 1;
    expect(verifySession(token, SECRET, depois)).toBe(false);
  });

  it("rejeita token assinado com outro segredo", () => {
    const token = createSession("outro-segredo", NOW);
    expect(verifySession(token, SECRET, NOW)).toBe(false);
  });

  it("rejeita token ausente ou malformado sem lançar", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBe(false);
    expect(verifySession("", SECRET, NOW)).toBe(false);
    expect(verifySession("semponto", SECRET, NOW)).toBe(false);
    expect(verifySession("abc.def", SECRET, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/session.test.ts`
Expected: FAIL — `Cannot find module '../session'`.

- [ ] **Step 3: Implementar o mínimo**

Create `artifacts/api-server/src/lib/auth/session.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/session.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/auth/session.ts artifacts/api-server/src/lib/auth/__tests__/session.test.ts
git commit -m "feat(auth): token de sessão assinado por HMAC" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Middleware `requireAdmin`

**Files:**
- Create: `artifacts/api-server/src/lib/auth/middleware.ts`
- Test: `artifacts/api-server/src/lib/auth/__tests__/middleware.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `artifacts/api-server/src/lib/auth/__tests__/middleware.test.ts`:

```ts
import type { Express } from "express";
import { beforeAll, describe, expect, it } from "vitest";
import { createSession } from "../session";

const SECRET = "segredo-do-middleware";

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { requireAdmin } = await import("../middleware");
  const app = express();
  app.use(cookieParser());
  app.get("/protegido", requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("requireAdmin", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("bloqueia sem cookie de sessão", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/protegido");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });

  it("bloqueia com cookie inválido", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/protegido").set("Cookie", "sid=abc.def");
    expect(res.status).toBe(401);
  });

  it("permite com cookie de sessão válido", async () => {
    const { default: request } = await import("supertest");
    const token = createSession(SECRET);
    const res = await request(app).get("/protegido").set("Cookie", `sid=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/middleware.test.ts`
Expected: FAIL — `Cannot find module '../middleware'`.

- [ ] **Step 3: Implementar o mínimo**

Create `artifacts/api-server/src/lib/auth/middleware.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/auth/__tests__/middleware.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/auth/middleware.ts artifacts/api-server/src/lib/auth/__tests__/middleware.test.ts
git commit -m "feat(auth): middleware requireAdmin" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Rotas de autenticação

**Files:**
- Create: `artifacts/api-server/src/routes/auth.ts`
- Test: `artifacts/api-server/src/routes/__tests__/auth.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `artifacts/api-server/src/routes/__tests__/auth.test.ts`:

```ts
import type { Express } from "express";
import { beforeAll, describe, expect, it } from "vitest";

const USER = "admin";
const PASS = "senha-secreta";

async function buildApp(): Promise<Express> {
  process.env.ADMIN_USERNAME = USER;
  process.env.ADMIN_PASSWORD = PASS;
  process.env.SESSION_SECRET = "segredo-das-rotas";
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { default: authRouter } = await import("../auth");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", authRouter);
  return app;
}

describe("rotas de autenticação", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("faz login com credenciais corretas e seta o cookie sid", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: USER, password: PASS });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("sid="))).toBe(true);
    expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  it("recusa senha errada com 401", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: USER, password: "errada" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Usuário ou senha inválidos." });
  });

  it("GET /auth/me sem cookie responde 401", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("GET /auth/me com cookie do login responde 200", async () => {
    const { default: request } = await import("supertest");
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ username: USER, password: PASS });
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ authenticated: true });
  });

  it("logout limpa o cookie sid", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("sid=") && /Expires|Max-Age=0/i.test(c))).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/auth.test.ts`
Expected: FAIL — `Cannot find module '../auth'`.

- [ ] **Step 3: Implementar o mínimo**

Create `artifacts/api-server/src/routes/auth.ts`:

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/auth.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/auth.ts artifacts/api-server/src/routes/__tests__/auth.test.ts
git commit -m "feat(auth): rotas login, logout e me" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Montar cookie-parser e o porteiro nos routers

**Files:**
- Modify: `artifacts/api-server/src/app.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/routes/__tests__/gate.test.ts` (Create)

- [ ] **Step 1: Escrever o teste que falha**

Create `artifacts/api-server/src/routes/__tests__/gate.test.ts`. Ele prova que, com o porteiro montado, o endpoint público continua aberto e um protegido exige login.

```ts
import type { Express } from "express";
import { beforeAll, describe, expect, it } from "vitest";

async function buildApp(): Promise<Express> {
  process.env.SCAN_SALT = "sal";
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "senha";
  process.env.SESSION_SECRET = "segredo-do-gate";
  process.env.DATABASE_URL = "******localhost:5432/db";
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { default: router } = await import("../index");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", router);
  return app;
}

describe("porteiro de rotas", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildApp();
  });

  it("mantém /api/healthz público", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("mantém /api/auth/me público (responde 401 sem login, não bloqueio do porteiro)", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ authenticated: false });
  });

  it("protege /api/announcements sem login", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/announcements");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/gate.test.ts`
Expected: FAIL — hoje `/api/announcements` não retorna 401 (o porteiro ainda não existe).

- [ ] **Step 3: Montar o cookie-parser no `app.ts`**

Modify `artifacts/api-server/src/app.ts`. Adicionar o import e o middleware.

Adicione o import junto aos outros no topo:

```ts
import cookieParser from "cookie-parser";
```

Logo após a linha `app.use(express.urlencoded({ extended: true }));`, adicione:

```ts
app.use(cookieParser());
```

- [ ] **Step 4: Reordenar `routes/index.ts` com o porteiro**

Replace todo o conteúdo de `artifacts/api-server/src/routes/index.ts` por:

```ts
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
import { requireAdmin } from "../lib/auth/middleware";

const router = Router();

// Públicos: healthcheck, autenticação e o que as TVs/QR consomem.
router.use(healthRouter);
router.use(authRouter);
router.use(displayRouter);
router.use(telemetryRouter);
router.use(qrRouter);

// Porteiro: tudo abaixo exige sessão de admin.
router.use(requireAdmin);

router.use(announcementsRouter);
router.use(clientsRouter);
router.use(devicesRouter);
router.use(analyticsRouter);
router.use(advertisersRouter);
router.use(storageRouter);

export default router;
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/gate.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/app.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/__tests__/gate.test.ts
git commit -m "feat(auth): proteger routers admin e liberar TV/QR" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Exigir as novas variáveis no boot

**Files:**
- Modify: `artifacts/api-server/src/lib/required-env.ts`
- Modify: `artifacts/api-server/src/lib/__tests__/required-env.test.ts`

- [ ] **Step 1: Atualizar o teste para as novas variáveis**

Replace todo o conteúdo de `artifacts/api-server/src/lib/__tests__/required-env.test.ts` por:

```ts
import { describe, expect, it } from "vitest";
import { assertRequiredEnv } from "../required-env";

const completo = {
  SCAN_SALT: "sal",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "senha",
  SESSION_SECRET: "segredo",
};

describe("assertRequiredEnv", () => {
  it("aceita ambiente com todas as variáveis obrigatórias", () => {
    expect(() => assertRequiredEnv(completo)).not.toThrow();
  });

  it("rejeita SCAN_SALT ausente", () => {
    const { SCAN_SALT, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/SCAN_SALT/);
  });

  it("rejeita ADMIN_USERNAME ausente", () => {
    const { ADMIN_USERNAME, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/ADMIN_USERNAME/);
  });

  it("rejeita ADMIN_PASSWORD ausente", () => {
    const { ADMIN_PASSWORD, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/ADMIN_PASSWORD/);
  });

  it("rejeita SESSION_SECRET ausente", () => {
    const { SESSION_SECRET, ...resto } = completo;
    expect(() => assertRequiredEnv(resto)).toThrow(/SESSION_SECRET/);
  });

  it("rejeita variável vazia", () => {
    expect(() => assertRequiredEnv({ ...completo, ADMIN_PASSWORD: "" })).toThrow(
      /ADMIN_PASSWORD/,
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/required-env.test.ts`
Expected: FAIL — hoje `assertRequiredEnv` só valida `SCAN_SALT`, então o caso "aceita ambiente completo" passa mas os casos das novas variáveis falham (não lançam).

- [ ] **Step 3: Implementar a validação**

Replace todo o conteúdo de `artifacts/api-server/src/lib/required-env.ts` por:

```ts
/**
 * Validated by app.ts so that both the long-running server and the serverless
 * entrypoint fail loudly. SCAN_SALT protege o registro de scans; as variáveis
 * de admin e o SESSION_SECRET são exigidos para o login funcionar.
 */
const REQUIRED_KEYS = [
  "SCAN_SALT",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
] as const;

export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of REQUIRED_KEYS) {
    if (!env[key]) {
      throw new Error(
        `${key} must be set. Confira as variáveis de ambiente obrigatórias da API.`,
      );
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/required-env.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Rodar toda a suíte da API e o typecheck**

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: todos os testes verdes e typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/required-env.ts artifacts/api-server/src/lib/__tests__/required-env.test.ts
git commit -m "feat(auth): exigir ADMIN_USERNAME, ADMIN_PASSWORD e SESSION_SECRET no boot" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Guard global de 401 no frontend

**Files:**
- Create: `artifacts/signage/src/lib/auth-fetch-guard.ts`
- Modify: `artifacts/signage/src/main.tsx`

Sem teste automatizado (o pacote signage não tem setup de testes de UI). Verificação é por typecheck/manual.

- [ ] **Step 1: Criar o guard**

Create `artifacts/signage/src/lib/auth-fetch-guard.ts`:

```ts
export const UNAUTHORIZED_EVENT = "auth:unauthorized";

/**
 * Envolve window.fetch para detectar respostas 401 de chamadas protegidas
 * (sessão expirada) e emitir um evento. O AuthGate escuta e volta ao login.
 * Ignora as próprias rotas /api/auth/* para não disparar durante o login.
 */
export function installAuthFetchGuard(): void {
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    try {
      const input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (
        response.status === 401 &&
        url.includes("/api/") &&
        !url.includes("/api/auth/")
      ) {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
    } catch {
      // best-effort: nunca quebrar o fetch original
    }
    return response;
  };
}
```

- [ ] **Step 2: Instalar o guard antes do render**

Modify `artifacts/signage/src/main.tsx` para instalar o guard. Replace todo o conteúdo por:

```tsx
import { createRoot } from 'react-dom/client';

import App from './App';
import { installAuthFetchGuard } from './lib/auth-fetch-guard';

import './index.css';

installAuthFetchGuard();

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 3: Verificar o typecheck do arquivo novo**

Run: `pnpm --filter @workspace/signage exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'auth-fetch-guard|main.tsx' || echo "sem erros nesses arquivos"`
Expected: `sem erros nesses arquivos` (o pacote tem erros pré-existentes não relacionados; confirme apenas que os arquivos novos não adicionam erros).

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/src/lib/auth-fetch-guard.ts artifacts/signage/src/main.tsx
git commit -m "feat(auth): guard global que detecta 401 e emite evento" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Tela de login

**Files:**
- Create: `artifacts/signage/src/pages/login.tsx`

- [ ] **Step 1: Criar a página de login**

Create `artifacts/signage/src/pages/login.tsx`. Usa os componentes de UI já existentes (`Button`, `Input`, `Label`, `Card`) e invalida a query `['auth']` no sucesso.

```tsx
import { FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { MonitorPlay } from 'lucide-react';

export default function Login() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError('Usuário ou senha inválidos.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
    } catch {
      setError('Não foi possível entrar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2 font-bold tracking-tight text-primary">
          <MonitorPlay className="h-6 w-6" />
          <span>Painel de Anúncios</span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuário</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verificar o typecheck do arquivo novo**

Run: `pnpm --filter @workspace/signage exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'pages/login.tsx' || echo "sem erros nesse arquivo"`
Expected: `sem erros nesse arquivo`.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/login.tsx
git commit -m "feat(auth): tela de login do painel" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: AuthGate no App e rota pública de TV fora do gate

**Files:**
- Modify: `artifacts/signage/src/App.tsx`

- [ ] **Step 1: Reescrever o App com o gate**

Replace todo o conteúdo de `artifacts/signage/src/App.tsx` por:

```tsx
import { ReactNode, useEffect } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';

import { Layout } from './components/layout';
import Admin from './pages/admin';
import Login from './pages/login';
import Display from './pages/display';
import Clients from './pages/clients';
import ClientDetail from './pages/client-detail';
import DeviceDetail from './pages/device-detail';
import Analytics from './pages/analytics';
import Advertisers from './pages/advertisers';
import AdvertiserDetail from './pages/advertiser-detail';
import { UNAUTHORIZED_EVENT } from './lib/auth-fetch-guard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AdminRoutes() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/clients" />
      </Route>
      <Route path="/clients">
        <Layout><Clients /></Layout>
      </Route>
      <Route path="/clients/:id">
        <Layout><ClientDetail /></Layout>
      </Route>
      <Route path="/devices/:id">
        <Layout><DeviceDetail /></Layout>
      </Route>
      <Route path="/admin">
        <Layout><Admin /></Layout>
      </Route>
      <Route path="/analytics">
        <Layout><Analytics /></Layout>
      </Route>
      <Route path="/advertisers">
        <Layout><Advertisers /></Layout>
      </Route>
      <Route path="/advertisers/:id">
        <Layout><AdvertiserDetail /></Layout>
      </Route>
      <Route>
        <Layout><NotFound /></Layout>
      </Route>
    </Switch>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`);
      return { authenticated: res.ok };
    },
    retry: false,
  });

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.setQueryData(['auth'], { authenticated: false });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!data?.authenticated) {
    return <Login />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/display/:deviceKey" component={Display} />
      <Route>
        <AuthGate>
          <AdminRoutes />
        </AuthGate>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
```

- [ ] **Step 2: Confirmar que o componente Spinner existe com esse nome**

Run: `grep -n "export" artifacts/signage/src/components/ui/spinner.tsx`
Expected: uma exportação de `Spinner`. Se o nome exportado for diferente, ajuste o import e o uso no `App.tsx` de acordo com o que o arquivo exporta.

- [ ] **Step 3: Verificar o typecheck do App**

Run: `pnpm --filter @workspace/signage exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'App.tsx' || echo "sem erros no App.tsx"`
Expected: `sem erros no App.tsx`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/src/App.tsx
git commit -m "feat(auth): AuthGate protege o painel e mantém a TV pública" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Botão "Sair" no Layout

**Files:**
- Modify: `artifacts/signage/src/components/layout.tsx`

- [ ] **Step 1: Adicionar o logout ao cabeçalho**

Modify `artifacts/signage/src/components/layout.tsx`.

Substitua a linha de imports do lucide-react:

```tsx
import { MonitorPlay, Users, LayoutDashboard, BarChart3, Building2 } from 'lucide-react';
```

por:

```tsx
import { MonitorPlay, Users, LayoutDashboard, BarChart3, Building2, LogOut } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
```

Dentro da função `Layout`, logo após `const [location] = useLocation();`, adicione:

```tsx
  const queryClient = useQueryClient();

  async function handleLogout() {
    await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, { method: 'POST' });
    queryClient.setQueryData(['auth'], { authenticated: false });
  }
```

Em seguida, feche a `<nav>` com um botão alinhado à direita. Substitua o bloco:

```tsx
          </nav>
        </div>
      </header>
```

por:

```tsx
          </nav>

          <Button
            variant="ghost"
            size="sm"
            className="ml-auto flex items-center gap-2 text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>
```

- [ ] **Step 2: Verificar o typecheck do Layout**

Run: `pnpm --filter @workspace/signage exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'layout.tsx' || echo "sem erros no layout.tsx"`
Expected: `sem erros no layout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/components/layout.tsx
git commit -m "feat(auth): botão Sair no cabeçalho do painel" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Documentar no README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Adicionar as variáveis na tabela de ambiente**

Modify `README.md`. Na tabela da seção "## Variáveis de ambiente", adicione estas linhas após a linha do `SCAN_SALT`:

```markdown
| `ADMIN_USERNAME` | Usuário do único admin do painel |
| `ADMIN_PASSWORD` | Senha do único admin do painel |
| `SESSION_SECRET` | Assina o cookie de sessão do login (HMAC). Obrigatória: sem ela a API não sobe |
```

- [ ] **Step 2: Documentar o login na seção da Vercel**

Modify `README.md`. Na seção "## Deploy na Vercel", dentro da tabela "### Variáveis de ambiente em produção", troque a linha do `SESSION_SECRET`:

```markdown
| `SESSION_SECRET` | manual |
```

por:

```markdown
| `SESSION_SECRET` | manual — assina o cookie de login (obrigatória) |
| `ADMIN_USERNAME` | manual — usuário do admin |
| `ADMIN_PASSWORD` | manual — senha do admin |
```

Em seguida, adicione um parágrafo ao final dessa seção, antes de "## Organização do projeto":

```markdown
### Login do painel

O painel exige login de um único admin (usuário + senha em `ADMIN_USERNAME` /
`ADMIN_PASSWORD`). A sessão é um cookie HttpOnly assinado com `SESSION_SECRET`,
válido por 7 dias. As telas de TV (`/display/:key`, `tv.html`) e os QR codes
(`/r/CODE`) continuam públicos. Defina as três variáveis em produção **e**
preview antes de publicar — sem elas a API não sobe.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: documentar login do painel e variáveis de admin" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Provisionar variáveis, deployar e verificar

Efeito externo. As três variáveis passam a ser exigidas no boot, então **precisam existir antes do deploy do novo código**, senão a função retorna 500.

- [ ] **Step 1: Obter as credenciais com o usuário**

Peça ao usuário os valores de `ADMIN_USERNAME` e `ADMIN_PASSWORD`. `SESSION_SECRET` já está em produção; confirme se também está em **preview** (foi criado só em produção no deploy anterior).

- [ ] **Step 2: Definir as variáveis na Vercel (production e preview)**

Substitua `<USUARIO>` e `<SENHA>` pelos valores do usuário. `SESSION_SECRET` de preview reaproveita o mesmo segredo de produção (pegue com `vercel env pull` ou gere um novo forte).

```bash
cd /Users/yvillanova/Downloads/tv/Smart-Tv-Ads
pnpm dlx vercel@latest env add ADMIN_USERNAME production --value "<USUARIO>" --sensitive --yes
pnpm dlx vercel@latest env add ADMIN_USERNAME preview    --value "<USUARIO>" --sensitive --yes
pnpm dlx vercel@latest env add ADMIN_PASSWORD production --value "<SENHA>"   --sensitive --yes
pnpm dlx vercel@latest env add ADMIN_PASSWORD preview    --value "<SENHA>"   --sensitive --yes
# SESSION_SECRET em preview (se ainda não existir):
pnpm dlx vercel@latest env add SESSION_SECRET preview --value "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" --sensitive --yes
```

Confirme:

```bash
pnpm dlx vercel@latest env ls | grep -E 'ADMIN_USERNAME|ADMIN_PASSWORD|SESSION_SECRET'
```
Expected: cada uma listada em Production e Preview.

- [ ] **Step 3: Mergear para a main**

```bash
git checkout main && git merge --ff-only <branch-de-trabalho> && git push origin main
```
(Se não estiver usando branch separada, apenas `git push origin main`.)

- [ ] **Step 4: Deploy de preview e verificação automática**

```bash
PREVIEW_URL=$(pnpm dlx vercel@latest deploy 2>&1 | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | head -1)
echo "Preview: $PREVIEW_URL"
echo "--- /api/auth/me sem login (espera 401) ---"
curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW_URL/api/auth/me"
echo "--- /api/announcements sem login (espera 401) ---"
curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW_URL/api/announcements"
echo "--- /api/display/446DBB402AC34FA1/slides público (espera 200) ---"
curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW_URL/api/display/446DBB402AC34FA1/slides"
echo "--- login e leitura protegida com cookie ---"
curl -s -c /tmp/cj.txt -X POST "$PREVIEW_URL/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"<USUARIO>","password":"<SENHA>"}' -o /dev/null -w "login %{http_code}\n"
curl -s -b /tmp/cj.txt -o /dev/null -w "announcements com cookie %{http_code}\n" "$PREVIEW_URL/api/announcements"
rm -f /tmp/cj.txt
```
Expected: `me` 401, `announcements` sem login 401, `slides` 200, `login` 200, `announcements com cookie` 200.

- [ ] **Step 5: Verificação manual do usuário no preview**

Peça ao usuário para abrir o `PREVIEW_URL` no navegador e confirmar: aparece a tela de login; credenciais erradas mostram erro; login correto abre o painel; o botão "Sair" volta ao login; a tela de TV (`/tv.html?key=446DBB402AC34FA1`) continua abrindo **sem** pedir login.

- [ ] **Step 6: Promover para produção (somente com OK explícito do usuário)**

```bash
pnpm dlx vercel@latest deploy --prod
```
Depois verifique:

```bash
curl -s -o /dev/null -w "me %{http_code}\n" "https://smart-tv-ads.vercel.app/api/auth/me"          # 401
curl -s -o /dev/null -w "announcements %{http_code}\n" "https://smart-tv-ads.vercel.app/api/announcements"  # 401
curl -s -o /dev/null -w "slides %{http_code}\n" "https://smart-tv-ads.vercel.app/api/display/446DBB402AC34FA1/slides"  # 200
```

- [ ] **Step 7: Atualizar o Replit**

Defina `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `SESSION_SECRET` no ambiente do Replit (painel de Secrets) e para desenvolvimento local adicione-as ao `.env`/`.env.local`. Sem elas, a API não sobe.

---

## Notas de verificação final

- Suíte completa da API: `pnpm --filter @workspace/api-server run test` (todos verdes).
- Typecheck da API: `pnpm --filter @workspace/api-server run typecheck` (sem erros — é o portão desta feature).
- O typecheck do pacote `signage` tem erros pré-existentes não relacionados (Zod/@hookform); valide apenas que os arquivos novos/alterados não introduzem novos erros e faça a verificação de UI no navegador.
