# Tabela de preço e cálculo de orçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin configura o preço (por TV × inserções, mínimo mensal, descontos trimestral/anual) e o sistema calcula o valor de um alvo; o admin vê o "valor de tabela" ao montar a campanha.

**Architecture:** Tabela `pricing` de uma linha só; função pura `quote()` na API; rotas só-admin `GET/PUT /pricing` e `POST /quotes/preview` (alcance pela mesma regra de `previewReach`, sem a vitrine). No painel, página "Preços" e uma linha de valor no formulário de campanha, com cliente HTTP escrito à mão (mesmo padrão de `/campaigns/reach-preview` e dos avisos urgentes, que não passam pelo openapi).

**Tech Stack:** Express 5 + drizzle (Postgres) + zod; React + TanStack Query + Testing Library + vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-tabela-de-preco-design.md`

## Global Constraints

- Código e comentários em português explicando o porquê; acentos UTF-8 reais, nunca `\uXXXX`.
- Commits `tipo(escopo): descrição curta em português`, sem ponto final, com o trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git add` com caminhos explícitos. Nunca mexer em `package.json`/`pnpm-lock.yaml`.
- Valores em **centavos inteiros**; porcentagens inteiras.
- Limites: preço e mínimo de 0 a 100.000.000 centavos; descontos de 0 a 90; inserções de 1 a 5; período `monthly` | `quarterly` | `annual` (1, 3, 12 meses).
- Conta: `bruto = preço × TVs × inserções`; `TVs = 0` → tudo 0, sem mínimo; `mensal de tabela = max(mínimo, bruto)`; `mensal = Math.round(mensal de tabela × (100 − desconto) / 100)`; `total = mensal × meses`; `economia = (mensal de tabela − mensal) × meses`.
- TVs que contam: alcançadas pelo alvo, sem as de concorrente (quando há anunciante) e **sem a vitrine** (`devices.showcase = true`).
- Sem linha em `pricing` → `{ available: false }`; preço nunca exposto em rota pública (rotas ficam depois de `requireAdmin`).
- Comandos (raiz da worktree): API `pnpm --filter @workspace/api-server exec vitest run <arquivo>`; web `pnpm --filter @workspace/signage exec vitest run <arquivo>`; migração `DATABASE_URL=postgres://u:p@localhost:5432/x pnpm --filter @workspace/db run generate`; tipos `pnpm -w run typecheck`.

## Review Focus

1. **Arredondamento de centavos com desconto** (ex.: R$ 33,33 com 15%) — servidor e espelho no navegador dão o mesmo centavo (Task 1 e Task 3 testam o mesmo caso: 3333 × 85% = 2833).
2. **Admin digita "1.234,56" ou "1234,5" no campo em reais** → vira 123456 / 123450 centavos; texto inválido não envia (Task 4).
3. **Vitrine entra na conta por engano** → orçamento cobra uma TV que não é de loja (Task 2 testa a vitrine fora).
4. **Formulário de campanha com a resposta da prévia de alcance no lugar da de preço** (o teste existente mocka qualquer `fetch` com a mesma resposta) → a linha de valor some em vez de quebrar (Task 5).
5. **Mudar inserções/alvo rápido no formulário** → resposta velha não sobrescreve a nova (Task 5, aborto como em `use-reach-preview`).

---

### Task 1: Conta pura `quote()` na API

**Files:**
- Create: `artifacts/api-server/src/lib/pricing/quote.ts`
- Test: `artifacts/api-server/src/lib/pricing/__tests__/quote.test.ts`

**Interfaces:**
- Produces:
  - `type Pricing = { pricePerTvCents: number; minMonthlyCents: number; quarterlyDiscountPct: number; annualDiscountPct: number }`
  - `type QuotePeriod = "monthly" | "quarterly" | "annual"`
  - `QUOTE_PERIODS: readonly QuotePeriod[]`, `PERIOD_MONTHS: Record<QuotePeriod, number>`
  - `type Quote = { tvs; loopInsertions; period; months; monthlyListCents; discountPct; monthlyCents; totalCents; savingsCents; minimumApplied: boolean }`
  - `quote(pricing: Pricing, input: { tvs: number; loopInsertions: number; period: QuotePeriod }): Quote`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PERIOD_MONTHS, quote, type Pricing } from "../quote";

const tabela: Pricing = { pricePerTvCents: 1500, minMonthlyCents: 5000, quarterlyDiscountPct: 10, annualDiscountPct: 20 };

describe("quote", () => {
  it("preço por TV × TVs × inserções, mensal sem desconto", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 1, period: "monthly" })).toEqual({
      tvs: 10,
      loopInsertions: 1,
      period: "monthly",
      months: 1,
      monthlyListCents: 15000,
      discountPct: 0,
      monthlyCents: 15000,
      totalCents: 15000,
      savingsCents: 0,
      minimumApplied: false,
    });
  });

  it("inserções multiplicam", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 3, period: "monthly" }).monthlyCents).toBe(45000);
  });

  it("abaixo do mínimo cobra o mínimo e avisa", () => {
    const q = quote(tabela, { tvs: 2, loopInsertions: 1, period: "monthly" });
    expect(q.monthlyListCents).toBe(5000);
    expect(q.minimumApplied).toBe(true);
  });

  it("exatamente no mínimo não conta como mínimo aplicado", () => {
    const q = quote({ ...tabela, minMonthlyCents: 3000 }, { tvs: 2, loopInsertions: 1, period: "monthly" });
    expect(q.monthlyListCents).toBe(3000);
    expect(q.minimumApplied).toBe(false);
  });

  it("nenhuma TV no alvo: tudo zero, sem mínimo", () => {
    const q = quote(tabela, { tvs: 0, loopInsertions: 2, period: "annual" });
    expect(q).toMatchObject({ monthlyListCents: 0, monthlyCents: 0, totalCents: 0, savingsCents: 0, minimumApplied: false });
  });

  it("trimestral aplica o desconto trimestral em 3 meses", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 1, period: "quarterly" })).toMatchObject({
      months: 3,
      discountPct: 10,
      monthlyListCents: 15000,
      monthlyCents: 13500,
      totalCents: 40500,
      savingsCents: 4500,
    });
  });

  it("anual aplica o desconto anual em 12 meses", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 1, period: "annual" })).toMatchObject({
      months: 12,
      discountPct: 20,
      monthlyCents: 12000,
      totalCents: 144000,
      savingsCents: 36000,
    });
  });

  it("desconto arredonda ao centavo (3333 com 15% = 2833)", () => {
    const q = quote({ pricePerTvCents: 3333, minMonthlyCents: 0, quarterlyDiscountPct: 15, annualDiscountPct: 0 }, { tvs: 1, loopInsertions: 1, period: "quarterly" });
    expect(q.monthlyCents).toBe(2833);
    expect(q.totalCents).toBe(8499);
    expect(q.savingsCents).toBe(1500);
  });

  it("meses por período", () => {
    expect(PERIOD_MONTHS).toEqual({ monthly: 1, quarterly: 3, annual: 12 });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @workspace/api-server exec vitest run src/lib/pricing/__tests__/quote.test.ts` — Expected: FAIL (módulo ausente).

- [ ] **Step 3: Implementation** — `quote.ts`:

```ts
/**
 * Conta do orçamento: preço por TV × TVs × inserções, com valor mínimo por
 * mês e desconto por período. Pura e em centavos inteiros — é a mesma conta
 * que o painel espelha no navegador (artifacts/signage/src/lib/pricing.ts);
 * mudou aqui, mude lá. Dias e faixas de horário não mudam o preço (decisão
 * da spec: horário é preferência, não desconto).
 */
export type Pricing = {
  pricePerTvCents: number;
  minMonthlyCents: number;
  quarterlyDiscountPct: number;
  annualDiscountPct: number;
};

export type QuotePeriod = "monthly" | "quarterly" | "annual";

export const QUOTE_PERIODS: readonly QuotePeriod[] = ["monthly", "quarterly", "annual"];

export const PERIOD_MONTHS: Record<QuotePeriod, number> = { monthly: 1, quarterly: 3, annual: 12 };

export type Quote = {
  tvs: number;
  loopInsertions: number;
  period: QuotePeriod;
  months: number;
  /** Mensal antes do desconto, já com o mínimo. */
  monthlyListCents: number;
  discountPct: number;
  /** Mensal com o desconto do período. */
  monthlyCents: number;
  totalCents: number;
  savingsCents: number;
  minimumApplied: boolean;
};

function discountFor(pricing: Pricing, period: QuotePeriod): number {
  if (period === "quarterly") return pricing.quarterlyDiscountPct;
  if (period === "annual") return pricing.annualDiscountPct;
  return 0;
}

export function quote(pricing: Pricing, input: { tvs: number; loopInsertions: number; period: QuotePeriod }): Quote {
  const months = PERIOD_MONTHS[input.period];
  const discountPct = discountFor(pricing, input.period);
  const bruto = pricing.pricePerTvCents * input.tvs * input.loopInsertions;
  // Alvo sem TV nenhuma não cobra mínimo: não há o que vender.
  const minimumApplied = input.tvs > 0 && bruto < pricing.minMonthlyCents;
  const monthlyListCents = input.tvs > 0 ? Math.max(pricing.minMonthlyCents, bruto) : 0;
  const monthlyCents = Math.round((monthlyListCents * (100 - discountPct)) / 100);
  return {
    tvs: input.tvs,
    loopInsertions: input.loopInsertions,
    period: input.period,
    months,
    monthlyListCents,
    discountPct,
    monthlyCents,
    totalCents: monthlyCents * months,
    savingsCents: (monthlyListCents - monthlyCents) * months,
    minimumApplied,
  };
}
```

- [ ] **Step 4: Run** o mesmo comando — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/pricing/quote.ts artifacts/api-server/src/lib/pricing/__tests__/quote.test.ts
git commit -m "feat(api): conta do orçamento por TV e inserções" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tabela `pricing`, consultas e rotas só-admin

**Files:**
- Create: `lib/db/src/schema/pricing.ts`; Modify: `lib/db/src/schema/index.ts`
- Create: `lib/db/drizzle/0025_*.sql` (gerado) + snapshot/journal
- Create: `artifacts/api-server/src/lib/pricing/store.ts`
- Create: `artifacts/api-server/src/routes/pricing.ts`; Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/routes/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: `quote`, `Pricing`, `QUOTE_PERIODS` (Task 1); `previewReach` (`lib/ad-eligibility.ts`); `loadAdvertiserIdentity(id): Promise<{ companyId: number; segmentId: number | null } | null>` (`lib/campaigns/reach.ts`).
- Produces:
  - `pricingTable` (drizzle) com `id`, `pricePerTvCents`, `minMonthlyCents`, `quarterlyDiscountPct`, `annualDiscountPct`, `updatedAt`.
  - `loadPricing(): Promise<(Pricing & { updatedAt: Date }) | null>`, `savePricing(p: Pricing): Promise<Pricing & { updatedAt: Date }>`, `loadQuoteNetwork(): Promise<NetworkDevice[]>` (sem vitrine).
  - `GET /pricing` → `PricingRow | null` (JSON com `updatedAt` ISO); `PUT /pricing` → `PricingRow`; `POST /quotes/preview` → `{ available: false } | { available: true; reach: { tvs: number; blockedByCompetitor: number }; quote: Quote }`.

- [ ] **Step 1: Write the failing test** — `routes/__tests__/pricing.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPricing = vi.fn();
const savePricing = vi.fn();
const loadQuoteNetwork = vi.fn();
const loadAdvertiserIdentity = vi.fn();

vi.mock("../../lib/pricing/store", () => ({
  loadPricing: (...a: unknown[]) => loadPricing(...a),
  savePricing: (...a: unknown[]) => savePricing(...a),
  loadQuoteNetwork: (...a: unknown[]) => loadQuoteNetwork(...a),
}));
vi.mock("../../lib/campaigns/reach", () => ({
  loadAdvertiserIdentity: (...a: unknown[]) => loadAdvertiserIdentity(...a),
}));

async function app(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../pricing");
  const a = express();
  a.use(express.json());
  a.use(router);
  return a;
}

async function req() {
  const { default: request } = await import("supertest");
  return request(await app());
}

const TABELA = { pricePerTvCents: 1500, minMonthlyCents: 5000, quarterlyDiscountPct: 10, annualDiscountPct: 20 };
const ATUALIZADO = new Date("2026-10-08T12:00:00Z");
const PADARIA = 1;
// TVs da rede já sem a vitrine (loadQuoteNetwork filtra).
const REDE = [
  { id: 1, companyId: 20, segmentId: PADARIA },
  { id: 2, companyId: 30, segmentId: PADARIA },
  { id: 3, companyId: 40, segmentId: 2 },
];

beforeEach(() => {
  loadPricing.mockReset().mockResolvedValue({ ...TABELA, updatedAt: ATUALIZADO });
  savePricing.mockReset().mockImplementation(async (p) => ({ ...p, updatedAt: ATUALIZADO }));
  loadQuoteNetwork.mockReset().mockResolvedValue(REDE);
  loadAdvertiserIdentity.mockReset();
});

describe("GET /pricing", () => {
  it("devolve a tabela", async () => {
    const res = await (await req()).get("/pricing");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...TABELA, updatedAt: "2026-10-08T12:00:00.000Z" });
  });

  it("sem tabela → null", async () => {
    loadPricing.mockResolvedValue(null);
    const res = await (await req()).get("/pricing");
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("PUT /pricing", () => {
  it("salva e devolve a tabela", async () => {
    const res = await (await req()).put("/pricing").send(TABELA);
    expect(res.status).toBe(200);
    expect(savePricing).toHaveBeenCalledWith(TABELA);
    expect(res.body.pricePerTvCents).toBe(1500);
  });

  it.each([
    [{ ...TABELA, pricePerTvCents: -1 }],
    [{ ...TABELA, minMonthlyCents: 100_000_001 }],
    [{ ...TABELA, quarterlyDiscountPct: 91 }],
    [{ ...TABELA, annualDiscountPct: -1 }],
    [{ ...TABELA, pricePerTvCents: 15.5 }],
    [{ ...TABELA, pricePerTvCents: "1500" }],
    [{ pricePerTvCents: 1500 }],
  ])("recusa %j com 400 e mensagem", async (corpo) => {
    const res = await (await req()).put("/pricing").send(corpo);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(savePricing).not.toHaveBeenCalled();
  });
});

describe("POST /quotes/preview", () => {
  it("sem tabela → available false, sem consultar a rede", async () => {
    loadPricing.mockResolvedValue(null);
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
    expect(loadQuoteNetwork).not.toHaveBeenCalled();
  });

  it("rede toda, sem anunciante: todas as TVs, preço calculado", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all", loopInsertions: 2, period: "annual" });
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.reach).toEqual({ tvs: 3, blockedByCompetitor: 0 });
    expect(res.body.quote).toMatchObject({ tvs: 3, loopInsertions: 2, period: "annual", monthlyListCents: 9000, monthlyCents: 7200 });
  });

  it("com anunciante: TV de concorrente fica fora e é contada à parte", async () => {
    loadAdvertiserIdentity.mockResolvedValue({ companyId: 20, segmentId: PADARIA });
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all", advertiserId: 7 });
    expect(res.body.reach).toEqual({ tvs: 2, blockedByCompetitor: 1 });
    expect(loadAdvertiserIdentity).toHaveBeenCalledWith(7);
  });

  it("por TVs escolhidas", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "devices", deviceIds: [1, 3] });
    expect(res.body.reach.tvs).toBe(2);
  });

  it("por segmento", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "segments", segmentIds: [PADARIA] });
    expect(res.body.reach.tvs).toBe(2);
  });

  it("padrões: 1 inserção, mensal", async () => {
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all" });
    expect(res.body.quote).toMatchObject({ loopInsertions: 1, period: "monthly" });
  });

  it("anunciante inexistente → 404", async () => {
    loadAdvertiserIdentity.mockResolvedValue(null);
    const res = await (await req()).post("/quotes/preview").send({ targetMode: "all", advertiserId: 7 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Anunciante não encontrado.");
  });

  it.each([[{ targetMode: "all", loopInsertions: 0 }], [{ targetMode: "all", loopInsertions: 6 }], [{ targetMode: "all", period: "semanal" }], [{ targetMode: "outro" }]])(
    "recusa %j com 400",
    async (corpo) => {
      expect((await (await req()).post("/quotes/preview").send(corpo)).status).toBe(400);
    },
  );
});
```

E, para a vitrine, um teste de consulta em `artifacts/api-server/src/lib/pricing/__tests__/store-query.test.ts` no estilo de `lib/__tests__/device-feed-query.test.ts` (`.toSQL()` sem banco, com o `DATABASE_URL` fictício e o `afterAll` que o desfaz):

```ts
import { afterAll, describe, expect, it } from "vitest";

const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
afterAll(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

const { buildQuoteNetworkQuery } = await import("../store");

describe("buildQuoteNetworkQuery", () => {
  it("deixa a vitrine de fora (ela não é tela de loja para vender)", () => {
    const { sql, params } = buildQuoteNetworkQuery().toSQL();
    expect(sql).toContain('"devices"."showcase"');
    expect(params).toContain(false);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/pricing.test.ts src/lib/pricing/__tests__/store-query.test.ts` — Expected: FAIL (módulos ausentes).

- [ ] **Step 3: Schema** — `lib/db/src/schema/pricing.ts`:

```ts
import { pgTable, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Tabela de preço do admin: uma linha só (id = 1). Valores em centavos e
 * descontos em porcentagem inteira. Vazia = sem preço configurado, e o
 * sistema não mostra orçamento em lugar nenhum.
 */
export const pricingTable = pgTable(
  "pricing",
  {
    id: integer("id").primaryKey(),
    // Preço de 1 TV por mês com 1 inserção por volta.
    pricePerTvCents: integer("price_per_tv_cents").notNull(),
    // Piso por mês: venda de poucas TVs não sai barata demais. 0 = sem piso.
    minMonthlyCents: integer("min_monthly_cents").notNull().default(0),
    quarterlyDiscountPct: integer("quarterly_discount_pct").notNull().default(0),
    annualDiscountPct: integer("annual_discount_pct").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  // Linha única: a rota sempre grava id = 1, e o banco recusa outra.
  (t) => [check("pricing_single_row", sql`${t.id} = 1`)],
);
```

Acrescente `export * from "./pricing";` ao fim de `lib/db/src/schema/index.ts`. Gere a migração e confira que o `.sql` novo só tem o `CREATE TABLE "pricing"` (com o `CONSTRAINT ... CHECK`). Se a versão do drizzle não suportar `check`, remova-o do schema e acrescente ao fim do SQL gerado `ALTER TABLE "pricing" ADD CONSTRAINT "pricing_single_row" CHECK ("id" = 1);`.

- [ ] **Step 4: Store** — `artifacts/api-server/src/lib/pricing/store.ts`:

```ts
import { eq } from "drizzle-orm";
import { db, pricingTable, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import type { NetworkDevice } from "../ad-eligibility";
import type { Pricing } from "./quote";

const LINHA = 1;

export type PricingRow = Pricing & { updatedAt: Date };

export async function loadPricing(): Promise<PricingRow | null> {
  const [row] = await db
    .select({
      pricePerTvCents: pricingTable.pricePerTvCents,
      minMonthlyCents: pricingTable.minMonthlyCents,
      quarterlyDiscountPct: pricingTable.quarterlyDiscountPct,
      annualDiscountPct: pricingTable.annualDiscountPct,
      updatedAt: pricingTable.updatedAt,
    })
    .from(pricingTable)
    .where(eq(pricingTable.id, LINHA));
  return row ?? null;
}

/** Cria ou atualiza a linha única. */
export async function savePricing(p: Pricing): Promise<PricingRow> {
  const [row] = await db
    .insert(pricingTable)
    .values({ id: LINHA, ...p })
    .onConflictDoUpdate({ target: pricingTable.id, set: { ...p, updatedAt: new Date() } })
    .returning({
      pricePerTvCents: pricingTable.pricePerTvCents,
      minMonthlyCents: pricingTable.minMonthlyCents,
      quarterlyDiscountPct: pricingTable.quarterlyDiscountPct,
      annualDiscountPct: pricingTable.annualDiscountPct,
      updatedAt: pricingTable.updatedAt,
    });
  return row!;
}

/**
 * TVs que entram na conta do orçamento: a rede sem a vitrine. A vitrine é
 * espelhada na landing, não é tela de loja — vender espaço nela seria cobrar
 * por uma TV que não existe na parede de ninguém.
 */
export function buildQuoteNetworkQuery() {
  return db
    .select({ id: devicesTable.id, companyId: clientsTable.companyId, segmentId: companiesTable.segmentId })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.showcase, false));
}

export async function loadQuoteNetwork(): Promise<NetworkDevice[]> {
  return buildQuoteNetworkQuery();
}
```

- [ ] **Step 5: Rotas** — `artifacts/api-server/src/routes/pricing.ts`:

```ts
import { Router, type IRouter } from "express";
import { z } from "zod";
import { previewReach } from "../lib/ad-eligibility";
import { loadAdvertiserIdentity } from "../lib/campaigns/reach";
import { loadPricing, loadQuoteNetwork, savePricing } from "../lib/pricing/store";
import { QUOTE_PERIODS, quote, type QuotePeriod } from "../lib/pricing/quote";

/**
 * Tabela de preço e orçamento — só admin (registrado depois de requireAdmin).
 * O preço nunca sai em rota pública: o cliente pede proposta e o admin vê o
 * valor (sub-projetos B e C).
 */
const router: IRouter = Router();

const CENTAVOS_MAX = 100_000_000; // R$ 1 milhão

const centavos = z.number().int("Use valores em centavos inteiros.").min(0, "Valor não pode ser negativo.").max(CENTAVOS_MAX, "Valor acima de R$ 1.000.000.");
const desconto = z.number().int("Desconto em porcentagem inteira.").min(0, "Desconto entre 0% e 90%.").max(90, "Desconto entre 0% e 90%.");

const pricingInput = z.object({
  pricePerTvCents: centavos,
  minMonthlyCents: centavos,
  quarterlyDiscountPct: desconto,
  annualDiscountPct: desconto,
});

const quoteInput = z.object({
  targetMode: z.enum(["all", "devices", "segments"]),
  deviceIds: z.array(z.number().int().positive()).default([]),
  segmentIds: z.array(z.number().int().positive()).default([]),
  advertiserId: z.number().int().positive().optional(),
  loopInsertions: z.number().int().min(1).max(5).default(1),
  period: z.enum(QUOTE_PERIODS as [QuotePeriod, ...QuotePeriod[]]).default("monthly"),
});

function primeiraMensagem(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

router.get("/pricing", async (_req, res): Promise<void> => {
  res.json(await loadPricing());
});

router.put("/pricing", async (req, res): Promise<void> => {
  const parsed = pricingInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: primeiraMensagem(parsed.error) });
    return;
  }
  res.json(await savePricing(parsed.data));
});

router.post("/quotes/preview", async (req, res): Promise<void> => {
  const parsed = quoteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos." });
    return;
  }
  const { advertiserId, loopInsertions, period, ...target } = parsed.data;

  const pricing = await loadPricing();
  // Sem preço configurado não há orçamento: quem chama esconde o valor.
  if (!pricing) {
    res.json({ available: false });
    return;
  }

  let identity = { advertiserSegmentId: null as number | null, advertiserCompanyId: null as number | null };
  if (advertiserId !== undefined) {
    const advertiser = await loadAdvertiserIdentity(advertiserId);
    if (!advertiser) {
      res.status(404).json({ error: "Anunciante não encontrado." });
      return;
    }
    identity = { advertiserSegmentId: advertiser.segmentId, advertiserCompanyId: advertiser.companyId };
  }

  // Mesma conta da prévia de alcance do formulário de campanha.
  const reach = previewReach({ ...target, ...identity }, await loadQuoteNetwork());
  res.json({
    available: true,
    reach: { tvs: reach.reachedCount, blockedByCompetitor: reach.competitorDeviceIds.length },
    quote: quote(pricing, { tvs: reach.reachedCount, loopInsertions, period }),
  });
});

export default router;
```

Notas: `previewReach` marca como concorrente qualquer TV bloqueada da rede inteira (não só do alvo) — `blockedByCompetitor` usa esse número, igual ao que o formulário mostra hoje. Se o tipo `CampaignTarget` exigir campos diferentes de `{ targetMode, deviceIds, segmentIds }`, ajuste o objeto passado, não a regra.

Em `routes/index.ts`: `import pricingRouter from "./pricing";` e `router.use(pricingRouter);` logo depois de `router.use(campaignReachRouter);` (dentro do bloco de `requireAdmin`).

- [ ] **Step 6: Run** os testes do Step 2, a suíte da API (`pnpm --filter @workspace/api-server exec vitest run`) e `pnpm -w run typecheck` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/pricing.ts lib/db/src/schema/index.ts lib/db/drizzle artifacts/api-server/src/lib/pricing artifacts/api-server/src/routes/pricing.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/__tests__/pricing.test.ts
git commit -m "feat(api): tabela de preço do admin e prévia de orçamento" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dinheiro, espelho da conta e cliente HTTP no painel

**Files:**
- Create: `artifacts/signage/src/lib/money.ts`, `artifacts/signage/src/lib/pricing.ts`, `artifacts/signage/src/lib/pricing-api.ts`
- Test: `artifacts/signage/src/lib/__tests__/money.test.ts`, `artifacts/signage/src/lib/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: formato das rotas da Task 2; `request<T>(path, init?)` de `@/lib/companies-api` (lança `ApiError` com a mensagem do servidor).
- Produces:
  - `formatCents(n: number): string` → "R$ 1.234,56"; `parseReais(texto: string): number | null` → centavos ("1.234,56" → 123456; "1234,5" → 123450; "15" → 1500; "" / "abc" / "-1" → null).
  - `type Pricing`, `type QuotePeriod`, `PERIOD_MONTHS`, `quote(...)` — espelho exato da Task 1.
  - `type PricingRow = Pricing & { updatedAt: string }`; `type QuotePreview = { available: false } | { available: true; reach: { tvs: number; blockedByCompetitor: number }; quote: Quote }`.
  - `pricingQueryKey = ['pricing'] as const`; `getPricing(): Promise<PricingRow | null>`; `savePricing(p: Pricing): Promise<PricingRow>`; `previewQuote(body, signal?): Promise<QuotePreview>`.

- [ ] **Step 1: Write the failing tests**

`money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatCents, parseReais } from '../money';

describe('formatCents', () => {
  it.each([
    [0, 'R$ 0,00'],
    [1500, 'R$ 15,00'],
    [123456, 'R$ 1.234,56'],
    [5, 'R$ 0,05'],
  ])('%d → %s', (n, texto) => {
    // Intl põe espaço não separável depois de "R$"; o teste normaliza.
    expect(formatCents(n).replace(/\s/g, ' ')).toBe(texto);
  });
});

describe('parseReais', () => {
  it.each([
    ['15', 1500],
    ['15,5', 1550],
    ['1234,56', 123456],
    ['1.234,56', 123456],
    [' 150,00 ', 15000],
    ['0', 0],
  ])('%s → %d', (texto, centavos) => {
    expect(parseReais(texto)).toBe(centavos);
  });

  it.each([[''], ['abc'], ['-1'], ['1,234'], ['1.2.3']])('%s → null', (texto) => {
    expect(parseReais(texto)).toBeNull();
  });
});
```

`pricing.test.ts` — os mesmos casos de `quote.test.ts` da Task 1 (copie o arquivo trocando o import para `../pricing`): cada caso tem de dar o mesmo centavo nos dois lados.

- [ ] **Step 2: Run** `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/money.test.ts src/lib/__tests__/pricing.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementation**

`money.ts`:

```ts
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos inteiros → "R$ 1.234,56". */
export function formatCents(cents: number): string {
  return reais.format(cents / 100);
}

// Milhar com ponto opcional, vírgula decimal com 1 ou 2 casas.
const REAIS = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

/**
 * Texto em reais digitado pelo admin → centavos. Aceita "15", "15,5",
 * "1234,56" e "1.234,56"; qualquer outra coisa é null (o formulário não
 * envia). Conta em inteiros para não perder centavo com ponto flutuante.
 */
export function parseReais(texto: string): number | null {
  const limpo = texto.trim();
  if (!REAIS.test(limpo)) return null;
  const [inteiro, decimal = ''] = limpo.replace(/\./g, '').split(',');
  return Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
}
```

`pricing.ts`: cópia exata do conteúdo de `artifacts/api-server/src/lib/pricing/quote.ts` (Task 1), com o comentário do topo trocado por: "Espelho de artifacts/api-server/src/lib/pricing/quote.ts — mudou lá, mude aqui. O exemplo ao vivo da página Preços usa esta conta; os testes dos dois lados são os mesmos casos."

`pricing-api.ts`:

```ts
import { request } from '@/lib/companies-api';
import type { Pricing, Quote, QuotePeriod } from '@/lib/pricing';

export type PricingRow = Pricing & { updatedAt: string };

export type QuotePreview =
  | { available: false }
  | { available: true; reach: { tvs: number; blockedByCompetitor: number }; quote: Quote };

export type QuotePreviewInput = {
  targetMode: 'all' | 'devices' | 'segments';
  deviceIds: number[];
  segmentIds: number[];
  advertiserId?: number;
  loopInsertions: number;
  period: QuotePeriod;
};

export const pricingQueryKey = ['pricing'] as const;

export const getPricing = () => request<PricingRow | null>('/pricing');

export const savePricing = (p: Pricing) =>
  request<PricingRow>('/pricing', { method: 'PUT', body: JSON.stringify(p) });

export const previewQuote = (body: QuotePreviewInput, signal?: AbortSignal) =>
  request<QuotePreview>('/quotes/preview', { method: 'POST', body: JSON.stringify(body), signal });
```

- [ ] **Step 4: Run** o comando do Step 2 — Expected: PASS. Depois `pnpm -w run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/lib/money.ts artifacts/signage/src/lib/pricing.ts artifacts/signage/src/lib/pricing-api.ts artifacts/signage/src/lib/__tests__/money.test.ts artifacts/signage/src/lib/__tests__/pricing.test.ts
git commit -m "feat(portal): conta do orçamento e formato de reais no painel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Página "Preços" no admin

**Files:**
- Create: `artifacts/signage/src/pages/pricing.tsx`
- Modify: `artifacts/signage/src/App.tsx` (rota `/precos`), `artifacts/signage/src/components/nav-config.ts`
- Test: `artifacts/signage/src/pages/__tests__/pricing.test.tsx`, `artifacts/signage/src/components/__tests__/nav-config.test.ts`

**Interfaces:**
- Consumes: `getPricing`, `savePricing`, `pricingQueryKey` (Task 3); `formatCents`, `parseReais` (Task 3); `quote` (Task 3); `useToast` (`@/hooks/use-toast`).
- Produces: página default export `Pricing` em `/precos`; item de menu `{ href: '/precos', label: 'Preços', icon: BadgeDollarSign }` no grupo Comercial, depois de Segmentos.

- [ ] **Step 1: Write the failing tests**

Em `nav-config.test.ts`, atualize a lista de hrefs esperada do admin para `['/', '/parque', '/avisos', '/companies', '/segments', '/precos', '/admin', '/panels', '/divulgacao', '/users-admin']`.

`pages/__tests__/pricing.test.tsx` (siga o render com `QueryClientProvider` e `Toaster` dos testes de página vizinhos, ex. `pages/__tests__/fleet.test.tsx`; mocke `fetch` com `vi.stubGlobal`):

```tsx
// Casos (escreva cada um completo no estilo dos testes vizinhos):
// 1. GET /pricing → null: campos vazios e a dica
//    "Hoje a landing anuncia R$ 150 por mês para a rede toda." visível.
// 2. GET /pricing → { pricePerTvCents: 1500, minMonthlyCents: 5000,
//    quarterlyDiscountPct: 10, annualDiscountPct: 20, updatedAt }:
//    campos "Preço por TV por mês" = "15,00", "Valor mínimo por mês" = "50,00",
//    "Desconto trimestral (%)" = "10", "Desconto anual (%)" = "20"; sem a dica.
// 3. Exemplo ao vivo com esses valores: texto
//    "10 TVs × 2 inserções, anual: R$ 240,00 por mês (R$ 2.880,00 no ano)"
//    (1500×10×2 = 30000; 20% → 24000; ×12 = 288000). Mudar o preço para "20"
//    atualiza para "R$ 320,00 por mês (R$ 3.840,00 no ano)".
// 4. Salvar: digitar "1.234,56" no preço, "0" no mínimo, "10" e "20" →
//    clicar "Salvar preços" → um PUT /api/pricing com corpo
//    { pricePerTvCents: 123456, minMonthlyCents: 0, quarterlyDiscountPct: 10, annualDiscountPct: 20 }
//    e toast "Preços salvos.".
// 5. Valor inválido ("abc" no preço): botão "Salvar preços" desabilitado e
//    texto "Valor inválido." junto do campo; nenhum PUT.
// 6. Erro do servidor (PUT → 400 { error: "Desconto entre 0% e 90%." }):
//    toast com essa mensagem e os campos mantêm o digitado.
```

- [ ] **Step 2: Run** `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/pricing.test.tsx src/components/__tests__/nav-config.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementation**

`nav-config.ts`: importe `BadgeDollarSign` do `lucide-react` e acrescente `{ href: '/precos', label: 'Preços', icon: BadgeDollarSign }` ao grupo Comercial, depois de Segmentos.

`App.tsx`: `import Pricing from './pages/pricing';` e, junto das outras rotas do admin (perto de `/avisos`):

```tsx
      <Route path="/precos">
        <Layout><Pricing /></Layout>
      </Route>
```

(Siga exatamente o embrulho que as rotas vizinhas usam — se elas passam por um guarda de admin, use o mesmo.)

`pages/pricing.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatCents, parseReais } from '@/lib/money';
import { quote, type Pricing as Tabela } from '@/lib/pricing';
import { getPricing, pricingQueryKey, savePricing } from '@/lib/pricing-api';

// Exemplo fixo do quadro "como fica": o admin enxerga a conta sem montar campanha.
const EXEMPLO = { tvs: 10, loopInsertions: 2, period: 'annual' as const };

type Campos = { preco: string; minimo: string; trimestral: string; anual: string };

const VAZIO: Campos = { preco: '', minimo: '', trimestral: '', anual: '' };

function centavosParaTexto(n: number): string {
  return (n / 100).toFixed(2).replace('.', ',');
}

function porcentagem(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n <= 90 ? n : null;
}

/** Campos digitados → tabela, ou null se algum estiver inválido. */
function lerTabela(c: Campos): Tabela | null {
  const pricePerTvCents = parseReais(c.preco);
  const minMonthlyCents = c.minimo.trim() === '' ? 0 : parseReais(c.minimo);
  const quarterlyDiscountPct = c.trimestral.trim() === '' ? 0 : porcentagem(c.trimestral);
  const annualDiscountPct = c.anual.trim() === '' ? 0 : porcentagem(c.anual);
  if (pricePerTvCents === null || minMonthlyCents === null || quarterlyDiscountPct === null || annualDiscountPct === null) return null;
  return { pricePerTvCents, minMonthlyCents, quarterlyDiscountPct, annualDiscountPct };
}

export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: pricingQueryKey, queryFn: getPricing });
  const [campos, setCampos] = useState<Campos>(VAZIO);

  // Preenche uma vez quando a tabela chega (ou fica vazio se não há preço).
  useEffect(() => {
    if (!data) return;
    setCampos({
      preco: centavosParaTexto(data.pricePerTvCents),
      minimo: centavosParaTexto(data.minMonthlyCents),
      trimestral: String(data.quarterlyDiscountPct),
      anual: String(data.annualDiscountPct),
    });
  }, [data]);

  const tabela = lerTabela(campos);
  const exemplo = tabela ? quote(tabela, EXEMPLO) : null;

  const salvar = useMutation({
    mutationFn: savePricing,
    onSuccess: (row) => {
      queryClient.setQueryData(pricingQueryKey, row);
      toast({ title: 'Preços salvos.' });
    },
    onError: (err: Error) => toast({ title: err.message, variant: 'destructive' }),
  });

  const campo = (id: keyof Campos, label: string, invalido: boolean) => (
    <div className="space-y-2">
      <Label htmlFor={`preco-${id}`}>{label}</Label>
      <Input
        id={`preco-${id}`}
        inputMode="decimal"
        value={campos[id]}
        onChange={(e) => setCampos((c) => ({ ...c, [id]: e.target.value }))}
      />
      {invalido ? <p className="text-xs text-destructive">Valor inválido.</p> : null}
    </div>
  );

  const precoInvalido = campos.preco.trim() !== '' && parseReais(campos.preco) === null;
  const minimoInvalido = campos.minimo.trim() !== '' && parseReais(campos.minimo) === null;
  const triInvalido = campos.trimestral.trim() !== '' && porcentagem(campos.trimestral) === null;
  const anualInvalido = campos.anual.trim() !== '' && porcentagem(campos.anual) === null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Preços</h1>
        <p className="mt-1 text-muted-foreground">
          Base do valor de tabela das campanhas e das propostas. Só o admin vê estes valores.
        </p>
      </div>

      {!isLoading && data === null ? (
        <p className="mb-4 rounded-md border p-3 text-sm text-muted-foreground">
          Hoje a landing anuncia R$ 150 por mês para a rede toda.
        </p>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Tabela</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (tabela) salvar.mutate(tabela);
            }}
          >
            {campo('preco', 'Preço por TV por mês', precoInvalido)}
            {campo('minimo', 'Valor mínimo por mês', minimoInvalido)}
            {campo('trimestral', 'Desconto trimestral (%)', triInvalido)}
            {campo('anual', 'Desconto anual (%)', anualInvalido)}
            <p className="text-sm text-muted-foreground md:col-span-2" data-testid="exemplo-preco">
              {exemplo
                ? `${EXEMPLO.tvs} TVs × ${EXEMPLO.loopInsertions} inserções, anual: ${formatCents(exemplo.monthlyCents)} por mês (${formatCents(exemplo.totalCents)} no ano)`
                : 'Preencha o preço por TV para ver um exemplo.'}
            </p>
            <div className="md:col-span-2">
              <Button type="submit" disabled={!tabela || salvar.isPending}>Salvar preços</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

`formatCents` usa espaço não separável depois de "R$"; nos testes de texto, normalize com `.replace(/\s/g, ' ')` ou use `toHaveTextContent` com regex.

- [ ] **Step 4: Run** o comando do Step 2, depois a suíte web e `pnpm -w run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/pages/pricing.tsx artifacts/signage/src/pages/__tests__/pricing.test.tsx artifacts/signage/src/App.tsx artifacts/signage/src/components/nav-config.ts artifacts/signage/src/components/__tests__/nav-config.test.ts
git commit -m "feat(portal): página de preços do admin" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "Valor de tabela" no formulário de campanha

**Files:**
- Create: `artifacts/signage/src/components/use-quote-preview.ts`
- Modify: `artifacts/signage/src/components/campaign-form-dialog.tsx`
- Test: `artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `previewQuote`, `QuotePreview` (Task 3); `formatCents` (Task 3); `REACH_PREVIEW_DEBOUNCE_MS` de `use-reach-preview.ts`; `useCampaignForm` (`selectedAdvertiser`, `targetMode`, `selectedDevices`, `selectedSegments`, `loopInsertions`).
- Produces: `useQuotePreview(input: { advertiserId: number | null; targetMode; deviceIds: number[]; segmentIds: number[]; loopInsertions: number }, enabled: boolean): Extract<QuotePreview, { available: true }> | null`; linha `data-testid="table-price"` no formulário.

- [ ] **Step 1: Write the failing tests** — em `campaign-form-dialog.test.tsx`, novos casos (o mock de `fetch` passa a responder por URL):

```tsx
  function fetchPorUrl(quotePreview: unknown) {
    return vi.fn((url: string) =>
      url.includes('/quotes/preview') ? json(200, quotePreview) : json(200, preview()),
    );
  }

  it('mostra o valor de tabela com preço configurado', async () => {
    vi.stubGlobal('fetch', fetchPorUrl({
      available: true,
      reach: { tvs: 1, blockedByCompetitor: 1 },
      quote: { tvs: 1, loopInsertions: 1, period: 'monthly', months: 1, monthlyListCents: 5000, discountPct: 0, monthlyCents: 5000, totalCents: 5000, savingsCents: 0, minimumApplied: true },
    }));
    renderDialog();
    const linha = await screen.findByTestId('table-price');
    expect(linha.textContent?.replace(/\s/g, ' ')).toContain('Valor de tabela: R$ 50,00/mês');
    expect(linha).toHaveTextContent('mínimo aplicado');
  });

  it('sem preço configurado não mostra valor', async () => {
    const fetchMock = fetchPorUrl({ available: false });
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    await screen.findByTestId('reach-summary');
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/quotes/preview'))).toBe(true));
    expect(screen.queryByTestId('table-price')).not.toBeInTheDocument();
  });

  it('resposta que não é de orçamento é ignorada (não quebra)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    await screen.findByTestId('reach-summary');
    expect(screen.queryByTestId('table-price')).not.toBeInTheDocument();
  });

  it('pede o orçamento com as inserções e o anunciante do formulário', async () => {
    const fetchMock = fetchPorUrl({ available: false });
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    await userEvent.selectOptions(await screen.findByLabelText('Inserções por volta'), '3');
    await waitFor(() => {
      const pedidos = fetchMock.mock.calls.filter(([u]) => String(u).includes('/quotes/preview'));
      const ultimo = JSON.parse(String((pedidos.at(-1)![1] as RequestInit).body));
      expect(ultimo).toMatchObject({ advertiserId: 3, loopInsertions: 3, period: 'monthly' });
    });
  });
```

(`json`, `preview` e `renderDialog` já existem no arquivo; o `renderDialog` usa `lockedAdvertiserId={3}`.)

- [ ] **Step 2: Run** `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/campaign-form-dialog.test.tsx` — Expected: FAIL nos casos novos.

- [ ] **Step 3: Implementation**

`use-quote-preview.ts`:

```ts
import { useEffect, useState } from 'react';
import type { CampaignTargetMode } from '@/components/use-campaign-form';
import { REACH_PREVIEW_DEBOUNCE_MS } from '@/components/use-reach-preview';
import { previewQuote, type QuotePreview } from '@/lib/pricing-api';

type Disponivel = Extract<QuotePreview, { available: true }>;

/**
 * Valor de tabela da campanha que o admin está montando, calculado pela API
 * com o preço configurado. Mesmo cuidado da prévia de alcance: espera o admin
 * parar de mexer, cancela a pergunta anterior e qualquer falha (ou resposta
 * fora do formato) vira null — o valor ajuda a vender, nunca impede salvar.
 */
export function useQuotePreview(
  input: { advertiserId: number | null; targetMode: CampaignTargetMode; deviceIds: number[]; segmentIds: number[]; loopInsertions: number },
  enabled: boolean,
): Disponivel | null {
  const [preview, setPreview] = useState<Disponivel | null>(null);
  const body = JSON.stringify(input);

  useEffect(() => {
    if (!enabled || input.advertiserId === null) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await previewQuote(
          {
            targetMode: input.targetMode,
            deviceIds: input.deviceIds,
            segmentIds: input.segmentIds,
            advertiserId: input.advertiserId!,
            loopInsertions: input.loopInsertions,
            period: 'monthly',
          },
          controller.signal,
        );
        const ok = data && (data as Disponivel).available === true && typeof (data as Disponivel).quote?.monthlyCents === 'number';
        if (!controller.signal.aborted) setPreview(ok ? (data as Disponivel) : null);
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

Se `request` de `companies-api` não repassar `signal` (ele espalha `...init`, então repassa), mantenha; se o `targetMode` do formulário usar outro nome de tipo, importe o mesmo que `use-reach-preview.ts` usa.

`campaign-form-dialog.tsx`:
- importe `useQuotePreview` e `formatCents`;
- em `CampaignFormDialog`, logo abaixo de `const preview = useReachPreview(...)`:

```tsx
  const tablePrice = useQuotePreview(
    {
      advertiserId: form.selectedAdvertiser,
      targetMode: form.targetMode,
      deviceIds: form.selectedDevices,
      segmentIds: form.selectedSegments,
      loopInsertions: form.loopInsertions,
    },
    open,
  );
```

- logo depois de `<CampaignLoopInsertionsPicker form={form} />` (linha ~327):

```tsx
          {tablePrice ? (
            <p className="text-sm text-muted-foreground" data-testid="table-price">
              Valor de tabela: <strong>{formatCents(tablePrice.quote.monthlyCents)}/mês</strong>
              {tablePrice.quote.minimumApplied ? ' (mínimo aplicado)' : ''}
            </p>
          ) : null}
```

- [ ] **Step 4: Run** o comando do Step 2 (arquivo inteiro), a suíte web e `pnpm -w run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/use-quote-preview.ts artifacts/signage/src/components/campaign-form-dialog.tsx artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx
git commit -m "feat(portal): valor de tabela no formulário de campanha" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Verificação final (controlador)

- `pnpm -w run typecheck`; suítes da API e do web inteiras.
- Migração nova só com o `CREATE TABLE "pricing"` (e o `CHECK`).
- PR: `feat(api): tabela de preço e cálculo de orçamento`.
