# Relatórios do portal — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O anunciante abre cada campanha e vê, no contrato inteiro, onde e quando ela passou e qual peça respondeu; o cliente abre cada TV e vê, no período, se ela ficou no ar e o que passou nela — ambos imprimíveis como comprovante.

**Architecture:** Dois endpoints no portal (`/portal/advertiser/campaigns/:id/report`, `/portal/client/devices/:id/report`) com escopo conferido antes do relatório; consultas em `lib/portal/reports.ts`, regras que erram em silêncio em funções puras (`campaignWindow`, `deviceOnlineDays`, `historyStartFrom`). No front, quatro blocos novos em `components/portal/` e duas páginas novas, roteadas no `PortalRoutes`.

**Tech Stack:** Express + Drizzle (Postgres), React 19, wouter 3, TanStack Query, Recharts via `components/ui/chart.tsx`, Vitest + Testing Library (jsdom), supertest.

**Spec:** `docs/superpowers/specs/2026-10-03-portal-relatorios-design.md`

## Global Constraints

- Código, comentários, textos de tela e mensagens de commit em português; comentários explicam o porquê.
- Acentos como caracteres UTF-8 reais, nunca escapes `\uXXXX`.
- Commits `tipo(escopo): descrição curta em português`, sem ponto final, terminando EXATAMENTE com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (qualquer que seja o modelo).
- Branch `feat/portal-relatorios`; nada direto na `main`; sem push.
- Nenhuma dependência nova. Rotas do portal com `fetch` manual; `openapi.yaml` não muda.
- `contractValue` nunca aparece em resposta do portal.
- `:id` que não é inteiro positivo → 400 (`{ "error": "Campanha inválida." }` / `{ "error": "TV inválida." }`). Campanha de outro anunciante, TV de outra loja, inexistente ou escopo vazio → 404 (`{ "error": "Campaign not found" }` / `{ "error": "Device not found" }`), sem distinguir os casos.
- `days` na rota da TV: 7, 30 ou 90; ausente = 30; outro valor → 400 `{ "error": "Período inválido. Use days=7, 30 ou 90." }`.
- Scan com `is_bot = true` fica fora. `scanRate` = scans / exibições, `0` sem exibição. Dias e horas no fuso `America/Sao_Paulo`.
- Gráficos com `isAnimationActive={false}` (impressão).
- Testes: web `pnpm --filter ./artifacts/signage test` (focado: `pnpm --filter ./artifacts/signage exec vitest run <filtro>`); API `pnpm --filter ./artifacts/api-server test` (focado: `pnpm --filter ./artifacts/api-server exec vitest run <filtro>`); tipos `pnpm run typecheck` na raiz. Todos a partir da raiz do repositório.

## Review Focus

1. **Campanha de outro anunciante aberta pela barra de endereço** — tem de ser 404 sem nem calcular o relatório (vazaria loja, peça e volume de outro cliente). Teste na Task 2.
2. **Campanha que termina à meia-noite exata** (`endsAt` = 00:00 local) ganhando um dia a mais no comprovante. Teste na Task 1.
3. **Dia anterior ao cadastro da TV ou ao começo do histórico** aparecendo como "parada" no relatório do cliente. Teste na Task 1.
4. **Peça trocada no meio da campanha** (exibiu, depois saiu de `campaign_announcements`) sumindo da tabela de peças e deixando o total maior que a soma das linhas. Coberto pela regra da Task 2 (une peças ligadas e peças exibidas); revisão lê a consulta.
5. **Nome com link quebrando os testes existentes** de `portal-client`/`portal-advertiser` que procuram a célula pelo nome. Teste na Task 5 e Task 6 (rodar os testes existentes).

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/sql-time.ts` (novo) | `dayKeySql(column)`, `hourOfDaySql(column)` — dia e hora locais no SQL |
| `artifacts/api-server/src/lib/admin-overview/history.ts` (novo) | `historyStartFrom` (pura), `historyStartKey()` (banco) |
| `artifacts/api-server/src/lib/portal/campaign-window.ts` (novo) | `campaignWindow` — pura |
| `artifacts/api-server/src/lib/portal/device-days.ts` (novo) | `deviceOnlineDays`, `countOnlineDays` — puras |
| `artifacts/api-server/src/lib/portal/queries.ts` | exporta `campaignTargetColumns` e `loadNetwork` (reuso) |
| `artifacts/api-server/src/lib/portal/reports.ts` (novo) | `campaignOwner`, `campaignReport`, `deviceOwner`, `deviceReport` |
| `artifacts/api-server/src/routes/portal.ts` | duas rotas novas |
| `artifacts/signage/src/components/portal/*.tsx` (4 novos) | blocos |
| `artifacts/signage/src/pages/portal-campaign-report.tsx`, `portal-device-report.tsx` (novos) | páginas |
| `artifacts/signage/src/App.tsx` | rotas |
| `artifacts/signage/src/pages/portal-advertiser.tsx`, `portal-client.tsx` | nome vira link |

---

### Task 1: Regras puras e helpers compartilhados

**Files:**
- Create: `artifacts/api-server/src/lib/sql-time.ts`
- Create: `artifacts/api-server/src/lib/admin-overview/history.ts`
- Create: `artifacts/api-server/src/lib/portal/campaign-window.ts`
- Create: `artifacts/api-server/src/lib/portal/device-days.ts`
- Modify: `artifacts/api-server/src/lib/admin-overview/queries.ts` (usa `historyStartKey()`, `dayKeySql`, `hourOfDaySql`)
- Test: `artifacts/api-server/src/lib/admin-overview/__tests__/history.test.ts`, `artifacts/api-server/src/lib/portal/__tests__/campaign-window.test.ts`, `artifacts/api-server/src/lib/portal/__tests__/device-days.test.ts`

**Interfaces:**
- Consumes: `dailyAvailability`, `nextDayKey` (`lib/admin-overview/availability.ts`); `businessDayKey` (`lib/portal/period.ts`); `BUSINESS_TIME_ZONE` (`lib/ad-eligibility.ts`).
- Produces:
  - `dayKeySql(column: AnyColumn): SQL<string>`, `hourOfDaySql(column: AnyColumn): SQL<number>` em `lib/sql-time.ts`
  - `historyStartFrom(firstStartedAt: string | Date | null | undefined, timeZone?: string): string | null` e `historyStartKey(): Promise<string | null>` em `lib/admin-overview/history.ts`
  - `type CampaignStatus = "agendada" | "no_ar" | "encerrada"`, `interface CampaignWindow { status: CampaignStatus; from: Date; to: Date; keys: string[] }`, `campaignWindow(startsAt: Date, endsAt: Date, now: Date, timeZone?: string): CampaignWindow`
  - `interface DeviceDay { date: string; online: boolean | null }`, `deviceOnlineDays(keys: string[], sessions: Array<{ startedAt: Date; lastSeenAt: Date }>, device: { id: number; createdAt: Date }, historyStartKey: string | null, timeZone?: string): DeviceDay[]`, `countOnlineDays(days: DeviceDay[]): { daysOnline: number; daysWithHistory: number }`

- [ ] **Step 1: Testes que falham**

`artifacts/api-server/src/lib/admin-overview/__tests__/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { historyStartFrom } from "../history";

describe("historyStartFrom", () => {
  // A gravação começou no meio do dia local: esse dia é parcial e vira "sem dados".
  it("é o dia seguinte ao dia local da sessão mais antiga", () => {
    expect(historyStartFrom(new Date("2026-09-25T13:00:00Z"), "America/Sao_Paulo")).toBe("2026-09-26");
  });

  it("usa o dia local, não o UTC (23h de São Paulo ainda é o dia anterior)", () => {
    expect(historyStartFrom(new Date("2026-09-26T02:00:00Z"), "America/Sao_Paulo")).toBe("2026-09-26");
  });

  it("aceita o texto que o driver devolve para MIN(timestamptz)", () => {
    expect(historyStartFrom("2026-09-25 13:00:00+00", "America/Sao_Paulo")).toBe("2026-09-26");
  });

  it("sem sessão nenhuma, não há histórico", () => {
    expect(historyStartFrom(null)).toBeNull();
    expect(historyStartFrom(undefined)).toBeNull();
  });
});
```

`artifacts/api-server/src/lib/portal/__tests__/campaign-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { campaignWindow } from "../campaign-window";

const TZ = "America/Sao_Paulo";
// 01/09 00:00 local até 30/09 23:59:59 local.
const STARTS = new Date("2026-09-01T03:00:00Z");
const ENDS = new Date("2026-10-01T02:59:59Z");

describe("campaignWindow", () => {
  it("agendada: ainda não começou, sem dias", () => {
    const w = campaignWindow(STARTS, ENDS, new Date("2026-08-20T12:00:00Z"), TZ);
    expect(w.status).toBe("agendada");
    expect(w.keys).toEqual([]);
  });

  it("no ar: vai do início até agora", () => {
    const now = new Date("2026-09-03T15:00:00Z");
    const w = campaignWindow(STARTS, ENDS, now, TZ);
    expect(w.status).toBe("no_ar");
    expect(w.from).toEqual(STARTS);
    expect(w.to).toEqual(now);
    expect(w.keys).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("encerrada: vai do início ao fim do contrato", () => {
    const w = campaignWindow(STARTS, ENDS, new Date("2026-10-05T12:00:00Z"), TZ);
    expect(w.status).toBe("encerrada");
    expect(w.to).toEqual(ENDS);
    expect(w.keys).toHaveLength(30);
    expect(w.keys[0]).toBe("2026-09-01");
    expect(w.keys[29]).toBe("2026-09-30");
  });

  // Fim à meia-noite exata é o fim do dia anterior, não um dia a mais.
  it("fim à meia-noite local não ganha um dia a mais", () => {
    const w = campaignWindow(STARTS, new Date("2026-10-01T03:00:00Z"), new Date("2026-10-05T12:00:00Z"), TZ);
    expect(w.keys[w.keys.length - 1]).toBe("2026-09-30");
  });
});
```

`artifacts/api-server/src/lib/portal/__tests__/device-days.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countOnlineDays, deviceOnlineDays } from "../device-days";

const TZ = "America/Sao_Paulo";
const KEYS = ["2026-09-10", "2026-09-11", "2026-09-12"];
const TV = { id: 2, createdAt: new Date("2026-01-01T00:00:00Z") };
const sessao = (startedAt: string, lastSeenAt: string) => ({ startedAt: new Date(startedAt), lastSeenAt: new Date(lastSeenAt) });

describe("deviceOnlineDays", () => {
  it("true no dia com sessão, false nos outros", () => {
    const dias = deviceOnlineDays(KEYS, [sessao("2026-09-11T12:00:00Z", "2026-09-11T20:00:00Z")], TV, "2026-09-01", TZ);
    expect(dias).toEqual([
      { date: "2026-09-10", online: false },
      { date: "2026-09-11", online: true },
      { date: "2026-09-12", online: false },
    ]);
  });

  // Antes do cadastro a TV não existia: não é "parada".
  it("dia antes do cadastro da TV é null", () => {
    const tv = { id: 2, createdAt: new Date("2026-09-11T15:00:00Z") };
    expect(deviceOnlineDays(KEYS, [], tv, "2026-09-01", TZ).map((d) => d.online)).toEqual([null, false, false]);
  });

  it("dia antes do começo do histórico é null", () => {
    expect(deviceOnlineDays(KEYS, [], TV, "2026-09-11", TZ).map((d) => d.online)).toEqual([null, false, false]);
  });
});

describe("countOnlineDays", () => {
  it("conta só os dias com histórico", () => {
    expect(
      countOnlineDays([
        { date: "a", online: null },
        { date: "b", online: true },
        { date: "c", online: false },
        { date: "d", online: true },
      ]),
    ).toEqual({ daysOnline: 2, daysWithHistory: 3 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run history campaign-window device-days`
Expected: FAIL — `../history`, `../campaign-window`, `../device-days` não existem.

- [ ] **Step 3: Implementar**

`artifacts/api-server/src/lib/sql-time.ts`:

```ts
import { sql, type AnyColumn } from "drizzle-orm";
import { BUSINESS_TIME_ZONE } from "./ad-eligibility";

/**
 * Dia e hora locais do negócio dentro do SQL. O fuso entra por `sql.raw`, e
 * não como parâmetro: assim o SELECT e o GROUP BY saem com o mesmo texto e o
 * Postgres aceita o agrupamento. Use só no SELECT/GROUP BY — o WHERE filtra
 * pelo timestamp cru para usar os índices por `created_at`.
 */
const ZONE = sql.raw(`'${BUSINESS_TIME_ZONE}'`);

export function dayKeySql(column: AnyColumn) {
  return sql<string>`to_char((${column} AT TIME ZONE ${ZONE})::date, 'YYYY-MM-DD')`;
}

export function hourOfDaySql(column: AnyColumn) {
  return sql<number>`EXTRACT(HOUR FROM (${column} AT TIME ZONE ${ZONE}))::int`;
}
```

`artifacts/api-server/src/lib/admin-overview/history.ts`:

```ts
import { sql } from "drizzle-orm";
import { db, deviceSessionsTable } from "@workspace/db";
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { businessDayKey } from "../portal/period";
import { nextDayKey } from "./availability";

/**
 * Começo do histórico de conexão: o dia SEGUINTE ao dia local da sessão mais
 * antiga. A gravação começou no meio desse dia, então ele é parcial e
 * mostraria uma queda falsa; é tratado como "sem dados", como os anteriores.
 * Compartilhado pela Visão geral do admin e pelo relatório da TV do cliente,
 * para os dois nunca divergirem.
 */
export function historyStartFrom(
  firstStartedAt: string | Date | null | undefined,
  timeZone: string = BUSINESS_TIME_ZONE,
): string | null {
  if (!firstStartedAt) return null;
  return nextDayKey(businessDayKey(new Date(firstStartedAt), timeZone));
}

export async function historyStartKey(): Promise<string | null> {
  const [first] = await db
    .select({ startedAt: sql<string | Date | null>`MIN(${deviceSessionsTable.startedAt})` })
    .from(deviceSessionsTable);
  return historyStartFrom(first?.startedAt);
}
```

Se `historyStartFrom("2026-09-25 13:00:00+00")` falhar porque o `Date` do Node não entende esse formato, trocar `new Date(firstStartedAt)` por uma conversão que aceite os dois (ex.: `new Date(String(firstStartedAt).replace(" ", "T").replace(/\+00$/, "Z"))` quando for string) e reportar.

`artifacts/api-server/src/lib/portal/campaign-window.ts`:

```ts
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { nextDayKey } from "../admin-overview/availability";
import { businessDayKey } from "./period";

export type CampaignStatus = "agendada" | "no_ar" | "encerrada";

export interface CampaignWindow {
  status: CampaignStatus;
  from: Date;
  to: Date;
  /** Um `YYYY-MM-DD` local por dia do contrato até agora; vazio se agendada. */
  keys: string[];
}

/**
 * A janela que o comprovante cobre: o contrato inteiro, do início até o fim —
 * ou até agora, se a campanha ainda está no ar.
 *
 * O último dia é o do instante anterior ao fim: uma campanha que termina à
 * meia-noite local termina no dia anterior, e não ganha um dia vazio a mais.
 */
export function campaignWindow(
  startsAt: Date,
  endsAt: Date,
  now: Date,
  timeZone: string = BUSINESS_TIME_ZONE,
): CampaignWindow {
  if (now < startsAt) return { status: "agendada", from: startsAt, to: startsAt, keys: [] };

  const running = now < endsAt;
  const to = running ? now : endsAt;
  const firstKey = businessDayKey(startsAt, timeZone);
  const lastInstant = new Date(Math.max(startsAt.getTime(), to.getTime() - 1));
  const lastKey = businessDayKey(lastInstant, timeZone);

  const keys: string[] = [];
  for (let key = firstKey; key <= lastKey; key = nextDayKey(key)) keys.push(key);

  return { status: running ? "no_ar" : "encerrada", from: startsAt, to, keys };
}
```

`artifacts/api-server/src/lib/portal/device-days.ts`:

```ts
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { dailyAvailability } from "../admin-overview/availability";

export interface DeviceDay {
  date: string;
  /** `null` antes do cadastro da TV ou do começo do histórico: "não sei". */
  online: boolean | null;
}

/**
 * Se esta TV funcionou em cada dia — a mesma regra da Visão geral do admin,
 * aplicada a uma TV só, para o cliente e o admin nunca verem números
 * diferentes para a mesma TV.
 */
export function deviceOnlineDays(
  keys: string[],
  sessions: Array<{ startedAt: Date; lastSeenAt: Date }>,
  device: { id: number; createdAt: Date },
  historyStartKey: string | null,
  timeZone: string = BUSINESS_TIME_ZONE,
): DeviceDay[] {
  const points = dailyAvailability(
    keys,
    sessions.map((session) => ({ deviceId: device.id, ...session })),
    [device],
    historyStartKey,
    timeZone,
  );
  return points.map((point) => ({
    date: point.date,
    online: point.activeDevices === null || point.totalDevices === 0 ? null : point.activeDevices > 0,
  }));
}

export function countOnlineDays(days: DeviceDay[]): { daysOnline: number; daysWithHistory: number } {
  return {
    daysOnline: days.filter((day) => day.online === true).length,
    daysWithHistory: days.filter((day) => day.online !== null).length,
  };
}
```

- [ ] **Step 4: Visão geral usa os helpers compartilhados**

Em `artifacts/api-server/src/lib/admin-overview/queries.ts`:
- Trocar o bloco que começa em `// Começo do histórico: o dia SEGUINTE ...` (o `select` de `MIN(...)` e o `const historyStartKey = ...`) por `const historyStart = await historyStartKey();` e passar `historyStart` ao `dailyAvailability`. Importar `historyStartKey` de `./history`.
- Trocar a definição local `DAY_KEY` por `dayKeySql` e `HOUR_OF_DAY` por `hourOfDaySql(playsTable.createdAt)` de `../sql-time` (`DAY_KEY(x)` vira `dayKeySql(x)`).
- Tirar dos imports o que ficar sem uso (provavelmente `nextDayKey`, `businessDayKey`, `BUSINESS_TIME_ZONE`) — `pnpm run typecheck` acusa.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run history campaign-window device-days admin-overview analytics`
Expected: PASS (os testes novos e os da Visão geral, que não mudam).

- [ ] **Step 6: Suíte, tipos, commit**

Run: `pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS.

```bash
git add artifacts/api-server/src/lib/sql-time.ts artifacts/api-server/src/lib/admin-overview artifacts/api-server/src/lib/portal/campaign-window.ts artifacts/api-server/src/lib/portal/device-days.ts artifacts/api-server/src/lib/portal/__tests__
git commit -m "feat(api): regras de janela da campanha e dias no ar da TV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Relatório da campanha (API)

**Files:**
- Modify: `artifacts/api-server/src/lib/portal/queries.ts` (exportar `campaignTargetColumns` e `loadNetwork`, usados por `advertiserCampaigns`)
- Create: `artifacts/api-server/src/lib/portal/reports.ts`
- Modify: `artifacts/api-server/src/routes/portal.ts`
- Test: `artifacts/api-server/src/routes/__tests__/portal-reports.test.ts`

**Interfaces:**
- Consumes: `campaignWindow` (Task 1), `dayKeySql`, `hourOfDaySql` (Task 1), `fillHours` (`lib/admin-overview/hours.ts`), `fillSeries` (`lib/portal/series.ts`), `countReachedDevices` (`lib/ad-eligibility.ts`), `scanRate` (`lib/scan-rate.ts`), `businessDayKey` (`lib/portal/period.ts`).
- Produces:
  - em `queries.ts`: `campaignTargetColumns` (objeto de colunas do drizzle: `targetMode`, `deviceIds`, `segmentIds`, `advertiserSegmentId`, `advertiserCompanyId`) e `loadNetwork(): Promise<Array<{ id: number; companyId: number; segmentId: number | null }>>`
  - em `reports.ts`: `campaignOwner(campaignId: number): Promise<number | null>` (advertiserId) e `campaignReport(campaignId: number, now?: Date): Promise<CampaignReport | null>`, com `CampaignReport` no formato do spec.
  - rota `GET /portal/advertiser/campaigns/:id/report`.

- [ ] **Step 1: Testes da rota que falham**

`artifacts/api-server/src/routes/__tests__/portal-reports.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

const SECRET = "segredo-relatorios";
const loadAuthContext = vi.fn();
const campaignOwner = vi.fn();
const campaignReport = vi.fn();
const deviceOwner = vi.fn();
const deviceReport = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
}));
vi.mock("../../lib/portal/reports", () => ({
  campaignOwner: (...a: unknown[]) => campaignOwner(...a),
  campaignReport: (...a: unknown[]) => campaignReport(...a),
  deviceOwner: (...a: unknown[]) => deviceOwner(...a),
  deviceReport: (...a: unknown[]) => deviceReport(...a),
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
const clientCtx = { userId: 8, email: "c@b.com", isActive: true, mustChangePassword: false, clientIds: [4], advertiserIds: [] };

async function get(path: string, sub: string) {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return request(app).get(path).set("Cookie", [`sid=${createSession(SECRET, sub)}`]);
}

const REPORT = { campaign: { id: 5 } };

beforeEach(() => {
  for (const fn of [loadAuthContext, campaignOwner, campaignReport, deviceOwner, deviceReport]) fn.mockReset();
});

describe("GET /portal/advertiser/campaigns/:id/report", () => {
  it("id inválido responde 400", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    const res = await get("/portal/advertiser/campaigns/abc/report", "7");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Campanha inválida." });
  });

  // Não confirma que a campanha de outro anunciante existe, e nem calcula o relatório.
  it("campanha de outro anunciante responde 404 sem calcular o relatório", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    campaignOwner.mockResolvedValue(10);
    const res = await get("/portal/advertiser/campaigns/5/report", "7");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Campaign not found" });
    expect(campaignReport).not.toHaveBeenCalled();
  });

  it("campanha inexistente responde 404", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    campaignOwner.mockResolvedValue(null);
    const res = await get("/portal/advertiser/campaigns/5/report", "7");
    expect(res.status).toBe(404);
    expect(campaignReport).not.toHaveBeenCalled();
  });

  it("campanha do anunciante devolve o relatório", async () => {
    loadAuthContext.mockResolvedValue(advCtx);
    campaignOwner.mockResolvedValue(9);
    campaignReport.mockResolvedValue(REPORT);
    const res = await get("/portal/advertiser/campaigns/5/report", "7");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(REPORT);
    expect(campaignReport).toHaveBeenCalledWith(5);
  });
});
```

(O `clientCtx` é usado pelos testes da Task 3, no mesmo arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run portal-reports`
Expected: FAIL — a rota não existe (404 em todos, inclusive no de id inválido; o de 200 falha).

- [ ] **Step 3: Extrair alvo e rede em `queries.ts`**

Em `artifacts/api-server/src/lib/portal/queries.ts`, antes de `advertiserCampaigns`:

```ts
/**
 * Colunas que descrevem o alvo de uma campanha, no formato que
 * `countReachedDevices` espera. Compartilhadas pela lista de campanhas e pelo
 * relatório, para "TVs no alvo" sair da mesma conta nos dois.
 */
export const campaignTargetColumns = {
  targetMode: sql<"all" | "devices" | "segments">`${campaignsTable.targetMode}`,
  deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
  segmentIds: sql<number[]>`coalesce((select array_agg(cs.segment_id) from campaign_segments cs where cs.campaign_id = ${campaignsTable.id}), array[]::int[])`,
  advertiserSegmentId: companiesTable.segmentId,
  advertiserCompanyId: advertisersTable.companyId,
};

/** A rede inteira, no formato que `countReachedDevices` espera. */
export async function loadNetwork() {
  return db
    .select({ id: devicesTable.id, companyId: clientsTable.companyId, segmentId: companiesTable.segmentId })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId));
}
```

Em `advertiserCampaigns`, trocar as cinco colunas `targetMode … advertiserCompanyId` do `select` por `...campaignTargetColumns,` e a consulta `const network = await db.select(...)...` por `const network = await loadNetwork();`. O comportamento não muda; os testes existentes do portal seguem passando.

- [ ] **Step 4: Consultas do relatório da campanha**

`artifacts/api-server/src/lib/portal/reports.ts`:

```ts
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  announcementsTable,
  advertisersTable,
  campaignAnnouncementsTable,
  campaignsTable,
  clientsTable,
  companiesTable,
  db,
  devicesTable,
  playsTable,
  scansTable,
} from "@workspace/db";
import { countReachedDevices } from "../ad-eligibility";
import { fillHours, type HourPoint } from "../admin-overview/hours";
import { scanRate } from "../scan-rate";
import { dayKeySql, hourOfDaySql } from "../sql-time";
import { campaignWindow, type CampaignStatus } from "./campaign-window";
import { businessDayKey } from "./period";
import { campaignTargetColumns, loadNetwork } from "./queries";
import { fillSeries } from "./series";

const PLAY_COUNT = sql<number>`COUNT(${playsTable.id})::int`;

/** Dono da campanha, para a rota conferir o escopo antes de qualquer cálculo. */
export async function campaignOwner(campaignId: number): Promise<number | null> {
  const [row] = await db
    .select({ advertiserId: campaignsTable.advertiserId })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  return row?.advertiserId ?? null;
}

export interface CampaignReport {
  campaign: { id: number; name: string; startsAt: Date; endsAt: Date; isActive: boolean; status: CampaignStatus };
  period: { from: string; to: string };
  totals: {
    plays: number;
    durationSeconds: number;
    devicesPlayed: number;
    devicesTargeted: number;
    stores: number;
    scans: number;
    uniqueVisitors: number;
    scanRate: number;
  };
  series: Array<{ date: string; plays: number; scans: number }>;
  hours: HourPoint[];
  devices: Array<{
    deviceId: number;
    storeName: string;
    deviceName: string;
    location: string | null;
    plays: number;
    firstPlayedAt: Date;
    lastPlayedAt: Date;
  }>;
  announcements: Array<{ announcementId: number; title: string; plays: number; scans: number; scanRate: number }>;
}

/**
 * Comprovante da campanha: o contrato inteiro (ou até agora). NUNCA expõe
 * `contractValue`. `null` se a campanha não existe — a rota já conferiu o
 * dono antes.
 */
export async function campaignReport(campaignId: number, now: Date = new Date()): Promise<CampaignReport | null> {
  const [row] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      isActive: campaignsTable.isActive,
      ...campaignTargetColumns,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(eq(campaignsTable.id, campaignId));
  if (!row) return null;

  const { targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId, ...campaignRow } = row;
  const window = campaignWindow(row.startsAt, row.endsAt, now);
  const campaign = { ...campaignRow, status: window.status };
  const devicesTargeted = countReachedDevices(
    { targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId },
    await loadNetwork(),
  );

  if (window.status === "agendada") {
    const startKey = businessDayKey(row.startsAt);
    return {
      campaign,
      period: { from: startKey, to: startKey },
      totals: {
        plays: 0, durationSeconds: 0, devicesPlayed: 0, devicesTargeted, stores: 0,
        scans: 0, uniqueVisitors: 0, scanRate: 0,
      },
      series: [],
      hours: fillHours([]),
      devices: [],
      announcements: [],
    };
  }

  const playsWhere = and(
    eq(playsTable.campaignId, campaignId),
    gte(playsTable.createdAt, window.from),
    lt(playsTable.createdAt, window.to),
  );
  // Bot fica fora: anunciante não paga para ver crawler.
  const scansWhere = and(
    eq(scansTable.campaignId, campaignId),
    eq(scansTable.isBot, false),
    gte(scansTable.createdAt, window.from),
    lt(scansTable.createdAt, window.to),
  );

  const [playTotals] = await db
    .select({ n: PLAY_COUNT, duration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int` })
    .from(playsTable)
    .where(playsWhere);

  const [scanTotals] = await db
    .select({ n: sql<number>`COUNT(*)::int`, unique: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int` })
    .from(scansTable)
    .where(scansWhere);

  const playDays = await db
    .select({ day: dayKeySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(playsWhere)
    .groupBy(dayKeySql(playsTable.createdAt));

  const scanDays = await db
    .select({ day: dayKeySql(scansTable.createdAt), scans: sql<number>`COUNT(*)::int` })
    .from(scansTable)
    .where(scansWhere)
    .groupBy(dayKeySql(scansTable.createdAt));

  const hourRows = await db
    .select({ hour: hourOfDaySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(playsWhere)
    .groupBy(hourOfDaySql(playsTable.createdAt));

  // Todas as TVs que exibiram — é o comprovante, sem corte em top 10.
  const deviceRows = await db
    .select({
      deviceId: devicesTable.id,
      clientId: devicesTable.clientId,
      storeName: companiesTable.name,
      deviceName: devicesTable.name,
      location: devicesTable.location,
      plays: PLAY_COUNT,
      firstPlayedAt: sql<Date>`MIN(${playsTable.createdAt})`,
      lastPlayedAt: sql<Date>`MAX(${playsTable.createdAt})`,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(playsWhere)
    .groupBy(devicesTable.id, devicesTable.clientId, companiesTable.name, devicesTable.name, devicesTable.location)
    .orderBy(desc(PLAY_COUNT), asc(devicesTable.id));

  // Peças: as ligadas à campanha hoje E as que exibiram na janela — uma peça
  // trocada no meio da campanha continua no comprovante, e a soma das linhas
  // bate com o total.
  const linked = await db
    .select({ announcementId: announcementsTable.id, title: announcementsTable.title })
    .from(campaignAnnouncementsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignAnnouncementsTable.announcementId))
    .where(eq(campaignAnnouncementsTable.campaignId, campaignId));

  const playedPieces = await db
    .select({ announcementId: announcementsTable.id, title: announcementsTable.title, plays: PLAY_COUNT })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(playsWhere)
    .groupBy(announcementsTable.id, announcementsTable.title);

  const scannedPieces = await db
    .select({ announcementId: scansTable.announcementId, scans: sql<number>`COUNT(*)::int` })
    .from(scansTable)
    .where(scansWhere)
    .groupBy(scansTable.announcementId);
  const scansByPiece = new Map(scannedPieces.map((piece) => [piece.announcementId, piece.scans]));

  const pieces = new Map<number, { announcementId: number; title: string; plays: number }>();
  for (const piece of linked) pieces.set(piece.announcementId, { ...piece, plays: 0 });
  for (const piece of playedPieces) pieces.set(piece.announcementId, piece);
  const announcements = [...pieces.values()]
    .map((piece) => {
      const scans = scansByPiece.get(piece.announcementId) ?? 0;
      return { ...piece, scans, scanRate: scanRate(scans, piece.plays) };
    })
    .sort((a, b) => b.plays - a.plays || a.announcementId - b.announcementId);

  const plays = fillSeries(window.keys, playDays, ["plays"]);
  const scans = fillSeries(window.keys, scanDays, ["scans"]);

  const totals = {
    plays: playTotals?.n ?? 0,
    durationSeconds: playTotals?.duration ?? 0,
    devicesPlayed: deviceRows.length,
    devicesTargeted,
    stores: new Set(deviceRows.map((device) => device.clientId)).size,
    scans: scanTotals?.n ?? 0,
    uniqueVisitors: scanTotals?.unique ?? 0,
    scanRate: 0,
  };
  totals.scanRate = scanRate(totals.scans, totals.plays);

  return {
    campaign,
    period: { from: window.keys[0], to: window.keys[window.keys.length - 1] },
    totals,
    series: window.keys.map((date, index) => ({ date, plays: plays[index].plays, scans: scans[index].scans })),
    hours: fillHours(hourRows),
    devices: deviceRows.map(({ clientId, ...device }) => ({
      ...device,
      firstPlayedAt: new Date(device.firstPlayedAt),
      lastPlayedAt: new Date(device.lastPlayedAt),
    })),
    announcements,
  };
}
```

`scansTable.announcementId` é anulável no schema; se o typecheck reclamar do `Map<number | null, …>`, filtrar `piece.announcementId !== null` ao montar o mapa.

- [ ] **Step 5: Rota**

Em `artifacts/api-server/src/routes/portal.ts`, acrescentar ao import: `import { campaignOwner, campaignReport } from "../lib/portal/reports";`. Logo depois da rota `/advertiser/overview`:

```ts
/**
 * Comprovante de uma campanha. O dono é conferido antes de calcular qualquer
 * coisa: campanha de outro anunciante responde igual a inexistente, para não
 * confirmar que ela existe nem vazar loja, peça ou volume de outro cliente.
 */
router.get("/advertiser/campaigns/:id/report", requireAdvertiser, async (req, res) => {
  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) {
    res.status(400).json({ error: "Campanha inválida." });
    return;
  }
  const scope = advertiserScope(req);
  const owner = scope.length === 0 ? null : await campaignOwner(campaignId);
  if (owner === null || !scope.includes(owner)) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const report = await campaignReport(campaignId);
  if (!report) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.json(report);
});
```

- [ ] **Step 6: Rodar, suíte, tipos**

Run: `pnpm --filter ./artifacts/api-server exec vitest run portal-reports portal-overview portal-scope && pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/portal/queries.ts artifacts/api-server/src/lib/portal/reports.ts artifacts/api-server/src/routes/portal.ts artifacts/api-server/src/routes/__tests__/portal-reports.test.ts
git commit -m "feat(api): relatório da campanha no portal do anunciante

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Relatório da TV (API)

**Files:**
- Modify: `artifacts/api-server/src/lib/portal/reports.ts` (acrescentar no fim)
- Modify: `artifacts/api-server/src/routes/portal.ts`
- Test: `artifacts/api-server/src/routes/__tests__/portal-reports.test.ts` (acrescentar `describe`)

**Interfaces:**
- Consumes: `deviceOnlineDays`, `countOnlineDays`, `historyStartKey`, `dayKeySql`, `hourOfDaySql` (Task 1); `portalPeriod`, `previousPortalPeriod`, `PortalDays` (`lib/portal/period.ts`); `isOnlineAt` (`lib/device-presence.ts`); `fillHours`, `fillSeries`.
- Produces: `deviceOwner(deviceId: number): Promise<number | null>` (clientId), `deviceReport(deviceId: number, days: PortalDays, now?: Date): Promise<DeviceReport | null>`, rota `GET /portal/client/devices/:id/report`.

- [ ] **Step 1: Testes que falham**

No fim de `portal-reports.test.ts`:

```ts
describe("GET /portal/client/devices/:id/report", () => {
  it("id inválido responde 400", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/client/devices/0/report", "8");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "TV inválida." });
  });

  it("days inválido responde 400", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    const res = await get("/portal/client/devices/2/report?days=15", "8");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Período inválido. Use days=7, 30 ou 90." });
  });

  it("TV de outra loja responde 404 sem calcular o relatório", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    deviceOwner.mockResolvedValue(99);
    const res = await get("/portal/client/devices/2/report", "8");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
    expect(deviceReport).not.toHaveBeenCalled();
  });

  it("TV da loja devolve o relatório com 30 dias por padrão", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    deviceOwner.mockResolvedValue(4);
    deviceReport.mockResolvedValue({ device: { id: 2 } });
    const res = await get("/portal/client/devices/2/report", "8");
    expect(res.status).toBe(200);
    expect(deviceReport).toHaveBeenCalledWith(2, 30);
  });

  it("repassa days=7", async () => {
    loadAuthContext.mockResolvedValue(clientCtx);
    deviceOwner.mockResolvedValue(4);
    deviceReport.mockResolvedValue({ device: { id: 2 } });
    await get("/portal/client/devices/2/report?days=7", "8");
    expect(deviceReport).toHaveBeenCalledWith(2, 7);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run portal-reports`
Expected: FAIL nos testes novos (rota inexistente).

- [ ] **Step 3: Consultas**

Em `reports.ts`, acrescentar aos imports: `deviceSessionsTable` (de `@workspace/db`), `isNull` não é necessário; `import { isOnlineAt } from "../device-presence";`, `import { historyStartKey } from "../admin-overview/history";`, `import { countOnlineDays, deviceOnlineDays } from "./device-days";`, e `portalPeriod, previousPortalPeriod, type PortalDays` no import de `./period`. No fim do arquivo:

```ts
/** Loja dona da TV, para a rota conferir o escopo antes de qualquer cálculo. */
export async function deviceOwner(deviceId: number): Promise<number | null> {
  const [row] = await db.select({ clientId: devicesTable.clientId }).from(devicesTable).where(eq(devicesTable.id, deviceId));
  return row?.clientId ?? null;
}

export interface DeviceReport {
  device: { id: number; name: string; location: string | null; isOnline: boolean };
  period: { days: PortalDays; from: string; to: string };
  totals: { plays: number; durationSeconds: number; daysOnline: number; daysWithHistory: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number; online: boolean | null }>;
  hours: HourPoint[];
  campaigns: Array<{ campaignId: number | null; campaignName: string | null; advertiserName: string | null; plays: number }>;
}

/** O que a TV fez no período: se ficou no ar e o que passou nela. */
export async function deviceReport(deviceId: number, days: PortalDays, now: Date = new Date()): Promise<DeviceReport | null> {
  const [device] = await db
    .select({
      id: devicesTable.id,
      name: devicesTable.name,
      location: devicesTable.location,
      lastSeenAt: devicesTable.lastSeenAt,
      createdAt: devicesTable.createdAt,
    })
    .from(devicesTable)
    .where(eq(devicesTable.id, deviceId));
  if (!device) return null;

  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);
  const playsIn = (from: Date, to: Date) =>
    and(eq(playsTable.deviceId, deviceId), gte(playsTable.createdAt, from), lt(playsTable.createdAt, to));
  const current = playsIn(period.from, period.to);

  const [totals] = await db
    .select({ n: PLAY_COUNT, duration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int` })
    .from(playsTable)
    .where(current);
  const [before] = await db.select({ n: PLAY_COUNT }).from(playsTable).where(playsIn(previous.from, previous.to));

  const playDays = await db
    .select({ day: dayKeySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(current)
    .groupBy(dayKeySql(playsTable.createdAt));

  const hourRows = await db
    .select({ hour: hourOfDaySql(playsTable.createdAt), plays: PLAY_COUNT })
    .from(playsTable)
    .where(current)
    .groupBy(hourOfDaySql(playsTable.createdAt));

  const sessions = await db
    .select({ startedAt: deviceSessionsTable.startedAt, lastSeenAt: deviceSessionsTable.lastSeenAt })
    .from(deviceSessionsTable)
    .where(
      and(
        eq(deviceSessionsTable.deviceId, deviceId),
        lt(deviceSessionsTable.startedAt, period.to),
        gte(deviceSessionsTable.lastSeenAt, period.from),
      ),
    );

  // Conteúdo sem campanha (playlist e encartes da loja) cai na linha de
  // campanha nula: LEFT JOIN, para ele não sumir do total.
  const campaigns = await db
    .select({
      campaignId: playsTable.campaignId,
      campaignName: campaignsTable.name,
      advertiserName: companiesTable.name,
      plays: PLAY_COUNT,
    })
    .from(playsTable)
    .leftJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .leftJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .leftJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(current)
    .groupBy(playsTable.campaignId, campaignsTable.name, companiesTable.name)
    .orderBy(desc(PLAY_COUNT), sql`${playsTable.campaignId} ASC NULLS LAST`);

  const onlineDays = deviceOnlineDays(period.keys, sessions, device, await historyStartKey());
  const plays = fillSeries(period.keys, playDays, ["plays"]);

  return {
    device: { id: device.id, name: device.name, location: device.location, isOnline: isOnlineAt(device.lastSeenAt, now) },
    period: { days, from: period.keys[0], to: period.keys[period.keys.length - 1] },
    totals: {
      plays: totals?.n ?? 0,
      durationSeconds: totals?.duration ?? 0,
      ...countOnlineDays(onlineDays),
      previous: { plays: before?.n ?? 0 },
    },
    series: period.keys.map((date, index) => ({ date, plays: plays[index].plays, online: onlineDays[index].online })),
    hours: fillHours(hourRows),
    campaigns,
  };
}
```

- [ ] **Step 4: Rota**

Em `routes/portal.ts`, acrescentar `deviceOwner, deviceReport` ao import de `../lib/portal/reports`. Logo depois da rota `/client/devices/:id/preview`:

```ts
/**
 * Relatório de uma TV da loja. Mesma regra da prévia: TV de outra loja
 * responde igual a TV inexistente.
 */
router.get("/client/devices/:id/report", requireClient, async (req, res) => {
  const deviceId = Number(req.params.id);
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    res.status(400).json({ error: "TV inválida." });
    return;
  }
  const days = resolvePeriod(req, res);
  if (days === null) return;
  const scope = clientScope(req);
  const owner = scope.length === 0 ? null : await deviceOwner(deviceId);
  if (owner === null || !scope.includes(owner)) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const report = await deviceReport(deviceId, days);
  if (!report) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(report);
});
```

- [ ] **Step 5: Rodar, suíte, tipos, commit**

Run: `pnpm --filter ./artifacts/api-server exec vitest run portal-reports && pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS.

```bash
git add artifacts/api-server/src/lib/portal/reports.ts artifacts/api-server/src/routes/portal.ts artifacts/api-server/src/routes/__tests__/portal-reports.test.ts
git commit -m "feat(api): relatório da TV no portal do cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Blocos do relatório (front)

**Files:**
- Create: `artifacts/signage/src/components/portal/where-played-table.tsx`
- Create: `artifacts/signage/src/components/portal/campaign-pieces-table.tsx`
- Create: `artifacts/signage/src/components/portal/online-days-strip.tsx`
- Create: `artifacts/signage/src/components/portal/device-campaigns-table.tsx`
- Test: `artifacts/signage/src/components/portal/__tests__/report-blocks.test.tsx`

**Interfaces:**
- Produces:
  - `interface WherePlayedRow { deviceId: number; storeName: string; deviceName: string; location: string | null; plays: number; firstPlayedAt: string; lastPlayedAt: string }`, `WherePlayedTable({ items }: { items: WherePlayedRow[] })`
  - `interface PieceRow { announcementId: number; title: string; plays: number; scans: number; scanRate: number }`, `CampaignPiecesTable({ items }: { items: PieceRow[] })`
  - `interface OnlineDay { date: string; online: boolean | null }`, `OnlineDaysStrip({ days }: { days: OnlineDay[] })`
  - `interface DeviceCampaignRow { campaignId: number | null; campaignName: string | null; advertiserName: string | null; plays: number }`, `DeviceCampaignsTable({ items }: { items: DeviceCampaignRow[] })`

- [ ] **Step 1: Testes que falham**

`artifacts/signage/src/components/portal/__tests__/report-blocks.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WherePlayedTable } from '../where-played-table';
import { CampaignPiecesTable } from '../campaign-pieces-table';
import { OnlineDaysStrip } from '../online-days-strip';
import { DeviceCampaignsTable } from '../device-campaigns-table';

describe('WherePlayedTable', () => {
  it('mostra loja, TV, local, exibições e quando passou (hora de São Paulo)', () => {
    render(
      <WherePlayedTable
        items={[{
          deviceId: 2, storeName: 'Padaria Central', deviceName: 'Balcão', location: 'Entrada', plays: 1240,
          firstPlayedAt: '2026-09-01T11:02:00.000Z', lastPlayedAt: '2026-09-30T21:40:00.000Z',
        }]}
      />,
    );
    const linha = screen.getByRole('row', { name: /Padaria Central/ });
    expect(linha).toHaveTextContent('Balcão');
    expect(linha).toHaveTextContent('Entrada');
    expect(linha).toHaveTextContent('1.240');
    expect(linha.textContent).toMatch(/01\/09.*08:02/);
    expect(linha.textContent).toMatch(/30\/09.*18:40/);
  });

  it('sem local mostra traço; vazio mostra o aviso', () => {
    const { rerender } = render(
      <WherePlayedTable items={[{ deviceId: 3, storeName: 'Mercado', deviceName: 'Caixa', location: null, plays: 1, firstPlayedAt: '2026-09-01T11:00:00Z', lastPlayedAt: '2026-09-01T11:00:00Z' }]} />,
    );
    expect(screen.getByRole('row', { name: /Mercado/ })).toHaveTextContent('—');
    rerender(<WherePlayedTable items={[]} />);
    expect(screen.getByText('Nenhuma exibição até agora')).toBeInTheDocument();
  });
});

describe('CampaignPiecesTable', () => {
  it('mostra exibições, scans e taxa de cada peça, com a nota sobre scan', () => {
    render(<CampaignPiecesTable items={[{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137 }]} />);
    const linha = screen.getByRole('row', { name: /Pão de mel/ });
    expect(linha).toHaveTextContent('3.001');
    expect(linha).toHaveTextContent('41');
    expect(linha).toHaveTextContent('1,37%');
    expect(screen.getByText(/Scan mede resposta, não alcance/)).toBeInTheDocument();
  });
});

describe('OnlineDaysStrip', () => {
  const dias = [
    { date: '2026-09-10', online: null },
    { date: '2026-09-11', online: false },
    { date: '2026-09-12', online: true },
  ];

  it('rotula cada dia para leitor de tela; o último é hoje, em andamento', () => {
    render(<OnlineDaysStrip days={dias} />);
    const lista = screen.getByRole('list', { name: 'Dias no ar' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens.map((item) => item.getAttribute('aria-label'))).toEqual([
      '10/09: sem dados',
      '11/09: parada',
      '12/09: funcionou (hoje, em andamento)',
    ]);
  });

  it('mostra a legenda', () => {
    render(<OnlineDaysStrip days={dias} />);
    expect(screen.getByText('Funcionou')).toBeInTheDocument();
    expect(screen.getByText('Parada')).toBeInTheDocument();
    expect(screen.getByText('Sem dados')).toBeInTheDocument();
  });
});

describe('DeviceCampaignsTable', () => {
  it('campanha com anunciante e o conteúdo sem campanha como "Conteúdo da loja"', () => {
    render(
      <DeviceCampaignsTable
        items={[
          { campaignId: 4, campaignName: 'Natal', advertiserName: 'Padaria Central', plays: 900 },
          { campaignId: null, campaignName: null, advertiserName: null, plays: 300 },
        ]}
      />,
    );
    expect(screen.getByRole('row', { name: /Natal/ })).toHaveTextContent('Padaria Central');
    expect(screen.getByRole('row', { name: /Conteúdo da loja/ })).toHaveTextContent('300');
  });

  it('vazio mostra o aviso do período', () => {
    render(<DeviceCampaignsTable items={[]} />);
    expect(screen.getByText('Nenhuma exibição no período')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage exec vitest run report-blocks`
Expected: FAIL — os imports não resolvem.

- [ ] **Step 3: Implementar**

`artifacts/signage/src/components/portal/where-played-table.tsx`:

```tsx
export interface WherePlayedRow {
  deviceId: number;
  storeName: string;
  deviceName: string;
  location: string | null;
  plays: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
}

/** Data e hora no fuso do negócio: o comprovante não pode mudar com o fuso de quem abre. */
const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

/**
 * "Onde passou": a prova de veiculação. Todas as TVs, sem corte — é o que o
 * anunciante pagou para ter.
 */
export function WherePlayedTable({ items }: { items: WherePlayedRow[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição até agora</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Loja</th>
            <th className="py-2 font-medium">TV</th>
            <th className="py-2 font-medium">Local</th>
            <th className="py-2 text-right font-medium">Exibições</th>
            <th className="py-2 font-medium">Primeira</th>
            <th className="py-2 font-medium">Última</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.deviceId} className="break-inside-avoid border-b last:border-0">
              <td className="py-2 font-medium">{row.storeName}</td>
              <td className="py-2">{row.deviceName}</td>
              <td className="py-2 text-muted-foreground">{row.location ?? '—'}</td>
              <td className="py-2 text-right tabular-nums">{row.plays.toLocaleString('pt-BR')}</td>
              <td className="py-2 whitespace-nowrap text-muted-foreground">{when(row.firstPlayedAt)}</td>
              <td className="py-2 whitespace-nowrap text-muted-foreground">{when(row.lastPlayedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`artifacts/signage/src/components/portal/campaign-pieces-table.tsx`:

```tsx
export interface PieceRow {
  announcementId: number;
  title: string;
  plays: number;
  scans: number;
  scanRate: number;
}

const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Qual arte funcionou: a resposta por peça, que o anunciante usa na próxima campanha. */
export function CampaignPiecesTable({ items }: { items: PieceRow[] }) {
  return (
    <div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma peça nesta campanha</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">Peça</th>
                <th className="py-2 text-right font-medium">Exibições</th>
                <th className="py-2 text-right font-medium">Scans</th>
                <th className="py-2 text-right font-medium">Taxa</th>
              </tr>
            </thead>
            <tbody>
              {items.map((piece) => (
                <tr key={piece.announcementId} className="break-inside-avoid border-b last:border-0">
                  <td className="py-2 font-medium">{piece.title}</td>
                  <td className="py-2 text-right tabular-nums">{piece.plays.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums">{piece.scans.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{rate(piece.scanRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e múltiplos scans da
        mesma pessoa contam no número bruto — use a taxa para comparar peças entre si.
      </p>
    </div>
  );
}
```

`artifacts/signage/src/components/portal/online-days-strip.tsx`:

```tsx
import { cn } from '@/lib/utils';

export interface OnlineDay {
  date: string;
  online: boolean | null;
}

const shortDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
};

const STATE = {
  true: { label: 'funcionou', className: 'bg-emerald-500' },
  false: { label: 'parada', className: 'bg-red-500' },
  null: { label: 'sem dados', className: 'bg-muted-foreground/35' },
} as const;

/**
 * Um quadrado por dia. CSS, e não gráfico: com uma TV só, barra de 0 ou 1 é
 * desperdício, e quadrado colorido imprime bem. Cada quadrado tem rótulo para
 * leitor de tela; o último é hoje, ainda em andamento — as TVs desligam fora
 * do horário da loja, e de manhã cedo hoje pareceria uma TV parada.
 */
export function OnlineDaysStrip({ days }: { days: OnlineDay[] }) {
  return (
    <div>
      <ul aria-label="Dias no ar" className="flex flex-wrap gap-1">
        {days.map((day, index) => {
          const state = STATE[String(day.online) as 'true' | 'false' | 'null'];
          const today = index === days.length - 1;
          return (
            <li
              key={day.date}
              aria-label={`${shortDate(day.date)}: ${state.label}${today ? ' (hoje, em andamento)' : ''}`}
              title={`${shortDate(day.date)}: ${state.label}`}
              className={cn('h-5 w-5 rounded-sm', state.className, today && 'opacity-50 outline-dashed outline-1 outline-foreground')}
            />
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-500" />Funcionou</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-500" />Parada</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-muted-foreground/35" />Sem dados</span>
      </div>
    </div>
  );
}
```

`artifacts/signage/src/components/portal/device-campaigns-table.tsx`:

```tsx
export interface DeviceCampaignRow {
  campaignId: number | null;
  campaignName: string | null;
  advertiserName: string | null;
  plays: number;
}

/** O que passou nesta TV. O que não tem campanha é da própria loja (playlist e encartes). */
export function DeviceCampaignsTable({ items }: { items: DeviceCampaignRow[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição no período</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Campanha</th>
            <th className="py-2 font-medium">Anunciante</th>
            <th className="py-2 text-right font-medium">Exibições</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.campaignId ?? 'loja'} className="break-inside-avoid border-b last:border-0">
              <td className="py-2 font-medium">{row.campaignName ?? 'Conteúdo da loja'}</td>
              <td className="py-2 text-muted-foreground">{row.advertiserName ?? '—'}</td>
              <td className="py-2 text-right tabular-nums">{row.plays.toLocaleString('pt-BR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Rodar, tipos, commit**

Run: `pnpm --filter ./artifacts/signage exec vitest run report-blocks && pnpm run typecheck`
Expected: PASS (8 testes) e typecheck limpo. Se `toLocaleString` no jsdom sair num formato que não casa com as regex (`01/09…08:02`), ajustar só a regex para o formato real que o Node produz e reportar.

```bash
git add artifacts/signage/src/components/portal/where-played-table.tsx artifacts/signage/src/components/portal/campaign-pieces-table.tsx artifacts/signage/src/components/portal/online-days-strip.tsx artifacts/signage/src/components/portal/device-campaigns-table.tsx artifacts/signage/src/components/portal/__tests__/report-blocks.test.tsx
git commit -m "feat(portal): blocos dos relatórios de campanha e de TV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Página do relatório da campanha

**Files:**
- Create: `artifacts/signage/src/pages/portal-campaign-report.tsx`
- Modify: `artifacts/signage/src/App.tsx` (rota no `PortalRoutes`)
- Modify: `artifacts/signage/src/pages/portal-advertiser.tsx` (nome da campanha vira link)
- Test: `artifacts/signage/src/pages/__tests__/portal-campaign-report.test.tsx`, `artifacts/signage/src/__tests__/rotas-navegacao.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `WherePlayedTable`, `CampaignPiecesTable` (Task 4); `HourlyChart` e `BlockError` (`@/components/analytics/…`); `PageHeader`, `PrintHeader`, `KpiCard`, `TrendChart`.
- Produces: `default function PortalCampaignReport({ id }: { id: number })`; rota `/portal/anunciante/campanhas/:id`.

- [ ] **Step 1: Testes da página que falham**

`artifacts/signage/src/pages/__tests__/portal-campaign-report.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalCampaignReport from '../portal-campaign-report';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const REPORT = {
  campaign: { id: 4, name: 'Natal', startsAt: '2026-09-01T03:00:00.000Z', endsAt: '2026-10-01T02:59:59.000Z', isActive: true, status: 'encerrada' },
  period: { from: '2026-09-01', to: '2026-09-30' },
  totals: { plays: 9120, durationSeconds: 91200, devicesPlayed: 9, devicesTargeted: 12, stores: 6, scans: 81, uniqueVisitors: 60, scanRate: 0.0089 },
  series: [{ date: '2026-09-01', plays: 300, scans: 2 }],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: hour === 18 ? 50 : 1 })),
  devices: [{ deviceId: 2, storeName: 'Padaria Central', deviceName: 'Balcão', location: 'Entrada', plays: 1240, firstPlayedAt: '2026-09-01T11:02:00.000Z', lastPlayedAt: '2026-09-30T21:40:00.000Z' }],
  announcements: [{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137 }],
};

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(id = 4) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalCampaignReport id={id} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Relatório da campanha', () => {
  it('busca o relatório da campanha pedida', async () => {
    const fetchMock = stub(REPORT);
    renderPage(4);
    await screen.findByRole('heading', { name: 'Natal', level: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('api/portal/advertiser/campaigns/4/report');
  });

  it('mostra a prova de veiculação: período, cards e onde passou', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByText('01/09/2026 a 30/09/2026')).toBeInTheDocument();
    expect(screen.getByText('9.120')).toBeInTheDocument();
    expect(screen.getByText('9 de 12 no alvo')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Padaria Central/ })).toHaveTextContent('1.240');
  });

  it('mostra o resultado: scans, peças e horário de pico', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByRole('row', { name: /Pão de mel/ })).toHaveTextContent('1,37%');
    expect(screen.getByText('Pico: 18h (50 exibições)')).toBeInTheDocument();
  });

  it('tem botão de impressão e cabeçalho do comprovante', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Imprimir / PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Período de 1 de setembro de 2026 a 30 de setembro de 2026/)).toBeInTheDocument();
  });

  it('campanha agendada diz quando começa', async () => {
    stub({ ...REPORT, campaign: { ...REPORT.campaign, status: 'agendada' }, period: { from: '2026-11-01', to: '2026-11-01' }, devices: [], announcements: [], series: [] });
    renderPage();
    expect(await screen.findByText('A campanha começa em 01/11/2026.')).toBeInTheDocument();
    expect(screen.queryByText('Onde passou')).toBeNull();
  });

  it('404 mostra campanha não encontrada com volta para a lista', async () => {
    stub({ error: 'Campaign not found' }, 404);
    renderPage();
    expect(await screen.findByText('Campanha não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Desempenho/ })).toHaveAttribute('href', '/portal/anunciante');
  });

  it('erro de rede oferece tentar de novo', async () => {
    stub({}, 500);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage exec vitest run portal-campaign-report`
Expected: FAIL — `../portal-campaign-report` não existe.

- [ ] **Step 3: Página**

`artifacts/signage/src/pages/portal-campaign-report.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Clock, MapPin, Monitor, Percent, Play, QrCode, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartConfig } from '@/components/ui/chart';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/portal/kpi-card';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { WherePlayedTable, type WherePlayedRow } from '@/components/portal/where-played-table';
import { CampaignPiecesTable, type PieceRow } from '@/components/portal/campaign-pieces-table';
import { HourlyChart } from '@/components/analytics/hourly-chart';
import { BlockError } from '@/components/analytics/block-error';

interface CampaignReport {
  campaign: { id: number; name: string; startsAt: string; endsAt: string; isActive: boolean; status: 'agendada' | 'no_ar' | 'encerrada' };
  period: { from: string; to: string };
  totals: {
    plays: number; durationSeconds: number; devicesPlayed: number; devicesTargeted: number; stores: number;
    scans: number; uniqueVisitors: number; scanRate: number;
  };
  series: Array<{ date: string; plays: number; scans: number }>;
  hours: Array<{ hour: number; plays: number }>;
  devices: WherePlayedRow[];
  announcements: PieceRow[];
}

/** Erro com o status: 404 (campanha de outro anunciante ou inexistente) tem tela própria. */
class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getReport(id: number): Promise<CampaignReport> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/portal/advertiser/campaigns/${id}/report`);
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

const CHART_CONFIG = { plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' } } satisfies ChartConfig;
const int = (n: number) => n.toLocaleString('pt-BR');
const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const fullDate = (key: string) => key.split('-').reverse().join('/');

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

const STATUS = { agendada: 'Agendada', no_ar: 'No ar', encerrada: 'Encerrada' } as const;

/**
 * Comprovante da campanha: o contrato inteiro. Primeiro a prova de veiculação
 * (onde e quando passou), depois o resultado (qual peça respondeu). Impresso,
 * sai com o cabeçalho de período e data de emissão.
 */
export default function PortalCampaignReport({ id }: { id: number }) {
  const report = useQuery({
    queryKey: ['portal', 'advertiser', 'campaign-report', id],
    queryFn: () => getReport(id),
    retry: false,
  });

  if (report.error instanceof HttpError && report.error.status === 404) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-medium">Campanha não encontrada</p>
        <Link href="/portal/anunciante" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Desempenho
        </Link>
      </div>
    );
  }
  if (report.isError) return <BlockError onRetry={() => report.refetch()} />;
  if (!report.data) return <Skeleton className="h-96 w-full rounded-xl" />;

  const { campaign, period, totals } = report.data;
  const periodText =
    campaign.status === 'no_ar'
      ? `desde ${fullDate(period.from)} · no ar`
      : `${fullDate(period.from)} a ${fullDate(period.to)}`;

  return (
    <div>
      <PrintHeader subject={`Campanha ${campaign.name}`} period={period} />
      <div className="print:hidden">
        <PageHeader trail={[{ label: 'Desempenho', href: '/portal/anunciante' }, { label: campaign.name }]} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold print:hidden">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">{periodText}</p>
        </div>
        <Badge variant={campaign.status === 'no_ar' ? 'default' : 'secondary'}>{STATUS[campaign.status]}</Badge>
        <Button variant="outline" size="sm" className="ml-auto print:hidden" onClick={() => window.print()}>
          Imprimir / PDF
        </Button>
      </div>

      {campaign.status === 'agendada' ? (
        <p className="rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          A campanha começa em {fullDate(period.from)}.
        </p>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold">Veiculação</h2>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiCard label="Exibições no contrato" value={int(totals.plays)} icon={Play} />
            <KpiCard label="Tempo de exibição" value={formatDuration(totals.durationSeconds)} icon={Clock} />
            <KpiCard label="TVs que exibiram" value={`${totals.devicesPlayed} de ${totals.devicesTargeted} no alvo`} icon={Monitor} />
            <KpiCard label="Lojas" value={int(totals.stores)} icon={MapPin} />
          </div>

          <Card className="mb-6 break-inside-avoid">
            <CardHeader><CardTitle>Exibições por dia</CardTitle></CardHeader>
            <CardContent>
              <TrendChart data={report.data.series.map(({ date, plays }) => ({ date, plays }))} config={CHART_CONFIG} leftKey="plays" />
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader><CardTitle>Onde passou</CardTitle></CardHeader>
            <CardContent><WherePlayedTable items={report.data.devices} /></CardContent>
          </Card>

          <h2 className="mb-3 text-lg font-semibold">Resultado</h2>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            <KpiCard label="Scans" value={int(totals.scans)} icon={QrCode} />
            <KpiCard label="Visitantes únicos" value={int(totals.uniqueVisitors)} icon={Users} />
            <KpiCard label="Taxa de resposta" value={rate(totals.scanRate)} icon={Percent} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Peças</CardTitle></CardHeader>
              <CardContent><CampaignPiecesTable items={report.data.announcements} /></CardContent>
            </Card>
            <Card className="break-inside-avoid">
              <CardHeader><CardTitle>Exibições por horário</CardTitle></CardHeader>
              <CardContent><HourlyChart hours={report.data.hours} /></CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
```

`HourlyChart` espera `AnalyticsHour[]` de `@workspace/api-client-react` (`{ hour: number; plays: number }`); o formato é o mesmo. Se o typecheck reclamar, tipar `hours` no `CampaignReport` com `AnalyticsHour` importado de lá.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage exec vitest run portal-campaign-report`
Expected: PASS (7 testes). O texto do `PrintHeader` (`Período de 1 de setembro de 2026 a …`) vem do componente existente; se o formato por extenso do Node diferir, ajustar só a regex do teste para o que o componente produz e reportar.

- [ ] **Step 5: Rota e link**

Em `App.tsx`: `import PortalCampaignReport from './pages/portal-campaign-report';` e, junto de `PortalPanelRoute`:

```tsx
/** `:id` que não é inteiro positivo volta para a lista em vez de pedir um relatório de NaN. */
function PortalCampaignRoute({ id }: { id: string }) {
  const campaignId = Number(id);
  if (!Number.isInteger(campaignId) || campaignId <= 0) return <Redirect to="/portal/anunciante" replace />;
  return <PortalCampaignReport id={campaignId} />;
}
```

No `PortalRoutes`, antes da rota `/portal/anunciante`:

```tsx
        {isAdv ? (
          <Route path="/portal/anunciante/campanhas/:id">{(params) => <PortalCampaignRoute id={params.id} />}</Route>
        ) : null}
```

Em `pages/portal-advertiser.tsx`: `import { Link } from 'wouter';` e trocar `<td className="py-3 font-medium">{c.name}</td>` por:

```tsx
                      <td className="py-3 font-medium">
                        <Link
                          href={`/portal/anunciante/campanhas/${c.id}`}
                          className="underline-offset-4 hover:underline print:no-underline"
                        >
                          {c.name}
                        </Link>
                      </td>
```

No fim do `describe('rotas do portal', …)` em `src/__tests__/rotas-navegacao.test.tsx`:

```tsx
  it('relatório de campanha com id inválido volta para o desempenho', async () => {
    stubSessao({ roles: ['advertiser'] });
    await abrir('/portal/anunciante/campanhas/abc');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/anunciante'));
  });

  it('cliente sem papel de anunciante não abre relatório de campanha', async () => {
    stubSessao({ roles: ['client'] });
    await abrir('/portal/anunciante/campanhas/4');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/tvs'));
  });
```

No teste existente de `portal-advertiser` (`pages/__tests__/portal-advertiser.test.tsx`), dentro do `it('diferencia TVs no alvo (tabela) de TVs alcançadas (card)', …)` — que já devolve a campanha `{ id: 1, name: 'Campanha X', … }` —, acrescentar no fim:

```tsx
    // O nome da campanha abre o relatório dela.
    expect(screen.getByRole('link', { name: 'Campanha X' })).toHaveAttribute('href', '/portal/anunciante/campanhas/1');
```

- [ ] **Step 6: Suíte, tipos, commit**

Run: `pnpm --filter ./artifacts/signage test && pnpm run typecheck`
Expected: PASS, incluindo os testes antigos de `portal-advertiser` e `rotas-navegacao`.

```bash
git add artifacts/signage/src/pages/portal-campaign-report.tsx artifacts/signage/src/pages/__tests__/portal-campaign-report.test.tsx artifacts/signage/src/App.tsx artifacts/signage/src/pages/portal-advertiser.tsx artifacts/signage/src/pages/__tests__/portal-advertiser.test.tsx artifacts/signage/src/__tests__/rotas-navegacao.test.tsx
git commit -m "feat(portal): relatório da campanha para o anunciante

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Página do relatório da TV

**Files:**
- Create: `artifacts/signage/src/pages/portal-device-report.tsx`
- Modify: `artifacts/signage/src/App.tsx` (rota no `PortalRoutes`)
- Modify: `artifacts/signage/src/pages/portal-client.tsx` (nome da TV vira link)
- Test: `artifacts/signage/src/pages/__tests__/portal-device-report.test.tsx`, `artifacts/signage/src/pages/__tests__/portal-client.test.tsx` (acrescentar), `artifacts/signage/src/__tests__/rotas-navegacao.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `OnlineDaysStrip`, `DeviceCampaignsTable` (Task 4); `HourlyChart`, `BlockError`; `PageHeader`, `PrintHeader`, `PeriodFilter`, `KpiCard`, `TrendChart`, `formatDelta`.
- Produces: `default function PortalDeviceReport({ id }: { id: number })`; rota `/portal/tvs/:id`.

- [ ] **Step 1: Testes da página que falham**

`artifacts/signage/src/pages/__tests__/portal-device-report.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalDeviceReport from '../portal-device-report';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const REPORT = {
  device: { id: 2, name: 'Balcão', location: 'Entrada', isOnline: true },
  period: { days: 30, from: '2026-09-04', to: '2026-10-03' },
  totals: { plays: 6011, durationSeconds: 60110, daysOnline: 28, daysWithHistory: 30, previous: { plays: 5800 } },
  series: [
    { date: '2026-10-01', plays: 200, online: null },
    { date: '2026-10-02', plays: 210, online: false },
    { date: '2026-10-03', plays: 50, online: true },
  ],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: hour === 12 ? 30 : 1 })),
  campaigns: [
    { campaignId: 4, campaignName: 'Natal', advertiserName: 'Padaria Central', plays: 900 },
    { campaignId: null, campaignName: null, advertiserName: null, plays: 300 },
  ],
};

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(id = 2) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalDeviceReport id={id} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Relatório da TV', () => {
  it('mostra os cards com dias em que funcionou e a variação de exibições', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Balcão', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('6.011')).toBeInTheDocument();
    expect(screen.getByText('+4%')).toBeInTheDocument();
    expect(screen.getByText('28 de 30')).toBeInTheDocument();
    expect(screen.getByText('Online agora')).toBeInTheDocument();
  });

  it('faixa de dias com "sem dados" e o que passou, com o conteúdo da loja', async () => {
    stub(REPORT);
    renderPage();
    const faixa = await screen.findByRole('list', { name: 'Dias no ar' });
    expect(within(faixa).getAllByRole('listitem')[0]).toHaveAttribute('aria-label', '01/10: sem dados');
    expect(screen.getByRole('row', { name: /Natal/ })).toHaveTextContent('Padaria Central');
    expect(screen.getByRole('row', { name: /Conteúdo da loja/ })).toHaveTextContent('300');
    expect(screen.getByText('Pico: 12h (30 exibições)')).toBeInTheDocument();
  });

  it('trocar o período refaz a consulta com o novo days', async () => {
    const fetchMock = stub(REPORT);
    renderPage(2);
    await screen.findByText('6.011');
    expect(String(fetchMock.mock.calls[0][0])).toContain('api/portal/client/devices/2/report?days=30');
    await userEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: '7 dias' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('api/portal/client/devices/2/report?days=7'))).toBe(true),
    );
  });

  it('404 mostra TV não encontrada com volta para a lista', async () => {
    stub({ error: 'Device not found' }, 404);
    renderPage();
    expect(await screen.findByText('TV não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Minhas TVs/ })).toHaveAttribute('href', '/portal/tvs');
  });

  it('erro de rede oferece tentar de novo', async () => {
    stub({}, 500);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage exec vitest run portal-device-report`
Expected: FAIL — `../portal-device-report` não existe.

- [ ] **Step 3: Página**

`artifacts/signage/src/pages/portal-device-report.tsx`:

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { CalendarCheck, Clock, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartConfig } from '@/components/ui/chart';
import { PageHeader } from '@/components/page-header';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { PrintHeader } from '@/components/portal/print-header';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta } from '@/components/portal/delta';
import { OnlineDaysStrip } from '@/components/portal/online-days-strip';
import { DeviceCampaignsTable, type DeviceCampaignRow } from '@/components/portal/device-campaigns-table';
import { HourlyChart } from '@/components/analytics/hourly-chart';
import { BlockError } from '@/components/analytics/block-error';

interface DeviceReport {
  device: { id: number; name: string; location: string | null; isOnline: boolean };
  period: { days: PortalDays; from: string; to: string };
  totals: { plays: number; durationSeconds: number; daysOnline: number; daysWithHistory: number; previous: { plays: number } };
  series: Array<{ date: string; plays: number; online: boolean | null }>;
  hours: Array<{ hour: number; plays: number }>;
  campaigns: DeviceCampaignRow[];
}

/** Erro com o status: 404 (TV de outra loja ou inexistente) tem tela própria. */
class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getReport(id: number, days: PortalDays): Promise<DeviceReport> {
  const res = await fetch(`${import.meta.env.BASE_URL}api/portal/client/devices/${id}/report?days=${days}`);
  if (!res.ok) throw new HttpError(res.status);
  return res.json();
}

const CHART_CONFIG = { plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' } } satisfies ChartConfig;
const int = (n: number) => n.toLocaleString('pt-BR');

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/** O que a TV da loja fez no período: se ficou no ar e o que passou nela. */
export default function PortalDeviceReport({ id }: { id: number }) {
  const [days, setDays] = useState<PortalDays>(30);
  const report = useQuery({
    queryKey: ['portal', 'client', 'device-report', id, days],
    queryFn: () => getReport(id, days),
    retry: false,
  });

  if (report.error instanceof HttpError && report.error.status === 404) {
    return (
      <div className="py-12 text-center">
        <p className="text-lg font-medium">TV não encontrada</p>
        <Link href="/portal/tvs" className="mt-2 inline-block text-sm text-primary underline-offset-4 hover:underline">
          Voltar para Minhas TVs
        </Link>
      </div>
    );
  }
  if (report.isError) return <BlockError onRetry={() => report.refetch()} />;
  if (!report.data) return <Skeleton className="h-96 w-full rounded-xl" />;

  const { device, period, totals } = report.data;

  return (
    <div>
      <PrintHeader subject={`TV ${device.name}`} period={period} />
      <div className="print:hidden">
        <PageHeader trail={[{ label: 'Minhas TVs', href: '/portal/tvs' }, { label: device.name }]} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold print:hidden">{device.name}</h1>
          <p className="text-sm text-muted-foreground">{device.location ?? 'Sem local'}</p>
        </div>
        <Badge variant={device.isOnline ? 'default' : 'secondary'}>{device.isOnline ? 'Online agora' : 'Offline agora'}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <PeriodFilter value={days} onChange={setDays} />
          <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard label="Exibições" value={int(totals.plays)} icon={Play} delta={formatDelta(totals.plays, totals.previous.plays)} />
        <KpiCard label="Dias em que funcionou" value={`${totals.daysOnline} de ${totals.daysWithHistory}`} icon={CalendarCheck} />
        <KpiCard label="Tempo de exibição" value={formatDuration(totals.durationSeconds)} icon={Clock} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>Exibições por dia</CardTitle></CardHeader>
          <CardContent>
            <TrendChart data={report.data.series.map(({ date, plays }) => ({ date, plays }))} config={CHART_CONFIG} leftKey="plays" />
          </CardContent>
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>Dias no ar</CardTitle></CardHeader>
          <CardContent>
            <OnlineDaysStrip days={report.data.series.map(({ date, online }) => ({ date, online }))} />
          </CardContent>
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>Exibições por horário</CardTitle></CardHeader>
          <CardContent><HourlyChart hours={report.data.hours} /></CardContent>
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader><CardTitle>O que passou</CardTitle></CardHeader>
          <CardContent><DeviceCampaignsTable items={report.data.campaigns} /></CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage exec vitest run portal-device-report`
Expected: PASS (5 testes). `6011` contra `5800` dá `+4%` em `formatDelta`.

- [ ] **Step 5: Rota e link**

Em `App.tsx`: `import PortalDeviceReport from './pages/portal-device-report';` e, junto das outras:

```tsx
/** `:id` que não é inteiro positivo volta para a lista em vez de pedir um relatório de NaN. */
function PortalDeviceRoute({ id }: { id: string }) {
  const deviceId = Number(id);
  if (!Number.isInteger(deviceId) || deviceId <= 0) return <Redirect to="/portal/tvs" replace />;
  return <PortalDeviceReport id={deviceId} />;
}
```

No `PortalRoutes`, antes da rota `/portal/tvs`:

```tsx
        {isClient ? (
          <Route path="/portal/tvs/:id">{(params) => <PortalDeviceRoute id={params.id} />}</Route>
        ) : null}
```

Em `pages/portal-client.tsx`: `import { Link } from 'wouter';` e trocar `<td className="py-3 font-medium">{d.name}</td>` por:

```tsx
                    <td className="py-3 font-medium">
                      <Link href={`/portal/tvs/${d.id}`} className="underline-offset-4 hover:underline print:no-underline">
                        {d.name}
                      </Link>
                    </td>
```

Em `pages/__tests__/portal-client.test.tsx`, no `describe('PortalClient', …)` (usa o `stubPortalFetch` e a fixture `TV_RECEPCAO` do arquivo):

```tsx
  it('o nome da TV abre o relatório dela', async () => {
    stubPortalFetch([TV_RECEPCAO]);
    renderPage();
    const link = await screen.findByRole('link', { name: 'TV Recepção' });
    expect(link).toHaveAttribute('href', `/portal/tvs/${TV_RECEPCAO.id}`);
  });
```

No fim do `describe('rotas do portal', …)` em `src/__tests__/rotas-navegacao.test.tsx`:

```tsx
  it('relatório de TV com id inválido volta para Minhas TVs', async () => {
    stubSessao({ roles: ['client'] });
    await abrir('/portal/tvs/abc');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/tvs'));
  });

  it('anunciante sem papel de cliente não abre relatório de TV', async () => {
    stubSessao({ roles: ['advertiser'] });
    await abrir('/portal/tvs/2');
    await waitFor(() => expect(window.location.pathname).toBe('/portal/anunciante'));
  });
```

O teste existente `findByRole('cell', { name: 'TV Recepção' })` continua valendo: o nome acessível da célula é o texto do link.

- [ ] **Step 6: Suítes, tipos, commit**

Run: `pnpm --filter ./artifacts/signage test && pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS em tudo.

```bash
git add artifacts/signage/src/pages/portal-device-report.tsx artifacts/signage/src/pages/__tests__/portal-device-report.test.tsx artifacts/signage/src/App.tsx artifacts/signage/src/pages/portal-client.tsx artifacts/signage/src/pages/__tests__/portal-client.test.tsx artifacts/signage/src/__tests__/rotas-navegacao.test.tsx
git commit -m "feat(portal): relatório da TV para o cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois das tasks

PR com título `feat(portal): relatório da campanha para o anunciante e da TV para o cliente` (minor), contra a `main`, merge com `gh pr merge --merge`. O corpo do PR não pode ter linha começando com `BREAKING CHANGE:`.
