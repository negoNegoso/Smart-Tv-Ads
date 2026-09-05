# Portais analíticos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar os portais de cliente e anunciante de tabelas acumuladas em painéis com filtro de período, evolução diária, comparação com o período anterior e relatório imprimível.

**Architecture:** Dois endpoints novos de overview (agregado + série diária) ficam separados das rotas de lista já existentes, que apenas ganham o mesmo parâmetro `?days`. No frontend, as duas páginas passam a ser composição dos mesmos blocos em `components/portal/`. A matemática de janela e o preenchimento da série são funções puras, testáveis sem banco — que é como o resto do repositório testa qualquer coisa que toque `@workspace/db`.

**Tech Stack:** Express + Drizzle + Postgres (Neon) no backend; React + wouter + TanStack Query + Recharts + Tailwind + shadcn/ui no frontend; Vitest + supertest no backend; Vitest + Testing Library + jsdom no frontend (adicionados na Task 6).

**Spec:** `docs/superpowers/specs/2026-09-05-portais-analiticos-design.md`

## Global Constraints

- Fuso do negócio: `America/Sao_Paulo`, sempre via `BUSINESS_TIME_ZONE` importado de `src/lib/ad-eligibility.ts`. Nunca `getDay()`/`getDate()` local do servidor.
- `days` aceita **somente** `7`, `30` ou `90`. Qualquer outro valor → HTTP **400**. Ausente → `30`, em **todas** as rotas do portal, listas incluídas. Não existe caminho acumulado: um período governa a página inteira.
- `contractValue` **nunca** sai por rota de portal.
- Escopo por sessão: overview do anunciante recebe apenas `req.auth.advertiserIds`; do cliente, apenas `req.auth.clientIds`. Admin sem vínculo recebe listas vazias, como já acontece hoje.
- `scans.is_bot = true` fica fora de qualquer contagem de `scans` e `uniqueVisitors`.
- Nenhuma dependência nova no backend. No frontend, as únicas adições permitidas são as devDeps de teste da Task 6 — Recharts (`^2.15.2`) e `components/ui/chart.tsx` já existem.
- Testes nunca abrem conexão com banco. Tudo que importa `@workspace/db` é mockado; o que é testado de verdade são funções puras.
- Texto de interface em português do Brasil, como o resto do app.
- Ao final de cada task: `pnpm --filter api-server run typecheck` e `pnpm --filter signage run typecheck` passam.

---

### Task 1: Índices compostos em `plays`

`plays` é a maior tabela do banco e só tem índice em `created_at`. Toda troca de período no portal filtra por campanha (ou device) **e** intervalo; sem índice composto, cada clique é sequential scan.

**Files:**
- Modify: `lib/db/src/schema/plays.ts`
- Create: `lib/db/drizzle/0005_*.sql` (nome gerado pelo drizzle-kit)
- Modify: `lib/db/drizzle/meta/_journal.json` e `meta/0005_snapshot.json` (gerados)

**Interfaces:**
- Consumes: nada.
- Produces: os índices `plays_campaign_created_idx` e `plays_device_created_idx`, consumidos implicitamente pelas queries da Task 4.

- [ ] **Step 1: Adicionar os índices ao schema**

Em `lib/db/src/schema/plays.ts`, substitua o array de índices:

```ts
  // plays é a tabela que mais cresce (uma linha por exibição por tela) e a
  // contagem de 30 dias da landing roda sem sessão. Sem este índice, qualquer
  // requisição que escape do CDN é um sequential scan na maior tabela.
  //
  // Os dois compostos servem os portais: lá o filtro é sempre "esta campanha
  // (ou esta TV) dentro desta janela", e o índice só de created_at obrigaria a
  // ler todas as exibições do período para depois descartar as de outros.
  (t) => [
    index("plays_created_idx").on(t.createdAt),
    index("plays_campaign_created_idx").on(t.campaignId, t.createdAt),
    index("plays_device_created_idx").on(t.deviceId, t.createdAt),
  ],
```

- [ ] **Step 2: Gerar a migração**

Run: `pnpm --filter db run generate`

Expected: cria `lib/db/drizzle/0005_<nome>.sql` e atualiza `meta/_journal.json`.

- [ ] **Step 3: Conferir o SQL gerado**

Run: `cat lib/db/drizzle/0005_*.sql`

Expected: dois `CREATE INDEX`, um em `("campaign_id","created_at")` e outro em `("device_id","created_at")`, ambos na tabela `plays`. Nenhum `DROP`, nenhum `ALTER TABLE` de coluna. Se aparecer qualquer outra coisa, o schema divergiu do banco — pare e investigue antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/plays.ts lib/db/drizzle
git commit -m "perf(db): índices compostos de plays por campanha e device"
```

---

### Task 2: Janela de período (`period.ts`)

Toda a aritmética de calendário do portal, isolada e sem banco. É a regra que erra em silêncio: um dia deslocado não quebra nada, só mente na tela.

**Files:**
- Create: `artifacts/api-server/src/lib/portal/period.ts`
- Test: `artifacts/api-server/src/lib/portal/__tests__/period.test.ts`

**Interfaces:**
- Consumes: `BUSINESS_TIME_ZONE` de `src/lib/ad-eligibility.ts`.
- Produces:
  - `type PortalDays = 7 | 30 | 90`
  - `const PORTAL_DAYS: readonly PortalDays[]`
  - `const DEFAULT_PORTAL_DAYS: PortalDays`
  - `parseDays(raw: unknown): PortalDays | null`
  - `businessDayKey(instant: Date, timeZone?: string): string`
  - `dayKeysEndingAt(instant: Date, days: number, timeZone?: string): string[]`
  - `startOfBusinessDay(key: string, timeZone?: string): Date`
  - `interface PortalPeriod { days: PortalDays; from: Date; to: Date; keys: string[] }`
  - `portalPeriod(days: PortalDays, now?: Date, timeZone?: string): PortalPeriod`
  - `previousPortalPeriod(days: PortalDays, now?: Date, timeZone?: string): PortalPeriod`

- [ ] **Step 1: Escrever os testes que falham**

Crie `artifacts/api-server/src/lib/portal/__tests__/period.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTAL_DAYS,
  businessDayKey,
  dayKeysEndingAt,
  parseDays,
  portalPeriod,
  previousPortalPeriod,
  startOfBusinessDay,
} from "../period";

describe("parseDays", () => {
  it("aceita os três presets, como número ou string", () => {
    expect(parseDays(7)).toBe(7);
    expect(parseDays("30")).toBe(30);
    expect(parseDays(90)).toBe(90);
  });

  it("cai no padrão quando ausente", () => {
    expect(parseDays(undefined)).toBe(DEFAULT_PORTAL_DAYS);
    expect(parseDays("")).toBe(DEFAULT_PORTAL_DAYS);
  });

  // Enum fechado, não número livre: 3650 seria uma varredura de dez anos na
  // maior tabela do banco, disparada por quem só sabe editar a URL.
  it("recusa qualquer outro valor", () => {
    expect(parseDays(1)).toBeNull();
    expect(parseDays(31)).toBeNull();
    expect(parseDays(3650)).toBeNull();
    expect(parseDays("trinta")).toBeNull();
    expect(parseDays(-30)).toBeNull();
  });
});

describe("businessDayKey", () => {
  // 2026-09-05T23:30Z é 20h30 de 5 de setembro em São Paulo: mesmo dia.
  it("usa a data local do negócio, não a UTC", () => {
    expect(businessDayKey(new Date("2026-09-05T23:30:00.000Z"))).toBe("2026-09-05");
  });

  // 2026-09-06T02:00Z é 23h de 5 de setembro em São Paulo. Em UTC já é dia 6;
  // para quem assiste à TV, ainda é dia 5.
  it("não adianta o dia depois das 21h de Brasília", () => {
    expect(businessDayKey(new Date("2026-09-06T02:00:00.000Z"))).toBe("2026-09-05");
  });
});

describe("dayKeysEndingAt", () => {
  it("devolve exatamente `days` chaves, em ordem, terminando no dia local", () => {
    const keys = dayKeysEndingAt(new Date("2026-09-05T15:00:00.000Z"), 7);
    expect(keys).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01",
      "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });

  it("atravessa a virada de mês", () => {
    const keys = dayKeysEndingAt(new Date("2026-03-02T15:00:00.000Z"), 3);
    expect(keys).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("devolve 90 chaves distintas para o preset maior", () => {
    const keys = dayKeysEndingAt(new Date("2026-09-05T15:00:00.000Z"), 90);
    expect(keys).toHaveLength(90);
    expect(new Set(keys).size).toBe(90);
  });
});

describe("startOfBusinessDay", () => {
  // Meia-noite em São Paulo (UTC-3) é 03:00Z do mesmo dia.
  it("devolve o instante em que a data local começa", () => {
    expect(startOfBusinessDay("2026-09-05").toISOString()).toBe("2026-09-05T03:00:00.000Z");
  });
});

describe("portalPeriod", () => {
  const now = new Date("2026-09-05T15:00:00.000Z");

  it("cobre `days` dias terminando hoje", () => {
    const period = portalPeriod(7, now);
    expect(period.days).toBe(7);
    expect(period.keys).toHaveLength(7);
    expect(period.keys.at(-1)).toBe("2026-09-05");
    expect(period.from.toISOString()).toBe("2026-08-30T03:00:00.000Z");
    expect(period.to).toEqual(now);
  });
});

describe("previousPortalPeriod", () => {
  const now = new Date("2026-09-05T15:00:00.000Z");

  it("cobre a janela imediatamente anterior, do mesmo tamanho", () => {
    const previous = previousPortalPeriod(7, now);
    expect(previous.keys).toHaveLength(7);
    expect(previous.keys[0]).toBe("2026-08-23");
    expect(previous.keys.at(-1)).toBe("2026-08-29");
  });

  // Um play na fronteira não pode entrar nos dois períodos: o delta ficaria
  // inflado dos dois lados.
  it("termina exatamente onde o período atual começa", () => {
    const current = portalPeriod(30, now);
    const previous = previousPortalPeriod(30, now);
    expect(previous.to.toISOString()).toBe(current.from.toISOString());
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter api-server exec vitest run src/lib/portal/__tests__/period.test.ts`

Expected: FAIL — `Failed to resolve import "../period"`.

- [ ] **Step 3: Implementar**

Crie `artifacts/api-server/src/lib/portal/period.ts`:

```ts
// artifacts/api-server/src/lib/portal/period.ts
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";

/**
 * O filtro de período do portal é um enum fechado, não um número livre.
 * `?days=3650` seria uma varredura de dez anos na maior tabela do banco,
 * disparada por quem só sabe editar a barra de endereços.
 */
export type PortalDays = 7 | 30 | 90;
export const PORTAL_DAYS: readonly PortalDays[] = [7, 30, 90];
export const DEFAULT_PORTAL_DAYS: PortalDays = 30;

/** Devolve o preset pedido, o padrão quando ausente, e `null` no resto. */
export function parseDays(raw: unknown): PortalDays | null {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_PORTAL_DAYS;
  const value = Number(raw);
  return PORTAL_DAYS.find((d) => d === value) ?? null;
}

/**
 * Data local do negócio em `YYYY-MM-DD`. `en-CA` já formata nessa ordem, então
 * não é preciso remontar a string parte por parte.
 */
export function businessDayKey(instant: Date, timeZone: string = BUSINESS_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * As `days` datas locais que terminam no dia de `instant`, em ordem crescente.
 *
 * A caminhada é feita em UTC ao meio-dia porque só o calendário importa aqui:
 * partindo do meio-dia, somar ou subtrair 24h nunca escorrega para o dia
 * vizinho, mesmo que o fuso mude de offset no meio do período.
 */
export function dayKeysEndingAt(
  instant: Date,
  days: number,
  timeZone: string = BUSINESS_TIME_ZONE,
): string[] {
  const [year, month, day] = businessDayKey(instant, timeZone).split("-").map(Number);
  const cursor = Date.UTC(year, month - 1, day, 12);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = new Date(cursor - i * 86_400_000);
    keys.push(`${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`);
  }
  return keys;
}

/**
 * Offset do fuso do negócio naquele instante, em milissegundos.
 *
 * Formata o instante no fuso e reinterpreta o resultado como se fosse UTC: a
 * diferença entre os dois é exatamente o offset.
 */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * O instante em que a data local `key` começa.
 *
 * O filtro precisa ser um timestamp cru, e não `(created_at AT TIME ZONE ...)`:
 * a expressão descarta os índices compostos da Task 1 e devolve a varredura
 * sequencial que eles existem para evitar.
 *
 * Duas passadas: a primeira estima o offset, a segunda o corrige caso a
 * estimativa tenha caído do outro lado de uma troca de horário de verão. O
 * Brasil não tem mais horário de verão, mas o fuso é um parâmetro.
 */
export function startOfBusinessDay(key: string, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const [year, month, day] = key.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day, 0, 0, 0);
  let ts = wall;
  for (let i = 0; i < 2; i++) {
    ts = wall - offsetMs(new Date(ts), timeZone);
  }
  return new Date(ts);
}

export interface PortalPeriod {
  days: PortalDays;
  /** Início do primeiro dia local da janela. */
  from: Date;
  /** Fim da janela: `now` no período atual, o `from` do atual no anterior. */
  to: Date;
  /** Uma chave `YYYY-MM-DD` por dia, em ordem crescente. */
  keys: string[];
}

export function portalPeriod(
  days: PortalDays,
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): PortalPeriod {
  const keys = dayKeysEndingAt(now, days, timeZone);
  return { days, from: startOfBusinessDay(keys[0], timeZone), to: now, keys };
}

/**
 * A janela imediatamente anterior, do mesmo tamanho. Termina exatamente onde a
 * atual começa — um play na fronteira em ambos os lados inflaria o delta duas
 * vezes.
 */
export function previousPortalPeriod(
  days: PortalDays,
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): PortalPeriod {
  const all = dayKeysEndingAt(now, days * 2, timeZone);
  const keys = all.slice(0, days);
  return {
    days,
    from: startOfBusinessDay(keys[0], timeZone),
    to: startOfBusinessDay(all[days], timeZone),
    keys,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter api-server exec vitest run src/lib/portal/__tests__/period.test.ts`

Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/portal/period.ts artifacts/api-server/src/lib/portal/__tests__/period.test.ts
git commit -m "feat(portal): janela de período no fuso do negócio"
```

---

### Task 3: Preenchimento da série (`series.ts`)

O banco só devolve linha para dia que teve evento. Um dia sem exibição é informação — a TV ficou muda — e omitir o ponto faz o gráfico interpolar por cima do buraco e esconder a falha.

**Files:**
- Create: `artifacts/api-server/src/lib/portal/series.ts`
- Test: `artifacts/api-server/src/lib/portal/__tests__/series.test.ts`

**Interfaces:**
- Consumes: nada (função pura, sem imports do projeto).
- Produces: `fillSeries<K extends string>(keys: string[], rows: SeriesRow<K>[], metrics: readonly K[]): SeriesPoint<K>[]`, onde `SeriesRow<K> = { day: string } & Record<K, number>` e `SeriesPoint<K> = { date: string } & Record<K, number>`. Consumido pela Task 4.

- [ ] **Step 1: Escrever os testes que falham**

Crie `artifacts/api-server/src/lib/portal/__tests__/series.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fillSeries } from "../series";

const KEYS = ["2026-09-01", "2026-09-02", "2026-09-03"];

describe("fillSeries", () => {
  it("devolve um ponto por chave, na ordem das chaves", () => {
    const out = fillSeries(KEYS, [{ day: "2026-09-02", plays: 5 }], ["plays"]);
    expect(out.map((p) => p.date)).toEqual(KEYS);
  });

  // Dia mudo é informação, não buraco: sem o zero o gráfico liga o dia 1 ao
  // dia 3 com uma reta e a TV parece ter rodado o tempo todo.
  it("preenche com zero os dias sem linha no banco", () => {
    const out = fillSeries(KEYS, [{ day: "2026-09-02", plays: 5 }], ["plays"]);
    expect(out).toEqual([
      { date: "2026-09-01", plays: 0 },
      { date: "2026-09-02", plays: 5 },
      { date: "2026-09-03", plays: 0 },
    ]);
  });

  it("preenche todas as métricas pedidas", () => {
    const rows = [{ day: "2026-09-01", plays: 10, scans: 2, uniqueVisitors: 2 }];
    const out = fillSeries(KEYS, rows, ["plays", "scans", "uniqueVisitors"]);
    expect(out[0]).toEqual({ date: "2026-09-01", plays: 10, scans: 2, uniqueVisitors: 2 });
    expect(out[1]).toEqual({ date: "2026-09-02", plays: 0, scans: 0, uniqueVisitors: 0 });
  });

  // Defesa contra desalinhamento de fuso entre a query e as chaves: uma linha
  // fora da janela deve sumir, não deslocar o gráfico.
  it("ignora linhas cujo dia não está entre as chaves", () => {
    const out = fillSeries(KEYS, [{ day: "2026-08-31", plays: 99 }], ["plays"]);
    expect(out.every((p) => p.plays === 0)).toBe(true);
  });

  it("devolve tudo zerado quando não há linha nenhuma", () => {
    const out = fillSeries(KEYS, [], ["plays"]);
    expect(out).toEqual([
      { date: "2026-09-01", plays: 0 },
      { date: "2026-09-02", plays: 0 },
      { date: "2026-09-03", plays: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter api-server exec vitest run src/lib/portal/__tests__/series.test.ts`

Expected: FAIL — `Failed to resolve import "../series"`.

- [ ] **Step 3: Implementar**

Crie `artifacts/api-server/src/lib/portal/series.ts`:

```ts
// artifacts/api-server/src/lib/portal/series.ts

export type SeriesRow<K extends string> = { day: string } & Record<K, number>;
export type SeriesPoint<K extends string> = { date: string } & Record<K, number>;

/**
 * Casa as linhas agregadas do banco com o calendário completo da janela.
 *
 * O banco só devolve linha para dia que teve evento. Sem este preenchimento o
 * gráfico ligaria dois dias distantes com uma reta e o dia em que a TV ficou
 * muda viraria um trecho de operação normal.
 */
export function fillSeries<K extends string>(
  keys: string[],
  rows: SeriesRow<K>[],
  metrics: readonly K[],
): SeriesPoint<K>[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  return keys.map((date) => {
    const row = byDay.get(date);
    const point = { date } as SeriesPoint<K>;
    for (const metric of metrics) {
      point[metric] = row ? Number(row[metric] ?? 0) : 0;
    }
    return point;
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter api-server exec vitest run src/lib/portal/__tests__/series.test.ts`

Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/portal/series.ts artifacts/api-server/src/lib/portal/__tests__/series.test.ts
git commit -m "feat(portal): preenchimento de dias sem evento na série"
```

---

### Task 4: Queries de overview (`overview.ts`)

**Files:**
- Create: `artifacts/api-server/src/lib/portal/overview.ts`
- Test: `artifacts/api-server/src/lib/portal/__tests__/overview-window.test.ts`

**Interfaces:**
- Consumes: `PortalDays`, `PortalPeriod`, `portalPeriod`, `previousPortalPeriod` (Task 2); `fillSeries` (Task 3); `scanRate` de `src/lib/scan-rate.ts`; `BUSINESS_TIME_ZONE` de `src/lib/ad-eligibility.ts`; `db`, `playsTable`, `scansTable`, `devicesTable`, `campaignsTable` de `@workspace/db`.
- Produces:
  - `const DEVICE_ONLINE_WINDOW_MINUTES = 5`
  - `onlineSince(now: Date): Date`
  - `interface AdvertiserOverview` e `interface ClientOverview` (abaixo)
  - `advertiserOverview(advertiserIds: number[], days: PortalDays, now?: Date): Promise<AdvertiserOverview>`
  - `clientOverview(clientIds: number[], days: PortalDays, now?: Date): Promise<ClientOverview>`

Consumidos pela Task 5 (rotas) e replicados como tipos locais no frontend nas Tasks 8 e 9.

- [ ] **Step 1: Escrever o teste da janela de "online"**

O resto de `overview.ts` fala com o banco e é coberto pelos testes de rota da Task 5 (com o módulo mockado), seguindo o padrão de `public-stats.test.ts`. A janela de presença é a única regra pura nova aqui, e é justamente a que erra em silêncio.

Crie `artifacts/api-server/src/lib/portal/__tests__/overview-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// overview.ts importa @workspace/db, que lança se DATABASE_URL não existir.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

describe("janela de presença das TVs", () => {
  it("onlineSince olha 5 minutos para trás", async () => {
    const { onlineSince, DEVICE_ONLINE_WINDOW_MINUTES } = await import("../overview");
    expect(DEVICE_ONLINE_WINDOW_MINUTES).toBe(5);
    const now = new Date("2026-09-05T15:00:00.000Z");
    expect(onlineSince(now).toISOString()).toBe("2026-09-05T14:55:00.000Z");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter api-server exec vitest run src/lib/portal/__tests__/overview-window.test.ts`

Expected: FAIL — `Failed to resolve import "../overview"`.

- [ ] **Step 3: Implementar**

Crie `artifacts/api-server/src/lib/portal/overview.ts`:

```ts
// artifacts/api-server/src/lib/portal/overview.ts
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, campaignsTable, devicesTable, playsTable, scansTable } from "@workspace/db";
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { scanRate } from "../scan-rate";
import { fillSeries } from "./series";
import { portalPeriod, previousPortalPeriod, type PortalDays, type PortalPeriod } from "./period";

/**
 * "TVs online agora" é presença, não histórico: cinco minutos é o intervalo
 * em que uma tela saudável reporta. O card diz "agora" e o número precisa
 * concordar com isso, independente do período escolhido no filtro.
 */
export const DEVICE_ONLINE_WINDOW_MINUTES = 5;

export function onlineSince(now: Date): Date {
  return new Date(now.getTime() - DEVICE_ONLINE_WINDOW_MINUTES * 60 * 1000);
}

/**
 * Data local do negócio dentro do SQL, para agrupar a série por dia.
 *
 * `created_at` é `timestamptz`; `AT TIME ZONE` o converte para a hora de
 * parede de São Paulo, e `::date` corta o dia. Esta expressão aparece só no
 * `GROUP BY` e no `SELECT` — nunca no `WHERE`, que filtra pelo timestamp cru
 * para continuar usando os índices compostos.
 */
const DAY_KEY = (column: unknown) =>
  sql<string>`to_char((${column} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)})::date, 'YYYY-MM-DD')`;

/** Scans de gente. Bot não paga a conta do anunciante. */
const HUMAN_SCAN = eq(scansTable.isBot, false);

export interface PeriodInfo {
  days: PortalDays;
  from: string;
  to: string;
}

function periodInfo(period: PortalPeriod): PeriodInfo {
  return { days: period.days, from: period.keys[0], to: period.keys[period.keys.length - 1] };
}

export interface AdvertiserTotals {
  plays: number;
  scans: number;
  uniqueVisitors: number;
  scanRate: number;
}

export interface AdvertiserOverview {
  period: PeriodInfo;
  totals: AdvertiserTotals & {
    activeCampaigns: number;
    reachedDevices: number;
    previous: AdvertiserTotals;
  };
  series: Array<{ date: string; plays: number; scans: number; uniqueVisitors: number }>;
}

const EMPTY_TOTALS: AdvertiserTotals = { plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 };

async function advertiserTotals(
  advertiserIds: number[],
  period: PortalPeriod,
): Promise<AdvertiserTotals> {
  const [plays] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    );

  const [scans] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      unique: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(scansTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, scansTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        HUMAN_SCAN,
        gte(scansTable.createdAt, period.from),
        lt(scansTable.createdAt, period.to),
      ),
    );

  const totals = {
    plays: plays?.n ?? 0,
    scans: scans?.n ?? 0,
    uniqueVisitors: scans?.unique ?? 0,
  };
  return { ...totals, scanRate: scanRate(totals.scans, totals.plays) };
}

export async function advertiserOverview(
  advertiserIds: number[],
  days: PortalDays,
  now: Date = new Date(),
): Promise<AdvertiserOverview> {
  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);

  // Admin abrindo o portal não tem vínculo: devolve a casca vazia em vez de
  // uma varredura sem filtro, que traria a rede inteira.
  if (advertiserIds.length === 0) {
    return {
      period: periodInfo(period),
      totals: { ...EMPTY_TOTALS, activeCampaigns: 0, reachedDevices: 0, previous: EMPTY_TOTALS },
      series: fillSeries(period.keys, [], ["plays", "scans", "uniqueVisitors"]),
    };
  }

  const [current, before] = await Promise.all([
    advertiserTotals(advertiserIds, period),
    advertiserTotals(advertiserIds, previous),
  ]);

  const [campaigns] = await db
    .select({
      active: sql<number>`COUNT(*) FILTER (WHERE ${campaignsTable.isActive})::int`,
    })
    .from(campaignsTable)
    .where(inArray(campaignsTable.advertiserId, advertiserIds));

  const [devices] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${playsTable.deviceId})::int` })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    );

  const playRows = await db
    .select({ day: DAY_KEY(playsTable.createdAt), plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    )
    .groupBy(DAY_KEY(playsTable.createdAt));

  const scanRows = await db
    .select({
      day: DAY_KEY(scansTable.createdAt),
      scans: sql<number>`COUNT(*)::int`,
      uniqueVisitors: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(scansTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, scansTable.campaignId))
    .where(
      and(
        inArray(campaignsTable.advertiserId, advertiserIds),
        HUMAN_SCAN,
        gte(scansTable.createdAt, period.from),
        lt(scansTable.createdAt, period.to),
      ),
    )
    .groupBy(DAY_KEY(scansTable.createdAt));

  const scansByDay = new Map(scanRows.map((row) => [row.day, row]));
  const merged = playRows.map((row) => ({
    day: row.day,
    plays: row.plays,
    scans: scansByDay.get(row.day)?.scans ?? 0,
    uniqueVisitors: scansByDay.get(row.day)?.uniqueVisitors ?? 0,
  }));
  // Dia com scan e sem play existe: o QR foi lido depois que a campanha saiu do ar.
  for (const row of scanRows) {
    if (!playRows.some((play) => play.day === row.day)) {
      merged.push({ day: row.day, plays: 0, scans: row.scans, uniqueVisitors: row.uniqueVisitors });
    }
  }

  return {
    period: periodInfo(period),
    totals: {
      ...current,
      activeCampaigns: campaigns?.active ?? 0,
      reachedDevices: devices?.n ?? 0,
      previous: before,
    },
    series: fillSeries(period.keys, merged, ["plays", "scans", "uniqueVisitors"]),
  };
}

export interface ClientOverview {
  period: PeriodInfo;
  totals: { plays: number; devices: number; devicesOnline: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number }>;
}

async function clientPlays(clientIds: number[], period: PortalPeriod): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .where(
      and(
        inArray(devicesTable.clientId, clientIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    );
  return row?.n ?? 0;
}

export async function clientOverview(
  clientIds: number[],
  days: PortalDays,
  now: Date = new Date(),
): Promise<ClientOverview> {
  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);

  if (clientIds.length === 0) {
    return {
      period: periodInfo(period),
      totals: { plays: 0, devices: 0, devicesOnline: 0, previous: { plays: 0 } },
      series: fillSeries(period.keys, [], ["plays"]),
    };
  }

  const [plays, playsBefore] = await Promise.all([
    clientPlays(clientIds, period),
    clientPlays(clientIds, previous),
  ]);

  // lastSeenAt nulo não satisfaz o gte: TV cadastrada que nunca reportou não
  // conta como online.
  const [devices] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      online: sql<number>`COUNT(*) FILTER (WHERE ${devicesTable.lastSeenAt} >= ${onlineSince(now)})::int`,
    })
    .from(devicesTable)
    .where(inArray(devicesTable.clientId, clientIds));

  const rows = await db
    .select({ day: DAY_KEY(playsTable.createdAt), plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .where(
      and(
        inArray(devicesTable.clientId, clientIds),
        gte(playsTable.createdAt, period.from),
        lt(playsTable.createdAt, period.to),
      ),
    )
    .groupBy(DAY_KEY(playsTable.createdAt));

  return {
    period: periodInfo(period),
    totals: {
      plays,
      devices: devices?.total ?? 0,
      devicesOnline: devices?.online ?? 0,
      previous: { plays: playsBefore },
    },
    series: fillSeries(period.keys, rows, ["plays"]),
  };
}
```

- [ ] **Step 4: Rodar teste e typecheck**

Run: `pnpm --filter api-server exec vitest run src/lib/portal/__tests__/overview-window.test.ts && pnpm --filter api-server run typecheck`

Expected: PASS, e typecheck sem erro.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/portal/overview.ts artifacts/api-server/src/lib/portal/__tests__/overview-window.test.ts
git commit -m "feat(portal): queries de overview com série diária e janela anterior"
```

---

### Task 5: Rotas do portal

**Files:**
- Modify: `artifacts/api-server/src/routes/portal.ts`
- Modify: `artifacts/api-server/src/lib/portal/queries.ts`
- Test: `artifacts/api-server/src/routes/__tests__/portal-overview.test.ts`

**Interfaces:**
- Consumes: `parseDays`, `PortalDays` (Task 2); `advertiserOverview`, `clientOverview` (Task 4).
- Produces: `GET /portal/advertiser/overview`, `GET /portal/client/overview`, e o parâmetro `?days` nas duas rotas de lista. `advertiserCampaigns(advertiserIds, days?)` e `clientDevices(clientIds, days?)` ganham um segundo argumento opcional `days: PortalDays | undefined`. Consumido pelas Tasks 8 e 9.

- [ ] **Step 1: Escrever os testes que falham**

Crie `artifacts/api-server/src/routes/__tests__/portal-overview.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const SECRET = "segredo-portal";
const loadAuthContext = vi.fn();
const advertiserOverview = vi.fn();
const clientOverview = vi.fn();
const advertiserCampaigns = vi.fn();
const clientDevices = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
}));
vi.mock("../../lib/portal/overview", () => ({
  advertiserOverview: (...a: unknown[]) => advertiserOverview(...a),
  clientOverview: (...a: unknown[]) => clientOverview(...a),
}));
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

const advCtx = {
  userId: 7, email: "a@b.com", isActive: true, mustChangePassword: false,
  clientIds: [], advertiserIds: [9],
};
const clientCtx = {
  userId: 8, email: "c@b.com", isActive: true, mustChangePassword: false,
  clientIds: [4], advertiserIds: [],
};

const EMPTY_ADV = {
  period: { days: 30, from: "2026-08-07", to: "2026-09-05" },
  totals: {
    plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0,
    activeCampaigns: 0, reachedDevices: 0,
    previous: { plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 },
  },
  series: [],
};

async function get(path: string, sub: string) {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  const token = createSession(SECRET, sub);
  return request(app).get(path).set("Cookie", [`session=${token}`]);
}

describe("GET /portal/advertiser/overview", () => {
  beforeEach(() => {
    loadAuthContext.mockReset();
    advertiserOverview.mockReset();
    clientOverview.mockReset();
    advertiserCampaigns.mockReset();
    clientDevices.mockReset();
  });

  it("passa apenas os advertiserIds da sessão", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserOverview.mockResolvedValue(EMPTY_ADV);
    const res = await get("/portal/advertiser/overview", "7");
    expect(res.status).toBe(200);
    expect(advertiserOverview).toHaveBeenCalledWith([9], 30);
  });

  it("usa 30 dias quando days está ausente", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserOverview.mockResolvedValue(EMPTY_ADV);
    await get("/portal/advertiser/overview", "7");
    expect(advertiserOverview).toHaveBeenCalledWith([9], 30);
  });

  it("aceita os presets", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserOverview.mockResolvedValue(EMPTY_ADV);
    await get("/portal/advertiser/overview?days=7", "7");
    expect(advertiserOverview).toHaveBeenCalledWith([9], 7);
  });

  // Sem isso, ?days=3650 vira uma varredura de dez anos na maior tabela.
  it("responde 400 para days fora do enum, sem tocar na query", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    const res = await get("/portal/advertiser/overview?days=3650", "7");
    expect(res.status).toBe(400);
    expect(advertiserOverview).not.toHaveBeenCalled();
  });

  it("nega quem não é anunciante", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/advertiser/overview", "8");
    expect(res.status).toBe(403);
    expect(advertiserOverview).not.toHaveBeenCalled();
  });
});

describe("GET /portal/client/overview", () => {
  beforeEach(() => {
    loadAuthContext.mockReset();
    clientOverview.mockReset();
  });

  it("passa apenas os clientIds da sessão", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    clientOverview.mockResolvedValue({
      period: { days: 30, from: "2026-08-07", to: "2026-09-05" },
      totals: { plays: 0, devices: 0, devicesOnline: 0, previous: { plays: 0 } },
      series: [],
    });
    const res = await get("/portal/client/overview?days=90", "8");
    expect(res.status).toBe(200);
    expect(clientOverview).toHaveBeenCalledWith([4], 90);
  });

  it("responde 400 para days inválido", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/client/overview?days=0", "8");
    expect(res.status).toBe(400);
    expect(clientOverview).not.toHaveBeenCalled();
  });
});

describe("days nas rotas de lista", () => {
  beforeEach(() => {
    loadAuthContext.mockReset();
    advertiserCampaigns.mockReset();
    clientDevices.mockReset();
  });

  it("repassa o período para a lista de campanhas", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    advertiserCampaigns.mockResolvedValue([]);
    await get("/portal/advertiser/campaigns?days=7", "7");
    expect(advertiserCampaigns).toHaveBeenCalledWith([9], 7);
  });

  it("repassa o período para a lista de TVs", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    clientDevices.mockResolvedValue([]);
    await get("/portal/client/devices?days=90", "8");
    expect(clientDevices).toHaveBeenCalledWith([4], 90);
  });

  it("recusa days inválido também nas listas", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    const res = await get("/portal/advertiser/campaigns?days=5", "7");
    expect(res.status).toBe(400);
    expect(advertiserCampaigns).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter api-server exec vitest run src/routes/__tests__/portal-overview.test.ts`

Expected: FAIL — as rotas de overview respondem 404 e `advertiserCampaigns` é chamado com um argumento só.

- [ ] **Step 3: Reescrever `routes/portal.ts`**

```ts
// artifacts/api-server/src/routes/portal.ts
import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdvertiser, requireClient } from "../lib/auth/middleware";
import { advertiserCampaigns, clientDevices } from "../lib/portal/queries";
import { advertiserOverview, clientOverview } from "../lib/portal/overview";
import { parseDays, type PortalDays } from "../lib/portal/period";

const router: IRouter = Router();

/**
 * Resolve o período pedido ou responde 400.
 *
 * Devolver o erro aqui, antes de qualquer query, é o ponto: `?days=3650` não
 * pode virar uma varredura de dez anos na maior tabela do banco só porque
 * alguém editou a barra de endereços.
 */
function resolvePeriod(req: Request, res: Response): PortalDays | null {
  const days = parseDays(req.query.days);
  if (days === null) {
    res.status(400).json({ error: "Período inválido. Use days=7, 30 ou 90." });
    return null;
  }
  return days;
}

// Admin visualizando o portal: sem vínculo, retorna vazio (usa o painel admin).
const advertiserScope = (req: Request) => (req.auth?.isAdmin ? [] : (req.auth?.advertiserIds ?? []));
const clientScope = (req: Request) => (req.auth?.isAdmin ? [] : (req.auth?.clientIds ?? []));

router.get("/advertiser/campaigns", requireAdvertiser, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await advertiserCampaigns(advertiserScope(req), days));
});

router.get("/advertiser/overview", requireAdvertiser, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await advertiserOverview(advertiserScope(req), days));
});

router.get("/client/devices", requireClient, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await clientDevices(clientScope(req), days));
});

router.get("/client/overview", requireClient, async (req, res) => {
  const days = resolvePeriod(req, res);
  if (days === null) return;
  res.json(await clientOverview(clientScope(req), days));
});

export default router;
```

- [ ] **Step 4: Filtrar as listas pelo período**

Em `artifacts/api-server/src/lib/portal/queries.ts`, troque a linha de import do drizzle e acrescente o import da janela:

```ts
import { inArray, eq, and, gte, lt, sql } from "drizzle-orm";
import { portalPeriod, type PortalDays } from "./period";
```

Em `advertiserCampaigns`, mude a assinatura para
`export async function advertiserCampaigns(advertiserIds: number[], days: PortalDays): Promise<PortalCampaignRow[]>`
e insira, logo depois do `if (advertiserIds.length === 0) return [];`:

```ts
  // A janela entra no ON do join, não no WHERE: no WHERE, uma campanha sem
  // exibição no período viraria linha nenhuma e sumiria da lista, em vez de
  // aparecer zerada — que é a informação que o anunciante precisa ver.
  const period = portalPeriod(days);
  const playsWindow = and(
    gte(playsTable.createdAt, period.from),
    lt(playsTable.createdAt, period.to),
  );
  const scansWindow = and(
    gte(scansTable.createdAt, period.from),
    lt(scansTable.createdAt, period.to),
  );
```

`days` é obrigatório: toda rota do portal resolve o período antes de chamar
estas queries, então um ramo "sem janela" seria código inalcançável.

Troque os dois `leftJoin` existentes por:

```ts
    .leftJoin(playsTable, and(eq(playsTable.campaignId, campaignsTable.id), playsWindow))
    .leftJoin(scansTable, and(eq(scansTable.campaignId, campaignsTable.id), scansWindow))
```

Em `clientDevices`, mude a assinatura para
`export async function clientDevices(clientIds: number[], days: PortalDays): Promise<PortalDeviceRow[]>`
e insira, depois do `if (clientIds.length === 0) return [];`:

```ts
  const period = portalPeriod(days);
  const playsWindow = and(
    gte(playsTable.createdAt, period.from),
    lt(playsTable.createdAt, period.to),
  );
```

Troque o `leftJoin` existente por:

```ts
    .leftJoin(playsTable, and(eq(playsTable.deviceId, devicesTable.id), playsWindow))
```

- [ ] **Step 5: Rodar a suíte inteira do backend**

Run: `pnpm --filter api-server run test && pnpm --filter api-server run typecheck`

Expected: PASS — depois de um ajuste esperado. `portal-scope.test.ts` chama as rotas sem `days`, e `parseDays(undefined)` devolve 30, então as asserções antigas `toHaveBeenCalledWith([9])` e `toHaveBeenCalledWith([4])` **vão falhar**. Atualize-as para `toHaveBeenCalledWith([9], 30)` e `toHaveBeenCalledWith([4], 30)`. Nenhuma outra mudança nesse arquivo.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/portal.ts artifacts/api-server/src/lib/portal/queries.ts artifacts/api-server/src/routes/__tests__
git commit -m "feat(portal): rotas de overview e filtro de período nas listas"
```

---

### Task 6: Infraestrutura de teste do frontend

`artifacts/signage` não tem test runner nenhum hoje. Os blocos das Tasks 7–9 precisam de um.

**Files:**
- Modify: `artifacts/signage/package.json`
- Create: `artifacts/signage/vitest.config.ts`
- Create: `artifacts/signage/src/test/setup.ts`
- Test: `artifacts/signage/src/lib/__tests__/format.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `pnpm --filter signage run test`, o alias `@` resolvido nos testes, e `@testing-library/jest-dom` já carregado. Consumido pelas Tasks 7–9.

- [ ] **Step 1: Instalar as devDeps**

Run:
```bash
pnpm --filter signage add -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: as seis entram em `devDependencies` de `artifacts/signage/package.json`.

- [ ] **Step 2: Adicionar os scripts**

Em `artifacts/signage/package.json`, dentro de `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Criar a config**

`vite.config.ts` exige `PORT` e `BASE_PATH` no modo `serve` e é `async`. Uma config própria para teste evita arrastar essas exigências para dentro do runner.

Crie `artifacts/signage/vitest.config.ts`:

```ts
import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```

Crie `artifacts/signage/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Escrever um teste que prova que a infra funciona**

Crie `artifacts/signage/src/lib/__tests__/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration } from '@/lib/format';

describe('formatDuration', () => {
  it('mostra só segundos abaixo de um minuto', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('mostra minutos e segundos abaixo de uma hora', () => {
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('mostra horas e minutos acima de uma hora', () => {
    expect(formatDuration(3720)).toBe('1h 2m');
  });
});
```

- [ ] **Step 5: Rodar**

Run: `pnpm --filter signage run test`

Expected: PASS, 3 testes. Se o alias `@` falhar, a config não está sendo lida — confirme o nome `vitest.config.ts` na raiz de `artifacts/signage`.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/package.json artifacts/signage/vitest.config.ts artifacts/signage/src/test artifacts/signage/src/lib/__tests__ pnpm-lock.yaml
git commit -m "chore(signage): vitest e testing-library no frontend"
```

---

### Task 7: Blocos compartilhados do portal

Cada bloco tem um trabalho e não sabe se está servindo anunciante ou cliente. É o que permite as duas páginas dividirem a mesma casca sem uma virar caso especial da outra.

**Files:**
- Create: `artifacts/signage/src/components/portal/period-filter.tsx`
- Create: `artifacts/signage/src/components/portal/delta.ts`
- Create: `artifacts/signage/src/components/portal/kpi-card.tsx`
- Create: `artifacts/signage/src/components/portal/trend-chart.tsx`
- Create: `artifacts/signage/src/components/portal/print-header.tsx`
- Test: `artifacts/signage/src/components/portal/__tests__/delta.test.ts`
- Test: `artifacts/signage/src/components/portal/__tests__/period-filter.test.tsx`
- Test: `artifacts/signage/src/components/portal/__tests__/kpi-card.test.tsx`

**Interfaces:**
- Consumes: `Card`/`CardContent` de `@/components/ui/card`; `Button` de `@/components/ui/button`; `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `type ChartConfig` de `@/components/ui/chart`; `cn` de `@/lib/utils`.
- Produces:
  - `type PortalDays = 7 | 30 | 90` e `PORTAL_DAYS` (cópia local do enum do backend)
  - `<PeriodFilter value={days} onChange={(d: PortalDays) => void} />`
  - `formatDelta(current: number, previous: number): Delta | null` e `formatPointDelta(current: number, previous: number): Delta | null`, com `interface Delta { label: string; direction: 'up' | 'down' | 'flat' }`
  - `<KpiCard label value icon delta? hint? />`
  - `<TrendChart data config leftKey rightKey? />`
  - `<PrintHeader subject period />`

- [ ] **Step 1: Escrever os testes que falham**

Crie `artifacts/signage/src/components/portal/__tests__/delta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDelta, formatPointDelta } from '../delta';

describe('formatDelta', () => {
  it('mostra crescimento com sinal e seta para cima', () => {
    expect(formatDelta(112, 100)).toEqual({ label: '+12%', direction: 'up' });
  });

  it('mostra queda', () => {
    expect(formatDelta(90, 100)).toEqual({ label: '−10%', direction: 'down' });
  });

  it('trata estabilidade como estável, não como alta', () => {
    expect(formatDelta(100, 100)).toEqual({ label: '0%', direction: 'flat' });
  });

  // Sem período anterior não existe comparação. "+∞%" ou "+100%" seriam duas
  // mentiras diferentes sobre a primeira semana de uma campanha nova.
  it('devolve null quando o período anterior é zero', () => {
    expect(formatDelta(50, 0)).toBeNull();
  });

  it('arredonda para inteiro', () => {
    expect(formatDelta(103, 100)).toEqual({ label: '+3%', direction: 'up' });
    expect(formatDelta(1015, 1000)).toEqual({ label: '+2%', direction: 'up' });
  });
});

describe('formatPointDelta', () => {
  // Taxa se compara em pontos percentuais. "a taxa subiu 12%" sobre 0,81% é
  // ambíguo; "+0,1p" não é.
  it('mostra a diferença em pontos percentuais', () => {
    expect(formatPointDelta(0.0081, 0.0071)).toEqual({ label: '+0,1p', direction: 'up' });
  });

  it('mostra queda em pontos', () => {
    expect(formatPointDelta(0.0071, 0.0081)).toEqual({ label: '−0,1p', direction: 'down' });
  });

  it('devolve null quando o período anterior é zero', () => {
    expect(formatPointDelta(0.01, 0)).toBeNull();
  });
});
```

Crie `artifacts/signage/src/components/portal/__tests__/period-filter.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeriodFilter } from '../period-filter';

describe('PeriodFilter', () => {
  it('oferece os três presets', () => {
    render(<PeriodFilter value={30} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '7 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 dias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 dias' })).toBeInTheDocument();
  });

  it('marca o preset ativo para leitores de tela', () => {
    render(<PeriodFilter value={30} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('emite o preset escolhido', async () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={30} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '90 dias' }));
    expect(onChange).toHaveBeenCalledWith(90);
  });
});
```

Crie `artifacts/signage/src/components/portal/__tests__/kpi-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Play } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { KpiCard } from '../kpi-card';

describe('KpiCard', () => {
  it('mostra rótulo e valor', () => {
    render(<KpiCard label="Exibições" value="48.210" icon={Play} />);
    expect(screen.getByText('Exibições')).toBeInTheDocument();
    expect(screen.getByText('48.210')).toBeInTheDocument();
  });

  it('mostra o delta quando existe', () => {
    render(
      <KpiCard label="Exibições" value="48.210" icon={Play} delta={{ label: '+12%', direction: 'up' }} />,
    );
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  // Sem período anterior o card mostra um traço, não um número inventado.
  it('mostra um traço quando não há delta', () => {
    render(<KpiCard label="Exibições" value="48.210" icon={Play} delta={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter signage run test`

Expected: FAIL — três arquivos não resolvem seus imports.

- [ ] **Step 3: Implementar `delta.ts`**

```ts
// artifacts/signage/src/components/portal/delta.ts

export interface Delta {
  label: string;
  direction: 'up' | 'down' | 'flat';
}

function direction(diff: number): Delta['direction'] {
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'flat';
}

/** Sinal de menos de verdade (U+2212), não hífen: alinha com os dígitos. */
function signed(value: number, suffix: string): string {
  if (value > 0) return `+${value}${suffix}`;
  if (value < 0) return `−${Math.abs(value)}${suffix}`;
  return `0${suffix}`;
}

/**
 * Variação percentual contra o período anterior.
 *
 * Sem período anterior não existe comparação: `null` faz o card mostrar um
 * traço. "+∞%" e "+100%" seriam duas mentiras diferentes sobre a primeira
 * semana de uma campanha nova.
 */
export function formatDelta(current: number, previous: number): Delta | null {
  if (!previous || previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  return { label: signed(change, '%'), direction: direction(change) };
}

/**
 * Variação de uma taxa, em pontos percentuais.
 *
 * "a taxa de resposta subiu 12%" sobre 0,81% é ambíguo — 12% do quê. "+0,1p"
 * não é.
 */
export function formatPointDelta(current: number, previous: number): Delta | null {
  if (!previous || previous <= 0) return null;
  const points = (current - previous) * 100;
  const rounded = Math.round(points * 10) / 10;
  const label = signed(rounded, 'p').replace('.', ',');
  return { label, direction: direction(rounded) };
}
```

- [ ] **Step 4: Implementar `period-filter.tsx`**

```tsx
// artifacts/signage/src/components/portal/period-filter.tsx
import { Button } from '@/components/ui/button';

export type PortalDays = 7 | 30 | 90;
export const PORTAL_DAYS: readonly PortalDays[] = [7, 30, 90];

/**
 * O período escolhido governa a página inteira — cards, gráfico e tabela.
 * Um gráfico de 30 dias ao lado de uma tabela acumulada daria dois números
 * diferentes para a mesma pergunta na mesma tela.
 */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: PortalDays;
  onChange: (days: PortalDays) => void;
}) {
  return (
    <div className="flex gap-1 print:hidden" role="group" aria-label="Período">
      {PORTAL_DAYS.map((days) => (
        <Button
          key={days}
          type="button"
          size="sm"
          variant={days === value ? 'default' : 'outline'}
          aria-pressed={days === value}
          onClick={() => onChange(days)}
        >
          {days} dias
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implementar `kpi-card.tsx`**

```tsx
// artifacts/signage/src/components/portal/kpi-card.tsx
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Delta } from './delta';

const ARROW = { up: ArrowUp, down: ArrowDown, flat: ArrowRight } as const;
const TONE = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-muted-foreground',
} as const;

export function KpiCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  delta?: Delta | null;
  hint?: string;
}) {
  const Arrow = delta ? ARROW[delta.direction] : null;
  return (
    <Card className="break-inside-avoid">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
            {delta !== undefined && (
              <p className={cn('mt-1 flex items-center gap-1 text-xs', delta ? TONE[delta.direction] : 'text-muted-foreground')}>
                {Arrow ? <Arrow className="h-3 w-3" aria-hidden /> : null}
                <span>{delta ? delta.label : '—'}</span>
                {delta ? <span className="text-muted-foreground">vs. período anterior</span> : null}
              </p>
            )}
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Implementar `trend-chart.tsx`**

```tsx
// artifacts/signage/src/components/portal/trend-chart.tsx
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

/**
 * Gráfico de linhas do período.
 *
 * `rightKey` existe porque exibições vivem na casa dos milhares e scans na das
 * centenas: num eixo só, a linha de scans fica colada no zero e não informa
 * nada. Quando há só uma métrica, o eixo direito não é desenhado.
 *
 * `isAnimationActive={false}` não é preferência estética — a animação não
 * termina antes do navegador tirar o retrato da página na impressão, e o
 * gráfico sai pela metade no PDF.
 */
export function TrendChart({
  data,
  config,
  leftKey,
  rightKey,
}: {
  data: Array<Record<string, string | number>>;
  config: ChartConfig;
  leftKey: string;
  rightKey?: string;
}) {
  return (
    <ChartContainer config={config} className="h-[280px] w-full print:h-[220px] print:w-[680px]">
      <LineChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} width={48} allowDecimals={false} />
        {rightKey ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
        ) : null}
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => shortDate(String(v))} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          yAxisId="left"
          dataKey={leftKey}
          type="monotone"
          stroke={`var(--color-${leftKey})`}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        {rightKey ? (
          <Line
            yAxisId="right"
            dataKey={rightKey}
            type="monotone"
            stroke={`var(--color-${rightKey})`}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ) : null}
      </LineChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 7: Implementar `print-header.tsx`**

```tsx
// artifacts/signage/src/components/portal/print-header.tsx
import { MonitorPlay } from 'lucide-react';

function longDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  // Meio-dia UTC: a data já é local do negócio, e só queremos formatá-la por
  // extenso sem que o fuso do navegador a empurre para o dia anterior.
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Cabeçalho que só existe no papel. Na tela essa informação já está no shell e
 * no filtro; impressa, ela é o que transforma a página num comprovante — sem
 * período e sem data de emissão, o PDF não prova nada.
 */
export function PrintHeader({
  subject,
  period,
}: {
  subject: string;
  period: { from: string; to: string };
}) {
  return (
    <header className="mb-6 hidden border-b pb-4 print:block">
      <div className="flex items-center gap-2 font-bold tracking-tight">
        <MonitorPlay className="h-5 w-5" aria-hidden />
        <span>Painel de Anúncios</span>
      </div>
      <h1 className="mt-2 text-xl font-semibold">{subject}</h1>
      <p className="text-sm text-muted-foreground">
        Período de {longDate(period.from)} a {longDate(period.to)}
      </p>
      <p className="text-xs text-muted-foreground">
        Emitido em {new Date().toLocaleDateString('pt-BR')}
      </p>
    </header>
  );
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `pnpm --filter signage run test && pnpm --filter signage run typecheck`

Expected: PASS, 17 testes no total — 3 de `format`, 8 de `delta`, 3 de `PeriodFilter` e 3 de `KpiCard`.

- [ ] **Step 9: Commit**

```bash
git add artifacts/signage/src/components/portal
git commit -m "feat(portal): blocos de período, KPI, gráfico e cabeçalho de impressão"
```

---

### Task 8: Portal do anunciante

**Files:**
- Modify: `artifacts/signage/src/pages/portal-advertiser.tsx` (reescrita completa)
- Test: `artifacts/signage/src/pages/__tests__/portal-advertiser.test.tsx`

**Interfaces:**
- Consumes: `PeriodFilter`, `PortalDays` (Task 7); `KpiCard`; `formatDelta`, `formatPointDelta`; `TrendChart`; `PrintHeader`; as rotas `GET /api/portal/advertiser/overview?days=` e `GET /api/portal/advertiser/campaigns?days=` (Task 5).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Escrever o teste que falha**

O que importa testar aqui é a correção do engolimento de erro: hoje uma API fora do ar vira "Nenhuma campanha encontrada", e o anunciante lê isso como "minha campanha sumiu".

Crie `artifacts/signage/src/pages/__tests__/portal-advertiser.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalAdvertiser from '../portal-advertiser';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalAdvertiser />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalAdvertiser', () => {
  // A regressão que este teste tranca: com `if (!res.ok) return []`, API fora
  // do ar era indistinguível de anunciante sem campanha.
  it('mostra estado de falha quando a API responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderPage();
    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma campanha/i)).not.toBeInTheDocument();
  });

  it('mostra o vazio de verdade quando a API responde sem campanhas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              String(url).includes('/overview')
                ? {
                    period: { days: 30, from: '2026-08-07', to: '2026-09-05' },
                    totals: {
                      plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0,
                      activeCampaigns: 0, reachedDevices: 0,
                      previous: { plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 },
                    },
                    series: [{ date: '2026-09-05', plays: 0, scans: 0, uniqueVisitors: 0 }],
                  }
                : [],
            ),
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/nenhuma campanha/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter signage exec vitest run src/pages/__tests__/portal-advertiser.test.tsx`

Expected: FAIL — a página atual mostra "Nenhuma campanha encontrada" nos dois casos.

- [ ] **Step 3: Reescrever a página**

Substitua todo o conteúdo de `artifacts/signage/src/pages/portal-advertiser.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play, QrCode, Users, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { ChartConfig } from '@/components/ui/chart';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta, formatPointDelta } from '@/components/portal/delta';

interface PortalCampaign {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  deviceCount: number;
  totalPlays: number;
  totalScans: number;
  uniqueVisitors: number;
}

interface AdvertiserTotals {
  plays: number;
  scans: number;
  uniqueVisitors: number;
  scanRate: number;
}

interface AdvertiserOverview {
  period: { days: PortalDays; from: string; to: string };
  totals: AdvertiserTotals & {
    activeCampaigns: number;
    reachedDevices: number;
    previous: AdvertiserTotals;
  };
  series: Array<{ date: string; plays: number; scans: number; uniqueVisitors: number }>;
}

/**
 * Erro de rede não pode virar lista vazia.
 *
 * A versão anterior fazia `if (!res.ok) return []`, então API fora do ar e
 * anunciante sem campanha desenhavam exatamente a mesma tela — e quem paga por
 * veiculação lê "nenhuma campanha" como "minha campanha sumiu".
 */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
  return res.json();
}

const CHART_CONFIG = {
  plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' },
  scans: { label: 'Scans', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const int = (n: number) => n.toLocaleString('pt-BR');
const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export default function PortalAdvertiser() {
  const [days, setDays] = useState<PortalDays>(30);

  const overview = useQuery({
    queryKey: ['portal', 'advertiser', 'overview', days],
    queryFn: () => getJson<AdvertiserOverview>(`api/portal/advertiser/overview?days=${days}`),
    retry: false,
  });

  const campaigns = useQuery({
    queryKey: ['portal', 'advertiser', 'campaigns', days],
    queryFn: () => getJson<PortalCampaign[]>(`api/portal/advertiser/campaigns?days=${days}`),
    retry: false,
  });

  if (overview.isError || campaigns.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Não foi possível carregar seus dados</EmptyTitle>
          <EmptyDescription>
            O servidor não respondeu. Suas campanhas continuam no ar — isto é uma falha de leitura.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          onClick={() => {
            overview.refetch();
            campaigns.refetch();
          }}
        >
          Tentar de novo
        </Button>
      </Empty>
    );
  }

  const totals = overview.data?.totals;
  const previous = totals?.previous;
  const period = overview.data?.period;

  return (
    <div>
      {period ? <PrintHeader subject="Minhas campanhas" period={period} /> : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold print:hidden">Minhas campanhas</h1>
        <div className="ml-auto flex items-center gap-2">
          <PeriodFilter value={days} onChange={setDays} />
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {overview.isLoading || !totals || !previous ? (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Exibições"
            value={int(totals.plays)}
            icon={Play}
            delta={formatDelta(totals.plays, previous.plays)}
            hint={`${int(totals.reachedDevices)} TVs alcançadas`}
          />
          <KpiCard
            label="Scans"
            value={int(totals.scans)}
            icon={QrCode}
            delta={formatDelta(totals.scans, previous.scans)}
          />
          <KpiCard
            label="Visitantes únicos"
            value={int(totals.uniqueVisitors)}
            icon={Users}
            delta={formatDelta(totals.uniqueVisitors, previous.uniqueVisitors)}
          />
          <KpiCard
            label="Taxa de resposta"
            value={rate(totals.scanRate)}
            icon={Percent}
            delta={formatPointDelta(totals.scanRate, previous.scanRate)}
          />
        </div>
      )}

      <Card className="mb-6 break-inside-avoid">
        <CardHeader>
          <CardTitle>Exibições e scans por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.isLoading || !overview.data ? (
            <Skeleton className="h-[280px] w-full rounded-lg" />
          ) : (
            <TrendChart
              data={overview.data.series}
              config={CHART_CONFIG}
              leftKey="plays"
              rightKey="scans"
            />
          )}
        </CardContent>
      </Card>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>Campanhas no período</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !campaigns.data?.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nenhuma campanha encontrada</EmptyTitle>
                <EmptyDescription>
                  Quando uma campanha sua entrar no ar, ela aparece aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">Campanha</th>
                    <th className="py-2 font-medium">Período</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 text-right font-medium" title="TVs em que esta campanha pode ir ao ar">
                      TVs
                    </th>
                    <th className="py-2 text-right font-medium">Exibições</th>
                    <th className="py-2 text-right font-medium">Scans</th>
                    <th className="py-2 text-right font-medium">Únicos</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.data.map((c) => (
                    <tr key={c.id} className="break-inside-avoid border-b last:border-0">
                      <td className="py-3 font-medium">{c.name}</td>
                      <td className="py-3 text-muted-foreground">
                        {day(c.startsAt)} – {day(c.endsAt)}
                      </td>
                      <td className="py-3">
                        <Badge variant={c.isActive ? 'default' : 'secondary'}>
                          {c.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </td>
                      <td className="py-3 text-right tabular-nums">{int(c.deviceCount)}</td>
                      <td className="py-3 text-right tabular-nums">{int(c.totalPlays)}</td>
                      <td className="py-3 text-right tabular-nums">{int(c.totalScans)}</td>
                      <td className="py-3 text-right tabular-nums">{int(c.uniqueVisitors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e
        múltiplos scans da mesma pessoa contam no número bruto — use a taxa para comparar peças e
        campanhas entre si.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter signage run test && pnpm --filter signage run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/pages/portal-advertiser.tsx artifacts/signage/src/pages/__tests__
git commit -m "feat(portal): painel do anunciante com período, evolução e deltas"
```

---

### Task 9: Portal do cliente

**Files:**
- Modify: `artifacts/signage/src/pages/portal-client.tsx` (reescrita completa)
- Test: `artifacts/signage/src/pages/__tests__/portal-client.test.tsx`

**Interfaces:**
- Consumes: os mesmos blocos da Task 7; as rotas `GET /api/portal/client/overview?days=` e `GET /api/portal/client/devices?days=` (Task 5).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/signage/src/pages/__tests__/portal-client.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalClient from '../portal-client';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalClient />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalClient', () => {
  it('mostra estado de falha quando a API responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderPage();
    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma tv/i)).not.toBeInTheDocument();
  });

  it('mostra a TV e o total do período', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              String(url).includes('/overview')
                ? {
                    period: { days: 30, from: '2026-08-07', to: '2026-09-05' },
                    totals: { plays: 1234, devices: 1, devicesOnline: 1, previous: { plays: 1000 } },
                    series: [{ date: '2026-09-05', plays: 1234 }],
                  }
                : [
                    {
                      id: 1,
                      name: 'TV Recepção',
                      location: 'Entrada',
                      lastSeenAt: '2026-09-05T15:00:00.000Z',
                      totalPlays: 1234,
                    },
                  ],
            ),
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('TV Recepção')).toBeInTheDocument();
    expect(screen.getByText('1.234')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter signage exec vitest run src/pages/__tests__/portal-client.test.tsx`

Expected: FAIL — a página atual não busca `/overview` e mostra a lista vazia no caso de erro.

- [ ] **Step 3: Reescrever a página**

Substitua todo o conteúdo de `artifacts/signage/src/pages/portal-client.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Play, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { ChartConfig } from '@/components/ui/chart';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta } from '@/components/portal/delta';
import { cn } from '@/lib/utils';

interface PortalDevice {
  id: number;
  name: string;
  location: string | null;
  lastSeenAt: string | null;
  totalPlays: number;
}

interface ClientOverview {
  period: { days: PortalDays; from: string; to: string };
  totals: { plays: number; devices: number; devicesOnline: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number }>;
}

/** Erro de rede não pode virar lista vazia — ver a nota em portal-advertiser.tsx. */
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
  return res.json();
}

const CHART_CONFIG = {
  plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

/** Mesma janela que o backend usa em DEVICE_ONLINE_WINDOW_MINUTES. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const int = (n: number) => n.toLocaleString('pt-BR');

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS;
}

export default function PortalClient() {
  const [days, setDays] = useState<PortalDays>(30);

  const overview = useQuery({
    queryKey: ['portal', 'client', 'overview', days],
    queryFn: () => getJson<ClientOverview>(`api/portal/client/overview?days=${days}`),
    retry: false,
  });

  const devices = useQuery({
    queryKey: ['portal', 'client', 'devices', days],
    queryFn: () => getJson<PortalDevice[]>(`api/portal/client/devices?days=${days}`),
    retry: false,
  });

  if (overview.isError || devices.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Não foi possível carregar seus dados</EmptyTitle>
          <EmptyDescription>
            O servidor não respondeu. Suas TVs continuam exibindo — isto é uma falha de leitura.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          onClick={() => {
            overview.refetch();
            devices.refetch();
          }}
        >
          Tentar de novo
        </Button>
      </Empty>
    );
  }

  const totals = overview.data?.totals;
  const period = overview.data?.period;

  return (
    <div>
      {period ? <PrintHeader subject="Minhas TVs" period={period} /> : null}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold print:hidden">Minhas TVs</h1>
        <div className="ml-auto flex items-center gap-2">
          <PeriodFilter value={days} onChange={setDays} />
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {overview.isLoading || !totals ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            label="Exibições no período"
            value={int(totals.plays)}
            icon={Play}
            delta={formatDelta(totals.plays, totals.previous.plays)}
          />
          <KpiCard label="TVs cadastradas" value={int(totals.devices)} icon={Monitor} />
          <KpiCard
            label="TVs online agora"
            value={int(totals.devicesOnline)}
            icon={Wifi}
            hint="Reportaram nos últimos 5 minutos"
          />
        </div>
      )}

      <Card className="mb-6 break-inside-avoid">
        <CardHeader>
          <CardTitle>Exibições por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.isLoading || !overview.data ? (
            <Skeleton className="h-[280px] w-full rounded-lg" />
          ) : (
            <TrendChart data={overview.data.series} config={CHART_CONFIG} leftKey="plays" />
          )}
        </CardContent>
      </Card>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>TVs no período</CardTitle>
        </CardHeader>
        <CardContent>
          {devices.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !devices.data?.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nenhuma TV encontrada</EmptyTitle>
                <EmptyDescription>
                  Quando uma TV sua for cadastrada, ela aparece aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">TV</th>
                    <th className="py-2 font-medium">Local</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Exibições</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.data.map((d) => (
                    <tr key={d.id} className="break-inside-avoid border-b last:border-0">
                      <td className="py-3 font-medium">{d.name}</td>
                      <td className="py-3 text-muted-foreground">{d.location ?? '—'}</td>
                      <td className="py-3">
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className={cn(
                              'h-2 w-2 rounded-full print:border print:border-current',
                              isOnline(d.lastSeenAt) ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                            )}
                          />
                          {isOnline(d.lastSeenAt) ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="py-3 text-right tabular-nums">{int(d.totalPlays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter signage run test && pnpm --filter signage run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/pages/portal-client.tsx artifacts/signage/src/pages/__tests__
git commit -m "feat(portal): painel do cliente com período, evolução e status das TVs"
```

---

### Task 10: Impressão

As classes `print:hidden` e `break-inside-avoid` já foram semeadas nas Tasks 7–9. Falta o que o Tailwind não resolve por utilitário: a cor no papel, o shell e o tamanho da página.

**Files:**
- Modify: `artifacts/signage/src/components/portal-shell.tsx`
- Modify: `artifacts/signage/src/index.css`

**Interfaces:**
- Consumes: os `print:` utilitários já aplicados nas Tasks 7–9.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Adicionar as regras de impressão**

O CSS global do signage é `artifacts/signage/src/index.css` — é o único `.css` em `src/` e já define as variáveis `--chart-1`/`--chart-2` que o gráfico usa. Acrescente ao final dele:

```css
@media print {
  /* O navegador descarta preenchimentos de fundo por padrão ao imprimir. Sem
     isto o gráfico sai sem linhas e as badges de status somem: o relatório
     vira uma tabela cinza que não prova nada. */
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* O shell é navegação: cabeçalho fixo, botão de sair. Nada disso é papel. */
  body {
    background: #fff;
  }

  @page {
    size: A4 portrait;
    margin: 12mm;
  }
}
```

- [ ] **Step 2: Esconder o shell na impressão**

Em `artifacts/signage/src/components/portal-shell.tsx`, adicione `print:hidden` ao `<header>` e neutralize o espaçamento do `<main>`:

```tsx
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
```

```tsx
      <main className="container mx-auto w-full flex-1 px-4 py-6 print:max-w-none print:px-0 print:py-0">{children}</main>
```

- [ ] **Step 3: Verificar no navegador**

Run: `pnpm --filter signage run dev` (com `PORT` e `BASE_PATH` no ambiente, como o `dev.sh` faz) e abra o portal com uma sessão de anunciante.

Verifique, em Ctrl/Cmd+P:
- o cabeçalho do app, o filtro de período e o botão de imprimir **não** aparecem;
- o `PrintHeader` aparece, com nome, período por extenso e data de emissão;
- o gráfico aparece inteiro e colorido, não cortado nem em branco;
- nenhum card ou linha de tabela é partido entre duas páginas.

Se o gráfico sair em branco, o `ResponsiveContainer` mediu zero: confirme que `print:w-[680px]` está no `ChartContainer` de `trend-chart.tsx`.

- [ ] **Step 4: Rodar tudo e commitar**

Run:
```bash
pnpm --filter api-server run test && pnpm --filter api-server run typecheck && \
pnpm --filter signage run test && pnpm --filter signage run typecheck
```

Expected: tudo PASS.

```bash
git add artifacts/signage/src/components/portal-shell.tsx artifacts/signage/src/index.css
git commit -m "feat(portal): relatório imprimível dos painéis"
```
