# Clima e hora na volta da TV — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TV com "Clima e hora" ligado ganha, uma vez por volta, um slide com o clima da cidade da loja e a data/hora, gerado como imagem pelo servidor.

**Architecture:** Coluna `devices.show_weather` e uma peça de sistema única (`announcements.source = 'editorial'`, criada pela migração). O feed acrescenta ao fim da volta um bloco de peso 1 cuja imagem é `/api/editorial/weather.png?company=…&o=…&m=<minuto>`; essa rota pública desenha (satori) o clima do Open-Meteo, com cache de 30 min, e a hora do minuto. `SYSTEM_SOURCES = ["alert", "editorial"]` centraliza o que não conta exibição nem pode ser usado/editado.

**Tech Stack:** TypeScript, Express, drizzle-orm (Postgres), zod, satori + resvg, Open-Meteo (HTTP, sem chave), vitest + supertest, React + TanStack Query + Testing Library, orval, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-07-clima-e-hora-design.md`

## Global Constraints

- Branch `feat/clima-e-hora`; PR com título `feat(api): clima e hora na volta da TV`, merge commit.
- Commits no formato `tipo(escopo): descrição em português`, terminando com a linha exata `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português explicando o porquê; acentos e símbolos (°, ·, –) como UTF-8 real, nunca `\uXXXX`.
- `devices.show_weather` default `false`; vitrine nunca mostra clima; empresa sem `lat`/`lng` não mostra clima.
- O slide de clima é um bloco de peso 1 no fim da volta (depois da playlist), duração 10s, `source = "editorial"`.
- Fonte: Open-Meteo, `timezone=America/Sao_Paulo`, `forecast_days=4`; timeout 3s; cache em memória de 30 min por coordenada arredondada a 2 casas; erro nunca lança e nunca vai para o cache.
- Falha do clima → imagem só com cidade, relógio e "Previsão indisponível" (nunca sem slide).
- Relógio: `"quarta, 7 de outubro · 15:42"` no fuso `America/Sao_Paulo`.
- Imagem: 1920×1080 (`landscape`) ou 1080×1920 (`portrait`); resposta `Cache-Control: public, s-maxage=60, max-age=60`.
- Fontes de sistema `alert` e `editorial` não contam exibição, ficam fora da biblioteca e dos contadores, e não entram em campanha, playlist nem edição. As mensagens existentes do aviso continuam iguais.
- Aviso urgente ativo continua tomando a TV inteira.
- Toda mudança de schema gera migração versionada com `pnpm --filter @workspace/db run generate` (com `DATABASE_URL` fictício) e a commita.

## Review Focus

- Open-Meteo devolvendo JSON incompleto (dia faltando, `null` no lugar de número) → `parseForecast` dá `null` e a arte sai sem previsão. Teste na Task 2.
- Open-Meteo fora do ar várias vezes seguidas → cada pedido tenta de novo (falha não fica no cache), sem derrubar a rota. Teste na Task 2.
- Virada do dia em UTC (02:30 UTC = 23:30 do dia anterior em São Paulo) → relógio mostra o dia de São Paulo. Teste na Task 2.
- Peça editorial ausente no banco (migração não rodou) → TV segue sem o slide de clima, sem erro. Teste na Task 5.
- Rota da imagem chamada com `company` inválido (texto, 0, negativo) → 404, sem consultar o Open-Meteo. Teste na Task 4.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/system-sources.ts` (novo) | `SYSTEM_SOURCES`, `isSystemSource` |
| `routes/telemetry.ts`, `routes/announcements.ts`, `routes/advertisers.ts`, `routes/devices.ts` | regras do aviso generalizadas para fontes de sistema |
| `lib/editorial/weather-codes.ts` (novo) | código WMO → texto |
| `lib/editorial/forecast.ts` (novo) | `parseForecast`, `fetchForecast`, cache |
| `lib/editorial/clock.ts` (novo) | `formatClock` |
| `lib/editorial/weather-template.ts` + `lib/editorial/render.ts` (novos) | arte do clima |
| `lib/db/src/schema/devices.ts` + `lib/db/drizzle/*` | coluna `show_weather` e a peça editorial |
| `routes/editorial.ts` (novo) + `routes/index.ts` | `GET /editorial/weather.png` |
| `lib/editorial/editorial-piece.ts` (novo) | id da peça editorial (memo) e URL da imagem |
| `lib/device-feed.ts`, `lib/panels/device-slides.ts`, `routes/display.ts`, `routes/devices.ts` (prévia), `lib/portal/queries.ts` | slide no feed |
| `lib/api-spec/openapi.yaml` + gerados | `editorial` na prévia; `showWeather`/`companyHasCoordinates` no device |
| `artifacts/signage/src/components/device-preview.tsx`, `pages/device-detail.tsx` | rótulo "Clima" e chave da TV |

Desvio consciente da spec: a página da TV não leva link para a empresa no aviso "Cadastre o CEP da empresa para ativar." — a resposta do device não traz o id da empresa, e o texto já diz o que fazer.

---

### Task 1: Fontes de sistema (`alert` + `editorial`)

**Files:**
- Create: `artifacts/api-server/src/lib/system-sources.ts`
- Modify: `artifacts/api-server/src/routes/telemetry.ts`, `routes/announcements.ts`, `routes/advertisers.ts`, `routes/devices.ts`
- Test: `artifacts/api-server/src/lib/__tests__/system-sources.test.ts` (novo)
- Test: `routes/__tests__/announcements-list-query.test.ts`, `routes/__tests__/telemetry-plays.test.ts`, `routes/__tests__/announcement-source.test.ts`, `routes/__tests__/device-playlist.test.ts`, `routes/__tests__/campaign-flyers-route.test.ts`

**Interfaces:**
- Produces: `export const SYSTEM_SOURCES = ["alert", "editorial"] as const;` e `export function isSystemSource(source: string | null | undefined): boolean` — usados pelas Tasks 5.

- [ ] **Step 1: Escrever os testes que falham**

Novo `lib/__tests__/system-sources.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SYSTEM_SOURCES, isSystemSource } from "../system-sources";

describe("isSystemSource", () => {
  it("aviso urgente e conteúdo editorial são peças de sistema", () => {
    expect(SYSTEM_SOURCES).toEqual(["alert", "editorial"]);
    expect(isSystemSource("alert")).toBe(true);
    expect(isSystemSource("editorial")).toBe(true);
  });

  it("peça do admin, de painel ou sem fonte não é", () => {
    expect(isSystemSource("admin")).toBe(false);
    expect(isSystemSource("panel")).toBe(false);
    expect(isSystemSource(null)).toBe(false);
    expect(isSystemSource(undefined)).toBe(false);
  });
});
```

Em `announcements-list-query.test.ts`, trocar as duas asserções de SQL:

```ts
describe("buildAnnouncementsListQuery", () => {
  it("deixa de fora as peças de sistema (aviso urgente e editorial)", () => {
    const { sql, params } = buildAnnouncementsListQuery().toSQL();
    expect(sql).toContain('"announcements"."source" not in ($1, $2)');
    expect(params.slice(0, 2)).toEqual(["alert", "editorial"]);
  });
});

describe("buildAnnouncementStatsQuery", () => {
  it("não conta as peças de sistema", () => {
    const { sql, params } = buildAnnouncementStatsQuery().toSQL();
    expect(sql).toContain('"announcements"."source" not in (');
    expect(params).toEqual(expect.arrayContaining(["alert", "editorial"]));
  });
});
```

Em `telemetry-plays.test.ts`, dentro do `describe("exibição de aviso urgente não conta", ...)` existente, acrescentar:

```ts
  it("lote: peça editorial também é descartada", async () => {
    inserted = [];
    selectResults = [[{ id: 1 }], [{ id: 7, source: "editorial" }, { id: 6, source: "admin" }], []];
    returningRows = [{ id: 78 }];
    const app = await buildApp();
    const res = await postTo(app, "/telemetry/plays", {
      deviceKey: "tv-1",
      plays: [
        { playId: "c", announcementId: 7, durationSeconds: 10, ageSeconds: 1 },
        { playId: "d", announcementId: 6, durationSeconds: 10, ageSeconds: 1 },
      ],
    });
    expect(res.status).toBe(200);
    expect(inserted.map((row) => row.announcementId)).toEqual([6]);
    expect(res.body.discarded).toBe(1);
  });

  it("endpoint antigo: peça editorial responde ok e não grava", async () => {
    inserted = [];
    selectResults = [[{ id: 1, deviceKey: "tv-1" }], [{ source: "editorial" }]];
    const app = await buildApp();
    const res = await postTo(app, "/telemetry/play", { deviceKey: "tv-1", announcementId: 7, durationSeconds: 10 });
    expect(res.status).toBe(201);
    expect(inserted).toEqual([]);
  });
```

(Use o mesmo formato de item e o mesmo `postTo` que os testes de aviso já usam no arquivo.)

Em `announcement-source.test.ts`, ao lado de `alertRow`, acrescentar `const editorialRow = { ...panelRow, id: 4, source: "editorial" };` e, junto dos testes de `alert`:

```ts
  it("PATCH numa peça editorial responde 409 e não escreve", async () => {
    dbSelectWhere.mockResolvedValueOnce([editorialRow]);
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/4").send({ title: "Novo título" });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça de sistema não pode ser alterada." });
    expect(dbUpdateReturning).not.toHaveBeenCalled();
  });

  it("PATCH /toggle numa peça editorial responde 409 e não escreve", async () => {
    dbSelectWhere.mockResolvedValueOnce([editorialRow]);
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/4/toggle");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça de sistema não pode ser alterada." });
    expect(dbUpdateReturning).not.toHaveBeenCalled();
  });

  it("DELETE numa peça editorial responde 409 e não apaga", async () => {
    dbSelectWhere.mockResolvedValueOnce([editorialRow]);
    const { default: request } = await import("supertest");
    const res = await request(app).delete("/announcements/4");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "Peça de sistema não pode ser apagada." });
    expect(dbDeleteReturning).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
```

Em `device-playlist.test.ts`, junto do teste "recusa arte de aviso urgente, sem inserir":

```ts
  it("recusa peça editorial, sem inserir", async () => {
    selectResults = [[{ deviceOrientation: "landscape", pieceOrientation: "landscape", pieceSource: "editorial" }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 103 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Peça de sistema não pode ser usada na playlist." });
    expect(dbInsert).not.toHaveBeenCalled();
  });
```

Em `campaign-flyers-route.test.ts`, nos dois testes "também descarta ids de arte de aviso urgente", acrescentar ao lado de `expect(query.params).toContain("alert");`:

```ts
    expect(query.params).toContain("editorial");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/system-sources.test.ts src/routes/__tests__/announcements-list-query.test.ts src/routes/__tests__/telemetry-plays.test.ts src/routes/__tests__/announcement-source.test.ts src/routes/__tests__/device-playlist.test.ts src/routes/__tests__/campaign-flyers-route.test.ts`
Expected: FAIL — `../system-sources` não existe; SQL ainda com `<> $1`; peça editorial grava/edita/entra.

- [ ] **Step 3: Implementar**

```ts
// artifacts/api-server/src/lib/system-sources.ts
/**
 * Peças que o próprio sistema gera: a arte do aviso urgente ("alert") e o
 * slide de clima e hora ("editorial"). Não são anúncio — não contam
 * exibição, não aparecem na biblioteca e não se escolhem nem se editam à mão.
 */
export const SYSTEM_SOURCES = ["alert", "editorial"] as const;

export function isSystemSource(source: string | null | undefined): boolean {
  return source != null && (SYSTEM_SOURCES as readonly string[]).includes(source);
}
```

Em cada rota, importar de `../lib/system-sources` e trocar:

1. `routes/telemetry.ts`
   - `/telemetry/play`: `if (piece?.source === "alert")` → `if (isSystemSource(piece?.source))`; ajustar o comentário para "Peça de sistema (aviso urgente, clima) não conta exibição".
   - `/telemetry/plays`: `announcements.filter((a) => a.source !== "alert")` → `announcements.filter((a) => !isSystemSource(a.source))`; comentário idem.
2. `routes/announcements.ts`
   - `buildAnnouncementsListQuery` e `buildAnnouncementStatsQuery`: `ne(announcementsTable.source, "alert")` → `notInArray(announcementsTable.source, [...SYSTEM_SOURCES])` (importar `notInArray` de `drizzle-orm`; remover `ne` do import se ficar sem uso); comentários passam a dizer "peças de sistema".
   - Em `PATCH /announcements/:id` e no toggle, logo depois do bloco `if (existing.source === "alert") { ... }`:
     ```ts
    if (existing.source === "editorial") {
      // Peça de sistema (slide de clima): a imagem é gerada a cada minuto.
      res.status(409).json({ error: "Peça de sistema não pode ser alterada." });
      return;
    }
     ```
   - Em `DELETE /announcements/:id`, logo depois do bloco de `alert`:
     ```ts
  if (existing.source === "editorial") {
    // Sem ela o slide de clima não tem onde registrar a exibição.
    res.status(409).json({ error: "Peça de sistema não pode ser apagada." });
    return;
  }
     ```
3. `routes/devices.ts` (`POST /devices/:id/playlist/add`), logo depois do bloco `if (pair.pieceSource === "alert") { ... }`:
   ```ts
  if (pair.pieceSource === "editorial") {
    res.status(400).json({ error: "Peça de sistema não pode ser usada na playlist." });
    return;
  }
   ```
4. `routes/advertisers.ts` (`dropPanelAnnouncementIds`): `inArray(announcementsTable.source, ["panel", "alert"])` → `inArray(announcementsTable.source, ["panel", ...SYSTEM_SOURCES])`; ajustar o comentário da função para citar painel e peças de sistema.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS (novos e antigos, inclusive os de `alert` com as mensagens de sempre).

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/system-sources.ts artifacts/api-server/src/lib/__tests__/system-sources.test.ts artifacts/api-server/src/routes
git commit -F - <<'EOF'
refactor(api): regras de peça de sistema valem para aviso e editorial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Clima e relógio (puros + busca no Open-Meteo)

**Files:**
- Create: `artifacts/api-server/src/lib/editorial/weather-codes.ts`
- Create: `artifacts/api-server/src/lib/editorial/forecast.ts`
- Create: `artifacts/api-server/src/lib/editorial/clock.ts`
- Test: `artifacts/api-server/src/lib/editorial/__tests__/weather-codes.test.ts`
- Test: `artifacts/api-server/src/lib/editorial/__tests__/forecast.test.ts`
- Test: `artifacts/api-server/src/lib/editorial/__tests__/clock.test.ts`

**Interfaces:**
- Produces (usado pelas Tasks 3 e 4):
  - `export function weatherLabel(code: number): string`
  - `export type ForecastDay = { date: string; max: number; min: number; code: number }`
  - `export type Forecast = { current: { temperature: number; code: number }; today: { max: number; min: number; code: number }; nextDays: ForecastDay[] }`
  - `export function parseForecast(json: unknown): Forecast | null`
  - `export function forecastUrl(lat: number, lng: number): string`
  - `export async function fetchForecast(lat: number, lng: number, now?: Date): Promise<Forecast | null>`
  - `export function clearForecastCache(): void`
  - `export function formatClock(now: Date): string`

- [ ] **Step 1: Escrever os testes que falham**

```ts
// artifacts/api-server/src/lib/editorial/__tests__/weather-codes.test.ts
import { describe, expect, it } from "vitest";
import { weatherLabel } from "../weather-codes";

describe("weatherLabel", () => {
  it.each([
    [0, "Céu limpo"],
    [1, "Predomínio de sol"],
    [2, "Parcialmente nublado"],
    [3, "Nublado"],
    [45, "Neblina"],
    [53, "Garoa"],
    [61, "Chuva fraca"],
    [63, "Chuva"],
    [65, "Chuva forte"],
    [80, "Pancadas de chuva"],
    [82, "Temporal"],
    [95, "Trovoadas"],
  ])("código %i → %s", (code, label) => {
    expect(weatherLabel(code)).toBe(label);
  });

  it("código desconhecido vira tempo instável", () => {
    expect(weatherLabel(42)).toBe("Tempo instável");
  });
});
```

```ts
// artifacts/api-server/src/lib/editorial/__tests__/forecast.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearForecastCache, fetchForecast, forecastUrl, parseForecast } from "../forecast";

const RESPOSTA = {
  current: { temperature_2m: 27.6, weather_code: 2 },
  daily: {
    time: ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"],
    weather_code: [2, 61, 3, 0],
    temperature_2m_max: [31.2, 26.4, 24.9, 29.1],
    temperature_2m_min: [18.4, 17.0, 16.2, 15.8],
  },
};

describe("parseForecast", () => {
  it("lê agora, hoje e os 3 dias seguintes", () => {
    expect(parseForecast(RESPOSTA)).toEqual({
      current: { temperature: 27.6, code: 2 },
      today: { max: 31.2, min: 18.4, code: 2 },
      nextDays: [
        { date: "2026-10-08", max: 26.4, min: 17.0, code: 61 },
        { date: "2026-10-09", max: 24.9, min: 16.2, code: 3 },
        { date: "2026-10-10", max: 29.1, min: 15.8, code: 0 },
      ],
    });
  });

  it.each([
    ["sem current", { daily: RESPOSTA.daily }],
    ["temperatura nula", { ...RESPOSTA, current: { temperature_2m: null, weather_code: 2 } }],
    ["só 3 dias", { ...RESPOSTA, daily: { ...RESPOSTA.daily, time: RESPOSTA.daily.time.slice(0, 3) } }],
    ["máxima nula num dia", { ...RESPOSTA, daily: { ...RESPOSTA.daily, temperature_2m_max: [31.2, null, 24.9, 29.1] } }],
    ["não é objeto", "erro"],
  ])("resposta incompleta (%s) → null", (_caso, json) => {
    expect(parseForecast(json)).toBeNull();
  });
});

describe("fetchForecast", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    clearForecastCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = () => Promise.resolve(new Response(JSON.stringify(RESPOSTA), { status: 200 }));
  const agora = new Date("2026-10-07T18:00:00Z");

  it("pede ao Open-Meteo com as coordenadas, o fuso e 4 dias", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.1794, -45.8869, agora);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("latitude")).toBe("-23.1794");
    expect(url.searchParams.get("longitude")).toBe("-45.8869");
    expect(url.searchParams.get("current")).toBe("temperature_2m,weather_code");
    expect(url.searchParams.get("daily")).toBe("weather_code,temperature_2m_max,temperature_2m_min");
    expect(url.searchParams.get("timezone")).toBe("America/Sao_Paulo");
    expect(url.searchParams.get("forecast_days")).toBe("4");
    expect(forecastUrl(-23.1794, -45.8869)).toBe(String(fetchMock.mock.calls[0][0]));
  });

  it("usa o cache por 30 min e busca de novo depois", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.18, -45.89, agora);
    await fetchForecast(-23.18, -45.89, new Date(agora.getTime() + 29 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchForecast(-23.18, -45.89, new Date(agora.getTime() + 31 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coordenadas que arredondam igual dividem o cache", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.1794, -45.8869, agora);
    await fetchForecast(-23.1801, -45.8899, agora);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["erro de rede", () => Promise.reject(new Error("ECONNRESET"))],
    ["status 500", () => Promise.resolve(new Response("x", { status: 500 }))],
    ["corpo incompleto", () => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))],
  ])("%s → null, sem lançar e sem guardar no cache", async (_caso, falha) => {
    fetchMock.mockImplementationOnce(falha).mockImplementation(ok);
    expect(await fetchForecast(-23.18, -45.89, agora)).toBeNull();
    expect(await fetchForecast(-23.18, -45.89, agora)).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passa um sinal de timeout para o fetch", async () => {
    fetchMock.mockImplementation(ok);
    await fetchForecast(-23.18, -45.89, agora);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
```

```ts
// artifacts/api-server/src/lib/editorial/__tests__/clock.test.ts
import { describe, expect, it } from "vitest";
import { formatClock } from "../clock";

describe("formatClock", () => {
  it("dia da semana, data e hora em São Paulo", () => {
    expect(formatClock(new Date("2026-10-07T18:42:00Z"))).toBe("quarta, 7 de outubro · 15:42");
  });

  it("02:30 UTC ainda é o dia anterior em São Paulo", () => {
    expect(formatClock(new Date("2026-10-08T02:30:00Z"))).toBe("quarta, 7 de outubro · 23:30");
  });

  it("sábado e domingo não têm -feira para tirar", () => {
    expect(formatClock(new Date("2026-10-10T13:05:00Z"))).toBe("sábado, 10 de outubro · 10:05");
    expect(formatClock(new Date("2026-10-11T03:00:00Z"))).toBe("domingo, 11 de outubro · 00:00");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/editorial/__tests__`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar**

```ts
// artifacts/api-server/src/lib/editorial/weather-codes.ts
/**
 * Códigos de tempo do Open-Meteo (padrão WMO) em português de quem olha a TV.
 * Agrupados: a tela não tem espaço (nem quem passa tem paciência) para
 * diferenciar 51, 53 e 55.
 */
const LABELS: Record<number, string> = {
  0: "Céu limpo",
  1: "Predomínio de sol",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Neblina",
  48: "Neblina",
  51: "Garoa",
  53: "Garoa",
  55: "Garoa",
  56: "Garoa congelante",
  57: "Garoa congelante",
  61: "Chuva fraca",
  63: "Chuva",
  65: "Chuva forte",
  66: "Chuva congelante",
  67: "Chuva congelante",
  71: "Neve",
  73: "Neve",
  75: "Neve",
  77: "Neve",
  80: "Pancadas de chuva",
  81: "Pancadas fortes",
  82: "Temporal",
  85: "Neve",
  86: "Neve",
  95: "Trovoadas",
  96: "Trovoadas",
  99: "Trovoadas",
};

export function weatherLabel(code: number): string {
  return LABELS[code] ?? "Tempo instável";
}
```

```ts
// artifacts/api-server/src/lib/editorial/forecast.ts
export type ForecastDay = { date: string; max: number; min: number; code: number };
export type Forecast = {
  current: { temperature: number; code: number };
  today: { max: number; min: number; code: number };
  nextDays: ForecastDay[];
};

/** Quanto tempo a previsão de uma coordenada vale: tempo muda devagar, e cada TV pede a imagem a cada volta. */
const CACHE_TTL_MS = 30 * 60_000;
/** O Open-Meteo responde em ~100 ms; acima disso a arte sai sem previsão em vez de segurar a TV. */
const TIMEOUT_MS = 3000;

const cache = new Map<string, { at: number; forecast: Forecast }>();

/** Só para testes. */
export function clearForecastCache(): void {
  cache.clear();
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Resposta do Open-Meteo → previsão da arte. Qualquer campo faltando ou nulo
 * vira null: meia previsão na tela (um dia em branco, "NaN°") é pior que
 * nenhuma.
 */
export function parseForecast(json: unknown): Forecast | null {
  if (!json || typeof json !== "object") return null;
  const data = json as {
    current?: { temperature_2m?: unknown; weather_code?: unknown };
    daily?: { time?: unknown; weather_code?: unknown; temperature_2m_max?: unknown; temperature_2m_min?: unknown };
  };
  const current = data.current;
  const daily = data.daily;
  if (!current || !daily || !isNumber(current.temperature_2m) || !isNumber(current.weather_code)) return null;
  const { time, weather_code: codes, temperature_2m_max: maxs, temperature_2m_min: mins } = daily;
  if (!Array.isArray(time) || !Array.isArray(codes) || !Array.isArray(maxs) || !Array.isArray(mins)) return null;
  if (time.length < 4) return null;

  const days: ForecastDay[] = [];
  for (let i = 0; i < 4; i++) {
    const date = time[i];
    const code = codes[i];
    const max = maxs[i];
    const min = mins[i];
    if (typeof date !== "string" || !isNumber(code) || !isNumber(max) || !isNumber(min)) return null;
    days.push({ date, code, max, min });
  }
  const [today, ...nextDays] = days;
  return {
    current: { temperature: current.temperature_2m, code: current.weather_code },
    today: { max: today.max, min: today.min, code: today.code },
    nextDays,
  };
}

export function forecastUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "America/Sao_Paulo",
    forecast_days: "4",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

/**
 * Previsão da coordenada, com cache de 30 min por coordenada arredondada a 2
 * casas (~1 km: lojas da mesma cidade dividem a mesma busca). Nunca lança:
 * erro, timeout ou resposta ruim devolvem null, e null não entra no cache —
 * o próximo pedido tenta de novo.
 */
export async function fetchForecast(lat: number, lng: number, now: Date = new Date()): Promise<Forecast | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.forecast;
  try {
    const res = await fetch(forecastUrl(lat, lng), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const forecast = parseForecast(await res.json());
    if (forecast) cache.set(key, { at: now.getTime(), forecast });
    return forecast;
  } catch {
    return null;
  }
}
```

```ts
// artifacts/api-server/src/lib/editorial/clock.ts
const TIME_ZONE = "America/Sao_Paulo";

/**
 * "quarta, 7 de outubro · 15:42" no fuso de quem olha a TV. Sai de `Intl`,
 * nunca de getHours(): o servidor roda em UTC. O "-feira" sai para caber na
 * linha sem perder nada que alguém precise ler.
 */
export function formatClock(now: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday").replace("-feira", "");
  return `${weekday}, ${get("day")} de ${get("month")} · ${get("hour")}:${get("minute")}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/editorial/__tests__`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/editorial
git commit -F - <<'EOF'
feat(api): previsão do Open-Meteo e relógio de São Paulo para o slide de clima

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Arte do clima

**Files:**
- Create: `artifacts/api-server/src/lib/editorial/weather-template.ts`
- Create: `artifacts/api-server/src/lib/editorial/render.ts`
- Test: `artifacts/api-server/src/lib/editorial/__tests__/weather-template.test.ts`
- Test: `artifacts/api-server/src/lib/editorial/__tests__/weather-render.test.ts`

**Interfaces:**
- Consumes: `Forecast` e `weatherLabel` (Task 2); `rasterize(tree, width, height)` de `lib/panels/render.ts`; `alertSize` de `lib/alerts/alert-template.ts` (mesmos tamanhos).
- Produces (usado pela Task 4):
  - `export type WeatherArt = { city: string; clock: string; forecast: Forecast | null }`
  - `export type WeatherOrientation = "landscape" | "portrait"`
  - `export function weekdayShort(date: string): string`
  - `export function weatherNode(art: WeatherArt, orientation: WeatherOrientation): unknown`
  - `export function renderWeather(art: WeatherArt, orientation: WeatherOrientation): Promise<Buffer>` (em `render.ts`)

- [ ] **Step 1: Escrever os testes que falham**

```ts
// artifacts/api-server/src/lib/editorial/__tests__/weather-template.test.ts
import { describe, expect, it } from "vitest";
import { weatherNode, weekdayShort } from "../weather-template";
import type { Forecast } from "../forecast";

function texts(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (!tree || typeof tree !== "object") return [];
  const children = (tree as { props?: { children?: unknown } }).props?.children;
  return Array.isArray(children) ? children.flatMap(texts) : texts(children);
}

const PREVISAO: Forecast = {
  current: { temperature: 27.6, code: 2 },
  today: { max: 31.2, min: 18.4, code: 2 },
  nextDays: [
    { date: "2026-10-08", max: 26.4, min: 17.0, code: 61 },
    { date: "2026-10-09", max: 24.9, min: 16.2, code: 3 },
    { date: "2026-10-10", max: 29.1, min: 15.8, code: 0 },
  ],
};

describe("weekdayShort", () => {
  it("dia curto, com inicial maiúscula e sem ponto", () => {
    expect(weekdayShort("2026-10-08")).toBe("Qui");
    expect(weekdayShort("2026-10-10")).toBe("Sáb");
  });
});

describe("weatherNode", () => {
  it.each(["landscape", "portrait"] as const)("mostra cidade, agora, hoje, 3 dias e relógio (%s)", (orientation) => {
    const out = texts(weatherNode({ city: "São José dos Campos", clock: "quarta, 7 de outubro · 15:42", forecast: PREVISAO }, orientation));
    expect(out).toEqual([
      "São José dos Campos",
      "28°",
      "Parcialmente nublado",
      "máx 31° · mín 18°",
      "Qui",
      "26° / 17°",
      "Sex",
      "25° / 16°",
      "Sáb",
      "29° / 16°",
      "quarta, 7 de outubro · 15:42",
    ]);
  });

  it("sem previsão, só cidade, aviso e relógio", () => {
    const out = texts(weatherNode({ city: "Taubaté", clock: "quarta, 7 de outubro · 15:42", forecast: null }, "landscape"));
    expect(out).toEqual(["Taubaté", "Previsão indisponível", "quarta, 7 de outubro · 15:42"]);
  });
});
```

```ts
// artifacts/api-server/src/lib/editorial/__tests__/weather-render.test.ts
import { describe, expect, it } from "vitest";
import { renderWeather } from "../render";

function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const arte = {
  city: "São José dos Campos",
  clock: "quarta, 7 de outubro · 15:42",
  forecast: {
    current: { temperature: 27.6, code: 2 },
    today: { max: 31.2, min: 18.4, code: 2 },
    nextDays: [
      { date: "2026-10-08", max: 26.4, min: 17.0, code: 61 },
      { date: "2026-10-09", max: 24.9, min: 16.2, code: 3 },
      { date: "2026-10-10", max: 29.1, min: 15.8, code: 0 },
    ],
  },
};

describe("renderWeather", () => {
  it("deitado vira PNG 1920×1080", async () => {
    expect(pngSize(await renderWeather(arte, "landscape"))).toEqual({ width: 1920, height: 1080 });
  });

  it("em pé vira PNG 1080×1920, mesmo sem previsão", async () => {
    expect(pngSize(await renderWeather({ ...arte, forecast: null }, "portrait"))).toEqual({ width: 1080, height: 1920 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/editorial/__tests__/weather-template.test.ts src/lib/editorial/__tests__/weather-render.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar**

```ts
// artifacts/api-server/src/lib/editorial/weather-template.ts
import { weatherLabel } from "./weather-codes";
import type { Forecast } from "./forecast";

export type WeatherArt = { city: string; clock: string; forecast: Forecast | null };
export type WeatherOrientation = "landscape" | "portrait";

// Azul de céu: tem de ler como "informação", não como anúncio nem como aviso.
const COLORS = { background: "#0C4A6E", text: "#FFFFFF", muted: "#BAE6FD" };

const node = (type: string, props: Record<string, unknown>) => ({ type, props });
const degrees = (value: number) => `${Math.round(value)}°`;

/** "2026-10-08" → "Qui". Meio-dia em São Paulo: nenhum fuso empurra para outro dia. */
export function weekdayShort(date: string): string {
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(`${date}T12:00:00-03:00`))
    .replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const text = (content: string, style: Record<string, unknown>) =>
  node("div", { style: { wordBreak: "break-word", ...style }, children: content });

export function weatherNode(art: WeatherArt, orientation: WeatherOrientation): unknown {
  const portrait = orientation === "portrait";
  const forecast = art.forecast;

  const body = forecast
    ? [
        node("div", {
          style: { display: "flex", flexDirection: portrait ? "column" : "row", alignItems: portrait ? "flex-start" : "center", gap: 48 },
          children: [
            text(degrees(forecast.current.temperature), { fontSize: portrait ? 240 : 220, fontWeight: 700, lineHeight: 1 }),
            node("div", {
              style: { display: "flex", flexDirection: "column", gap: 16 },
              children: [
                text(weatherLabel(forecast.current.code), { fontSize: 64, fontWeight: 700 }),
                text(`máx ${degrees(forecast.today.max)} · mín ${degrees(forecast.today.min)}`, { fontSize: 48, color: COLORS.muted }),
              ],
            }),
          ],
        }),
        node("div", {
          style: { display: "flex", flexDirection: "row", gap: portrait ? 56 : 96 },
          children: forecast.nextDays.map((day) =>
            node("div", {
              style: { display: "flex", flexDirection: "column", gap: 8 },
              children: [
                text(weekdayShort(day.date), { fontSize: 44, fontWeight: 700 }),
                text(`${degrees(day.max)} / ${degrees(day.min)}`, { fontSize: 44, color: COLORS.muted }),
              ],
            }),
          ),
        }),
      ]
    : [text("Previsão indisponível", { fontSize: 72, fontWeight: 700 })];

  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: portrait ? "120px 80px" : "80px 120px",
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
    },
    children: [
      text(art.city, { fontSize: 56, fontWeight: 700, color: COLORS.muted }),
      ...body,
      text(art.clock, { fontSize: 48 }),
    ],
  });
}
```

```ts
// artifacts/api-server/src/lib/editorial/render.ts
import { rasterize } from "../panels/render";
import { alertSize } from "../alerts/alert-template";
import { weatherNode, type WeatherArt, type WeatherOrientation } from "./weather-template";

/** PNG do slide de clima, nos mesmos tamanhos das outras artes geradas. */
export async function renderWeather(art: WeatherArt, orientation: WeatherOrientation): Promise<Buffer> {
  const { width, height } = alertSize(orientation);
  return rasterize(weatherNode(art, orientation), width, height);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/editorial/__tests__/weather-template.test.ts src/lib/editorial/__tests__/weather-render.test.ts`
Expected: PASS. (Se `weekdayShort` do ICU do Node devolver outro formato para "sáb.", ajustar só a limpeza do texto e dizer no relatório.)

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/editorial
git commit -F - <<'EOF'
feat(api): arte do slide de clima e hora

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Coluna, peça editorial e rota da imagem

**Files:**
- Modify: `lib/db/src/schema/devices.ts`
- Create: `lib/db/drizzle/<gerado>.sql` (+ meta), com o `INSERT` acrescentado à mão
- Create: `artifacts/api-server/src/routes/editorial.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/routes/__tests__/editorial-route.test.ts`

**Interfaces:**
- Consumes: `fetchForecast` (Task 2), `formatClock` (Task 2), `renderWeather` (Task 3).
- Produces: `devicesTable.showWeather`; `GET /editorial/weather.png?company=&o=&m=`; peça `announcements` com `source = 'editorial'` (usada pela Task 5).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// artifacts/api-server/src/routes/__tests__/editorial-route.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

let companyRows: unknown[] = [];
const fetchForecastMock = vi.hoisted(() => vi.fn());
const renderWeatherMock = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => companyRows }) }) },
  companiesTable: { id: "id", name: "name", city: "city", lat: "lat", lng: "lng" },
}));
vi.mock("../../lib/editorial/forecast", () => ({ fetchForecast: (...a: unknown[]) => fetchForecastMock(...a) }));
vi.mock("../../lib/editorial/render", () => ({ renderWeather: (...a: unknown[]) => renderWeatherMock(...a) }));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../editorial");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

const LOJA = { name: "Padaria Pão Bom", city: "São José dos Campos", lat: -23.18, lng: -45.89 };
const PREVISAO = { current: { temperature: 27, code: 2 }, today: { max: 31, min: 18, code: 2 }, nextDays: [] };

beforeEach(() => {
  companyRows = [LOJA];
  fetchForecastMock.mockReset();
  fetchForecastMock.mockResolvedValue(PREVISAO);
  renderWeatherMock.mockReset();
  renderWeatherMock.mockResolvedValue(Buffer.from("png"));
});

describe("GET /editorial/weather.png", () => {
  it("desenha o clima da cidade da loja e manda cache de 1 min", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/editorial/weather.png?company=12&o=landscape&m=29331234");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.headers["cache-control"]).toBe("public, s-maxage=60, max-age=60");
    expect(fetchForecastMock).toHaveBeenCalledWith(-23.18, -45.89);
    const [art, orientation] = renderWeatherMock.mock.calls[0];
    expect(orientation).toBe("landscape");
    expect(art.city).toBe("São José dos Campos");
    expect(art.forecast).toEqual(PREVISAO);
    expect(art.clock).toMatch(/ · \d{2}:\d{2}$/);
  });

  it("em pé quando o=portrait; sem o, deitado", async () => {
    const { default: request } = await import("supertest");
    const app = await buildApp();
    await request(app).get("/editorial/weather.png?company=12&o=portrait");
    await request(app).get("/editorial/weather.png?company=12");
    expect(renderWeatherMock.mock.calls.map((c) => c[1])).toEqual(["portrait", "landscape"]);
  });

  it("empresa sem cidade usa o nome", async () => {
    companyRows = [{ ...LOJA, city: null }];
    const { default: request } = await import("supertest");
    await request(await buildApp()).get("/editorial/weather.png?company=12");
    expect(renderWeatherMock.mock.calls[0][0].city).toBe("Padaria Pão Bom");
  });

  it("Open-Meteo fora do ar ainda dá 200, com a arte sem previsão", async () => {
    fetchForecastMock.mockResolvedValue(null);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/editorial/weather.png?company=12");
    expect(res.status).toBe(200);
    expect(renderWeatherMock.mock.calls[0][0].forecast).toBeNull();
  });

  it.each([
    ["empresa inexistente", [], "12"],
    ["empresa sem coordenadas", [{ ...LOJA, lat: null }], "12"],
    ["company inválido", [LOJA], "abc"],
    ["company zero", [LOJA], "0"],
  ])("404: %s, sem buscar o clima", async (_caso, rows, company) => {
    companyRows = rows;
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get(`/editorial/weather.png?company=${company}`);
    expect(res.status).toBe(404);
    expect(fetchForecastMock).not.toHaveBeenCalled();
  });

  it("falha ao desenhar → 500", async () => {
    renderWeatherMock.mockRejectedValue(new Error("satori"));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/editorial/weather.png?company=12");
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/editorial-route.test.ts`
Expected: FAIL — `../editorial` não existe.

- [ ] **Step 3: Coluna e migração**

Em `lib/db/src/schema/devices.ts`, depois da coluna `musicUrl`:

```ts
    // Slide de clima e hora na volta desta TV. Desligado por padrão: nada
    // muda numa loja até o admin ligar.
    showWeather: boolean("show_weather").notNull().default(false),
```

(`boolean` já é importado no arquivo; se não for, acrescentar ao import de `drizzle-orm/pg-core`.)

Gerar:

```bash
cd lib/db && npx tsc --build && cd ../..
DATABASE_URL=postgres://u:p@localhost:5432/x pnpm --filter @workspace/db run generate
ls -t lib/db/drizzle/*.sql | head -1
```

Expected: o arquivo novo contém só `ALTER TABLE "devices" ADD COLUMN "show_weather" boolean DEFAULT false NOT NULL;`. Qualquer outra alteração → parar e reportar BLOCKED com o SQL.

Acrescentar ao **fim desse mesmo arquivo SQL**:

```sql
--> statement-breakpoint
-- Peça de sistema do slide de clima e hora: existe só para a TV ter um
-- announcement_id ao registrar a exibição (que o servidor descarta).
INSERT INTO "announcements" ("title", "media_kind", "orientation", "source", "duration", "is_active")
SELECT 'Clima e hora', 'image', 'landscape', 'editorial', 10, true
WHERE NOT EXISTS (SELECT 1 FROM "announcements" WHERE "source" = 'editorial');
```

- [ ] **Step 4: Rota**

```ts
// artifacts/api-server/src/routes/editorial.ts
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, companiesTable } from "@workspace/db";
import { formatClock } from "../lib/editorial/clock";
import { fetchForecast } from "../lib/editorial/forecast";
import { renderWeather } from "../lib/editorial/render";

const router: IRouter = Router();

/**
 * Slide de clima e hora da loja. Pública como o feed: a TV pede a imagem sem
 * sessão. O `m` (minuto) da URL não é lido aqui — só muda o endereço a cada
 * minuto para a CDN e o navegador da TV pegarem a hora nova.
 */
router.get("/editorial/weather.png", async (req, res): Promise<void> => {
  const companyId = Number(req.query.company);
  const orientation = req.query.o === "portrait" ? "portrait" : "landscape";
  if (!Number.isInteger(companyId) || companyId <= 0) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  const [company] = await db
    .select({ name: companiesTable.name, city: companiesTable.city, lat: companiesTable.lat, lng: companiesTable.lng })
    .from(companiesTable)
    .where(eq(companiesTable.id, companyId));
  if (!company || company.lat == null || company.lng == null) {
    res.status(404).json({ error: "Empresa sem localização." });
    return;
  }

  // Sem previsão a arte sai só com o relógio: a TV nunca perde o slide.
  const forecast = await fetchForecast(company.lat, company.lng);
  try {
    const png = await renderWeather(
      { city: company.city ?? company.name, clock: formatClock(new Date()), forecast },
      orientation,
    );
    res.set("Cache-Control", "public, s-maxage=60, max-age=60");
    res.type("png").send(png);
  } catch (err) {
    req.log.error({ err }, "Falha ao desenhar o slide de clima");
    res.status(500).json({ error: "Não foi possível gerar o clima." });
  }
});

export default router;
```

Em `routes/index.ts`: `import editorialRouter from "./editorial";` e, no bloco "Públicos", logo depois de `router.use(displayRouter);`: `router.use(editorialRouter);`

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/editorial-route.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm run typecheck`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/devices.ts lib/db/drizzle artifacts/api-server/src/routes/editorial.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/__tests__/editorial-route.test.ts
git commit -F - <<'EOF'
feat(api): imagem de clima e hora por loja e chave por TV

Coluna devices.show_weather com migração, que também cria a peça de
sistema do slide.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Slide de clima na volta

**Files:**
- Create: `artifacts/api-server/src/lib/editorial/editorial-piece.ts`
- Modify: `artifacts/api-server/src/lib/panels/device-slides.ts` (`composeDeviceLoop`)
- Modify: `artifacts/api-server/src/lib/device-feed.ts`
- Modify: `artifacts/api-server/src/routes/display.ts`, `routes/devices.ts` (prévia), `lib/portal/queries.ts` (`previewDevice`)
- Modify: `lib/api-spec/openapi.yaml` (+ gerados) e `artifacts/signage/src/components/device-preview.tsx`
- Test: `artifacts/api-server/src/lib/editorial/__tests__/editorial-piece.test.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/device-slides.test.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `devicesTable.showWeather` e a peça editorial (Task 4).
- Produces:
  - `export async function editorialPieceId(): Promise<number | null>`, `export function resetEditorialPieceCache(): void`, `export function weatherImageUrl(companyId: number, screen: "landscape" | "portrait", now: Date): string`
  - `composeDeviceLoop(campaigns, panels, playlist, extras?)` — `extras` vira blocos de peso 1 no fim, sem dedupe.
  - `FeedDevice` ganha `showWeather?: boolean` e `companyHasCoordinates?: boolean`; `DeviceSlideSource` ganha `"editorial"`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// artifacts/api-server/src/lib/editorial/__tests__/editorial-piece.test.ts
import { describe, expect, it } from "vitest";

const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
const { weatherImageUrl } = await import("../editorial-piece");
if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
else process.env.DATABASE_URL = previousDatabaseUrl;

describe("weatherImageUrl", () => {
  it("aponta para a rota da imagem com empresa, orientação e minuto", () => {
    const now = new Date("2026-10-07T18:42:30Z");
    expect(weatherImageUrl(12, "portrait", now)).toBe(
      `/api/editorial/weather.png?company=12&o=portrait&m=${Math.floor(now.getTime() / 60_000)}`,
    );
  });

  it("muda a cada minuto e não dentro do mesmo minuto", () => {
    const a = weatherImageUrl(12, "landscape", new Date("2026-10-07T18:42:01Z"));
    const b = weatherImageUrl(12, "landscape", new Date("2026-10-07T18:42:59Z"));
    const c = weatherImageUrl(12, "landscape", new Date("2026-10-07T18:43:00Z"));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
});
```

Em `device-slides.test.ts`, no `describe("composeDeviceLoop", ...)`:

```ts
  it("extras entram no fim, peso 1, sem afetar a ordem de antes", () => {
    const out = composeDeviceLoop([campanha(1, 9, 1)], [], [slide(3, "l")], [slide(950, "clima")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 3, 950]);
  });

  it("sem extras o resultado é o de antes", () => {
    const out = composeDeviceLoop([campanha(1, 9, 1)], [], [slide(3, "l")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 3]);
  });
```

(`campanha` e `slide` já existem no arquivo.)

Em `display-slides.test.ts`:

1. No mock de `@workspace/db`, acrescentar `showWeather: "showWeather"` ao `devicesTable` e `lat: "lat", lng: "lng"` ao `companiesTable`, e `source: "source"` ao `announcementsTable` (mantendo as chaves existentes).
2. Importar no topo, depois dos mocks: `const { resetEditorialPieceCache } = await import("../../lib/editorial/editorial-piece");` (ou importar estaticamente, se o arquivo já importa módulos do api-server assim).
3. No fim do arquivo:

```ts
describe("GET /display/:deviceKey/feed — clima e hora", () => {
  const AGORA = new Date("2026-10-07T18:42:00Z");
  const TV_COM_CLIMA = { ...DEVICE_ROW, showcase: false, showWeather: true, companyHasCoordinates: true };

  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    panelSlidesForClientMock.mockResolvedValue([]);
    selectResults = [];
    selectCallIndex = 0;
    resetEditorialPieceCache();
    vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  async function ids(device: Record<string, unknown>, extra: unknown[] = [[], [{ id: 950 }]]) {
    selectResults = [[device], [PLAYLIST_ROW], [CAMPAIGN_ROW], ...extra];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");
    return res.body.slides as Array<{ announcementId: number; imageUrl: string; duration: number }>;
  }

  it("TV com clima ganha o slide no fim, com a imagem da loja e do minuto", async () => {
    const slides = await ids(TV_COM_CLIMA);
    expect(slides.map((s) => s.announcementId)).toEqual([CAMPAIGN_ROW.announcementId, PLAYLIST_ROW.announcementId, 950]);
    expect(slides[2].imageUrl).toBe(
      `/api/editorial/weather.png?company=${DEVICE_ROW.companyId}&o=landscape&m=${Math.floor(AGORA.getTime() / 60_000)}`,
    );
    expect(slides[2].duration).toBe(10);
  });

  it.each([
    ["chave desligada", { ...TV_COM_CLIMA, showWeather: false }],
    ["empresa sem coordenadas", { ...TV_COM_CLIMA, companyHasCoordinates: false }],
    ["vitrine", { ...TV_COM_CLIMA, showcase: true }],
  ])("%s → sem slide de clima", async (_caso, device) => {
    const slides = await ids(device);
    expect(slides.map((s) => s.announcementId)).not.toContain(950);
  });

  it("peça editorial ausente no banco → sem slide de clima, sem erro", async () => {
    const slides = await ids(TV_COM_CLIMA, [[], []]);
    expect(slides.map((s) => s.announcementId)).toEqual([CAMPAIGN_ROW.announcementId, PLAYLIST_ROW.announcementId]);
  });

  it("aviso urgente ativo ainda toma a TV inteira", async () => {
    const aviso = {
      id: 1, title: "Aviso", body: null, targetMode: "all", segmentIds: [], companyIds: [],
      startsAt: new Date("2026-10-07T18:00:00Z"), endsAt: new Date("2026-10-07T19:00:00Z"), endedAt: null,
      landscapeAnnouncementId: 901, portraitAnnouncementId: 902, createdAt: new Date("2026-10-07T18:00:00Z"),
    };
    const peca = { announcementId: 901, title: "Aviso", imageUrl: "/api/uploads/aviso.png", duration: 15 };
    const slides = await ids(TV_COM_CLIMA, [[aviso], [peca]]);
    expect(slides.map((s) => s.announcementId)).toEqual([901]);
  });
});
```

(Se `afterEach` não estiver importado, acrescentar ao import de `vitest`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/editorial/__tests__/editorial-piece.test.ts src/lib/panels/__tests__/device-slides.test.ts src/routes/__tests__/display-slides.test.ts`
Expected: FAIL — `editorial-piece` não existe; `composeDeviceLoop` ignora o 4º argumento; o feed não tem slide de clima.

- [ ] **Step 3: Peça editorial e URL**

```ts
// artifacts/api-server/src/lib/editorial/editorial-piece.ts
import { eq } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";

let cachedId: number | null = null;

/** Só para testes. */
export function resetEditorialPieceCache(): void {
  cachedId = null;
}

/**
 * Id da peça de sistema do slide de clima (criada pela migração). Guardado
 * depois de achado: a peça nunca muda. Ausente devolve null e tenta de novo
 * na próxima busca — a TV fica sem o slide, nunca sem a volta.
 */
export async function editorialPieceId(): Promise<number | null> {
  if (cachedId !== null) return cachedId;
  const rows =
    (await db
      .select({ id: announcementsTable.id })
      .from(announcementsTable)
      .where(eq(announcementsTable.source, "editorial"))) ?? [];
  cachedId = rows[0]?.id ?? null;
  return cachedId;
}

/** O minuto na URL faz a TV (e a CDN) pegarem a imagem nova a cada minuto. */
export function weatherImageUrl(companyId: number, screen: "landscape" | "portrait", now: Date): string {
  return `/api/editorial/weather.png?company=${companyId}&o=${screen}&m=${Math.floor(now.getTime() / 60_000)}`;
}
```

- [ ] **Step 4: `composeDeviceLoop` com extras**

Em `lib/panels/device-slides.ts`, mudar a assinatura e o fim da função:

```ts
export function composeDeviceLoop<T extends LoopSlide>(campaigns: T[], panels: T[], playlist: T[], extras: T[] = []): T[] {
```

e no `buildLoop([...])`, depois da linha da playlist:

```ts
    // Conteúdo de sistema (slide de clima): um bloco de peso 1 cada, no fim.
    ...extras.map((slide) => ({ weight: 1, slides: [slide] })),
```

Acrescentar ao comentário da função: "`extras` (slide de clima) entra no fim, peso 1, sem passar pela dedupe."

- [ ] **Step 5: Feed e carregamento do device**

Em `lib/device-feed.ts`:

1. `export type DeviceSlideSource = "campaign" | "panel" | "playlist" | "alert" | "editorial";`
2. Em `FeedDevice`, acrescentar:
   ```ts
  /** Slide de clima e hora ligado nesta TV. Ausente vale false. */
  showWeather?: boolean;
  /** A empresa dona da TV tem lat/lng (sem isso não há clima para mostrar). */
  companyHasCoordinates?: boolean;
   ```
3. Imports: `import { editorialPieceId, weatherImageUrl } from "./editorial/editorial-piece";`
4. Logo depois do bloco do aviso urgente (o `if (!device.showcase) { try { … findActiveAlertPiece … } catch … }`) e antes do `composeDeviceLoop`, inserir:

```ts
  // Clima e hora: slide de sistema no fim da volta, peso 1. Só com a chave
  // ligada, empresa com coordenadas e fora da vitrine. Falha aqui nunca
  // derruba a programação — loga e segue sem o slide.
  const extras: Array<(typeof playlistSlides)[number] & { source: DeviceSlideSource }> = [];
  if (device.showWeather && device.companyHasCoordinates && !device.showcase) {
    try {
      const pieceId = await editorialPieceId();
      if (pieceId === null) {
        log.warn("Editorial piece missing; weather slide skipped");
      } else {
        extras.push({
          announcementId: pieceId,
          campaignId: null,
          title: "Clima e hora",
          displayText: null,
          showText: false,
          imageUrl: weatherImageUrl(device.companyId, screen, now),
          duration: 10,
          scanCode: null,
          mediaKind: "image",
          youtubeId: null,
          playbackMode: "capped",
          audioMode: "muted",
          orientation: screen,
          advertiserSegmentId: null,
          advertiserCompanyId: null,
          targetMode: "all",
          deviceIds: [],
          segmentIds: [],
          weekdays: [],
          timeWindows: [],
          loopInsertions: 1,
          panelId: null,
          source: "editorial",
        });
      }
    } catch (error) {
      log.error({ err: error }, "Could not load weather slide for device");
    }
  }
```

5. Passar `extras` como 4º argumento no `composeDeviceLoop(...)`.

Se o TypeScript recusar o objeto em `extras` por diferença de tipo com a linha da playlist, ajustar só as anotações (`as const` nos literais, ou o tipo do array) e dizer no relatório; os valores ficam os mesmos.

Nos três lugares que carregam o device para o feed, acrescentar ao `select` (todos já fazem `innerJoin` com `companiesTable`; importar `sql` de `drizzle-orm` onde faltar):

```ts
      showWeather: devicesTable.showWeather,
      companyHasCoordinates: sql<boolean>`(${companiesTable.lat} is not null and ${companiesTable.lng} is not null)`,
```

- `routes/display.ts` (`loadForTv`)
- `routes/devices.ts` (`GET /devices/:id/preview`)
- `lib/portal/queries.ts` (`previewDevice`)

- [ ] **Step 6: Contrato da prévia aceita `editorial`**

Em `lib/api-spec/openapi.yaml`, no `DevicePreviewSlide`, `enum: [campaign, panel, playlist, alert]` → `enum: [campaign, panel, playlist, alert, editorial]`. Regenerar:

```bash
pnpm --filter @workspace/api-spec run codegen
git diff --stat lib/api-zod lib/api-client-react
```

Expected: só o enum de `source` da prévia muda nos gerados.

Em `artifacts/signage/src/components/device-preview.tsx`, `SOURCE_LABEL` ganha `editorial: 'Clima',`.

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/editorial/__tests__/editorial-piece.test.ts src/lib/panels/__tests__/device-slides.test.ts src/routes/__tests__/display-slides.test.ts src/routes/__tests__/device-preview.test.ts src/routes/__tests__/portal-device-preview.test.ts src/routes/__tests__/public-vitrine.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm run typecheck && pnpm --filter @workspace/signage run test`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/signage/src/components/device-preview.tsx
git commit -F - <<'EOF'
feat(api): slide de clima e hora no fim da volta das TVs que ligarem

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Chave "Clima e hora" na página da TV

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (`Device`, `DeviceUpdate`) + gerados
- Modify: `artifacts/api-server/src/routes/devices.ts` (`getDeviceWithClient`)
- Modify: `artifacts/signage/src/pages/device-detail.tsx`
- Test: `artifacts/api-server/src/routes/__tests__/device-update.test.ts`
- Test: `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`

**Interfaces:**
- Consumes: `devicesTable.showWeather` (Task 4).
- Produces: `GET`/`PATCH /devices/:id` devolvem `showWeather` e `companyHasCoordinates`; `PATCH` aceita `showWeather`.

- [ ] **Step 1: Escrever os testes que falham**

Em `device-update.test.ts` (rota `PATCH /devices/:id`; o arquivo já tem `setMock`, `selectQueue`, `buildApp` e `DEVICE`):

1. No mock de `@workspace/db`, acrescentar `showWeather: "showWeather"` ao `devicesTable` e `lat: "lat", lng: "lng"` ao `companiesTable` (mantendo as chaves existentes).
2. No fim do arquivo:

```ts
describe("PATCH /devices/:id — clima e hora", () => {
  it("grava showWeather e devolve a TV com a chave e as coordenadas da empresa", async () => {
    // 1) TV atual  2) TV com cliente (resposta)
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "landscape" }],
      [{ ...DEVICE, showWeather: true, companyHasCoordinates: true }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showWeather: true });
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ showWeather: true }));
    expect(res.body).toMatchObject({ showWeather: true, companyHasCoordinates: true });
  });

  it("recusa showWeather que não é booleano, sem tocar no banco", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showWeather: "sim" });
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });
});
```

Em `device-detail.test.tsx`:

1. Acrescentar ao objeto `DEVICE`: `showWeather: false, companyHasCoordinates: true,`
2. No fim do `describe` principal:

```tsx
  it('liga o clima pelo switch e manda showWeather no PATCH', async () => {
    const patches: unknown[] = [];
    stubTv(DEVICE, [ANUNCIO], patches);
    renderPagina();
    await userEvent.click(await screen.findByRole('switch', { name: 'Clima e hora' }));
    await waitFor(() => expect(patches).toEqual([{ showWeather: true }]));
  });

  it('empresa sem coordenadas: chave desligada e o aviso do CEP', async () => {
    stubTv({ ...DEVICE, companyHasCoordinates: false }, [ANUNCIO]);
    renderPagina();
    expect(await screen.findByRole('switch', { name: 'Clima e hora' })).toBeDisabled();
    expect(screen.getByText('Cadastre o CEP da empresa para ativar.')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/device-update.test.ts && pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/device-detail.test.tsx`
Expected: FAIL — `showWeather` recusado/ignorado; switch "Clima e hora" não existe.

- [ ] **Step 3: Contrato e rota**

Em `lib/api-spec/openapi.yaml`:

- no schema `Device`, depois de `musicUrl`:
  ```yaml
        # Slide de clima e hora na volta desta TV.
        showWeather: { type: boolean }
        # A empresa dona da TV tem lat/lng; sem isso o clima não pode ser ligado.
        companyHasCoordinates: { type: boolean }
  ```
  (opcionais: a lista de TVs não precisa trazer.)
- no schema `DeviceUpdate`, depois de `musicUrl`:
  ```yaml
        showWeather: { type: boolean }
  ```

Regenerar: `pnpm --filter @workspace/api-spec run codegen`.

Em `routes/devices.ts`, no `select` de `getDeviceWithClient`, depois de `musicUrl: devicesTable.musicUrl,`:

```ts
      showWeather: devicesTable.showWeather,
      companyHasCoordinates: sql<boolean>`(${companiesTable.lat} is not null and ${companiesTable.lng} is not null)`,
```

(O `PATCH` já faz `.set(data)` com o corpo validado pelo `UpdateDeviceBody` gerado: depois do codegen, `showWeather` passa.)

- [ ] **Step 4: Página da TV**

Em `pages/device-detail.tsx`, junto de `updateShowcase`:

```tsx
  const updateWeather = useUpdateDevice({
    mutation: {
      // Ligar/desligar muda a volta da TV e a prévia ao lado.
      onSuccess: (d) => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
        queryClient.invalidateQueries({ queryKey: getGetDevicePreviewQueryKey(deviceId) });
        toast({ title: d.showWeather ? 'Clima e hora ligados nesta TV.' : 'Clima e hora desligados.' });
      },
      onError: (err) =>
        toast({ title: mensagemDeErro(err, 'Não foi possível salvar o clima'), variant: 'destructive' }),
    },
  });
```

e, logo depois do bloco da chave "Vitrine da landing" (antes de `<DeviceMusicField …/>`):

```tsx
      <div className="mb-6 flex items-start gap-3 rounded-lg border px-3 py-2.5">
        <Switch
          id="device-weather"
          aria-label="Clima e hora"
          checked={device.showWeather ?? false}
          disabled={updateWeather.isPending || !device.companyHasCoordinates}
          onCheckedChange={(checked) => updateWeather.mutate({ id: deviceId, data: { showWeather: checked } })}
        />
        <div className="text-sm">
          <label htmlFor="device-weather" className="font-medium">Clima e hora</label>
          <p className="text-muted-foreground">
            {device.companyHasCoordinates
              ? 'Mostra a previsão do tempo da cidade da loja e a hora, uma vez por volta.'
              : 'Cadastre o CEP da empresa para ativar.'}
          </p>
        </div>
      </div>
```

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS.

Run: `pnpm run typecheck && pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/signage run test`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/devices.ts artifacts/api-server/src/routes/__tests__/device-update.test.ts artifacts/signage/src/pages/device-detail.tsx artifacts/signage/src/pages/__tests__/device-detail.test.tsx
git commit -F - <<'EOF'
feat(portal): chave de clima e hora na página da TV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Verificação final

**Files:** nenhum.

- [ ] **Step 1: Suite completa, tipos e builds**

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/signage run test
pnpm --filter @workspace/signage run build
pnpm --filter @workspace/api-server run build
```

Expected: tudo verde.

- [ ] **Step 2: Migração**

```bash
cat "$(ls -t lib/db/drizzle/*.sql | head -1)"
```

Expected: o `ADD COLUMN "show_weather"` e o `INSERT … WHERE NOT EXISTS` da peça editorial; nada mais.

- [ ] **Step 3: Acentos**

```bash
git diff main -- . ':!docs' ':!lib/api-zod' ':!lib/api-client-react' | grep -n '\\u00\|\\u20' || echo "sem escapes"
```

Expected: `sem escapes`.
