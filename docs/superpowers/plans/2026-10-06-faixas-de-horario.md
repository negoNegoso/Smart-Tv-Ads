# Faixas de horário nas campanhas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campanha de anunciante roda só dentro de faixas de horário escolhidas (ex.: 07:00–10:00 e 18:00–22:00) nos dias marcados.

**Architecture:** Coluna `campaigns.time_windows jsonb` (minutos do dia, `[]` = dia todo). A regra fica no servidor: `ad-eligibility.ts` ganha `normalizeTimeWindows` e `campaignRunsAtTime`, aplicados no feed da TV (comum e vitrine). A API valida e normaliza no POST/PATCH; o painel ganha um seletor de faixas no formulário e na página da campanha, e o horário aparece na leitura e na linha da lista.

**Tech Stack:** TypeScript, Express, drizzle-orm (Postgres), zod, vitest + supertest (API), React + Testing Library + vitest (web), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-06-faixas-de-horario-design.md`

## Global Constraints

- Branch `feat/faixas-de-horario`; PR com título `feat(api): faixas de horário nas campanhas`, merge commit.
- Commits no formato `tipo(escopo): descrição em português`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como UTF-8 real, nunca `\uXXXX`.
- `TimeWindow = { start: number; end: number }`, minutos desde 00:00 no fuso `America/Sao_Paulo`; `0 ≤ start < end ≤ 1440`; fim exclusivo; 1440 = "24:00".
- Lista vazia = dia todo. Campanha antiga não muda de comportamento.
- Passo de 15 minutos; no máximo 4 faixas na entrada da API.
- Faixa não cruza meia-noite; mesmas faixas para todos os dias marcados; só campanhas (painéis e playlist não ganham horário).
- Hora local sempre via `Intl` no `BUSINESS_TIME_ZONE`, nunca `getHours()`.
- Toda mudança de schema gera migração versionada com `pnpm --filter @workspace/db run generate` e a commita.

## Review Focus

- Painel antigo em cache salvando a campanha sem `timeWindows` → API grava `[]` (dia todo), sem 400. Teste na Task 3 ("PATCH sem timeWindows grava dia todo").
- Slide de campanha vindo de mock/linha sem `timeWindows` (playlist, painéis, testes antigos) → tratado como dia todo, nunca derruba o feed. Teste na Task 1 ("ausente vale dia todo").
- Meia-noite no fuso: 00:00 em São Paulo (03:00 UTC) cai na faixa 00:00–02:00 e não na 22:00–24:00 do dia anterior. Teste na Task 1.
- Usuário escolhe início depois do fim no seletor → aviso na linha e "Publicar campanha" desabilitado; na página da campanha, `submit` recusa com mensagem (toast). Testes nas Tasks 5.
- Faixas que, juntas, cobrem o dia (00:00–12:00 + 12:00–24:00) → salvas como `[]` e o rótulo mostra "Dia todo". Teste na Task 1.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/ad-eligibility.ts` | tipo `TimeWindow`, `normalizeTimeWindows`, `minuteOfDay`, `campaignRunsAtTime`; `filterEligibleSlides` passa a olhar o horário |
| `lib/db/src/schema/campaigns.ts` | coluna `timeWindows` |
| `lib/db/drizzle/00xx_*.sql` | migração gerada |
| `artifacts/api-server/src/lib/device-feed.ts` | seleciona `timeWindows`, filtra a vitrine, tira o campo da resposta |
| `artifacts/api-server/src/lib/panels/device-slides.ts` | `timeWindows?` em `CampaignOnlyFields` |
| `artifacts/api-server/src/routes/advertisers.ts` | zod, gravação normalizada, `timeWindows` no GET |
| `artifacts/signage/src/lib/time-windows.ts` (novo) | conversão minutos ↔ "HH:MM", rótulo, opções do seletor |
| `artifacts/signage/src/components/use-campaign-form.ts` | estado das faixas, validação, envio |
| `artifacts/signage/src/components/campaign-form-dialog.tsx` | `CampaignTimeWindowsPicker` |
| `artifacts/signage/src/pages/campaign-detail.tsx` | seletor na edição, "Horários" na leitura |
| `artifacts/signage/src/components/campaign-row.tsx` | faixa no resumo da linha |

Desvio consciente da spec: `hhmmToMinutes` não é criado — os `<select>` trabalham direto em minutos, então ninguém o chamaria (YAGNI).

---

### Task 1: Regra de horário em `ad-eligibility.ts`

**Files:**
- Modify: `artifacts/api-server/src/lib/ad-eligibility.ts`
- Test: `artifacts/api-server/src/lib/__tests__/ad-eligibility.test.ts`

**Interfaces:**
- Consumes: `BUSINESS_TIME_ZONE`, `campaignRunsOnDay`, `campaignReachesDevice`, `canPlayOnDevice` (já existem no arquivo).
- Produces:
  - `export type TimeWindow = { start: number; end: number }`
  - `export type CampaignSchedule = { weekdays: number[]; timeWindows?: TimeWindow[] }` (ausente = dia todo)
  - `export function normalizeTimeWindows(windows: TimeWindow[]): TimeWindow[]`
  - `export function minuteOfDay(now?: Date, timeZone?: string): number`
  - `export function campaignRunsAtTime(windows: TimeWindow[] | null | undefined, now?: Date, timeZone?: string): boolean`
  - `filterEligibleSlides` (mesma assinatura) agora também exige `campaignRunsAtTime(slide.timeWindows, now)`.

- [ ] **Step 1: Escrever os testes que falham**

No topo de `ad-eligibility.test.ts`, acrescentar ao import: `campaignRunsAtTime`, `minuteOfDay`, `normalizeTimeWindows`. No fim do `describe("filterEligibleSlides", ...)` (antes do `});` que o fecha, depois do teste "tira da lista a peça da campanha que não roda hoje"), acrescentar:

```ts
  it("tira da lista a peça da campanha fora da faixa de horário", () => {
    // Terça, 12:00 em São Paulo.
    const meioDia = new Date("2026-03-03T15:00:00Z");
    const soDeManha = { ...propria, timeWindows: [{ start: 420, end: 600 }] };
    const almoco = { ...propria, timeWindows: [{ start: 660, end: 780 }] };
    expect(filterEligibleSlides([soDeManha], device, meioDia)).toHaveLength(0);
    expect(filterEligibleSlides([almoco], device, meioDia)).toHaveLength(1);
  });
```

No fim do arquivo, acrescentar:

```ts
describe("normalizeTimeWindows", () => {
  it("ordena pelo início", () => {
    expect(normalizeTimeWindows([{ start: 1080, end: 1320 }, { start: 420, end: 600 }])).toEqual([
      { start: 420, end: 600 },
      { start: 1080, end: 1320 },
    ]);
  });

  it("junta faixas que se sobrepõem", () => {
    expect(normalizeTimeWindows([{ start: 420, end: 600 }, { start: 540, end: 720 }])).toEqual([{ start: 420, end: 720 }]);
  });

  it("junta faixas que se encostam", () => {
    expect(normalizeTimeWindows([{ start: 420, end: 600 }, { start: 600, end: 720 }])).toEqual([{ start: 420, end: 720 }]);
  });

  it("faixa contida em outra some", () => {
    expect(normalizeTimeWindows([{ start: 420, end: 720 }, { start: 480, end: 540 }])).toEqual([{ start: 420, end: 720 }]);
  });

  it("dia inteiro vira lista vazia: é o mesmo que sem faixa", () => {
    expect(normalizeTimeWindows([{ start: 0, end: 1440 }])).toEqual([]);
  });

  it("faixas que juntas cobrem o dia viram lista vazia", () => {
    expect(normalizeTimeWindows([{ start: 720, end: 1440 }, { start: 0, end: 720 }])).toEqual([]);
  });

  it("mantém a lista vazia", () => {
    expect(normalizeTimeWindows([])).toEqual([]);
  });

  it("não altera a lista recebida", () => {
    const entrada = [{ start: 540, end: 720 }, { start: 420, end: 600 }];
    normalizeTimeWindows(entrada);
    expect(entrada).toEqual([{ start: 540, end: 720 }, { start: 420, end: 600 }]);
  });
});

describe("minuteOfDay", () => {
  it("conta os minutos no fuso do negócio, não no do UTC", () => {
    // 15:30 UTC = 12:30 em São Paulo.
    expect(minuteOfDay(new Date("2026-03-03T15:30:00Z"))).toBe(750);
  });

  it("meia-noite é zero, não 1440", () => {
    // 03:00 UTC = 00:00 em São Paulo.
    expect(minuteOfDay(new Date("2026-03-04T03:00:00Z"))).toBe(0);
  });
});

describe("campaignRunsAtTime", () => {
  const manha = [{ start: 420, end: 600 }]; // 07:00–10:00
  // Horários de São Paulo (UTC−3).
  const as = (hhmm: string) => new Date(`2026-03-03T${hhmm}:00-03:00`);

  it("roda a qualquer hora quando a lista está vazia", () => {
    expect(campaignRunsAtTime([], as("03:00"))).toBe(true);
  });

  it("ausente vale dia todo (linhas de playlist e painel não têm a coluna)", () => {
    expect(campaignRunsAtTime(undefined, as("03:00"))).toBe(true);
    expect(campaignRunsAtTime(null, as("03:00"))).toBe(true);
  });

  it("roda no minuto em que a faixa começa", () => {
    expect(campaignRunsAtTime(manha, as("07:00"))).toBe(true);
  });

  it("não roda no minuto em que a faixa termina", () => {
    expect(campaignRunsAtTime(manha, as("10:00"))).toBe(false);
    expect(campaignRunsAtTime(manha, as("09:59"))).toBe(true);
  });

  it("roda em qualquer uma das faixas", () => {
    const manhaENoite = [...manha, { start: 1080, end: 1320 }];
    expect(campaignRunsAtTime(manhaENoite, as("19:00"))).toBe(true);
    expect(campaignRunsAtTime(manhaENoite, as("12:00"))).toBe(false);
  });

  it("usa a hora de quem assiste: 22:30 em São Paulo já é o dia seguinte em UTC", () => {
    expect(campaignRunsAtTime([{ start: 1320, end: 1440 }], new Date("2026-03-04T01:30:00Z"))).toBe(true);
  });

  it("meia-noite cai na faixa da madrugada, não na da noite anterior", () => {
    const meiaNoite = new Date("2026-03-04T03:00:00Z");
    expect(campaignRunsAtTime([{ start: 0, end: 120 }], meiaNoite)).toBe(true);
    expect(campaignRunsAtTime([{ start: 1320, end: 1440 }], meiaNoite)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/ad-eligibility.test.ts`
Expected: FAIL — `normalizeTimeWindows`/`minuteOfDay`/`campaignRunsAtTime` não são exportadas (`is not a function`).

- [ ] **Step 3: Implementar**

Em `ad-eligibility.ts`, trocar o bloco do `CampaignSchedule`:

```ts
/**
 * Dias da semana em que a campanha vai ao ar, no padrão do `Date.getDay()`:
 * 0 = domingo … 6 = sábado. Lista vazia significa "todo dia" — é o que valia
 * antes da recorrência existir, então campanha antiga não muda de comportamento.
 */
export type CampaignSchedule = { weekdays: number[] };
```

por:

```ts
/**
 * Faixa do dia em que a campanha vai ao ar, em minutos desde 00:00 no fuso do
 * negócio. Fim exclusivo: 07:00–10:00 é { start: 420, end: 600 } e não roda
 * às 10:00. 1440 é "24:00". Faixa nunca cruza a meia-noite.
 */
export type TimeWindow = { start: number; end: number };

/**
 * Agenda da campanha.
 *
 * `weekdays`: dias da semana no padrão do `Date.getDay()` (0 = domingo …
 * 6 = sábado). Lista vazia significa "todo dia" — é o que valia antes da
 * recorrência existir, então campanha antiga não muda de comportamento.
 *
 * `timeWindows`: faixas do dia, as mesmas em todos os dias marcados. Vazia ou
 * ausente é "dia todo" — linhas de playlist e de painel não carregam a coluna.
 */
export type CampaignSchedule = { weekdays: number[]; timeWindows?: TimeWindow[] };
```

Logo depois de `campaignRunsOnDay`, acrescentar:

```ts
const MINUTES_IN_DAY = 1440;

/**
 * Guarda as faixas no formato canônico: em ordem, sem sobreposição, e faixas
 * que se encostam viram uma só (07–10 + 10–12 = 07–12). Cobrir o dia inteiro
 * vira lista vazia — mesmo papel do `normalizeWeekdays`: "dia todo" tem uma
 * forma só no banco.
 */
export function normalizeTimeWindows(windows: TimeWindow[]): TimeWindow[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TimeWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ start: window.start, end: window.end });
    }
  }
  const coversWholeDay = merged.length === 1 && merged[0].start === 0 && merged[0].end === MINUTES_IN_DAY;
  return coversWholeDay ? [] : merged;
}

/**
 * Minutos desde 00:00 no fuso do negócio. Sai de `Intl`, nunca de
 * `getHours()`: o servidor roda em UTC, e às 22h de Brasília ele já está às
 * 01h. `hourCycle: "h23"` evita o "24:00" que alguns ICU devolvem à
 * meia-noite; o `% 24` é a segunda garantia.
 */
export function minuteOfDay(now: Date = new Date(), timeZone: string = BUSINESS_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * A campanha está na faixa agora? Lista vazia (ou ausente) roda o dia todo.
 * Início incluso, fim excluso.
 */
export function campaignRunsAtTime(
  windows: TimeWindow[] | null | undefined,
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIME_ZONE,
): boolean {
  if (!windows || windows.length === 0) return true;
  const minute = minuteOfDay(now, timeZone);
  return windows.some((window) => window.start <= minute && minute < window.end);
}
```

Em `filterEligibleSlides`, trocar:

```ts
    (slide) =>
      campaignRunsOnDay(slide.weekdays, now) &&
      campaignReachesDevice(slide, device) &&
```

por:

```ts
    (slide) =>
      campaignRunsOnDay(slide.weekdays, now) &&
      campaignRunsAtTime(slide.timeWindows, now) &&
      campaignReachesDevice(slide, device) &&
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/ad-eligibility.test.ts`
Expected: PASS (todos, inclusive os antigos).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/ad-eligibility.ts artifacts/api-server/src/lib/__tests__/ad-eligibility.test.ts
git commit -F - <<'EOF'
feat(api): regra de faixa de horário na elegibilidade da campanha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Coluna `time_windows` e feed da TV

**Files:**
- Modify: `lib/db/src/schema/campaigns.ts`
- Create: `lib/db/drizzle/<gerado>.sql` (+ arquivos de meta do drizzle-kit)
- Modify: `artifacts/api-server/src/lib/device-feed.ts`
- Modify: `artifacts/api-server/src/lib/panels/device-slides.ts:29-36`
- Test: `artifacts/api-server/src/lib/__tests__/device-feed-query.test.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `TimeWindow`, `campaignRunsAtTime`, `campaignRunsOnDay`, `filterEligibleSlides` (Task 1).
- Produces: `campaignsTable.timeWindows` (`jsonb`, tipo `TimeWindow[]`, `NOT NULL DEFAULT '[]'`) — usada pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Em `device-feed-query.test.ts`, dentro do `describe("buildCampaignSlidesQuery", ...)`, acrescentar:

```ts
  it("traz as faixas de horário da campanha para o filtro do feed", () => {
    const { sql } = buildCampaignSlidesQuery(new Date("2026-09-24T12:00:00Z")).toSQL();
    expect(sql).toContain('"campaigns"."time_windows"');
  });
```

Em `display-slides.test.ts`, no mock de `@workspace/db`, acrescentar `timeWindows: "timeWindows"` ao `campaignsTable`:

```ts
  campaignsTable: { id: "id", advertiserId: "advertiserId", isActive: "isActive", startsAt: "startsAt", endsAt: "endsAt", weekdays: "weekdays", timeWindows: "timeWindows", targetMode: "targetMode" },
```

Dentro do `describe("GET /display/:deviceKey/feed — TV vitrine", ...)`, depois do teste "vitrine respeita os dias da semana da campanha", acrescentar:

```ts
  it("vitrine respeita a faixa de horário da campanha", async () => {
    // Quarta, 12:00 em São Paulo.
    vi.useFakeTimers({ now: new Date("2026-09-30T15:00:00Z"), toFake: ["Date"] });
    try {
      const SO_DE_MANHA = { ...CAMPAIGN_ROW, announcementId: 505, campaignId: 7, timeWindows: [{ start: 420, end: 600 }] };
      const NO_ALMOCO = { ...CAMPAIGN_ROW, announcementId: 606, campaignId: 8, timeWindows: [{ start: 660, end: 780 }] };
      selectResults = [[{ ...DEVICE_ROW, showcase: true }], [], [SO_DE_MANHA, NO_ALMOCO]];
      const app = await buildApp();
      const { default: request } = await import("supertest");
      const res = await request(app).get("/display/tv-1/feed");

      const ids = res.body.slides.map((s: { announcementId: number }) => s.announcementId);
      expect(ids).toEqual([606]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("TV comum também corta a campanha fora da faixa, e o slide não leva as faixas", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-30T15:00:00Z"), toFake: ["Date"] });
    try {
      const SO_DE_MANHA = { ...CAMPAIGN_ROW, announcementId: 505, campaignId: 7, timeWindows: [{ start: 420, end: 600 }] };
      const NO_ALMOCO = { ...CAMPAIGN_ROW, announcementId: 606, campaignId: 8, timeWindows: [{ start: 660, end: 780 }] };
      selectResults = [[{ ...DEVICE_ROW, showcase: false }], [], [SO_DE_MANHA, NO_ALMOCO]];
      panelSlidesForClientMock.mockResolvedValue([]);
      const app = await buildApp();
      const { default: request } = await import("supertest");
      const res = await request(app).get("/display/tv-1/feed");

      expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([606]);
      expect(res.body.slides[0]).not.toHaveProperty("timeWindows");
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/device-feed-query.test.ts src/routes/__tests__/display-slides.test.ts`
Expected: FAIL — o SQL não contém `"campaigns"."time_windows"` (coluna não existe no schema) e a vitrine devolve `[505, 606]` (não filtra horário).

- [ ] **Step 3: Implementar a coluna**

Em `lib/db/src/schema/campaigns.ts`, acrescentar `jsonb` ao import de `drizzle-orm/pg-core` e, logo depois da coluna `weekdays`, inserir:

```ts
  // Faixas do dia em que a campanha vai ao ar, em minutos desde 00:00 no fuso
  // do negócio: [{ start: 420, end: 600 }] = 07:00–10:00. Fim exclusivo; 1440
  // = 24:00. Lista vazia é "dia todo": mantém as campanhas antigas como estavam.
  timeWindows: jsonb("time_windows").$type<Array<{ start: number; end: number }>>().notNull().default([]),
```

Gerar e conferir a migração:

```bash
cd lib/db && npx tsc --build && cd ../..
pnpm --filter @workspace/db run generate
ls -t lib/db/drizzle/*.sql | head -1 | xargs cat
```

Expected: um único `ALTER TABLE "campaigns" ADD COLUMN "time_windows" jsonb DEFAULT '[]'::jsonb NOT NULL;`. Se aparecer qualquer outra alteração, parar e investigar (schema e migrações fora de sincronia).

- [ ] **Step 4: Implementar o feed**

Em `artifacts/api-server/src/lib/panels/device-slides.ts`, no tipo `CampaignOnlyFields`, depois de `weekdays?: number[];`:

```ts
  timeWindows?: Array<{ start: number; end: number }>;
```

Em `artifacts/api-server/src/lib/device-feed.ts`:

1. Import: trocar `import { campaignRunsOnDay, filterEligibleSlides } from "./ad-eligibility";` por
   `import { campaignRunsAtTime, campaignRunsOnDay, filterEligibleSlides, type TimeWindow } from "./ad-eligibility";`
2. Em `buildCampaignSlidesQuery`, depois de `weekdays: campaignsTable.weekdays,`:
   ```ts
      timeWindows: campaignsTable.timeWindows,
   ```
3. Na query da playlist em `loadDeviceSlides`, depois de `weekdays: sql<number[]>\`array[]::int[]\`,`:
   ```ts
      timeWindows: sql<TimeWindow[]>`'[]'::jsonb`,
   ```
4. Trocar o comentário e o filtro da vitrine:
   ```ts
  // A vitrine é a amostra da rede na landing: toda campanha no ar entra,
  // sem alvo nem concorrência. Só a agenda vale (dia e faixa de horário) —
  // campanha fora da agenda também não roda em TV nenhuma.
   ```
   e
   ```ts
    ? campaignSlides.filter(
        (slide) => campaignRunsOnDay(slide.weekdays, now) && campaignRunsAtTime(slide.timeWindows, now),
      )
   ```
5. No `visible.map(async ({ ... }) => ...)`, depois de `weekdays,` na desestruturação, acrescentar `timeWindows,` — já cumpriu o papel no filtro; o player não recebe.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/device-feed-query.test.ts src/routes/__tests__/display-slides.test.ts src/routes/__tests__/device-preview.test.ts src/routes/__tests__/public-vitrine.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/campaigns.ts lib/db/drizzle artifacts/api-server/src/lib/device-feed.ts artifacts/api-server/src/lib/panels/device-slides.ts artifacts/api-server/src/lib/__tests__/device-feed-query.test.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts
git commit -F - <<'EOF'
feat(api): feed da TV respeita a faixa de horário da campanha

Coluna campaigns.time_windows (jsonb, vazia = dia todo) com migração.
A vitrine também passa a olhar o horário: horário é agenda.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: API de campanhas aceita e devolve as faixas

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts` (schema `campaignInput` ~linha 25, seleção ~linha 157, POST ~linha 303, PATCH ~linha 364)
- Test: `artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts` (reaproveita o fake de banco com tabelas reais que já existe ali)

**Interfaces:**
- Consumes: `normalizeTimeWindows` (Task 1), `campaignsTable.timeWindows` (Task 2).
- Produces: corpo de POST/PATCH `/campaigns` aceita `timeWindows: Array<{ start: number; end: number }>` (opcional, default `[]`); GET das campanhas devolve `timeWindows` — usado pelas Tasks 5 e 6.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `campaign-flyers-route.test.ts`, acrescentar:

```ts
describe("faixas de horário da campanha", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    state.advertiserRow = { id: ADVERTISER_ID };
    state.insertCampaignReturning = { id: CAMPAIGN_ID };
    state.joinedStatsRow = joinedFrom(baseExisting());
    app = await buildApp();
  });

  function insertedCampaign() {
    return state.insertCalls.find((c) => c.table === "campaigns")?.values as Record<string, unknown>;
  }

  function updatedCampaign() {
    return state.updateCalls.find((c) => c.table === "campaigns")?.patch as Record<string, unknown>;
  }

  it("POST grava as faixas normalizadas (ordenadas e juntas)", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/campaigns")
      .send(campaignBody({ timeWindows: [{ start: 540, end: 720 }, { start: 420, end: 600 }] }));
    expect(res.status).toBe(201);
    expect(insertedCampaign().timeWindows).toEqual([{ start: 420, end: 720 }]);
  });

  it("POST sem faixas grava dia todo", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody());
    expect(res.status).toBe(201);
    expect(insertedCampaign().timeWindows).toEqual([]);
  });

  it("PATCH grava as faixas normalizadas", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .patch(`/campaigns/${CAMPAIGN_ID}`)
      .send(campaignBody({ timeWindows: [{ start: 1080, end: 1320 }, { start: 420, end: 600 }] }));
    expect(res.status).toBe(200);
    expect(updatedCampaign().timeWindows).toEqual([{ start: 420, end: 600 }, { start: 1080, end: 1320 }]);
  });

  it("PATCH sem timeWindows grava dia todo (painel antigo em cache não quebra)", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app).patch(`/campaigns/${CAMPAIGN_ID}`).send(campaignBody());
    expect(res.status).toBe(200);
    expect(updatedCampaign().timeWindows).toEqual([]);
  });

  it("faixa cobrindo o dia inteiro vira dia todo", async () => {
    const { default: request } = await import("supertest");
    await request(app).post("/campaigns").send(campaignBody({ timeWindows: [{ start: 0, end: 1440 }] }));
    expect(insertedCampaign().timeWindows).toEqual([]);
  });

  it.each([
    ["fim igual ao início", [{ start: 600, end: 600 }]],
    ["fim antes do início", [{ start: 600, end: 420 }]],
    ["minuto fora do passo de 15", [{ start: 425, end: 600 }]],
    ["fim depois de 24:00", [{ start: 1380, end: 1455 }]],
    ["mais de 4 faixas", [
      { start: 0, end: 60 }, { start: 120, end: 180 }, { start: 240, end: 300 },
      { start: 360, end: 420 }, { start: 480, end: 540 },
    ]],
  ])("rejeita com 400: %s", async (_caso, timeWindows) => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody({ timeWindows }));
    expect(res.status).toBe(400);
    expect(state.insertCalls.some((c) => c.table === "campaigns")).toBe(false);
  });

  it("a resposta da campanha traz as faixas (seleção inclui a coluna)", async () => {
    const { default: request } = await import("supertest");
    await request(app).post("/campaigns").send(campaignBody());
    expect(state.lastJoinedCampaignCols).toHaveProperty("timeWindows");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-flyers-route.test.ts`
Expected: FAIL — `timeWindows` é `undefined` no insert/update, os casos inválidos devolvem 201, e `lastJoinedCampaignCols` não tem `timeWindows`.

- [ ] **Step 3: Implementar**

Em `advertisers.ts`:

1. Import: `import { normalizeTimeWindows, normalizeWeekdays } from "../lib/ad-eligibility";`
2. No `campaignInput`, depois de `weekdays: ...default([]),`:

```ts
  // Faixas do dia, em minutos desde 00:00 (fim exclusivo, 1440 = 24:00), de
  // 15 em 15. Lista vazia é "dia todo". O default também cobre o painel antigo
  // em cache que ainda não manda o campo: ele salva a campanha como dia todo.
  timeWindows: z
    .array(
      z
        .object({
          start: z.coerce.number().int().min(0).max(1425).multipleOf(15),
          end: z.coerce.number().int().min(15).max(1440).multipleOf(15),
        })
        .refine((w) => w.start < w.end, { message: "Fim da faixa precisa ser depois do início" }),
    )
    .max(4)
    .default([]),
```

3. Na seleção das campanhas, depois de `weekdays: campaignsTable.weekdays,`:

```ts
  timeWindows: campaignsTable.timeWindows,
```

4. No `db.insert(campaignsTable).values({...})` do POST e no `db.update(campaignsTable).set({...})` do PATCH, depois de `weekdays: normalizeWeekdays(input.weekdays),`:

```ts
    timeWindows: normalizeTimeWindows(input.timeWindows),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-flyers-route.test.ts`
Expected: PASS (novos e antigos).

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo PASS, sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/advertisers.ts artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts
git commit -F - <<'EOF'
feat(api): campanha aceita e devolve faixas de horário

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: `lib/time-windows.ts` no painel

**Files:**
- Create: `artifacts/signage/src/lib/time-windows.ts`
- Test: `artifacts/signage/src/lib/__tests__/time-windows.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usado pelas Tasks 5 e 6):
  - `export type TimeWindow = { start: number; end: number }`
  - `export const MAX_TIME_WINDOWS = 4`
  - `export const DEFAULT_TIME_WINDOW: TimeWindow` (`{ start: 480, end: 720 }`)
  - `export const START_OPTIONS: number[]` (0, 15, …, 1425)
  - `export const END_OPTIONS: number[]` (15, 30, …, 1440)
  - `export function minutesToHHMM(minutes: number): string`
  - `export function isValidWindow(window: TimeWindow): boolean`
  - `export function timeWindowsLabel(windows: TimeWindow[] | null | undefined): string`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// artifacts/signage/src/lib/__tests__/time-windows.test.ts
import { describe, expect, it } from 'vitest';
import {
  END_OPTIONS,
  START_OPTIONS,
  isValidWindow,
  minutesToHHMM,
  timeWindowsLabel,
} from '../time-windows';

describe('minutesToHHMM', () => {
  it('formata com dois dígitos', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(420)).toBe('07:00');
    expect(minutesToHHMM(1305)).toBe('21:45');
  });

  it('1440 é 24:00, o fim do dia', () => {
    expect(minutesToHHMM(1440)).toBe('24:00');
  });
});

describe('timeWindowsLabel', () => {
  it('sem faixa é dia todo', () => {
    expect(timeWindowsLabel([])).toBe('Dia todo');
    expect(timeWindowsLabel(undefined)).toBe('Dia todo');
  });

  it('lista as faixas separadas por vírgula', () => {
    expect(timeWindowsLabel([{ start: 420, end: 600 }, { start: 1080, end: 1320 }])).toBe('07:00–10:00, 18:00–22:00');
  });
});

describe('isValidWindow', () => {
  it('fim precisa ser depois do início', () => {
    expect(isValidWindow({ start: 420, end: 600 })).toBe(true);
    expect(isValidWindow({ start: 600, end: 600 })).toBe(false);
    expect(isValidWindow({ start: 600, end: 420 })).toBe(false);
  });
});

describe('opções do seletor', () => {
  it('início vai de 00:00 a 23:45 de 15 em 15', () => {
    expect(START_OPTIONS[0]).toBe(0);
    expect(START_OPTIONS.at(-1)).toBe(1425);
    expect(START_OPTIONS).toHaveLength(96);
  });

  it('fim vai de 00:15 a 24:00 de 15 em 15', () => {
    expect(END_OPTIONS[0]).toBe(15);
    expect(END_OPTIONS.at(-1)).toBe(1440);
    expect(END_OPTIONS).toHaveLength(96);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/time-windows.test.ts`
Expected: FAIL — `Failed to resolve import "../time-windows"`.

- [ ] **Step 3: Implementar**

```ts
// artifacts/signage/src/lib/time-windows.ts
/**
 * Faixa do dia em que a campanha vai ao ar, em minutos desde 00:00 no fuso do
 * negócio — o mesmo formato que a API guarda. Fim exclusivo; 1440 é "24:00".
 * Lista vazia é "dia todo".
 */
export type TimeWindow = { start: number; end: number };

/** Mesmo teto da API. */
export const MAX_TIME_WINDOWS = 4;

/** Faixa que o "+ faixa" cria: um ponto de partida comum, fácil de ajustar. */
export const DEFAULT_TIME_WINDOW: TimeWindow = { start: 480, end: 720 };

const STEP = 15;
const SLOTS = 1440 / STEP;

/** Início: 00:00 … 23:45. Fim: 00:15 … 24:00. O passo de 15 fica garantido pelo próprio seletor. */
export const START_OPTIONS = Array.from({ length: SLOTS }, (_, i) => i * STEP);
export const END_OPTIONS = Array.from({ length: SLOTS }, (_, i) => (i + 1) * STEP);

export function minutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function isValidWindow(window: TimeWindow): boolean {
  return window.start < window.end;
}

export function timeWindowsLabel(windows: TimeWindow[] | null | undefined): string {
  if (!windows || windows.length === 0) return 'Dia todo';
  return windows.map((w) => `${minutesToHHMM(w.start)}–${minutesToHHMM(w.end)}`).join(', ');
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/time-windows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/lib/time-windows.ts artifacts/signage/src/lib/__tests__/time-windows.test.ts
git commit -F - <<'EOF'
feat(portal): utilitários de faixa de horário no painel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Estado no formulário e seletor de faixas

**Files:**
- Modify: `artifacts/signage/src/components/use-campaign-form.ts`
- Modify: `artifacts/signage/src/components/campaign-form-dialog.tsx`
- Test: `artifacts/signage/src/components/__tests__/use-campaign-form.test.ts` (novo)
- Test: `artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `TimeWindow`, `MAX_TIME_WINDOWS`, `DEFAULT_TIME_WINDOW`, `START_OPTIONS`, `END_OPTIONS`, `minutesToHHMM`, `isValidWindow`, `timeWindowsLabel` (Task 4); API da Task 3.
- Produces (usado pela Task 6):
  - `CampaignFormCampaign.timeWindows?: TimeWindow[]`
  - `UseCampaignForm` ganha `timeWindows: TimeWindow[]`, `timeWindowsValid: boolean`, `addWindow(): void`, `updateWindow(index: number, patch: Partial<TimeWindow>): void`, `removeWindow(index: number): void`
  - `submit()` recusa `{ ok: false, error: "Fim da faixa precisa ser depois do início" }` sem chamar a API quando alguma faixa é inválida.
  - `export function CampaignTimeWindowsPicker({ form }: { form: ReturnType<typeof useCampaignForm> })`

- [ ] **Step 1: Escrever os testes que falham**

Novo `use-campaign-form.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCampaignForm } from '../use-campaign-form';

afterEach(() => vi.unstubAllGlobals());

function okFetch() {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useCampaignForm — faixas de horário', () => {
  it('envia timeWindows no corpo, vazio quando não há faixa', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    await act(async () => { await result.current.submit(); });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).timeWindows).toEqual([]);
  });

  it('envia as faixas editadas', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.addWindow());
    act(() => result.current.updateWindow(0, { start: 420, end: 600 }));
    await act(async () => { await result.current.submit(); });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).timeWindows).toEqual([{ start: 420, end: 600 }]);
  });

  it('não passa de 4 faixas', () => {
    const { result } = renderHook(() => useCampaignForm());
    for (let i = 0; i < 6; i++) act(() => result.current.addWindow());
    expect(result.current.timeWindows).toHaveLength(4);
  });

  it('remove a faixa pelo índice', () => {
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.addWindow());
    act(() => result.current.addWindow());
    act(() => result.current.updateWindow(1, { start: 1080, end: 1320 }));
    act(() => result.current.removeWindow(0));
    expect(result.current.timeWindows).toEqual([{ start: 1080, end: 1320 }]);
  });

  it('faixa inválida: submit recusa sem chamar a API', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.addWindow());
    act(() => result.current.updateWindow(0, { start: 600, end: 420 }));
    expect(result.current.timeWindowsValid).toBe(false);
    let outcome!: { ok: boolean; error?: string };
    await act(async () => { outcome = await result.current.submit(); });
    expect(outcome).toEqual({ ok: false, error: 'Fim da faixa precisa ser depois do início' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reset carrega as faixas da campanha e volta a vazio na nova', () => {
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.reset({
      id: 1, advertiserId: 3, name: 'C', contractValue: 0, targetMode: 'all',
      startsAt: '2026-09-20T00:00:00.000Z', endsAt: '2026-09-27T00:00:00.000Z',
      timeWindows: [{ start: 420, end: 600 }],
    }));
    expect(result.current.timeWindows).toEqual([{ start: 420, end: 600 }]);
    act(() => result.current.reset(null));
    expect(result.current.timeWindows).toEqual([]);
  });
});
```

Em `campaign-form-dialog.test.tsx`, no fim do `describe('CampaignFormDialog', ...)`, acrescentar:

```ts
  it('adiciona e remove faixa de horário', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    expect(screen.getByText(/Dia todo\. Sem faixa, roda o dia inteiro/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ faixa' }));
    expect(screen.getByRole('combobox', { name: 'Início da faixa 1' })).toHaveValue('480');
    expect(screen.getByRole('combobox', { name: 'Fim da faixa 1' })).toHaveValue('720');
    expect(screen.getByText(/08:00–12:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remover faixa' }));
    expect(screen.queryByRole('combobox', { name: 'Início da faixa 1' })).not.toBeInTheDocument();
  });

  it('"+ faixa" some na quarta faixa', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByRole('button', { name: '+ faixa' }));
    expect(screen.queryByRole('button', { name: '+ faixa' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remover faixa' })).toHaveLength(4);
  });

  it('faixa com fim antes do início avisa e trava o publicar', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: '+ faixa' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Fim da faixa 1' }), '480');
    expect(screen.getByText('Fim precisa ser depois do início')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar campanha' })).toBeDisabled();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/use-campaign-form.test.ts src/components/__tests__/campaign-form-dialog.test.tsx`
Expected: FAIL — `result.current.addWindow is not a function`; botão "+ faixa" não encontrado.

- [ ] **Step 3: Implementar o hook**

Em `use-campaign-form.ts`:

1. Import no topo: `import { DEFAULT_TIME_WINDOW, MAX_TIME_WINDOWS, isValidWindow, type TimeWindow } from "@/lib/time-windows";`
2. Em `CampaignFormCampaign`, depois de `weekdays?: number[];`: `timeWindows?: TimeWindow[];`
3. Em `UseCampaignForm`, depois de `toggleWeekday: (day: number) => void;`:
   ```ts
  timeWindows: TimeWindow[];
  timeWindowsValid: boolean;
  addWindow: () => void;
  updateWindow: (index: number, patch: Partial<TimeWindow>) => void;
  removeWindow: (index: number) => void;
   ```
4. Estado, depois do `useState` de `weekdays`:
   ```ts
  // Vazio = dia todo, mesma convenção do servidor.
  const [timeWindows, setTimeWindows] = useState<TimeWindow[]>([]);
   ```
5. Em `reset`: no ramo com campanha, depois de `setWeekdays(campaign.weekdays ?? []);` → `setTimeWindows(campaign.timeWindows ?? []);`; no ramo sem campanha, depois de `setWeekdays([]);` → `setTimeWindows([]);`.
6. Depois de `toggleWeekday`:
   ```ts
  function addWindow() {
    setTimeWindows((current) => (current.length >= MAX_TIME_WINDOWS ? current : [...current, { ...DEFAULT_TIME_WINDOW }]));
  }

  function updateWindow(index: number, patch: Partial<TimeWindow>) {
    setTimeWindows((current) => current.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  }

  function removeWindow(index: number) {
    setTimeWindows((current) => current.filter((_, i) => i !== index));
  }

  const timeWindowsValid = timeWindows.every(isValidWindow);
   ```
7. No começo de `submit`, antes do `fetch`:
   ```ts
    // A página da campanha não trava o botão; a recusa aqui vale para os dois
    // formulários, e a API valida de novo de qualquer jeito.
    if (!timeWindowsValid) return { ok: false, error: "Fim da faixa precisa ser depois do início" };
   ```
8. No `JSON.stringify({...})`, depois de `weekdays,`: `timeWindows,` — sempre enviado, mesmo vazio (painel novo nunca depende do default da API).
9. No `return`, depois de `weekdays, toggleWeekday,`:
   ```ts
    timeWindows, timeWindowsValid, addWindow, updateWindow, removeWindow,
   ```

- [ ] **Step 4: Implementar o seletor**

Em `campaign-form-dialog.tsx`:

1. Imports: `import { X } from "lucide-react";` e
   `import { END_OPTIONS, MAX_TIME_WINDOWS, START_OPTIONS, isValidWindow, minutesToHHMM, timeWindowsLabel } from "@/lib/time-windows";`
2. Logo depois de `CampaignWeekdayPicker`, acrescentar:

```tsx
const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/**
 * Faixas do dia em que a campanha roda, as mesmas em todos os dias marcados.
 * Sem faixa é "dia todo" — o estado inicial, então a ajuda diz isso. `select`
 * em vez de `<input type="time">`: o passo de 15 minutos fica garantido sem
 * depender do navegador respeitar `step`.
 */
export function CampaignTimeWindowsPicker({ form }: { form: ReturnType<typeof useCampaignForm> }) {
  return (
    <div className="space-y-2">
      <Label>Horários</Label>
      {form.timeWindows.map((window, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center gap-2">
            <select
              aria-label={`Início da faixa ${index + 1}`}
              className={SELECT_CLASS}
              value={window.start}
              onChange={(e) => form.updateWindow(index, { start: Number(e.target.value) })}
            >
              {START_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
            </select>
            <span className="text-sm text-muted-foreground">até</span>
            <select
              aria-label={`Fim da faixa ${index + 1}`}
              className={SELECT_CLASS}
              value={window.end}
              onChange={(e) => form.updateWindow(index, { end: Number(e.target.value) })}
            >
              {END_OPTIONS.map((m) => <option key={m} value={m}>{minutesToHHMM(m)}</option>)}
            </select>
            <Button type="button" variant="ghost" size="icon" aria-label="Remover faixa" onClick={() => form.removeWindow(index)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {!isValidWindow(window) && <p className="text-xs text-red-500">Fim precisa ser depois do início</p>}
        </div>
      ))}
      {form.timeWindows.length < MAX_TIME_WINDOWS && (
        <Button type="button" variant="outline" size="sm" onClick={form.addWindow}>+ faixa</Button>
      )}
      <p className="text-xs text-muted-foreground">{timeWindowsLabel(form.timeWindows)}. Sem faixa, roda o dia inteiro nos dias marcados.</p>
    </div>
  );
}
```

3. No JSX do diálogo, logo depois de `<CampaignWeekdayPicker form={form} />`: `<CampaignTimeWindowsPicker form={form} />`
4. No botão de envio, trocar `disabled={form.selectedAdvertiser === null}` por `disabled={form.selectedAdvertiser === null || !form.timeWindowsValid}`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/use-campaign-form.test.ts src/components/__tests__/campaign-form-dialog.test.tsx`
Expected: PASS (novos e antigos).

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erros. (Se `X` já vier importado de `lucide-react` no arquivo, juntar no import existente.)

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/use-campaign-form.ts artifacts/signage/src/components/campaign-form-dialog.tsx artifacts/signage/src/components/__tests__/use-campaign-form.test.ts artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx
git commit -F - <<'EOF'
feat(portal): seletor de faixas de horário no formulário da campanha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Horário na página da campanha e na linha da lista

**Files:**
- Modify: `artifacts/signage/src/pages/campaign-detail.tsx` (tipo ~linha 34, edição ~linha 256, leitura ~linha 266)
- Modify: `artifacts/signage/src/components/campaign-row.tsx`
- Test: `artifacts/signage/src/components/__tests__/campaign-row.test.tsx` (novo)

**Interfaces:**
- Consumes: `CampaignTimeWindowsPicker`, `timeWindows` do hook (Task 5); `timeWindowsLabel`, `TimeWindow` (Task 4); `timeWindows` no GET (Task 3).
- Produces: `CampaignRowData.timeWindows?: TimeWindow[]`.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// artifacts/signage/src/components/__tests__/campaign-row.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CampaignRow, type CampaignRowData } from '../campaign-row';

const base: CampaignRowData = {
  id: 1,
  name: 'Café da manhã',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-10-31T00:00:00.000Z',
  targetMode: 'all',
  weekdays: [1, 2, 3, 4, 5],
  segmentNames: [],
  isActive: true,
};

describe('CampaignRow — horário', () => {
  it('mostra as faixas depois dos dias', () => {
    render(<CampaignRow campaign={{ ...base, timeWindows: [{ start: 420, end: 600 }] }} onToggle={vi.fn()} />);
    expect(screen.getByText(/Seg, Ter, Qua, Qui, Sex · 07:00–10:00/)).toBeInTheDocument();
  });

  it('dia todo não polui a linha', () => {
    render(<CampaignRow campaign={{ ...base, timeWindows: [] }} onToggle={vi.fn()} />);
    expect(screen.queryByText(/Dia todo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d{2}:\d{2}–/)).not.toBeInTheDocument();
  });

  it('campanha sem o campo (portal, resposta antiga) não quebra', () => {
    render(<CampaignRow campaign={base} onToggle={vi.fn()} />);
    expect(screen.getByText('Café da manhã')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/campaign-row.test.tsx`
Expected: FAIL no primeiro teste — o texto `· 07:00–10:00` não aparece.

- [ ] **Step 3: Implementar a linha**

Em `campaign-row.tsx`:

1. Import: `import { timeWindowsLabel, type TimeWindow } from "@/lib/time-windows";`
2. Em `CampaignRowData`, depois de `weekdays?: number[];`: `timeWindows?: TimeWindow[];`
3. Depois de `recurrence`:
   ```ts
// Mesmo critério da recorrência: "dia todo" é o implícito e não aparece.
function hours(campaign: CampaignRowData) {
  const windows = campaign.timeWindows ?? [];
  return windows.length === 0 ? "" : ` · ${timeWindowsLabel(windows)}`;
}
   ```
4. Na linha 49, trocar `{recurrence(campaign)}` por `{recurrence(campaign)}{hours(campaign)}`.

- [ ] **Step 4: Implementar a página da campanha**

Em `campaign-detail.tsx`:

1. Import: trocar `import { CampaignTargetPicker, CampaignWeekdayPicker } from "@/components/campaign-form-dialog";` por
   `import { CampaignTargetPicker, CampaignTimeWindowsPicker, CampaignWeekdayPicker } from "@/components/campaign-form-dialog";`
   e acrescentar `import { timeWindowsLabel, type TimeWindow } from "@/lib/time-windows";`
2. No tipo da campanha (onde está `weekdays: number[];`), acrescentar depois: `timeWindows?: TimeWindow[];`
3. Na edição, logo depois do bloco
   ```tsx
              <div className="space-y-2 sm:col-span-2">
                <CampaignWeekdayPicker form={form} />
              </div>
   ```
   acrescentar:
   ```tsx
              <div className="space-y-2 sm:col-span-2">
                <CampaignTimeWindowsPicker form={form} />
              </div>
   ```
4. Na leitura, logo depois de `<div><p className="text-xs text-muted-foreground">Dias da semana</p><p>{weekdaysLabel(data.weekdays)}</p></div>`:
   ```tsx
              <div><p className="text-xs text-muted-foreground">Horários</p><p>{timeWindowsLabel(data.timeWindows)}</p></div>
   ```

O `save()` da página já mostra `result.error` em toast; com faixa inválida o `submit` da Task 5 devolve "Fim da faixa precisa ser depois do início" sem chamar a API.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/campaign-row.test.tsx`
Expected: PASS.

Run: `pnpm --filter @workspace/signage run test && pnpm --filter @workspace/signage run typecheck`
Expected: tudo PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/campaign-row.tsx artifacts/signage/src/pages/campaign-detail.tsx artifacts/signage/src/components/__tests__/campaign-row.test.tsx
git commit -F - <<'EOF'
feat(portal): horário da campanha na página e na lista

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Verificação final

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suite completa e tipos**

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/signage run test
pnpm --filter @workspace/signage run build
pnpm --filter @workspace/api-server run build
```

Expected: tudo verde. Qualquer falha volta para a task dona do arquivo.

- [ ] **Step 2: Conferir a migração commitada**

```bash
git diff main --stat -- lib/db/drizzle
git diff main -- lib/db/drizzle/*.sql
```

Expected: uma migração nova só com o `ADD COLUMN "time_windows" jsonb DEFAULT '[]'::jsonb NOT NULL`.

- [ ] **Step 3: Conferir acentos**

```bash
git diff main | grep -n '\\u00' || echo "sem escapes"
```

Expected: `sem escapes`.

- [ ] **Step 4 (manual, opcional): ver funcionando**

Com `./dev.sh`: criar uma campanha com faixa que inclua a hora atual e outra que não inclua; abrir `/devices/<id>` (prévia) e conferir que só a primeira aparece. Depois disso, seguir com superpowers:finishing-a-development-branch (PR `feat(api): faixas de horário nas campanhas`).
