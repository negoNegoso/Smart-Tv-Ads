# Importador de perfil do Instagram — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com a URL de um perfil do Instagram, o admin escolhe os posts e o agente entrega empresa cadastrada, campanha pausada e uma peça por mídia (foto como `image`, reel como `youtube_video`), sem duplicar nada ao rodar de novo.

**Architecture:** A plataforma ganha duas colunas (`companies.instagram`, `announcements.external_ref`) e três aberturas pequenas na API (filtro por @, `externalRef` no `POST /announcements`, `isActive` no `POST /campaigns`). Um script local em `scripts/src/instagram/` lê o perfil com `gallery-dl`, sobe reels no YouTube pela Data API e grava tudo pela API HTTP como admin, guiado por um `plano.json` retomável. Uma skill do Claude Code orquestra o script e faz as perguntas.

**Tech Stack:** Express 5 + drizzle + zod 3 (api-server), Postgres + drizzle-kit (lib/db), OpenAPI + orval (lib/api-spec), React + testing-library (signage), Node 22 + tsx + vitest (scripts), `gallery-dl` + `yt-dlp` + `ffmpeg` (máquina do admin), YouTube Data API v3 por `fetch`.

**Spec:** `docs/superpowers/specs/2026-09-30-importador-instagram-design.md`

## Global Constraints

- Branch `feat/importador-instagram`; commits no formato `tipo(escopo): descrição em português`, imperativo, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como UTF-8 real, nunca escape `\uXXXX` (nem em regex: usar `\p{Diacritic}` com flag `u`).
- Não editar `versionName`/`versionCode` nem criar tag. A TV (`public/tv.html`, app Android) **não muda**.
- Código gerado (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`) é commitado; regerar com `pnpm --filter @workspace/api-spec run codegen`, nunca editar à mão.
- Migration gerada com `cd lib/db && DATABASE_URL=postgres://x@localhost/x pnpm run generate` (o banco não é acessado; o deploy aplica via `migrate.mjs`).
- `externalRef` tem o formato `instagram:<código-do-post>:<n>`, `n` a partir de 1.
- @ normalizado: minúsculas, sem `@`, sem URL, `^[a-z0-9._]{1,30}$`.
- Campanha criada pelo importador: `isActive: false`, hoje + 30 dias, `contractValue: 0`, `targetMode: "all"`.
- Peça de reel: `mediaKind: "youtube_video"`, `playbackMode: "natural"`, `audioMode: "muted"`. Peça de imagem: `duration: 10`, `showText: false`.
- Título da peça: `@handle · AAAA-MM-DD · n`. `destinationUrl` da peça na campanha = URL do post.
- Orientação: `altura > largura` → `portrait`; senão `landscape` (quadrado é `landscape`).
- Vídeo no YouTube: privacidade `unlisted`.
- Limite de upload de imagem pelo script: 4 000 000 bytes (a Vercel corta o corpo em 4,5 MB).
- Mensagens: `Instagram inválido.`, `Já existe empresa com esse Instagram.`, `Peça já importada`, `Referência externa inválida`.
- O script nunca fala com o banco: só API HTTP. Nenhum teste automático toca Instagram, YouTube ou a plataforma real.
- Segredos só em `.env.importador` (coberto por `.env*` no `.gitignore`); estado de trabalho só em `.instagram-import/`.

## Desvios da spec (já refletidos nela)

- Credenciais em `.env.importador`, não `.env.local`: o `vercel env pull` reescreve o `.env.local`.
- `baixar(postUrl, n, destino)` no lugar de `baixar(midia, destino)`, e `Midia` sem `url`: a URL direta do CDN expira; o download refaz a leitura pelo link do post.
- Subcomando extra `planejar`: a skill não escreve JSON à mão.
- `yt-dlp` entra nos pré-requisitos: sem ele o `gallery-dl` baixa reel em qualidade menor.

## Review Focus

1. **Reel que o YouTube tranca como privado** — projeto do Google Cloud sem auditoria pode ter o vídeo forçado para `private`, e vídeo privado não toca na TV. O envio confere `status.privacyStatus` na resposta e falha com o id do vídeo, em vez de criar peça muda de tela preta. Coberto na Task 10.
2. **Segunda execução depois de falha no meio** — não pode criar segunda empresa, segunda campanha, nem subir o mesmo reel de novo (cota de ~6/dia). Coberto na Task 12 (empresa/campanha gravadas no plano na hora; `videoId` reaproveitado; `409` vira `pulada` mas ainda vincula).
3. **Vincular peça apagando o que a campanha já tinha** — `PATCH /campaigns/:id` substitui a lista de peças e o alvo. O cliente reenvia a campanha inteira com a união dos ids. Coberto na Task 9.
4. **URL que não é de perfil** — link de post (`/p/…`), de reel, `explore`, outro domínio: tem de dar erro claro, não importar o perfil errado. Coberto na Task 1.
5. **Post com trilha sonora ou carrossel misto** — o `gallery-dl` emite a música como "arquivo" extra com o mesmo `num`; carrossel mistura foto e vídeo. Áudio é ignorado e cada item vira a mídia certa. Coberto na Task 7.

---

### Task 1: Normalização do @ e referência externa

**Files:**
- Create: `lib/db/src/instagram.ts`
- Modify: `lib/db/package.json` (bloco `exports`)
- Test: `artifacts/api-server/src/lib/__tests__/instagram-handle.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizeInstagramHandle(input: string): string | null`, `instagramExternalRef(codigo: string, n: number): string`, importáveis de `@workspace/db/instagram`.

- [ ] **Step 1: Write the failing test**

Criar `artifacts/api-server/src/lib/__tests__/instagram-handle.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { instagramExternalRef, normalizeInstagramHandle } from "@workspace/db/instagram";

describe("normalizeInstagramHandle", () => {
  it("aceita @nome, nome e URL do perfil", () => {
    expect(normalizeInstagramHandle("@PadariaCentral")).toBe("padariacentral");
    expect(normalizeInstagramHandle("  padaria.central_ ")).toBe("padaria.central_");
    expect(normalizeInstagramHandle("https://www.instagram.com/Padaria.Central/?hl=pt")).toBe("padaria.central");
    expect(normalizeInstagramHandle("instagram.com/padariacentral")).toBe("padariacentral");
    expect(normalizeInstagramHandle("https://instagram.com/padariacentral/reels/")).toBe("padariacentral");
  });

  it("recusa URL que não é de perfil", () => {
    expect(normalizeInstagramHandle("https://www.instagram.com/p/DAbc123/")).toBeNull();
    expect(normalizeInstagramHandle("https://www.instagram.com/reel/DAbc123/")).toBeNull();
    expect(normalizeInstagramHandle("https://www.instagram.com/explore/")).toBeNull();
    expect(normalizeInstagramHandle("https://www.instagram.com/")).toBeNull();
    expect(normalizeInstagramHandle("https://facebook.com/padariacentral")).toBeNull();
  });

  it("recusa @ com caractere inválido, vazio ou longo demais", () => {
    expect(normalizeInstagramHandle("")).toBeNull();
    expect(normalizeInstagramHandle("   ")).toBeNull();
    expect(normalizeInstagramHandle("padaria central")).toBeNull();
    expect(normalizeInstagramHandle("padaria-central")).toBeNull();
    expect(normalizeInstagramHandle("a".repeat(31))).toBeNull();
  });
});

describe("instagramExternalRef", () => {
  it("monta a referência estável da mídia", () => {
    expect(instagramExternalRef("DAbc123", 2)).toBe("instagram:DAbc123:2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/instagram-handle.test.ts`
Expected: FAIL — não resolve `@workspace/db/instagram`.

- [ ] **Step 3: Write minimal implementation**

Criar `lib/db/src/instagram.ts`:

```ts
/**
 * @ do Instagram e referência externa das peças importadas. Fica fora de
 * `schema/` e sem importar o banco, para a API, o script do importador e os
 * testes usarem sem DATABASE_URL.
 */
const HANDLE = /^[a-z0-9._]{1,30}$/;

// Primeiro segmento de caminho que nunca é um perfil.
const RESERVADOS = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct"]);

/**
 * Aceita `@nome`, `nome` ou a URL do perfil e devolve o @ em minúsculas.
 * `null` quando não dá para ter certeza de que é um perfil: link de post,
 * outro domínio, caractere fora do que o Instagram aceita.
 */
export function normalizeInstagramHandle(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;

  const temProtocolo = /^https?:\/\//i.test(raw);
  if (temProtocolo || /^(www\.)?instagram\.com\//i.test(raw)) {
    let url: URL;
    try {
      url = new URL(temProtocolo ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    if (url.hostname.replace(/^www\./, "").toLowerCase() !== "instagram.com") return null;
    const [primeiro] = url.pathname.split("/").filter(Boolean);
    if (!primeiro) return null;
    raw = primeiro;
  }

  const handle = raw.replace(/^@/, "").toLowerCase();
  return HANDLE.test(handle) && !RESERVADOS.has(handle) ? handle : null;
}

/** Identidade da mídia importada: é o que impede peça duplicada. `n` começa em 1. */
export function instagramExternalRef(codigo: string, n: number): string {
  return `instagram:${codigo}:${n}`;
}
```

Em `lib/db/package.json`, acrescentar ao bloco `exports`, depois de `"./orientation"`:

```json
    "./orientation": "./src/orientation.ts",
    "./instagram": "./src/instagram.ts"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/instagram-handle.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/instagram.ts lib/db/package.json artifacts/api-server/src/lib/__tests__/instagram-handle.test.ts
git commit -m "feat(db): normaliza @ do Instagram e referência externa de peça

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Contrato — colunas, migration `0016` e OpenAPI

**Files:**
- Modify: `lib/db/src/schema/companies.ts`
- Modify: `lib/db/src/schema/announcements.ts`
- Create: `lib/db/drizzle/0016_*.sql` (gerado) e `lib/db/drizzle/meta/*` (gerado)
- Modify: `lib/api-spec/openapi.yaml`
- Modify (gerado): `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`
- Test: `artifacts/api-server/src/routes/__tests__/announcements-external-ref.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: colunas drizzle `companiesTable.instagram` e `announcementsTable.externalRef`; constraints `companies_instagram_unique` e `announcements_external_ref_unique`; campo `externalRef` em `Announcement` e `AnnouncementInput` do OpenAPI; campo `instagram` em `CompanyFields`; parâmetro `instagram` em `listCompanies`.

- [ ] **Step 1: Write the failing test**

Criar `artifacts/api-server/src/routes/__tests__/announcements-external-ref.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `externalRef` identifica a peça que veio de fora (importador do Instagram).
 * Sem ele na resposta o importador não sabe o que já entrou; sem a checagem no
 * POST, rodar de novo duplicaria a peça.
 */
const REF = "instagram:DAbc123:1";
const insertValues = vi.fn();
const putSpy = vi.fn();
let selectQueue: unknown[] = [];
let insertError: unknown = null;

const ROW = {
  id: 9,
  title: "@padariacentral · 2026-09-28 · 1",
  displayText: null,
  showText: false,
  imageUrl: null,
  mediaKind: "youtube_video",
  youtubeId: "abc123def45",
  playbackMode: "natural",
  audioMode: "muted",
  orientation: "portrait",
  isActive: true,
  displayOrder: 0,
  source: "admin",
  duration: 10,
  externalRef: REF,
  createdAt: new Date("2026-09-30T12:00:00Z"),
  updatedAt: new Date("2026-09-30T12:00:00Z"),
};

function makeChain(result: () => Promise<unknown>, onValues?: (v: unknown) => void) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    returning: () => chain,
    values: (v: unknown) => {
      onValues?.(v);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) => result().then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(() => Promise.resolve(selectQueue.shift())),
    insert: () =>
      makeChain(() => (insertError ? Promise.reject(insertError) : Promise.resolve([ROW])), insertValues),
  },
  announcementsTable: {
    id: "id",
    displayOrder: "displayOrder",
    createdAt: "createdAt",
    isActive: "isActive",
    externalRef: "externalRef",
  },
}));

vi.mock("../../lib/storage", () => ({
  mediaStore: () => ({ put: putSpy, remove: vi.fn(), get: vi.fn() }),
}));

async function buildApp(): Promise<Express> {
  process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
  process.env.MAX_UPLOAD_BYTES = "4000000";
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../announcements");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

beforeEach(() => {
  insertValues.mockReset();
  putSpy.mockReset();
  selectQueue = [];
  insertError = null;
});

describe("GET /announcements — externalRef", () => {
  it("devolve a referência externa de cada peça", async () => {
    selectQueue = [[ROW, { ...ROW, id: 10, externalRef: null }]];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/announcements");
    expect(res.status).toBe(200);
    expect(res.body[0].externalRef).toBe(REF);
    expect(res.body[1].externalRef).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/announcements-external-ref.test.ts`
Expected: FAIL — `res.body[0].externalRef` é `undefined` (o zod gerado descarta o campo desconhecido).

- [ ] **Step 3: Colunas no schema**

Em `lib/db/src/schema/companies.ts`, depois de `brandAccentColor`:

```ts
    brandAccentColor: text("brand_accent_color"),
    // @ do Instagram normalizado (minúsculas, sem "@", sem URL). É a chave que
    // o importador usa para reencontrar a empresa; único para o mesmo perfil
    // nunca virar duas empresas.
    instagram: text("instagram").unique("companies_instagram_unique"),
```

Em `lib/db/src/schema/announcements.ts`, depois de `duration`:

```ts
  duration: integer("duration").notNull().default(10),
  // Identidade da peça na origem quando ela vem de fora, no formato
  // "instagram:<código-do-post>:<n>". Nulo para peça subida à mão. Único para
  // importar o mesmo post duas vezes não duplicar a peça.
  externalRef: text("external_ref").unique("announcements_external_ref_unique"),
```

- [ ] **Step 4: Gerar a migration**

Run: `cd lib/db && DATABASE_URL=postgres://x@localhost/x pnpm run generate`
Expected: cria `lib/db/drizzle/0016_<nome>.sql` com conteúdo equivalente a:

```sql
ALTER TABLE "announcements" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_external_ref_unique" UNIQUE("external_ref");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_instagram_unique" UNIQUE("instagram");
```

Se o arquivo trouxer qualquer outra alteração (coluna removida, tabela recriada), parar: o snapshot estava fora de sincronia e isso precisa ser entendido antes de seguir.

- [ ] **Step 5: OpenAPI**

Em `lib/api-spec/openapi.yaml`:

No `GET /companies`, acrescentar o parâmetro depois de `q`:

```yaml
        - { name: q, in: query, required: false, schema: { type: string } }
        # @ exato, já normalizado pelo servidor (aceita "@nome", "nome" ou URL).
        - { name: instagram, in: query, required: false, schema: { type: string } }
```

Em `components.schemas.CompanyFields.properties`, depois de `lng`:

```yaml
        lng: { type: ["number", "null"] }
        # @ do Instagram, normalizado: minúsculas, sem "@", sem URL.
        instagram: { type: ["string", "null"] }
```

Em `components.schemas.Announcement.properties`, depois de `source`:

```yaml
        source: { type: string }
        # "instagram:<código-do-post>:<n>" para peça importada; nulo nas demais.
        externalRef: { type: string, nullable: true }
```

Em `components.schemas.AnnouncementInput.properties`, depois de `orientation`:

```yaml
        orientation: { type: string, enum: [landscape, portrait] }
        externalRef: { type: string }
```

No `POST /announcements`, acrescentar a resposta:

```yaml
        "400":
          description: Bad request
        "409":
          description: Peça já importada (mesmo externalRef); o corpo traz o id da existente
```

- [ ] **Step 6: Regerar os clientes**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro; `git status` mostra mudanças em `lib/api-zod/src/generated/` e `lib/api-client-react/src/generated/`.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/announcements-external-ref.test.ts`
Expected: PASS.

Run: `pnpm run typecheck`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/schema/companies.ts lib/db/src/schema/announcements.ts lib/db/drizzle lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/src/routes/__tests__/announcements-external-ref.test.ts
git commit -m "feat(db): colunas instagram da empresa e external_ref da peça

Migration 0016. O @ reencontra a empresa numa nova importação e a referência
externa impede peça duplicada.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API de empresas — campo, filtro e conflito de @

**Files:**
- Modify: `artifacts/api-server/src/lib/pg-errors.ts`
- Modify: `artifacts/api-server/src/lib/companies/input.ts`
- Modify: `artifacts/api-server/src/lib/companies/store.ts`
- Modify: `artifacts/api-server/src/routes/companies.ts`
- Test: `artifacts/api-server/src/lib/__tests__/pg-errors.test.ts`
- Test: `artifacts/api-server/src/lib/companies/__tests__/input.test.ts`
- Test: `artifacts/api-server/src/routes/__tests__/companies.test.ts`

**Interfaces:**
- Consumes: `normalizeInstagramHandle` de `@workspace/db/instagram` (Task 1); coluna `companiesTable.instagram` e constraint `companies_instagram_unique` (Task 2).
- Produces: `POST /companies` e `PATCH /companies/:id` aceitam `instagram` (string ou null) e devolvem o valor normalizado; `GET /companies?instagram=<x>` devolve lista com a empresa daquele @ ou `[]`; @ repetido responde `409 { error: "Já existe empresa com esse Instagram." }`; @ inválido responde `400 { error: "Instagram inválido." }`. `uniqueConstraintOf(err: unknown): string | undefined` em `pg-errors.ts`.

- [ ] **Step 1: Write the failing tests**

Em `artifacts/api-server/src/lib/__tests__/pg-errors.test.ts`, trocar o import e acrescentar o `describe` no fim do arquivo:

```ts
import { isUniqueViolation, uniqueConstraintOf } from "../pg-errors";
```

```ts
describe("uniqueConstraintOf", () => {
  it("lê o nome da constraint no topo do erro", () => {
    const err = Object.assign(new Error("duplicate key"), { code: "23505", constraint: "companies_instagram_unique" });
    expect(uniqueConstraintOf(err)).toBe("companies_instagram_unique");
  });

  it("lê o nome da constraint em err.cause (DrizzleQueryError)", () => {
    const err = Object.assign(new Error("Failed query"), {
      cause: { code: "23505", constraint: "advertisers_company_id_unique" },
    });
    expect(uniqueConstraintOf(err)).toBe("advertisers_company_id_unique");
  });

  it("erro que não é de unicidade não tem constraint", () => {
    const err = Object.assign(new Error("not null"), { code: "23502", constraint: "x" });
    expect(uniqueConstraintOf(err)).toBeUndefined();
    expect(uniqueConstraintOf(null)).toBeUndefined();
  });
});
```

Em `artifacts/api-server/src/lib/companies/__tests__/input.test.ts`, acrescentar dentro de `describe("createCompanyInput", …)`:

```ts
  it("normaliza o Instagram de @, nome ou URL", () => {
    expect(createCompanyInput.parse({ ...base, instagram: "@PadariaCentral" }).instagram).toBe("padariacentral");
    expect(
      createCompanyInput.parse({ ...base, instagram: "https://www.instagram.com/padaria.central/" }).instagram,
    ).toBe("padaria.central");
    expect(createCompanyInput.parse({ ...base, instagram: "  " }).instagram).toBeNull();
    expect(createCompanyInput.parse(base).instagram).toBeNull();
  });

  it("recusa Instagram que não é perfil", () => {
    const r = createCompanyInput.safeParse({ ...base, instagram: "https://www.instagram.com/p/DAbc123/" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Instagram inválido.");
  });
```

E dentro de `describe("updateCompanyInput", …)`:

```ts
  it("patch sem Instagram não mexe no campo; null explícito limpa", () => {
    expect(updateCompanyInput.parse({ status: "paused" })).not.toHaveProperty("instagram");
    expect(updateCompanyInput.parse({ instagram: null })).toEqual({ instagram: null });
    expect(updateCompanyInput.parse({ instagram: "@Padaria" })).toEqual({ instagram: "padaria" });
  });
```

Em `artifacts/api-server/src/routes/__tests__/companies.test.ts`, acrescentar dentro de `describe("rotas de empresas", …)`:

```ts
  it("filtra por Instagram já normalizado", async () => {
    store.listCompanies.mockResolvedValue([detail({ instagram: "padariacentral" })]);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get(
      `/companies?instagram=${encodeURIComponent("https://www.instagram.com/PadariaCentral/")}`,
    );
    expect(res.status).toBe(200);
    expect(store.listCompanies).toHaveBeenCalledWith(expect.objectContaining({ instagram: "padariacentral" }));
  });

  it("Instagram inválido no filtro é 400 e não consulta o store", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/companies?instagram=padaria%20central");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Instagram inválido.");
    expect(store.listCompanies).not.toHaveBeenCalled();
  });

  it("cria mandando o Instagram normalizado para o store", async () => {
    store.createCompany.mockResolvedValue(detail({ advertiserId: 2, instagram: "padariacentral" }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/companies")
      .send({ name: "Padaria Central", isClient: false, isAdvertiser: true, instagram: "@PadariaCentral" });
    expect(res.status).toBe(201);
    expect(store.createCompany).toHaveBeenCalledWith(expect.objectContaining({ instagram: "padariacentral" }));
  });

  it("Instagram já usado por outra empresa é 409 com a mensagem do store", async () => {
    const { CompanyConflictError } = await import("../../lib/companies/store");
    store.createCompany.mockRejectedValue(new CompanyConflictError("Já existe empresa com esse Instagram."));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/companies")
      .send({ name: "Outra Padaria", isClient: false, isAdvertiser: true, instagram: "padariacentral" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Já existe empresa com esse Instagram.");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/pg-errors.test.ts src/lib/companies/__tests__/input.test.ts src/routes/__tests__/companies.test.ts`
Expected: FAIL — `uniqueConstraintOf` não existe; `instagram` é `undefined` no input; o filtro não é repassado e o 400 não acontece.

- [ ] **Step 3: Implementar**

Em `artifacts/api-server/src/lib/pg-errors.ts`, acrescentar no fim:

```ts
function constraintName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const name = (value as { constraint?: unknown }).constraint;
  return typeof name === "string" ? name : undefined;
}

/**
 * Nome da constraint de unicidade violada, para a rota dizer QUAL unicidade
 * falhou (papel repetido e @ repetido pedem mensagens diferentes). Segue o
 * mesmo par de lugares de `isUniqueViolation`: topo do erro e `err.cause`.
 */
export function uniqueConstraintOf(err: unknown): string | undefined {
  if (!isUniqueViolation(err)) return undefined;
  return constraintName(err) ?? constraintName((err as { cause?: unknown }).cause);
}
```

Em `artifacts/api-server/src/lib/companies/input.ts`, acrescentar o import e o schema antes de `const fields`:

```ts
import { normalizeInstagramHandle } from "@workspace/db/instagram";
```

```ts
/**
 * @ do Instagram. Aceita "@nome", "nome" ou a URL do perfil e guarda só o @
 * em minúsculas, a mesma forma que o importador usa para buscar a empresa.
 */
const instagram = optionalText
  .refine((v) => v === null || normalizeInstagramHandle(v) !== null, "Instagram inválido.")
  .transform((v) => (v === null ? null : normalizeInstagramHandle(v)));
```

Dentro de `fields`, depois de `lng`:

```ts
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
  instagram,
```

Dentro de `patchFields`, depois de `lng`:

```ts
  lng: fields.lng.optional(),
  instagram: fields.instagram.optional(),
```

Em `artifacts/api-server/src/lib/companies/store.ts`:

Trocar o import de `pg-errors`:

```ts
import { uniqueConstraintOf } from "../pg-errors";
```

Trocar a assinatura e o corpo de `listCompanies`:

```ts
export async function listCompanies(filter: {
  status?: string;
  role?: "client" | "advertiser";
  q?: string;
  /** @ já normalizado; casa exato. */
  instagram?: string;
}): Promise<CompanyRow[]> {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(companiesTable.status, filter.status));
  if (filter.role === "client") conditions.push(isNotNull(clientsTable.id));
  if (filter.role === "advertiser") conditions.push(isNotNull(advertisersTable.id));
  if (filter.q) conditions.push(ilike(companiesTable.name, `%${filter.q}%`));
  if (filter.instagram) conditions.push(eq(companiesTable.instagram, filter.instagram));
  const rows = await rowQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(companiesTable.name));
  return rows.map(flatten);
}
```

Trocar `rethrowConflict`:

```ts
function rethrowConflict(err: unknown): never {
  // drizzle-orm@0.45.2 embrulha o erro do driver `pg` em `DrizzleQueryError`
  // (node_modules/drizzle-orm/pg-core/session.js, `queryWithCache`): código e
  // constraint do pg só sobrevivem em `.cause`. `uniqueConstraintOf` cobre os
  // dois formatos e devolve undefined quando não é violação de unicidade.
  const constraint = uniqueConstraintOf(err);
  if (constraint === "companies_instagram_unique") {
    throw new CompanyConflictError("Já existe empresa com esse Instagram.");
  }
  if (constraint !== undefined) {
    throw new CompanyConflictError("A empresa já tem esse papel.");
  }
  throw err;
}
```

Em `artifacts/api-server/src/routes/companies.ts`, acrescentar o import e trocar o `GET /companies`:

```ts
import { normalizeInstagramHandle } from "@workspace/db/instagram";
```

```ts
router.get("/companies", async (req, res): Promise<void> => {
  const role = req.query.role === "client" || req.query.role === "advertiser" ? req.query.role : undefined;
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
  if (status && !(COMPANY_STATUSES as readonly string[]).includes(status)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }
  const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
  const rawInstagram = typeof req.query.instagram === "string" && req.query.instagram.trim() ? req.query.instagram : undefined;
  // Filtro com @ ilegível não pode virar "sem filtro": devolveria todas as
  // empresas e o importador escolheria a errada.
  const instagram = rawInstagram ? normalizeInstagramHandle(rawInstagram) : undefined;
  if (instagram === null) {
    res.status(400).json({ error: "Instagram inválido." });
    return;
  }
  res.json(await listCompanies({ status, role, q, instagram }));
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/pg-errors.test.ts src/lib/companies/__tests__/input.test.ts src/routes/__tests__/companies.test.ts`
Expected: PASS, incluindo os testes antigos dos três arquivos.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/pg-errors.ts artifacts/api-server/src/lib/companies artifacts/api-server/src/routes/companies.ts artifacts/api-server/src/lib/__tests__/pg-errors.test.ts artifacts/api-server/src/routes/__tests__/companies.test.ts
git commit -m "feat(api): Instagram no cadastro e no filtro de empresas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API de peças — `externalRef` no `POST /announcements`

**Files:**
- Modify: `artifacts/api-server/src/routes/announcements.ts`
- Test: `artifacts/api-server/src/routes/__tests__/announcements-external-ref.test.ts` (criado na Task 2)

**Interfaces:**
- Consumes: coluna `announcementsTable.externalRef` (Task 2); `isUniqueViolation` de `../lib/pg-errors`.
- Produces: `POST /announcements` aceita o campo multipart `externalRef`. Repetido → `409 { error: "Peça já importada", id: <id da existente> }` sem gravar imagem. Fora do formato → `400 { error: "Referência externa inválida" }`. Ausente → comportamento atual.

- [ ] **Step 1: Write the failing tests**

Acrescentar no fim de `announcements-external-ref.test.ts`:

```ts
const SHORT = "https://www.youtube.com/shorts/abc123def45";

describe("POST /announcements — externalRef", () => {
  it("grava a referência externa enviada", async () => {
    // 1º select: checagem de repetida (nada); 2º: maior displayOrder.
    selectQueue = [[], [{ maxOrder: -1 }]];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/announcements")
      .field("title", ROW.title)
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("externalRef", REF);
    expect(res.status).toBe(201);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ externalRef: REF }));
    expect(res.body.externalRef).toBe(REF);
  });

  it("referência repetida é 409 com o id da peça e não grava a imagem", async () => {
    selectQueue = [[{ id: 9 }]];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/announcements")
      .field("title", ROW.title)
      .field("externalRef", REF)
      .attach("image", Buffer.from("imagem"), { filename: "1.png", contentType: "image/png" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça já importada", id: 9 });
    expect(putSpy).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("referência fora do formato é 400", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/announcements")
      .field("title", ROW.title)
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("externalRef", "qualquer coisa");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Referência externa inválida");
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("sem referência, não consulta repetida nem grava o campo", async () => {
    // Só o select do displayOrder: se a rota consultasse repetida, a fila
    // acabaria e o insert receberia displayOrder errado.
    selectQueue = [[{ maxOrder: 4 }]];
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/announcements")
      .field("title", ROW.title)
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT);
    expect(res.status).toBe(201);
    expect(insertValues.mock.calls[0][0]).not.toHaveProperty("externalRef");
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ displayOrder: 5 }));
  });

  it("duas importações ao mesmo tempo: a que perde a corrida recebe 409 com o id", async () => {
    // Checagem não acha nada, o insert bate no índice único, e a rota relê o id.
    selectQueue = [[], [{ maxOrder: -1 }], [{ id: 9 }]];
    insertError = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/announcements")
      .field("title", ROW.title)
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("externalRef", REF);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça já importada", id: 9 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/announcements-external-ref.test.ts`
Expected: FAIL — o primeiro grava sem `externalRef`; o segundo responde 201; o terceiro 201; o último estoura 500.

- [ ] **Step 3: Implementar**

Em `artifacts/api-server/src/routes/announcements.ts`, acrescentar o import:

```ts
import { isUniqueViolation } from "../lib/pg-errors";
```

Acrescentar, logo antes de `router.get("/announcements", …)`:

```ts
const EXTERNAL_REF = /^[a-z]+:[A-Za-z0-9_-]+:\d+$/;

/**
 * Lê `externalRef` do multipart. `undefined` = não enviado (peça subida à
 * mão); `null` = enviado fora do formato "origem:código:n" (400).
 */
function readExternalRef(raw: unknown): string | undefined | null {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = String(raw).trim();
  return value.length <= 200 && EXTERNAL_REF.test(value) ? value : null;
}

async function findByExternalRef(externalRef: string): Promise<number | undefined> {
  const [row] = await db
    .select({ id: announcementsTable.id })
    .from(announcementsTable)
    .where(eq(announcementsTable.externalRef, externalRef));
  return row?.id;
}
```

No `router.post("/announcements", …)`, logo depois do bloco que valida `orientation` e antes de `let imageUrl`:

```ts
    const externalRef = readExternalRef(req.body.externalRef);
    if (externalRef === null) {
      res.status(400).json({ error: "Referência externa inválida" });
      return;
    }
    if (externalRef) {
      // Antes de gravar a imagem: peça repetida não pode deixar arquivo órfão
      // no storage. O id volta para o importador vincular a peça que já existe.
      const existingId = await findByExternalRef(externalRef);
      if (existingId !== undefined) {
        res.status(409).json({ error: "Peça já importada", id: existingId });
        return;
      }
    }
```

E trocar o insert do mesmo handler (de `const [row] = await db.insert(…)` até `res.status(201)…`) por:

```ts
    let row: typeof announcementsTable.$inferSelect;
    try {
      [row] = await db
        .insert(announcementsTable)
        .values({
          title: parsed.data.title,
          displayText: normalizeDisplayText(parsed.data.displayText),
          showText: parsed.data.showText ?? false,
          imageUrl,
          mediaKind: yt.mediaKind,
          youtubeId: yt.youtubeId,
          playbackMode: yt.playbackMode,
          audioMode: yt.audioMode,
          // Ausente (cliente antigo): fica o default do banco, landscape.
          ...(orientation ? { orientation } : {}),
          ...(externalRef ? { externalRef } : {}),
          duration: parsed.data.duration ?? 10,
          displayOrder: nextOrder,
        })
        .returning();
    } catch (err) {
      // Duas importações do mesmo post ao mesmo tempo: a checagem acima passa
      // nas duas e o índice único barra a segunda. Responde como repetida.
      if (!externalRef || !isUniqueViolation(err)) throw err;
      if (imageUrl) await mediaStore().remove(imageUrl).catch(() => undefined);
      res.status(409).json({ error: "Peça já importada", id: await findByExternalRef(externalRef) });
      return;
    }
    res.status(201).json(CreateAnnouncementResponse.parse(row));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/announcements-external-ref.test.ts src/routes/__tests__/announcements-orientation.test.ts src/routes/__tests__/announcements-upload.test.ts src/routes/__tests__/announcement-source.test.ts`
Expected: PASS nos quatro arquivos.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/announcements.ts artifacts/api-server/src/routes/__tests__/announcements-external-ref.test.ts
git commit -m "feat(api): peça com referência externa não entra duas vezes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API de campanhas — `isActive` na criação

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts`
- Test: `artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `POST /campaigns` aceita `isActive?: boolean` (padrão `true`). `PATCH /campaigns/:id` continua sem tocar em `isActive`.

- [ ] **Step 1: Write the failing tests**

Em `campaign-flyers-route.test.ts`, dentro de `describe("rotas de campanha convivendo com encartes", …)`, logo depois de `it("POST sem anúncios é aceito", …)`:

```ts
  it("POST com isActive false cria a campanha fora do ar", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody({ isActive: false }));
    expect(res.status).toBe(201);
    const insert = state.insertCalls.find((c) => c.table === "campaigns");
    expect(insert?.values).toMatchObject({ isActive: false });
  });

  it("POST sem isActive continua criando ativa", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody());
    expect(res.status).toBe(201);
    const insert = state.insertCalls.find((c) => c.table === "campaigns");
    expect(insert?.values).toMatchObject({ isActive: true });
  });

  it("PATCH ignora isActive: ligar e desligar é do toggle", async () => {
    // O importador reenvia a campanha inteira para vincular peça; se o PATCH
    // gravasse isActive, um reenvio descuidado poria a campanha no ar.
    state.existingCampaignRow = baseExisting({ isActive: false });
    const { default: request } = await import("supertest");
    const res = await request(app).patch(`/campaigns/${CAMPAIGN_ID}`).send(campaignBody({ isActive: true }));
    expect(res.status).toBe(200);
    const update = state.updateCalls.find((c) => c.table === "campaigns");
    expect(update?.patch).not.toHaveProperty("isActive");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-flyers-route.test.ts`
Expected: FAIL nos dois POST novos (`isActive` não está nos valores do insert). O do PATCH já passa: ele fixa o comportamento que não pode mudar.

- [ ] **Step 3: Implementar**

Em `artifacts/api-server/src/routes/advertisers.ts`, dentro de `campaignInput`, depois de `weekdays`:

```ts
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  // Só vale na criação: campanha importada nasce fora do ar para ser revisada.
  // Depois de criada, quem liga e desliga é PATCH /campaigns/:id/toggle.
  isActive: z.boolean().optional(),
```

No `router.post("/campaigns", …)`, dentro do `.values({ … })` do insert, depois de `weekdays`:

```ts
    weekdays: normalizeWeekdays(input.weekdays),
    isActive: input.isActive ?? true,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-flyers-route.test.ts`
Expected: PASS em todos.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/advertisers.ts artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts
git commit -m "feat(api): campanha pode nascer fora do ar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Painel — campo Instagram no cadastro da empresa

**Files:**
- Modify: `artifacts/signage/src/lib/companies-api.ts`
- Modify: `artifacts/signage/src/components/company-form-dialog.tsx`
- Test: `artifacts/signage/src/components/__tests__/company-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `POST /companies` e `PATCH /companies/:id` com `instagram` (Task 3).
- Produces: campo de texto "Instagram" no diálogo; `Company.instagram: string | null` no tipo do front.

- [ ] **Step 1: Write the failing test**

Em `company-form-dialog.test.tsx`, dentro de `describe('CompanyFormDialog', …)`, no fim:

```tsx
  it('envia o Instagram digitado', async () => {
    const saved = { id: 5, name: 'Padaria Central' };
    const fetchMock = stubFetch({
      '/segments': () => json(200, []),
      '/companies': () => json(201, saved),
    });
    const onSaved = renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Padaria Central');
    await userEvent.click(screen.getByLabelText('Anunciante'));
    await userEvent.type(screen.getByLabelText('Instagram'), '@padariacentral');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes('api/companies'))!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ instagram: '@padariacentral', isAdvertiser: true });
  });

  it('sem Instagram, manda null', async () => {
    const saved = { id: 5, name: 'Padaria Central' };
    const fetchMock = stubFetch({
      '/segments': () => json(200, []),
      '/companies': () => json(201, saved),
    });
    const onSaved = renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Padaria Central');
    await userEvent.click(screen.getByLabelText('Anunciante'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes('api/companies'))!;
    expect(JSON.parse(init!.body as string).instagram).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/company-form-dialog.test.tsx`
Expected: FAIL — não acha o campo com rótulo "Instagram"; no segundo, `instagram` é `undefined`.

- [ ] **Step 3: Implementar**

Em `artifacts/signage/src/lib/companies-api.ts`, na interface `Company`, depois de `lng`:

```ts
  lng: number | null;
  /** @ normalizado pelo servidor: minúsculas, sem "@". */
  instagram: string | null;
```

Em `artifacts/signage/src/components/company-form-dialog.tsx`:

Na interface `FormState`, depois de `phone`:

```ts
  phone: string;
  instagram: string;
```

Em `initialState`, depois de `phone`:

```ts
    phone: company?.phone ?? '',
    instagram: company?.instagram ?? '',
```

No `payload` de `handleSubmit`, depois de `phone`:

```ts
      phone: orNull(form.phone),
      // Vai como foi digitado ("@nome", "nome" ou URL); o servidor normaliza.
      instagram: orNull(form.instagram),
```

No JSX, logo depois do `TextField` de telefone:

```tsx
            <TextField id="company-phone" label="Telefone" value={form.phone} onChange={(v) => set('phone', v)} />
            <TextField id="company-instagram" label="Instagram" value={form.instagram} onChange={(v) => set('instagram', v)} className="sm:col-span-2" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/company-form-dialog.test.tsx`
Expected: PASS em todos, inclusive os cinco antigos.

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/lib/companies-api.ts artifacts/signage/src/components/company-form-dialog.tsx artifacts/signage/src/components/__tests__/company-form-dialog.test.tsx
git commit -m "feat(portal): campo Instagram no cadastro da empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Script — testes em `scripts/` e fonte Instagram (`perfil.ts`)

**Files:**
- Modify: `scripts/package.json`
- Create: `scripts/vitest.config.ts`
- Modify: `.github/workflows/release.yml` (passo de testes, linhas 62–64)
- Modify: `pnpm-lock.yaml` (gerado pelo `pnpm install`)
- Create: `scripts/src/instagram/tipos.ts`
- Create: `scripts/src/instagram/perfil.ts`
- Test: `scripts/src/instagram/__tests__/perfil.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `tipos.ts`: `TipoMidia`, `Midia { n, tipo, largura, altura }`, `Post { codigo, data, legenda, url, midias }`, `Perfil { handle, nome, bio, site, posts }`, `FonteInstagram { lerPerfil(handle, limite): Promise<Perfil>; baixar(postUrl, n, destino): Promise<string> }`.
  - `perfil.ts`: `ErroInstagram`, `type Executar = (args: string[]) => Promise<string>`, `traduzirInfo(saida: string, handle: string)`, `traduzirPosts(saida: string, limite: number): Post[]`, `criarFonteInstagram(executar?: Executar, navegador?: string): FonteInstagram`.

Formato da saída do `gallery-dl -j` (conferido no código-fonte, `gallery_dl/job.py` e `extractor/instagram.py`): um array JSON de mensagens. `[2, {post}]` abre um post; `[3, url, {arquivo}]` é cada mídia, com as chaves do post mais `num` (a partir de 1), `width`, `height`, `video_url` (nulo em imagem) e, em trilha sonora, `audio_url`; `[-1, {error, message}]` é erro de extração. O post traz `post_shortcode`, `post_url`, `post_date` (`"AAAA-MM-DD HH:MM:SS"`) e `description`. A URL `…/<handle>/info` devolve `[[2, {usuário}]]` com `full_name`, `biography`, `external_url`, `is_private`.

- [ ] **Step 1: Preparar testes no pacote `scripts`**

Em `scripts/package.json`, acrescentar em `scripts` e `devDependencies`:

```json
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "importar:instagram": "tsx ./src/instagram/importar.ts"
```

```json
  "devDependencies": {
    "@types/node": "catalog:",
    "tsx": "catalog:",
    "vitest": "^3.2.4"
  }
```

Criar `scripts/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Em `.github/workflows/release.yml`, no passo que roda os testes do web e da API, acrescentar a terceira linha:

```yaml
          pnpm --filter @workspace/signage test
          pnpm --filter @workspace/api-server test
          pnpm --filter @workspace/scripts test
```

Run: `pnpm install`
Expected: instala `vitest` em `scripts` e atualiza `pnpm-lock.yaml`.

- [ ] **Step 2: Write the failing test**

Criar `scripts/src/instagram/tipos.ts`:

```ts
export type TipoMidia = "imagem" | "video";

/** Uma mídia dentro de um post. `n` começa em 1, na ordem do carrossel. */
export interface Midia {
  n: number;
  tipo: TipoMidia;
  largura: number;
  altura: number;
}

export interface Post {
  /** Código curto do post (o trecho da URL depois de /p/ ou /reel/). */
  codigo: string;
  /** AAAA-MM-DD. */
  data: string;
  legenda: string;
  url: string;
  midias: Midia[];
}

export interface Perfil {
  handle: string;
  nome: string;
  bio: string;
  site: string | null;
  posts: Post[];
}

/**
 * De onde vêm perfil e arquivos. Interface para o executor ser testado sem
 * rede e para a fonte poder ser trocada (ex.: serviço pago) sem mexer no resto.
 */
export interface FonteInstagram {
  /** Só metadados: nada é baixado. */
  lerPerfil(handle: string, limite: number): Promise<Perfil>;
  /**
   * Baixa a mídia `n` do post para a pasta `destino` e devolve o caminho do
   * arquivo. Vai pelo link do post, não por URL direta: a do CDN expira em
   * horas e o plano pode ser retomado dias depois.
   */
  baixar(postUrl: string, n: number, destino: string): Promise<string>;
}
```

Criar `scripts/src/instagram/__tests__/perfil.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ErroInstagram, criarFonteInstagram, traduzirInfo, traduzirPosts } from "../perfil";

type Chaves = Record<string, unknown>;

const post = (over: Chaves = {}): Chaves => ({
  post_shortcode: "DAbc123",
  post_url: "https://www.instagram.com/p/DAbc123/",
  post_date: "2026-09-28 14:03:11",
  description: "Pão quentinho saindo agora",
  ...over,
});

const arquivo = (doPost: Chaves, over: Chaves = {}): unknown[] => [
  3,
  "https://cdn.example/x.jpg",
  { ...doPost, num: 1, width: 1440, height: 1800, video_url: null, ...over },
];

const saida = (...mensagens: unknown[]) => JSON.stringify(mensagens);

describe("traduzirPosts", () => {
  it("foto simples vira um post com uma imagem", () => {
    const p = post();
    expect(traduzirPosts(saida([2, p], arquivo(p)), 12)).toEqual([
      {
        codigo: "DAbc123",
        data: "2026-09-28",
        legenda: "Pão quentinho saindo agora",
        url: "https://www.instagram.com/p/DAbc123/",
        midias: [{ n: 1, tipo: "imagem", largura: 1440, altura: 1800 }],
      },
    ]);
  });

  it("carrossel misto mantém a ordem e o tipo de cada item", () => {
    const p = post();
    const [resultado] = traduzirPosts(
      saida(
        [2, p],
        arquivo(p, { num: 1 }),
        arquivo(p, { num: 2, width: 1080, height: 1920, video_url: "https://cdn.example/v.mp4" }),
        arquivo(p, { num: 3, width: 1080, height: 1080 }),
      ),
      12,
    );
    expect(resultado.midias).toEqual([
      { n: 1, tipo: "imagem", largura: 1440, altura: 1800 },
      { n: 2, tipo: "video", largura: 1080, altura: 1920 },
      { n: 3, tipo: "imagem", largura: 1080, altura: 1080 },
    ]);
  });

  it("reel é um post com um vídeo", () => {
    const p = post({ post_shortcode: "DXyz789", post_url: "https://www.instagram.com/reel/DXyz789/" });
    const [resultado] = traduzirPosts(
      saida([2, p], arquivo(p, { width: 1080, height: 1920, video_url: "https://cdn.example/r.mp4" })),
      12,
    );
    expect(resultado.url).toBe("https://www.instagram.com/reel/DXyz789/");
    expect(resultado.midias).toEqual([{ n: 1, tipo: "video", largura: 1080, altura: 1920 }]);
  });

  it("ignora a trilha sonora, que vem como arquivo extra com o mesmo num", () => {
    const p = post();
    const [resultado] = traduzirPosts(
      saida([2, p], arquivo(p), [3, "https://cdn.example/a.m4a", { ...p, num: 1, audio_url: "https://cdn.example/a.m4a" }]),
      12,
    );
    expect(resultado.midias).toHaveLength(1);
    expect(resultado.midias[0].tipo).toBe("imagem");
  });

  it("corta no limite, na ordem do perfil", () => {
    const a = post({ post_shortcode: "A1", post_url: "https://www.instagram.com/p/A1/" });
    const b = post({ post_shortcode: "B2", post_url: "https://www.instagram.com/p/B2/" });
    const c = post({ post_shortcode: "C3", post_url: "https://www.instagram.com/p/C3/" });
    const resultado = traduzirPosts(saida([2, a], arquivo(a), [2, b], arquivo(b), [2, c], arquivo(c)), 2);
    expect(resultado.map((r) => r.codigo)).toEqual(["A1", "B2"]);
  });

  it("post sem legenda fica com texto vazio", () => {
    const p = post({ description: null });
    expect(traduzirPosts(saida([2, p], arquivo(p)), 12)[0].legenda).toBe("");
  });

  it("sessão expirada vira erro com instrução", () => {
    const erro = saida([-1, { error: "AbortExtraction", message: "HTTP redirect to login page (https://www.instagram.com/accounts/login/)" }]);
    expect(() => traduzirPosts(erro, 12)).toThrow(ErroInstagram);
    expect(() => traduzirPosts(erro, 12)).toThrow(/Sessão do Instagram expirada/);
  });

  it("limite de requisições vira erro próprio", () => {
    const erro = saida([-1, { error: "HttpError", message: "'429 Too Many Requests' for 'https://www.instagram.com/api/v1/feed/'" }]);
    expect(() => traduzirPosts(erro, 12)).toThrow(/limitou as requisições/);
  });

  it("saída que não é JSON vira erro legível", () => {
    expect(() => traduzirPosts("<html>", 12)).toThrow(ErroInstagram);
  });
});

describe("traduzirInfo", () => {
  it("lê nome, bio e site", () => {
    const info = saida([2, { username: "padariacentral", full_name: "Padaria Central", biography: "Pão todo dia\nRegistro/SP", external_url: "https://padariacentral.example", is_private: false }]);
    expect(traduzirInfo(info, "padariacentral")).toEqual({
      nome: "Padaria Central",
      bio: "Pão todo dia\nRegistro/SP",
      site: "https://padariacentral.example",
    });
  });

  it("perfil sem nome usa o @; sem site fica null", () => {
    const info = saida([2, { username: "padariacentral", full_name: "", biography: "", external_url: null, is_private: false }]);
    expect(traduzirInfo(info, "padariacentral")).toEqual({ nome: "padariacentral", bio: "", site: null });
  });

  it("perfil privado é recusado", () => {
    const info = saida([2, { username: "padariacentral", full_name: "Padaria", biography: "", is_private: true }]);
    expect(() => traduzirInfo(info, "padariacentral")).toThrow(/privado/);
  });
});

describe("criarFonteInstagram", () => {
  it("lê o perfil com os cookies do navegador e o limite de posts", async () => {
    const chamadas: string[][] = [];
    const p = post();
    const fonte = criarFonteInstagram(async (args) => {
      chamadas.push(args);
      return args.some((a) => a.endsWith("/info"))
        ? saida([2, { full_name: "Padaria Central", biography: "Pão", external_url: null, is_private: false }])
        : saida([2, p], arquivo(p));
    });
    const perfil = await fonte.lerPerfil("padariacentral", 5);
    expect(perfil).toMatchObject({ handle: "padariacentral", nome: "Padaria Central", bio: "Pão", site: null });
    expect(perfil.posts).toHaveLength(1);
    expect(chamadas[0]).toEqual(["--cookies-from-browser", "chrome", "-j", "https://www.instagram.com/padariacentral/info"]);
    expect(chamadas[1]).toEqual([
      "--cookies-from-browser", "chrome", "-j", "-o", "max-posts=5", "https://www.instagram.com/padariacentral/posts/",
    ]);
  });

  it("baixa o post e devolve o arquivo da mídia pedida", async () => {
    const destino = await mkdtemp(path.join(tmpdir(), "ig-"));
    const fonte = criarFonteInstagram(async (args) => {
      const pasta = args[args.indexOf("-D") + 1];
      await writeFile(path.join(pasta, "1.jpg"), "a");
      await writeFile(path.join(pasta, "2.mp4"), "b");
      await writeFile(path.join(pasta, "2.mp4.part"), "resto");
      return "";
    });
    expect(await fonte.baixar("https://www.instagram.com/p/DAbc123/", 2, destino)).toBe(path.join(destino, "2.mp4"));
  });

  it("download que não trouxe a mídia vira erro", async () => {
    const destino = await mkdtemp(path.join(tmpdir(), "ig-"));
    const fonte = criarFonteInstagram(async () => "");
    await expect(fonte.baixar("https://www.instagram.com/p/DAbc123/", 1, destino)).rejects.toThrow(ErroInstagram);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/perfil.test.ts`
Expected: FAIL — não resolve `../perfil`.

- [ ] **Step 4: Write minimal implementation**

Criar `scripts/src/instagram/perfil.ts`:

```ts
import { execFile } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { FonteInstagram, Midia, Perfil, Post } from "./tipos";

/** Falha ao falar com o Instagram. A mensagem já diz o que o admin faz. */
export class ErroInstagram extends Error {}

/** Roda o gallery-dl com os argumentos dados e devolve o stdout. */
export type Executar = (args: string[]) => Promise<string>;

type Chaves = Record<string, unknown>;

function mensagemDeErro(bruta: string): string {
  if (/login|challenge/i.test(bruta)) {
    return "Sessão do Instagram expirada. Entre no Chrome com a conta separada e rode de novo.";
  }
  if (/429|too many/i.test(bruta)) {
    return "O Instagram limitou as requisições. Espere algumas horas e rode de novo.";
  }
  return `gallery-dl: ${bruta}`;
}

/**
 * `gallery-dl -j` imprime um array de mensagens: [2, post], [3, url, arquivo]
 * e, em falha de extração, [-1, { error, message }]. Os metadados são sempre
 * o último elemento.
 */
function mensagens(saida: string): unknown[][] {
  let dados: unknown;
  try {
    dados = JSON.parse(saida);
  } catch {
    throw new ErroInstagram("Saída do gallery-dl não é JSON. Rode o comando à mão para ver o erro.");
  }
  if (!Array.isArray(dados)) throw new ErroInstagram("Saída do gallery-dl em formato inesperado.");
  const lista = dados.filter(Array.isArray) as unknown[][];
  const erro = lista.find((m) => m[0] === -1);
  if (erro) {
    const { message } = (erro[erro.length - 1] ?? {}) as { message?: unknown };
    throw new ErroInstagram(mensagemDeErro(String(message ?? "erro desconhecido")));
  }
  return lista;
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const numero = (v: unknown): number => (typeof v === "number" ? v : 0);

export function traduzirInfo(saida: string, handle: string): Pick<Perfil, "nome" | "bio" | "site"> {
  const diretorio = mensagens(saida).find((m) => m[0] === 2);
  if (!diretorio) throw new ErroInstagram(`Perfil @${handle} não encontrado.`);
  const usuario = diretorio[diretorio.length - 1] as Chaves;
  if (usuario.is_private === true) {
    throw new ErroInstagram(`Perfil @${handle} é privado. O importador só lê perfil público.`);
  }
  return {
    nome: texto(usuario.full_name).trim() || handle,
    bio: texto(usuario.biography),
    site: texto(usuario.external_url) || null,
  };
}

export function traduzirPosts(saida: string, limite: number): Post[] {
  const posts = new Map<string, Post>();
  for (const mensagem of mensagens(saida)) {
    if (mensagem[0] !== 3) continue;
    const meta = mensagem[mensagem.length - 1] as Chaves;
    // Trilha sonora do post: o gallery-dl a emite como arquivo extra com o
    // mesmo `num` da mídia. Não é peça.
    if (meta.audio_url) continue;
    const codigo = texto(meta.post_shortcode);
    if (!codigo) continue;
    let post = posts.get(codigo);
    if (!post) {
      post = {
        codigo,
        data: texto(meta.post_date ?? meta.date).slice(0, 10),
        legenda: texto(meta.description),
        url: texto(meta.post_url),
        midias: [],
      };
      posts.set(codigo, post);
    }
    const midia: Midia = {
      n: numero(meta.num),
      tipo: meta.video_url ? "video" : "imagem",
      largura: numero(meta.width),
      altura: numero(meta.height),
    };
    if (!post.midias.some((m) => m.n === midia.n)) post.midias.push(midia);
  }
  // O `max-posts` já limita na origem; o corte aqui cobre versão do gallery-dl
  // que ainda não conhece a opção.
  return [...posts.values()].slice(0, limite);
}

export const executarGalleryDl: Executar = (args) =>
  new Promise((resolve, reject) => {
    execFile("gallery-dl", args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new ErroInstagram("gallery-dl não encontrado. Instale com: brew install gallery-dl yt-dlp"));
        return;
      }
      // Com -j a falha de extração vem no próprio JSON ([-1, …]); só é erro
      // aqui quando não saiu nada para ler.
      if (err && !stdout.trim()) {
        reject(new ErroInstagram(mensagemDeErro(stderr.trim() || err.message)));
        return;
      }
      resolve(stdout);
    });
  });

export function criarFonteInstagram(executar: Executar = executarGalleryDl, navegador = "chrome"): FonteInstagram {
  const base = ["--cookies-from-browser", navegador];
  return {
    async lerPerfil(handle, limite) {
      const info = await executar([...base, "-j", `https://www.instagram.com/${handle}/info`]);
      const dados = traduzirInfo(info, handle);
      const posts = await executar([
        ...base, "-j", "-o", `max-posts=${limite}`, `https://www.instagram.com/${handle}/posts/`,
      ]);
      return { handle, ...dados, posts: traduzirPosts(posts, limite) };
    },

    async baixar(postUrl, n, destino) {
      await mkdir(destino, { recursive: true });
      // Nome do arquivo = posição no post, para achar a mídia pedida sem
      // depender do nome que o Instagram deu.
      await executar([...base, "-D", destino, "-f", "{num}.{extension}", postUrl]);
      const arquivos = await readdir(destino);
      const achado = arquivos.find((a) => a.startsWith(`${n}.`) && !a.endsWith(".part"));
      if (!achado) throw new ErroInstagram(`Download não trouxe a mídia ${n} de ${postUrl}.`);
      return path.join(destino, achado);
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/perfil.test.ts`
Expected: PASS, 15 testes.

Run: `pnpm --filter @workspace/scripts run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add scripts/package.json scripts/vitest.config.ts scripts/src/instagram pnpm-lock.yaml .github/workflows/release.yml
git commit -m "feat(instagram): lê perfil e baixa mídia pelo gallery-dl

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Script — plano (`plano.ts`)

**Files:**
- Create: `scripts/src/instagram/plano.ts`
- Test: `scripts/src/instagram/__tests__/plano.test.ts`

**Interfaces:**
- Consumes: `Post`, `TipoMidia` de `./tipos` (Task 7); `instagramExternalRef` de `@workspace/db/instagram` (Task 1).
- Produces:

```ts
export type Orientacao = "landscape" | "portrait";
export type StatusItem = "pendente" | "criada" | "pulada" | "falha";
export interface ItemPlano {
  ref: string; codigo: string; n: number; tipo: TipoMidia; postUrl: string; data: string;
  orientacao: Orientacao; status: StatusItem;
  videoId?: string; pecaId?: number; erro?: string;
}
export type AlvoEmpresa = { id: number; gravarInstagram?: boolean } | { criar: { nome: string; bio: string } };
export type AlvoCampanha = { id: number } | { criar: { nome: string } };
export interface Plano { handle: string; empresa: AlvoEmpresa; campanha: AlvoCampanha; itens: ItemPlano[] }
export function orientacaoDe(largura: number, altura: number): Orientacao;
export function tituloDaPeca(handle: string, data: string, n: number): string;
export function candidatasPorNome<T extends { name: string }>(perfil: { handle: string; nome: string }, empresas: T[]): T[];
export function montarPlano(dados: {
  handle: string; empresa: AlvoEmpresa; campanha: AlvoCampanha; posts: Post[]; selecao: string;
  jaImportadas: Set<string>; anterior?: Plano | null;
}): Plano;
export function lerPlano(arquivo: string): Promise<Plano | null>;
export function gravarPlano(arquivo: string, plano: Plano): Promise<void>;
```

`selecao` é a lista que o admin escolheu: códigos separados por vírgula, `DAbc123` (o post inteiro) ou `DAbc123:2` (só a mídia 2).

- [ ] **Step 1: Write the failing test**

Criar `scripts/src/instagram/__tests__/plano.test.ts`:

```ts
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  candidatasPorNome,
  gravarPlano,
  lerPlano,
  montarPlano,
  orientacaoDe,
  tituloDaPeca,
  type Plano,
} from "../plano";
import type { Post } from "../tipos";

const POSTS: Post[] = [
  {
    codigo: "DAbc123",
    data: "2026-09-28",
    legenda: "Pão quentinho",
    url: "https://www.instagram.com/p/DAbc123/",
    midias: [
      { n: 1, tipo: "imagem", largura: 1440, altura: 1800 },
      { n: 2, tipo: "video", largura: 1080, altura: 1920 },
    ],
  },
  {
    codigo: "DXyz789",
    data: "2026-09-25",
    legenda: "Reel da fornada",
    url: "https://www.instagram.com/reel/DXyz789/",
    midias: [{ n: 1, tipo: "video", largura: 1920, altura: 1080 }],
  },
];

const base = {
  handle: "padariacentral",
  empresa: { id: 12 },
  campanha: { criar: { nome: "Instagram @padariacentral" } },
  posts: POSTS,
  jaImportadas: new Set<string>(),
};

describe("orientacaoDe", () => {
  it("mais alto que largo é portrait; quadrado e deitado são landscape", () => {
    expect(orientacaoDe(1440, 1800)).toBe("portrait");
    expect(orientacaoDe(1080, 1080)).toBe("landscape");
    expect(orientacaoDe(1920, 1080)).toBe("landscape");
  });
});

describe("tituloDaPeca", () => {
  it("junta @, data e posição", () => {
    expect(tituloDaPeca("padariacentral", "2026-09-28", 2)).toBe("@padariacentral · 2026-09-28 · 2");
  });
});

describe("candidatasPorNome", () => {
  const empresas = [
    { id: 1, name: "Padaria Central" },
    { id: 2, name: "Mercado Bom" },
    { id: 3, name: "Pão & Cia" },
    { id: 4, name: "Sá" },
  ];

  it("acha pelo nome do perfil, ignorando acento, caixa e pontuação", () => {
    expect(candidatasPorNome({ handle: "padaria.central_", nome: "PADARIA CENTRAL - Registro" }, empresas)).toEqual([
      { id: 1, name: "Padaria Central" },
    ]);
  });

  it("acha pelo @ quando o nome do perfil não ajuda", () => {
    expect(candidatasPorNome({ handle: "mercadobom_registro", nome: "Ofertas da semana" }, empresas)).toEqual([
      { id: 2, name: "Mercado Bom" },
    ]);
  });

  it("nome curto demais não casa com tudo", () => {
    expect(candidatasPorNome({ handle: "casadasaude", nome: "Casa da Saúde" }, empresas)).toEqual([]);
  });
});

describe("montarPlano", () => {
  it("post inteiro vira um item por mídia, com referência estável", () => {
    const plano = montarPlano({ ...base, selecao: "DAbc123" });
    expect(plano.itens).toEqual([
      {
        ref: "instagram:DAbc123:1", codigo: "DAbc123", n: 1, tipo: "imagem",
        postUrl: "https://www.instagram.com/p/DAbc123/", data: "2026-09-28", orientacao: "portrait", status: "pendente",
      },
      {
        ref: "instagram:DAbc123:2", codigo: "DAbc123", n: 2, tipo: "video",
        postUrl: "https://www.instagram.com/p/DAbc123/", data: "2026-09-28", orientacao: "portrait", status: "pendente",
      },
    ]);
    expect(plano.handle).toBe("padariacentral");
    expect(plano.empresa).toEqual({ id: 12 });
  });

  it("aceita mídia avulsa e vários posts, sem repetir item", () => {
    const plano = montarPlano({ ...base, selecao: " DAbc123:2 , DXyz789, DAbc123:2 " });
    expect(plano.itens.map((i) => i.ref)).toEqual(["instagram:DAbc123:2", "instagram:DXyz789:1"]);
    expect(plano.itens[1].orientacao).toBe("landscape");
  });

  it("mídia que já está na plataforma entra como pulada", () => {
    const plano = montarPlano({ ...base, selecao: "DAbc123", jaImportadas: new Set(["instagram:DAbc123:1"]) });
    expect(plano.itens.map((i) => i.status)).toEqual(["pulada", "pendente"]);
  });

  it("post ou mídia fora da listagem é erro, não é ignorado", () => {
    expect(() => montarPlano({ ...base, selecao: "NaoExiste" })).toThrow("Post não está na listagem: NaoExiste");
    expect(() => montarPlano({ ...base, selecao: "DAbc123:9" })).toThrow("Mídia 9 não existe no post DAbc123");
    expect(() => montarPlano({ ...base, selecao: " , " })).toThrow("Nenhum post escolhido");
  });

  it("refazer o plano preserva vídeo já enviado e peça já criada", () => {
    const anterior: Plano = {
      handle: "padariacentral",
      empresa: { id: 12 },
      campanha: { id: 7 },
      itens: [
        {
          ref: "instagram:DXyz789:1", codigo: "DXyz789", n: 1, tipo: "video",
          postUrl: "https://www.instagram.com/reel/DXyz789/", data: "2026-09-25", orientacao: "landscape",
          status: "falha", erro: "timeout", videoId: "abc123def45",
        },
      ],
    };
    const plano = montarPlano({ ...base, selecao: "DXyz789", anterior });
    expect(plano.itens[0]).toMatchObject({ status: "pendente", videoId: "abc123def45" });
    expect(plano.itens[0]).not.toHaveProperty("erro");
  });

  it("plano anterior de outro perfil é ignorado", () => {
    const anterior: Plano = {
      handle: "outroperfil", empresa: { id: 1 }, campanha: { id: 1 },
      itens: [{
        ref: "instagram:DXyz789:1", codigo: "DXyz789", n: 1, tipo: "video", postUrl: "x", data: "2026-01-01",
        orientacao: "landscape", status: "pendente", videoId: "deOutro",
      }],
    };
    expect(montarPlano({ ...base, selecao: "DXyz789", anterior }).itens[0]).not.toHaveProperty("videoId");
  });
});

describe("lerPlano e gravarPlano", () => {
  it("grava e lê de volta, sem deixar arquivo temporário", async () => {
    const pasta = await mkdtemp(path.join(tmpdir(), "plano-"));
    const arquivo = path.join(pasta, "sub", "plano.json");
    const plano = montarPlano({ ...base, selecao: "DXyz789" });
    await gravarPlano(arquivo, plano);
    expect(await lerPlano(arquivo)).toEqual(plano);
    expect(await readdir(path.dirname(arquivo))).toEqual(["plano.json"]);
    expect((await readFile(arquivo, "utf8")).endsWith("\n")).toBe(true);
  });

  it("plano que não existe é null", async () => {
    expect(await lerPlano(path.join(tmpdir(), "nao-existe-12345", "plano.json"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/plano.test.ts`
Expected: FAIL — não resolve `../plano`.

- [ ] **Step 3: Write minimal implementation**

Criar `scripts/src/instagram/plano.ts`:

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { instagramExternalRef } from "@workspace/db/instagram";
import type { Post, TipoMidia } from "./tipos";

export type Orientacao = "landscape" | "portrait";
export type StatusItem = "pendente" | "criada" | "pulada" | "falha";

export interface ItemPlano {
  /** "instagram:<código>:<n>" — vira o externalRef da peça. */
  ref: string;
  codigo: string;
  n: number;
  tipo: TipoMidia;
  postUrl: string;
  data: string;
  orientacao: Orientacao;
  status: StatusItem;
  /** Vídeo já enviado ao YouTube: nova execução reaproveita, sem gastar cota. */
  videoId?: string;
  /** Peça já criada na plataforma: nova execução só vincula. */
  pecaId?: number;
  erro?: string;
}

export type AlvoEmpresa = { id: number; gravarInstagram?: boolean } | { criar: { nome: string; bio: string } };
export type AlvoCampanha = { id: number } | { criar: { nome: string } };

/**
 * O que a importação vai fazer e o que já fez. Gravado depois de cada passo:
 * é o que deixa a execução retomar de onde parou sem duplicar nada.
 */
export interface Plano {
  handle: string;
  empresa: AlvoEmpresa;
  campanha: AlvoCampanha;
  itens: ItemPlano[];
}

/** A TV só toca peça da orientação dela; quadrado vai com a maioria (deitada). */
export function orientacaoDe(largura: number, altura: number): Orientacao {
  return altura > largura ? "portrait" : "landscape";
}

export function tituloDaPeca(handle: string, data: string, n: number): string {
  return `@${handle} · ${data} · ${n}`;
}

/** Só letras e números, sem acento: "Pão & Cia" e "pao_cia" viram "paocia". */
function chave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Empresas que podem ser a dona do perfil, para a skill perguntar antes de
 * criar outra. Casa quando o nome da empresa está contido no nome do perfil
 * ou no @ (ou o contrário). Nome com menos de 4 letras não entra: casaria
 * com quase tudo.
 */
export function candidatasPorNome<T extends { name: string }>(
  perfil: { handle: string; nome: string },
  empresas: T[],
): T[] {
  const alvos = [chave(perfil.nome), chave(perfil.handle)].filter((a) => a.length >= 4);
  return empresas.filter((empresa) => {
    const nome = chave(empresa.name);
    if (nome.length < 4) return false;
    return alvos.some((alvo) => alvo.includes(nome) || nome.includes(alvo));
  });
}

interface Escolha {
  post: Post;
  n: number;
}

function interpretarSelecao(selecao: string, posts: Post[]): Escolha[] {
  const escolhas: Escolha[] = [];
  const vistos = new Set<string>();
  for (const bruto of selecao.split(",")) {
    const token = bruto.trim();
    if (!token) continue;
    const [codigo, numero] = token.split(":");
    const post = posts.find((p) => p.codigo === codigo);
    if (!post) throw new Error(`Post não está na listagem: ${codigo}`);
    const midias = numero === undefined ? post.midias : post.midias.filter((m) => m.n === Number(numero));
    if (midias.length === 0) throw new Error(`Mídia ${numero} não existe no post ${codigo}`);
    for (const midia of midias) {
      const ref = instagramExternalRef(post.codigo, midia.n);
      if (vistos.has(ref)) continue;
      vistos.add(ref);
      escolhas.push({ post, n: midia.n });
    }
  }
  if (escolhas.length === 0) throw new Error("Nenhum post escolhido");
  return escolhas;
}

export function montarPlano(dados: {
  handle: string;
  empresa: AlvoEmpresa;
  campanha: AlvoCampanha;
  posts: Post[];
  selecao: string;
  jaImportadas: Set<string>;
  anterior?: Plano | null;
}): Plano {
  // Plano de outro perfil não tem nada a aproveitar.
  const anteriores = dados.anterior?.handle === dados.handle ? dados.anterior.itens : [];
  const itens = interpretarSelecao(dados.selecao, dados.posts).map(({ post, n }): ItemPlano => {
    const midia = post.midias.find((m) => m.n === n)!;
    const ref = instagramExternalRef(post.codigo, n);
    const antes = anteriores.find((i) => i.ref === ref);
    return {
      ref,
      codigo: post.codigo,
      n,
      tipo: midia.tipo,
      postUrl: post.url,
      data: post.data,
      orientacao: orientacaoDe(midia.largura, midia.altura),
      status: dados.jaImportadas.has(ref) ? "pulada" : "pendente",
      ...(antes?.videoId ? { videoId: antes.videoId } : {}),
      ...(antes?.pecaId ? { pecaId: antes.pecaId } : {}),
    };
  });
  return { handle: dados.handle, empresa: dados.empresa, campanha: dados.campanha, itens };
}

export async function lerPlano(arquivo: string): Promise<Plano | null> {
  try {
    return JSON.parse(await readFile(arquivo, "utf8")) as Plano;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Grava em arquivo temporário e renomeia: queda no meio não corrompe o plano. */
export async function gravarPlano(arquivo: string, plano: Plano): Promise<void> {
  await mkdir(path.dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.tmp`;
  await writeFile(temporario, `${JSON.stringify(plano, null, 2)}\n`, "utf8");
  await rename(temporario, arquivo);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/plano.test.ts`
Expected: PASS, 13 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/instagram/plano.ts scripts/src/instagram/__tests__/plano.test.ts
git commit -m "feat(instagram): plano retomável da importação

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Script — cliente da plataforma (`plataforma.ts`)

**Files:**
- Create: `scripts/src/instagram/plataforma.ts`
- Create: `scripts/src/instagram/__tests__/resposta-falsa.ts`
- Test: `scripts/src/instagram/__tests__/plataforma.test.ts`

**Interfaces:**
- Consumes: rotas `POST /api/auth/login` (cookie `sid`), `GET/POST/PATCH /api/companies`, `GET/POST/PATCH /api/campaigns`, `GET/POST /api/announcements` (Tasks 3, 4, 5).
- Produces:

```ts
export class ErroPlataforma extends Error { status: number }
export interface EmpresaApi { id: number; name: string; instagram: string | null; advertiserId: number | null }
export interface CampanhaApi { id: number; advertiserId: number; name: string; isActive: boolean }
export interface NovaPeca { titulo: string; externalRef: string; orientacao: "landscape" | "portrait" }
export interface PecaCriada { id: number; jaExistia: boolean }
export interface Plataforma {
  buscarEmpresaPorInstagram(handle: string): Promise<EmpresaApi | null>;
  listarEmpresas(): Promise<EmpresaApi[]>;
  obterEmpresa(id: number): Promise<EmpresaApi>;
  criarEmpresa(dados: { nome: string; bio: string; handle: string }): Promise<EmpresaApi>;
  atualizarEmpresa(id: number, patch: { isAdvertiser?: true; instagram?: string }): Promise<EmpresaApi>;
  listarCampanhas(advertiserId: number): Promise<CampanhaApi[]>;
  criarCampanha(dados: { advertiserId: number; nome: string; inicio: Date; fim: Date }): Promise<CampanhaApi>;
  refsImportadas(): Promise<Set<string>>;
  criarPecaImagem(peca: NovaPeca, arquivo: string): Promise<PecaCriada>;
  criarPecaYouTube(peca: NovaPeca, videoId: string): Promise<PecaCriada>;
  vincular(campanhaId: number, pecaId: number, destino: string): Promise<void>;
}
export function criarPlataforma(opcoes: { url: string; usuario: string; senha: string; fetch?: typeof fetch }): Plataforma;
```

- [ ] **Step 1: Write the failing test**

Criar `scripts/src/instagram/__tests__/resposta-falsa.ts`:

```ts
/**
 * Resposta mínima de `fetch` para os testes. Não usa `new Response()` porque
 * o construtor descarta `Set-Cookie`, e o login depende desse cabeçalho.
 */
export function resposta(status: number, corpo: unknown = {}, cabecalhos: Record<string, string> = {}): Response {
  const nomes = Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (nome: string) => nomes[nome.toLowerCase()] ?? null,
      getSetCookie: () => (nomes["set-cookie"] ? [nomes["set-cookie"]] : []),
    },
    json: async () => corpo,
  } as unknown as Response;
}
```

Criar `scripts/src/instagram/__tests__/plataforma.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ErroPlataforma, criarPlataforma } from "../plataforma";
import { resposta } from "./resposta-falsa";

interface Chamada {
  metodo: string;
  caminho: string;
  init: RequestInit;
}

function montar(responder: (metodo: string, caminho: string, init: RequestInit) => Response, login = 200) {
  const chamadas: Chamada[] = [];
  const fetchFalso = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const caminho = String(url).replace("https://tv.example/api", "");
    const metodo = init.method ?? "GET";
    chamadas.push({ metodo, caminho, init });
    if (caminho === "/auth/login") {
      return login === 200
        ? resposta(200, { ok: true }, { "Set-Cookie": "sid=abc123; Path=/; HttpOnly" })
        : resposta(401, { error: "Usuário ou senha inválidos." });
    }
    return responder(metodo, caminho, init);
  }) as typeof fetch;
  const plataforma = criarPlataforma({ url: "https://tv.example/", usuario: "admin", senha: "s3nha", fetch: fetchFalso });
  return { plataforma, chamadas };
}

const corpoJson = (chamada: Chamada) => JSON.parse(chamada.init.body as string);
const PECA = { titulo: "@padariacentral · 2026-09-28 · 1", externalRef: "instagram:DAbc123:1", orientacao: "portrait" as const };

describe("sessão", () => {
  it("entra uma vez só e manda o cookie nas chamadas seguintes", async () => {
    const { plataforma, chamadas } = montar(() => resposta(200, []));
    await plataforma.listarEmpresas();
    await plataforma.listarEmpresas();
    expect(chamadas.filter((c) => c.caminho === "/auth/login")).toHaveLength(1);
    expect(corpoJson(chamadas[0])).toEqual({ username: "admin", password: "s3nha" });
    expect((chamadas[1].init.headers as Record<string, string>).Cookie).toBe("sid=abc123");
    expect((chamadas[2].init.headers as Record<string, string>).Cookie).toBe("sid=abc123");
  });

  it("login recusado para antes de qualquer outra chamada", async () => {
    const { plataforma, chamadas } = montar(() => resposta(200, []), 401);
    await expect(plataforma.listarEmpresas()).rejects.toThrow(/Login admin recusado/);
    expect(chamadas).toHaveLength(1);
  });
});

describe("empresas", () => {
  it("busca pelo @ e devolve null quando não há", async () => {
    const { plataforma, chamadas } = montar((_m, caminho) =>
      resposta(200, caminho.includes("padariacentral") ? [{ id: 12, name: "Padaria Central", instagram: "padariacentral", advertiserId: 3 }] : []),
    );
    expect(await plataforma.buscarEmpresaPorInstagram("padariacentral")).toMatchObject({ id: 12, advertiserId: 3 });
    expect(await plataforma.buscarEmpresaPorInstagram("outro")).toBeNull();
    expect(chamadas[1].caminho).toBe("/companies?instagram=padariacentral");
  });

  it("cria só como anunciante, com bio nas observações e o @", async () => {
    const { plataforma, chamadas } = montar(() => resposta(201, { id: 12, name: "Padaria Central", instagram: "padariacentral", advertiserId: 3 }));
    await plataforma.criarEmpresa({ nome: "Padaria Central", bio: "Pão todo dia", handle: "padariacentral" });
    expect(chamadas[1]).toMatchObject({ metodo: "POST", caminho: "/companies" });
    expect(corpoJson(chamadas[1])).toEqual({
      name: "Padaria Central", notes: "Pão todo dia", instagram: "padariacentral", isClient: false, isAdvertiser: true,
    });
  });

  it("erro da API sobe com a mensagem em português e o status", async () => {
    const { plataforma } = montar(() => resposta(409, { error: "Já existe empresa com esse Instagram." }));
    const erro = await plataforma.criarEmpresa({ nome: "X", bio: "", handle: "x" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroPlataforma);
    expect(erro.message).toBe("Já existe empresa com esse Instagram.");
    expect(erro.status).toBe(409);
  });
});

describe("campanhas", () => {
  it("lista só as do anunciante", async () => {
    const { plataforma } = montar(() =>
      resposta(200, [
        { id: 7, advertiserId: 3, name: "Instagram @padariacentral", isActive: false },
        { id: 8, advertiserId: 4, name: "De outro", isActive: true },
      ]),
    );
    expect((await plataforma.listarCampanhas(3)).map((c) => c.id)).toEqual([7]);
  });

  it("cria pausada, contrato zero, para todas as TVs", async () => {
    const { plataforma, chamadas } = montar(() => resposta(201, { id: 7, advertiserId: 3, name: "Instagram @padariacentral", isActive: false }));
    await plataforma.criarCampanha({
      advertiserId: 3, nome: "Instagram @padariacentral",
      inicio: new Date("2026-09-30T12:00:00Z"), fim: new Date("2026-10-30T12:00:00Z"),
    });
    expect(corpoJson(chamadas[1])).toEqual({
      advertiserId: 3, name: "Instagram @padariacentral", contractValue: 0,
      startsAt: "2026-09-30T12:00:00.000Z", endsAt: "2026-10-30T12:00:00.000Z",
      targetMode: "all", isActive: false,
    });
  });

  it("vincular reenvia a campanha inteira com a união das peças", async () => {
    const campanha = {
      id: 7, advertiserId: 3, name: "Instagram @padariacentral", contractValue: 250,
      startsAt: "2026-09-30T12:00:00.000Z", endsAt: "2026-10-30T12:00:00.000Z",
      targetMode: "devices", deviceIds: [4, 5], segmentIds: [], weekdays: [1, 2, 3],
      announcementIds: [20, 21], isActive: false,
    };
    const { plataforma, chamadas } = montar((metodo) => resposta(200, metodo === "GET" ? campanha : {}));
    await plataforma.vincular(7, 22, "https://www.instagram.com/p/DAbc123/");
    expect(chamadas[1]).toMatchObject({ metodo: "GET", caminho: "/campaigns/7" });
    expect(chamadas[2]).toMatchObject({ metodo: "PATCH", caminho: "/campaigns/7" });
    expect(corpoJson(chamadas[2])).toEqual({
      advertiserId: 3, name: "Instagram @padariacentral", contractValue: 250,
      startsAt: "2026-09-30T12:00:00.000Z", endsAt: "2026-10-30T12:00:00.000Z",
      targetMode: "devices", deviceIds: [4, 5], segmentIds: [], weekdays: [1, 2, 3],
      announcementIds: [20, 21, 22],
      announcementDestinations: { "22": "https://www.instagram.com/p/DAbc123/" },
    });
  });

  it("vincular peça que já está na campanha não a repete", async () => {
    const campanha = {
      id: 7, advertiserId: 3, name: "C", contractValue: 0, startsAt: "2026-09-30T12:00:00.000Z",
      endsAt: "2026-10-30T12:00:00.000Z", targetMode: "all", deviceIds: [], segmentIds: [], weekdays: [],
      announcementIds: [20, 22],
    };
    const { plataforma, chamadas } = montar((metodo) => resposta(200, metodo === "GET" ? campanha : {}));
    await plataforma.vincular(7, 22, "https://www.instagram.com/p/DAbc123/");
    expect(corpoJson(chamadas[2]).announcementIds).toEqual([20, 22]);
  });
});

describe("peças", () => {
  it("referências importadas saem de GET /announcements, sem as nulas", async () => {
    const { plataforma } = montar(() => resposta(200, [{ id: 1, externalRef: "instagram:DAbc123:1" }, { id: 2, externalRef: null }, { id: 3 }]));
    expect(await plataforma.refsImportadas()).toEqual(new Set(["instagram:DAbc123:1"]));
  });

  it("peça de imagem vai em multipart com o arquivo", async () => {
    const pasta = await mkdtemp(path.join(tmpdir(), "peca-"));
    const arquivo = path.join(pasta, "1.jpg");
    await writeFile(arquivo, "conteudo");
    const { plataforma, chamadas } = montar(() => resposta(201, { id: 22 }));
    expect(await plataforma.criarPecaImagem(PECA, arquivo)).toEqual({ id: 22, jaExistia: false });
    const form = chamadas[1].init.body as FormData;
    expect(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"))).toEqual({
      title: PECA.titulo, showText: "false", duration: "10", mediaKind: "image",
      orientation: "portrait", externalRef: PECA.externalRef,
    });
    const imagem = form.get("image") as File;
    expect(imagem.name).toBe("1.jpg");
    expect(imagem.type).toBe("image/jpeg");
    expect(await imagem.text()).toBe("conteudo");
    // Content-Type do multipart é do fetch (leva o boundary); não pode ser fixado à mão.
    expect(chamadas[1].init.headers).not.toHaveProperty("Content-Type");
  });

  it("peça de reel vai como vídeo do YouTube, mudo, tocando até o fim", async () => {
    const { plataforma, chamadas } = montar(() => resposta(201, { id: 23 }));
    await plataforma.criarPecaYouTube(PECA, "abc123def45");
    const form = chamadas[1].init.body as FormData;
    expect(Object.fromEntries(form.entries())).toEqual({
      title: PECA.titulo, showText: "false", mediaKind: "youtube_video",
      youtubeUrl: "https://www.youtube.com/watch?v=abc123def45",
      playbackMode: "natural", audioMode: "muted", orientation: "portrait", externalRef: PECA.externalRef,
    });
  });

  it("409 de peça repetida devolve o id da existente, sem erro", async () => {
    const { plataforma } = montar(() => resposta(409, { error: "Peça já importada", id: 9 }));
    expect(await plataforma.criarPecaYouTube(PECA, "abc123def45")).toEqual({ id: 9, jaExistia: true });
  });

  it("outro erro ao criar peça sobe", async () => {
    const { plataforma } = montar(() => resposta(413, { error: "Imagem acima do limite de 4 MB." }));
    await expect(plataforma.criarPecaYouTube(PECA, "abc123def45")).rejects.toThrow("Imagem acima do limite de 4 MB.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/plataforma.test.ts`
Expected: FAIL — não resolve `../plataforma`.

- [ ] **Step 3: Write minimal implementation**

Criar `scripts/src/instagram/plataforma.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Erro devolvido pela API, com a mensagem em português que o servidor mandou. */
export class ErroPlataforma extends Error {
  constructor(
    mensagem: string,
    public status: number,
  ) {
    super(mensagem);
  }
}

export interface EmpresaApi {
  id: number;
  name: string;
  instagram: string | null;
  advertiserId: number | null;
}

export interface CampanhaApi {
  id: number;
  advertiserId: number;
  name: string;
  isActive: boolean;
}

export interface NovaPeca {
  titulo: string;
  externalRef: string;
  orientacao: "landscape" | "portrait";
}

export interface PecaCriada {
  id: number;
  /** A plataforma respondeu 409: a peça já tinha entrado numa importação anterior. */
  jaExistia: boolean;
}

export interface Plataforma {
  buscarEmpresaPorInstagram(handle: string): Promise<EmpresaApi | null>;
  listarEmpresas(): Promise<EmpresaApi[]>;
  obterEmpresa(id: number): Promise<EmpresaApi>;
  criarEmpresa(dados: { nome: string; bio: string; handle: string }): Promise<EmpresaApi>;
  atualizarEmpresa(id: number, patch: { isAdvertiser?: true; instagram?: string }): Promise<EmpresaApi>;
  listarCampanhas(advertiserId: number): Promise<CampanhaApi[]>;
  criarCampanha(dados: { advertiserId: number; nome: string; inicio: Date; fim: Date }): Promise<CampanhaApi>;
  refsImportadas(): Promise<Set<string>>;
  criarPecaImagem(peca: NovaPeca, arquivo: string): Promise<PecaCriada>;
  criarPecaYouTube(peca: NovaPeca, videoId: string): Promise<PecaCriada>;
  vincular(campanhaId: number, pecaId: number, destino: string): Promise<void>;
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

type Corpo = Record<string, unknown>;

/**
 * Fala com a plataforma pela API HTTP, como admin. Não vai ao banco: assim a
 * importação passa pelas mesmas validações e pelo mesmo storage do painel.
 */
export function criarPlataforma(opcoes: { url: string; usuario: string; senha: string; fetch?: typeof fetch }): Plataforma {
  const buscar = opcoes.fetch ?? globalThis.fetch;
  const base = `${opcoes.url.replace(/\/+$/, "")}/api`;
  let cookie: string | null = null;

  async function entrar(): Promise<string> {
    const res = await buscar(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: opcoes.usuario, password: opcoes.senha }),
    });
    const sid = res.headers.getSetCookie().find((c) => c.startsWith("sid="));
    if (!res.ok || !sid) {
      throw new ErroPlataforma("Login admin recusado. Confira ADMIN_USERNAME e ADMIN_PASSWORD.", res.status);
    }
    return sid.split(";")[0];
  }

  async function chamar(metodo: string, caminho: string, corpo?: Corpo | FormData): Promise<{ status: number; corpo: Corpo }> {
    cookie ??= await entrar();
    // No multipart o Content-Type fica por conta do fetch: ele leva o boundary.
    const json = corpo !== undefined && !(corpo instanceof FormData);
    const body = corpo === undefined ? undefined : corpo instanceof FormData ? corpo : JSON.stringify(corpo);
    const res = await buscar(`${base}${caminho}`, {
      method: metodo,
      headers: { Cookie: cookie, ...(json ? { "Content-Type": "application/json" } : {}) },
      body,
    });
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Corpo };
  }

  async function exigir<T>(metodo: string, caminho: string, corpo?: Corpo): Promise<T> {
    const r = await chamar(metodo, caminho, corpo);
    if (r.status >= 400) {
      throw new ErroPlataforma(typeof r.corpo.error === "string" ? r.corpo.error : `Erro ${r.status} em ${metodo} ${caminho}`, r.status);
    }
    // Lista ou objeto, conforme a rota: quem chama diz o formato.
    return r.corpo as unknown as T;
  }

  async function criarPeca(form: FormData): Promise<PecaCriada> {
    const r = await chamar("POST", "/announcements", form);
    if (r.status === 409 && typeof r.corpo.id === "number") return { id: r.corpo.id, jaExistia: true };
    if (r.status >= 400) {
      throw new ErroPlataforma(typeof r.corpo.error === "string" ? r.corpo.error : `Erro ${r.status} ao criar peça`, r.status);
    }
    return { id: r.corpo.id as number, jaExistia: false };
  }

  return {
    async buscarEmpresaPorInstagram(handle) {
      const lista = await exigir<EmpresaApi[]>("GET", `/companies?instagram=${encodeURIComponent(handle)}`);
      return lista[0] ?? null;
    },

    listarEmpresas: () => exigir<EmpresaApi[]>("GET", "/companies"),

    obterEmpresa: (id) => exigir<EmpresaApi>("GET", `/companies/${id}`),

    criarEmpresa: ({ nome, bio, handle }) =>
      exigir<EmpresaApi>("POST", "/companies", {
        name: nome,
        notes: bio,
        instagram: handle,
        isClient: false,
        isAdvertiser: true,
      }),

    atualizarEmpresa: (id, patch) => exigir<EmpresaApi>("PATCH", `/companies/${id}`, patch),

    async listarCampanhas(advertiserId) {
      const todas = await exigir<CampanhaApi[]>("GET", "/campaigns");
      return todas.filter((c) => c.advertiserId === advertiserId);
    },

    criarCampanha: ({ advertiserId, nome, inicio, fim }) =>
      exigir<CampanhaApi>("POST", "/campaigns", {
        advertiserId,
        name: nome,
        contractValue: 0,
        startsAt: inicio.toISOString(),
        endsAt: fim.toISOString(),
        targetMode: "all",
        // Nasce fora do ar: o admin revisa as peças e o alvo antes de ligar.
        isActive: false,
      }),

    async refsImportadas() {
      const pecas = await exigir<Array<{ externalRef?: string | null }>>("GET", "/announcements");
      return new Set(pecas.map((p) => p.externalRef).filter((r): r is string => typeof r === "string"));
    },

    async criarPecaImagem(peca, arquivo) {
      const form = new FormData();
      form.set("title", peca.titulo);
      form.set("showText", "false");
      form.set("duration", "10");
      form.set("mediaKind", "image");
      form.set("orientation", peca.orientacao);
      form.set("externalRef", peca.externalRef);
      const tipo = MIME[path.extname(arquivo).toLowerCase()] ?? "application/octet-stream";
      form.set("image", new Blob([await readFile(arquivo)], { type: tipo }), path.basename(arquivo));
      return criarPeca(form);
    },

    async criarPecaYouTube(peca, videoId) {
      const form = new FormData();
      form.set("title", peca.titulo);
      form.set("showText", "false");
      form.set("mediaKind", "youtube_video");
      form.set("youtubeUrl", `https://www.youtube.com/watch?v=${videoId}`);
      form.set("playbackMode", "natural");
      // Trilha de reel costuma ser música licenciada só dentro do Instagram.
      form.set("audioMode", "muted");
      form.set("orientation", peca.orientacao);
      form.set("externalRef", peca.externalRef);
      return criarPeca(form);
    },

    async vincular(campanhaId, pecaId, destino) {
      // PATCH /campaigns/:id substitui peças e alvo pelo que recebe. Por isso
      // a campanha volta inteira, só com a peça nova somada à lista.
      const c = await exigir<Corpo & { announcementIds: number[] }>("GET", `/campaigns/${campanhaId}`);
      await exigir("PATCH", `/campaigns/${campanhaId}`, {
        advertiserId: c.advertiserId,
        name: c.name,
        contractValue: c.contractValue,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        targetMode: c.targetMode,
        deviceIds: c.deviceIds,
        segmentIds: c.segmentIds,
        weekdays: c.weekdays,
        announcementIds: [...new Set([...c.announcementIds, pecaId])],
        announcementDestinations: { [String(pecaId)]: destino },
      });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/plataforma.test.ts`
Expected: PASS, 14 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/instagram/plataforma.ts scripts/src/instagram/__tests__/plataforma.test.ts scripts/src/instagram/__tests__/resposta-falsa.ts
git commit -m "feat(instagram): cliente da API da plataforma como admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Script — envio ao YouTube (`youtube.ts`)

**Files:**
- Create: `scripts/src/instagram/youtube.ts`
- Test: `scripts/src/instagram/__tests__/youtube.test.ts`

**Interfaces:**
- Consumes: `resposta` de `./__tests__/resposta-falsa` (Task 9), só nos testes.
- Produces:

```ts
export class ErroYouTube extends Error {}
export class CotaYouTubeEsgotada extends ErroYouTube {}
export interface EnvioYouTube { subir(arquivo: string, titulo: string): Promise<string> }
export function criarEnvioYouTube(opcoes: { clientId: string; clientSecret: string; refreshToken: string; fetch?: typeof fetch }): EnvioYouTube;
export function urlDeConsentimento(clientId: string, redirectUri: string): string;
export function loginYouTube(opcoes: { clientId: string; clientSecret: string; porta?: number; fetch?: typeof fetch; avisar?: (url: string) => void }): Promise<string>;
```

Sequência do envio retomável (YouTube Data API v3): 1) `POST https://oauth2.googleapis.com/token` troca o refresh token por access token; 2) `POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status` com os metadados devolve a URL de upload no cabeçalho `Location`; 3) `PUT` nessa URL com os bytes devolve o vídeo com `id` e `status.privacyStatus`.

- [ ] **Step 1: Write the failing test**

Criar `scripts/src/instagram/__tests__/youtube.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CotaYouTubeEsgotada, ErroYouTube, criarEnvioYouTube, urlDeConsentimento } from "../youtube";
import { resposta } from "./resposta-falsa";

interface Chamada {
  url: string;
  init: RequestInit;
}

let arquivo: string;
beforeAll(async () => {
  arquivo = path.join(await mkdtemp(path.join(tmpdir(), "yt-")), "1.mp4");
  await writeFile(arquivo, "bytes-do-video");
});

function montar(etapas: { token?: Response; inicio?: Response; envio?: Response }) {
  const chamadas: Chamada[] = [];
  const fetchFalso = (async (url: string | URL | Request, init: RequestInit = {}) => {
    const alvo = String(url);
    chamadas.push({ url: alvo, init });
    if (alvo.startsWith("https://oauth2.googleapis.com/token")) {
      return etapas.token ?? resposta(200, { access_token: "acesso" });
    }
    if (alvo.includes("uploadType=resumable")) {
      return etapas.inicio ?? resposta(200, {}, { Location: "https://upload.example/sessao-1" });
    }
    return etapas.envio ?? resposta(200, { id: "abc123def45", status: { privacyStatus: "unlisted" } });
  }) as typeof fetch;
  const envio = criarEnvioYouTube({ clientId: "cid", clientSecret: "seg", refreshToken: "ref", fetch: fetchFalso });
  return { envio, chamadas };
}

describe("subir", () => {
  it("troca o token, abre a sessão, manda o arquivo e devolve o id", async () => {
    const { envio, chamadas } = montar({});
    expect(await envio.subir(arquivo, "@padariacentral · 2026-09-25")).toBe("abc123def45");

    expect(String(chamadas[0].init.body)).toBe(
      "client_id=cid&client_secret=seg&refresh_token=ref&grant_type=refresh_token",
    );

    expect(chamadas[1].url).toBe(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    );
    const cabecalhos = chamadas[1].init.headers as Record<string, string>;
    expect(cabecalhos.Authorization).toBe("Bearer acesso");
    expect(cabecalhos["X-Upload-Content-Type"]).toBe("video/mp4");
    expect(cabecalhos["X-Upload-Content-Length"]).toBe("14");
    expect(JSON.parse(chamadas[1].init.body as string)).toEqual({
      snippet: { title: "@padariacentral · 2026-09-25", categoryId: "22" },
      status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
    });

    expect(chamadas[2].url).toBe("https://upload.example/sessao-1");
    expect(chamadas[2].init.method).toBe("PUT");
    expect(Buffer.from(chamadas[2].init.body as Uint8Array).toString()).toBe("bytes-do-video");
  });

  it("cota do dia esgotada vira CotaYouTubeEsgotada", async () => {
    const { envio } = montar({
      inicio: resposta(403, { error: { errors: [{ reason: "quotaExceeded" }], message: "The request cannot be completed because you have exceeded your quota." } }),
    });
    await expect(envio.subir(arquivo, "t")).rejects.toBeInstanceOf(CotaYouTubeEsgotada);
  });

  it("limite de envios do canal também é cota", async () => {
    const { envio } = montar({
      envio: resposta(400, { error: { errors: [{ reason: "uploadLimitExceeded" }], message: "The user has exceeded the number of videos they may upload." } }),
    });
    await expect(envio.subir(arquivo, "t")).rejects.toBeInstanceOf(CotaYouTubeEsgotada);
  });

  it("vídeo que o YouTube trancou como privado falha com o id, em vez de virar peça que não toca", async () => {
    const { envio } = montar({ envio: resposta(200, { id: "abc123def45", status: { privacyStatus: "private" } }) });
    const erro = await envio.subir(arquivo, "t").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroYouTube);
    expect(erro).not.toBeInstanceOf(CotaYouTubeEsgotada);
    expect(erro.message).toContain("abc123def45");
    expect(erro.message).toContain("privado");
  });

  it("refresh token recusado pede novo login", async () => {
    const { envio, chamadas } = montar({ token: resposta(400, { error: "invalid_grant" }) });
    await expect(envio.subir(arquivo, "t")).rejects.toThrow(/youtube-login/);
    expect(chamadas).toHaveLength(1);
  });

  it("sessão de upload sem Location é erro, não envio às cegas", async () => {
    const { envio, chamadas } = montar({ inicio: resposta(200, {}) });
    await expect(envio.subir(arquivo, "t")).rejects.toBeInstanceOf(ErroYouTube);
    expect(chamadas).toHaveLength(2);
  });

  it("outro erro da API sobe com a mensagem do YouTube", async () => {
    const { envio } = montar({ envio: resposta(500, { error: { message: "Backend Error" } }) });
    await expect(envio.subir(arquivo, "t")).rejects.toThrow("Backend Error");
  });
});

describe("urlDeConsentimento", () => {
  it("pede só o escopo de envio, com acesso offline", () => {
    const url = new URL(urlDeConsentimento("cid", "http://127.0.0.1:8765"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "cid",
      redirect_uri: "http://127.0.0.1:8765",
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      access_type: "offline",
      prompt: "consent",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/youtube.test.ts`
Expected: FAIL — não resolve `../youtube`.

- [ ] **Step 3: Write minimal implementation**

Criar `scripts/src/instagram/youtube.ts`:

```ts
import { readFile } from "node:fs/promises";
import http from "node:http";

export class ErroYouTube extends Error {}

/** Cota diária da API ou limite de envios do canal: tentar de novo outro dia. */
export class CotaYouTubeEsgotada extends ErroYouTube {}

export interface EnvioYouTube {
  /** Sobe o arquivo como não listado e devolve o id do vídeo. */
  subir(arquivo: string, titulo: string): Promise<string>;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const ESCOPO = "https://www.googleapis.com/auth/youtube.upload";
const MOTIVOS_DE_COTA = new Set(["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "uploadLimitExceeded"]);

interface ErroApi {
  error?: { message?: string; errors?: Array<{ reason?: string }> } | string;
}

async function erroDaApi(res: Response, etapa: string): Promise<ErroYouTube> {
  const corpo = (await res.json().catch(() => ({}))) as ErroApi;
  const detalhe = typeof corpo.error === "object" ? corpo.error : undefined;
  const mensagem = detalhe?.message ?? `YouTube respondeu ${res.status} ao ${etapa}.`;
  const cota = detalhe?.errors?.some((e) => e.reason !== undefined && MOTIVOS_DE_COTA.has(e.reason));
  return cota ? new CotaYouTubeEsgotada(mensagem) : new ErroYouTube(mensagem);
}

async function tokenDeAcesso(
  buscar: typeof fetch,
  credenciais: { clientId: string; clientSecret: string; refreshToken: string },
): Promise<string> {
  const res = await buscar(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credenciais.clientId,
      client_secret: credenciais.clientSecret,
      refresh_token: credenciais.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const corpo = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !corpo.access_token) {
    throw new ErroYouTube(
      "Login do YouTube expirou. Rode: pnpm --filter @workspace/scripts run importar:instagram youtube-login",
    );
  }
  return corpo.access_token;
}

export function criarEnvioYouTube(opcoes: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof fetch;
}): EnvioYouTube {
  const buscar = opcoes.fetch ?? globalThis.fetch;
  return {
    async subir(arquivo, titulo) {
      const acesso = await tokenDeAcesso(buscar, opcoes);
      const bytes = await readFile(arquivo);

      const inicio = await buscar(UPLOAD_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${acesso}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(bytes.length),
        },
        body: JSON.stringify({
          snippet: { title: titulo, categoryId: "22" },
          // Não listado: toca por link e por embed, mas não aparece no canal.
          status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
        }),
      });
      if (!inicio.ok) throw await erroDaApi(inicio, "abrir o envio");
      const destino = inicio.headers.get("location");
      if (!destino) throw new ErroYouTube("YouTube não devolveu a URL de envio.");

      const envio = await buscar(destino, {
        method: "PUT",
        headers: { Authorization: `Bearer ${acesso}`, "Content-Type": "video/mp4" },
        body: new Uint8Array(bytes),
      });
      if (!envio.ok) throw await erroDaApi(envio, "enviar o vídeo");
      const video = (await envio.json()) as { id?: string; status?: { privacyStatus?: string } };
      if (!video.id) throw new ErroYouTube("YouTube aceitou o envio mas não devolveu o id do vídeo.");

      // Projeto do Google Cloud sem auditoria da API tem os envios trancados
      // como privados, e vídeo privado não toca por embed: a TV ficaria em
      // tela preta. Melhor falhar aqui, com o id, do que criar a peça.
      if (video.status?.privacyStatus !== "unlisted") {
        throw new ErroYouTube(
          `Vídeo ${video.id} ficou ${video.status?.privacyStatus === "private" ? "privado" : "com privacidade inesperada"} ` +
            "no YouTube e não tocaria na TV. Mude para não listado no YouTube Studio e grave o id em \"videoId\" " +
            "do item no plano, ou peça a auditoria da API no Google Cloud.",
        );
      }
      return video.id;
    },
  };
}

export function urlDeConsentimento(clientId: string, redirectUri: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ESCOPO);
  // offline + consent: é o que faz o Google devolver o refresh token.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

/**
 * Login único do canal: abre um servidor local, espera o Google redirecionar
 * com o código e troca pelo refresh token. Credencial OAuth do tipo
 * "App para computador", que aceita redirect para 127.0.0.1.
 */
export function loginYouTube(opcoes: {
  clientId: string;
  clientSecret: string;
  porta?: number;
  fetch?: typeof fetch;
  avisar?: (url: string) => void;
}): Promise<string> {
  const buscar = opcoes.fetch ?? globalThis.fetch;
  const porta = opcoes.porta ?? 8765;
  const redirectUri = `http://127.0.0.1:${porta}`;
  return new Promise((resolve, reject) => {
    const servidor = http.createServer(async (req, res) => {
      const codigo = new URL(req.url ?? "/", redirectUri).searchParams.get("code");
      if (!codigo) {
        res.writeHead(400).end("Sem código de autorização.");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Pronto. Pode fechar esta aba.");
      servidor.close();
      try {
        const troca = await buscar(TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: codigo,
            client_id: opcoes.clientId,
            client_secret: opcoes.clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }).toString(),
        });
        const corpo = (await troca.json().catch(() => ({}))) as { refresh_token?: string };
        if (!troca.ok || !corpo.refresh_token) {
          reject(new ErroYouTube("O Google não devolveu o refresh token. Revogue o acesso do app na conta e tente de novo."));
          return;
        }
        resolve(corpo.refresh_token);
      } catch (err) {
        reject(err);
      }
    });
    servidor.on("error", reject);
    servidor.listen(porta, "127.0.0.1", () => {
      (opcoes.avisar ?? console.log)(urlDeConsentimento(opcoes.clientId, redirectUri));
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/youtube.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/instagram/youtube.ts scripts/src/instagram/__tests__/youtube.test.ts
git commit -m "feat(instagram): sobe reel no YouTube como não listado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Script — imagem dentro do limite (`imagem.ts`)

**Files:**
- Create: `scripts/src/instagram/imagem.ts`
- Test: `scripts/src/instagram/__tests__/imagem.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:

```ts
export const LIMITE_UPLOAD_BYTES = 4_000_000;
export type Converter = (origem: string, destino: string, qualidade: number) => Promise<void>;
export function prepararImagem(
  arquivo: string,
  opcoes?: { limite?: number; converter?: Converter },
): Promise<{ arquivo: string; recomprimida: boolean }>;
```

- [ ] **Step 1: Write the failing test**

Criar `scripts/src/instagram/__tests__/imagem.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LIMITE_UPLOAD_BYTES, prepararImagem } from "../imagem";

async function arquivoDe(nome: string, bytes: number): Promise<string> {
  const arquivo = path.join(await mkdtemp(path.join(tmpdir(), "img-")), nome);
  await writeFile(arquivo, Buffer.alloc(bytes));
  return arquivo;
}

/** Conversor falso: cada qualidade produz um arquivo do tamanho combinado. */
function conversor(tamanhos: Record<number, number>) {
  return vi.fn(async (_origem: string, destino: string, qualidade: number) => {
    await writeFile(destino, Buffer.alloc(tamanhos[qualidade] ?? 999_999));
  });
}

describe("prepararImagem", () => {
  it("o limite padrão fica abaixo do corte de 4,5 MB da Vercel", () => {
    expect(LIMITE_UPLOAD_BYTES).toBe(4_000_000);
  });

  it("JPEG dentro do limite sobe como veio, sem converter", async () => {
    const arquivo = await arquivoDe("1.jpg", 500);
    const converter = conversor({});
    expect(await prepararImagem(arquivo, { limite: 1000, converter })).toEqual({ arquivo, recomprimida: false });
    expect(converter).not.toHaveBeenCalled();
  });

  it("acima do limite recomprime, começando pela melhor qualidade", async () => {
    const arquivo = await arquivoDe("1.jpg", 5000);
    const converter = conversor({ 2: 3000, 4: 900 });
    const resultado = await prepararImagem(arquivo, { limite: 1000, converter });
    expect(resultado.recomprimida).toBe(true);
    expect(path.basename(resultado.arquivo)).toBe("1.q4.jpg");
    expect(converter.mock.calls.map((c) => c[2])).toEqual([2, 4]);
  });

  it("formato que a plataforma não aceita vira JPEG mesmo sendo pequeno", async () => {
    const arquivo = await arquivoDe("1.heic", 500);
    const converter = conversor({ 2: 400 });
    const resultado = await prepararImagem(arquivo, { limite: 1000, converter });
    expect(resultado.recomprimida).toBe(true);
    expect(path.basename(resultado.arquivo)).toBe("1.q2.jpg");
  });

  it("extensão em maiúsculas é reconhecida", async () => {
    const arquivo = await arquivoDe("1.JPG", 500);
    const converter = conversor({});
    expect((await prepararImagem(arquivo, { limite: 1000, converter })).recomprimida).toBe(false);
  });

  it("imagem que não cabe nem na menor qualidade é erro", async () => {
    const arquivo = await arquivoDe("1.png", 5000);
    const converter = conversor({ 2: 4000, 4: 3000, 6: 2500, 9: 2000, 14: 1500 });
    await expect(prepararImagem(arquivo, { limite: 1000, converter })).rejects.toThrow(/não coube/);
    expect(converter).toHaveBeenCalledTimes(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/imagem.test.ts`
Expected: FAIL — não resolve `../imagem`.

- [ ] **Step 3: Write minimal implementation**

Criar `scripts/src/instagram/imagem.ts`:

```ts
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

/** A Vercel corta o corpo da requisição em 4,5 MB; a folga cobre o multipart. */
export const LIMITE_UPLOAD_BYTES = 4_000_000;

// Formatos que o painel já recebe hoje. O resto (HEIC, AVIF) vira JPEG.
const ACEITAS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Escala -q:v do ffmpeg para JPEG: 2 é quase sem perda, 31 é o pior. Sobe
// devagar para a peça perder o mínimo necessário.
const QUALIDADES = [2, 4, 6, 9, 14];

export type Converter = (origem: string, destino: string, qualidade: number) => Promise<void>;

export const converterComFfmpeg: Converter = (origem, destino, qualidade) =>
  new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", origem, "-q:v", String(qualidade), destino],
      (err, _stdout, stderr) => (err ? reject(new Error(`ffmpeg: ${stderr.trim() || err.message}`)) : resolve()),
    );
  });

/**
 * Devolve um arquivo que a plataforma aceita: o original quando já serve, ou
 * um JPEG recomprimido quando ele passa do limite ou vem em formato estranho.
 */
export async function prepararImagem(
  arquivo: string,
  opcoes: { limite?: number; converter?: Converter } = {},
): Promise<{ arquivo: string; recomprimida: boolean }> {
  const limite = opcoes.limite ?? LIMITE_UPLOAD_BYTES;
  const converter = opcoes.converter ?? converterComFfmpeg;
  const extensao = path.extname(arquivo);

  if (ACEITAS.has(extensao.toLowerCase()) && (await stat(arquivo)).size <= limite) {
    return { arquivo, recomprimida: false };
  }

  const semExtensao = arquivo.slice(0, arquivo.length - extensao.length);
  for (const qualidade of QUALIDADES) {
    const destino = `${semExtensao}.q${qualidade}.jpg`;
    await converter(arquivo, destino, qualidade);
    if ((await stat(destino)).size <= limite) return { arquivo: destino, recomprimida: true };
  }
  throw new Error(`Imagem não coube em ${Math.round(limite / 1_000_000)} MB nem recomprimida: ${path.basename(arquivo)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/imagem.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/instagram/imagem.ts scripts/src/instagram/__tests__/imagem.test.ts
git commit -m "feat(instagram): recomprime imagem acima do limite de upload

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Script — executor do plano (`executor.ts`)

**Files:**
- Create: `scripts/src/instagram/executor.ts`
- Test: `scripts/src/instagram/__tests__/executor.test.ts`

**Interfaces:**
- Consumes: `Plano`, `ItemPlano`, `tituloDaPeca` de `./plano` (Task 8); `Plataforma`, `EmpresaApi` de `./plataforma` (Task 9); `EnvioYouTube`, `CotaYouTubeEsgotada` de `./youtube` (Task 10); `FonteInstagram` de `./tipos` e `ErroInstagram` de `./perfil` (Task 7).
- Produces:

```ts
export const DIAS_DE_CAMPANHA = 30;
export interface Dependencias {
  fonte: Pick<FonteInstagram, "baixar">;
  youtube: EnvioYouTube;
  plataforma: Plataforma;
  prepararImagem: (arquivo: string) => Promise<{ arquivo: string; recomprimida: boolean }>;
  salvar: (plano: Plano) => Promise<void>;
  pastaMidia: string;
  agora: () => Date;
}
export interface Relatorio {
  empresaId: number; campanhaId: number;
  criadas: number; puladas: number; pendentes: number;
  falhas: Array<{ ref: string; erro: string }>;
  recomprimidas: string[];
  cotaEsgotada: boolean;
  interrompido: string | null;
}
export function executarPlano(plano: Plano, deps: Dependencias): Promise<Relatorio>;
```

Regras do executor:
- Empresa e campanha primeiro; o `id` de cada uma entra no plano e é salvo na hora.
- Item `falha` de uma execução anterior é tentado de novo; `criada` e `pulada` não.
- `CotaYouTubeEsgotada`: o item fica `pendente`, nenhum outro vídeo é tentado nesta execução, as imagens seguem.
- `ErroInstagram` (sessão expirada, limite): para o laço; o item atual e os seguintes ficam `pendente`.
- Qualquer outro erro: o item vira `falha` com a mensagem e o laço segue.
- `videoId` é salvo assim que o envio termina; `pecaId` assim que a peça existe. Com `pecaId` já gravado, a nova execução só vincula.

- [ ] **Step 1: Write the failing test**

Criar `scripts/src/instagram/__tests__/executor.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { executarPlano, type Dependencias } from "../executor";
import { ErroInstagram } from "../perfil";
import type { ItemPlano, Plano } from "../plano";
import type { EmpresaApi } from "../plataforma";
import { CotaYouTubeEsgotada } from "../youtube";

const AGORA = new Date("2026-09-30T12:00:00.000Z");
const EMPRESA: EmpresaApi = { id: 12, name: "Padaria Central", instagram: "padariacentral", advertiserId: 3 };

function item(codigo: string, tipo: "imagem" | "video", over: Partial<ItemPlano> = {}): ItemPlano {
  return {
    ref: `instagram:${codigo}:1`, codigo, n: 1, tipo,
    postUrl: `https://www.instagram.com/p/${codigo}/`, data: "2026-09-28",
    orientacao: "portrait", status: "pendente", ...over,
  };
}

function plano(itens: ItemPlano[], over: Partial<Plano> = {}): Plano {
  return { handle: "padariacentral", empresa: { id: 12 }, campanha: { id: 7 }, itens, ...over };
}

function montar() {
  let proximaPeca = 100;
  const plataforma = {
    buscarEmpresaPorInstagram: vi.fn(),
    listarEmpresas: vi.fn(),
    obterEmpresa: vi.fn(async () => EMPRESA),
    criarEmpresa: vi.fn(async () => EMPRESA),
    atualizarEmpresa: vi.fn(async () => EMPRESA),
    listarCampanhas: vi.fn(),
    criarCampanha: vi.fn(async () => ({ id: 7, advertiserId: 3, name: "Instagram @padariacentral", isActive: false })),
    refsImportadas: vi.fn(),
    criarPecaImagem: vi.fn(async () => ({ id: proximaPeca++, jaExistia: false })),
    criarPecaYouTube: vi.fn(async () => ({ id: proximaPeca++, jaExistia: false })),
    vincular: vi.fn(async () => undefined),
  };
  const fonte = { baixar: vi.fn(async (_url: string, n: number, destino: string) => `${destino}/${n}.bin`) };
  const youtube = { subir: vi.fn(async () => "vid00000001") };
  const salvos: Plano[] = [];
  const deps: Dependencias = {
    fonte,
    youtube,
    plataforma,
    prepararImagem: vi.fn(async (arquivo: string) => ({ arquivo, recomprimida: false })),
    // Cópia: o teste precisa ver o plano como estava em cada gravação.
    salvar: vi.fn(async (p: Plano) => void salvos.push(structuredClone(p))),
    pastaMidia: "/trabalho/midia",
    agora: () => AGORA,
  };
  return { deps, plataforma, fonte, youtube, salvos };
}

describe("empresa e campanha", () => {
  it("cria as duas uma vez, grava os ids no plano na hora e não cria de novo na segunda execução", async () => {
    const { deps, plataforma, salvos } = montar();
    const p = plano([item("A1", "imagem")], {
      empresa: { criar: { nome: "Padaria Central", bio: "Pão todo dia" } },
      campanha: { criar: { nome: "Instagram @padariacentral" } },
    });

    const relatorio = await executarPlano(p, deps);
    expect(plataforma.criarEmpresa).toHaveBeenCalledWith({ nome: "Padaria Central", bio: "Pão todo dia", handle: "padariacentral" });
    expect(plataforma.criarCampanha).toHaveBeenCalledWith({
      advertiserId: 3, nome: "Instagram @padariacentral",
      inicio: AGORA, fim: new Date("2026-10-30T12:00:00.000Z"),
    });
    // Salvo logo depois da empresa, antes de existir campanha: queda nesse
    // ponto não cria segunda empresa.
    expect(salvos[0].empresa).toEqual({ id: 12 });
    expect(salvos[0].campanha).toEqual({ criar: { nome: "Instagram @padariacentral" } });
    expect(salvos[1].campanha).toEqual({ id: 7 });
    expect(relatorio).toMatchObject({ empresaId: 12, campanhaId: 7, criadas: 1 });

    await executarPlano(p, deps);
    expect(plataforma.criarEmpresa).toHaveBeenCalledTimes(1);
    expect(plataforma.criarCampanha).toHaveBeenCalledTimes(1);
  });

  it("empresa existente que só é cliente ganha o perfil de anunciante", async () => {
    const { deps, plataforma } = montar();
    plataforma.obterEmpresa.mockResolvedValueOnce({ ...EMPRESA, advertiserId: null, instagram: null });
    await executarPlano(plano([item("A1", "imagem")], { empresa: { id: 12, gravarInstagram: true } }), deps);
    expect(plataforma.atualizarEmpresa).toHaveBeenCalledWith(12, { isAdvertiser: true, instagram: "padariacentral" });
  });

  it("empresa que já é anunciante e já tem o @ não é alterada", async () => {
    const { deps, plataforma } = montar();
    await executarPlano(plano([item("A1", "imagem")], { empresa: { id: 12, gravarInstagram: true } }), deps);
    expect(plataforma.atualizarEmpresa).not.toHaveBeenCalled();
  });

  it("erro ao criar a empresa sobe e nenhuma peça é tocada", async () => {
    const { deps, plataforma, fonte } = montar();
    plataforma.criarEmpresa.mockRejectedValueOnce(new Error("Login admin recusado."));
    await expect(
      executarPlano(plano([item("A1", "imagem")], { empresa: { criar: { nome: "X", bio: "" } } }), deps),
    ).rejects.toThrow("Login admin recusado.");
    expect(fonte.baixar).not.toHaveBeenCalled();
  });
});

describe("itens", () => {
  it("imagem: baixa, prepara, cria a peça e vincula com o link do post", async () => {
    const { deps, plataforma, fonte } = montar();
    const p = plano([item("A1", "imagem")]);
    const relatorio = await executarPlano(p, deps);
    expect(fonte.baixar).toHaveBeenCalledWith("https://www.instagram.com/p/A1/", 1, "/trabalho/midia/A1");
    expect(plataforma.criarPecaImagem).toHaveBeenCalledWith(
      { titulo: "@padariacentral · 2026-09-28 · 1", externalRef: "instagram:A1:1", orientacao: "portrait" },
      "/trabalho/midia/A1/1.bin",
    );
    expect(plataforma.vincular).toHaveBeenCalledWith(7, 100, "https://www.instagram.com/p/A1/");
    expect(p.itens[0]).toMatchObject({ status: "criada", pecaId: 100 });
    expect(relatorio).toMatchObject({ criadas: 1, puladas: 0, pendentes: 0, falhas: [], cotaEsgotada: false, interrompido: null });
  });

  it("imagem recomprimida sobe o arquivo novo e aparece no relatório", async () => {
    const { deps, plataforma } = montar();
    vi.mocked(deps.prepararImagem).mockResolvedValueOnce({ arquivo: "/trabalho/midia/A1/1.q4.jpg", recomprimida: true });
    const relatorio = await executarPlano(plano([item("A1", "imagem")]), deps);
    expect(plataforma.criarPecaImagem).toHaveBeenCalledWith(expect.anything(), "/trabalho/midia/A1/1.q4.jpg");
    expect(relatorio.recomprimidas).toEqual(["instagram:A1:1"]);
  });

  it("vídeo: sobe no YouTube, grava o id no plano antes de criar a peça", async () => {
    const { deps, plataforma, youtube, salvos } = montar();
    const p = plano([item("R1", "video")]);
    await executarPlano(p, deps);
    expect(youtube.subir).toHaveBeenCalledWith("/trabalho/midia/R1/1.bin", "@padariacentral · 2026-09-28 · 1");
    expect(plataforma.criarPecaYouTube).toHaveBeenCalledWith(
      { titulo: "@padariacentral · 2026-09-28 · 1", externalRef: "instagram:R1:1", orientacao: "portrait" },
      "vid00000001",
    );
    expect(salvos[0].itens[0]).toMatchObject({ videoId: "vid00000001", status: "pendente" });
    expect(salvos[0].itens[0]).not.toHaveProperty("pecaId");
    expect(p.itens[0].status).toBe("criada");
  });

  it("vídeo já enviado numa execução anterior não sobe de novo", async () => {
    const { deps, plataforma, youtube, fonte } = montar();
    await executarPlano(plano([item("R1", "video", { videoId: "jaSubiu0001" })]), deps);
    expect(youtube.subir).not.toHaveBeenCalled();
    expect(fonte.baixar).not.toHaveBeenCalled();
    expect(plataforma.criarPecaYouTube).toHaveBeenCalledWith(expect.anything(), "jaSubiu0001");
  });

  it("peça já criada numa execução anterior só é vinculada", async () => {
    const { deps, plataforma, fonte } = montar();
    const p = plano([item("A1", "imagem", { pecaId: 55 })]);
    await executarPlano(p, deps);
    expect(fonte.baixar).not.toHaveBeenCalled();
    expect(plataforma.criarPecaImagem).not.toHaveBeenCalled();
    expect(plataforma.vincular).toHaveBeenCalledWith(7, 55, "https://www.instagram.com/p/A1/");
    expect(p.itens[0].status).toBe("criada");
  });

  it("peça que a plataforma diz que já existe vira pulada, mas ainda é vinculada", async () => {
    const { deps, plataforma } = montar();
    plataforma.criarPecaImagem.mockResolvedValueOnce({ id: 9, jaExistia: true });
    const p = plano([item("A1", "imagem")]);
    const relatorio = await executarPlano(p, deps);
    expect(plataforma.vincular).toHaveBeenCalledWith(7, 9, "https://www.instagram.com/p/A1/");
    expect(p.itens[0]).toMatchObject({ status: "pulada", pecaId: 9 });
    expect(relatorio).toMatchObject({ criadas: 0, puladas: 1 });
  });

  it("item pulado já no plano não é tocado", async () => {
    const { deps, plataforma, fonte } = montar();
    const relatorio = await executarPlano(plano([item("A1", "imagem", { status: "pulada" })]), deps);
    expect(fonte.baixar).not.toHaveBeenCalled();
    expect(plataforma.vincular).not.toHaveBeenCalled();
    expect(relatorio.puladas).toBe(1);
  });

  it("falha em um item não derruba os outros", async () => {
    const { deps, plataforma } = montar();
    plataforma.criarPecaImagem.mockRejectedValueOnce(new Error("Could not persist image in object storage"));
    const p = plano([item("A1", "imagem"), item("B2", "imagem")]);
    const relatorio = await executarPlano(p, deps);
    expect(p.itens.map((i) => i.status)).toEqual(["falha", "criada"]);
    expect(p.itens[0].erro).toBe("Could not persist image in object storage");
    expect(relatorio).toMatchObject({ criadas: 1, falhas: [{ ref: "instagram:A1:1", erro: "Could not persist image in object storage" }] });
  });

  it("falha de uma execução anterior é tentada de novo e o erro antigo some", async () => {
    const { deps } = montar();
    const p = plano([item("A1", "imagem", { status: "falha", erro: "timeout" })]);
    await executarPlano(p, deps);
    expect(p.itens[0].status).toBe("criada");
    expect(p.itens[0]).not.toHaveProperty("erro");
  });

  it("cota do YouTube esgotada: imagens seguem, vídeos ficam pendentes e nenhum outro é tentado", async () => {
    const { deps, youtube, plataforma } = montar();
    youtube.subir.mockRejectedValueOnce(new CotaYouTubeEsgotada("quota"));
    const p = plano([item("R1", "video"), item("A1", "imagem"), item("R2", "video")]);
    const relatorio = await executarPlano(p, deps);
    expect(p.itens.map((i) => i.status)).toEqual(["pendente", "criada", "pendente"]);
    expect(youtube.subir).toHaveBeenCalledTimes(1);
    expect(plataforma.criarPecaYouTube).not.toHaveBeenCalled();
    expect(relatorio).toMatchObject({ criadas: 1, pendentes: 2, cotaEsgotada: true, falhas: [] });
  });

  it("cota esgotada não impede vídeo que já tinha subido", async () => {
    const { deps, youtube, plataforma } = montar();
    youtube.subir.mockRejectedValueOnce(new CotaYouTubeEsgotada("quota"));
    const p = plano([item("R1", "video"), item("R2", "video", { videoId: "jaSubiu0001" })]);
    await executarPlano(p, deps);
    expect(p.itens.map((i) => i.status)).toEqual(["pendente", "criada"]);
    expect(plataforma.criarPecaYouTube).toHaveBeenCalledWith(expect.anything(), "jaSubiu0001");
  });

  it("Instagram fora do ar para a importação: o item atual e os seguintes ficam pendentes", async () => {
    const { deps, fonte } = montar();
    fonte.baixar
      .mockResolvedValueOnce("/trabalho/midia/A1/1.bin")
      .mockRejectedValueOnce(new ErroInstagram("O Instagram limitou as requisições. Espere algumas horas e rode de novo."));
    const p = plano([item("A1", "imagem"), item("B2", "imagem"), item("C3", "imagem")]);
    const relatorio = await executarPlano(p, deps);
    expect(p.itens.map((i) => i.status)).toEqual(["criada", "pendente", "pendente"]);
    expect(fonte.baixar).toHaveBeenCalledTimes(2);
    expect(relatorio).toMatchObject({
      criadas: 1, pendentes: 2, falhas: [],
      interrompido: "O Instagram limitou as requisições. Espere algumas horas e rode de novo.",
    });
  });

  it("grava o plano depois de cada item", async () => {
    const { deps, salvos } = montar();
    await executarPlano(plano([item("A1", "imagem"), item("B2", "imagem")]), deps);
    const criadasPorGravacao = salvos.map((s) => s.itens.filter((i) => i.status === "criada").length);
    expect(criadasPorGravacao.at(-1)).toBe(2);
    expect(criadasPorGravacao).toContain(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/executor.test.ts`
Expected: FAIL — não resolve `../executor`.

- [ ] **Step 3: Write minimal implementation**

Criar `scripts/src/instagram/executor.ts`:

```ts
import path from "node:path";
import { ErroInstagram } from "./perfil";
import { tituloDaPeca, type ItemPlano, type Plano } from "./plano";
import type { EmpresaApi, NovaPeca, Plataforma } from "./plataforma";
import type { FonteInstagram } from "./tipos";
import { CotaYouTubeEsgotada, type EnvioYouTube } from "./youtube";

export const DIAS_DE_CAMPANHA = 30;
const DIA_MS = 86_400_000;

export interface Dependencias {
  fonte: Pick<FonteInstagram, "baixar">;
  youtube: EnvioYouTube;
  plataforma: Plataforma;
  prepararImagem: (arquivo: string) => Promise<{ arquivo: string; recomprimida: boolean }>;
  /** Grava o plano em disco. Chamado depois de cada passo que não pode se repetir. */
  salvar: (plano: Plano) => Promise<void>;
  pastaMidia: string;
  agora: () => Date;
}

export interface Relatorio {
  empresaId: number;
  campanhaId: number;
  criadas: number;
  puladas: number;
  pendentes: number;
  falhas: Array<{ ref: string; erro: string }>;
  /** Imagens que precisaram perder qualidade para caber no upload. */
  recomprimidas: string[];
  cotaEsgotada: boolean;
  /** Mensagem do Instagram quando a importação parou no meio. */
  interrompido: string | null;
}

async function garantirEmpresa(plano: Plano, deps: Dependencias): Promise<{ id: number; advertiserId: number }> {
  const { plataforma } = deps;
  let empresa: EmpresaApi;
  if ("criar" in plano.empresa) {
    empresa = await plataforma.criarEmpresa({ ...plano.empresa.criar, handle: plano.handle });
    // Gravado na hora: se cair depois daqui, a nova execução usa esta empresa
    // em vez de criar a segunda.
    plano.empresa = { id: empresa.id };
    await deps.salvar(plano);
  } else {
    empresa = await plataforma.obterEmpresa(plano.empresa.id);
    const falta: { isAdvertiser?: true; instagram?: string } = {};
    if (empresa.advertiserId === null) falta.isAdvertiser = true;
    if (plano.empresa.gravarInstagram && empresa.instagram !== plano.handle) falta.instagram = plano.handle;
    if (Object.keys(falta).length > 0) empresa = await plataforma.atualizarEmpresa(empresa.id, falta);
  }
  if (empresa.advertiserId === null) throw new Error("Empresa ficou sem perfil de anunciante.");
  return { id: empresa.id, advertiserId: empresa.advertiserId };
}

async function garantirCampanha(plano: Plano, advertiserId: number, deps: Dependencias): Promise<number> {
  if ("id" in plano.campanha) return plano.campanha.id;
  const inicio = deps.agora();
  const campanha = await deps.plataforma.criarCampanha({
    advertiserId,
    nome: plano.campanha.criar.nome,
    inicio,
    fim: new Date(inicio.getTime() + DIAS_DE_CAMPANHA * DIA_MS),
  });
  plano.campanha = { id: campanha.id };
  await deps.salvar(plano);
  return campanha.id;
}

/** Sinal interno: a cota acabou e este vídeo fica para outro dia. */
const ADIADO = Symbol("adiado");

async function criarPeca(
  plano: Plano,
  item: ItemPlano,
  deps: Dependencias,
  estado: { cotaEsgotada: boolean; recomprimidas: string[] },
): Promise<{ id: number; jaExistia: boolean } | typeof ADIADO> {
  const peca: NovaPeca = {
    titulo: tituloDaPeca(plano.handle, item.data, item.n),
    externalRef: item.ref,
    orientacao: item.orientacao,
  };
  const pasta = path.join(deps.pastaMidia, item.codigo);

  if (item.tipo === "imagem") {
    const original = await deps.fonte.baixar(item.postUrl, item.n, pasta);
    const pronta = await deps.prepararImagem(original);
    if (pronta.recomprimida) estado.recomprimidas.push(item.ref);
    return deps.plataforma.criarPecaImagem(peca, pronta.arquivo);
  }

  if (!item.videoId) {
    if (estado.cotaEsgotada) return ADIADO;
    const arquivo = await deps.fonte.baixar(item.postUrl, item.n, pasta);
    try {
      item.videoId = await deps.youtube.subir(arquivo, peca.titulo);
    } catch (err) {
      if (!(err instanceof CotaYouTubeEsgotada)) throw err;
      estado.cotaEsgotada = true;
      return ADIADO;
    }
    // Antes de criar a peça: se ela falhar, o vídeo não sobe de novo.
    await deps.salvar(plano);
  }
  return deps.plataforma.criarPecaYouTube(peca, item.videoId);
}

export async function executarPlano(plano: Plano, deps: Dependencias): Promise<Relatorio> {
  const empresa = await garantirEmpresa(plano, deps);
  const campanhaId = await garantirCampanha(plano, empresa.advertiserId, deps);
  const estado = { cotaEsgotada: false, recomprimidas: [] as string[] };
  let interrompido: string | null = null;

  for (const item of plano.itens) {
    if (item.status === "criada" || item.status === "pulada") continue;
    // Falha de execução anterior ganha nova tentativa.
    item.status = "pendente";
    delete item.erro;
    try {
      let jaExistia = false;
      if (item.pecaId === undefined) {
        const peca = await criarPeca(plano, item, deps, estado);
        if (peca === ADIADO) continue;
        item.pecaId = peca.id;
        jaExistia = peca.jaExistia;
        await deps.salvar(plano);
      }
      // Mesmo a peça que já existia é vinculada: a importação anterior pode
      // ter caído entre criar e vincular.
      await deps.plataforma.vincular(campanhaId, item.pecaId, item.postUrl);
      item.status = jaExistia ? "pulada" : "criada";
    } catch (err) {
      if (err instanceof ErroInstagram) {
        // Sessão expirada ou limite de requisições: insistir nos próximos
        // itens só pioraria. O item fica pendente para a próxima execução.
        interrompido = err.message;
        break;
      }
      item.status = "falha";
      item.erro = err instanceof Error ? err.message : String(err);
    }
    await deps.salvar(plano);
  }
  await deps.salvar(plano);

  return {
    empresaId: empresa.id,
    campanhaId,
    criadas: plano.itens.filter((i) => i.status === "criada").length,
    puladas: plano.itens.filter((i) => i.status === "pulada").length,
    pendentes: plano.itens.filter((i) => i.status === "pendente").length,
    falhas: plano.itens.filter((i) => i.status === "falha").map((i) => ({ ref: i.ref, erro: i.erro ?? "" })),
    recomprimidas: estado.recomprimidas,
    cotaEsgotada: estado.cotaEsgotada,
    interrompido,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/executor.test.ts`
Expected: PASS, 17 testes.

- [ ] **Step 5: Commit**

```bash
git add scripts/src/instagram/executor.ts scripts/src/instagram/__tests__/executor.test.ts
git commit -m "feat(instagram): executor que retoma a importação sem duplicar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Script — linha de comando (`importar.ts`)

**Files:**
- Create: `scripts/src/instagram/ambiente.ts`
- Create: `scripts/src/instagram/importar.ts`
- Modify: `.gitignore`
- Test: `scripts/src/instagram/__tests__/ambiente.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 e 7–12.
- Produces: comando `pnpm --filter @workspace/scripts run importar:instagram <subcomando>` com:
  - `listar <url|@> [--limite 12]` → JSON no stdout; grava `.instagram-import/<handle>/listagem.json`.
  - `planejar <url|@> --itens <lista> --empresa <id|nova> [--gravar-instagram] --campanha <id|nova>` → grava `.instagram-import/<handle>/plano.json`; JSON no stdout com o caminho e o plano.
  - `importar --plano <arquivo>` → executa; JSON do `Relatorio` no stdout.
  - `youtube-login` → imprime a URL de consentimento e, no fim, o refresh token.
  - `ambiente.ts`: `lerEnv(texto: string): Record<string, string>` e `exigir(env: Record<string, string | undefined>, nomes: string[]): Record<string, string>`.

Erro em qualquer subcomando: mensagem no stderr como `{"erro":"…"}` e código de saída 1, para a skill ler sem adivinhar.

- [ ] **Step 1: Write the failing test**

Criar `scripts/src/instagram/__tests__/ambiente.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exigir, lerEnv } from "../ambiente";

describe("lerEnv", () => {
  it("lê CHAVE=valor, ignora comentário e linha vazia, tira aspas", () => {
    const texto = [
      "# credenciais do importador",
      "",
      "PLATAFORMA_URL=https://tv.example",
      'ADMIN_PASSWORD="s3nha com espaço"',
      "YOUTUBE_CLIENT_SECRET='abc=def'",
      "  YOUTUBE_CLIENT_ID = cid  ",
      "linha sem igual",
    ].join("\n");
    expect(lerEnv(texto)).toEqual({
      PLATAFORMA_URL: "https://tv.example",
      ADMIN_PASSWORD: "s3nha com espaço",
      YOUTUBE_CLIENT_SECRET: "abc=def",
      YOUTUBE_CLIENT_ID: "cid",
    });
  });
});

describe("exigir", () => {
  it("devolve só as variáveis pedidas", () => {
    expect(exigir({ A: "1", B: "2", C: "3" }, ["A", "B"])).toEqual({ A: "1", B: "2" });
  });

  it("lista todas as que faltam de uma vez, com o nome do arquivo", () => {
    expect(() => exigir({ A: "1", B: "" }, ["A", "B", "C"])).toThrow(
      "Faltam variáveis em .env.importador: B, C",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/ambiente.test.ts`
Expected: FAIL — não resolve `../ambiente`.

- [ ] **Step 3: Write minimal implementation**

Criar `scripts/src/instagram/ambiente.ts`:

```ts
/**
 * Credenciais do importador ficam em `.env.importador`, na raiz. Não é o
 * `.env.local`: o `vercel env pull` reescreve aquele arquivo e levaria as
 * credenciais embora.
 */
export const ARQUIVO_ENV = ".env.importador";

export function lerEnv(texto: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const linha of texto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const igual = limpa.indexOf("=");
    if (igual < 1) continue;
    const chave = limpa.slice(0, igual).trim();
    let valor = limpa.slice(igual + 1).trim();
    const aspas = valor[0];
    if ((aspas === '"' || aspas === "'") && valor.endsWith(aspas) && valor.length >= 2) {
      valor = valor.slice(1, -1);
    }
    env[chave] = valor;
  }
  return env;
}

export function exigir(env: Record<string, string | undefined>, nomes: string[]): Record<string, string> {
  const faltam = nomes.filter((nome) => !env[nome]);
  if (faltam.length > 0) throw new Error(`Faltam variáveis em ${ARQUIVO_ENV}: ${faltam.join(", ")}`);
  return Object.fromEntries(nomes.map((nome) => [nome, env[nome] as string]));
}
```

Criar `scripts/src/instagram/importar.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { instagramExternalRef, normalizeInstagramHandle } from "@workspace/db/instagram";
import { ARQUIVO_ENV, exigir, lerEnv } from "./ambiente";
import { executarPlano } from "./executor";
import { prepararImagem } from "./imagem";
import { criarFonteInstagram } from "./perfil";
import {
  candidatasPorNome,
  gravarPlano,
  lerPlano,
  montarPlano,
  orientacaoDe,
  type AlvoCampanha,
  type AlvoEmpresa,
} from "./plano";
import { criarPlataforma } from "./plataforma";
import type { Perfil } from "./tipos";
import { criarEnvioYouTube, loginYouTube } from "./youtube";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TRABALHO = path.join(RAIZ, ".instagram-import");
const LIMITE_PADRAO = 12;

async function ambiente(): Promise<Record<string, string | undefined>> {
  const arquivo = path.join(RAIZ, ARQUIVO_ENV);
  const doArquivo = await readFile(arquivo, "utf8").then(lerEnv, () => ({}));
  // Variável já exportada no shell vence o arquivo.
  return { ...doArquivo, ...process.env };
}

async function plataformaDoAmbiente() {
  const env = exigir(await ambiente(), ["PLATAFORMA_URL", "ADMIN_USERNAME", "ADMIN_PASSWORD"]);
  return criarPlataforma({ url: env.PLATAFORMA_URL, usuario: env.ADMIN_USERNAME, senha: env.ADMIN_PASSWORD });
}

function handleDe(entrada: string | undefined): string {
  const handle = entrada ? normalizeInstagramHandle(entrada) : null;
  if (!handle) throw new Error("Passe a URL ou o @ de um perfil do Instagram (link de post não serve).");
  return handle;
}

const pastaDe = (handle: string) => path.join(TRABALHO, handle);
const mostrar = (dados: unknown) => console.log(JSON.stringify(dados, null, 2));

async function listar(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { limite: { type: "string" } } });
  const handle = handleDe(positionals[0]);
  const limite = Number(values.limite ?? LIMITE_PADRAO);
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) throw new Error("--limite deve ser um inteiro de 1 a 50.");

  // Plataforma primeiro: login recusado aparece antes de gastar requisição no Instagram.
  const plataforma = await plataformaDoAmbiente();
  const importadas = await plataforma.refsImportadas();
  const perfil = await criarFonteInstagram().lerPerfil(handle, limite);

  await mkdir(pastaDe(handle), { recursive: true });
  await writeFile(path.join(pastaDe(handle), "listagem.json"), `${JSON.stringify(perfil, null, 2)}\n`, "utf8");

  const empresa = await plataforma.buscarEmpresaPorInstagram(handle);
  const candidatas = empresa ? [] : candidatasPorNome(perfil, await plataforma.listarEmpresas());
  const campanhas = empresa?.advertiserId ? await plataforma.listarCampanhas(empresa.advertiserId) : [];

  mostrar({
    perfil: { handle, nome: perfil.nome, bio: perfil.bio, site: perfil.site },
    posts: perfil.posts.map((post) => ({
      codigo: post.codigo,
      data: post.data,
      legenda: post.legenda.replace(/\s+/g, " ").slice(0, 80),
      url: post.url,
      midias: post.midias.map((m) => ({
        n: m.n,
        tipo: m.tipo,
        tamanho: `${m.largura}x${m.altura}`,
        orientacao: orientacaoDe(m.largura, m.altura),
        importada: importadas.has(instagramExternalRef(post.codigo, m.n)),
      })),
    })),
    empresa: empresa ? { id: empresa.id, nome: empresa.name, anunciante: empresa.advertiserId !== null } : null,
    candidatas: candidatas.map((c) => ({ id: c.id, nome: c.name })),
    campanhas: campanhas.map((c) => ({ id: c.id, nome: c.name, ativa: c.isActive })),
  });
}

function alvo(valor: string | undefined, nome: string): { id: number } | "nova" {
  if (valor === "nova") return "nova";
  const id = Number(valor);
  if (!Number.isInteger(id) || id < 1) throw new Error(`--${nome} deve ser o id ou "nova".`);
  return { id };
}

async function planejar(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      itens: { type: "string" },
      empresa: { type: "string" },
      campanha: { type: "string" },
      "gravar-instagram": { type: "boolean", default: false },
    },
  });
  const handle = handleDe(positionals[0]);
  if (!values.itens) throw new Error("Passe --itens com os códigos dos posts escolhidos.");

  const arquivoListagem = path.join(pastaDe(handle), "listagem.json");
  const perfil = await readFile(arquivoListagem, "utf8").then(
    (t) => JSON.parse(t) as Perfil,
    () => {
      throw new Error(`Rode "listar" antes: não achei ${arquivoListagem}.`);
    },
  );

  const empresaAlvo = alvo(values.empresa, "empresa");
  const campanhaAlvo = alvo(values.campanha, "campanha");
  if (empresaAlvo === "nova" && campanhaAlvo !== "nova") {
    throw new Error("Empresa nova não tem campanha existente: use --campanha nova.");
  }
  const empresa: AlvoEmpresa =
    empresaAlvo === "nova"
      ? { criar: { nome: perfil.nome, bio: perfil.bio } }
      : { id: empresaAlvo.id, ...(values["gravar-instagram"] ? { gravarInstagram: true } : {}) };
  const campanha: AlvoCampanha = campanhaAlvo === "nova" ? { criar: { nome: `Instagram @${handle}` } } : campanhaAlvo;

  const arquivoPlano = path.join(pastaDe(handle), "plano.json");
  const plano = montarPlano({
    handle,
    empresa,
    campanha,
    posts: perfil.posts,
    selecao: values.itens,
    jaImportadas: await (await plataformaDoAmbiente()).refsImportadas(),
    anterior: await lerPlano(arquivoPlano),
  });
  await gravarPlano(arquivoPlano, plano);
  mostrar({ arquivo: arquivoPlano, plano });
}

async function importar(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { plano: { type: "string" } } });
  if (!values.plano) throw new Error("Passe --plano com o caminho do plano.json.");
  const arquivo = path.resolve(values.plano);
  const plano = await lerPlano(arquivo);
  if (!plano) throw new Error(`Plano não encontrado: ${arquivo}`);

  const temVideoParaSubir = plano.itens.some(
    (i) => i.tipo === "video" && i.status !== "criada" && i.status !== "pulada" && !i.videoId && i.pecaId === undefined,
  );
  const env = await ambiente();
  // Credencial do YouTube só é exigida quando há reel para subir.
  const youtube = temVideoParaSubir
    ? exigir(env, ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"])
    : { YOUTUBE_CLIENT_ID: "", YOUTUBE_CLIENT_SECRET: "", YOUTUBE_REFRESH_TOKEN: "" };

  const relatorio = await executarPlano(plano, {
    fonte: criarFonteInstagram(),
    youtube: criarEnvioYouTube({
      clientId: youtube.YOUTUBE_CLIENT_ID,
      clientSecret: youtube.YOUTUBE_CLIENT_SECRET,
      refreshToken: youtube.YOUTUBE_REFRESH_TOKEN,
    }),
    plataforma: await plataformaDoAmbiente(),
    prepararImagem,
    salvar: (p) => gravarPlano(arquivo, p),
    pastaMidia: path.join(path.dirname(arquivo), "midia"),
    agora: () => new Date(),
  });
  mostrar(relatorio);
}

async function youtubeLogin(): Promise<void> {
  const env = exigir(await ambiente(), ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]);
  const refreshToken = await loginYouTube({
    clientId: env.YOUTUBE_CLIENT_ID,
    clientSecret: env.YOUTUBE_CLIENT_SECRET,
    avisar: (url) => console.error(`Abra no navegador, com a conta do canal:\n${url}`),
  });
  console.log(`YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
}

const COMANDOS: Record<string, (args: string[]) => Promise<void>> = {
  listar,
  planejar,
  importar,
  "youtube-login": youtubeLogin,
};

const [comando, ...resto] = process.argv.slice(2);
const executar = comando ? COMANDOS[comando] : undefined;
if (!executar) {
  console.error(JSON.stringify({ erro: `Use um de: ${Object.keys(COMANDOS).join(", ")}` }));
  process.exit(1);
}
executar(resto).catch((err) => {
  // Uma linha de JSON no stderr: a skill lê a mensagem sem adivinhar formato.
  console.error(JSON.stringify({ erro: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
```

Em `.gitignore`, acrescentar no fim:

```gitignore

# Importador do Instagram: mídia baixada e plano da importação.
.instagram-import/
```

- [ ] **Step 4: Run tests and smoke-check the CLI**

Run: `pnpm --filter @workspace/scripts exec vitest run`
Expected: PASS em todos os arquivos de `scripts/src/instagram/__tests__/`.

Run: `pnpm --filter @workspace/scripts run typecheck`
Expected: sem erros.

Run: `pnpm --filter @workspace/scripts run importar:instagram; echo "saida=$?"`
Expected: stderr `{"erro":"Use um de: listar, planejar, importar, youtube-login"}` e `saida=1`.

Run: `pnpm --filter @workspace/scripts run importar:instagram listar https://www.instagram.com/p/DAbc123/; echo "saida=$?"`
Expected: stderr `{"erro":"Passe a URL ou o @ de um perfil do Instagram (link de post não serve)."}` e `saida=1`. Nenhuma requisição sai da máquina.

Run: `git status --short .instagram-import`
Expected: vazio (pasta ignorada).

- [ ] **Step 5: Commit**

```bash
git add scripts/src/instagram/ambiente.ts scripts/src/instagram/importar.ts scripts/src/instagram/__tests__/ambiente.test.ts .gitignore
git commit -m "feat(instagram): comandos listar, planejar, importar e youtube-login

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Skill `/importar-instagram`

**Files:**
- Create: `.claude/skills/importar-instagram/SKILL.md`

**Interfaces:**
- Consumes: os quatro subcomandos da Task 13 e o formato JSON que eles imprimem.
- Produces: skill invocável como `/importar-instagram <url> [--limite N]`.

- [ ] **Step 1: Escrever a skill**

Criar `.claude/skills/importar-instagram/SKILL.md`:

````markdown
---
name: importar-instagram
description: Importa um perfil do Instagram para a plataforma Smart TV Ads — cadastra a empresa, cria a campanha pausada e sobe fotos e reels como peças. Use quando o usuário passar a URL ou o @ de um perfil do Instagram de uma empresa e pedir para importar, cadastrar ou subir os posts.
---

# Importar perfil do Instagram

Recebe a URL (ou o @) de um perfil e entrega: empresa cadastrada, campanha
**pausada** e uma peça por mídia escolhida. Foto vira peça de imagem; reel
sobe no YouTube como não listado e vira peça `youtube_video` muda.

Toda escrita na plataforma passa pelo script, a partir de um plano que o
usuário confirmou. Nunca chame a API nem o banco direto.

Comando base (a partir da raiz do repo):

```bash
pnpm --filter @workspace/scripts run importar:instagram <subcomando> …
```

Sucesso sai como JSON no stdout. Erro sai como `{"erro":"…"}` no stderr com
código 1: mostre a mensagem ao usuário como veio e pare.

## Antes de começar

Confirme uma vez por sessão, sem rodar nada no Instagram:

1. `command -v gallery-dl yt-dlp ffmpeg` — faltando algum: `brew install gallery-dl yt-dlp ffmpeg`.
2. `.env.importador` na raiz com `PLATAFORMA_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. Para reel, também `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. Não leia nem imprima os valores; só diga quais nomes faltam (o próprio script lista).
3. Sem `YOUTUBE_REFRESH_TOKEN`: peça para o usuário rodar `! pnpm --filter @workspace/scripts run importar:instagram youtube-login`, abrir a URL com a conta do canal e colar a linha `YOUTUBE_REFRESH_TOKEN=…` no `.env.importador`.

Lembre o usuário, na primeira vez: o Chrome precisa estar logado no Instagram
com uma conta separada (não a pessoal, não a da plataforma), e só se importa
perfil de empresa que autorizou o uso do conteúdo.

## Passos

### 1. Listar

```bash
pnpm --filter @workspace/scripts run importar:instagram listar "<url>" --limite 12
```

Use o `--limite` que o usuário pediu; sem pedido, 12.

### 2. Mostrar e perguntar quais posts entram

Tabela com uma linha por mídia: código, data, tipo (foto / vídeo), orientação
(deitada / em pé), início da legenda, e "já importada" quando `importada` for
verdadeiro. Avise em uma linha:

- peça em pé só toca em TV em pé;
- cada vídeo gasta um envio da cota do YouTube (cerca de 6 por dia).

Pergunte quais entram. Aceite "todos", códigos, ou "todos menos …". Mídia já
importada pode entrar na seleção: ela é pulada, mas volta a ser vinculada à
campanha.

Monte `--itens` com códigos separados por vírgula: `DAbc123` (post inteiro)
ou `DAbc123:2` (só a mídia 2).

### 3. Empresa

- `empresa` preenchida na listagem → `--empresa <id>`.
- `empresa` nula e `candidatas` não vazia → pergunte se o perfil é de alguma
  delas. Se for: `--empresa <id> --gravar-instagram`. Se não: `--empresa nova`.
- `empresa` nula e sem candidatas → `--empresa nova` (nasce só como
  anunciante, com a bio nas observações).

### 4. Campanha

- Empresa nova, ou `campanhas` vazia → `--campanha nova` (nome
  `Instagram @<handle>`, pausada, hoje + 30 dias, contrato 0, todas as TVs).
- Havendo campanhas → pergunte qual usar ou se cria nova.

### 5. Planejar e confirmar

```bash
pnpm --filter @workspace/scripts run importar:instagram planejar "<url>" \
  --itens "<lista>" --empresa <id|nova> [--gravar-instagram] --campanha <id|nova>
```

Mostre o resumo (empresa, campanha, quantas fotos, quantos vídeos, quantas já
importadas) e peça confirmação antes de seguir.

### 6. Importar

```bash
pnpm --filter @workspace/scripts run importar:instagram importar --plano "<arquivo devolvido pelo planejar>"
```

Pode levar minutos com vídeo. Não rode duas importações ao mesmo tempo.

### 7. Relatar

Do JSON devolvido, diga: criadas, puladas, pendentes e falhas (uma linha por
falha, com a mensagem). Depois:

- `cotaEsgotada: true` → os vídeos pendentes sobem rodando o mesmo comando
  `importar --plano …` amanhã. Nada precisa ser refeito.
- `interrompido` preenchido → mostre a mensagem; rodar o mesmo comando depois
  continua de onde parou.
- `recomprimidas` não vazia → essas imagens perderam qualidade para caber no
  limite de upload.
- Falha dizendo que o vídeo ficou privado → o projeto do Google Cloud ainda
  não passou pela auditoria da API. Saída manual: o usuário muda o vídeo para
  não listado no YouTube Studio, você grava o id em `"videoId"` do item no
  plano e roda `importar` de novo.

Feche lembrando: a campanha `<campanhaId>` está **pausada**. O usuário revisa
as peças e o alvo no painel e liga a campanha lá.

## O que não fazer

- Não editar `plano.json` à mão, salvo para gravar `videoId` no caso acima.
- Não apagar `.instagram-import/<handle>/`: é o que permite retomar.
- Não repetir `listar` em sequência: cada chamada vai ao Instagram, e excesso
  de requisições bloqueia a conta.
- Não ligar a campanha.
````

- [ ] **Step 2: Conferir que a skill é reconhecida**

Run: `head -5 .claude/skills/importar-instagram/SKILL.md`
Expected: frontmatter com `name: importar-instagram` e `description:` numa linha só.

Run: `git check-ignore -v .claude/skills/importar-instagram/SKILL.md; echo "saida=$?"`
Expected: `saida=1` (o arquivo não é ignorado).

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/importar-instagram/SKILL.md
git commit -m "feat(instagram): skill que conduz a importação do perfil

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Verificação final

**Files:** nenhum arquivo novo. Corrigir só o que a verificação apontar.

**Interfaces:**
- Consumes: tudo.
- Produces: branch pronta para PR.

- [ ] **Step 1: Suíte inteira**

Run: `pnpm run typecheck`
Expected: sem erros.

Run: `pnpm --filter @workspace/api-server test && pnpm --filter @workspace/signage test && pnpm --filter @workspace/scripts test`
Expected: PASS nos três pacotes, sem teste antigo quebrado.

- [ ] **Step 2: Migration num banco local**

Run: `./dev.sh --db`
Expected: sobe o Postgres e aplica o schema sem erro.

Run: `docker exec signage-db psql -U postgres -c '\d companies' -c '\d announcements' | grep -E "instagram|external_ref"`
Expected: quatro linhas — as duas colunas e as duas constraints `UNIQUE`. (Se o usuário do banco no `.env` não for `postgres`, usar o do `DATABASE_URL`.)

- [ ] **Step 3: Conferir o formato real do `gallery-dl`**

Depende dos pré-requisitos do admin (`brew install gallery-dl yt-dlp`, conta separada logada no Chrome). Com um perfil autorizado:

Run: `gallery-dl --cookies-from-browser chrome -j -o max-posts=2 "https://www.instagram.com/<handle>/posts/" | head -60`
Expected: array JSON cujas mensagens `[3, url, {…}]` trazem `post_shortcode`, `post_url`, `post_date`, `description`, `num`, `width`, `height`, `video_url`.

Run: `gallery-dl --cookies-from-browser chrome -j "https://www.instagram.com/<handle>/info" | head -40`
Expected: `[[2, {…}]]` com `full_name`, `biography`, `external_url`, `is_private`.

Se alguma chave vier com outro nome na versão instalada, corrigir em `traduzirPosts`/`traduzirInfo` (`scripts/src/instagram/perfil.ts`), ajustar a fixture do teste correspondente para o formato real e rodar `pnpm --filter @workspace/scripts exec vitest run src/instagram/__tests__/perfil.test.ts`.

- [ ] **Step 4: Importação de ponta a ponta contra o ambiente local**

Com `./dev.sh` rodando e `.env.importador` apontando `PLATAFORMA_URL` para a API local:

1. `/importar-instagram <url de um perfil autorizado> --limite 4`, escolhendo 1 foto e 1 reel.
2. No painel: a empresa existe com o @ no cadastro; a campanha `Instagram @<handle>` está **pausada**; as duas peças estão nela, a de vídeo como YouTube, muda; o QR de cada peça aponta para o post.
3. Rodar a skill de novo com os mesmos dois posts: relatório com `criadas: 0`, `puladas: 2`; nenhuma empresa, campanha ou peça nova no painel; nenhum vídeo novo no canal do YouTube.
4. Abrir a peça de vídeo na prévia do painel: o vídeo toca. Se o relatório disser que o vídeo ficou privado, registrar no PR que o projeto do Google Cloud precisa da auditoria da API antes de o envio automático de reels funcionar.

- [ ] **Step 5: Commit do que a verificação corrigiu**

Só se houve correção:

```bash
git add -A scripts/src/instagram
git commit -m "fix(instagram): ajusta leitura ao formato real do gallery-dl

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Título do PR, quando for aberto: `feat(api): importador de perfil do Instagram` (funcionalidade nova → sobe minor).
