# Segmentos: cadastro, mesclar, segmento obrigatório e prévia de alcance — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a regra do concorrente valer para toda empresa e deixar o efeito dela visível no admin: tela de segmentos (criar, renomear, mesclar, apagar), segmento obrigatório no cadastro de empresa e prévia de alcance no formulário de campanha.

**Architecture:** A regra continua num lugar só (`lib/ad-eligibility.ts`); `previewReach` vira a conta base de alcance, usada pela TV/portal (via `countReachedDevices`) e pela rota nova `POST /campaigns/reach-preview`. O acesso a banco de segmentos sai da rota para `lib/segments/store.ts` (mesmo padrão de `lib/companies/store.ts`), com trava `FOR UPDATE` no apagar e no mesclar. O front ganha a página `/segments`, selos de "Sem segmento" e um hook `useReachPreview` com debounce que alimenta o seletor de alvo da campanha.

**Tech Stack:** Express 5 + drizzle-orm 0.45 + zod 3 (API), OpenAPI + orval (contrato de `/segments`), React + wouter + TanStack Query + Testing Library (web), Vitest nos dois.

**Spec:** `docs/superpowers/specs/2026-10-05-segmentos-crud-design.md`

## Global Constraints

- Branch `feat/segmentos`; nada direto na `main`. Commits no formato `tipo(escopo): descrição em português`, sem ponto final, com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` no fim.
- Código e comentários em português, explicando o porquê. Acentos como caracteres UTF-8 reais, nunca `\uXXXX`.
- Mensagens exatas: "Escolha o segmento da empresa.", "Complete o segmento antes de salvar.", "Segmento não encontrado.", "Já existe o segmento X — use mesclar", "Nenhuma TV vai exibir esta campanha.", "concorrente · não toca aqui", "mesmo ramo do anunciante · só toca nas TVs dele", "Anunciante sem segmento: a regra do concorrente não vale".
- Sem migration: `companies.segment_id` continua aceitando nulo.
- Rotas de segmento e de prévia ficam atrás do `requireAdmin` (montadas depois da linha 49 de `routes/index.ts`).
- Alcance zero avisa, nunca bloqueia salvar. Falha da prévia não bloqueia o formulário.
- Rodar testes da API: `pnpm --filter @workspace/api-server exec vitest run <arquivo>`. Do web: `pnpm --filter @workspace/signage exec vitest run <arquivo>`. Typecheck geral: `pnpm run typecheck`.

## Review Focus

1. **Renomear só mudando caixa ou acento** ("padaria" → "Padaria"): o slug é o do próprio segmento; não pode dar 409 contra ele mesmo. Teste na Task 4.
2. **Mesclar com campanha que já mirava os dois segmentos:** não pode estourar o único (campanha, segmento) nem duplicar linha. Teste do SQL `on conflict do nothing` na Task 3.
3. **Apagar segmento enquanto alguém grava empresa nele:** tem que dar 409, nunca apagar e zerar o segmento da empresa nova. Trava `FOR UPDATE` antes da contagem, testada pela ordem das operações na Task 3.
4. **Resposta velha da prévia chegando depois da nova** (admin troca o alvo rápido): a tela tem que mostrar a conta do alvo atual. Teste na Task 8.
5. **Anunciante sem segmento (cadastro antigo):** a prévia conta todo o alvo como alcançado, não marca concorrente e mostra o alerta com link para a empresa. Testes nas Tasks 1 e 8.

---

### Task 1: `previewReach` na regra de elegibilidade

**Files:**
- Modify: `artifacts/api-server/src/lib/ad-eligibility.ts` (fim do arquivo, `countReachedDevices`)
- Test: `artifacts/api-server/src/lib/__tests__/ad-eligibility.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NetworkDevice = { id: number; companyId: number; segmentId: number | null };
  export type AdvertiserIdentity = { advertiserSegmentId: number | null; advertiserCompanyId: number | null };
  export type ReachPreview = { reachedCount: number; totalDevices: number; competitorDeviceIds: number[] };
  export function previewReach(campaign: CampaignTarget & AdvertiserIdentity, devices: NetworkDevice[]): ReachPreview;
  ```
  `countReachedDevices` mantém a assinatura e passa a devolver `previewReach(...).reachedCount`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar `previewReach` ao import do topo do arquivo de teste e este bloco no fim:

```ts
describe("previewReach", () => {
  const rede = [
    { id: 1, companyId: 20, segmentId: PADARIA }, // TV da própria padaria anunciante
    { id: 2, companyId: 30, segmentId: PADARIA }, // padaria concorrente
    { id: 3, companyId: 40, segmentId: FARMACIA },
    { id: 4, companyId: 50, segmentId: null }, // dono sem segmento
  ];
  const padaria = { advertiserSegmentId: PADARIA, advertiserCompanyId: 20 };

  it("em todas as TVs, conta tudo menos a concorrente e lista a concorrente", () => {
    expect(previewReach({ targetMode: "all", deviceIds: [], segmentIds: [], ...padaria }, rede)).toEqual({
      reachedCount: 3,
      totalDevices: 4,
      competitorDeviceIds: [2],
    });
  });

  it("lista a concorrente mesmo quando ela não está no alvo", () => {
    const preview = previewReach({ targetMode: "devices", deviceIds: [3], segmentIds: [], ...padaria }, rede);
    expect(preview.reachedCount).toBe(1);
    expect(preview.competitorDeviceIds).toEqual([2]);
  });

  it("mirando o próprio ramo, só alcança a TV da própria empresa", () => {
    const preview = previewReach({ targetMode: "segments", deviceIds: [], segmentIds: [PADARIA], ...padaria }, rede);
    expect(preview.reachedCount).toBe(1);
  });

  it("por segmento, deixa de fora a TV de dono sem segmento", () => {
    const farmacia = { advertiserSegmentId: FARMACIA, advertiserCompanyId: 40 };
    const preview = previewReach({ targetMode: "segments", deviceIds: [], segmentIds: [PADARIA, FARMACIA], ...farmacia }, rede);
    expect(preview.reachedCount).toBe(3);
  });

  it("anunciante sem segmento alcança todo o alvo e não tem concorrente", () => {
    const semSegmento = { advertiserSegmentId: null, advertiserCompanyId: 60 };
    expect(previewReach({ targetMode: "all", deviceIds: [], segmentIds: [], ...semSegmento }, rede)).toEqual({
      reachedCount: 4,
      totalDevices: 4,
      competitorDeviceIds: [],
    });
  });

  it("rede vazia dá zero de zero", () => {
    expect(previewReach({ targetMode: "all", deviceIds: [], segmentIds: [], ...padaria }, [])).toEqual({
      reachedCount: 0,
      totalDevices: 0,
      competitorDeviceIds: [],
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/ad-eligibility.test.ts`
Expected: FAIL — `previewReach is not a function` (ou erro de import).

- [ ] **Step 3: Implementar**

Em `ad-eligibility.ts`, substituir a função `countReachedDevices` inteira por:

```ts
export type NetworkDevice = { id: number; companyId: number; segmentId: number | null };
export type AdvertiserIdentity = { advertiserSegmentId: number | null; advertiserCompanyId: number | null };

/**
 * O que a campanha alcança na rede: quantas TVs no alvo podem exibir a peça e
 * em quais TVs o anunciante nunca entra por concorrência — estas olhando a
 * rede inteira, não só o alvo, para o formulário marcar a TV concorrente
 * antes de o admin escolhê-la.
 */
export type ReachPreview = { reachedCount: number; totalDevices: number; competitorDeviceIds: number[] };

export function previewReach(campaign: CampaignTarget & AdvertiserIdentity, devices: NetworkDevice[]): ReachPreview {
  let reachedCount = 0;
  const competitorDeviceIds: number[] = [];
  for (const device of devices) {
    const allowed = canPlayOnDevice({
      advertiserSegmentId: campaign.advertiserSegmentId,
      advertiserCompanyId: campaign.advertiserCompanyId,
      deviceCompanyId: device.companyId,
      deviceSegmentId: device.segmentId,
    });
    if (!allowed) competitorDeviceIds.push(device.id);
    else if (campaignReachesDevice(campaign, device)) reachedCount += 1;
  }
  return { reachedCount, totalDevices: devices.length, competitorDeviceIds };
}

/** Quantas TVs a campanha realmente alcança, já descontada a concorrência. */
export function countReachedDevices(campaign: CampaignTarget & AdvertiserIdentity, devices: NetworkDevice[]): number {
  return previewReach(campaign, devices).reachedCount;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/ad-eligibility.test.ts`
Expected: PASS (testes antigos de `countReachedDevices` continuam verdes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/ad-eligibility.ts artifacts/api-server/src/lib/__tests__/ad-eligibility.test.ts
git commit -m "feat(api): prévia de alcance com TVs concorrentes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Segmento obrigatório no cadastro de empresa (API)

**Files:**
- Modify: `artifacts/api-server/src/lib/pg-errors.ts`
- Modify: `artifacts/api-server/src/lib/companies/input.ts:19` (campo `segmentId`)
- Modify: `artifacts/api-server/src/lib/companies/store.ts:28,87-95` (erro novo e `rethrowConflict`)
- Modify: `artifacts/api-server/src/routes/companies.ts` (POST e PATCH)
- Test: `artifacts/api-server/src/routes/__tests__/companies.test.ts`

**Interfaces:**
- Produces: `export function isForeignKeyViolation(err: unknown): boolean` em `pg-errors.ts`; `export class CompanySegmentError extends Error {}` em `companies/store.ts`; `CompanyFields["segmentId"]` passa a ser `number`.

- [ ] **Step 1: Escrever os testes que falham**

Em `companies.test.ts`:

1. No `vi.mock("../../lib/companies/store", ...)`, acrescentar a classe nova ao lado de `CompanyConflictError` — sem isso o `instanceof` da rota quebra com `undefined`:
   ```ts
   CompanySegmentError: class CompanySegmentError extends Error {},
   ```
2. No teste "cria com os dois papéis", mandar `segmentId: 1` no `.send({...})` e acrescentar `segmentId: 1` ao `objectContaining`.
3. Acrescentar `segmentId: 1` ao `detail()` (fixture de empresa existente com segmento).
4. Acrescentar estes testes dentro do `describe`:

```ts
  it("criar sem segmento é 400", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/companies").send({ name: "X", isClient: true, isAdvertiser: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Escolha o segmento da empresa.");
    expect(store.createCompany).not.toHaveBeenCalled();
  });

  it("editar mandando segmento nulo é 400", async () => {
    store.getCompany.mockResolvedValue(detail());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/companies/5").send({ segmentId: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Escolha o segmento da empresa.");
    expect(store.updateCompany).not.toHaveBeenCalled();
  });

  it("cadastro antigo sem segmento não salva edição que não complete o segmento", async () => {
    store.getCompany.mockResolvedValue(detail({ segmentId: null }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/companies/5").send({ status: "paused" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Complete o segmento antes de salvar.");
    expect(store.updateCompany).not.toHaveBeenCalled();
  });

  it("cadastro antigo salva quando a edição traz o segmento", async () => {
    store.getCompany.mockResolvedValue(detail({ segmentId: null }));
    store.updateCompany.mockResolvedValue(detail());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/companies/5").send({ status: "paused", segmentId: 3 });
    expect(res.status).toBe(200);
    expect(store.updateCompany).toHaveBeenCalledWith(5, { status: "paused", segmentId: 3 }, expect.anything(), undefined);
  });

  it("segmento inexistente é 400 com mensagem clara", async () => {
    const { CompanySegmentError } = await import("../../lib/companies/store");
    store.createCompany.mockRejectedValue(new CompanySegmentError("Segmento não encontrado."));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/companies").send({ name: "X", isClient: true, isAdvertiser: false, segmentId: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Segmento não encontrado.");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/companies.test.ts`
Expected: FAIL nos cinco testes novos (201/200 em vez de 400, e 500 no segmento inexistente).

- [ ] **Step 3: Implementar**

`pg-errors.ts` — generalizar o leitor de código e acrescentar a FK:

```ts
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

function pgCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  return (err as { code?: string }).code;
}

/** Código do pg no erro cru ou na causa embrulhada pelo drizzle (ver abaixo). */
function hasPgCode(err: unknown, code: string): boolean {
  if (pgCode(err) === code) return true;
  if (typeof err !== "object" || err === null) return false;
  return pgCode((err as { cause?: unknown }).cause) === code;
}
```

Manter o comentário longo existente acima de `isUniqueViolation` e trocar os corpos por:

```ts
export function isUniqueViolation(err: unknown): boolean {
  return hasPgCode(err, PG_UNIQUE_VIOLATION);
}

/** Chave estrangeira apontando para linha que não existe (ex.: segmento apagado). */
export function isForeignKeyViolation(err: unknown): boolean {
  return hasPgCode(err, PG_FOREIGN_KEY_VIOLATION);
}
```

`companies/input.ts` — trocar a linha do `segmentId` em `fields` por:

```ts
  // Obrigatório: sem segmento a regra do concorrente não vale para a empresa
  // (ver `canPlayOnDevice`). `coerce` transforma null e "" em 0 e ausente em
  // NaN; os dois caem na mesma mensagem.
  segmentId: z.coerce
    .number({ invalid_type_error: SEGMENT_REQUIRED })
    .int(SEGMENT_REQUIRED)
    .positive(SEGMENT_REQUIRED),
```

e declarar, acima de `const fields`:

```ts
const SEGMENT_REQUIRED = "Escolha o segmento da empresa.";
```

`patchFields.segmentId` continua `fields.segmentId.optional()`: chave ausente passa, `null` explícito cai na mensagem.

`companies/store.ts` — logo abaixo de `CompanyConflictError`:

```ts
/** Segmento escolhido não existe mais (apagado ou mesclado no meio do caminho). */
export class CompanySegmentError extends Error {}
```

importar `isForeignKeyViolation` junto de `isUniqueViolation`, e em `rethrowConflict`, antes do `throw err` final:

```ts
  // A única FK que o cadastro da empresa pode violar é a do segmento: os
  // perfis apontam para a empresa recém-gravada na mesma transação.
  if (isForeignKeyViolation(err)) {
    throw new CompanySegmentError("Segmento não encontrado.");
  }
```

`routes/companies.ts` — importar `CompanySegmentError`. Nos dois `catch` (POST e PATCH), antes do `throw err`:

```ts
    if (err instanceof CompanySegmentError) {
      res.status(400).json({ error: err.message });
      return;
    }
```

No PATCH, logo depois do bloco que responde 404 (`if (!id || !current)`):

```ts
  // Cadastro antigo sem segmento: qualquer edição precisa completar o
  // segmento, senão a empresa segue fora da regra do concorrente.
  if (current.segmentId === null && parsed.data.segmentId === undefined) {
    res.status(400).json({ error: "Complete o segmento antes de salvar." });
    return;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/companies.test.ts && pnpm --filter @workspace/api-server run typecheck`
Expected: PASS e typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/pg-errors.ts artifacts/api-server/src/lib/companies artifacts/api-server/src/routes/companies.ts artifacts/api-server/src/routes/__tests__/companies.test.ts
git commit -m "feat(api): segmento obrigatório no cadastro de empresa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store de segmentos (uso, renomear, apagar, mesclar)

**Files:**
- Create: `artifacts/api-server/src/lib/segments/store.ts`
- Test: `artifacts/api-server/src/lib/segments/__tests__/store.test.ts`

**Interfaces:**
- Produces (todos exportados de `lib/segments/store.ts`):
  ```ts
  export type SegmentRow = { id: number; slug: string; name: string };
  export type SegmentUsage = { companyCount: number; campaignCount: number };
  export type SegmentWithUsage = SegmentRow & SegmentUsage;
  export class SegmentSlugConflictError extends Error {}
  export function listSegmentsWithUsage(): Promise<SegmentWithUsage[]>;
  export function getSegmentWithUsage(id: number): Promise<SegmentWithUsage | null>;
  export function findSegmentBySlug(slug: string): Promise<SegmentRow | null>;
  export function createSegment(name: string, slug: string): Promise<SegmentRow>;
  export function renameSegment(id: number, name: string, slug: string): Promise<SegmentRow>;
  export type DeleteSegmentResult = { status: "deleted" } | { status: "not_found" } | { status: "in_use"; usage: SegmentUsage };
  export function deleteSegmentIfUnused(id: number): Promise<DeleteSegmentResult>;
  export type MergeSegmentResult = { status: "merged"; target: SegmentWithUsage } | { status: "not_found" };
  export function mergeSegments(sourceId: number, targetId: number): Promise<MergeSegmentResult>;
  ```

- [ ] **Step 1: Escrever os testes que falham**

Criar `lib/segments/__tests__/store.test.ts`. As tabelas são as reais (para o SQL sair com os nomes certos); só o `db` é falso e grava cada operação na ordem.

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Tabelas reais para o SQL do mesclar sair com os nomes de verdade; o
// DATABASE_URL fictício só satisfaz o import de @workspace/db (nada conecta).
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

const state = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; table?: unknown; values?: unknown; sql?: string }>,
  selects: [] as unknown[][],
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("@workspace/db")>();
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  function chain(result: unknown) {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "for", "orderBy", "returning"]) c[m] = () => c;
    c.then = (res: (v: unknown) => void, rej?: (r: unknown) => void) => Promise.resolve(result).then(res, rej);
    return c;
  }
  const tx = {
    select: () => {
      state.calls.push({ op: "select" });
      return chain(state.selects.shift() ?? []);
    },
    update: (table: unknown) => ({
      set: (values: unknown) => {
        state.calls.push({ op: "update", table, values });
        return chain([]);
      },
    }),
    delete: (table: unknown) => {
      state.calls.push({ op: "delete", table });
      return chain([]);
    },
    execute: (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
      state.calls.push({ op: "execute", sql: dialect.sqlToQuery(query).sql });
      return Promise.resolve();
    },
  };
  return { ...real, db: { ...tx, transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

const { companiesTable, segmentsTable } = await import("@workspace/db");
const { deleteSegmentIfUnused, mergeSegments } = await import("../store");

const ops = () => state.calls.map((c) => c.op);

beforeEach(() => {
  state.calls = [];
  state.selects = [];
});

describe("deleteSegmentIfUnused", () => {
  it("trava a linha antes de contar e apaga quando ninguém usa", async () => {
    state.selects = [[{ id: 7 }], [{ companyCount: 0, campaignCount: 0 }]];
    expect(await deleteSegmentIfUnused(7)).toEqual({ status: "deleted" });
    expect(ops()).toEqual(["select", "select", "delete"]);
    expect(state.calls[2].table).toBe(segmentsTable);
  });

  it("em uso não apaga e devolve as contagens", async () => {
    state.selects = [[{ id: 7 }], [{ companyCount: 3, campaignCount: 2 }]];
    expect(await deleteSegmentIfUnused(7)).toEqual({ status: "in_use", usage: { companyCount: 3, campaignCount: 2 } });
    expect(ops()).not.toContain("delete");
  });

  it("segmento inexistente é not_found sem contar nem apagar", async () => {
    state.selects = [[]];
    expect(await deleteSegmentIfUnused(7)).toEqual({ status: "not_found" });
    expect(ops()).toEqual(["select"]);
  });
});

describe("mergeSegments", () => {
  const destino = { id: 2, slug: "padaria", name: "Padaria", companyCount: 5, campaignCount: 1 };

  it("move empresas e campanhas para o destino e apaga a origem, nessa ordem", async () => {
    state.selects = [[{ id: 1 }, { id: 2 }], [destino]];
    expect(await mergeSegments(1, 2)).toEqual({ status: "merged", target: destino });
    expect(ops()).toEqual(["select", "update", "execute", "delete", "select"]);
    expect(state.calls[1]).toMatchObject({ table: companiesTable, values: { segmentId: 2 } });
    expect(state.calls[3].table).toBe(segmentsTable);
  });

  it("copia o alvo das campanhas sem duplicar quem já mirava os dois", async () => {
    state.selects = [[{ id: 1 }, { id: 2 }], [destino]];
    await mergeSegments(1, 2);
    const insert = state.calls.find((c) => c.op === "execute")!.sql!;
    expect(insert).toContain('insert into "campaign_segments" (campaign_id, segment_id)');
    expect(insert).toContain("on conflict do nothing");
  });

  it("origem ou destino inexistente é not_found sem gravar nada", async () => {
    state.selects = [[{ id: 1 }]];
    expect(await mergeSegments(1, 2)).toEqual({ status: "not_found" });
    expect(ops()).toEqual(["select"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/segments/__tests__/store.test.ts`
Expected: FAIL — módulo `../store` não existe.

- [ ] **Step 3: Implementar**

Criar `lib/segments/store.ts`:

```ts
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db, segmentsTable, companiesTable, campaignSegmentsTable } from "@workspace/db";
import { isUniqueViolation } from "../pg-errors";

export type SegmentRow = { id: number; slug: string; name: string };
export type SegmentUsage = { companyCount: number; campaignCount: number };
export type SegmentWithUsage = SegmentRow & SegmentUsage;

/** Corrida gravando dois segmentos com o mesmo slug: o UNIQUE barra. */
export class SegmentSlugConflictError extends Error {}

const baseColumns = { id: segmentsTable.id, slug: segmentsTable.slug, name: segmentsTable.name };

// Quantas empresas e campanhas dependem do segmento: é o que decide se ele
// pode ser apagado e o que a tela mostra antes de mesclar.
const usageColumns = {
  companyCount: sql<number>`(select count(*)::int from ${companiesTable} where ${companiesTable.segmentId} = ${segmentsTable.id})`,
  campaignCount: sql<number>`(select count(*)::int from ${campaignSegmentsTable} where ${campaignSegmentsTable.segmentId} = ${segmentsTable.id})`,
};

export async function listSegmentsWithUsage(): Promise<SegmentWithUsage[]> {
  return db.select({ ...baseColumns, ...usageColumns }).from(segmentsTable).orderBy(asc(segmentsTable.name));
}

export async function getSegmentWithUsage(id: number): Promise<SegmentWithUsage | null> {
  const [row] = await db.select({ ...baseColumns, ...usageColumns }).from(segmentsTable).where(eq(segmentsTable.id, id));
  return row ?? null;
}

export async function findSegmentBySlug(slug: string): Promise<SegmentRow | null> {
  const [row] = await db.select(baseColumns).from(segmentsTable).where(eq(segmentsTable.slug, slug));
  return row ?? null;
}

function rethrowSlugConflict(err: unknown): never {
  if (isUniqueViolation(err)) throw new SegmentSlugConflictError("Segmento já cadastrado");
  throw err;
}

export async function createSegment(name: string, slug: string): Promise<SegmentRow> {
  const [row] = await db.insert(segmentsTable).values({ name, slug }).returning(baseColumns).catch(rethrowSlugConflict);
  return row;
}

export async function renameSegment(id: number, name: string, slug: string): Promise<SegmentRow> {
  const [row] = await db
    .update(segmentsTable)
    .set({ name, slug })
    .where(eq(segmentsTable.id, id))
    .returning(baseColumns)
    .catch(rethrowSlugConflict);
  return row;
}

export type DeleteSegmentResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "in_use"; usage: SegmentUsage };

/**
 * Apaga só segmento que ninguém usa. O FOR UPDATE vem antes da contagem:
 * quem está gravando empresa ou campanha apontando para o segmento segura um
 * KEY SHARE na linha (efeito da FK), então a trava espera essa gravação
 * terminar e a contagem seguinte já a enxerga. Sem isso a contagem podia dar
 * zero e o `on delete set null` tirar o segmento da empresa recém-gravada —
 * exatamente o furo na regra do concorrente que esta tela fecha.
 */
export async function deleteSegmentIfUnused(id: number): Promise<DeleteSegmentResult> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: segmentsTable.id }).from(segmentsTable).where(eq(segmentsTable.id, id)).for("update");
    if (!locked) return { status: "not_found" } as const;
    const [usage] = await tx.select(usageColumns).from(segmentsTable).where(eq(segmentsTable.id, id));
    if (usage.companyCount > 0 || usage.campaignCount > 0) return { status: "in_use", usage } as const;
    await tx.delete(segmentsTable).where(eq(segmentsTable.id, id));
    return { status: "deleted" } as const;
  });
}

export type MergeSegmentResult = { status: "merged"; target: SegmentWithUsage } | { status: "not_found" };

/**
 * Junta a origem no destino: empresas e alvos de campanha passam para o
 * destino e a origem some. Tudo numa transação, com as duas linhas travadas
 * (mesmo motivo do apagar). Quem mirava os dois segmentos não ganha linha
 * duplicada: `on conflict do nothing` respeita o único (campanha, segmento),
 * e o cascade ao apagar a origem limpa o que sobrou dela.
 */
export async function mergeSegments(sourceId: number, targetId: number): Promise<MergeSegmentResult> {
  const merged = await db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: segmentsTable.id })
      .from(segmentsTable)
      .where(inArray(segmentsTable.id, [sourceId, targetId]))
      .for("update");
    if (locked.length !== 2) return false;
    await tx.update(companiesTable).set({ segmentId: targetId }).where(eq(companiesTable.segmentId, sourceId));
    await tx.execute(sql`insert into ${campaignSegmentsTable} (campaign_id, segment_id)
      select campaign_id, ${targetId} from ${campaignSegmentsTable} where segment_id = ${sourceId}
      on conflict do nothing`);
    await tx.delete(segmentsTable).where(eq(segmentsTable.id, sourceId));
    return true;
  });
  if (!merged) return { status: "not_found" };
  return { status: "merged", target: (await getSegmentWithUsage(targetId))! };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/segments/__tests__/store.test.ts && pnpm --filter @workspace/api-server run typecheck`
Expected: PASS e typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/segments
git commit -m "feat(api): store de segmentos com apagar e mesclar travados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Contrato e rotas de segmentos

**Files:**
- Modify: `lib/api-spec/openapi.yaml:273-308` (paths de `/segments`) e `:1476-1489` (schemas)
- Regenerate: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`
- Modify: `artifacts/api-server/src/routes/segments.ts` (reescrita)
- Test: `artifacts/api-server/src/routes/__tests__/segments.test.ts` (novo)

**Interfaces:**
- Consumes: tudo de `lib/segments/store.ts` (Task 3); `toSegmentSlug` de `lib/segment-slug.ts`.
- Produces: rotas `GET/POST /segments`, `PATCH/DELETE /segments/:id`, `POST /segments/:id/merge`; schema OpenAPI `SegmentWithUsage`; no client React, `useListSegments()` devolve `SegmentWithUsage[]` e `getListSegmentsQueryKey()` continua a chave da lista.

- [ ] **Step 1: Atualizar o contrato e regenerar**

Em `openapi.yaml`, trocar o `items.$ref` da resposta 200 do `get /segments` para `"#/components/schemas/SegmentWithUsage"` e acrescentar, logo depois do bloco `/segments:` (antes do comentário do CEP):

```yaml
  /segments/{id}:
    patch:
      operationId: renameSegment
      tags: [segments]
      summary: Rename a segment
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SegmentInput"
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Segment"
        "400": { description: Bad request }
        "404": { description: Not found }
        "409": { description: Another segment already has this name }
    delete:
      operationId: deleteSegment
      tags: [segments]
      summary: Delete an unused segment
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        "204": { description: Deleted }
        "404": { description: Not found }
        "409": { description: Segment in use; merge it instead }

  /segments/{id}/merge:
    post:
      operationId: mergeSegment
      tags: [segments]
      summary: Merge a segment into another one
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SegmentMergeInput"
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SegmentWithUsage"
        "400": { description: Bad request }
        "404": { description: Not found }
```

E nos schemas, depois de `SegmentInput`:

```yaml
    SegmentWithUsage:
      type: object
      required: [id, slug, name, companyCount, campaignCount]
      properties:
        id: { type: integer }
        slug: { type: string }
        name: { type: string }
        companyCount: { type: integer }
        campaignCount: { type: integer }

    SegmentMergeInput:
      type: object
      required: [targetId]
      properties:
        targetId: { type: integer }
```

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro (o script já roda `typecheck:libs`).

Conferir os nomes gerados:
Run: `grep -nE 'export const (ListSegmentsResponse|RenameSegmentBody|RenameSegmentResponse|MergeSegmentBody|MergeSegmentResponse)' lib/api-zod/src/generated/api.ts`
Expected: as cinco linhas. Se o orval gerar outro nome, usar o gerado nos passos abaixo.

- [ ] **Step 2: Escrever os testes que falham**

Criar `routes/__tests__/segments.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  listSegmentsWithUsage: vi.fn(),
  getSegmentWithUsage: vi.fn(),
  findSegmentBySlug: vi.fn(),
  createSegment: vi.fn(),
  renameSegment: vi.fn(),
  deleteSegmentIfUnused: vi.fn(),
  mergeSegments: vi.fn(),
};
vi.mock("../../lib/segments/store", () => ({
  listSegmentsWithUsage: (...a: unknown[]) => store.listSegmentsWithUsage(...a),
  getSegmentWithUsage: (...a: unknown[]) => store.getSegmentWithUsage(...a),
  findSegmentBySlug: (...a: unknown[]) => store.findSegmentBySlug(...a),
  createSegment: (...a: unknown[]) => store.createSegment(...a),
  renameSegment: (...a: unknown[]) => store.renameSegment(...a),
  deleteSegmentIfUnused: (...a: unknown[]) => store.deleteSegmentIfUnused(...a),
  mergeSegments: (...a: unknown[]) => store.mergeSegments(...a),
  SegmentSlugConflictError: class SegmentSlugConflictError extends Error {},
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../segments");
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

async function http() {
  const { default: request } = await import("supertest");
  return request(await buildApp());
}

const padaria = { id: 1, slug: "padaria", name: "Padaria", companyCount: 4, campaignCount: 1 };

describe("rotas de segmentos", () => {
  beforeEach(() => Object.values(store).forEach((fn) => fn.mockReset()));

  it("lista com as contagens de uso", async () => {
    store.listSegmentsWithUsage.mockResolvedValue([padaria]);
    const res = await (await http()).get("/segments");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([padaria]);
  });

  it("criar com slug repetido é 409", async () => {
    store.findSegmentBySlug.mockResolvedValue(padaria);
    const res = await (await http()).post("/segments").send({ name: "Padaria " });
    expect(res.status).toBe(409);
    expect(store.createSegment).not.toHaveBeenCalled();
  });

  it("cria com nome aparado e slug calculado", async () => {
    store.findSegmentBySlug.mockResolvedValue(null);
    store.createSegment.mockResolvedValue({ id: 9, slug: "farmacia", name: "Farmácia" });
    const res = await (await http()).post("/segments").send({ name: " Farmácia " });
    expect(res.status).toBe(201);
    expect(store.createSegment).toHaveBeenCalledWith("Farmácia", "farmacia");
  });

  it("renomear só mudando caixa e acento não colide com ele mesmo", async () => {
    store.getSegmentWithUsage.mockResolvedValue(padaria);
    store.findSegmentBySlug.mockResolvedValue(padaria);
    store.renameSegment.mockResolvedValue({ ...padaria, name: "PADARIA" });
    const res = await (await http()).patch("/segments/1").send({ name: "PADARIA" });
    expect(res.status).toBe(200);
    expect(store.renameSegment).toHaveBeenCalledWith(1, "PADARIA", "padaria");
  });

  it("renomear para o nome de outro segmento é 409 sugerindo mesclar", async () => {
    store.getSegmentWithUsage.mockResolvedValue({ ...padaria, id: 2, slug: "panificadora", name: "Panificadora" });
    store.findSegmentBySlug.mockResolvedValue(padaria);
    const res = await (await http()).patch("/segments/2").send({ name: "padaria" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Já existe o segmento Padaria — use mesclar");
    expect(store.renameSegment).not.toHaveBeenCalled();
  });

  it("renomear segmento inexistente é 404", async () => {
    store.getSegmentWithUsage.mockResolvedValue(null);
    const res = await (await http()).patch("/segments/99").send({ name: "Mercado" });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Segmento não encontrado.");
  });

  it("renomear para nome sem letra nem número é 400", async () => {
    const res = await (await http()).patch("/segments/1").send({ name: "!!!" });
    expect(res.status).toBe(400);
  });

  it("apagar livre é 204", async () => {
    store.deleteSegmentIfUnused.mockResolvedValue({ status: "deleted" });
    const res = await (await http()).delete("/segments/1");
    expect(res.status).toBe(204);
  });

  it("apagar em uso é 409 com as contagens", async () => {
    store.deleteSegmentIfUnused.mockResolvedValue({ status: "in_use", usage: { companyCount: 3, campaignCount: 1 } });
    const res = await (await http()).delete("/segments/1");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Usado por 3 empresas e 1 campanha", companyCount: 3, campaignCount: 1 });
  });

  it("apagar inexistente é 404", async () => {
    store.deleteSegmentIfUnused.mockResolvedValue({ status: "not_found" });
    expect((await (await http()).delete("/segments/1")).status).toBe(404);
  });

  it("mesclar devolve o destino com as contagens novas", async () => {
    store.mergeSegments.mockResolvedValue({ status: "merged", target: { ...padaria, companyCount: 6 } });
    const res = await (await http()).post("/segments/2/merge").send({ targetId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.companyCount).toBe(6);
    expect(store.mergeSegments).toHaveBeenCalledWith(2, 1);
  });

  it("mesclar no próprio segmento é 400 sem gravar", async () => {
    const res = await (await http()).post("/segments/1/merge").send({ targetId: 1 });
    expect(res.status).toBe(400);
    expect(store.mergeSegments).not.toHaveBeenCalled();
  });

  it("mesclar com origem ou destino inexistente é 404", async () => {
    store.mergeSegments.mockResolvedValue({ status: "not_found" });
    expect((await (await http()).post("/segments/2/merge").send({ targetId: 1 })).status).toBe(404);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/segments.test.ts`
Expected: FAIL — rotas PATCH/DELETE/merge respondem 404 e o POST ainda usa `db` direto.

- [ ] **Step 4: Implementar**

Reescrever `routes/segments.ts`:

```ts
import { Router, type IRouter } from "express";
import {
  ListSegmentsResponse,
  CreateSegmentBody,
  CreateSegmentResponse,
  RenameSegmentBody,
  RenameSegmentResponse,
  MergeSegmentBody,
  MergeSegmentResponse,
} from "@workspace/api-zod";
import { toSegmentSlug } from "../lib/segment-slug";
import {
  SegmentSlugConflictError,
  createSegment,
  deleteSegmentIfUnused,
  findSegmentBySlug,
  getSegmentWithUsage,
  listSegmentsWithUsage,
  mergeSegments,
  renameSegment,
  type SegmentUsage,
} from "../lib/segments/store";

const router: IRouter = Router();

const NOT_FOUND = "Segmento não encontrado.";

function idParam(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function usageMessage(usage: SegmentUsage): string {
  return `Usado por ${plural(usage.companyCount, "empresa", "empresas")} e ${plural(usage.campaignCount, "campanha", "campanhas")}`;
}

/** Nome aparado e slug; slug vazio é nome sem letra nem número. */
function nameAndSlug(raw: string): { name: string; slug: string } | null {
  const name = raw.trim();
  const slug = toSegmentSlug(name);
  return slug ? { name, slug } : null;
}

router.get("/segments", async (_req, res): Promise<void> => {
  res.json(ListSegmentsResponse.parse(await listSegmentsWithUsage()));
});

router.post("/segments", async (req, res): Promise<void> => {
  const parsed = CreateSegmentBody.safeParse(req.body);
  const input = parsed.success ? nameAndSlug(parsed.data.name) : null;
  if (!input) {
    res.status(400).json({ error: "Nome de segmento inválido" });
    return;
  }
  if (await findSegmentBySlug(input.slug)) {
    res.status(409).json({ error: "Segmento já cadastrado" });
    return;
  }
  try {
    res.status(201).json(CreateSegmentResponse.parse(await createSegment(input.name, input.slug)));
  } catch (err) {
    if (err instanceof SegmentSlugConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.patch("/segments/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const parsed = RenameSegmentBody.safeParse(req.body);
  const input = parsed.success ? nameAndSlug(parsed.data.name) : null;
  if (!input) {
    res.status(400).json({ error: "Nome de segmento inválido" });
    return;
  }
  if (!id || !(await getSegmentWithUsage(id))) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  // Mesmo slug do próprio segmento é só ajuste de caixa ou acento. Slug de
  // outro segmento é o mesmo ramo: o caminho é mesclar, não ter dois.
  const clash = await findSegmentBySlug(input.slug);
  if (clash && clash.id !== id) {
    res.status(409).json({ error: `Já existe o segmento ${clash.name} — use mesclar` });
    return;
  }
  try {
    res.json(RenameSegmentResponse.parse(await renameSegment(id, input.name, input.slug)));
  } catch (err) {
    if (err instanceof SegmentSlugConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/segments/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const result = id ? await deleteSegmentIfUnused(id) : ({ status: "not_found" } as const);
  if (result.status === "not_found") {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  if (result.status === "in_use") {
    res.status(409).json({ error: usageMessage(result.usage), ...result.usage });
    return;
  }
  res.sendStatus(204);
});

router.post("/segments/:id/merge", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const parsed = MergeSegmentBody.safeParse(req.body);
  if (!id || !parsed.success) {
    res.status(400).json({ error: "Escolha o segmento de destino" });
    return;
  }
  if (parsed.data.targetId === id) {
    res.status(400).json({ error: "Escolha outro segmento como destino" });
    return;
  }
  const result = await mergeSegments(id, parsed.data.targetId);
  if (result.status === "not_found") {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  res.json(MergeSegmentResponse.parse(result.target));
});

export default router;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/segments.test.ts && pnpm --filter @workspace/api-server run typecheck`
Expected: PASS e typecheck sem erro.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/segments.ts artifacts/api-server/src/routes/__tests__/segments.test.ts
git commit -m "feat(api): renomear, apagar e mesclar segmentos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Rota de prévia de alcance

**Files:**
- Create: `artifacts/api-server/src/lib/campaigns/reach.ts`
- Create: `artifacts/api-server/src/routes/campaign-reach.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (import e `router.use` logo depois de `advertisersRouter`)
- Test: `artifacts/api-server/src/routes/__tests__/campaign-reach.test.ts`

**Interfaces:**
- Consumes: `previewReach`, `ReachPreview` (Task 1); `loadNetwork()` de `lib/portal/queries.ts` (já existe, devolve `Array<{ id; companyId; segmentId }>`).
- Produces:
  - `export async function loadAdvertiserIdentity(advertiserId: number): Promise<{ companyId: number | null; segmentId: number | null } | null>`
  - `POST /campaigns/reach-preview` com corpo `{ advertiserId, targetMode, deviceIds, segmentIds }` e resposta `ReachPreview & { advertiserSegmentId: number | null; advertiserHasSegment: boolean; advertiserCompanyId: number | null }`. O `advertiserCompanyId` é o link "completar cadastro" do formulário.

- [ ] **Step 1: Escrever os testes que falham**

Criar `routes/__tests__/campaign-reach.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAdvertiserIdentity = vi.fn();
const loadNetwork = vi.fn();
vi.mock("../../lib/campaigns/reach", () => ({
  loadAdvertiserIdentity: (...a: unknown[]) => loadAdvertiserIdentity(...a),
}));
vi.mock("../../lib/portal/queries", () => ({
  loadNetwork: (...a: unknown[]) => loadNetwork(...a),
}));

async function post(body: unknown) {
  const { default: express } = await import("express");
  const { default: router } = await import("../campaign-reach");
  const app: Express = express();
  app.use(express.json());
  app.use(router);
  const { default: request } = await import("supertest");
  return request(app).post("/campaigns/reach-preview").send(body as object);
}

const PADARIA = 1;
const rede = [
  { id: 1, companyId: 20, segmentId: PADARIA },
  { id: 2, companyId: 30, segmentId: PADARIA },
  { id: 3, companyId: 40, segmentId: 2 },
];

describe("POST /campaigns/reach-preview", () => {
  beforeEach(() => {
    loadAdvertiserIdentity.mockReset();
    loadNetwork.mockReset().mockResolvedValue(rede);
  });

  it("conta o alcance com a regra do concorrente e identifica o anunciante", async () => {
    loadAdvertiserIdentity.mockResolvedValue({ companyId: 20, segmentId: PADARIA });
    const res = await post({ advertiserId: 7, targetMode: "all" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reachedCount: 2,
      totalDevices: 3,
      competitorDeviceIds: [2],
      advertiserSegmentId: PADARIA,
      advertiserHasSegment: true,
      advertiserCompanyId: 20,
    });
    expect(loadAdvertiserIdentity).toHaveBeenCalledWith(7);
  });

  it("anunciante sem segmento avisa e não marca concorrente", async () => {
    loadAdvertiserIdentity.mockResolvedValue({ companyId: 50, segmentId: null });
    const res = await post({ advertiserId: 7, targetMode: "devices", deviceIds: [1, 2] });
    expect(res.body).toMatchObject({ reachedCount: 2, competitorDeviceIds: [], advertiserHasSegment: false, advertiserCompanyId: 50 });
  });

  it("anunciante inexistente é 404", async () => {
    loadAdvertiserIdentity.mockResolvedValue(null);
    const res = await post({ advertiserId: 7, targetMode: "all" });
    expect(res.status).toBe(404);
    expect(loadNetwork).not.toHaveBeenCalled();
  });

  it("corpo sem anunciante é 400", async () => {
    expect((await post({ targetMode: "all" })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-reach.test.ts`
Expected: FAIL — módulo `../campaign-reach` não existe.

- [ ] **Step 3: Implementar**

`lib/campaigns/reach.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, advertisersTable, companiesTable } from "@workspace/db";

/** Empresa e segmento do anunciante: os dois lados que a regra do concorrente compara. */
export async function loadAdvertiserIdentity(
  advertiserId: number,
): Promise<{ companyId: number | null; segmentId: number | null } | null> {
  const [row] = await db
    .select({ companyId: advertisersTable.companyId, segmentId: companiesTable.segmentId })
    .from(advertisersTable)
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(eq(advertisersTable.id, advertiserId));
  return row ?? null;
}
```

`routes/campaign-reach.ts`:

```ts
import { Router, type IRouter } from "express";
import { z } from "zod";
import { previewReach } from "../lib/ad-eligibility";
import { loadAdvertiserIdentity } from "../lib/campaigns/reach";
import { loadNetwork } from "../lib/portal/queries";

const router: IRouter = Router();

const reachInput = z.object({
  advertiserId: z.coerce.number().int().positive(),
  targetMode: z.enum(["all", "devices", "segments"]).default("all"),
  deviceIds: z.array(z.coerce.number().int().positive()).default([]),
  segmentIds: z.array(z.coerce.number().int().positive()).default([]),
});

/**
 * Prévia do formulário de campanha: quantas TVs o alvo alcança e quais são
 * de concorrente, pela mesma conta que decide a grade da TV — o front não
 * reimplementa a regra.
 */
router.post("/campaigns/reach-preview", async (req, res): Promise<void> => {
  const parsed = reachInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { advertiserId, ...target } = parsed.data;
  const advertiser = await loadAdvertiserIdentity(advertiserId);
  if (!advertiser) {
    res.status(404).json({ error: "Anunciante não encontrado." });
    return;
  }
  const preview = previewReach(
    { ...target, advertiserSegmentId: advertiser.segmentId, advertiserCompanyId: advertiser.companyId },
    await loadNetwork(),
  );
  res.json({
    ...preview,
    advertiserSegmentId: advertiser.segmentId,
    advertiserHasSegment: advertiser.segmentId !== null,
    advertiserCompanyId: advertiser.companyId,
  });
});

export default router;
```

`routes/index.ts`: `import campaignReachRouter from "./campaign-reach";` junto dos outros imports e `router.use(campaignReachRouter);` na linha logo abaixo de `router.use(advertisersRouter);` (atrás do `requireAdmin`).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-reach.test.ts && pnpm --filter @workspace/api-server run typecheck`
Expected: PASS e typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/campaigns/reach.ts artifacts/api-server/src/routes/campaign-reach.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/__tests__/campaign-reach.test.ts
git commit -m "feat(api): rota de prévia de alcance da campanha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Segmento obrigatório e selo "Sem segmento" no admin

**Files:**
- Modify: `artifacts/signage/src/components/company-form-dialog.tsx` (validação em `handleSubmit` e `<option value="">`)
- Modify: `artifacts/signage/src/pages/companies.tsx` (badges da linha)
- Modify: `artifacts/signage/src/pages/company-detail.tsx` (badges do cabeçalho)
- Create: `artifacts/signage/src/components/missing-segment-badge.tsx`
- Test: `artifacts/signage/src/components/__tests__/company-form-dialog.test.tsx`, `artifacts/signage/src/pages/__tests__/companies.test.tsx`

**Interfaces:**
- Produces: `export function MissingSegmentBadge(): JSX.Element` — selo único para lista e detalhe.

- [ ] **Step 1: Escrever os testes que falham**

Em `company-form-dialog.test.tsx`:

1. No teste "envia o cadastro com papéis, endereço e coordenadas", trocar `'/segments': () => json(200, [])` por `'/segments': () => json(200, [{ id: 1, slug: 'padaria', name: 'Padaria', companyCount: 0, campaignCount: 0 }])`, acrescentar depois de marcar "Cliente (tem TV)":
   ```ts
   await userEvent.selectOptions(await screen.findByLabelText('Segmento'), '1');
   ```
   e acrescentar `segmentId: 1` ao `toMatchObject`.
2. Novo teste:

```ts
  it('não envia sem segmento', async () => {
    const fetchMock = stubFetch({ '/segments': () => json(200, [{ id: 1, slug: 'padaria', name: 'Padaria', companyCount: 0, campaignCount: 0 }]) });
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Padaria Central');
    await userEvent.click(screen.getByLabelText('Cliente (tem TV)'));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }));
    expect(await screen.findByText('Escolha o segmento da empresa.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('api/companies'), expect.anything());
  });
```

Em `pages/__tests__/companies.test.tsx`, acrescentar `segmentId: 1` ao fixture `PADARIA` (o `MERCADO` herda pelo spread) e o teste:

```ts
  it('marca a empresa sem segmento', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => json(String(url).includes('/companies') ? [PADARIA, { ...MERCADO, segmentId: null }] : [])));
    renderPage();
    expect(await screen.findByText('Mercado Bom')).toBeInTheDocument();
    expect(screen.getAllByText('Sem segmento')).toHaveLength(1);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/company-form-dialog.test.tsx src/pages/__tests__/companies.test.tsx`
Expected: FAIL — o formulário envia sem segmento e a lista não tem o selo.

- [ ] **Step 3: Implementar**

`components/missing-segment-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';

/** Empresa de cadastro antigo, sem segmento: fora da regra do concorrente até alguém completar. */
export function MissingSegmentBadge() {
  return (
    <Badge variant="destructive" title="A regra do concorrente não vale para esta empresa.">
      Sem segmento
    </Badge>
  );
}
```

`company-form-dialog.tsx`, em `handleSubmit`, depois da checagem de papéis:

```ts
    if (!form.segmentId) {
      setError('Escolha o segmento da empresa.');
      return;
    }
```

e trocar `<option value="">Sem segmento</option>` por `<option value="" disabled>Escolha o segmento</option>`. O `segmentId` do payload pode ficar `Number(form.segmentId)` (a checagem acima garante valor).

`pages/companies.tsx`: importar `MissingSegmentBadge` e, dentro do `div` de badges da linha, antes do badge de status:

```tsx
                  {company.segmentId === null ? <MissingSegmentBadge /> : null}
```

`pages/company-detail.tsx`: mesmo import e a mesma linha antes do `<Badge variant="outline">{STATUS_LABELS[...]}</Badge>` do cabeçalho.

`=== null` e não `== null`: fixtures de teste antigos sem o campo não devem ganhar selo.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/company-form-dialog.test.tsx src/pages/__tests__/companies.test.tsx src/pages/__tests__/company-detail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/missing-segment-badge.tsx artifacts/signage/src/components/company-form-dialog.tsx artifacts/signage/src/pages/companies.tsx artifacts/signage/src/pages/company-detail.tsx artifacts/signage/src/components/__tests__/company-form-dialog.test.tsx artifacts/signage/src/pages/__tests__/companies.test.tsx
git commit -m "feat(portal): segmento obrigatório e selo de empresa sem segmento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Tela Segmentos

**Files:**
- Create: `artifacts/signage/src/lib/segments-api.ts`
- Create: `artifacts/signage/src/pages/segments.tsx`
- Modify: `artifacts/signage/src/components/nav-config.ts` (grupo Comercial)
- Modify: `artifacts/signage/src/App.tsx` (rota `/segments` dentro de `AdminRoutes`, depois de `/companies/:id`)
- Test: `artifacts/signage/src/pages/__tests__/segments.test.tsx`, `artifacts/signage/src/components/__tests__/nav-config.test.ts`

**Interfaces:**
- Consumes: `useListSegments`, `getListSegmentsQueryKey` de `@workspace/api-client-react` (Task 4); `request`, `ApiError`, `listCompanies`, `companiesQueryKey` de `@/lib/companies-api`.
- Produces:
  ```ts
  export type SegmentWithUsage = { id: number; slug: string; name: string; companyCount: number; campaignCount: number };
  export const createSegment: (name: string) => Promise<SegmentWithUsage>;
  export const renameSegment: (id: number, name: string) => Promise<SegmentWithUsage>;
  export const deleteSegment: (id: number) => Promise<void>;
  export const mergeSegment: (id: number, targetId: number) => Promise<SegmentWithUsage>;
  ```

- [ ] **Step 1: Escrever os testes que falham**

Em `nav-config.test.ts`, trocar a lista esperada de hrefs por:

```ts
    expect(hrefs(adminNav)).toEqual(['/', '/parque', '/companies', '/segments', '/admin', '/panels', '/divulgacao', '/users-admin']);
```

Criar `pages/__tests__/segments.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Segments from '../segments';

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

const PADARIA = { id: 1, slug: 'padaria', name: 'Padaria', companyCount: 3, campaignCount: 1 };
const PANIFICADORA = { id: 2, slug: 'panificadora', name: 'Panificadora', companyCount: 1, campaignCount: 0 };
const VAZIO = { id: 3, slug: 'otica', name: 'Ótica', companyCount: 0, campaignCount: 0 };

function stub(extra: (url: string, init?: RequestInit) => Promise<unknown> | undefined = () => undefined) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    const custom = extra(u, init);
    if (custom) return custom;
    if (u.includes('/companies')) return json(200, [{ id: 9, name: 'Antiga', segmentId: null }, { id: 8, name: 'Nova', segmentId: 1 }]);
    if (u.includes('/segments')) return json(200, [PADARIA, PANIFICADORA, VAZIO]);
    return json(404, { error: 'não mockado' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Segments />
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

afterEach(() => vi.unstubAllGlobals());

describe('Segments', () => {
  it('lista com o uso e conta as empresas sem segmento', async () => {
    stub();
    renderPage();
    expect(await screen.findByText('Panificadora')).toBeInTheDocument();
    expect(within(row('Padaria')).getByText('3')).toBeInTheDocument();
    expect(await screen.findByText('1 empresa sem segmento')).toBeInTheDocument();
  });

  it('só deixa apagar segmento sem uso', async () => {
    stub();
    renderPage();
    await screen.findByText('Ótica');
    expect(within(row('Padaria')).getByRole('button', { name: 'Apagar' })).toBeDisabled();
    expect(within(row('Ótica')).getByRole('button', { name: 'Apagar' })).toBeEnabled();
  });

  it('renomeia mandando o nome novo', async () => {
    const fetchMock = stub((u, init) => (init?.method === 'PATCH' ? json(200, { ...PANIFICADORA, name: 'Panificação' }) : undefined));
    renderPage();
    await screen.findByText('Panificadora');
    await userEvent.click(within(row('Panificadora')).getByRole('button', { name: 'Renomear' }));
    const input = screen.getByLabelText('Novo nome');
    await userEvent.clear(input);
    await userEvent.type(input, 'Panificação');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/segments/2'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Panificação' }) })),
    );
  });

  it('mostra o 409 do renomear', async () => {
    stub((u, init) => (init?.method === 'PATCH' ? json(409, { error: 'Já existe o segmento Padaria — use mesclar' }) : undefined));
    renderPage();
    await screen.findByText('Panificadora');
    await userEvent.click(within(row('Panificadora')).getByRole('button', { name: 'Renomear' }));
    await userEvent.clear(screen.getByLabelText('Novo nome'));
    await userEvent.type(screen.getByLabelText('Novo nome'), 'padaria');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Já existe o segmento Padaria — use mesclar')).toBeInTheDocument();
  });

  it('mescla avisando que os ramos viram concorrentes', async () => {
    const fetchMock = stub((u, init) => (u.includes('/merge') ? json(200, { ...PADARIA, companyCount: 4 }) : undefined));
    renderPage();
    await screen.findByText('Panificadora');
    await userEvent.click(within(row('Panificadora')).getByRole('button', { name: 'Mesclar' }));
    expect(screen.getByText(/passam a ser concorrentes/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Mesclar em'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar mesclar' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/segments/2/merge'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ targetId: 1 }) })),
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/segments.test.tsx src/components/__tests__/nav-config.test.ts`
Expected: FAIL — página não existe e o menu não tem `/segments`.

- [ ] **Step 3: Implementar**

`lib/segments-api.ts`:

```ts
import { request } from '@/lib/companies-api';

export type SegmentWithUsage = { id: number; slug: string; name: string; companyCount: number; campaignCount: number };

// Mesmo `request` das empresas: o erro chega como ApiError com a mensagem em
// português do servidor (409 de nome repetido, segmento em uso…).
export const createSegment = (name: string) =>
  request<SegmentWithUsage>('/segments', { method: 'POST', body: JSON.stringify({ name }) });

export const renameSegment = (id: number, name: string) =>
  request<SegmentWithUsage>(`/segments/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const deleteSegment = (id: number) => request<void>(`/segments/${id}`, { method: 'DELETE' });

export const mergeSegment = (id: number, targetId: number) =>
  request<SegmentWithUsage>(`/segments/${id}/merge`, { method: 'POST', body: JSON.stringify({ targetId }) });
```

`pages/segments.tsx`:

```tsx
import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Plus } from 'lucide-react';
import { getListSegmentsQueryKey, useListSegments } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ApiError, companiesQueryKey, listCompanies } from '@/lib/companies-api';
import {
  createSegment,
  deleteSegment,
  mergeSegment,
  renameSegment,
  type SegmentWithUsage,
} from '@/lib/segments-api';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

export default function Segments() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: segments = [] } = useListSegments();
  // A contagem de pendentes sai da lista de empresas: é o mesmo dado que a
  // tela de empresas mostra com o selo "Sem segmento".
  const { data: companies = [] } = useQuery({ queryKey: [...companiesQueryKey, {}], queryFn: () => listCompanies() });
  const missing = companies.filter((c) => c.segmentId === null).length;

  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<SegmentWithUsage | null>(null);
  const [merging, setMerging] = useState<SegmentWithUsage | null>(null);

  // Segmento mexe na regra do concorrente e no cadastro das empresas: as duas
  // listas voltam a buscar.
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: getListSegmentsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: companiesQueryKey });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      await createSegment(newName.trim());
      setNewName('');
      refresh();
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível criar o segmento.'), variant: 'destructive' });
    }
  }

  async function handleDelete(segment: SegmentWithUsage) {
    try {
      await deleteSegment(segment.id);
      toast({ title: 'Segmento apagado' });
      refresh();
    } catch (err) {
      // 409: alguém passou a usar o segmento depois que a lista carregou.
      toast({ title: errorMessage(err, 'Não foi possível apagar o segmento.'), description: 'Use mesclar para tirá-lo.', variant: 'destructive' });
      refresh();
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Segmentos</h1>
        <p className="mt-1 text-muted-foreground">Ramo de cada empresa. Empresas do mesmo segmento não anunciam nas TVs umas das outras.</p>
        {missing > 0 ? (
          <p className="mt-3 text-sm text-amber-500">
            <Link href="/companies" className="underline">{missing === 1 ? '1 empresa sem segmento' : `${missing} empresas sem segmento`}</Link>
            {' '}— a regra do concorrente não vale para elas.
          </p>
        ) : null}
      </div>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <Input aria-label="Nome do segmento" placeholder="Ex.: Farmácia" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit"><Plus className="mr-2 h-4 w-4" />Novo segmento</Button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Segmento</th>
            <th className="py-2">Empresas</th>
            <th className="py-2">Campanhas</th>
            <th className="py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => {
            const inUse = segment.companyCount > 0 || segment.campaignCount > 0;
            return (
              <tr key={segment.id} className="border-b">
                <td className="py-2 font-medium">{segment.name}</td>
                <td className="py-2">{segment.companyCount}</td>
                <td className="py-2">{segment.campaignCount}</td>
                <td className="flex justify-end gap-2 py-2">
                  <Button variant="outline" size="sm" onClick={() => setRenaming(segment)}>Renomear</Button>
                  <Button variant="outline" size="sm" onClick={() => setMerging(segment)} disabled={segments.length < 2}>Mesclar</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={inUse}
                    title={inUse ? 'Em uso: use mesclar para tirá-lo.' : undefined}
                    onClick={() => handleDelete(segment)}
                  >
                    Apagar
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <RenameDialog segment={renaming} onClose={() => setRenaming(null)} onSaved={refresh} />
      <MergeDialog segment={merging} segments={segments} onClose={() => setMerging(null)} onSaved={refresh} />
    </div>
  );
}

function RenameDialog({ segment, onClose, onSaved }: { segment: SegmentWithUsage | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<number | null>(null);
  // Reabre com o nome do segmento clicado, sem resto de erro da vez anterior.
  if (segment && segment.id !== lastId) {
    setLastId(segment.id);
    setName(segment.name);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!segment) return;
    try {
      await renameSegment(segment.id, name.trim());
      onSaved();
      setLastId(null);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível renomear o segmento.'));
    }
  }

  return (
    <Dialog open={segment !== null} onOpenChange={(open) => { if (!open) { setLastId(null); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Renomear segmento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="segment-rename">Novo nome</Label>
            <Input id="segment-rename" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><Button type="submit">Salvar nome</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  segment,
  segments,
  onClose,
  onSaved,
}: {
  segment: SegmentWithUsage | null;
  segments: SegmentWithUsage[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [targetId, setTargetId] = useState('');
  const others = segments.filter((s) => s.id !== segment?.id);

  function close() {
    setTargetId('');
    onClose();
  }

  async function handleConfirm() {
    if (!segment || !targetId) return;
    try {
      await mergeSegment(segment.id, Number(targetId));
      toast({ title: 'Segmentos mesclados' });
      onSaved();
      close();
    } catch (err) {
      toast({ title: errorMessage(err, 'Não foi possível mesclar.'), variant: 'destructive' });
    }
  }

  return (
    <Dialog open={segment !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mesclar {segment?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {segment?.companyCount ?? 0} empresa(s) e {segment?.campaignCount ?? 0} campanha(s) passam para o destino, e {segment?.name} deixa de existir.
          </p>
          <p className="text-sm text-amber-500">
            As empresas dos dois segmentos passam a ser concorrentes: peças entre elas deixam de tocar nas TVs umas das outras.
          </p>
          <div className="space-y-2">
            <Label htmlFor="segment-merge-target">Mesclar em</Label>
            <select id="segment-merge-target" className={selectClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="" disabled>Escolha o destino</option>
              {others.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <DialogFooter><Button onClick={handleConfirm} disabled={!targetId}>Confirmar mesclar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`nav-config.ts`: importar `Tags` de `lucide-react` e trocar o grupo Comercial por:

```ts
  {
    label: 'Comercial',
    items: [
      { href: '/companies', label: 'Empresas', icon: Building2 },
      { href: '/segments', label: 'Segmentos', icon: Tags },
    ],
  },
```

`App.tsx`: importar `Segments from '@/pages/segments'` junto das outras páginas e, dentro de `AdminRoutes`, depois da rota `/companies/:id`:

```tsx
      <Route path="/segments">
        <Layout><Segments /></Layout>
      </Route>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/segments.test.tsx src/components/__tests__/nav-config.test.ts src/components/__tests__/app-shell.test.tsx && pnpm --filter @workspace/signage run typecheck`
Expected: PASS e typecheck sem erro. Se `app-shell.test.tsx` contar itens do menu, atualizar a contagem esperada para incluir "Segmentos".

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/lib/segments-api.ts artifacts/signage/src/pages/segments.tsx artifacts/signage/src/components/nav-config.ts artifacts/signage/src/App.tsx artifacts/signage/src/pages/__tests__/segments.test.tsx artifacts/signage/src/components/__tests__
git commit -m "feat(portal): tela de segmentos com renomear, mesclar e apagar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Prévia de alcance no formulário de campanha

**Files:**
- Create: `artifacts/signage/src/components/use-reach-preview.ts`
- Modify: `artifacts/signage/src/components/campaign-form-dialog.tsx` (`CampaignTargetPicker` e `CampaignFormDialog`)
- Modify: `artifacts/signage/src/pages/campaign-detail.tsx:81,254` (hook e prop no picker)
- Test: `artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `POST /campaigns/reach-preview` (Task 5); `CampaignTargetMode` de `use-campaign-form.ts`.
- Produces:
  ```ts
  export type ReachPreview = {
    reachedCount: number; totalDevices: number; competitorDeviceIds: number[];
    advertiserSegmentId: number | null; advertiserHasSegment: boolean; advertiserCompanyId: number | null;
  };
  export const REACH_PREVIEW_DEBOUNCE_MS = 300;
  export function useReachPreview(
    input: { advertiserId: number | null; targetMode: CampaignTargetMode; deviceIds: number[]; segmentIds: number[] },
    enabled: boolean,
  ): ReachPreview | null;
  ```
  `CampaignTargetPicker` ganha a prop opcional `preview?: ReachPreview | null`.

- [ ] **Step 1: Escrever os testes que falham**

Reescrever `campaign-form-dialog.test.tsx` mantendo os dois testes atuais e acrescentando os novos:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignFormDialog } from '../campaign-form-dialog';

const advertiser = { id: 3, name: 'Mercado', company: 'Mercado Bom' };
const devices = [
  { id: 1, name: 'TV balcão', location: null, clientName: 'Mercado Bom' },
  { id: 2, name: 'TV caixa', location: null, clientName: 'Mercado Rival' },
];
const segments = [{ id: 5, name: 'Mercado' }, { id: 6, name: 'Farmácia' }];

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

function preview(over: Record<string, unknown> = {}) {
  return {
    reachedCount: 1, totalDevices: 2, competitorDeviceIds: [2],
    advertiserSegmentId: 5, advertiserHasSegment: true, advertiserCompanyId: 30, ...over,
  };
}

function renderDialog(campaign: Parameters<typeof CampaignFormDialog>[0]['campaign'] = null) {
  return render(
    <CampaignFormDialog
      open
      onOpenChange={vi.fn()}
      advertisers={[advertiser] as never}
      announcements={[{ id: 10, title: 'Peça' }]}
      devices={devices}
      segments={segments}
      campaign={campaign}
      lockedAdvertiserId={3}
      onSaved={vi.fn()}
    />,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CampaignFormDialog', () => {
  // Campanha pode existir só para receber o encarte do lojista: nenhuma peça
  // marcada não bloqueia criar nem salvar.
  it('publicar fica habilitado sem nenhuma peça marcada', async () => {
    renderDialog();
    expect(await screen.findByRole('button', { name: 'Publicar campanha' })).toBeEnabled();
  });

  it('salvar alterações fica habilitado em campanha sem peças', async () => {
    renderDialog({
      id: 1, advertiserId: 3, name: 'Só encarte', contractValue: null,
      startsAt: '2026-09-20T00:00:00.000Z', endsAt: '2026-09-27T00:00:00.000Z', announcementIds: [],
    } as never);
    expect(await screen.findByRole('button', { name: 'Salvar alterações' })).toBeEnabled();
  });

  it('mostra quantas TVs a campanha alcança', async () => {
    const fetchMock = vi.fn(() => json(200, preview()));
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    expect(await screen.findByTestId('reach-summary')).toHaveTextContent('Alcança 1 de 2 TVs');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ advertiserId: 3, targetMode: 'all', deviceIds: [], segmentIds: [] });
  });

  it('avisa alcance zero sem travar o salvar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview({ reachedCount: 0 }))));
    renderDialog();
    expect(await screen.findByText('Nenhuma TV vai exibir esta campanha.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar campanha' })).toBeEnabled();
  });

  it('marca a TV do concorrente e o segmento do próprio anunciante', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    await userEvent.click(screen.getByLabelText(/TVs escolhidas/));
    expect(await screen.findByText('concorrente · não toca aqui')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Por segmento/));
    expect(await screen.findByText('mesmo ramo do anunciante · só toca nas TVs dele')).toBeInTheDocument();
  });

  it('alerta anunciante sem segmento com link para completar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview({ advertiserHasSegment: false, advertiserSegmentId: null, competitorDeviceIds: [] }))));
    renderDialog();
    expect(await screen.findByText(/Anunciante sem segmento: a regra do concorrente não vale/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Completar cadastro' })).toHaveAttribute('href', '/companies/30');
  });

  it('falha da prévia some com a linha e não trava o formulário', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(500, { error: 'falhou' })));
    renderDialog();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByTestId('reach-summary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar campanha' })).toBeEnabled();
  });

  it('resposta velha chegando depois não sobrescreve a do alvo atual', async () => {
    let releaseOld!: () => void;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (body.targetMode === 'all') {
        return new Promise((resolve) => {
          releaseOld = () => resolve({ ok: true, status: 200, json: () => Promise.resolve(preview({ reachedCount: 2 })) });
        });
      }
      return json(200, preview({ reachedCount: 0 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByLabelText(/TVs escolhidas/));
    expect(await screen.findByTestId('reach-summary')).toHaveTextContent('Alcança 0 de 2 TVs');
    releaseOld();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('reach-summary')).toHaveTextContent('Alcança 0 de 2 TVs');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/campaign-form-dialog.test.tsx`
Expected: FAIL nos seis testes novos (sem `reach-summary`, sem selos).

- [ ] **Step 3: Implementar**

`components/use-reach-preview.ts`:

```ts
import { useEffect, useState } from "react";
import type { CampaignTargetMode } from "@/components/use-campaign-form";

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

export type ReachPreview = {
  reachedCount: number;
  totalDevices: number;
  competitorDeviceIds: number[];
  advertiserSegmentId: number | null;
  advertiserHasSegment: boolean;
  advertiserCompanyId: number | null;
};

/** Espera o admin parar de clicar antes de perguntar à API. */
export const REACH_PREVIEW_DEBOUNCE_MS = 300;

/**
 * Prévia de alcance do alvo escolhido, calculada pela API com a mesma regra
 * da TV. Cada mudança cancela a pergunta anterior: sem isso, a resposta de um
 * alvo antigo podia chegar depois e mostrar a conta errada. Qualquer falha
 * vira null — a prévia ajuda, nunca impede salvar.
 */
export function useReachPreview(
  input: { advertiserId: number | null; targetMode: CampaignTargetMode; deviceIds: number[]; segmentIds: number[] },
  enabled: boolean,
): ReachPreview | null {
  const [preview, setPreview] = useState<ReachPreview | null>(null);
  const body = JSON.stringify(input);

  useEffect(() => {
    if (!enabled || input.advertiserId === null) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(api("/campaigns/reach-preview"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        const data = res.ok ? await res.json() : null;
        if (!controller.signal.aborted) setPreview(data && typeof data.reachedCount === "number" ? data : null);
      } catch {
        if (!controller.signal.aborted) setPreview(null);
      }
    }, REACH_PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `body` já carrega todo o `input`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, enabled]);

  return preview;
}
```

`campaign-form-dialog.tsx`:

1. Imports: `import { Link } from "wouter";` e `import { useReachPreview, type ReachPreview } from "@/components/use-reach-preview";`.
2. Antes de `CampaignTargetPicker`, o resumo:

```tsx
/** Linha de alcance e alertas da regra do concorrente; some sem prévia. */
function ReachSummary({ preview }: { preview: ReachPreview }) {
  return (
    <div className="space-y-1 text-sm">
      <p data-testid="reach-summary">
        Alcança <strong>{preview.reachedCount}</strong> de <strong>{preview.totalDevices}</strong> TVs
      </p>
      {preview.reachedCount === 0 && <p className="text-amber-500">Nenhuma TV vai exibir esta campanha.</p>}
      {!preview.advertiserHasSegment && (
        <p className="text-amber-500">
          Anunciante sem segmento: a regra do concorrente não vale.{" "}
          {preview.advertiserCompanyId != null && (
            <Link href={`/companies/${preview.advertiserCompanyId}`} className="underline">Completar cadastro</Link>
          )}
        </p>
      )}
    </div>
  );
}
```

3. `CampaignTargetPicker` recebe `preview?: ReachPreview | null` (acrescentar ao destructuring e ao tipo das props) e, no começo do corpo:

```tsx
  const competitors = new Set(preview?.competitorDeviceIds ?? []);
```

   - No `label` de cada TV, acrescentar `${competitors.has(device.id) ? " opacity-60" : ""}` ao `className` e, depois do `<span>` do `clientName`:
     ```tsx
              {competitors.has(device.id) && <span className="ml-auto text-xs text-amber-500">concorrente · não toca aqui</span>}
     ```
   - No `label` de cada segmento, depois de `{segment.name}`:
     ```tsx
                {preview?.advertiserSegmentId === segment.id && (
                  <span className="ml-auto text-xs text-amber-500">mesmo ramo do anunciante · só toca nas TVs dele</span>
                )}
     ```
   - Como último filho do `div` raiz do picker: `{preview && <ReachSummary preview={preview} />}`.

4. Em `CampaignFormDialog`, depois de `const form = useCampaignForm();`:

```tsx
  const preview = useReachPreview(
    { advertiserId: form.selectedAdvertiser, targetMode: form.targetMode, deviceIds: form.selectedDevices, segmentIds: form.selectedSegments },
    open,
  );
```

   e passar `preview={preview}` no `<CampaignTargetPicker ... />`.

`pages/campaign-detail.tsx`: importar `useReachPreview`; depois de `const form = useCampaignForm();` (linha 81):

```tsx
  const preview = useReachPreview(
    { advertiserId: form.selectedAdvertiser, targetMode: form.targetMode, deviceIds: form.selectedDevices, segmentIds: form.selectedSegments },
    editing,
  );
```

e passar `preview={preview}` no `<CampaignTargetPicker ... />` da linha 254.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/campaign-form-dialog.test.tsx src/pages/__tests__/campaign-detail.test.tsx && pnpm --filter @workspace/signage run typecheck`
Expected: PASS e typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/use-reach-preview.ts artifacts/signage/src/components/campaign-form-dialog.tsx artifacts/signage/src/pages/campaign-detail.tsx artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx
git commit -m "feat(portal): prévia de alcance e selos de concorrente na campanha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verificação final

**Files:** nenhum novo.

- [ ] **Step 1: Suíte inteira e typecheck**

Run: `pnpm run typecheck && pnpm --filter @workspace/api-server test && pnpm --filter @workspace/signage exec vitest run`
Expected: tudo verde. Corrigir qualquer teste antigo que mandava empresa sem `segmentId` (fixture de teste, nunca afrouxar a regra).

- [ ] **Step 2: Conferir no app rodando**

Subir API e web (skill `run` ou os scripts `dev` de cada pacote) com banco local e conferir:
1. `/segments`: criar "Panificadora", mesclar em um segmento existente, ver contagens atualizarem; tentar apagar segmento em uso (botão desabilitado).
2. Editar uma empresa sem segmento só mudando status → mensagem "Complete o segmento antes de salvar."
3. Nova campanha de um anunciante de segmento X, modo "Por segmento" marcando X → "Alcança N de M TVs" com N = TVs da própria empresa; modo "TVs escolhidas" mostra o selo nas TVs concorrentes.

Se não houver banco local disponível, registrar isso no PR em vez de afirmar que foi conferido.

- [ ] **Step 3: Abrir o PR**

Título: `feat(portal): segmentos com cadastro, mesclar e prévia de alcance`. Corpo resume as quatro entregas, cita a spec e termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Não escrever nenhuma linha começando com `BREAKING CHANGE:`.
