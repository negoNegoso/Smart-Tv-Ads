# Landing page pública — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar uma landing page em `/` que explique o produto para anunciantes e para donos de ponto, e leve os dois ao WhatsApp.

**Architecture:** Rota nova dentro do SPA `@workspace/signage`, reusando os tokens de `src/index.css`, a fonte Outfit e os componentes shadcn locais. A raiz passa a ser pública e o login vai para `/login`. Um endpoint público novo (`GET /api/public/stats`) alimenta a faixa de números, nascendo no contrato OpenAPI como todo o resto da API.

**Tech Stack:** React 18 + wouter + TanStack Query + Tailwind (frontend); Express 5 + Drizzle + Zod gerado por orval (backend); vitest + supertest (testes da API).

**Spec:** `docs/superpowers/specs/2026-08-31-landing-page-design.md`

## Global Constraints

- Branch de trabalho: `feat/landing-page`.
- Nome público do produto: **Smart Vale TV**. Assumi essa capitalização a partir de "smart vale tv"; se estiver errada, corrigir apenas `BRAND` em `landing-content.ts`.
- WhatsApp: **5513997478695**. O número informado foi `13997478695`; o `55` de DDI foi acrescentado porque `wa.me` exige o número internacional completo. Confirmar antes de publicar.
- Toda a copy em português do Brasil.
- Nenhum número, depoimento ou logo de terceiro inventado. Se um dado não existe no banco, ele não vai para a tela.
- Nenhuma paleta nova: apenas os tokens já definidos em `artifacts/signage/src/index.css`.
- A landing renderiza sempre em tema claro, independente da classe `.dark`.
- A landing nunca pode quebrar por causa da API: falha de rede esconde a faixa de números e o resto da página segue.
- Sem preço na página. Sem formulário. Sem coleta de dados pessoais.
- Responsivo a partir de 375px.
- Validação ao fim de cada tarefa: `pnpm run typecheck`.

## Nota sobre testes

A API tem vitest e supertest configurados (`artifacts/api-server/vitest.config.ts`), e a Tarefa 1 segue TDD de verdade.

O `artifacts/signage` **não tem nenhuma infraestrutura de teste** — sem vitest, sem testing-library, nenhum arquivo `*.test.*`. Instalar um framework de teste no frontend não está na spec e não faz parte deste plano. As tarefas de frontend são verificadas por `pnpm run typecheck`, `pnpm run build` e por um roteiro manual explícito em cada tarefa. A lógica com risco real de regressão (roteamento e sessão, Tarefa 2) recebe o roteiro manual mais detalhado por esse motivo. Se preferir cobrir o roteamento com teste automatizado, isso é uma tarefa a mais e precisa ser pedida — significa adicionar vitest + testing-library ao signage.

## Estrutura de arquivos

**Backend**

| Arquivo | Responsabilidade |
| --- | --- |
| `lib/api-spec/openapi.yaml` | contrato de `GET /public/stats` |
| `artifacts/api-server/src/lib/public-stats/queries.ts` | janelas de tempo puras + as quatro contagens |
| `artifacts/api-server/src/routes/public-stats.ts` | a rota, fina: chama a query, valida, responde |
| `artifacts/api-server/src/routes/index.ts` | registro no bloco público |
| `artifacts/api-server/src/routes/__tests__/public-stats.test.ts` | janelas de tempo e formato da resposta |

**Frontend**

| Arquivo | Responsabilidade |
| --- | --- |
| `artifacts/signage/src/lib/landing-content.ts` | todo o texto, marca, WhatsApp e FAQ |
| `artifacts/signage/src/lib/session-hint.ts` | dica de sessão em `localStorage` (nunca autorização) |
| `artifacts/signage/src/hooks/use-public-stats.ts` | a query dos números |
| `artifacts/signage/src/pages/landing.tsx` | compõe as seções, sem conteúdo próprio |
| `artifacts/signage/src/components/landing/site-header.tsx` | topo com âncoras e Entrar |
| `artifacts/signage/src/components/landing/hero.tsx` | headline e as duas portas |
| `artifacts/signage/src/components/landing/tv-mockup.tsx` | a TV desenhada em CSS |
| `artifacts/signage/src/components/landing/stats-band.tsx` | faixa de números |
| `artifacts/signage/src/components/landing/how-it-works.tsx` | dois fluxos de três passos |
| `artifacts/signage/src/components/landing/differentials.tsx` | "Por que a Smart Vale TV" |
| `artifacts/signage/src/components/landing/faq.tsx` | perguntas |
| `artifacts/signage/src/components/landing/final-cta.tsx` | fechamento |
| `artifacts/signage/src/components/landing/site-footer.tsx` | rodapé |
| `artifacts/signage/src/App.tsx` | rotas `/` e `/login` |
| `artifacts/signage/src/pages/login.tsx` | navega após login e grava a dica |
| `artifacts/signage/index.html` | meta tags públicas |

Nenhum texto de interface mora dentro de componente. Copy e ordem de seções mudam com frequência; cada mudança deve caber em um arquivo pequeno.

---

### Task 1: Endpoint público de números

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Create: `artifacts/api-server/src/lib/public-stats/queries.ts`
- Create: `artifacts/api-server/src/routes/public-stats.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/routes/__tests__/public-stats.test.ts`

**Interfaces:**
- Consumes: `db`, `playsTable`, `devicesTable`, `clientsTable` de `@workspace/db`.
- Produces:
  - `playsSince(now: Date): Date` e `activeSince(now: Date): Date`
  - `publicStats(now?: Date): Promise<{ plays30d: number; activeScreens: number; clients: number; segments: number }>`
  - `GetPublicStatsResponse` (schema zod gerado por orval)
  - `GET /api/public/stats`, consumido pela Tarefa 3

- [ ] **Step 1: Declarar o contrato no OpenAPI**

Em `lib/api-spec/openapi.yaml`, acrescentar `public` à lista de `tags` (no fim da lista existente):

```yaml
  - name: public
```

Acrescentar o path logo após o bloco de `/healthz`:

```yaml
  # ── Público (landing page) ──────────────────────────────────────────────────
  /public/stats:
    get:
      operationId: getPublicStats
      tags: [public]
      summary: Aggregate counters for the public landing page
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PublicStats"
```

E o schema, logo após `HealthStatus` dentro de `components.schemas`:

```yaml
    PublicStats:
      type: object
      required: [plays30d, activeScreens, clients, segments]
      properties:
        plays30d: { type: integer }
        activeScreens: { type: integer }
        clients: { type: integer }
        segments: { type: integer }
```

- [ ] **Step 2: Gerar os schemas**

Run: `pnpm --filter @workspace/api-spec run codegen`

Expected: o comando termina sem erro e `lib/api-zod/src/generated/api.ts` passa a exportar `GetPublicStatsResponse`.

Confirmar: `grep -n "GetPublicStatsResponse" lib/api-zod/src/generated/api.ts`

- [ ] **Step 3: Escrever o teste que falha**

Criar `artifacts/api-server/src/routes/__tests__/public-stats.test.ts`:

```ts
// artifacts/api-server/src/routes/__tests__/public-stats.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publicStats = vi.fn();
vi.mock("../../lib/public-stats/queries", async () => {
  const actual = await vi.importActual<typeof import("../../lib/public-stats/queries")>(
    "../../lib/public-stats/queries",
  );
  return { ...actual, publicStats: (...a: unknown[]) => publicStats(...a) };
});

async function buildApp(): Promise<Express> {
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  const { default: express } = await import("express");
  const { default: router } = await import("../public-stats");
  const app = express();
  app.use(router);
  return app;
}

describe("janelas de tempo dos números públicos", () => {
  it("plays30d olha 30 dias para trás", async () => {
    const { playsSince } = await import("../../lib/public-stats/queries");
    const now = new Date("2026-03-31T12:00:00.000Z");
    expect(playsSince(now).toISOString()).toBe("2026-03-01T12:00:00.000Z");
  });

  it("activeScreens olha 24 horas para trás", async () => {
    const { activeSince } = await import("../../lib/public-stats/queries");
    const now = new Date("2026-03-31T12:00:00.000Z");
    expect(activeSince(now).toISOString()).toBe("2026-03-30T12:00:00.000Z");
  });
});

describe("GET /public/stats", () => {
  beforeEach(() => {
    publicStats.mockReset();
  });

  it("responde os quatro contadores", async () => {
    publicStats.mockResolvedValue({ plays30d: 1204, activeScreens: 7, clients: 5, segments: 3 });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plays30d: 1204, activeScreens: 7, clients: 5, segments: 3 });
  });

  it("permite cache no CDN", async () => {
    publicStats.mockResolvedValue({ plays30d: 0, activeScreens: 0, clients: 0, segments: 0 });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.headers["cache-control"]).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });

  it("não exige sessão", async () => {
    publicStats.mockResolvedValue({ plays30d: 0, activeScreens: 0, clients: 0, segments: 0 });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/public/stats");
    expect(res.status).not.toBe(401);
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @workspace/api-server run test public-stats`

Expected: FAIL — não existe `../../lib/public-stats/queries` nem `../public-stats`.

- [ ] **Step 5: Escrever as queries**

Criar `artifacts/api-server/src/lib/public-stats/queries.ts`:

```ts
import { gte, isNotNull, sql } from "drizzle-orm";
import { db, playsTable, devicesTable, clientsTable } from "@workspace/db";

/**
 * Contadores agregados que a landing pública exibe.
 *
 * Só agregados: nenhum nome de cliente, nenhum dado pessoal, nada que
 * identifique um estabelecimento. Esta é a única consulta do sistema que
 * responde sem sessão, então o que sai daqui é público para sempre.
 *
 * As duas janelas ficam em funções puras porque são a regra que erra em
 * silêncio: um número errado aqui não quebra nada, só mente na tela.
 */
export const PLAYS_WINDOW_DAYS = 30;
export const ACTIVE_SCREEN_WINDOW_HOURS = 24;

export function playsSince(now: Date): Date {
  return new Date(now.getTime() - PLAYS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function activeSince(now: Date): Date {
  return new Date(now.getTime() - ACTIVE_SCREEN_WINDOW_HOURS * 60 * 60 * 1000);
}

export interface PublicStats {
  plays30d: number;
  activeScreens: number;
  clients: number;
  segments: number;
}

export async function publicStats(now: Date = new Date()): Promise<PublicStats> {
  const [plays] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .where(gte(playsTable.createdAt, playsSince(now)));

  // lastSeenAt nulo não satisfaz o gte: device cadastrado que nunca reportou
  // presença não conta como tela ativa.
  const [screens] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(devicesTable)
    .where(gte(devicesTable.lastSeenAt, activeSince(now)));

  const [clients] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(clientsTable);

  const [segments] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${clientsTable.segmentId})::int` })
    .from(clientsTable)
    .where(isNotNull(clientsTable.segmentId));

  return {
    plays30d: plays?.n ?? 0,
    activeScreens: screens?.n ?? 0,
    clients: clients?.n ?? 0,
    segments: segments?.n ?? 0,
  };
}
```

- [ ] **Step 6: Escrever a rota**

Criar `artifacts/api-server/src/routes/public-stats.ts`:

```ts
import { Router, type IRouter } from "express";
import { GetPublicStatsResponse } from "@workspace/api-zod";
import { publicStats } from "../lib/public-stats/queries";

const router: IRouter = Router();

/**
 * Números da landing. Rota pública: precisa ficar acima do loadSession em
 * routes/index.ts.
 *
 * O cache é do CDN, não da instância: numa função serverless um cache em
 * memória vive por instância e não ajuda. Se a consulta falhar, o Express 5
 * encaminha a rejeição sozinho e a resposta sai sem Cache-Control — nada de
 * erro cacheado por cinco minutos.
 */
router.get("/public/stats", async (_req, res) => {
  const stats = await publicStats();
  const data = GetPublicStatsResponse.parse(stats);
  res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.json(data);
});

export default router;
```

- [ ] **Step 7: Registrar no bloco público**

Em `artifacts/api-server/src/routes/index.ts`, acrescentar o import junto dos outros (após `import healthRouter from "./health";`):

```ts
import publicStatsRouter from "./public-stats";
```

E o registro dentro do bloco `// Públicos`, logo abaixo de `router.use(healthRouter);`:

```ts
router.use(publicStatsRouter);
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @workspace/api-server run test public-stats`

Expected: PASS, 5 testes.

- [ ] **Step 9: Typecheck**

Run: `pnpm run typecheck`

Expected: sem erros.

- [ ] **Step 10: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react \
  artifacts/api-server/src/lib/public-stats/queries.ts \
  artifacts/api-server/src/routes/public-stats.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/__tests__/public-stats.test.ts
git commit -m "feat(api): numeros publicos para a landing"
```

---

### Task 2: Raiz pública e login em /login

**Files:**
- Create: `artifacts/signage/src/lib/session-hint.ts`
- Create: `artifacts/signage/src/pages/landing.tsx` (esqueleto, preenchido nas tarefas seguintes)
- Modify: `artifacts/signage/src/App.tsx`
- Modify: `artifacts/signage/src/pages/login.tsx`

**Interfaces:**
- Consumes: nada das tarefas anteriores.
- Produces:
  - `markSessionStarted(): void`, `clearSessionHint(): void`, `hasSessionHint(): boolean`
  - `export default function Landing()` em `pages/landing.tsx`, que as tarefas 4 a 8 preenchem
  - rota `/` pública e rota `/login`

**Divergência assumida em relação à spec:** a spec lista
`lib/auth-fetch-guard.ts` entre os arquivos a modificar, para mandar a sessão
expirada a `/login`. Ele **não** precisa mudar. O guard só detecta o 401 e emite
`UNAUTHORIZED_EVENT`; quem decide o destino é o `RoleRouter`, e o `Redirect to="/login"`
do Step 3 já cobre o caso. Mexer no guard duplicaria a decisão de navegação em
dois lugares.

- [ ] **Step 1: Criar a dica de sessão**

Criar `artifacts/signage/src/lib/session-hint.ts`:

```ts
const KEY = "signage:has-session";

/**
 * Dica de UX, jamais autorização.
 *
 * A sessão real só é conhecida depois de GET /api/auth/me. Sem essa dica, a
 * raiz teria que escolher entre mostrar um spinner para todo visitante anônimo
 * — a maioria — ou piscar a landing na cara de quem já está logado. Com ela,
 * cada público recebe o comportamento certo na primeira pintura.
 *
 * Quem decide o que o usuário pode ver continua sendo a API. Adulterar esta
 * chave no navegador não libera nada: no máximo troca um spinner por uma
 * landing.
 */
export function markSessionStarted(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Modo privado ou storage bloqueado: seguir sem a dica é aceitável.
  }
}

export function clearSessionHint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // idem
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Criar o esqueleto da landing**

Criar `artifacts/signage/src/pages/landing.tsx`:

```tsx
/**
 * Porta de entrada pública. As seções entram nas tarefas seguintes; este
 * esqueleto existe para a rota `/` já ser navegável.
 */
export default function Landing() {
  return (
    <main className="min-h-[100dvh] bg-white text-zinc-900">
      <h1 className="p-8 text-3xl font-semibold">Smart Vale TV</h1>
    </main>
  );
}
```

- [ ] **Step 3: Trocar o roteamento**

Em `artifacts/signage/src/App.tsx`, acrescentar aos imports:

```tsx
import Landing from './pages/landing';
import { clearSessionHint, hasSessionHint } from './lib/session-hint';
```

Em `RoleRouter`, trocar o retorno de não autenticado. A linha atual é:

```tsx
  if (!me?.authenticated) {
    return <Login />;
  }
```

por:

```tsx
  if (!me?.authenticated) {
    return <Redirect to="/login" />;
  }
```

Acrescentar os dois gates logo acima de `function Router()`:

```tsx
/**
 * A raiz é pública. Enquanto GET /api/auth/me está em voo, quem nunca logou
 * neste navegador já vê a landing; quem tem a dica de sessão vê o spinner de
 * sempre, para não piscar a página de marketing antes do painel.
 */
function RootGate() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: async (): Promise<Me> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`);
      if (!res.ok) return UNAUTHENTICATED;
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return hasSessionHint() ? (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    ) : (
      <Landing />
    );
  }
  if (me?.authenticated) {
    return <RoleRouter />;
  }
  return <Landing />;
}

function LoginGate() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: async (): Promise<Me> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/me`);
      if (!res.ok) return UNAUTHENTICATED;
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (me?.authenticated) {
    return <Redirect to="/" />;
  }
  return <Login />;
}
```

E trocar `Router` por:

```tsx
function Router() {
  return (
    <Switch>
      <Route path="/display/:deviceKey" component={Display} />
      <Route path="/" component={RootGate} />
      <Route path="/login" component={LoginGate} />
      <Route>
        <RoleRouter />
      </Route>
    </Switch>
  );
}
```

No `useEffect` que escuta `UNAUTHORIZED_EVENT` dentro de `RoleRouter`, acrescentar a limpeza da dica. O corpo atual do handler é:

```tsx
    const onUnauthorized = () => {
      queryClient.setQueryData(['auth'], UNAUTHENTICATED);
    };
```

passa a ser:

```tsx
    const onUnauthorized = () => {
      clearSessionHint();
      queryClient.setQueryData(['auth'], UNAUTHENTICATED);
    };
```

- [ ] **Step 4: Fazer o login navegar**

Em `artifacts/signage/src/pages/login.tsx`, acrescentar aos imports:

```tsx
import { useLocation } from 'wouter';
import { markSessionStarted } from '@/lib/session-hint';
```

Dentro de `Login()`, acrescentar abaixo de `const queryClient = useQueryClient();`:

```tsx
  const [, setLocation] = useLocation();
```

No `handleSubmit`, a linha atual:

```tsx
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
```

passa a ser:

```tsx
      markSessionStarted();
      await queryClient.invalidateQueries({ queryKey: ['auth'] });
      setLocation('/');
```

- [ ] **Step 5: Typecheck e build**

Run: `pnpm run typecheck && pnpm --filter @workspace/signage run build`

Expected: sem erros.

- [ ] **Step 6: Verificação manual do roteamento**

Subir o ambiente: `./dev.sh`

Percorrer, em uma janela anônima do navegador:

1. `http://localhost:21153/` → landing, **sem spinner antes**.
2. `http://localhost:21153/clients` sem sessão → redireciona para `/login`.
3. `http://localhost:21153/login` → formulário de login.
4. Logar como admin → cai em `/clients`.
5. Voltar para `/` já logado → vai para o painel, **sem piscar a landing**.
6. `/login` já logado → redireciona para `/`.
7. `http://localhost:21153/display/QUALQUER_KEY` → segue funcionando sem sessão.
8. Apagar o cookie de sessão pelo devtools e clicar em algo que chame a API → volta para `/login`.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/lib/session-hint.ts \
  artifacts/signage/src/pages/landing.tsx \
  artifacts/signage/src/App.tsx \
  artifacts/signage/src/pages/login.tsx
git commit -m "feat(signage): raiz publica e login em /login"
```

---

### Task 3: Conteúdo central e hook dos números

**Files:**
- Create: `artifacts/signage/src/lib/landing-content.ts`
- Create: `artifacts/signage/src/hooks/use-public-stats.ts`

**Interfaces:**
- Consumes: `GET /api/public/stats` (Tarefa 1).
- Produces: `BRAND`, `WHATSAPP_NUMBER`, `whatsappUrl(message)`, `LANDING`, `usePublicStats()` — usados por todas as tarefas de 4 a 8.

- [ ] **Step 1: Escrever o conteúdo**

Criar `artifacts/signage/src/lib/landing-content.ts`:

```ts
/**
 * Todo o texto da landing mora aqui.
 *
 * Copy e ordem de seção mudam muito mais que o layout: editar a página não
 * pode exigir abrir um componente. Nada de texto de interface dentro de .tsx
 * em components/landing.
 */
export const BRAND = 'Smart Vale TV';

/** Número internacional completo, como o wa.me exige (55 + DDD + número). */
export const WHATSAPP_NUMBER = '5513997478695';

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const LANDING = {
  nav: [
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#diferenciais', label: 'Por que a gente' },
    { href: '#duvidas', label: 'Dúvidas' },
  ],
  hero: {
    title: 'Anuncie nas telas do comércio da região — ou coloque a sua para trabalhar.',
    subtitle:
      'A Smart Vale TV leva anúncios para TVs instaladas dentro de estabelecimentos. Quem anuncia entra na rotina do cliente; quem tem um ponto ganha com a tela que já está na parede.',
    doors: [
      {
        id: 'anunciante',
        eyebrow: 'Para quem quer aparecer',
        title: 'Quero anunciar',
        description: 'Sua marca rodando nas telas onde o seu público já passa todo dia.',
        cta: 'Falar no WhatsApp',
        message: 'Olá! Quero anunciar na Smart Vale TV.',
      },
      {
        id: 'ponto',
        eyebrow: 'Para quem tem um espaço',
        title: 'Tenho um ponto',
        description: 'A TV do seu estabelecimento passa a gerar receita, sem trabalho para você.',
        cta: 'Falar no WhatsApp',
        message: 'Olá! Tenho um ponto e quero receber uma TV da Smart Vale TV.',
      },
    ],
  },
  stats: {
    plays30d: 'exibições nos últimos 30 dias',
    activeScreens: 'telas ativas',
    clients: 'estabelecimentos parceiros',
    segments: 'ramos atendidos',
  },
  howItWorks: {
    title: 'Como funciona',
    tracks: [
      {
        id: 'anunciante',
        title: 'Se você quer anunciar',
        steps: [
          {
            title: 'Escolha onde aparecer',
            body: 'Todas as telas, só um ramo de estabelecimento, ou telas escolhidas a dedo.',
          },
          {
            title: 'Mande a arte',
            body: 'Imagem ou vídeo. A gente publica na programação das telas combinadas.',
          },
          {
            title: 'Acompanhe o resultado',
            body: 'Exibições contadas por peça e leituras do QR code do seu anúncio.',
          },
        ],
      },
      {
        id: 'ponto',
        title: 'Se você tem um ponto',
        steps: [
          {
            title: 'A TV entra na parede',
            body: 'Você cede o espaço e a energia. O equipamento e a programação são nossos.',
          },
          {
            title: 'Ela roda sozinha',
            body: 'A programação chega pela internet do local e passa o dia inteiro, sem ninguém operar.',
          },
          {
            title: 'Seu concorrente não entra',
            body: 'Anúncio do mesmo ramo do seu negócio é bloqueado automaticamente na sua tela.',
          },
        ],
      },
    ],
  },
  differentials: {
    title: 'Por que a Smart Vale TV',
    items: [
      {
        title: 'QR code que prova o resultado',
        body: 'Cada campanha tem o seu QR. As leituras são contadas de verdade, com acesso de robô descartado.',
      },
      {
        title: 'Concorrente não divide a tela',
        body: 'Anúncio de um ramo não toca na TV de um estabelecimento do mesmo ramo. A regra é do sistema, não da boa vontade.',
      },
      {
        title: 'Você escolhe o alvo',
        body: 'Campanha para toda a rede, para um ramo específico ou para as telas que você escolher.',
      },
      {
        title: 'Relatório por peça',
        body: 'Exibições e leituras anúncio a anúncio, não só um número total no fim do mês.',
      },
    ],
  },
  faq: {
    title: 'Dúvidas',
    items: [
      {
        q: 'Preciso comprar a TV?',
        a: 'Não. Para ser ponto, você cede o espaço e a energia; o equipamento e a programação são nossos.',
      },
      {
        q: 'Quanto custa anunciar?',
        a: 'Depende de quantas telas e por quanto tempo. Chame no WhatsApp que a gente monta a proposta.',
      },
      {
        q: 'Como sei que meu anúncio apareceu mesmo?',
        a: 'Cada exibição fica registrada. Você recebe o número de exibições por peça, não uma estimativa.',
      },
      {
        q: 'Para que serve o QR code no anúncio?',
        a: 'Ele leva o cliente direto ao seu link e conta quantas pessoas leram.',
      },
      {
        q: 'Meu concorrente pode aparecer na minha loja?',
        a: 'Não. Anúncio do mesmo ramo do estabelecimento é bloqueado automaticamente.',
      },
      {
        q: 'Preciso de internet no ponto?',
        a: 'Sim. A TV usa a internet do local para receber a programação.',
      },
    ],
  },
  finalCta: {
    title: 'Vamos conversar',
    subtitle: 'Diga de que lado você está e a gente responde no WhatsApp.',
  },
  footer: {
    tagline: 'Anúncios em TVs dentro do comércio da região.',
    loginLabel: 'Entrar no painel',
  },
} as const;
```

- [ ] **Step 2: Escrever o hook**

Criar `artifacts/signage/src/hooks/use-public-stats.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

export interface PublicStats {
  plays30d: number;
  activeScreens: number;
  clients: number;
  segments: number;
}

/**
 * Números da faixa de prova da landing.
 *
 * Falha vira `null`, nunca erro na tela: uma página pública de captação não
 * pode contar ao visitante que a API caiu. Quem renderiza decide sumir com a
 * faixa.
 */
export function usePublicStats() {
  return useQuery<PublicStats | null>({
    queryKey: ['public-stats'],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/public/stats`);
        if (!res.ok) return null;
        return (await res.json()) as PublicStats;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`

Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/src/lib/landing-content.ts artifacts/signage/src/hooks/use-public-stats.ts
git commit -m "feat(signage): conteudo e numeros da landing"
```

---

### Task 4: Topo e rodapé

**Files:**
- Create: `artifacts/signage/src/components/landing/site-header.tsx`
- Create: `artifacts/signage/src/components/landing/site-footer.tsx`
- Modify: `artifacts/signage/src/pages/landing.tsx`

**Interfaces:**
- Consumes: `BRAND`, `LANDING`, `whatsappUrl` (Tarefa 3).
- Produces: `<SiteHeader />` e `<SiteFooter />`.

- [ ] **Step 1: Escrever o topo**

Criar `artifacts/signage/src/components/landing/site-header.tsx`:

```tsx
import { MonitorPlay } from 'lucide-react';
import { Link } from 'wouter';
import { BRAND, LANDING } from '@/lib/landing-content';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <span className="flex items-center gap-2 font-semibold tracking-tight text-primary">
          <MonitorPlay className="h-5 w-5" aria-hidden="true" />
          {BRAND}
        </span>

        <nav aria-label="Seções" className="hidden items-center gap-6 md:flex">
          {LANDING.nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-zinc-600 transition-colors hover:text-zinc-900"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/login"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900"
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Escrever o rodapé**

Criar `artifacts/signage/src/components/landing/site-footer.tsx`:

```tsx
import { Link } from 'wouter';
import { BRAND, LANDING, WHATSAPP_NUMBER, whatsappUrl } from '@/lib/landing-content';

const CONTACT_MESSAGE = 'Olá! Vim pelo site da Smart Vale TV.';

function prettyPhone(raw: string): string {
  // 5513997478695 → (13) 99747-8695
  const national = raw.replace(/^55/, '');
  return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-zinc-900">{BRAND}</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-600">{LANDING.footer.tagline}</p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <a
            href={whatsappUrl(CONTACT_MESSAGE)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            WhatsApp {prettyPhone(WHATSAPP_NUMBER)}
          </a>
          <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
            {LANDING.footer.loginLabel}
          </Link>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Montar na página**

Substituir o conteúdo de `artifacts/signage/src/pages/landing.tsx` por:

```tsx
import { SiteHeader } from '@/components/landing/site-header';
import { SiteFooter } from '@/components/landing/site-footer';

/**
 * Porta de entrada pública. Este arquivo só compõe: todo texto vive em
 * lib/landing-content.ts e cada seção tem o seu componente.
 *
 * Tema claro fixo, sem depender da classe .dark — página pública de captação
 * não deveria mudar de cara conforme a preferência de sistema de quem chega.
 */
export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-white text-zinc-900">
      <SiteHeader />
      <main>{/* seções entram nas tarefas 5 a 8 */}</main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck e build**

Run: `pnpm run typecheck && pnpm --filter @workspace/signage run build`

Expected: sem erros.

- [ ] **Step 5: Verificação manual**

Com `./dev.sh` rodando, abrir `http://localhost:21153/`:

1. Topo fixo ao rolar, com o nome e o botão Entrar.
2. Clicar em **Entrar** leva a `/login`.
3. Clicar no WhatsApp do rodapé abre `wa.me` com a mensagem preenchida.
4. Em 375px, as âncoras do meio somem e o topo continua legível.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/landing/site-header.tsx \
  artifacts/signage/src/components/landing/site-footer.tsx \
  artifacts/signage/src/pages/landing.tsx
git commit -m "feat(signage): topo e rodape da landing"
```

---

### Task 5: Hero com duas portas e o mockup da TV

**Files:**
- Create: `artifacts/signage/src/components/landing/tv-mockup.tsx`
- Create: `artifacts/signage/src/components/landing/hero.tsx`
- Modify: `artifacts/signage/src/pages/landing.tsx`

**Interfaces:**
- Consumes: `LANDING`, `whatsappUrl` (Tarefa 3).
- Produces: `<Hero />`, `<TvMockup />`.

- [ ] **Step 1: Desenhar a TV**

Criar `artifacts/signage/src/components/landing/tv-mockup.tsx`:

```tsx
import { QrCode } from 'lucide-react';

/**
 * A TV rodando um slide, desenhada em CSS.
 *
 * Não temos fotografia de ponto instalado, e banco de imagens venderia uma
 * rede que não é a nossa. Isto reproduz o que a tela realmente mostra: arte de
 * fundo, faixa de legenda e a caixa branca do QR com o rótulo SAIBA +, os
 * mesmos elementos de pages/display.tsx.
 */
export function TvMockup() {
  return (
    <div className="w-full max-w-md" aria-hidden="true">
      <div className="rounded-xl border-4 border-zinc-800 bg-zinc-800 shadow-lg">
        <div className="relative aspect-video overflow-hidden rounded-md bg-gradient-to-br from-primary via-indigo-600 to-indigo-900">
          <div className="absolute bottom-3 left-3 right-24 truncate rounded bg-black/55 px-3 py-2 text-sm font-medium text-white">
            Seu anúncio aqui
          </div>
          <div className="absolute bottom-3 right-3 rounded bg-white p-1.5 text-center">
            <span className="block text-[0.6rem] font-semibold tracking-[0.12em] text-black">
              SAIBA +
            </span>
            <QrCode className="mt-1 h-10 w-10 text-black" />
          </div>
        </div>
      </div>
      <div className="mx-auto h-4 w-24 rounded-b-lg bg-zinc-800" />
    </div>
  );
}
```

- [ ] **Step 2: Escrever o hero**

Criar `artifacts/signage/src/components/landing/hero.tsx`:

```tsx
import { LANDING, whatsappUrl } from '@/lib/landing-content';
import { TvMockup } from './tv-mockup';

export function Hero() {
  return (
    <section className="border-b border-zinc-200">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-2 md:items-center md:py-20">
        <div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
            {LANDING.hero.title}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600">
            {LANDING.hero.subtitle}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {LANDING.hero.doors.map((door) => (
              <div
                key={door.id}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <span className="text-xs font-medium uppercase tracking-wide text-primary">
                  {door.eyebrow}
                </span>
                <h2 className="mt-2 text-lg font-semibold text-zinc-900">{door.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">
                  {door.description}
                </p>
                <a
                  href={whatsappUrl(door.message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  {door.cta}
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <TvMockup />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Montar na página**

Em `artifacts/signage/src/pages/landing.tsx`, acrescentar o import:

```tsx
import { Hero } from '@/components/landing/hero';
```

E trocar o `<main>` por:

```tsx
      <main>
        <Hero />
      </main>
```

- [ ] **Step 4: Typecheck e build**

Run: `pnpm run typecheck && pnpm --filter @workspace/signage run build`

Expected: sem erros.

- [ ] **Step 5: Verificação manual**

1. Em 375px, os dois cards empilham e a TV aparece abaixo do texto.
2. Cada CTA abre o WhatsApp com a mensagem **diferente** — conferir que a porta "Tenho um ponto" não manda a mensagem de anunciante.
3. A legenda do mockup não vaza por cima da caixa do QR.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/landing/tv-mockup.tsx \
  artifacts/signage/src/components/landing/hero.tsx \
  artifacts/signage/src/pages/landing.tsx
git commit -m "feat(signage): hero com as duas portas"
```

---

### Task 6: Faixa de números

**Files:**
- Create: `artifacts/signage/src/components/landing/stats-band.tsx`
- Modify: `artifacts/signage/src/pages/landing.tsx`

**Interfaces:**
- Consumes: `usePublicStats()` (Tarefa 3), `LANDING.stats` (Tarefa 3).
- Produces: `<StatsBand />`.

- [ ] **Step 1: Escrever a faixa**

Criar `artifacts/signage/src/components/landing/stats-band.tsx`:

```tsx
import { LANDING } from '@/lib/landing-content';
import { usePublicStats } from '@/hooks/use-public-stats';

const format = new Intl.NumberFormat('pt-BR');

/**
 * Prova numérica, vinda do banco.
 *
 * Duas regras decidem se esta faixa ajuda ou atrapalha:
 *
 * 1. Falha da API não derruba a página: sem dado, a faixa inteira não existe.
 *    Nada de spinner ou mensagem de erro — o visitante não precisa saber que
 *    existe uma API.
 * 2. Zero não vai para a tela: "0 telas ativas" numa página que vende rede de
 *    telas é pior que a ausência do número. Enquanto a rede for pequena, a
 *    faixa aparece parcial — é o preço de puxar do banco em vez de fixar
 *    valores no código.
 */
export function StatsBand() {
  const { data } = usePublicStats();
  if (!data) return null;

  const items = [
    { value: data.plays30d, label: LANDING.stats.plays30d },
    { value: data.activeScreens, label: LANDING.stats.activeScreens },
    { value: data.clients, label: LANDING.stats.clients },
    { value: data.segments, label: LANDING.stats.segments },
  ].filter((item) => item.value > 0);

  if (items.length === 0) return null;

  return (
    <section className="border-b border-zinc-200 bg-zinc-50">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-10 md:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="sr-only">{item.label}</dt>
            <dd>
              <span className="block text-3xl font-semibold tracking-tight text-primary">
                {format.format(item.value)}
              </span>
              <span className="mt-1 block text-sm text-zinc-600">{item.label}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

- [ ] **Step 2: Montar na página**

Em `artifacts/signage/src/pages/landing.tsx`, acrescentar o import:

```tsx
import { StatsBand } from '@/components/landing/stats-band';
```

E acrescentar dentro do `<main>`, abaixo de `<Hero />`:

```tsx
        <StatsBand />
```

- [ ] **Step 3: Typecheck e build**

Run: `pnpm run typecheck && pnpm --filter @workspace/signage run build`

Expected: sem erros.

- [ ] **Step 4: Verificação manual — inclusive com a API derrubada**

1. Com a API no ar e dados no banco: os números aparecem formatados em pt-BR (`1.204`, não `1,204`).
2. **Parar a API** (`Ctrl+C` no processo do api-server) e recarregar a landing: a faixa **some** e a página continua inteira, sem erro visível e sem espaço em branco no lugar.
3. Com o banco zerado: a faixa some por inteiro em vez de mostrar quatro zeros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/landing/stats-band.tsx artifacts/signage/src/pages/landing.tsx
git commit -m "feat(signage): faixa de numeros da landing"
```

---

### Task 7: Como funciona e diferenciais

**Files:**
- Create: `artifacts/signage/src/components/landing/how-it-works.tsx`
- Create: `artifacts/signage/src/components/landing/differentials.tsx`
- Modify: `artifacts/signage/src/pages/landing.tsx`

**Interfaces:**
- Consumes: `LANDING.howItWorks`, `LANDING.differentials` (Tarefa 3).
- Produces: `<HowItWorks />`, `<Differentials />`. O `id="como-funciona"` e o `id="diferenciais"` são os alvos das âncoras do topo (Tarefa 4).

- [ ] **Step 1: Escrever "como funciona"**

Criar `artifacts/signage/src/components/landing/how-it-works.tsx`:

```tsx
import { LANDING } from '@/lib/landing-content';

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-20 border-b border-zinc-200">
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {LANDING.howItWorks.title}
        </h2>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {LANDING.howItWorks.tracks.map((track) => (
            <div key={track.id}>
              <h3 className="text-lg font-semibold text-primary">{track.title}</h3>
              <ol className="mt-5 space-y-5">
                {track.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-medium text-zinc-900">{step.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-600">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Escrever os diferenciais**

Criar `artifacts/signage/src/components/landing/differentials.tsx`:

```tsx
import { LANDING } from '@/lib/landing-content';

/**
 * Os quatro itens descrevem comportamento que o sistema realmente tem: QR por
 * campanha com bot descartado, bloqueio de concorrente do mesmo ramo, alvo por
 * segmento ou por telas escolhidas, e relatório por peça. Nada aqui é promessa
 * de roadmap — se um comportamento mudar no produto, este texto muda junto.
 */
export function Differentials() {
  return (
    <section id="diferenciais" className="scroll-mt-20 border-b border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {LANDING.differentials.title}
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {LANDING.differentials.items.map((item) => (
            <div key={item.title} className="rounded-lg border border-zinc-200 bg-white p-6">
              <h3 className="font-semibold text-zinc-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Montar na página**

Em `artifacts/signage/src/pages/landing.tsx`, acrescentar os imports:

```tsx
import { HowItWorks } from '@/components/landing/how-it-works';
import { Differentials } from '@/components/landing/differentials';
```

E acrescentar dentro do `<main>`, abaixo de `<StatsBand />`:

```tsx
        <HowItWorks />
        <Differentials />
```

- [ ] **Step 4: Typecheck e build**

Run: `pnpm run typecheck && pnpm --filter @workspace/signage run build`

Expected: sem erros.

- [ ] **Step 5: Verificação manual**

1. As âncoras "Como funciona" e "Por que a gente" do topo rolam até a seção certa, sem o título ficar escondido atrás do cabeçalho fixo.
2. Em 375px, as duas trilhas empilham e a numeração continua alinhada.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/landing/how-it-works.tsx \
  artifacts/signage/src/components/landing/differentials.tsx \
  artifacts/signage/src/pages/landing.tsx
git commit -m "feat(signage): como funciona e diferenciais"
```

---

### Task 8: Dúvidas e CTA final

**Files:**
- Create: `artifacts/signage/src/components/landing/faq.tsx`
- Create: `artifacts/signage/src/components/landing/final-cta.tsx`
- Modify: `artifacts/signage/src/pages/landing.tsx`

**Interfaces:**
- Consumes: `LANDING.faq`, `LANDING.finalCta`, `LANDING.hero.doors`, `whatsappUrl` (Tarefa 3); `Accordion` de `@/components/ui/accordion`.
- Produces: `<Faq />`, `<FinalCta />`. O `id="duvidas"` é alvo da âncora do topo (Tarefa 4).

- [ ] **Step 1: Escrever o FAQ**

Criar `artifacts/signage/src/components/landing/faq.tsx`:

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LANDING } from '@/lib/landing-content';

export function Faq() {
  return (
    <section id="duvidas" className="scroll-mt-20 border-b border-zinc-200">
      <div className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {LANDING.faq.title}
        </h2>

        <Accordion type="single" collapsible className="mt-8">
          {LANDING.faq.items.map((item, index) => (
            <AccordionItem key={item.q} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base font-medium text-zinc-900">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-zinc-600">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Escrever o CTA final**

Criar `artifacts/signage/src/components/landing/final-cta.tsx`:

```tsx
import { LANDING, whatsappUrl } from '@/lib/landing-content';

/**
 * Repete as duas portas do hero para quem rolou a página inteira. As mensagens
 * são as mesmas do hero, de propósito: a origem do contato continua
 * identificada de qual lado a pessoa clicou.
 */
export function FinalCta() {
  return (
    <section className="bg-primary">
      <div className="mx-auto max-w-3xl px-5 py-14 text-center md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {LANDING.finalCta.title}
        </h2>
        <p className="mt-3 text-base text-white/80">{LANDING.finalCta.subtitle}</p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {LANDING.hero.doors.map((door) => (
            <a
              key={door.id}
              href={whatsappUrl(door.message)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-white px-5 py-3 text-sm font-semibold text-primary transition-opacity hover:opacity-90"
            >
              {door.title}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Montar na página**

Em `artifacts/signage/src/pages/landing.tsx`, acrescentar os imports:

```tsx
import { Faq } from '@/components/landing/faq';
import { FinalCta } from '@/components/landing/final-cta';
```

E acrescentar dentro do `<main>`, abaixo de `<Differentials />`:

```tsx
        <Faq />
        <FinalCta />
```

- [ ] **Step 4: Typecheck e build**

Run: `pnpm run typecheck && pnpm --filter @workspace/signage run build`

Expected: sem erros.

- [ ] **Step 5: Verificação manual**

1. A âncora "Dúvidas" do topo chega na seção certa.
2. Abrir e fechar perguntas funciona pelo teclado (Tab até a pergunta, Enter para abrir).
3. Os dois botões brancos sobre o fundo azul continuam legíveis, e cada um leva à sua mensagem.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/landing/faq.tsx \
  artifacts/signage/src/components/landing/final-cta.tsx \
  artifacts/signage/src/pages/landing.tsx
git commit -m "feat(signage): duvidas e cta final"
```

---

### Task 9: Meta tags públicas e verificação de ponta a ponta

**Files:**
- Modify: `artifacts/signage/index.html`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: nada consumido por tarefas seguintes — esta é a última.

- [ ] **Step 1: Trocar as meta tags**

Em `artifacts/signage/index.html`, as tags atuais descrevem o painel interno, que é privado e ninguém de fora acessa. Trocar título e descrições pelo produto público:

```html
    <title>Smart Vale TV — anúncios nas telas do comércio</title>
    <meta name="description" content="Anuncie em TVs instaladas dentro de estabelecimentos da região, ou coloque a TV do seu ponto para gerar receita." />
    <meta property="og:title" content="Smart Vale TV — anúncios nas telas do comércio" />
    <meta property="og:description" content="Anuncie em TVs instaladas dentro de estabelecimentos da região, ou coloque a TV do seu ponto para gerar receita." />
    <meta name="twitter:title" content="Smart Vale TV — anúncios nas telas do comércio" />
    <meta name="twitter:description" content="Anuncie em TVs instaladas dentro de estabelecimentos da região, ou coloque a TV do seu ponto para gerar receita." />
```

Manter as demais tags do arquivo como estão (charset, viewport, preconnect e a folha de fontes).

- [ ] **Step 2: Validação completa do workspace**

Run: `pnpm run typecheck`

Expected: sem erros.

Run: `PORT=8081 BASE_PATH=/ pnpm run build`

Expected: build de todos os pacotes sem erro. (As variáveis são exigidas pelo `mockup-sandbox` durante o build local, conforme o README.)

Run: `pnpm --filter @workspace/api-server run test`

Expected: toda a suíte passa, incluindo os cinco testes de `public-stats`.

- [ ] **Step 3: Roteiro final na aplicação**

Com `./dev.sh` rodando, em janela anônima:

1. `/` → landing completa: topo, hero, números, como funciona, diferenciais, dúvidas, CTA, rodapé.
2. Rolar a página inteira em 375px: nenhuma barra de rolagem horizontal.
3. Cada um dos quatro CTAs de WhatsApp (dois no hero, dois no CTA final) abre a conversa com a mensagem correta do seu lado.
4. **Parar a API** e recarregar `/`: a faixa de números some, todo o resto continua.
5. Religar a API. Entrar em `/login` com o admin → cai no painel.
6. Voltar em `/` logado → painel, sem piscar a landing.
7. Sair do navegador anônimo, abrir `/` de novo → landing imediata, sem spinner.

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/index.html
git commit -m "feat(signage): meta tags do produto publico"
```

- [ ] **Step 5: Abrir o PR**

```bash
git push -u origin feat/landing-page
```

O PR precisa mencionar, no corpo, os dois pontos que dependem de confirmação humana antes de ir para produção: a capitalização de **Smart Vale TV** e o DDI acrescentado ao WhatsApp (**5513997478695**).

---

## Notas de execução

**Ordem.** A Tarefa 1 é independente e pode ir primeiro ou em paralelo. As Tarefas 4 a 8 dependem da 3 (conteúdo e hook) e da 2 (a rota existir). Entre si, 4 a 8 são independentes: cada uma cria seus componentes e acrescenta uma linha em `landing.tsx`.

**Conflito previsível.** As tarefas 4 a 8 tocam todas o mesmo `pages/landing.tsx`. Executadas em paralelo, vão conflitar nesse arquivo — cada conflito é só a ordem dos elementos dentro de `<main>`, resolvida mantendo a ordem final: `Hero`, `StatsBand`, `HowItWorks`, `Differentials`, `Faq`, `FinalCta`.

**O que não fazer.** Não inventar número, depoimento, logo de cliente ou selo. Não acrescentar preço. Não criar formulário nem gravar dado de visitante — a conversão é o WhatsApp, e é isso que mantém a página fora de qualquer discussão de dados pessoais.
