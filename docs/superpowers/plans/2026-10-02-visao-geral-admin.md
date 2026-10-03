# Visão geral do admin com gráficos — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Visão geral do admin (`/`) ganha período 7/30/90, cards com delta, gráficos de exibições/scans por dia, de TVs que funcionaram por dia e de exibições por horário, e rankings de campanhas, TVs e peças.

**Architecture:** Três endpoints novos (`/analytics/overview`, `/analytics/hourly`, `/analytics/rankings`) descritos no `openapi.yaml`, com client e zod gerados. As regras que erram em silêncio (disponibilidade por dia, 24 horas) ficam em funções puras testadas sozinhas; o SQL só busca linhas. No front, componentes de bloco em `components/analytics/` e a página `pages/analytics.tsx` como composição, cada bloco com carga e erro próprios.

**Tech Stack:** Express + Drizzle (Postgres), Orval (OpenAPI → React Query + zod), React 19, TanStack Query, Recharts via `components/ui/chart.tsx`, Vitest + Testing Library (jsdom), supertest.

**Spec:** `docs/superpowers/specs/2026-10-02-visao-geral-admin-design.md`

## Global Constraints

- Código, comentários, textos de tela e mensagens de commit em português; comentários explicam o porquê.
- Acentos como caracteres UTF-8 reais, nunca escapes `\uXXXX`.
- Commits `tipo(escopo): descrição curta em português`, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch `feat/visao-geral` (parte de `feat/navegacao`); nada direto na `main`; sem push.
- Nenhuma dependência nova.
- `days` aceita só `7`, `30` ou `90`; ausente vale `30`; outro valor responde **400** com `{ "error": "Período inválido. Use days=7, 30 ou 90." }`.
- Dias e horas no fuso `BUSINESS_TIME_ZONE` (`America/Sao_Paulo`). Scan com `is_bot = true` fica fora de tudo. `scanRate` = scans / exibições, `0` sem exibição.
- Gráficos com `isAnimationActive={false}` (impressão).
- Testes: web `pnpm --filter ./artifacts/signage test` (focado: `pnpm --filter ./artifacts/signage exec vitest run <filtro>`); API `pnpm --filter ./artifacts/api-server test` (focado: `pnpm --filter ./artifacts/api-server exec vitest run <filtro>`); tipos `pnpm run typecheck` na raiz; codegen `pnpm --dir lib/api-spec run codegen`.

## Review Focus

1. **Dia antes do começo do histórico desenhado como zero** — a tela diria que a rede inteira caiu. Tem de ser `null` na API e "sem dados" na tela. Testes nas Tasks 2, 6 e 7.
2. **Sessão que atravessa a meia-noite** (TV ligada das 23h às 2h) contada só num dia — o segundo dia acusaria TV parada. Teste na Task 2.
3. **TV instalada no meio do período** contada como falha nos dias antes de existir. Teste na Task 2.
4. **Um bloco fora do ar derrubando a página** — erro no ranking não pode apagar os gráficos. Teste na Task 7.
5. **Scan num dia sem exibição sumindo da série** (o overview do portal monta a série só a partir dos dias com exibição). Teste na Task 4.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/device-presence.ts` | `SESSION_HISTORY_DAYS = 90` (limpeza) e `SESSION_TIMELINE_DAYS = 30` (linha do tempo) |
| `artifacts/api-server/src/lib/device-sessions.ts` | listagem usa `sessionTimelineSince` |
| `artifacts/api-server/src/lib/admin-overview/availability.ts` (novo) | `dailyAvailability`, `nextDayKey` — puras |
| `artifacts/api-server/src/lib/admin-overview/hours.ts` (novo) | `fillHours` — pura |
| `artifacts/api-server/src/lib/admin-overview/queries.ts` (novo) | `adminOverview`, `adminHourly`, `adminRankings` — SQL |
| `artifacts/api-server/src/routes/analytics.ts` | três rotas novas; sai `/analytics/summary` |
| `lib/api-spec/openapi.yaml` + gerados em `lib/api-zod`, `lib/api-client-react` | contrato |
| `artifacts/signage/src/components/analytics/*.tsx` (novos) | blocos da tela |
| `artifacts/signage/src/pages/analytics.tsx` | composição |

---

### Task 1: Histórico de conexão de 90 dias, linha do tempo de 30

**Files:**
- Modify: `artifacts/api-server/src/lib/device-presence.ts:22-27`
- Modify: `artifacts/api-server/src/lib/device-sessions.ts:3,35`
- Test: `artifacts/api-server/src/lib/__tests__/device-presence.test.ts`, `artifacts/api-server/src/lib/__tests__/device-sessions-query.test.ts`

**Interfaces:**
- Produces: `SESSION_HISTORY_DAYS = 90`, `sessionHistorySince(now: Date): Date` (limpeza); `SESSION_TIMELINE_DAYS = 30`, `sessionTimelineSince(now: Date): Date` (listagem).

- [ ] **Step 1: Ajustar os testes para o comportamento novo**

Em `device-presence.test.ts`, trocar o último `it` por:

```ts
  it("o histórico guardado olha 90 dias para trás", () => {
    expect(SESSION_HISTORY_DAYS).toBe(90);
    expect(sessionHistorySince(NOW).toISOString()).toBe("2026-07-04T15:00:00.000Z");
  });

  it("a linha do tempo da TV mostra 30 dias", () => {
    expect(SESSION_TIMELINE_DAYS).toBe(30);
    expect(sessionTimelineSince(NOW).toISOString()).toBe("2026-09-02T15:00:00.000Z");
  });
```

e acrescentar `SESSION_TIMELINE_DAYS` e `sessionTimelineSince` ao import de `../device-presence`.

Em `device-sessions-query.test.ts`, ao lado de `const TRINTA_DIAS = ...`, acrescentar:

```ts
const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;
```

e trocar o teste de limpeza por:

```ts
  // "Não toca nas de outra TV": o filtro por device_id tem de estar no DELETE.
  // 90 dias porque a Visão geral desenha a disponibilidade de até 90 dias.
  it("limpar: só as sessões desta TV com mais de 90 dias", () => {
    const { sql, params } = buildPruneSessionsQuery(7, NOW).toSQL();
    expect(sql).toContain('delete from "device_sessions"');
    expect(sql).toContain('"device_sessions"."device_id" = $1');
    expect(sql).toContain('"device_sessions"."last_seen_at" < $2');
    expect(params[0]).toBe(7);
    expect(instante(params[1])).toBe(NOW.getTime() - NOVENTA_DIAS);
  });
```

O teste "listar: últimos 30 dias" fica como está.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run device-presence device-sessions-query`
Expected: FAIL — `expected 30 to be 90` e o import de `SESSION_TIMELINE_DAYS` indefinido.

- [ ] **Step 3: Implementar**

Em `device-presence.ts`, trocar o bloco de `SESSION_HISTORY_DAYS` por:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto do histórico de conexão é guardado. 90 dias porque o gráfico de TVs
 * que funcionaram, na Visão geral do admin, cobre até 90 dias.
 */
export const SESSION_HISTORY_DAYS = 90;

export function sessionHistorySince(now: Date): Date {
  return new Date(now.getTime() - SESSION_HISTORY_DAYS * DAY_MS);
}

/**
 * Quanto a linha do tempo da página da TV mostra. Separado do que é guardado:
 * guardar mais para a Visão geral não deve alongar a lista de quedas da TV.
 */
export const SESSION_TIMELINE_DAYS = 30;

export function sessionTimelineSince(now: Date): Date {
  return new Date(now.getTime() - SESSION_TIMELINE_DAYS * DAY_MS);
}
```

Em `device-sessions.ts`: o import vira `import { onlineSince, sessionHistorySince, sessionTimelineSince } from "./device-presence";` e, em `buildListSessionsQuery`, `sessionHistorySince(now)` vira `sessionTimelineSince(now)`. `buildPruneSessionsQuery` continua com `sessionHistorySince`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/api-server test`
Expected: PASS, suíte inteira.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/device-presence.ts artifacts/api-server/src/lib/device-sessions.ts artifacts/api-server/src/lib/__tests__/device-presence.test.ts artifacts/api-server/src/lib/__tests__/device-sessions-query.test.ts
git commit -m "feat(api): guarda 90 dias do histórico de conexão das TVs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regras puras — disponibilidade por dia e 24 horas

**Files:**
- Create: `artifacts/api-server/src/lib/admin-overview/availability.ts`
- Create: `artifacts/api-server/src/lib/admin-overview/hours.ts`
- Test: `artifacts/api-server/src/lib/admin-overview/__tests__/availability.test.ts`, `artifacts/api-server/src/lib/admin-overview/__tests__/hours.test.ts`

**Interfaces:**
- Consumes: `startOfBusinessDay(key: string, timeZone?: string): Date` de `lib/portal/period.ts`; `BUSINESS_TIME_ZONE` de `lib/ad-eligibility.ts`.
- Produces:
  - `interface SessionSpan { deviceId: number; startedAt: Date; lastSeenAt: Date }`
  - `interface DeviceSince { id: number; createdAt: Date }`
  - `interface AvailabilityPoint { date: string; activeDevices: number | null; totalDevices: number }`
  - `function nextDayKey(key: string): string`
  - `function dailyAvailability(keys: string[], sessions: SessionSpan[], devices: DeviceSince[], historyStartKey: string | null, timeZone?: string): AvailabilityPoint[]`
  - `interface HourPoint { hour: number; plays: number }`
  - `function fillHours(rows: HourPoint[]): HourPoint[]`

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/api-server/src/lib/admin-overview/__tests__/availability.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dailyAvailability, nextDayKey } from "../availability";

// São Paulo é UTC−3: o dia local 2026-09-10 vai de 03:00Z do dia 10 a 03:00Z do dia 11.
const TZ = "America/Sao_Paulo";
const KEYS = ["2026-09-10", "2026-09-11", "2026-09-12"];
const at = (iso: string) => new Date(iso);
const TV = (id: number, createdAt = "2026-01-01T00:00:00Z") => ({ id, createdAt: at(createdAt) });
const sessao = (deviceId: number, startedAt: string, lastSeenAt: string) => ({
  deviceId,
  startedAt: at(startedAt),
  lastSeenAt: at(lastSeenAt),
});

describe("nextDayKey", () => {
  it("vira o mês e o ano", () => {
    expect(nextDayKey("2026-09-30")).toBe("2026-10-01");
    expect(nextDayKey("2026-12-31")).toBe("2027-01-01");
  });
});

describe("dailyAvailability", () => {
  it("conta a TV no dia em que teve sessão e não nos outros", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T12:00:00Z", "2026-09-11T20:00:00Z")],
      [TV(1), TV(2)],
      "2026-09-01",
      TZ,
    );
    expect(pontos).toEqual([
      { date: "2026-09-10", activeDevices: 0, totalDevices: 2 },
      { date: "2026-09-11", activeDevices: 1, totalDevices: 2 },
      { date: "2026-09-12", activeDevices: 0, totalDevices: 2 },
    ]);
  });

  // 23h às 2h de São Paulo: sem isso, o segundo dia acusaria TV parada.
  it("sessão que atravessa a meia-noite conta nos dois dias", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T02:00:00Z", "2026-09-11T05:00:00Z")],
      [TV(1)],
      "2026-09-01",
      TZ,
    );
    expect(pontos.map((p) => p.activeDevices)).toEqual([1, 1, 0]);
  });

  it("TV com duas sessões no mesmo dia conta uma vez", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T12:00:00Z", "2026-09-11T13:00:00Z"), sessao(1, "2026-09-11T18:00:00Z", "2026-09-11T19:00:00Z")],
      [TV(1)],
      "2026-09-01",
      TZ,
    );
    expect(pontos[1].activeDevices).toBe(1);
  });

  // Instalada no dia 11 (local): não pode virar falha no dia 10.
  it("TV cadastrada no meio do período só entra no total a partir do dia dela", () => {
    const pontos = dailyAvailability(KEYS, [], [TV(1), TV(2, "2026-09-11T15:00:00Z")], "2026-09-01", TZ);
    expect(pontos.map((p) => p.totalDevices)).toEqual([1, 2, 2]);
  });

  // Zero diria que a rede inteira caiu; antes do histórico a resposta é "não sei".
  it("dia anterior ao começo do histórico vira null", () => {
    const pontos = dailyAvailability(
      KEYS,
      [sessao(1, "2026-09-11T12:00:00Z", "2026-09-11T20:00:00Z")],
      [TV(1)],
      "2026-09-11",
      TZ,
    );
    expect(pontos.map((p) => p.activeDevices)).toEqual([null, 1, 0]);
    expect(pontos[0].totalDevices).toBe(1);
  });

  it("sem nenhuma sessão registrada, todos os dias são null", () => {
    const pontos = dailyAvailability(KEYS, [], [TV(1)], null, TZ);
    expect(pontos.map((p) => p.activeDevices)).toEqual([null, null, null]);
  });
});
```

`artifacts/api-server/src/lib/admin-overview/__tests__/hours.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fillHours } from "../hours";

describe("fillHours", () => {
  it("devolve as 24 horas em ordem, com zero onde não houve exibição", () => {
    const horas = fillHours([
      { hour: 19, plays: 40 },
      { hour: 7, plays: 3 },
    ]);
    expect(horas).toHaveLength(24);
    expect(horas.map((h) => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(horas[7]).toEqual({ hour: 7, plays: 3 });
    expect(horas[19]).toEqual({ hour: 19, plays: 40 });
    expect(horas[0]).toEqual({ hour: 0, plays: 0 });
  });

  it("sem linhas, 24 zeros", () => {
    expect(fillHours([]).every((h) => h.plays === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run admin-overview`
Expected: FAIL — `Failed to resolve import "../availability"` e `"../hours"`.

- [ ] **Step 3: Implementar**

`artifacts/api-server/src/lib/admin-overview/availability.ts`:

```ts
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { startOfBusinessDay } from "../portal/period";

export interface SessionSpan {
  deviceId: number;
  startedAt: Date;
  lastSeenAt: Date;
}

export interface DeviceSince {
  id: number;
  createdAt: Date;
}

export interface AvailabilityPoint {
  date: string;
  /** `null` antes do começo do histórico: "não sei", e não "nenhuma TV". */
  activeDevices: number | null;
  totalDevices: number;
}

/** Dia seguinte no calendário. Meio-dia UTC para a soma nunca escorregar de dia. */
export function nextDayKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

/**
 * TVs que funcionaram em cada dia, sobre as TVs que existiam naquele dia.
 *
 * "Funcionou" é ter ao menos uma sessão de conexão tocando o dia — não horas
 * no ar, porque as TVs desligam fora do horário da loja. Sessão que atravessa
 * a meia-noite toca os dois dias. TV cadastrada depois do dia não entra no
 * total dele, para a instalação nova não aparecer como falha no passado.
 *
 * Fica fora do SQL porque é regra que erra em silêncio e os testes do
 * repositório não abrem banco.
 */
export function dailyAvailability(
  keys: string[],
  sessions: SessionSpan[],
  devices: DeviceSince[],
  historyStartKey: string | null,
  timeZone: string = BUSINESS_TIME_ZONE,
): AvailabilityPoint[] {
  return keys.map((date) => {
    const start = startOfBusinessDay(date, timeZone);
    const end = startOfBusinessDay(nextDayKey(date), timeZone);
    const totalDevices = devices.filter((device) => device.createdAt < end).length;

    // Chave YYYY-MM-DD compara certo como texto.
    if (historyStartKey === null || date < historyStartKey) {
      return { date, activeDevices: null, totalDevices };
    }

    const active = new Set<number>();
    for (const session of sessions) {
      if (session.startedAt < end && session.lastSeenAt >= start) active.add(session.deviceId);
    }
    return { date, activeDevices: active.size, totalDevices };
  });
}
```

`artifacts/api-server/src/lib/admin-overview/hours.ts`:

```ts
export interface HourPoint {
  hour: number;
  plays: number;
}

/**
 * As 24 horas do dia, de 0 a 23. O banco só devolve hora que teve exibição;
 * sem o preenchimento, o gráfico de barras pularia a madrugada e o horário de
 * pico pareceria mais perto do resto do que é.
 */
export function fillHours(rows: HourPoint[]): HourPoint[] {
  const byHour = new Map(rows.map((row) => [row.hour, row.plays]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, plays: byHour.get(hour) ?? 0 }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run admin-overview`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/admin-overview
git commit -m "feat(api): regras de disponibilidade por dia e das 24 horas da Visão geral

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Contrato dos três endpoints no OpenAPI

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (paths, logo depois de `/analytics/summary`; schemas, logo depois de `AnalyticsSummary`)
- Regenerate: `lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*`
- Test: `artifacts/api-server/src/routes/__tests__/analytics-contract.test.ts`

**Interfaces:**
- Produces (gerados pelo codegen):
  - zod em `@workspace/api-zod`: `GetAnalyticsOverviewResponse`, `GetAnalyticsHourlyResponse`, `GetAnalyticsRankingsResponse`
  - hooks em `@workspace/api-client-react`: `useGetAnalyticsOverview(params?: { days?: 7 | 30 | 90 }, options?)`, `useGetAnalyticsHourly(params?, options?)`, `useGetAnalyticsRankings(params?, options?)`
  - tipos em `@workspace/api-client-react`: `AnalyticsOverview`, `AnalyticsDay`, `AnalyticsHourly`, `AnalyticsRankings`, `AnalyticsCampaignRank`, `AnalyticsDeviceRank`, `AnalyticsAnnouncementRank`

- [ ] **Step 1: Escrever o teste do contrato que falha**

`artifacts/api-server/src/routes/__tests__/analytics-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  GetAnalyticsHourlyResponse,
  GetAnalyticsOverviewResponse,
  GetAnalyticsRankingsResponse,
} from "@workspace/api-zod";

const PERIOD = { days: 30, from: "2026-09-03", to: "2026-10-02" };
const TOTALS = { plays: 10, durationSeconds: 100, scans: 1, uniqueVisitors: 1, scanRate: 0.1 };

describe("contrato da Visão geral", () => {
  it("overview aceita dia sem histórico (activeDevices null)", () => {
    const body = {
      period: PERIOD,
      totals: { ...TOTALS, previous: TOTALS },
      now: { devices: 2, devicesOnline: 1, clients: 1 },
      series: [
        { date: "2026-09-03", plays: 0, scans: 0, activeDevices: null, totalDevices: 2 },
        { date: "2026-09-04", plays: 5, scans: 1, activeDevices: 2, totalDevices: 2 },
      ],
    };
    expect(GetAnalyticsOverviewResponse.parse(body)).toEqual(body);
  });

  it("overview recusa dia sem totalDevices", () => {
    const body = {
      period: PERIOD,
      totals: { ...TOTALS, previous: TOTALS },
      now: { devices: 2, devicesOnline: 1, clients: 1 },
      series: [{ date: "2026-09-03", plays: 0, scans: 0, activeDevices: 1 }],
    };
    expect(() => GetAnalyticsOverviewResponse.parse(body)).toThrow();
  });

  it("hourly e rankings no formato do spec", () => {
    const hourly = { period: PERIOD, hours: [{ hour: 0, plays: 3 }] };
    expect(GetAnalyticsHourlyResponse.parse(hourly)).toEqual(hourly);
    const rankings = {
      period: PERIOD,
      campaigns: [{ campaignId: 4, name: "Natal", advertiserName: "Padaria", plays: 9 }],
      devices: [{ deviceId: 2, name: "Balcão", clientName: "Padaria", plays: 6 }],
      announcements: [{ announcementId: 9, title: "Pão", plays: 3, scans: 1, scanRate: 0.33, durationSeconds: 30 }],
    };
    expect(GetAnalyticsRankingsResponse.parse(rankings)).toEqual(rankings);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run analytics-contract`
Expected: FAIL — os três schemas não existem em `@workspace/api-zod` (`undefined` / `Cannot read properties of undefined (reading 'parse')`).

- [ ] **Step 3: Paths no `openapi.yaml`**

Logo depois do bloco `/analytics/summary:` (seção `# ── Analytics`), acrescentar:

```yaml
  /analytics/overview:
    get:
      operationId: getAnalyticsOverview
      tags: [analytics]
      summary: Visão geral da rede no período — cards, série diária e TVs que funcionaram
      parameters:
        - name: days
          in: query
          required: false
          schema: { type: integer, enum: [7, 30, 90] }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AnalyticsOverview"
        "400":
          description: Período inválido

  /analytics/hourly:
    get:
      operationId: getAnalyticsHourly
      tags: [analytics]
      summary: Exibições por hora do dia (0–23, horário de São Paulo) no período
      parameters:
        - name: days
          in: query
          required: false
          schema: { type: integer, enum: [7, 30, 90] }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AnalyticsHourly"
        "400":
          description: Período inválido

  /analytics/rankings:
    get:
      operationId: getAnalyticsRankings
      tags: [analytics]
      summary: Top 10 campanhas, TVs e peças por exibições no período
      parameters:
        - name: days
          in: query
          required: false
          schema: { type: integer, enum: [7, 30, 90] }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AnalyticsRankings"
        "400":
          description: Período inválido
```

- [ ] **Step 4: Schemas no `openapi.yaml`**

Logo depois do schema `AnalyticsSummary:`, acrescentar (mesma indentação dos schemas vizinhos):

```yaml
    AnalyticsPeriod:
      type: object
      required: [days, from, to]
      properties:
        days: { type: integer, enum: [7, 30, 90] }
        from: { type: string, description: "Primeiro dia (YYYY-MM-DD, horário de São Paulo)" }
        to: { type: string, description: "Último dia (YYYY-MM-DD)" }

    AnalyticsTotals:
      type: object
      required: [plays, durationSeconds, scans, uniqueVisitors, scanRate]
      properties:
        plays: { type: integer }
        durationSeconds: { type: integer }
        scans: { type: integer }
        uniqueVisitors: { type: integer }
        scanRate: { type: number }

    AnalyticsOverviewTotals:
      type: object
      required: [plays, durationSeconds, scans, uniqueVisitors, scanRate, previous]
      properties:
        plays: { type: integer }
        durationSeconds: { type: integer }
        scans: { type: integer }
        uniqueVisitors: { type: integer }
        scanRate: { type: number }
        previous:
          $ref: "#/components/schemas/AnalyticsTotals"

    AnalyticsNow:
      type: object
      required: [devices, devicesOnline, clients]
      properties:
        devices: { type: integer }
        devicesOnline: { type: integer }
        clients: { type: integer }

    AnalyticsDay:
      type: object
      required: [date, plays, scans, activeDevices, totalDevices]
      properties:
        date: { type: string }
        plays: { type: integer }
        scans: { type: integer }
        activeDevices:
          type: integer
          nullable: true
          description: TVs que se conectaram no dia; nulo antes do começo do histórico
        totalDevices: { type: integer }

    AnalyticsOverview:
      type: object
      required: [period, totals, now, series]
      properties:
        period:
          $ref: "#/components/schemas/AnalyticsPeriod"
        totals:
          $ref: "#/components/schemas/AnalyticsOverviewTotals"
        now:
          $ref: "#/components/schemas/AnalyticsNow"
        series:
          type: array
          items:
            $ref: "#/components/schemas/AnalyticsDay"

    AnalyticsHour:
      type: object
      required: [hour, plays]
      properties:
        hour: { type: integer }
        plays: { type: integer }

    AnalyticsHourly:
      type: object
      required: [period, hours]
      properties:
        period:
          $ref: "#/components/schemas/AnalyticsPeriod"
        hours:
          type: array
          items:
            $ref: "#/components/schemas/AnalyticsHour"

    AnalyticsCampaignRank:
      type: object
      required: [campaignId, name, advertiserName, plays]
      properties:
        campaignId: { type: integer }
        name: { type: string }
        advertiserName: { type: string }
        plays: { type: integer }

    AnalyticsDeviceRank:
      type: object
      required: [deviceId, name, clientName, plays]
      properties:
        deviceId: { type: integer }
        name: { type: string }
        clientName: { type: string }
        plays: { type: integer }

    AnalyticsAnnouncementRank:
      type: object
      required: [announcementId, title, plays, scans, scanRate, durationSeconds]
      properties:
        announcementId: { type: integer }
        title: { type: string }
        plays: { type: integer }
        scans: { type: integer }
        scanRate: { type: number }
        durationSeconds: { type: integer }

    AnalyticsRankings:
      type: object
      required: [period, campaigns, devices, announcements]
      properties:
        period:
          $ref: "#/components/schemas/AnalyticsPeriod"
        campaigns:
          type: array
          items:
            $ref: "#/components/schemas/AnalyticsCampaignRank"
        devices:
          type: array
          items:
            $ref: "#/components/schemas/AnalyticsDeviceRank"
        announcements:
          type: array
          items:
            $ref: "#/components/schemas/AnalyticsAnnouncementRank"
```

- [ ] **Step 5: Gerar client e zod**

Run: `pnpm --dir lib/api-spec run codegen`
Expected: termina sem erro. Conferir:
`grep -n "export const GetAnalyticsOverviewResponse\|export const GetAnalyticsHourlyResponse\|export const GetAnalyticsRankingsResponse" lib/api-zod/src/generated/api.ts` → 3 linhas;
`grep -n "export function useGetAnalyticsOverview\|export function useGetAnalyticsHourly\|export function useGetAnalyticsRankings" lib/api-client-react/src/generated/api.ts` → 3 linhas.
Se o zod gerado para `activeDevices` não aceitar `null` (o teste do Step 6 acusa), trocar `type: integer` + `nullable: true` por `type: [integer, "null"]` (OpenAPI 3.1) e gerar de novo.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run analytics-contract && pnpm run typecheck`
Expected: PASS (3 testes) e typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/__tests__/analytics-contract.test.ts
git commit -m "feat(api): contrato dos endpoints da Visão geral do admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /analytics/overview`

**Files:**
- Create: `artifacts/api-server/src/lib/admin-overview/queries.ts`
- Create: `artifacts/api-server/src/lib/admin-overview/series.ts`
- Modify: `artifacts/api-server/src/routes/analytics.ts` (imports; rota nova logo depois de `/analytics/summary`)
- Test: `artifacts/api-server/src/lib/admin-overview/__tests__/series.test.ts`, `artifacts/api-server/src/routes/__tests__/analytics-overview.test.ts`

**Interfaces:**
- Consumes: `dailyAvailability`, `SessionSpan`, `DeviceSince` (Task 2); `GetAnalyticsOverviewResponse` (Task 3); `parseDays`, `portalPeriod`, `previousPortalPeriod`, `businessDayKey`, `PortalDays`, `PortalPeriod` de `lib/portal/period.ts`; `fillSeries` de `lib/portal/series.ts`; `isOnlineAt` de `lib/device-presence.ts`; `scanRate` de `lib/scan-rate.ts`.
- Produces:
  - `function overviewSeries(keys: string[], playRows: { day: string; plays: number }[], scanRows: { day: string; scans: number }[], availability: AvailabilityPoint[]): AnalyticsDayPoint[]` em `series.ts`, com `interface AnalyticsDayPoint { date: string; plays: number; scans: number; activeDevices: number | null; totalDevices: number }`
  - em `queries.ts`: `interface PeriodInfo { days: PortalDays; from: string; to: string }`, `function periodInfo(period: PortalPeriod): PeriodInfo`, `async function adminOverview(days: PortalDays, now?: Date): Promise<AdminOverview>` devolvendo o JSON do spec; helpers internos `playsIn(period)` e `humanScansIn(period)` reusados pela Task 5.
  - em `routes/analytics.ts`: `function daysOr400(req, res): PortalDays | null` (reusado pela Task 5).

- [ ] **Step 1: Testes que falham — série**

`artifacts/api-server/src/lib/admin-overview/__tests__/series.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { overviewSeries } from "../series";

const KEYS = ["2026-09-10", "2026-09-11", "2026-09-12"];
const DISP = KEYS.map((date) => ({ date, activeDevices: 1, totalDevices: 2 }));

describe("overviewSeries", () => {
  it("um ponto por dia, zeros onde o banco não devolveu linha", () => {
    const serie = overviewSeries(KEYS, [{ day: "2026-09-11", plays: 40 }], [], DISP);
    expect(serie.map((p) => p.plays)).toEqual([0, 40, 0]);
    expect(serie.map((p) => p.scans)).toEqual([0, 0, 0]);
  });

  // O overview do portal monta a série só a partir dos dias com exibição;
  // aqui o scan de um dia sem exibição tem de aparecer.
  it("scan em dia sem exibição não some", () => {
    const serie = overviewSeries(KEYS, [], [{ day: "2026-09-12", scans: 3 }], DISP);
    expect(serie[2]).toEqual({ date: "2026-09-12", plays: 0, scans: 3, activeDevices: 1, totalDevices: 2 });
  });

  it("leva a disponibilidade do dia, inclusive null", () => {
    const disp = [
      { date: "2026-09-10", activeDevices: null, totalDevices: 2 },
      { date: "2026-09-11", activeDevices: 2, totalDevices: 2 },
      { date: "2026-09-12", activeDevices: 1, totalDevices: 3 },
    ];
    const serie = overviewSeries(KEYS, [], [], disp);
    expect(serie.map((p) => [p.activeDevices, p.totalDevices])).toEqual([[null, 2], [2, 2], [1, 3]]);
  });
});
```

- [ ] **Step 2: Testes que falham — rota**

`artifacts/api-server/src/routes/__tests__/analytics-overview.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

const adminOverview = vi.fn();
const adminHourly = vi.fn();
const adminRankings = vi.fn();

vi.mock("../../lib/admin-overview/queries", () => ({
  adminOverview: (...a: unknown[]) => adminOverview(...a),
  adminHourly: (...a: unknown[]) => adminHourly(...a),
  adminRankings: (...a: unknown[]) => adminRankings(...a),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: analyticsRouter } = await import("../analytics");
  const app = express();
  app.use(express.json());
  app.use(analyticsRouter);
  return app;
}

async function get(path: string) {
  const { default: request } = await import("supertest");
  return request(await buildApp()).get(path);
}

const PERIOD = { days: 30, from: "2026-09-03", to: "2026-10-02" };
const TOTALS = { plays: 0, durationSeconds: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 };
const OVERVIEW = {
  period: PERIOD,
  totals: { ...TOTALS, previous: TOTALS },
  now: { devices: 0, devicesOnline: 0, clients: 0 },
  series: [],
};

describe("GET /analytics/overview", () => {
  beforeEach(() => {
    adminOverview.mockReset();
    adminOverview.mockResolvedValue(OVERVIEW);
  });

  it("usa 30 dias quando days está ausente", async () => {
    const res = await get("/analytics/overview");
    expect(res.status).toBe(200);
    expect(adminOverview).toHaveBeenCalledWith(30);
    expect(res.body).toEqual(OVERVIEW);
  });

  it("repassa days=7", async () => {
    await get("/analytics/overview?days=7");
    expect(adminOverview).toHaveBeenCalledWith(7);
  });

  it.each(["15", "abc"])("days=%s responde 400 sem consultar o banco", async (days) => {
    const res = await get(`/analytics/overview?days=${days}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Período inválido. Use days=7, 30 ou 90." });
    expect(adminOverview).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run admin-overview/__tests__/series analytics-overview`
Expected: FAIL — `../series` e `../../lib/admin-overview/queries` não existem; a rota responde 404.

- [ ] **Step 4: Implementar a série**

`artifacts/api-server/src/lib/admin-overview/series.ts`:

```ts
import { fillSeries } from "../portal/series";
import type { AvailabilityPoint } from "./availability";

export interface AnalyticsDayPoint {
  date: string;
  plays: number;
  scans: number;
  activeDevices: number | null;
  totalDevices: number;
}

/**
 * Junta exibições, scans e disponibilidade num ponto por dia do período.
 *
 * Exibições e scans são preenchidos cada um sobre o calendário completo — e
 * não a partir dos dias com exibição — para um scan num dia sem exibição não
 * sumir da série.
 */
export function overviewSeries(
  keys: string[],
  playRows: Array<{ day: string; plays: number }>,
  scanRows: Array<{ day: string; scans: number }>,
  availability: AvailabilityPoint[],
): AnalyticsDayPoint[] {
  const plays = fillSeries(keys, playRows, ["plays"]);
  const scans = fillSeries(keys, scanRows, ["scans"]);
  const byDay = new Map(availability.map((point) => [point.date, point]));
  return keys.map((date, index) => ({
    date,
    plays: plays[index].plays,
    scans: scans[index].scans,
    activeDevices: byDay.get(date)?.activeDevices ?? null,
    totalDevices: byDay.get(date)?.totalDevices ?? 0,
  }));
}
```

- [ ] **Step 5: Implementar as consultas do overview**

`artifacts/api-server/src/lib/admin-overview/queries.ts`:

```ts
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { clientsTable, db, devicesTable, deviceSessionsTable, playsTable, scansTable } from "@workspace/db";
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { isOnlineAt } from "../device-presence";
import { scanRate } from "../scan-rate";
import {
  businessDayKey,
  portalPeriod,
  previousPortalPeriod,
  type PortalDays,
  type PortalPeriod,
} from "../portal/period";
import { dailyAvailability } from "./availability";
import { overviewSeries, type AnalyticsDayPoint } from "./series";

/**
 * Data local do negócio dentro do SQL. Só no SELECT e no GROUP BY; o WHERE
 * filtra pelo timestamp cru para usar os índices por `created_at`.
 */
const DAY_KEY = (column: unknown) =>
  sql<string>`to_char((${column} AT TIME ZONE ${sql.raw(`'${BUSINESS_TIME_ZONE}'`)})::date, 'YYYY-MM-DD')`;

/** Scans de gente. */
const HUMAN_SCAN = eq(scansTable.isBot, false);

export interface PeriodInfo {
  days: PortalDays;
  from: string;
  to: string;
}

export function periodInfo(period: PortalPeriod): PeriodInfo {
  return { days: period.days, from: period.keys[0], to: period.keys[period.keys.length - 1] };
}

const playsIn = (period: PortalPeriod) =>
  and(gte(playsTable.createdAt, period.from), lt(playsTable.createdAt, period.to));

const humanScansIn = (period: PortalPeriod) =>
  and(HUMAN_SCAN, gte(scansTable.createdAt, period.from), lt(scansTable.createdAt, period.to));

export interface OverviewTotals {
  plays: number;
  durationSeconds: number;
  scans: number;
  uniqueVisitors: number;
  scanRate: number;
}

async function overviewTotals(period: PortalPeriod): Promise<OverviewTotals> {
  const [plays] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      duration: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .where(playsIn(period));

  const [scans] = await db
    .select({
      n: sql<number>`COUNT(*)::int`,
      unique: sql<number>`COUNT(DISTINCT ${scansTable.fingerprint})::int`,
    })
    .from(scansTable)
    .where(humanScansIn(period));

  const totals = {
    plays: plays?.n ?? 0,
    durationSeconds: plays?.duration ?? 0,
    scans: scans?.n ?? 0,
    uniqueVisitors: scans?.unique ?? 0,
  };
  return { ...totals, scanRate: scanRate(totals.scans, totals.plays) };
}

export interface AdminOverview {
  period: PeriodInfo;
  totals: OverviewTotals & { previous: OverviewTotals };
  now: { devices: number; devicesOnline: number; clients: number };
  series: AnalyticsDayPoint[];
}

export async function adminOverview(days: PortalDays, now: Date = new Date()): Promise<AdminOverview> {
  const period = portalPeriod(days, now);
  const previous = previousPortalPeriod(days, now);

  const [current, before] = await Promise.all([overviewTotals(period), overviewTotals(previous)]);

  const playRows = await db
    .select({ day: DAY_KEY(playsTable.createdAt), plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .where(playsIn(period))
    .groupBy(DAY_KEY(playsTable.createdAt));

  const scanRows = await db
    .select({ day: DAY_KEY(scansTable.createdAt), scans: sql<number>`COUNT(*)::int` })
    .from(scansTable)
    .where(humanScansIn(period))
    .groupBy(DAY_KEY(scansTable.createdAt));

  const devices = await db
    .select({ id: devicesTable.id, createdAt: devicesTable.createdAt, lastSeenAt: devicesTable.lastSeenAt })
    .from(devicesTable);

  // Só as sessões que tocam a janela: começaram antes do fim e foram vistas
  // depois do começo.
  const sessions = await db
    .select({
      deviceId: deviceSessionsTable.deviceId,
      startedAt: deviceSessionsTable.startedAt,
      lastSeenAt: deviceSessionsTable.lastSeenAt,
    })
    .from(deviceSessionsTable)
    .where(and(lt(deviceSessionsTable.startedAt, period.to), gte(deviceSessionsTable.lastSeenAt, period.from)));

  // Começo do histórico: a sessão mais antiga guardada. Antes dela, "sem dados".
  const [first] = await db
    .select({ startedAt: sql<string | Date | null>`MIN(${deviceSessionsTable.startedAt})` })
    .from(deviceSessionsTable);
  const historyStartKey = first?.startedAt ? businessDayKey(new Date(first.startedAt)) : null;

  const [clients] = await db.select({ n: sql<number>`COUNT(*)::int` }).from(clientsTable);

  const availability = dailyAvailability(period.keys, sessions, devices, historyStartKey);

  return {
    period: periodInfo(period),
    totals: { ...current, previous: before },
    now: {
      devices: devices.length,
      devicesOnline: devices.filter((device) => isOnlineAt(device.lastSeenAt, now)).length,
      clients: clients?.n ?? 0,
    },
    series: overviewSeries(period.keys, playRows, scanRows, availability),
  };
}
```

- [ ] **Step 6: Rota**

Em `routes/analytics.ts`, acrescentar aos imports:

```ts
import type { Request, Response } from "express";
import { GetAnalyticsOverviewResponse } from "@workspace/api-zod";
import { adminOverview } from "../lib/admin-overview/queries";
import { parseDays, type PortalDays } from "../lib/portal/period";
```

(`GetAnalyticsOverviewResponse` entra no import de `@workspace/api-zod` que já existe, não num segundo import do mesmo módulo.) Logo depois do handler de `/analytics/summary`:

```ts
/**
 * Resolve o período pedido ou responde 400. Mesmo enum fechado do portal:
 * mantém a varredura limitada e o cache previsível.
 */
function daysOr400(req: Request, res: Response): PortalDays | null {
  const days = parseDays(req.query.days);
  if (days === null) {
    res.status(400).json({ error: "Período inválido. Use days=7, 30 ou 90." });
    return null;
  }
  return days;
}

// Visão geral: cards do período, série diária e TVs que funcionaram por dia.
router.get("/analytics/overview", async (req, res): Promise<void> => {
  const days = daysOr400(req, res);
  if (days === null) return;
  res.json(GetAnalyticsOverviewResponse.parse(await adminOverview(days)));
});
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run admin-overview analytics-overview`
Expected: PASS.

- [ ] **Step 8: Suíte, tipos e commit**

Run: `pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS.

```bash
git add artifacts/api-server/src/lib/admin-overview artifacts/api-server/src/routes/analytics.ts artifacts/api-server/src/routes/__tests__/analytics-overview.test.ts
git commit -m "feat(api): endpoint da Visão geral com série diária e TVs que funcionaram

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `GET /analytics/hourly` e `GET /analytics/rankings`

**Files:**
- Modify: `artifacts/api-server/src/lib/admin-overview/queries.ts` (acrescentar no fim)
- Modify: `artifacts/api-server/src/routes/analytics.ts` (rotas logo depois de `/analytics/overview`)
- Test: `artifacts/api-server/src/routes/__tests__/analytics-overview.test.ts` (acrescentar `describe`s)

**Interfaces:**
- Consumes: `fillHours`, `HourPoint` (Task 2); `periodInfo`, `PeriodInfo`, `daysOr400` (Task 4); `GetAnalyticsHourlyResponse`, `GetAnalyticsRankingsResponse` (Task 3).
- Produces: `adminHourly(days: PortalDays, now?: Date): Promise<{ period: PeriodInfo; hours: HourPoint[] }>` e `adminRankings(days: PortalDays, now?: Date): Promise<AdminRankings>` com o JSON do spec.

- [ ] **Step 1: Testes que falham**

No fim de `analytics-overview.test.ts`:

```ts
const HOURLY = { period: PERIOD, hours: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: 0 })) };
const RANKINGS = { period: PERIOD, campaigns: [], devices: [], announcements: [] };

describe("GET /analytics/hourly", () => {
  beforeEach(() => {
    adminHourly.mockReset();
    adminHourly.mockResolvedValue(HOURLY);
  });

  it("usa 30 dias quando days está ausente e devolve as 24 horas", async () => {
    const res = await get("/analytics/hourly");
    expect(res.status).toBe(200);
    expect(adminHourly).toHaveBeenCalledWith(30);
    expect(res.body.hours).toHaveLength(24);
  });

  it("days inválido responde 400", async () => {
    const res = await get("/analytics/hourly?days=1");
    expect(res.status).toBe(400);
    expect(adminHourly).not.toHaveBeenCalled();
  });
});

describe("GET /analytics/rankings", () => {
  beforeEach(() => {
    adminRankings.mockReset();
    adminRankings.mockResolvedValue(RANKINGS);
  });

  it("repassa days=90", async () => {
    const res = await get("/analytics/rankings?days=90");
    expect(res.status).toBe(200);
    expect(adminRankings).toHaveBeenCalledWith(90);
    expect(res.body).toEqual(RANKINGS);
  });

  it("days inválido responde 400", async () => {
    const res = await get("/analytics/rankings?days=365");
    expect(res.status).toBe(400);
    expect(adminRankings).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/api-server exec vitest run analytics-overview`
Expected: FAIL — `/analytics/hourly` e `/analytics/rankings` respondem 404.

- [ ] **Step 3: Consultas**

No topo de `queries.ts`, o import do drizzle passa a ser
`import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";`
e o de `@workspace/db` passa a incluir `advertisersTable, announcementsTable, campaignsTable, companiesTable` além dos que já estão. Acrescentar `import { fillHours, type HourPoint } from "./hours";`. No fim do arquivo:

```ts
const RANKING_SIZE = 10;

/** Hora local do negócio, 0–23. */
const HOUR_OF_DAY = sql<number>`EXTRACT(HOUR FROM (${playsTable.createdAt} AT TIME ZONE ${sql.raw(
  `'${BUSINESS_TIME_ZONE}'`,
)}))::int`;

export async function adminHourly(
  days: PortalDays,
  now: Date = new Date(),
): Promise<{ period: PeriodInfo; hours: HourPoint[] }> {
  const period = portalPeriod(days, now);
  const rows = await db
    .select({ hour: HOUR_OF_DAY, plays: sql<number>`COUNT(*)::int` })
    .from(playsTable)
    .where(playsIn(period))
    .groupBy(HOUR_OF_DAY);
  return { period: periodInfo(period), hours: fillHours(rows) };
}

export interface AdminRankings {
  period: PeriodInfo;
  campaigns: Array<{ campaignId: number; name: string; advertiserName: string; plays: number }>;
  devices: Array<{ deviceId: number; name: string; clientName: string; plays: number }>;
  announcements: Array<{
    announcementId: number;
    title: string;
    plays: number;
    scans: number;
    scanRate: number;
    durationSeconds: number;
  }>;
}

const PLAY_COUNT = sql<number>`COUNT(${playsTable.id})::int`;

/**
 * Top 10 por exibições. Empate desempata pelo id para a ordem não mudar entre
 * recarregamentos. Exibição sem campanha (conteúdo fixo da playlist) não entra
 * no ranking de campanhas; entra nos de TVs e peças. Os nomes de anunciante e
 * cliente são `companies.name`, o mesmo da página da empresa.
 */
export async function adminRankings(days: PortalDays, now: Date = new Date()): Promise<AdminRankings> {
  const period = portalPeriod(days, now);

  const campaigns = await db
    .select({
      campaignId: campaignsTable.id,
      name: campaignsTable.name,
      advertiserName: companiesTable.name,
      plays: PLAY_COUNT,
    })
    .from(playsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, playsTable.campaignId))
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(playsIn(period))
    .groupBy(campaignsTable.id, campaignsTable.name, companiesTable.name)
    .orderBy(desc(PLAY_COUNT), asc(campaignsTable.id))
    .limit(RANKING_SIZE);

  const devices = await db
    .select({
      deviceId: devicesTable.id,
      name: devicesTable.name,
      clientName: companiesTable.name,
      plays: PLAY_COUNT,
    })
    .from(playsTable)
    .innerJoin(devicesTable, eq(devicesTable.id, playsTable.deviceId))
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(playsIn(period))
    .groupBy(devicesTable.id, devicesTable.name, companiesTable.name)
    .orderBy(desc(PLAY_COUNT), asc(devicesTable.id))
    .limit(RANKING_SIZE);

  const topAnnouncements = await db
    .select({
      announcementId: announcementsTable.id,
      title: announcementsTable.title,
      plays: PLAY_COUNT,
      durationSeconds: sql<number>`COALESCE(SUM(${playsTable.durationSeconds}), 0)::int`,
    })
    .from(playsTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, playsTable.announcementId))
    .where(playsIn(period))
    .groupBy(announcementsTable.id, announcementsTable.title)
    .orderBy(desc(PLAY_COUNT), asc(announcementsTable.id))
    .limit(RANKING_SIZE);

  const ids = topAnnouncements.map((row) => row.announcementId);
  const scanRows =
    ids.length === 0
      ? []
      : await db
          .select({ announcementId: scansTable.announcementId, scans: sql<number>`COUNT(*)::int` })
          .from(scansTable)
          .where(and(humanScansIn(period), inArray(scansTable.announcementId, ids)))
          .groupBy(scansTable.announcementId);
  const scansById = new Map(scanRows.map((row) => [row.announcementId, row.scans]));

  return {
    period: periodInfo(period),
    campaigns,
    devices,
    announcements: topAnnouncements.map((row) => {
      const scans = scansById.get(row.announcementId) ?? 0;
      return { ...row, scans, scanRate: scanRate(scans, row.plays) };
    }),
  };
}
```

- [ ] **Step 4: Rotas**

Em `routes/analytics.ts`, acrescentar `GetAnalyticsHourlyResponse, GetAnalyticsRankingsResponse` ao import de `@workspace/api-zod` e `adminHourly, adminRankings` ao import de `../lib/admin-overview/queries`. Logo depois da rota `/analytics/overview`:

```ts
// Exibições por hora do dia no período: horário de pico da rede.
router.get("/analytics/hourly", async (req, res): Promise<void> => {
  const days = daysOr400(req, res);
  if (days === null) return;
  res.json(GetAnalyticsHourlyResponse.parse(await adminHourly(days)));
});

// Top campanhas, TVs e peças no período. Endpoint separado: é a consulta mais
// cara, e o ranking fora do ar não pode segurar os gráficos.
router.get("/analytics/rankings", async (req, res): Promise<void> => {
  const days = daysOr400(req, res);
  if (days === null) return;
  res.json(GetAnalyticsRankingsResponse.parse(await adminRankings(days)));
});
```

- [ ] **Step 5: Rodar, suíte, tipos**

Run: `pnpm --filter ./artifacts/api-server exec vitest run analytics-overview && pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/admin-overview/queries.ts artifacts/api-server/src/routes/analytics.ts artifacts/api-server/src/routes/__tests__/analytics-overview.test.ts
git commit -m "feat(api): exibições por horário e rankings da Visão geral

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Blocos da tela

**Files:**
- Create: `artifacts/signage/src/components/analytics/availability-chart.tsx`
- Create: `artifacts/signage/src/components/analytics/hourly-chart.tsx`
- Create: `artifacts/signage/src/components/analytics/ranking-list.tsx`
- Create: `artifacts/signage/src/components/analytics/announcements-table.tsx`
- Create: `artifacts/signage/src/components/analytics/block-error.tsx`
- Test: `artifacts/signage/src/components/analytics/__tests__/blocks.test.tsx`

**Interfaces:**
- Consumes: tipos `AnalyticsDay`, `AnalyticsHour`, `AnalyticsAnnouncementRank` de `@workspace/api-client-react` (Task 3); `ChartContainer`, `ChartTooltip`, `ChartConfig` de `@/components/ui/chart`.
- Produces:
  - `availabilityRows(series: AnalyticsDay[]): AvailabilityRow[]` e `AvailabilityChart({ series }: { series: AnalyticsDay[] })`
  - `peakHour(hours: AnalyticsHour[]): AnalyticsHour | null` e `HourlyChart({ hours }: { hours: AnalyticsHour[] })`
  - `interface RankingItem { key: number; label: string; sublabel: string; value: number; href: string }` e `RankingList({ items }: { items: RankingItem[] })`
  - `AnnouncementsTable({ items }: { items: AnalyticsAnnouncementRank[] })`
  - `BlockError({ onRetry }: { onRetry: () => void })`

Recharts não desenha barras no jsdom (contêiner com tamanho zero). Por isso a lógica de cada gráfico sai em função pura exportada (`availabilityRows`, `peakHour`) e cada gráfico tem um texto visível que o teste consegue ler.

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/signage/src/components/analytics/__tests__/blocks.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilityChart, availabilityRows } from '../availability-chart';
import { HourlyChart, peakHour } from '../hourly-chart';
import { RankingList } from '../ranking-list';
import { AnnouncementsTable } from '../announcements-table';
import { BlockError } from '../block-error';

const dia = (date: string, activeDevices: number | null, totalDevices: number, plays = 0) => ({
  date,
  plays,
  scans: 0,
  activeDevices,
  totalDevices,
});

describe('availabilityRows', () => {
  it('dia sem histórico vira barra cinza de altura total, não zero', () => {
    const rows = availabilityRows([dia('2026-09-10', null, 4, 10), dia('2026-09-11', 3, 4, 20)]);
    expect(rows[0]).toMatchObject({ date: '2026-09-10', ativas: 0, semDados: 4, totalDevices: 4, plays: 10 });
    expect(rows[1]).toMatchObject({ date: '2026-09-11', ativas: 3, semDados: 0, totalDevices: 4, plays: 20 });
  });
});

describe('AvailabilityChart', () => {
  it('avisa desde quando há histórico quando existe dia sem dados', () => {
    render(<AvailabilityChart series={[dia('2026-09-10', null, 4), dia('2026-09-11', 3, 4)]} />);
    expect(screen.getByText(/sem dados/i)).toHaveTextContent('11/09');
  });

  it('sem dia sem dados, não mostra o aviso', () => {
    render(<AvailabilityChart series={[dia('2026-09-11', 3, 4)]} />);
    expect(screen.queryByText(/sem dados/i)).toBeNull();
  });

  it('nenhum dia com histórico: diz que ainda não há histórico', () => {
    render(<AvailabilityChart series={[dia('2026-09-10', null, 4)]} />);
    expect(screen.getByText(/ainda sem histórico de conexão/i)).toBeInTheDocument();
  });
});

describe('HourlyChart', () => {
  it('peakHour acha a hora com mais exibições; sem exibição, null', () => {
    expect(peakHour([{ hour: 7, plays: 3 }, { hour: 19, plays: 40 }, { hour: 20, plays: 40 }])).toEqual({ hour: 19, plays: 40 });
    expect(peakHour([{ hour: 0, plays: 0 }])).toBeNull();
  });

  it('mostra o horário de pico', () => {
    render(<HourlyChart hours={[{ hour: 19, plays: 40 }, { hour: 7, plays: 3 }]} />);
    expect(screen.getByText('Pico: 19h (40 exibições)')).toBeInTheDocument();
  });
});

describe('RankingList', () => {
  it('cada linha é um link, com barra proporcional ao maior', () => {
    render(
      <RankingList
        items={[
          { key: 1, label: 'Natal', sublabel: 'Padaria Central', value: 200, href: '/campaigns/1' },
          { key: 2, label: 'Páscoa', sublabel: 'Mercado Bom', value: 50, href: '/campaigns/2' },
        ]}
      />,
    );
    const natal = screen.getByRole('link', { name: /Natal/ });
    expect(natal).toHaveAttribute('href', '/campaigns/1');
    expect(natal).toHaveTextContent('200');
    expect(screen.getByTestId('ranking-bar-1')).toHaveStyle({ width: '100%' });
    expect(screen.getByTestId('ranking-bar-2')).toHaveStyle({ width: '25%' });
  });

  it('vazio mostra o aviso do período', () => {
    render(<RankingList items={[]} />);
    expect(screen.getByText('Nenhuma exibição no período')).toBeInTheDocument();
  });
});

describe('AnnouncementsTable', () => {
  it('mostra exibições, scans, taxa e tempo de cada peça', () => {
    render(
      <AnnouncementsTable
        items={[{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137, durationSeconds: 3900 }]}
      />,
    );
    const linha = screen.getByRole('row', { name: /Pão de mel/ });
    expect(linha).toHaveTextContent('3.001');
    expect(linha).toHaveTextContent('41');
    expect(linha).toHaveTextContent('1,37%');
    expect(linha).toHaveTextContent('1h 5m');
    expect(screen.getByText(/Scan mede resposta, não alcance/)).toBeInTheDocument();
  });

  it('vazio mostra o aviso do período', () => {
    render(<AnnouncementsTable items={[]} />);
    expect(screen.getByText('Nenhuma exibição no período')).toBeInTheDocument();
  });
});

describe('BlockError', () => {
  it('chama o retry do bloco', async () => {
    const onRetry = vi.fn();
    render(<BlockError onRetry={onRetry} />);
    expect(screen.getByText('Não foi possível carregar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage exec vitest run components/analytics`
Expected: FAIL — os imports de `../availability-chart` etc. não resolvem.

- [ ] **Step 3: Implementar**

`artifacts/signage/src/components/analytics/block-error.tsx`:

```tsx
import { Button } from '@/components/ui/button';

/**
 * Erro de um bloco só. Cada bloco da Visão geral carrega sozinho: o ranking
 * fora do ar não pode apagar os gráficos.
 */
export function BlockError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-sm text-muted-foreground">Não foi possível carregar</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
```

`artifacts/signage/src/components/analytics/availability-chart.tsx`:

```tsx
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { AnalyticsDay } from '@workspace/api-client-react';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';

export interface AvailabilityRow {
  date: string;
  ativas: number;
  semDados: number;
  activeDevices: number | null;
  totalDevices: number;
  plays: number;
}

const CONFIG = {
  ativas: { label: 'TVs que funcionaram', color: 'hsl(var(--chart-1))' },
  semDados: { label: 'Sem dados', color: 'hsl(var(--muted))' },
} satisfies ChartConfig;

const shortDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
};

/**
 * Dia sem histórico vira barra cinza de altura total: "não sei" tem de ser
 * visível e diferente de "nenhuma TV funcionou", que seria uma barra vazia.
 */
export function availabilityRows(series: AnalyticsDay[]): AvailabilityRow[] {
  return series.map((day) => ({
    date: day.date,
    ativas: day.activeDevices ?? 0,
    semDados: day.activeDevices === null ? day.totalDevices : 0,
    activeDevices: day.activeDevices,
    totalDevices: day.totalDevices,
    plays: day.plays,
  }));
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: AvailabilityRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const tvs =
    row.activeDevices === null ? 'sem dados' : `${row.activeDevices} de ${row.totalDevices} TVs`;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{shortDate(row.date)}</p>
      {/* As exibições do dia ao lado das TVs: queda de exibição aparece junto
          da causa (TVs paradas) ou da falta dela (TVs no ar, sem campanha). */}
      <p>
        {tvs} · {row.plays.toLocaleString('pt-BR')} exibições
      </p>
    </div>
  );
}

export function AvailabilityChart({ series }: { series: AnalyticsDay[] }) {
  const rows = availabilityRows(series);
  const firstWithHistory = series.find((day) => day.activeDevices !== null);
  const hasGap = series.some((day) => day.activeDevices === null);

  return (
    <div>
      <ChartContainer config={CONFIG} className="h-[240px] w-full print:h-[200px] print:w-[680px]">
        <BarChart data={rows} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <ChartTooltip content={<DayTooltip />} />
          <Bar dataKey="ativas" stackId="tvs" fill="var(--color-ativas)" isAnimationActive={false} />
          <Bar dataKey="semDados" stackId="tvs" fill="var(--color-semDados)" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      {!firstWithHistory ? (
        <p className="mt-2 text-xs text-muted-foreground">Ainda sem histórico de conexão das TVs neste período.</p>
      ) : hasGap ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Dias em cinza: sem dados — o histórico de conexão começa em {shortDate(firstWithHistory.date)}.
        </p>
      ) : null}
    </div>
  );
}
```

`artifacts/signage/src/components/analytics/hourly-chart.tsx`:

```tsx
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { AnalyticsHour } from '@workspace/api-client-react';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const CONFIG = { plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' } } satisfies ChartConfig;

/** Hora com mais exibições; no empate, a mais cedo. `null` sem exibição. */
export function peakHour(hours: AnalyticsHour[]): AnalyticsHour | null {
  let peak: AnalyticsHour | null = null;
  for (const point of hours) {
    if (point.plays > 0 && (!peak || point.plays > peak.plays || (point.plays === peak.plays && point.hour < peak.hour))) {
      peak = point;
    }
  }
  return peak;
}

export function HourlyChart({ hours }: { hours: AnalyticsHour[] }) {
  const peak = peakHour(hours);
  return (
    <div>
      <ChartContainer config={CONFIG} className="h-[240px] w-full print:h-[200px] print:w-[680px]">
        <BarChart data={hours} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="hour" tickFormatter={(h) => `${h}h`} tickLine={false} axisLine={false} interval={2} />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => `${payload?.[0]?.payload?.hour ?? ''}h`} />} />
          <Bar dataKey="plays" fill="var(--color-plays)" isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        {peak
          ? `Pico: ${peak.hour}h (${peak.plays.toLocaleString('pt-BR')} exibições)`
          : 'Nenhuma exibição no período'}
      </p>
    </div>
  );
}
```

`artifacts/signage/src/components/analytics/ranking-list.tsx`:

```tsx
import { Link } from 'wouter';

export interface RankingItem {
  key: number;
  label: string;
  sublabel: string;
  value: number;
  href: string;
}

/**
 * Barras horizontais em CSS, e não Recharts: cada linha precisa ser um link
 * de verdade, clicável no celular e lido pelo leitor de tela.
 */
export function RankingList({ items }: { items: RankingItem[] }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição no período</p>;
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <Link href={item.href} className="block rounded-md p-1 hover:bg-muted/40">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{item.label}</span>
              <span className="shrink-0 tabular-nums">{item.value.toLocaleString('pt-BR')}</span>
            </div>
            <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div
                data-testid={`ranking-bar-${item.key}`}
                className="h-2 rounded-full bg-primary"
                style={{ width: `${Math.round((item.value / max) * 100)}%` }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
```

`artifacts/signage/src/components/analytics/announcements-table.tsx`:

```tsx
import type { AnalyticsAnnouncementRank } from '@workspace/api-client-react';

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

const formatRate = (rate: number) =>
  `${(rate * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * Peças em tabela, e não barra: comparar taxa de scan entre peças é leitura
 * de número.
 */
export function AnnouncementsTable({ items }: { items: AnalyticsAnnouncementRank[] }) {
  return (
    <div>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma exibição no período</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 text-left font-medium">Peça</th>
                <th className="py-2 text-right font-medium">Exibições</th>
                <th className="py-2 text-right font-medium">Scans</th>
                <th className="py-2 text-right font-medium">Taxa</th>
                <th className="py-2 text-right font-medium">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.announcementId} className="border-b last:border-0">
                  <td className="py-2 font-medium">{item.title}</td>
                  <td className="py-2 text-right tabular-nums">{item.plays.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums">{item.scans.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{formatRate(item.scanRate)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">{formatDuration(item.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Scan mede resposta, não alcance. Um scan não é atribuível a uma exibição específica, e múltiplos scans da mesma
        pessoa contam no número bruto — use a taxa para comparar peças e campanhas entre si.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage exec vitest run components/analytics`
Expected: PASS (12 testes). Se o tipo da tooltip do Recharts reclamar no typecheck, ajustar só a assinatura de `DayTooltip` (ex.: `TooltipProps<number, string>` de `recharts`), sem mudar o texto.

- [ ] **Step 5: Tipos e commit**

Run: `pnpm run typecheck`
Expected: limpo.

```bash
git add artifacts/signage/src/components/analytics
git commit -m "feat(admin): blocos de gráfico e ranking da Visão geral

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Página da Visão geral e fim do `/analytics/summary`

**Files:**
- Modify: `artifacts/signage/src/pages/analytics.tsx` (arquivo inteiro)
- Test: `artifacts/signage/src/pages/__tests__/analytics.test.tsx`
- Modify: `artifacts/api-server/src/routes/analytics.ts` (apagar o handler de `/analytics/summary` e o import de `GetAnalyticsSummaryResponse`)
- Modify: `lib/api-spec/openapi.yaml` (apagar o path `/analytics/summary` e o schema `AnalyticsSummary`; `AnnouncementPlayStat` fica, outros schemas usam)
- Regenerate: `lib/api-zod`, `lib/api-client-react`

**Interfaces:**
- Consumes: `useGetAnalyticsOverview`, `useGetAnalyticsHourly`, `useGetAnalyticsRankings` (Task 3); blocos da Task 6; `PeriodFilter`, `PortalDays` de `@/components/portal/period-filter`; `KpiCard`; `TrendChart`; `formatDelta`, `formatPointDelta` de `@/components/portal/delta`.

- [ ] **Step 1: Escrever os testes que falham**

`artifacts/signage/src/pages/__tests__/analytics.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Analytics from '../analytics';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERIOD = { days: 30, from: '2026-09-10', to: '2026-09-11' };
const OVERVIEW = {
  period: PERIOD,
  totals: {
    plays: 48210, durationSeconds: 7200, scans: 391, uniqueVisitors: 274, scanRate: 0.0081,
    previous: { plays: 43044, durationSeconds: 7000, scans: 376, uniqueVisitors: 280, scanRate: 0.0087 },
  },
  now: { devices: 14, devicesOnline: 12, clients: 6 },
  series: [
    { date: '2026-09-10', plays: 1610, scans: 12, activeDevices: null, totalDevices: 13 },
    { date: '2026-09-11', plays: 1702, scans: 15, activeDevices: 12, totalDevices: 14 },
  ],
};
const HOURLY = { period: PERIOD, hours: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: hour === 19 ? 40 : 1 })) };
const RANKINGS = {
  period: PERIOD,
  campaigns: [{ campaignId: 4, name: 'Natal', advertiserName: 'Padaria Central', plays: 9120 }],
  devices: [{ deviceId: 2, name: 'TV do balcão', clientName: 'Padaria Central', plays: 6011 }],
  announcements: [{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137, durationSeconds: 3900 }],
};

function stubApi({ rankingsStatus = 200 }: { rankingsStatus?: number } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/analytics/overview')) return json(OVERVIEW);
    if (url.includes('/analytics/hourly')) return json(HOURLY);
    if (url.includes('/analytics/rankings')) return rankingsStatus === 200 ? json(RANKINGS) : json({}, rankingsStatus);
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Analytics />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Visão geral', () => {
  it('mostra os cards do período com a variação e os de agora', async () => {
    stubApi();
    renderPage();
    expect(await screen.findByText('48.210')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getByText('12 de 14')).toBeInTheDocument();
  });

  it('mostra os quatro blocos', async () => {
    stubApi();
    renderPage();
    expect(await screen.findByText('Exibições e scans por dia')).toBeInTheDocument();
    expect(screen.getByText('TVs que funcionaram por dia')).toBeInTheDocument();
    expect(screen.getByText('Exibições por horário')).toBeInTheDocument();
    expect(await screen.findByText('Pico: 19h (40 exibições)')).toBeInTheDocument();
    expect(await screen.findByText(/sem dados/i)).toBeInTheDocument();
  });

  it('rankings levam para a campanha e para a TV', async () => {
    stubApi();
    renderPage();
    expect(await screen.findByRole('link', { name: /Natal/ })).toHaveAttribute('href', '/campaigns/4');
    expect(screen.getByRole('link', { name: /TV do balcão/ })).toHaveAttribute('href', '/devices/2');
    expect(screen.getByRole('row', { name: /Pão de mel/ })).toBeInTheDocument();
  });

  it('ranking fora do ar não derruba os gráficos', async () => {
    stubApi({ rankingsStatus: 500 });
    renderPage();
    // Campanhas, TVs e Peças vêm da mesma consulta: os três blocos mostram o erro.
    expect(await screen.findAllByText('Não foi possível carregar')).toHaveLength(3);
    expect(screen.getByText('48.210')).toBeInTheDocument();
    expect(screen.getByText('Pico: 19h (40 exibições)')).toBeInTheDocument();
  });

  it('trocar o período refaz as três consultas com o novo days', async () => {
    const fetchMock = stubApi();
    renderPage();
    await screen.findByText('48.210');
    await userEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: '7 dias' }));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/analytics/overview?days=7'))).toBe(true);
      expect(urls.some((u) => u.includes('/analytics/hourly?days=7'))).toBe(true);
      expect(urls.some((u) => u.includes('/analytics/rankings?days=7'))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter ./artifacts/signage exec vitest run pages/__tests__/analytics`
Expected: FAIL — a página atual chama `/analytics/summary` e não mostra os blocos novos.

- [ ] **Step 3: Reescrever a página**

`artifacts/signage/src/pages/analytics.tsx` (arquivo inteiro):

```tsx
import { useState, type ReactNode } from 'react';
import { Clock, Monitor, Percent, Play, QrCode, Users } from 'lucide-react';
import {
  useGetAnalyticsHourly,
  useGetAnalyticsOverview,
  useGetAnalyticsRankings,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChartConfig } from '@/components/ui/chart';
import { KpiCard } from '@/components/portal/kpi-card';
import { PeriodFilter, type PortalDays } from '@/components/portal/period-filter';
import { TrendChart } from '@/components/portal/trend-chart';
import { formatDelta, formatPointDelta } from '@/components/portal/delta';
import { AvailabilityChart } from '@/components/analytics/availability-chart';
import { HourlyChart } from '@/components/analytics/hourly-chart';
import { RankingList } from '@/components/analytics/ranking-list';
import { AnnouncementsTable } from '@/components/analytics/announcements-table';
import { BlockError } from '@/components/analytics/block-error';

const TREND_CONFIG = {
  plays: { label: 'Exibições', color: 'hsl(var(--chart-1))' },
  scans: { label: 'Scans', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const int = (n: number) => n.toLocaleString('pt-BR');
const rate = (n: number) =>
  `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Visão geral da rede. Um período governa a página inteira — cards, gráficos e
 * rankings respondem à mesma pergunta. Cada bloco tem a própria consulta,
 * carga e erro: o ranking fora do ar não apaga os gráficos.
 */
export default function Analytics() {
  const [days, setDays] = useState<PortalDays>(30);
  const params = { days };
  const overview = useGetAnalyticsOverview(params);
  const hourly = useGetAnalyticsHourly(params);
  const rankings = useGetAnalyticsRankings(params);

  const totals = overview.data?.totals;
  const now = overview.data?.now;
  const noPlays = overview.data ? totals?.plays === 0 : false;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visão geral</h1>
          <p className="mt-1 text-muted-foreground">Exibições, disponibilidade e destaques da rede no período.</p>
        </div>
        <div className="ml-auto">
          <PeriodFilter value={days} onChange={setDays} />
        </div>
      </div>

      {overview.isError ? (
        <Card className="mb-6">
          <BlockError onRetry={() => overview.refetch()} />
        </Card>
      ) : !totals || !now ? (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Exibições" value={int(totals.plays)} icon={Play} delta={formatDelta(totals.plays, totals.previous.plays)} />
          <KpiCard
            label="Tempo de exibição"
            value={formatDuration(totals.durationSeconds)}
            icon={Clock}
            delta={formatDelta(totals.durationSeconds, totals.previous.durationSeconds)}
          />
          <KpiCard
            label="Scans"
            value={int(totals.scans)}
            icon={QrCode}
            delta={formatDelta(totals.scans, totals.previous.scans)}
            hint={`${int(totals.uniqueVisitors)} visitantes únicos`}
          />
          <KpiCard
            label="Taxa de scan"
            value={rate(totals.scanRate)}
            icon={Percent}
            delta={formatPointDelta(totals.scanRate, totals.previous.scanRate)}
          />
          <KpiCard label="TVs online agora" value={`${now.devicesOnline} de ${now.devices}`} icon={Monitor} />
          <KpiCard label="Clientes" value={int(now.clients)} icon={Users} />
        </div>
      )}

      {noPlays ? (
        <p className="mb-4 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Nenhuma exibição no período.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Exibições e scans por dia">
          {overview.isError ? (
            <BlockError onRetry={() => overview.refetch()} />
          ) : overview.data ? (
            <TrendChart data={overview.data.series} config={TREND_CONFIG} leftKey="plays" rightKey="scans" />
          ) : (
            <Skeleton className="h-[280px] w-full" />
          )}
        </Block>

        <Block title="TVs que funcionaram por dia">
          {overview.isError ? (
            <BlockError onRetry={() => overview.refetch()} />
          ) : overview.data ? (
            <AvailabilityChart series={overview.data.series} />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="Exibições por horário">
          {hourly.isError ? (
            <BlockError onRetry={() => hourly.refetch()} />
          ) : hourly.data ? (
            <HourlyChart hours={hourly.data.hours} />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="Campanhas">
          {rankings.isError ? (
            <BlockError onRetry={() => rankings.refetch()} />
          ) : rankings.data ? (
            <RankingList
              items={rankings.data.campaigns.map((c) => ({
                key: c.campaignId,
                label: c.name,
                sublabel: c.advertiserName,
                value: c.plays,
                href: `/campaigns/${c.campaignId}`,
              }))}
            />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="TVs">
          {rankings.isError ? (
            <BlockError onRetry={() => rankings.refetch()} />
          ) : rankings.data ? (
            <RankingList
              items={rankings.data.devices.map((d) => ({
                key: d.deviceId,
                label: d.name,
                sublabel: d.clientName,
                value: d.plays,
                href: `/devices/${d.deviceId}`,
              }))}
            />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>

        <Block title="Peças">
          {rankings.isError ? (
            <BlockError onRetry={() => rankings.refetch()} />
          ) : rankings.data ? (
            <AnnouncementsTable items={rankings.data.announcements} />
          ) : (
            <Skeleton className="h-[240px] w-full" />
          )}
        </Block>
      </div>
    </div>
  );
}
```

Ajuste esperado só se o typecheck acusar: o tipo do parâmetro gerado pode ser `GetAnalyticsOverviewParams` com `days?: GetAnalyticsOverviewDays` (enum literal); nesse caso tipar `params` com esse tipo importado de `@workspace/api-client-react`. Não trocar a lógica.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter ./artifacts/signage exec vitest run pages/__tests__/analytics`
Expected: PASS (5 testes).

- [ ] **Step 5: Tirar o `/analytics/summary`**

- `lib/api-spec/openapi.yaml`: apagar o bloco do path `/analytics/summary:` inteiro e o schema `AnalyticsSummary:` inteiro. `AnnouncementPlayStat` fica.
- `artifacts/api-server/src/routes/analytics.ts`: apagar o handler `router.get("/analytics/summary", ...)` e `GetAnalyticsSummaryResponse` do import. `scanTotals` fica (outras rotas usam).
- Run: `pnpm --dir lib/api-spec run codegen`
- Conferir que nada mais referencia o summary: `grep -rn "AnalyticsSummary\|analytics/summary" artifacts lib --include=*.ts --include=*.tsx --include=*.yaml` → sem resultados fora de `node_modules`.

- [ ] **Step 6: Suítes e tipos**

Run: `pnpm --filter ./artifacts/signage test && pnpm --filter ./artifacts/api-server test && pnpm run typecheck`
Expected: PASS em tudo. Se `src/__tests__/rotas-navegacao.test.tsx` (teste de rotas do admin que abre `/` e espera o título "Visão geral") falhar porque a página nova chama endpoints que o stub responde com 500, conferir que o título continua visível com erro nos blocos; o teste só exige o heading.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/pages/analytics.tsx artifacts/signage/src/pages/__tests__/analytics.test.tsx artifacts/api-server/src/routes/analytics.ts lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(admin): Visão geral com gráficos de exibição, disponibilidade e rankings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois das tasks

Quando o PR #51 (`feat/navegacao`) entrar na `main`, rebasear `feat/visao-geral` na `main`. PR com título `feat(admin): Visão geral com gráficos de exibição, disponibilidade e rankings` (minor), merge com `gh pr merge --merge`. O corpo do PR não pode ter linha começando com `BREAKING CHANGE:`.
