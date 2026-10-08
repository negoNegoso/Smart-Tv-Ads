# TV toca sem internet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TV (app Android) segue tocando a programação sem internet — inclusive ligando sem rede — respeitando a agenda das campanhas, e o admin vê o espaço em disco de cada TV.

**Architecture:** O feed ganha `offline` (volta dos próximos 7 dias com a agenda de cada campanha). A `tv.html` salva isso no `localStorage` e, quando o feed falha, toca a lista salva filtrada pela agenda. O app guarda a própria `tv.html` e as artes/QR no disco (prefetch por ponte JS), sem nunca deixar menos de 500 MB livres, e informa o espaço num cabeçalho do feed, que a API grava em `devices` e o parque de TVs mostra.

**Tech Stack:** Express 5 + drizzle (Postgres) + zod/orval; React + TanStack Query + vitest; `tv.html` ES5 testada em jsdom; Android Kotlin (minSdk 21) com Robolectric.

**Spec:** `docs/superpowers/specs/2026-10-08-tocar-sem-internet-design.md`

## Global Constraints

- Código e comentários em português, explicando o porquê; acentos UTF-8 reais, nunca `\uXXXX`.
- Commits no formato `tipo(escopo): descrição curta em português`, sem ponto final, com o trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca editar `versionName`/`versionCode` no Gradle nem criar tag `vX.Y.Z`.
- `tv.html` é ES5 puro (sem `let`/`const`/arrow/template string/`Intl` com fuso).
- Horizonte da lista sem internet: **7 dias**. Reserva de disco: **500 MB**. Teto do cache: **1 GB**. Selo "pouco espaço": livre **< 500 MB** ou **< 10% do total**.
- Hora de São Paulo na `tv.html`: UTC − 3 h fixo.
- Campanha: `inicio <= agora <= fim` (fim inclusive, igual ao servidor); faixa `[start, end)` em minutos do dia; `dias` no padrão `getDay()` (0 = domingo); lista vazia = sem restrição.
- Cabeçalho: `X-Signage-Storage: livre=<bytes>;total=<bytes>;cache=<bytes>;arquivos=<n>`.
- Ponte nova: `window.SignageCache` com `baixar(json)` e `estado()`.
- Chave do `localStorage`: `signage-offline`.
- Comandos (rodar a partir da raiz da worktree): API `pnpm --filter @workspace/api-server exec vitest run <arquivo>`; web `pnpm --filter @workspace/signage exec vitest run <arquivo>`; Android `cd artifacts/android-tv && ./gradlew testDebugUnitTest --tests '<Classe>'`; codegen `pnpm --filter @workspace/api-spec run codegen`; migração `DATABASE_URL=postgres://u:p@localhost:5432/x pnpm --filter @workspace/db run generate`; tipos `pnpm -w run typecheck`.

## Review Focus

1. **Relógio do box voltando para 1970/2000 após reinício sem rede** → só playlist/painéis tocam, nunca campanha (Task 6 testa com `setSystemTime` antes de `geradoEm`).
2. **Aviso urgente vencido sem internet** → a TV volta à programação normal, não fica presa no aviso nem em tela vazia (Task 6).
3. **`localStorage` cheio ou corrompido** (JSON inválido na chave) → a TV ignora a lista salva e segue como hoje, sem quebrar o rodízio (Task 6).
4. **Disco quase cheio no stick** → o app não baixa nada que deixe menos de 500 MB livres e encolhe o cache (Task 8).
5. **Cabeçalho de espaço adulterado/malformado** (negativo, texto, livre > total, número gigante) → servidor ignora sem 400 e sem mexer nas colunas (Task 1 e Task 2).

---

### Task 1: Regras puras de espaço em disco e trava do endereço único

**Files:**
- Create: `artifacts/api-server/src/lib/device-storage.ts`
- Test: `artifacts/api-server/src/lib/__tests__/device-storage.test.ts`
- Modify (só teste): `artifacts/api-server/src/lib/storage/__tests__/vercel-blob.test.ts`

**Interfaces:**
- Produces:
  - `type DeviceStorage = { freeBytes: number; totalBytes: number; cacheBytes: number; cacheFiles: number }`
  - `LOW_STORAGE_BYTES = 500 * 1024 * 1024`
  - `parseStorageHeader(value: string | null | undefined): DeviceStorage | null`
  - `lowStorage(freeBytes: number | null, totalBytes: number | null): boolean`
  - `type DeviceStorageView = DeviceStorage & { reportedAt: string; low: boolean }`
  - `storageView(row: { storageFreeBytes: number | null; storageTotalBytes: number | null; cacheBytes: number | null; cacheFiles: number | null; storageReportedAt: Date | null }): DeviceStorageView | null`

- [ ] **Step 1: Write the failing test** — `device-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LOW_STORAGE_BYTES, lowStorage, parseStorageHeader, storageView } from "../device-storage";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("parseStorageHeader", () => {
  it("lê os quatro campos", () => {
    expect(parseStorageHeader("livre=1000;total=8000;cache=300;arquivos=12")).toEqual({
      freeBytes: 1000,
      totalBytes: 8000,
      cacheBytes: 300,
      cacheFiles: 12,
    });
  });

  it("aceita espaços e ordem trocada", () => {
    expect(parseStorageHeader(" arquivos=1 ; cache=2;total=9; livre=3")).toEqual({
      freeBytes: 3,
      totalBytes: 9,
      cacheBytes: 2,
      cacheFiles: 1,
    });
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["livre=1;total=2;cache=3"],
    ["livre=-1;total=2;cache=3;arquivos=1"],
    ["livre=abc;total=2;cache=3;arquivos=1"],
    ["livre=1.5;total=2;cache=3;arquivos=1"],
    ["livre=9;total=2;cache=3;arquivos=1"],
    ["livre=1;total=9999999999999999;cache=3;arquivos=1"],
    ["livre=1;total=2;cache=3;arquivos=99999999999"],
  ])("recusa %s", (valor) => {
    expect(parseStorageHeader(valor as string | null | undefined)).toBeNull();
  });
});

describe("lowStorage", () => {
  it("abaixo de 500 MB é pouco espaço", () => {
    expect(lowStorage(LOW_STORAGE_BYTES - 1, 64 * GB)).toBe(true);
    expect(lowStorage(LOW_STORAGE_BYTES, 4 * GB)).toBe(false);
  });

  it("abaixo de 10% do total é pouco espaço", () => {
    expect(lowStorage(6 * GB - 1, 60 * GB)).toBe(true);
    expect(lowStorage(6 * GB, 60 * GB)).toBe(false);
  });

  it("sem leitura não é pouco espaço", () => {
    expect(lowStorage(null, null)).toBe(false);
    expect(lowStorage(100, null)).toBe(false);
  });
});

describe("storageView", () => {
  it("monta a visão com o selo", () => {
    const reportedAt = new Date("2026-10-08T12:00:00Z");
    expect(
      storageView({ storageFreeBytes: 100 * MB, storageTotalBytes: 8 * GB, cacheBytes: 50 * MB, cacheFiles: 3, storageReportedAt: reportedAt }),
    ).toEqual({ freeBytes: 100 * MB, totalBytes: 8 * GB, cacheBytes: 50 * MB, cacheFiles: 3, reportedAt: reportedAt.toISOString(), low: true });
  });

  it("TV que nunca mandou leitura → null", () => {
    expect(
      storageView({ storageFreeBytes: null, storageTotalBytes: null, cacheBytes: null, cacheFiles: null, storageReportedAt: null }),
    ).toBeNull();
  });
});
```

E em `vercel-blob.test.ts`, dentro do `describe("VercelBlobStore")`:

```ts
  it("mesmo nome enviado duas vezes vira dois endereços: a TV usa o endereço como versão da arte", async () => {
    // O cache da TV (ArteCache) nunca baixa de novo um endereço que já tem.
    // Se algum dia o armazenamento gravar por cima, arte trocada não chega às
    // TVs — este teste é a trava.
    const store = new VercelBlobStore();

    await store.put(Buffer.from("a"), "image/png", "panel-1-p1.png");
    await store.put(Buffer.from("b"), "image/png", "panel-1-p1.png");

    const [primeiro, segundo] = put.mock.calls.map((c) => c[0] as string);
    expect(primeiro).not.toBe(segundo);
    for (const call of put.mock.calls) {
      expect(call[2]).toMatchObject({ addRandomSuffix: false });
      expect(call[2]).not.toHaveProperty("allowOverwrite", true);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/device-storage.test.ts src/lib/storage/__tests__/vercel-blob.test.ts`
Expected: FAIL em `device-storage.test.ts` (módulo não existe). O teste novo do blob já passa (é trava de regressão, não comportamento novo).

- [ ] **Step 3: Write minimal implementation** — `device-storage.ts`:

```ts
/**
 * Espaço em disco que o app Android informa a cada busca do feed, no
 * cabeçalho `X-Signage-Storage`. O valor vem de um aparelho na loja: tudo que
 * não for exatamente o formato esperado é ignorado (sem 400 — a TV não pode
 * parar de receber a programação por causa de um cabeçalho ruim).
 */
export type DeviceStorage = { freeBytes: number; totalBytes: number; cacheBytes: number; cacheFiles: number };

/** Mesmo valor da reserva do app (ArteCache): abaixo disso o box corre risco de travar. */
export const LOW_STORAGE_BYTES = 500 * 1024 * 1024;

const INT4_MAX = 2147483647;

// Até 15 dígitos: cabe com folga em Number sem perder precisão (bigint no banco).
const INTEIRO = /^\d{1,15}$/;

export function parseStorageHeader(value: string | null | undefined): DeviceStorage | null {
  if (!value) return null;
  const campos = new Map<string, string>();
  for (const parte of value.split(";")) {
    const igual = parte.indexOf("=");
    if (igual === -1) continue;
    campos.set(parte.slice(0, igual).trim(), parte.slice(igual + 1).trim());
  }
  const numero = (chave: string): number | null => {
    const bruto = campos.get(chave);
    return bruto !== undefined && INTEIRO.test(bruto) ? Number(bruto) : null;
  };
  const freeBytes = numero("livre");
  const totalBytes = numero("total");
  const cacheBytes = numero("cache");
  const cacheFiles = numero("arquivos");
  if (freeBytes === null || totalBytes === null || cacheBytes === null || cacheFiles === null) return null;
  if (freeBytes > totalBytes || cacheFiles > INT4_MAX) return null;
  return { freeBytes, totalBytes, cacheBytes, cacheFiles };
}

/** Pouco espaço: abaixo da reserva do app ou de 10% do disco. Sem leitura, não marca. */
export function lowStorage(freeBytes: number | null, totalBytes: number | null): boolean {
  if (freeBytes === null || totalBytes === null) return false;
  return freeBytes < LOW_STORAGE_BYTES || freeBytes < totalBytes * 0.1;
}

export type DeviceStorageView = DeviceStorage & { reportedAt: string; low: boolean };

/** O que o admin vê. Null = a TV nunca mandou leitura (navegador ou APK antigo). */
export function storageView(row: {
  storageFreeBytes: number | null;
  storageTotalBytes: number | null;
  cacheBytes: number | null;
  cacheFiles: number | null;
  storageReportedAt: Date | null;
}): DeviceStorageView | null {
  if (
    row.storageFreeBytes === null ||
    row.storageTotalBytes === null ||
    row.cacheBytes === null ||
    row.cacheFiles === null ||
    row.storageReportedAt === null
  ) {
    return null;
  }
  return {
    freeBytes: row.storageFreeBytes,
    totalBytes: row.storageTotalBytes,
    cacheBytes: row.cacheBytes,
    cacheFiles: row.cacheFiles,
    reportedAt: row.storageReportedAt.toISOString(),
    low: lowStorage(row.storageFreeBytes, row.storageTotalBytes),
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — mesmo comando do Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/device-storage.ts artifacts/api-server/src/lib/__tests__/device-storage.test.ts artifacts/api-server/src/lib/storage/__tests__/vercel-blob.test.ts
git commit -m "feat(api): regras de espaço em disco da TV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Colunas de espaço e gravação pelo feed

**Files:**
- Modify: `lib/db/src/schema/devices.ts`
- Create: `lib/db/drizzle/0024_*.sql` (gerado) e o snapshot/journal que o drizzle-kit gerar
- Modify: `artifacts/api-server/src/routes/display.ts` (`loadForTv`)
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `parseStorageHeader` (Task 1).
- Produces: colunas drizzle `storageFreeBytes`, `storageTotalBytes`, `cacheBytes`, `cacheFiles`, `storageReportedAt` em `devicesTable`.

- [ ] **Step 1: Write the failing test** — em `display-slides.test.ts`, num `describe("feed: espaço em disco da TV")` novo, usando o mesmo `buildApp`, `selectResults` e `setMock` do arquivo (veja os testes existentes de `lastSeenAt` para montar `selectResults` com `DEVICE_ROW`, playlist e campanhas vazias):

```ts
describe("feed: espaço em disco da TV", () => {
  it("grava a leitura do cabeçalho junto com o lastSeenAt", async () => {
    selectResults = [[DEVICE_ROW], [], []];
    panelSlidesForClientMock.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");

    await request(app)
      .get("/display/CHAVE/feed")
      .set("X-Signage-Storage", "livre=1000;total=8000;cache=300;arquivos=12")
      .expect(200);

    const valores = setMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(valores).toMatchObject({
      storageFreeBytes: 1000,
      storageTotalBytes: 8000,
      cacheBytes: 300,
      cacheFiles: 12,
    });
    expect(valores.storageReportedAt).toBeInstanceOf(Date);
    expect(valores.storageReportedAt).toEqual(valores.lastSeenAt);
  });

  it.each([[undefined], ["livre=-1;total=2;cache=3;arquivos=1"]])(
    "sem cabeçalho válido (%s) não mexe nas colunas",
    async (cabecalho) => {
      selectResults = [[DEVICE_ROW], [], []];
      panelSlidesForClientMock.mockResolvedValue([]);
      const app = await buildApp();
      const { default: request } = await import("supertest");

      const req = request(app).get("/display/CHAVE/feed");
      await (cabecalho ? req.set("X-Signage-Storage", cabecalho) : req).expect(200);

      const valores = setMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(valores).not.toHaveProperty("storageFreeBytes");
      expect(valores).not.toHaveProperty("storageReportedAt");
    },
  );
});
```

Se `beforeEach` do arquivo não zera `setMock`, `selectResults`, `selectCallIndex` e `panelSlidesForClientMock`, siga o padrão já usado pelos outros `describe` (eles zeram); não invente outro.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts -t "espaço em disco"`
Expected: FAIL (`storageFreeBytes` ausente).

- [ ] **Step 3: Schema** — em `lib/db/src/schema/devices.ts`, importe `bigint` de `drizzle-orm/pg-core` e, depois de `tickerMessages`:

```ts
    // Espaço em disco do box/stick, lido pelo app Android e mandado no
    // cabeçalho X-Signage-Storage do feed. Nulo = nunca informou (navegador
    // ou APK antigo). bigint: disco passa de 2 GB.
    storageFreeBytes: bigint("storage_free_bytes", { mode: "number" }),
    storageTotalBytes: bigint("storage_total_bytes", { mode: "number" }),
    // Quanto o cache de artes do app ocupa, e quantos arquivos.
    cacheBytes: bigint("cache_bytes", { mode: "number" }),
    cacheFiles: integer("cache_files"),
    // Quando chegou a última leitura válida.
    storageReportedAt: timestamp("storage_reported_at", { withTimezone: true }),
```

Gere a migração: `DATABASE_URL=postgres://u:p@localhost:5432/x pnpm --filter @workspace/db run generate`. Confira que o `.sql` novo tem **só** os cinco `ALTER TABLE "devices" ADD COLUMN ...`.

- [ ] **Step 4: Rota** — em `routes/display.ts`, importe `parseStorageHeader` de `../lib/device-storage` e troque o `UPDATE` de `loadForTv`:

```ts
  // Espaço em disco só quando o app mandou uma leitura válida: cabeçalho
  // ausente (navegador, APK antigo) ou malformado não apaga a última boa.
  const storage = parseStorageHeader(req.get("x-signage-storage"));

  // A versão é a do último contato, mesmo quando é nula: TV que passou a
  // abrir no navegador não pode seguir mostrando a versão antiga do app.
  await db
    .update(devicesTable)
    .set({
      lastSeenAt: now,
      appVersion,
      ...(storage
        ? {
            storageFreeBytes: storage.freeBytes,
            storageTotalBytes: storage.totalBytes,
            cacheBytes: storage.cacheBytes,
            cacheFiles: storage.cacheFiles,
            storageReportedAt: now,
          }
        : {}),
    })
    .where(eq(devicesTable.id, device.id));
```

- [ ] **Step 5: Run test to verify it passes** — `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts` (arquivo inteiro). Expected: PASS. Depois `pnpm -w run typecheck`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/devices.ts lib/db/drizzle artifacts/api-server/src/routes/display.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts
git commit -m "feat(api): feed grava o espaço em disco que a TV informa" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Montagem da lista sem internet (`lib/offline-feed.ts`)

**Files:**
- Modify: `artifacts/api-server/src/lib/ad-eligibility.ts` (nova `filterReachableSlides`)
- Modify: `artifacts/api-server/src/lib/device-feed.ts` (`buildCampaignSlidesQuery(now, startsBy)`, `loadPlaylistSlides` exportada, tira `startsAt`/`endsAt` da saída)
- Modify: `artifacts/api-server/src/lib/alerts/active-alert.ts` (`AlertPiece.endsAt`)
- Create: `artifacts/api-server/src/lib/offline-feed.ts`
- Test: `artifacts/api-server/src/lib/__tests__/offline-feed.test.ts`, `artifacts/api-server/src/lib/__tests__/device-feed-query.test.ts`, teste de `ad-eligibility` existente

**Interfaces:**
- Produces:
  - `filterReachableSlides<T extends CampaignTarget & AdvertiserIdentity>(slides: T[], device: NetworkDevice): T[]`
  - `buildCampaignSlidesQuery(now: Date, startsBy: Date = now)` — passa a trazer `startsAt` e `endsAt`.
  - `loadPlaylistSlides(deviceId: number)` — a mesma consulta que hoje está dentro de `loadDeviceSlides`.
  - `AlertPiece = { announcementId; title; imageUrl; duration; endsAt: Date }`
  - `OFFLINE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000`
  - `type OfflineAgenda = { inicio?: string; fim: string; dias?: number[]; faixas?: Array<{ start: number; end: number }> }`
  - `type OfflineSlide = { announcementId: number; campaignId: number | null; title: string; displayText: string | null; imageUrl: string | null; duration: number; qrImageUrl: string | null; mediaKind: string; youtubeId: null; playbackMode: string | null; audioMode: string | null; videoIds: null; agenda?: OfflineAgenda }`
  - `type OfflineFeed = { geradoEm: string; slides: OfflineSlide[] }`
  - `loadOfflineFeed(device: FeedDevice, log: Request["log"], now?: Date): Promise<OfflineFeed | null>` — nunca lança.

- [ ] **Step 1: Write the failing tests**

Em `device-feed-query.test.ts`:

```ts
  it("traz início e fim da campanha (a TV sem internet confere a data sozinha)", () => {
    const { sql } = buildCampaignSlidesQuery(new Date("2026-09-24T12:00:00Z")).toSQL();
    expect(sql).toContain('"campaigns"."starts_at"');
    expect(sql).toContain('"campaigns"."ends_at"');
  });

  it("com startsBy, aceita campanha que começa até aquela data", () => {
    const now = new Date("2026-09-24T12:00:00Z");
    const ate = new Date("2026-10-01T12:00:00Z");
    const { params } = buildCampaignSlidesQuery(now, ate).toSQL();
    expect(params).toContain(ate.toISOString());
    expect(params).toContain(now.toISOString());
  });
```

(Se o driver serializar as datas de outro jeito em `params`, compare com o formato que o teste de `now` já existente usa — rode e ajuste só a forma da comparação, não a regra.)

No teste existente de `ad-eligibility` (`src/lib/__tests__/ad-eligibility.test.ts`), adicione:

```ts
describe("filterReachableSlides", () => {
  const device = { id: 1, companyId: 10, segmentId: 3 };
  const base = { targetMode: "all" as const, deviceIds: [], segmentIds: [], advertiserSegmentId: null, advertiserCompanyId: 99 };

  it("ignora dia e horário: só alvo e concorrência", () => {
    const fora = { ...base, weekdays: [0], timeWindows: [{ start: 0, end: 15 }] };
    expect(filterReachableSlides([fora], device)).toHaveLength(1);
  });

  it("tira o concorrente do mesmo segmento", () => {
    expect(filterReachableSlides([{ ...base, advertiserSegmentId: 3 }], device)).toHaveLength(0);
  });

  it("tira campanha de outra TV", () => {
    expect(filterReachableSlides([{ ...base, targetMode: "devices" as const, deviceIds: [2] }], device)).toHaveLength(0);
  });
});
```

(Ajuste os campos de `base` ao `CampaignTarget` real do arquivo se o nome diferir; a regra testada é a da frase do `it`.)

`offline-feed.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mesmo truque do display-slides.test: o db devolve, em ordem, playlist e
 * campanhas; painéis e aviso são mockados à parte.
 */
const panelSlidesForClientMock = vi.fn();
const findActiveAlertPieceMock = vi.fn();
let selectResults: unknown[] = [];
let selectCallIndex = 0;

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "orderBy"]) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void, reject?: (r: unknown) => void) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: { select: () => makeChain(selectResults[selectCallIndex++]) },
  devicePlaylistTable: { deviceId: "deviceId", isActive: "isActive", displayOrder: "displayOrder", announcementId: "announcementId" },
  announcementsTable: { id: "id", title: "title", displayText: "displayText", showText: "showText", imageUrl: "imageUrl", duration: "duration", mediaKind: "mediaKind", youtubeId: "youtubeId", playbackMode: "playbackMode", audioMode: "audioMode", orientation: "orientation", displayOrder: "displayOrder" },
  campaignsTable: { id: "id", advertiserId: "advertiserId", isActive: "isActive", startsAt: "startsAt", endsAt: "endsAt", weekdays: "weekdays", timeWindows: "timeWindows", targetMode: "targetMode", loopInsertions: "loopInsertions" },
  campaignAnnouncementsTable: { campaignId: "campaignId", announcementId: "announcementId", destinationUrl: "destinationUrl", scanCode: "scanCode" },
  advertisersTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", segmentId: "segmentId" },
}));

vi.mock("../panels/device-slides", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../panels/device-slides")>();
  return { ...actual, panelSlidesForClient: (...a: unknown[]) => panelSlidesForClientMock(...a) };
});

vi.mock("../alerts/active-alert", () => ({
  findActiveAlertPiece: (...a: unknown[]) => findActiveAlertPieceMock(...a),
}));

const { loadOfflineFeed } = await import("../offline-feed");

const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never;
const NOW = new Date("2026-10-08T18:00:00Z"); // 15:00 em São Paulo
const DEVICE = { id: 1, clientId: 7, companyId: 70, segmentId: null, orientation: "landscape" };

const linha = (over: Record<string, unknown>) => ({
  announcementId: 1,
  campaignId: null,
  title: "Peça",
  displayText: null,
  showText: false,
  imageUrl: "https://x.public.blob.vercel-storage.com/a.png",
  duration: 10,
  scanCode: null,
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  orientation: "landscape",
  advertiserSegmentId: null,
  advertiserCompanyId: 99,
  targetMode: "all",
  deviceIds: [],
  segmentIds: [],
  weekdays: [],
  timeWindows: [],
  loopInsertions: 1,
  panelId: null,
  ...over,
});

const campanha = (over: Record<string, unknown>) =>
  linha({
    campaignId: 5,
    startsAt: new Date("2026-10-01T03:00:00Z"),
    endsAt: new Date("2026-10-31T03:00:00Z"),
    ...over,
  });

beforeEach(() => {
  selectResults = [];
  selectCallIndex = 0;
  panelSlidesForClientMock.mockReset().mockResolvedValue([]);
  findActiveAlertPieceMock.mockReset().mockResolvedValue(null);
});

describe("loadOfflineFeed", () => {
  it("campanha fora do horário de agora entra, com a agenda", async () => {
    selectResults = [[], [campanha({ announcementId: 2, weekdays: [1, 2], timeWindows: [{ start: 1080, end: 1320 }] })]];
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.geradoEm).toBe(NOW.toISOString());
    expect(feed!.slides).toEqual([
      expect.objectContaining({
        announcementId: 2,
        campaignId: 5,
        agenda: {
          inicio: "2026-10-01T03:00:00.000Z",
          fim: "2026-10-31T03:00:00.000Z",
          dias: [1, 2],
          faixas: [{ start: 1080, end: 1320 }],
        },
      }),
    ]);
  });

  it("horizonte da lista é de 7 dias", async () => {
    // A consulta com `startsBy` tem teste próprio (device-feed-query.test);
    // aqui fica a constante que a liga ao `now`.
    const { OFFLINE_HORIZON_MS } = await import("../offline-feed");
    expect(OFFLINE_HORIZON_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("concorrente e campanha de outra TV não entram", async () => {
    selectResults = [
      [],
      [
        campanha({ announcementId: 2, advertiserSegmentId: 3 }),
        campanha({ announcementId: 3, campaignId: 6, targetMode: "devices", deviceIds: [999] }),
      ],
    ];
    const feed = await loadOfflineFeed({ ...DEVICE, segmentId: 3 }, log, NOW);
    expect(feed!.slides).toEqual([]);
  });

  it("YouTube não entra (não toca sem internet)", async () => {
    selectResults = [[linha({ announcementId: 4, mediaKind: "youtube_video", youtubeId: "abc" })], []];
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.slides).toEqual([]);
  });

  it("playlist e painéis entram sem agenda; QR e legenda resolvidos", async () => {
    selectResults = [
      [linha({ announcementId: 7, showText: true, displayText: "Oi" })],
      [campanha({ announcementId: 2, scanCode: "abc123" })],
    ];
    panelSlidesForClientMock.mockResolvedValue([linha({ announcementId: 8, panelId: 3 })]);
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    const porId = Object.fromEntries(feed!.slides.map((s) => [s.announcementId, s]));
    expect(porId[2]!.qrImageUrl).toBe("/api/qr/abc123.png");
    expect(porId[7]).not.toHaveProperty("agenda");
    expect(porId[7]!.displayText).toBe("Oi");
    expect(porId[8]).not.toHaveProperty("agenda");
  });

  it("aviso urgente vai na frente com agenda.fim e a volta normal segue atrás", async () => {
    selectResults = [[linha({ announcementId: 7 })], []];
    findActiveAlertPieceMock.mockResolvedValue({
      announcementId: 50,
      title: "Fechamos às 18h",
      imageUrl: "https://x.public.blob.vercel-storage.com/alerta.png",
      duration: 15,
      endsAt: new Date("2026-10-08T21:00:00Z"),
    });
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.slides.map((s) => s.announcementId)).toEqual([50, 7]);
    expect(feed!.slides[0]!.agenda).toEqual({ fim: "2026-10-08T21:00:00.000Z" });
  });

  it("falha no aviso não derruba a lista", async () => {
    selectResults = [[linha({ announcementId: 7 })], []];
    findActiveAlertPieceMock.mockRejectedValue(new Error("db"));
    const feed = await loadOfflineFeed(DEVICE, log, NOW);
    expect(feed!.slides.map((s) => s.announcementId)).toEqual([7]);
  });

  it("vitrine → null", async () => {
    expect(await loadOfflineFeed({ ...DEVICE, showcase: true }, log, NOW)).toBeNull();
  });

  it("falha na montagem → null e log, sem lançar", async () => {
    selectResults = [Promise.reject(new Error("db fora"))];
    await expect(loadOfflineFeed(DEVICE, log, NOW)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/offline-feed.test.ts src/lib/__tests__/device-feed-query.test.ts src/lib/__tests__/ad-eligibility.test.ts`
Expected: FAIL (módulo `offline-feed` ausente, `filterReachableSlides` ausente, colunas `starts_at`/`ends_at` fora do select).

- [ ] **Step 3: `ad-eligibility.ts`** — antes de `filterEligibleSlides`:

```ts
/**
 * Só alvo e concorrência, sem dia e sem faixa de horário. É o filtro da lista
 * que a TV guarda para tocar sem internet: ela confere a agenda sozinha.
 */
export function filterReachableSlides<T extends CampaignTarget & AdvertiserIdentity>(
  slides: T[],
  device: NetworkDevice,
): T[] {
  return slides.filter(
    (slide) =>
      campaignReachesDevice(slide, device) &&
      canPlayOnDevice({
        advertiserSegmentId: slide.advertiserSegmentId,
        advertiserCompanyId: slide.advertiserCompanyId,
        deviceCompanyId: device.companyId,
        deviceSegmentId: device.segmentId,
      }),
  );
}
```

E reescreva `filterEligibleSlides` para reaproveitá-la:

```ts
  return filterReachableSlides(
    slides.filter((slide) => campaignRunsOnDay(slide.weekdays, now) && campaignRunsAtTime(slide.timeWindows, now)),
    device,
  );
```

(Se `NetworkDevice`/`AdvertiserIdentity` estiverem declarados depois de `filterEligibleSlides`, tipos são içados no TS; não precisa mover.)

- [ ] **Step 4: `device-feed.ts`**
  - `buildCampaignSlidesQuery(now: Date, startsBy: Date = now)`: troque `lte(campaignsTable.startsAt, now)` por `lte(campaignsTable.startsAt, startsBy)` e acrescente ao select `startsAt: campaignsTable.startsAt, endsAt: campaignsTable.endsAt,`. Comentário na função: "`startsBy` > now só para a lista sem internet (campanhas que vão começar)".
  - Extraia a consulta da playlist de `loadDeviceSlides` para `export function loadPlaylistSlides(deviceId: number)` (mesmo select, com `devicePlaylistTable.deviceId = deviceId`) e chame-a em `loadDeviceSlides`. Para os tipos do `composeDeviceLoop` continuarem batendo com as campanhas, inclua no select da playlist `startsAt: sql<Date | null>\`NULL\`, endsAt: sql<Date | null>\`NULL\`,`.
  - No `visible.map(async ({ ... }) => ...)` final de `loadDeviceSlides`, acrescente `startsAt, endsAt,` à desestruturação (comentário: "Só para a lista sem internet; o player online não precisa."). Se o tipo do painel (`PanelSlideRow`) não tiver esses campos e o TS reclamar, desestruture com `// eslint-disable-next-line`-free alternativa: `const { startsAt: _s, endsAt: _e, ...resto } = row as typeof row & { startsAt?: unknown; endsAt?: unknown }` — o objetivo é só a saída não carregar as datas.

- [ ] **Step 5: `active-alert.ts`** — `AlertPiece` ganha `endsAt: Date` e o retorno vira `return piece ? { ...piece, endsAt: alert.endsAt } : null;`. Rode os testes de aviso (`pnpm --filter @workspace/api-server exec vitest run src/lib/alerts src/routes/__tests__/display-slides.test.ts`); se algum `toEqual` da peça quebrar só pelo campo novo, atualize a expectativa.

- [ ] **Step 6: `offline-feed.ts`**

```ts
import type { Request } from "express";
import { screenOrientationOf } from "@workspace/db/orientation";
import { buildCampaignSlidesQuery, loadPlaylistSlides, type FeedDevice } from "./device-feed";
import { filterReachableSlides } from "./ad-eligibility";
import { composeDeviceLoop, panelSlidesForClient, type LoopSlide } from "./panels/device-slides";
import { filterByOrientation } from "./slide-orientation";
import { findActiveAlertPiece } from "./alerts/active-alert";
import { resolveSlideCaption } from "./slide-caption";

/**
 * Lista que a TV guarda para tocar sem internet. Diferente do feed online,
 * leva campanhas fora do dia/horário de agora (e as que começam em até 7
 * dias) com a agenda delas: a TV sem rede confere sozinha o que pode tocar.
 * Alvo e concorrência já saem filtrados aqui, porque não mudam com o tempo.
 */
export const OFFLINE_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

// YouTube precisa de internet; a TV pularia o slide de qualquer jeito.
const SO_COM_INTERNET = new Set(["youtube_video", "youtube_playlist"]);

export type OfflineAgenda = {
  inicio?: string;
  fim: string;
  dias?: number[];
  faixas?: Array<{ start: number; end: number }>;
};

export type OfflineSlide = {
  announcementId: number;
  campaignId: number | null;
  title: string;
  displayText: string | null;
  imageUrl: string | null;
  duration: number;
  qrImageUrl: string | null;
  mediaKind: string;
  youtubeId: null;
  playbackMode: string | null;
  audioMode: string | null;
  videoIds: null;
  agenda?: OfflineAgenda;
};

export type OfflineFeed = { geradoEm: string; slides: OfflineSlide[] };

/** Linha das três fontes, no que a lista sem internet usa. */
type SourceRow = {
  announcementId: number;
  campaignId: number | null;
  title: string;
  displayText: string | null;
  showText: boolean | null;
  imageUrl: string | null;
  duration: number;
  scanCode: string | null;
  mediaKind: string;
  playbackMode: string | null;
  audioMode: string | null;
  panelId?: number | null;
  loopInsertions?: number;
  weekdays?: number[];
  timeWindows?: Array<{ start: number; end: number }> | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

type LoopRow = LoopSlide & { slide: OfflineSlide };

function toLoopRow(row: SourceRow): LoopRow {
  const slide: OfflineSlide = {
    announcementId: row.announcementId,
    campaignId: row.campaignId,
    title: row.title,
    displayText: resolveSlideCaption({ showText: row.showText ?? false, displayText: row.displayText }),
    imageUrl: row.imageUrl,
    duration: row.duration,
    qrImageUrl: row.scanCode ? `/api/qr/${row.scanCode}.png` : null,
    mediaKind: row.mediaKind,
    youtubeId: null,
    playbackMode: row.playbackMode,
    audioMode: row.audioMode,
    videoIds: null,
  };
  // Só campanha tem agenda: painel e playlist são do próprio lojista e tocam sempre.
  if (row.campaignId !== null && row.startsAt && row.endsAt) {
    slide.agenda = {
      inicio: row.startsAt.toISOString(),
      fim: row.endsAt.toISOString(),
      dias: row.weekdays ?? [],
      faixas: row.timeWindows ?? [],
    };
  }
  return {
    announcementId: row.announcementId,
    campaignId: row.campaignId,
    panelId: row.panelId ?? null,
    loopInsertions: row.loopInsertions,
    slide,
  };
}

export async function loadOfflineFeed(
  device: FeedDevice,
  log: Request["log"],
  now: Date = new Date(),
): Promise<OfflineFeed | null> {
  // A vitrine é espelho da landing: fica de fora (decidido na spec).
  if (device.showcase) return null;
  try {
    const screen = screenOrientationOf(device.orientation);
    const playlist = await loadPlaylistSlides(device.id);
    const campaigns = await buildCampaignSlidesQuery(now, new Date(now.getTime() + OFFLINE_HORIZON_MS));

    // Mesma tolerância do feed online: painel quebrado não apaga o resto.
    let panels: Awaited<ReturnType<typeof panelSlidesForClient>> = [];
    try {
      panels = await panelSlidesForClient(device.clientId);
    } catch (error) {
      log.error({ err: error }, "Could not load panel slides for offline feed");
    }

    const prontos = <T extends SourceRow & { orientation: string | null }>(rows: T[]) =>
      filterByOrientation(rows, screen)
        .filter((row) => !SO_COM_INTERNET.has(row.mediaKind))
        .map(toLoopRow);

    const slides = composeDeviceLoop(
      prontos(filterReachableSlides(campaigns, device)),
      prontos(panels),
      prontos(playlist),
    ).map((row) => row.slide);

    // Aviso na frente, sem substituir a volta: se ele vencer com a TV sem
    // rede, ela volta sozinha para a programação.
    try {
      const alert = await findActiveAlertPiece(device, screen, now);
      if (alert) {
        slides.unshift({
          announcementId: alert.announcementId,
          campaignId: null,
          title: alert.title,
          displayText: null,
          imageUrl: alert.imageUrl,
          duration: alert.duration,
          qrImageUrl: null,
          mediaKind: "image",
          youtubeId: null,
          playbackMode: "capped",
          audioMode: "muted",
          videoIds: null,
          agenda: { fim: alert.endsAt.toISOString() },
        });
      }
    } catch (error) {
      log.error({ err: error }, "Could not load urgent alert for offline feed");
    }

    return { geradoEm: now.toISOString(), slides };
  } catch (error) {
    log.error({ err: error }, "Could not build offline feed");
    return null;
  }
}
```

Se `PanelSlideRow` ou as linhas da playlist não satisfizerem `SourceRow` (ex.: `showText` com outro tipo), ajuste **`SourceRow`** aos tipos reais; a lógica de `toLoopRow` não muda.

- [ ] **Step 7: Run tests to verify they pass** — mesmo comando do Step 2, depois a suíte da API inteira `pnpm --filter @workspace/api-server exec vitest run` e `pnpm -w run typecheck`. Expected: tudo PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/lib
git commit -m "feat(api): lista da TV para tocar sem internet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `offline` no contrato e na rota do feed

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (`DisplayFeed.offline`, schema `OfflineSlide`)
- Regenerar: `lib/api-zod`, `lib/api-client-react` (codegen)
- Modify: `artifacts/api-server/src/routes/display.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `loadOfflineFeed` (Task 3).
- Produces: `GET /display/:key/feed` responde `offline: OfflineFeed | null`.

- [ ] **Step 1: Write the failing test** — em `display-slides.test.ts`, mocke o módulo (junto dos outros `vi.mock` do topo) e zere no `beforeEach` geral:

```ts
const loadOfflineFeedMock = vi.fn();
vi.mock("../../lib/offline-feed", () => ({
  loadOfflineFeed: (...args: unknown[]) => loadOfflineFeedMock(...args),
}));
// no beforeEach geral do arquivo:
loadOfflineFeedMock.mockReset().mockResolvedValue(null);
```

E o `describe` novo:

```ts
describe("feed: lista sem internet", () => {
  it("devolve o offline montado para a TV, com a agenda", async () => {
    selectResults = [[DEVICE_ROW], [], []];
    panelSlidesForClientMock.mockResolvedValue([]);
    const offline = {
      geradoEm: "2026-10-08T18:00:00.000Z",
      slides: [
        {
          announcementId: 2,
          campaignId: 5,
          title: "Campanha",
          displayText: null,
          imageUrl: "https://x/a.png",
          duration: 10,
          qrImageUrl: null,
          mediaKind: "image",
          youtubeId: null,
          playbackMode: "capped",
          audioMode: "muted",
          videoIds: null,
          agenda: { inicio: "2026-10-01T03:00:00.000Z", fim: "2026-10-31T03:00:00.000Z", dias: [1], faixas: [{ start: 1080, end: 1320 }] },
        },
      ],
    };
    loadOfflineFeedMock.mockResolvedValue(offline);
    const app = await buildApp();
    const { default: request } = await import("supertest");

    const res = await request(app).get("/display/CHAVE/feed").expect(200);

    expect(res.body.offline).toEqual(offline);
    expect(loadOfflineFeedMock.mock.calls[0]![0]).toMatchObject({ id: DEVICE_ROW.id });
  });

  it("sem lista (vitrine ou falha) → offline null e o resto do feed igual", async () => {
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], []];
    panelSlidesForClientMock.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");

    const res = await request(app).get("/display/CHAVE/feed").expect(200);

    expect(res.body.offline).toBeNull();
    expect(res.body.slides).toHaveLength(1);
  });

  it("/slides (endpoint antigo) não monta a lista", async () => {
    selectResults = [[DEVICE_ROW], [], []];
    panelSlidesForClientMock.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");

    await request(app).get("/display/CHAVE/slides").expect(200);

    expect(loadOfflineFeedMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts -t "lista sem internet"`
Expected: FAIL (`offline` ausente na resposta).

- [ ] **Step 3: Contrato** — em `openapi.yaml`, dentro de `DisplayFeed.properties`, depois de `appUpdate`:

```yaml
        # Lista que a TV guarda para tocar sem internet: campanhas dos
        # próximos 7 dias com a agenda (a TV filtra sozinha), painéis e
        # playlist; sem YouTube e sem clima. Nulo na vitrine ou em falha.
        offline:
          type: ["object", "null"]
          required: [geradoEm, slides]
          properties:
            geradoEm: { type: string, format: date-time }
            slides:
              type: array
              items:
                $ref: "#/components/schemas/OfflineSlide"
```

E, logo depois do schema `DisplayFeed`:

```yaml
    OfflineSlide:
      allOf:
        - $ref: "#/components/schemas/DisplaySlide"
        - type: object
          properties:
            # Só em campanha (inicio, fim, dias, faixas) e no aviso urgente
            # (só fim). Sem agenda = toca sempre.
            agenda:
              type: object
              required: [fim]
              properties:
                inicio: { type: string, format: date-time }
                fim: { type: string, format: date-time }
                dias:
                  type: array
                  items: { type: integer }
                faixas:
                  type: array
                  items:
                    type: object
                    required: [start, end]
                    properties:
                      start: { type: integer }
                      end: { type: integer }
```

Rode `pnpm --filter @workspace/api-spec run codegen`.

- [ ] **Step 4: Rota** — em `routes/display.ts`, importe `loadOfflineFeed` de `../lib/offline-feed`. No handler de `/display/:deviceKey/feed`, antes do `res.json`:

```ts
  // Nunca lança: falha vira null e a TV segue com a lista salva antes.
  const offline = await loadOfflineFeed(tv.device, req.log, tv.now);
```

e no objeto passado a `GetDisplayFeedResponse.parse`, depois de `appUpdate`: `offline,`.

- [ ] **Step 5: Run tests** — arquivo inteiro `display-slides.test.ts`, depois a suíte da API e `pnpm -w run typecheck`. Expected: PASS. Se o zod gerado para `format: date-time` recusar a string ISO com milissegundos, confira o que o orval gerou e ajuste o teste para o formato aceito — não remova o `format`.

- [ ] **Step 6: Commit**

```bash
git add lib/api-spec lib/api-zod lib/api-client-react artifacts/api-server/src/routes
git commit -m "feat(api): feed leva a lista para tocar sem internet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Espaço em disco no parque e na página da TV (API + admin)

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (`DeviceStorage` schema; `FleetDevice.storage`; `Device.storage`) + codegen
- Modify: `artifacts/api-server/src/routes/fleet.ts`, `artifacts/api-server/src/routes/devices.ts` (`getDeviceWithClient` + `GET /devices/:id`)
- Test: `artifacts/api-server/src/routes/__tests__/fleet.test.ts`, `artifacts/api-server/src/routes/__tests__/device-update.test.ts` (ou o teste do `GET /devices/:id` existente)
- Create: `artifacts/signage/src/lib/bytes.ts`, `artifacts/signage/src/lib/__tests__/bytes.test.ts`, `artifacts/signage/src/components/device-storage-info.tsx`
- Modify: `artifacts/signage/src/lib/fleet.ts`, `artifacts/signage/src/pages/fleet.tsx`, `artifacts/signage/src/pages/device-detail.tsx`
- Test: `artifacts/signage/src/lib/__tests__/fleet.test.ts`, `artifacts/signage/src/pages/__tests__/fleet.test.tsx`, `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`

**Interfaces:**
- Consumes: `storageView`, `DeviceStorageView` (Task 1); colunas (Task 2).
- Produces: `storage: { freeBytes; totalBytes; cacheBytes; cacheFiles; reportedAt; low } | null` em cada TV do `/fleet` e no `GET /devices/:id`; `formatBytes(n: number): string`; `storageLabel(s): string`; `FleetFilter` com `'lowStorage'`; `fleetCounts(...).lowStorage`.

- [ ] **Step 1: Write the failing API tests** — em `fleet.test.ts` (siga o mock de select do arquivo; acrescente às linhas do parque as colunas novas):

```ts
  it("devolve o espaço em disco com o selo de pouco espaço", async () => {
    // linha do parque com leitura: 100 MB livres de 8 GB
    // (monte a linha como as outras do arquivo, com estes campos a mais)
    const reportedAt = new Date("2026-10-08T12:00:00Z");
    // ...storageFreeBytes: 100 * 1024 * 1024, storageTotalBytes: 8 * 1024 ** 3,
    //    cacheBytes: 50 * 1024 * 1024, cacheFiles: 3, storageReportedAt: reportedAt
    // espere em res.body.devices[0].storage:
    // { freeBytes: 104857600, totalBytes: 8589934592, cacheBytes: 52428800, cacheFiles: 3,
    //   reportedAt: "2026-10-08T12:00:00.000Z", low: true }
  });

  it("TV sem leitura → storage null", async () => {
    // colunas novas todas null → res.body.devices[0].storage === null
  });
```

Escreva os dois testes completos no estilo do arquivo (mesma montagem de linha e de `request(app)` dos testes vizinhos), com exatamente os valores e expectativas dos comentários acima. Faça o mesmo par de casos para `GET /devices/:id` no arquivo que já testa essa rota (procure `get("/devices/` nos testes de `routes/__tests__`).

- [ ] **Step 2: Run** — `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/fleet.test.ts` (e o arquivo do `GET /devices/:id`). Expected: FAIL.

- [ ] **Step 3: Contrato** — em `openapi.yaml`, um schema novo (perto de `FleetDevice`):

```yaml
    # Leitura de disco que o app Android manda no feed. Nulo = nunca mandou.
    DeviceStorage:
      type: ["object", "null"]
      required: [freeBytes, totalBytes, cacheBytes, cacheFiles, reportedAt, low]
      properties:
        freeBytes: { type: integer }
        totalBytes: { type: integer }
        cacheBytes: { type: integer }
        cacheFiles: { type: integer }
        reportedAt: { type: string, format: date-time }
        # Livre abaixo de 500 MB ou de 10% do total.
        low: { type: boolean }
```

`FleetDevice`: acrescente `storage` em `required` e `storage: { $ref: "#/components/schemas/DeviceStorage" }` nas properties. `Device`: acrescente `storage: { $ref: "#/components/schemas/DeviceStorage" }` (opcional, fora de `required`, como `tickerMessages`). Codegen.

- [ ] **Step 4: Rotas**
  - `fleet.ts`: no select, `storageFreeBytes: devicesTable.storageFreeBytes, storageTotalBytes: devicesTable.storageTotalBytes, cacheBytes: devicesTable.cacheBytes, cacheFiles: devicesTable.cacheFiles, storageReportedAt: devicesTable.storageReportedAt,`. No `rows.map`, troque `...row` por desestruturação que tira esses cinco e acrescente `storage: storageView(row)`:

```ts
      devices: rows.map(({ storageFreeBytes, storageTotalBytes, cacheBytes, cacheFiles, storageReportedAt, ...row }) => ({
        ...row,
        isOnline: isOnlineAt(row.lastSeenAt, now),
        outdated: isOutdatedTvApp(row.appVersion, latestVersion),
        storage: storageView({ storageFreeBytes, storageTotalBytes, cacheBytes, cacheFiles, storageReportedAt }),
      })),
```

  - `devices.ts`: mesmos cinco campos no select de `getDeviceWithClient`; em `GET /devices/:id`:

```ts
  const { storageFreeBytes, storageTotalBytes, cacheBytes, cacheFiles, storageReportedAt, ...device } = row;
  res.json(
    GetDeviceResponse.parse({
      ...device,
      storage: storageView({ storageFreeBytes, storageTotalBytes, cacheBytes, cacheFiles, storageReportedAt }),
    }),
  );
```

  Outras rotas que usam `getDeviceWithClient` (PATCH etc.) seguem com `GetDeviceResponse.parse(row)`/equivalente — o zod descarta os campos extras; não precisam de `storage`.

- [ ] **Step 5: Run API tests** — arquivos do Step 2 e a suíte da API. Expected: PASS.

- [ ] **Step 6: Write the failing web tests**

`lib/__tests__/bytes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBytes } from "../bytes";

const MB = 1024 * 1024;
const GB = 1024 * MB;

describe("formatBytes", () => {
  it.each([
    [340 * MB, "340 MB"],
    [0, "0 MB"],
    [1.2 * GB, "1,2 GB"],
    [8 * GB, "8 GB"],
    [1023 * MB, "1023 MB"],
  ])("%d → %s", (n, texto) => {
    expect(formatBytes(n)).toBe(texto);
  });
});
```

Em `lib/__tests__/fleet.test.ts` (use o construtor de linha do arquivo, com `storage` novo):

```ts
  it("conta e filtra as TVs com pouco espaço (vitrine fora da conta)", () => {
    // três linhas: uma com storage.low = true, uma com low = false, uma com storage = null;
    // e uma vitrine com low = true.
    // fleetCounts(...).lowStorage === 1
    // filterFleet(..., 'lowStorage') devolve só a TV com low = true (e a vitrine, se o filtro
    // já incluir vitrine nos outros filtros — siga o que 'outdated' faz hoje).
  });

  it("storageLabel monta livre, total e cache", () => {
    expect(storageLabel({ freeBytes: 1.2 * 1024 ** 3, totalBytes: 8 * 1024 ** 3, cacheBytes: 340 * 1024 ** 2, cacheFiles: 3, reportedAt: "2026-10-08T12:00:00Z", low: false }))
      .toBe("1,2 GB livres de 8 GB · cache 340 MB");
  });
```

Escreva o primeiro teste completo com os dados dos comentários. Em `pages/__tests__/fleet.test.tsx`: a linha com leitura mostra "1,2 GB livres de 8 GB · cache 340 MB" e o selo "Pouco espaço" quando `low`; sem leitura mostra "—"; o card `fleet-count-lowStorage` mostra a contagem; o `<select>` tem a opção "Pouco espaço". Em `pages/__tests__/device-detail.test.tsx`: TV com `storage` mostra o texto e "lido há N min"; sem `storage` mostra "Sem leitura de espaço ainda.".

- [ ] **Step 7: Run** — `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/bytes.test.ts src/lib/__tests__/fleet.test.ts src/pages/__tests__/fleet.test.tsx src/pages/__tests__/device-detail.test.tsx`. Expected: FAIL.

- [ ] **Step 8: Implementação web**

`lib/bytes.ts`:

```ts
const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "340 MB", "1,2 GB": o bastante para o admin ver se o box está apertado. */
export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(n / MB)} MB`;
}
```

`lib/fleet.ts`:

```ts
import { formatBytes } from './bytes';

export interface DeviceStorageInfo {
  freeBytes: number;
  totalBytes: number;
  cacheBytes: number;
  cacheFiles: number;
  reportedAt: string;
  low: boolean;
}

// em FleetRow:
  storage: DeviceStorageInfo | null;

export type FleetFilter = 'all' | 'online' | 'offline' | 'outdated' | 'lowStorage';

// em fleetCounts, no objeto devolvido:
    lowStorage: tvs.filter((d) => d.storage?.low).length,

// em filterFleet:
      if (filter === 'lowStorage') return !!d.storage?.low;

export function storageLabel(s: DeviceStorageInfo): string {
  return `${formatBytes(s.freeBytes)} livres de ${formatBytes(s.totalBytes)} · cache ${formatBytes(s.cacheBytes)}`;
}
```

`pages/fleet.tsx`:
  - grade das métricas `md:grid-cols-5` e `<Metric id="lowStorage" icon={HardDrive} label="Pouco espaço" value={counts.lowStorage} />` (ícone `HardDrive` do `lucide-react`);
  - `<option value="lowStorage">Pouco espaço</option>` no filtro;
  - coluna `<th className="pb-2 font-medium">Espaço</th>` depois de "Versão", e a célula:

```tsx
                        <td className="py-3">
                          {d.storage ? (
                            <span className="flex flex-wrap items-center gap-2 tabular-nums text-muted-foreground">
                              {storageLabel(d.storage)}
                              {d.storage.low ? <Badge variant="destructive">Pouco espaço</Badge> : null}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
```

`components/device-storage-info.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';
import { lastSeenLabel, storageLabel, type DeviceStorageInfo } from '@/lib/fleet';

/** Espaço em disco da TV, como o app informou no último feed. */
export function DeviceStorageInfo({ storage, now = new Date() }: { storage: DeviceStorageInfo | null | undefined; now?: Date }) {
  return (
    <div className="space-y-1" data-testid="device-storage">
      <p className="text-sm font-medium">Espaço no aparelho</p>
      {storage ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground tabular-nums">
          {storageLabel(storage)}
          {storage.low ? <Badge variant="destructive">Pouco espaço</Badge> : null}
          <span>· lido {lastSeenLabel(storage.reportedAt, now)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Sem leitura de espaço ainda.</p>
      )}
    </div>
  );
}
```

(O nome do componente coincide com o do tipo; se o lint/TS reclamar, renomeie o tipo importado para `StorageInfo` com `type DeviceStorageInfo as StorageInfo`.)

Em `pages/device-detail.tsx`, logo depois de `<DeviceTickerField ... />` (linha ~589): `<DeviceStorageInfo storage={device.storage} />`.

- [ ] **Step 9: Run** — os testes do Step 7, a suíte web `pnpm --filter @workspace/signage exec vitest run` e `pnpm -w run typecheck`. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/api-spec lib/api-zod lib/api-client-react artifacts/api-server/src/routes artifacts/signage/src
git commit -m "feat(portal): espaço em disco da TV no parque e na página da TV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `tv.html` toca a lista salva sem internet

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts`

**Interfaces:**
- Consumes: `feed.offline` (Task 4) no formato `{ geradoEm, slides: [ ...DisplaySlide, agenda? ] }`.
- Produces (no `tv.html`): `salvarSemInternet(data)`, `lerSemInternet()`, `agendaVale(agenda, agoraMs)`, `filtrarSemInternet(salvo, agoraMs)`, `tocarSemInternet(salvo, isRefresh)`, `aplicarLista(lista, isRefresh, girou)`; chave `signage-offline`.

- [ ] **Step 1: Harness** — em `tv-html.test.ts`, junto das outras variáveis do feed: `let semInternet: unknown = undefined;` (zerar para `undefined` no `beforeEach`), e no `XhrStub` o JSON do `/feed` passa a incluir `offline: semInternet`. Helper:

```ts
const comAgenda = (announcementId: number, imageUrl: string, agenda: Record<string, unknown>) => ({
  ...slide(announcementId, imageUrl),
  campaignId: 5,
  agenda,
});
```

- [ ] **Step 2: Write the failing tests**

```ts
describe("tv.html: sem internet", () => {
  // 2026-10-08 é quinta (getDay 4). 18:00Z = 15:00 em São Paulo.
  const AGORA = new Date("2026-10-08T18:00:00Z");
  const MINUTO = 60000;
  const salvo = () => JSON.parse(window.localStorage.getItem("signage-offline") ?? "null");

  beforeEach(() => {
    vi.setSystemTime(AGORA);
    listaDeSlides = [slide(1, "https://blob/online.png")];
  });

  function caiARede() {
    statusDaLista = 0;
    vi.advanceTimersByTime(MINUTO);
  }

  it("salva a lista do feed", () => {
    semInternet = { geradoEm: AGORA.toISOString(), slides: [slide(9, "https://blob/p.png")] };
    carregarTv();
    expect(salvo().offline.slides[0].announcementId).toBe(9);
  });

  it("servidor antigo (sem offline) não salva nada", () => {
    carregarTv();
    expect(salvo()).toBeNull();
  });

  it("rede caiu: toca a lista salva", () => {
    semInternet = { geradoEm: AGORA.toISOString(), slides: [slide(9, "https://blob/p.png")] };
    carregarTv();
    responder("https://blob/online.png", true);
    caiARede();
    responder("https://blob/p.png", true);
    expect(noAr()).toBe("https://blob/p.png");
  });

  it("liga sem internet com lista salva: já começa tocando", () => {
    window.localStorage.setItem(
      "signage-offline",
      JSON.stringify({ screen: { orientation: "landscape" }, ticker: null, offline: { geradoEm: AGORA.toISOString(), slides: [slide(9, "https://blob/p.png")] } }),
    );
    statusDaLista = 0;
    carregarTv();
    responder("https://blob/p.png", true);
    expect(noAr()).toBe("https://blob/p.png");
    expect(document.getElementById("empty-screen")!.className).not.toContain("visible");
  });

  it("campanha fora da faixa, do dia ou da data some; dentro toca", () => {
    semInternet = {
      geradoEm: AGORA.toISOString(),
      slides: [
        comAgenda(10, "https://blob/noite.png", { inicio: "2026-10-01T03:00:00Z", fim: "2026-10-31T03:00:00Z", dias: [], faixas: [{ start: 1080, end: 1320 }] }),
        comAgenda(11, "https://blob/sabado.png", { inicio: "2026-10-01T03:00:00Z", fim: "2026-10-31T03:00:00Z", dias: [6], faixas: [] }),
        comAgenda(12, "https://blob/vencida.png", { inicio: "2026-09-01T03:00:00Z", fim: "2026-10-08T17:00:00Z", dias: [], faixas: [] }),
        comAgenda(13, "https://blob/futura.png", { inicio: "2026-10-09T03:00:00Z", fim: "2026-10-31T03:00:00Z", dias: [], faixas: [] }),
        comAgenda(14, "https://blob/agora.png", { inicio: "2026-10-01T03:00:00Z", fim: "2026-10-31T03:00:00Z", dias: [4], faixas: [{ start: 840, end: 960 }] }),
      ],
    };
    carregarTv();
    responder("https://blob/online.png", true);
    caiARede();
    responder("https://blob/agora.png", true);
    expect(noAr()).toBe("https://blob/agora.png");
    const pedidas = imagens.map((i) => i.src);
    for (const fora of ["noite", "sabado", "vencida", "futura"]) {
      expect(pedidas.some((u) => u.indexOf(fora) !== -1)).toBe(false);
    }
  });

  it("fim da faixa não conta (15:00 numa faixa 14:00–15:00 está fora)", () => {
    semInternet = {
      geradoEm: AGORA.toISOString(),
      slides: [
        comAgenda(10, "https://blob/ate15.png", { inicio: "2026-10-01T03:00:00Z", fim: "2026-10-31T03:00:00Z", dias: [], faixas: [{ start: 840, end: 900 }] }),
        slide(9, "https://blob/p.png"),
      ],
    };
    carregarTv();
    responder("https://blob/online.png", true);
    caiARede();
    responder("https://blob/p.png", true);
    expect(imagens.some((i) => i.src.indexOf("ate15") !== -1)).toBe(false);
  });

  it("entra no horário enquanto está sem internet (refiltra a cada minuto)", () => {
    vi.setSystemTime(new Date("2026-10-08T20:59:00Z")); // 17:59 SP
    semInternet = {
      geradoEm: "2026-10-08T20:59:00Z",
      slides: [
        slide(9, "https://blob/p.png"),
        comAgenda(10, "https://blob/noite.png", { inicio: "2026-10-01T03:00:00Z", fim: "2026-10-31T03:00:00Z", dias: [], faixas: [{ start: 1080, end: 1320 }] }),
      ],
    };
    carregarTv();
    responder("https://blob/online.png", true);
    caiARede(); // 18:00 SP
    vi.advanceTimersByTime(MINUTO);
    expect(imagens.some((i) => i.src.indexOf("noite") !== -1)).toBe(true);
  });

  it("relógio antes da lista salva (box sem RTC): só o que não tem agenda", () => {
    semInternet = {
      geradoEm: AGORA.toISOString(),
      slides: [
        comAgenda(10, "https://blob/paga.png", { inicio: "1970-01-01T00:00:00Z", fim: "2099-01-01T00:00:00Z", dias: [], faixas: [] }),
        slide(9, "https://blob/p.png"),
      ],
    };
    carregarTv();
    responder("https://blob/online.png", true);
    vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    caiARede();
    responder("https://blob/p.png", true);
    expect(noAr()).toBe("https://blob/p.png");
    expect(imagens.some((i) => i.src.indexOf("paga") !== -1)).toBe(false);
  });

  it("aviso no ar: só o aviso; aviso vencido: volta a programação", () => {
    semInternet = {
      geradoEm: AGORA.toISOString(),
      slides: [comAgenda(50, "https://blob/aviso.png", { fim: "2026-10-08T18:30:00Z" }), slide(9, "https://blob/p.png")],
    };
    carregarTv();
    responder("https://blob/online.png", true);
    caiARede();
    responder("https://blob/aviso.png", true);
    expect(noAr()).toBe("https://blob/aviso.png");
    expect(imagens.some((i) => i.src.indexOf("/p.png") !== -1)).toBe(false);

    vi.setSystemTime(new Date("2026-10-08T18:31:00Z"));
    vi.advanceTimersByTime(MINUTO);
    responder("https://blob/p.png", true);
    expect(noAr()).toBe("https://blob/p.png");
  });

  it("lista filtrada vazia: tela de vazio", () => {
    semInternet = {
      geradoEm: AGORA.toISOString(),
      slides: [comAgenda(12, "https://blob/vencida.png", { inicio: "2026-09-01T03:00:00Z", fim: "2026-10-01T03:00:00Z", dias: [], faixas: [] })],
    };
    carregarTv();
    responder("https://blob/online.png", true);
    caiARede();
    expect(document.getElementById("empty-screen")!.className).toContain("visible");
  });

  it("feed voltou: segue a lista do servidor", () => {
    semInternet = { geradoEm: AGORA.toISOString(), slides: [slide(9, "https://blob/p.png")] };
    carregarTv();
    responder("https://blob/online.png", true);
    caiARede();
    responder("https://blob/p.png", true);
    statusDaLista = 200;
    listaDeSlides = [slide(2, "https://blob/novo.png")];
    vi.advanceTimersByTime(MINUTO);
    responder("https://blob/novo.png", true);
    expect(noAr()).toBe("https://blob/novo.png");
  });

  it("lista salva corrompida: segue como hoje, sem quebrar", () => {
    window.localStorage.setItem("signage-offline", "{quebrado");
    statusDaLista = 0;
    expect(() => carregarTv()).not.toThrow();
    expect(document.getElementById("empty-screen")!.className).toContain("visible");
  });

  it("localStorage cheio não interrompe o rodízio", () => {
    window.localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    semInternet = { geradoEm: AGORA.toISOString(), slides: [slide(9, "https://blob/p.png")] };
    carregarTv();
    responder("https://blob/online.png", true);
    expect(noAr()).toBe("https://blob/online.png");
  });

  it("aplica a faixa e a orientação salvas e para a música", () => {
    window.localStorage.setItem(
      "signage-offline",
      JSON.stringify({ screen: { orientation: "portrait_right" }, ticker: { text: "Pão às 17h" }, offline: { geradoEm: AGORA.toISOString(), slides: [slide(9, "https://blob/p.png")] } }),
    );
    statusDaLista = 0;
    carregarTv();
    expect(document.getElementById("ticker-text")!.textContent).toBe("Pão às 17h");
    expect(document.getElementById("stage")!.className).toContain("com-faixa");
  });
});
```

Se a orientação retrato muda a classe do palco de um jeito que o teste vizinho de faixa já conhece (ver "TV em pé: a faixa continua depois do refresh"), confira com o mesmo seletor que ele usa.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/tv-html.test.ts -t "sem internet"`
Expected: FAIL.

- [ ] **Step 4: Implementação em `tv.html`** — ES5. Antes de `function fetchAndStart`:

```js
      // ─── Sem internet ───────────────────────────────────────────────────
      // O feed traz `offline`: a volta dos próximos 7 dias com a agenda de
      // cada campanha. Guardada no localStorage, é o que a TV toca quando o
      // feed falha — inclusive ligando sem rede (o app serve esta página do
      // disco). A agenda é conferida aqui porque, sem rede, ninguém mais diz
      // que a campanha acabou ou saiu do horário.
      var OFFLINE_KEY = 'signage-offline';
      // São Paulo sem Intl (WebView antiga não tem fuso): UTC−3 fixo. O
      // Brasil está sem horário de verão desde 2019; se voltar, esta conta e
      // a do servidor (ad-eligibility.ts) mudam juntas.
      var FUSO_SP_MS = 3 * 60 * 60 * 1000;

      function salvarSemInternet(data) {
        if (!data || !data.offline || !data.offline.slides) { return; }
        try {
          window.localStorage.setItem(OFFLINE_KEY, JSON.stringify({
            screen: data.screen,
            ticker: data.ticker,
            offline: data.offline
          }));
        } catch (e) {} // cheio ou bloqueado: a TV segue online como antes
      }

      function lerSemInternet() {
        try {
          var bruto = window.localStorage.getItem(OFFLINE_KEY);
          var salvo = bruto ? JSON.parse(bruto) : null;
          return salvo && salvo.offline && salvo.offline.slides ? salvo : null;
        } catch (e) { return null; }
      }

      // Mesma regra do servidor: início e fim da campanha valem (fim
      // inclusive), dia em `dias` (vazio = todos), minuto do dia dentro de
      // alguma faixa [start, end) (vazio = dia todo).
      function agendaVale(agenda, agoraMs) {
        if (!agenda) { return true; }
        if (!(agoraMs <= Date.parse(agenda.fim))) { return false; }
        if (agenda.inicio && !(Date.parse(agenda.inicio) <= agoraMs)) { return false; }
        var sp = new Date(agoraMs - FUSO_SP_MS);
        var dias = agenda.dias || [];
        if (dias.length && dias.indexOf(sp.getUTCDay()) === -1) { return false; }
        var faixas = agenda.faixas || [];
        if (!faixas.length) { return true; }
        var minuto = sp.getUTCHours() * 60 + sp.getUTCMinutes();
        for (var i = 0; i < faixas.length; i++) {
          if (minuto >= faixas[i].start && minuto < faixas[i].end) { return true; }
        }
        return false;
      }

      function filtrarSemInternet(salvo, agoraMs) {
        var todos = salvo.offline.slides;
        // Box sem bateria no relógio volta para 1970/2000 quando reinicia sem
        // rede. Relógio antes do momento em que a lista foi salva não é
        // confiável: só toca o que não é pago (sem agenda).
        var relogioOk = !(agoraMs < Date.parse(salvo.offline.geradoEm));
        var avisos = [];
        var resto = [];
        for (var i = 0; i < todos.length; i++) {
          var s = todos[i];
          if (!relogioOk) {
            if (!s.agenda) { resto.push(s); }
            continue;
          }
          if (!agendaVale(s.agenda, agoraMs)) { continue; }
          // Aviso urgente é o único com agenda sem início (só `fim`).
          if (s.agenda && !s.agenda.inicio) { avisos.push(s); } else { resto.push(s); }
        }
        // Aviso no ar toma a tela inteira, como online.
        return avisos.length ? avisos : resto;
      }

      function tocarSemInternet(salvo, isRefresh) {
        hidePairing();
        // Música é YouTube: sem rede não toca.
        aplicarMusica(null);
        var girou = applyOrientation(salvo.screen && salvo.screen.orientation);
        aplicarFaixa(salvo.ticker);
        aplicarLista(filtrarSemInternet(salvo, Date.now()), isRefresh, girou);
      }
```

Extraia o final do callback de `fetchAndStart` (do comentário "Lista vazia é resposta boa do servidor" até o `startTimer()`) para:

```js
      // Põe uma lista no ar: a do servidor ou a salva para tocar sem internet.
      // Na atualização, só reinicia se a lista (ou o giro) mudou.
      function aplicarLista(lista, isRefresh, girou) {
        // Lista vazia é resposta boa, não falha: a TV tem de parar. Antes isso
        // caía no mesmo return do erro e a campanha seguia em loop para
        // sempre depois de sair do ar.
        if (lista.length === 0) {
          showEmpty();
          return;
        }
        emptyEl.className = '';
        var changed = girou || lista.length !== slides.length;
        if (!changed) {
          for (var i = 0; i < lista.length; i++) {
            if (lista[i].announcementId !== slides[i].announcementId) { changed = true; break; }
          }
        }
        slides = lista;
        // Lista nova: as artes que falharam podem ter sido substituídas.
        if (changed) { falhasDeArte = 0; }
        if (!isRefresh || changed) {
          if (timer) { clearInterval(timer); timer = null; }
          currentIndex = 0;
          showSlide(slides[0]);
          startTimer();
        }
      }
```

E o callback de `fetchAndStart` vira:

```js
          var lista = data && data.slides;
          if (err || !lista) {
            // Rede caiu, ou outro erro/404 sem ser o do device: com lista
            // salva, toca ela (filtrada pela agenda). Sem lista salva, segura
            // o que já está no ar; na primeira carga, tela de vazio.
            var salvo = lerSemInternet();
            if (salvo) {
              tocarSemInternet(salvo, isRefresh);
              return;
            }
            if (!isRefresh) { emptyEl.className = 'visible'; }
            return;
          }
          hidePairing();
          salvarSemInternet(data);

          // Antes do teste de lista vazia: a música vale mesmo sem peças.
          aplicarMusica(data.music);
          // Também antes do teste de lista vazia: TV sem peças se atualiza igual.
          avisarAtualizacao(data.appUpdate);

          var girou = applyOrientation(data.screen && data.screen.orientation);
          // Depois do giro: applyOrientation reescreve a classe do palco.
          aplicarFaixa(data.ticker);

          aplicarLista(lista, isRefresh, girou);
```

(Mantenha os comentários originais que ainda fazem sentido; não mexa no tratamento do 404 do device acima.)

- [ ] **Step 5: Run** — arquivo inteiro: `pnpm --filter @workspace/signage exec vitest run src/__tests__/tv-html.test.ts`. Expected: PASS (todos os testes antigos também).

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): toca a lista salva quando a internet cai" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `tv.html` pede as mídias ao app e manda o espaço em disco

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts`

**Interfaces:**
- Consumes: `window.SignageCache.baixar(json: string)` e `window.SignageCache.estado(): string` (JSON `{livre,total,cache,arquivos}`) — implementados na Task 9.
- Produces: `pedirDownloads(offline)`, `cabecalhoDeEspaco()`; `xhrGet(url, cb, cabecalhos)` com terceiro argumento opcional `{ nome: valor }`.

- [ ] **Step 1: Harness** — no `XhrStub`, guarde os cabeçalhos: `cabecalhosDoGet: Array<Record<string, string>> = []` (global do arquivo, zerado no `beforeEach`), um objeto por instância preenchido em `setRequestHeader(nome, valor)` e empurrado em `send` quando é GET.

- [ ] **Step 2: Write the failing tests**

```ts
describe("tv.html: ponte de cache do app", () => {
  let baixados: string[][] = [];
  let estado = '{"livre":1000,"total":8000,"cache":300,"arquivos":12}';

  beforeEach(() => {
    baixados = [];
    estado = '{"livre":1000,"total":8000,"cache":300,"arquivos":12}';
    vi.stubGlobal("SignageCache", {
      baixar: (json: string) => { baixados.push(JSON.parse(json)); },
      estado: () => estado,
    });
    listaDeSlides = [slide(1, "https://blob/a.png")];
  });

  it("pede ao app as imagens e os QR da lista sem internet", () => {
    semInternet = {
      geradoEm: "2026-10-08T18:00:00Z",
      slides: [
        { ...slide(9, "https://x.public.blob.vercel-storage.com/p.png"), qrImageUrl: "/api/qr/abc.png" },
        slide(10, "https://x.public.blob.vercel-storage.com/q.png"),
      ],
    };
    carregarTv();
    expect(baixados).toHaveLength(1);
    expect(baixados[0]).toEqual([
      "https://x.public.blob.vercel-storage.com/p.png",
      `${window.location.origin}/api/qr/abc.png`,
      "https://x.public.blob.vercel-storage.com/q.png",
    ]);
  });

  it("feed sem offline não pede nada", () => {
    carregarTv();
    expect(baixados).toHaveLength(0);
  });

  it("manda o espaço em disco no cabeçalho do feed", () => {
    carregarTv();
    expect(cabecalhosDoGet[0]!["X-Signage-Storage"]).toBe("livre=1000;total=8000;cache=300;arquivos=12");
  });

  it("estado inválido: sem cabeçalho e sem quebrar", () => {
    estado = "lixo";
    carregarTv();
    expect(cabecalhosDoGet[0]).not.toHaveProperty("X-Signage-Storage");
    responder("https://blob/a.png", true);
    expect(noAr()).toBe("https://blob/a.png");
  });

  it("ponte que lança não interrompe o rodízio", () => {
    vi.stubGlobal("SignageCache", {
      baixar: () => { throw new Error("x"); },
      estado: () => { throw new Error("x"); },
    });
    semInternet = { geradoEm: "2026-10-08T18:00:00Z", slides: [slide(9, "https://blob/p.png")] };
    carregarTv();
    responder("https://blob/a.png", true);
    expect(noAr()).toBe("https://blob/a.png");
  });

  it("sem a ponte (navegador, APK antigo): sem cabeçalho", () => {
    vi.stubGlobal("SignageCache", undefined);
    carregarTv();
    expect(cabecalhosDoGet[0]).not.toHaveProperty("X-Signage-Storage");
  });
});
```

- [ ] **Step 3: Run to verify they fail** — `pnpm --filter @workspace/signage exec vitest run src/__tests__/tv-html.test.ts -t "ponte de cache"`. Expected: FAIL.

- [ ] **Step 4: Implementação** — `xhrGet(url, cb, cabecalhos)`: depois do `xhr.open`, 

```js
        if (cabecalhos) {
          for (var nome in cabecalhos) {
            if (cabecalhos.hasOwnProperty(nome)) { xhr.setRequestHeader(nome, cabecalhos[nome]); }
          }
        }
```

Junto das funções de "Sem internet":

```js
      // O app (window.SignageCache) baixa para o disco tudo que a lista sem
      // internet pode tocar — inclusive a campanha das 18h às 15h, que ainda
      // nunca apareceu na tela. Navegador e APK antigo não têm a ponte.
      function pedirDownloads(offline) {
        var ponte = window.SignageCache;
        if (!offline || !offline.slides || !ponte || typeof ponte.baixar !== 'function') { return; }
        var urls = [];
        for (var i = 0; i < offline.slides.length; i++) {
          var s = offline.slides[i];
          if (s.imageUrl) { urls.push(imgUrl(s.imageUrl)); }
          if (s.qrImageUrl) { urls.push(apiBase() + s.qrImageUrl); }
        }
        try { ponte.baixar(JSON.stringify(urls)); } catch (e) {}
      }

      // Espaço em disco do box, lido pelo app, vai para o parque de TVs.
      function cabecalhoDeEspaco() {
        var ponte = window.SignageCache;
        if (!ponte || typeof ponte.estado !== 'function') { return null; }
        try {
          var e = JSON.parse(ponte.estado());
          var campos = [e.livre, e.total, e.cache, e.arquivos];
          for (var i = 0; i < campos.length; i++) {
            if (typeof campos[i] !== 'number') { return null; }
          }
          return 'livre=' + e.livre + ';total=' + e.total + ';cache=' + e.cache + ';arquivos=' + e.arquivos;
        } catch (err) { return null; }
      }
```

Em `fetchAndStart`: 

```js
        var espaco = cabecalhoDeEspaco();
        xhrGet(url, function (err, data, status, body) { ... }, espaco ? { 'X-Signage-Storage': espaco } : null);
```

e, logo depois de `salvarSemInternet(data);`, `pedirDownloads(data.offline);`.

- [ ] **Step 5: Run** — arquivo inteiro `tv-html.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): pede as artes ao app e informa o espaço em disco" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `ArteCache` com QR, reserva de 500 MB e lista atual

**Files:**
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/ArteCache.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/ArteCacheTest.kt`

**Interfaces:**
- Produces:
  - construtor `ArteCache(dir: File, limiteBytes: Long = LIMITE_PADRAO_BYTES, allowCleartext: Boolean = BuildConfig.DEBUG, ehArte: (String) -> Boolean = ::ehArteAceita, livre: () -> Long = { espacoLivre(dir) }, total: () -> Long = { espacoTotal(dir) })`
  - `fun aceita(url: String): Boolean`
  - `fun baixarAntes(url: String): Boolean` — garante a arte no disco (baixa se faltar); `true` se ficou no disco.
  - `fun manterLista(urls: Collection<String>)` — define a lista atual (prioridade na limpeza).
  - `data class Estado(val livre: Long, val total: Long, val cache: Long, val arquivos: Int)` e `fun estado(): Estado`
  - companion: `LIMITE_PADRAO_BYTES = 1024L * 1024 * 1024`, `RESERVA_BYTES = 500L * 1024 * 1024`, `fun ehArteAceita(url: String, tvUrl: String = BuildConfig.TV_URL): Boolean`, `fun ehQrDaTv(url: String, tvUrl: String = BuildConfig.TV_URL): Boolean`

- [ ] **Step 1: Write the failing tests** — em `ArteCacheTest.kt` (o `cache(...)` do arquivo ganha parâmetro `livre: () -> Long = { 10L * 1024 * 1024 * 1024 }` repassado ao construtor):

```kotlin
    @Test
    fun `qr da origem da tv entra, outro caminho da origem nao`() {
        val tv = "https://smart-tv-ads.vercel.app/tv"
        assertTrue(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/qr/abc_12-X.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/qr/pair/abc.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/uploads/a.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://outro.app/api/qr/abc.png", tv))
        assertFalse(ArteCache.ehQrDaTv("https://smart-tv-ads.vercel.app/api/qr/abc.png?r=1", tv))
        assertTrue(ArteCache.ehArteAceita("https://smart-tv-ads.vercel.app/api/qr/abc.png", tv))
        assertTrue(ArteCache.ehArteAceita("https://ab12.public.blob.vercel-storage.com/announcements/x.png", tv))
    }

    @Test
    fun `nao baixa se sobrariam menos de 500 MB livres`() {
        server.put("a.png", ByteArray(10))
        val c = cache(livre = { ArteCache.RESERVA_BYTES + 5 })
        assertNull(c.resposta(url("a.png")))
        assertFalse(c.baixarAntes(url("a.png")))
        assertTrue(dir.listFiles().orEmpty().none { it.isFile && !it.name.endsWith(".part") })
    }

    @Test
    fun `disco apertado libera o que saiu da lista antes de desistir`() {
        // Disco realista: o livre cai conforme o cache cresce.
        val base = ArteCache.RESERVA_BYTES + 130
        server.put("a.png", ByteArray(60))
        server.put("b.png", ByteArray(60))
        server.put("c.png", ByteArray(60))
        val c = cache(limite = 1_000_000, livre = { base - tamanhoDoCache() })
        assertTrue(c.baixarAntes(url("a.png")))
        Thread.sleep(10)
        assertTrue(c.baixarAntes(url("b.png")))
        // Sobram 10 bytes acima da reserva: "c" só cabe se "a" (fora da lista) sair.
        c.manterLista(listOf(url("b.png"), url("c.png")))
        assertTrue(c.baixarAntes(url("c.png")))
        server.pedidos.clear()
        c.resposta(url("b.png"))
        assertTrue("b ficou", server.pedidos.isEmpty())
        assertEquals(2, dir.listFiles().orEmpty().count { it.isFile && !it.name.endsWith(".part") })
    }

    @Test
    fun `disco apertado e tudo na lista atual: nao baixa`() {
        val base = ArteCache.RESERVA_BYTES + 70
        server.put("a.png", ByteArray(60))
        server.put("b.png", ByteArray(60))
        val c = cache(limite = 1_000_000, livre = { base - tamanhoDoCache() })
        c.manterLista(listOf(url("a.png"), url("b.png")))
        assertTrue(c.baixarAntes(url("a.png")))
        assertFalse(c.baixarAntes(url("b.png")))
        server.pedidos.clear()
        c.resposta(url("a.png"))
        assertTrue("a ficou", server.pedidos.isEmpty())
    }

    private fun tamanhoDoCache(): Long =
        dir.listFiles().orEmpty().filter { it.isFile && !it.name.endsWith(".part") }.sumOf { it.length() }

    @Test
    fun `limpeza tira primeiro o que saiu da lista atual`() {
        server.put("a.png", ByteArray(40))
        server.put("b.png", ByteArray(40))
        server.put("c.png", ByteArray(40))
        val c = cache(limite = 100)
        c.baixarAntes(url("a.png"))
        Thread.sleep(10)
        c.baixarAntes(url("b.png"))
        // "a" é a mais antiga, mas está na lista; "b" saiu.
        c.manterLista(listOf(url("a.png"), url("c.png")))
        Thread.sleep(10)
        c.baixarAntes(url("c.png"))
        server.pedidos.clear()
        assertNotNull(c.resposta(url("a.png")))
        assertTrue("a ficou no disco", server.pedidos.isEmpty())
        c.resposta(url("b.png"))
        assertEquals("b saiu e foi baixada de novo", listOf("/real/b.png"), server.pedidos.toList())
    }

    @Test
    fun `baixarAntes nao repete download do que ja tem`() {
        server.put("a.png", ByteArray(5))
        val c = cache()
        assertTrue(c.baixarAntes(url("a.png")))
        assertTrue(c.baixarAntes(url("a.png")))
        assertEquals(listOf("/real/a.png"), server.pedidos.toList())
    }

    @Test
    fun `estado soma o cache e le o disco`() {
        server.put("a.png", ByteArray(30))
        server.put("b.png", ByteArray(20))
        val c = ArteCache(dir, 1_000_000, true, { it.startsWith("http://127.0.0.1:${server.port}/real/") }, { 7_000L }, { 9_000L })
        c.baixarAntes(url("a.png"))
        c.baixarAntes(url("b.png"))
        assertEquals(ArteCache.Estado(livre = 7_000L, total = 9_000L, cache = 50L, arquivos = 2), c.estado())
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd artifacts/android-tv && ./gradlew testDebugUnitTest --tests 'com.smarttvads.signage.ArteCacheTest'`
Expected: FAIL (compilação: `ehQrDaTv`, `baixarAntes`, `manterLista`, `estado`, parâmetro `livre` ausentes).

- [ ] **Step 3: Implementação** — mudanças em `ArteCache.kt`:
  - KDoc da classe: acrescente um parágrafo — "Também guarda o QR das campanhas (`/api/qr/<código>.png` da origem da TV, resposta `immutable`) e recebe da página, pela ponte `SignageCache`, a lista do que baixar antes (prefetch), para a TV tocar sem internet. Nunca deixa o disco com menos de [RESERVA_BYTES] livres: box/stick cheio trava."
  - Construtor com `livre` e `total` (padrões `{ espacoLivre(dir) }`, `{ espacoTotal(dir) }`) e `ehArte = ::ehArteAceita`.
  - Estado da lista:

```kotlin
    // Nomes em disco (sha) da última lista que a página mandou baixar. Na
    // limpeza, o que saiu dela vai primeiro.
    @Volatile private var naLista: Set<String> = emptySet()

    fun aceita(url: String): Boolean = ehArte(url) && mimeDaExtensao(url) != null

    fun manterLista(urls: Collection<String>) {
        naLista = urls.filter(::aceita).map(::nomeDoArquivo).toSet()
    }

    fun baixarAntes(url: String): Boolean = aceita(url) && abrir(url) != null

    data class Estado(val livre: Long, val total: Long, val cache: Long, val arquivos: Int)

    fun estado(): Estado {
        val artes = artesEmDisco()
        return Estado(livre = livre(), total = total(), cache = artes.sumOf { it.length() }, arquivos = artes.size)
    }

    private fun artesEmDisco(): List<File> =
        dir.listFiles { f -> f.isFile && !f.name.endsWith(".part") }?.toList() ?: emptyList()
```

  - `resposta`: troque `if (!ehArte(url)) return null` + `mimeDaExtensao` por `if (!aceita(url)) return null; val mime = mimeDaExtensao(url)!!`.
  - Reserva de disco (é a forma prática do teto `min(1 GB, livre + cache − 500 MB)` da spec: o cache só cresce enquanto sobra a reserva, e abre espaço apagando antes de desistir):

```kotlin
    /**
     * Garante `precisa` bytes acima da reserva, apagando arte do cache: primeiro
     * o que saiu da lista atual, depois o usado há mais tempo, nunca o que está
     * na lista atual nem `manter`. Box/stick cheio trava — nessa hora a arte
     * fica na rede, como antes do cache.
     */
    private fun liberarPara(precisa: Long, manter: File? = null): Boolean {
        if (livre() - precisa >= RESERVA_BYTES) return true
        val candidatas = artesEmDisco()
            .filter { it != manter && it.name !in naLista }
            .sortedBy { it.lastModified() }
        for (f in candidatas) {
            f.delete()
            if (livre() - precisa >= RESERVA_BYTES) return true
        }
        return false
    }
```

  - `baixar(url, alvo)`: antes de abrir conexão, `if (!liberarPara(0)) return null`; depois do `responseCode == 200`, `val tamanho = conn.contentLengthLong.coerceAtLeast(0); if (!liberarPara(tamanho)) return null`.
  - `respeitarLimite(manter)` continua cuidando só de `limiteBytes`, mas na ordem nova (fora da lista primeiro):

```kotlin
    /** Passou do limite: sai primeiro o que não está na lista atual, depois o usado há mais tempo (a recém-baixada fica). */
    private fun respeitarLimite(manter: File) {
        val artes = artesEmDisco()
        var total = artes.sumOf { it.length() }
        val ordem = artes.sortedWith(compareBy<File>({ it.name in naLista }, { it.lastModified() }))
        for (f in ordem) {
            if (total <= limiteBytes) break
            if (f == manter) continue
            val tamanho = f.length()
            if (f.delete()) total -= tamanho
        }
    }
```

  - companion:

```kotlin
        /** Teto do cache num box de 8 GB; encolhe sozinho quando o disco aperta. */
        const val LIMITE_PADRAO_BYTES = 1024L * 1024 * 1024
        /** Espaço que o cache nunca ocupa: abaixo disso o Android do box trava. */
        const val RESERVA_BYTES = 500L * 1024 * 1024

        /** Artes do Blob ou QR das campanhas servido pela origem da TV. */
        fun ehArteAceita(url: String, tvUrl: String = BuildConfig.TV_URL): Boolean =
            ehArteDoBlob(url) || ehQrDaTv(url, tvUrl)

        /** `<origem do TV_URL>/api/qr/<código>.png`, sem query (o QR de pareamento fica de fora). */
        fun ehQrDaTv(url: String, tvUrl: String = BuildConfig.TV_URL): Boolean {
            val origem = Regex("""^(https?://[^/]+)""").find(tvUrl)?.groupValues?.get(1) ?: return false
            return Regex("^" + Regex.escape(origem) + """/api/qr/[A-Za-z0-9_-]+\.png$""").matches(url)
        }

        fun espacoLivre(dir: File): Long = existente(dir).usableSpace
        fun espacoTotal(dir: File): Long = existente(dir).totalSpace

        // O diretório do cache só existe depois do primeiro download.
        private fun existente(dir: File): File = generateSequence(dir) { it.parentFile }.first { it.exists() }
```

  `nomeDoArquivo` e `mimeDaExtensao` passam a ser usados fora do companion; deixe-os `private` no companion (o Kotlin dá acesso à classe).

- [ ] **Step 4: Run** — o comando do Step 2, e depois `./gradlew testDebugUnitTest` inteiro. Expected: PASS. Os testes antigos de limite (`passou do limite apaga a arte usada ha mais tempo`) devem seguir passando com o `livre` padrão do helper (10 GB).

- [ ] **Step 5: Commit**

```bash
git add artifacts/android-tv/app/src
git commit -m "feat(android-tv): cache guarda QR e nunca deixa menos de 500 MB livres" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ponte `SignageCache` (prefetch e estado do disco)

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/CachePelaPagina.kt`
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/CachePelaPaginaTest.kt`, `MainActivityTest.kt`

**Interfaces:**
- Consumes: `ArteCache.aceita/baixarAntes/manterLista/estado` (Task 8).
- Produces: `class CachePelaPagina(cache: ArteCache, executor: Executor = Executors.newSingleThreadExecutor())` com `@JavascriptInterface fun baixar(json: String)` e `@JavascriptInterface fun estado(): String`; `CachePelaPagina.NOME_NA_PAGINA = "SignageCache"`.

- [ ] **Step 1: Write the failing tests** — `CachePelaPaginaTest.kt`:

```kotlin
package com.smarttvads.signage

import java.io.File
import java.util.concurrent.Executor
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * O tv.html chama `window.SignageCache.baixar(json)` a cada feed com as artes
 * da lista sem internet, e `estado()` para mandar o espaço em disco ao
 * servidor. Executor manual: o teste decide quando a fila anda.
 */
@RunWith(RobolectricTestRunner::class)
class CachePelaPaginaTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: TestHttpServer
    private lateinit var cache: ArteCache
    private val tarefas = ArrayDeque<Runnable>()
    private val manual = Executor { tarefas.addLast(it) }

    private fun url(nome: String) = "http://127.0.0.1:${server.port}/real/$nome"
    private fun rodarFila() { while (tarefas.isNotEmpty()) tarefas.removeFirst().run() }

    @Before
    fun sobe() {
        server = TestHttpServer()
        cache = ArteCache(File(tmp.root, "artes"), 1_000_000, true, { it.startsWith("http://127.0.0.1:${server.port}/real/") }, { 10L shl 30 }, { 20L shl 30 })
    }

    @After
    fun desce() { server.close() }

    @Test
    fun `nome na pagina`() {
        assertEquals("SignageCache", CachePelaPagina.NOME_NA_PAGINA)
    }

    @Test
    fun `baixa a lista em segundo plano e pula o que nao e arte`() {
        server.put("a.png", ByteArray(3))
        server.put("b.png", ByteArray(3))
        val ponte = CachePelaPagina(cache, manual)
        ponte.baixar("""["${url("a.png")}","https://evil.example/x.png","${url("b.png")}"]""")
        assertTrue(server.pedidos.isEmpty())
        rodarFila()
        assertEquals(listOf("/real/a.png", "/real/b.png"), server.pedidos.toList())
    }

    @Test
    fun `lista nova troca a fila pendente`() {
        server.put("a.png", ByteArray(3))
        server.put("b.png", ByteArray(3))
        server.put("c.png", ByteArray(3))
        val ponte = CachePelaPagina(cache, manual)
        ponte.baixar("""["${url("a.png")}","${url("b.png")}"]""")
        ponte.baixar("""["${url("c.png")}"]""")
        rodarFila()
        assertEquals(listOf("/real/c.png"), server.pedidos.toList())
    }

    @Test
    fun `json invalido e ignorado`() {
        val ponte = CachePelaPagina(cache, manual)
        ponte.baixar("lixo")
        rodarFila()
        assertTrue(server.pedidos.isEmpty())
    }

    @Test
    fun `estado no formato que o tv html le`() {
        server.put("a.png", ByteArray(7))
        cache.baixarAntes(url("a.png"))
        val e = JSONObject(CachePelaPagina(cache, manual).estado())
        assertEquals(10L shl 30, e.getLong("livre"))
        assertEquals(20L shl 30, e.getLong("total"))
        assertEquals(7L, e.getLong("cache"))
        assertEquals(1, e.getInt("arquivos"))
    }
}
```

Em `MainActivityTest.kt`, no estilo do teste que já pega `"SignageNative"` (linha ~144):

```kotlin
    @Test
    fun `pagina ganha a ponte SignageCache`() {
        // monte a Activity como os testes vizinhos e:
        assertTrue(shadowOf(a.webView!!).getJavascriptInterface("SignageCache") is CachePelaPagina)
    }
```

- [ ] **Step 2: Run to verify they fail** — `cd artifacts/android-tv && ./gradlew testDebugUnitTest --tests 'com.smarttvads.signage.CachePelaPaginaTest' --tests 'com.smarttvads.signage.MainActivityTest'`. Expected: FAIL (classe ausente).

- [ ] **Step 3: `CachePelaPagina.kt`**

```kotlin
package com.smarttvads.signage

import android.webkit.JavascriptInterface
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray
import org.json.JSONObject

/**
 * Ponte `window.SignageCache`. A cada feed o tv.html manda a lista de artes e
 * QR que a TV pode tocar sem internet (`baixar`); o app baixa para o disco,
 * uma de cada vez, numa thread própria. Também informa o espaço em disco
 * (`estado`), que a página manda ao servidor para o parque de TVs.
 *
 * Exposta a todo frame, como a SignageUpdate: o ArteCache só aceita arte do
 * nosso Blob e QR da nossa origem, então o pior caso de um iframe chamar
 * `baixar` é baixar arte nossa.
 */
class CachePelaPagina(
    private val cache: ArteCache,
    private val executor: Executor = Executors.newSingleThreadExecutor(),
) {
    // Cada lista nova vira uma geração; a tarefa de uma lista velha para no
    // próximo item. Assim a fila pendente é sempre a da última lista.
    private val geracao = AtomicInteger(0)

    @JavascriptInterface
    fun baixar(json: String) {
        val urls = try {
            val arr = JSONArray(json)
            (0 until arr.length()).mapNotNull { arr.optString(it, null) }.filter(cache::aceita)
        } catch (e: Exception) {
            return
        }
        cache.manterLista(urls)
        val minha = geracao.incrementAndGet()
        executor.execute {
            for (url in urls) {
                if (geracao.get() != minha) return@execute
                cache.baixarAntes(url)
            }
        }
    }

    @JavascriptInterface
    fun estado(): String {
        val e = cache.estado()
        return JSONObject()
            .put("livre", e.livre)
            .put("total", e.total)
            .put("cache", e.cache)
            .put("arquivos", e.arquivos)
            .toString()
    }

    companion object {
        /** Nome que o tv.html procura em `window`. */
        const val NOME_NA_PAGINA = "SignageCache"
    }
}
```

- [ ] **Step 4: `MainActivity.kt`** — um `ArteCache` só, compartilhado entre a WebViewClient e a ponte:

```kotlin
    // Um cache só para a WebView (servir) e para a ponte (baixar antes).
    private lateinit var artes: ArteCache
    private lateinit var cachePelaPagina: CachePelaPagina
```

Em `onCreate`, junto de `musica = MusicaDeFundo(this)`:

```kotlin
        // filesDir, não cacheDir: o sistema esvazia o cacheDir quando falta
        // espaço, e cache que some é a TV baixando as artes de novo. O
        // ArteCache tem limite e reserva de disco próprios.
        artes = ArteCache(File(filesDir, "artes"))
        cachePelaPagina = CachePelaPagina(artes)
```

Em `createWebView`, troque `TvWebViewClient(this, ArteCache(File(filesDir, "artes")))` por `TvWebViewClient(this, artes)` (remova o comentário antigo que foi para o `onCreate`) e, junto dos outros `addJavascriptInterface`: `view.addJavascriptInterface(cachePelaPagina, CachePelaPagina.NOME_NA_PAGINA)`.

- [ ] **Step 5: Run** — comando do Step 2 e depois `./gradlew testDebugUnitTest`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/android-tv/app/src
git commit -m "feat(android-tv): ponte SignageCache baixa as artes antes e informa o disco" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: App guarda a `tv.html` e abre a cópia sem internet

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/PaginaCache.kt`
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/TvWebViewClient.kt`, `MainActivity.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/PaginaCacheTest.kt`, `TvWebViewClientTest.kt`

**Interfaces:**
- Produces: `class PaginaCache(arquivo: File, tvUrl: String = BuildConfig.TV_URL, allowCleartext: Boolean = BuildConfig.DEBUG)` com `fun resposta(url: String): WebResourceResponse?`; `TvWebViewClient(listener, artes: ArteCache? = null, pagina: PaginaCache? = null)`.

- [ ] **Step 1: Write the failing tests** — `PaginaCacheTest.kt`:

```kotlin
package com.smarttvads.signage

import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Sem isto, TV que liga sem internet fica na tela de "sem conexão": a
 * tv.html vem da Vercel. Com isto, o app entrega a última cópia boa e a
 * página toca a lista salva.
 */
@RunWith(RobolectricTestRunner::class)
class PaginaCacheTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: TestHttpServer
    private lateinit var arquivo: File
    private val tvUrl get() = "http://127.0.0.1:${server.port}/real/tv"

    private fun pagina() = PaginaCache(arquivo, tvUrl, allowCleartext = true)

    @Before
    fun sobe() {
        server = TestHttpServer()
        arquivo = File(tmp.root, "pagina/tv.html")
    }

    @After
    fun desce() { server.close() }

    @Test
    fun `com rede entrega a pagina nova e grava a copia`() {
        server.put("tv", "<html>v1</html>".toByteArray())
        val resp = pagina().resposta(tvUrl)
        assertNotNull(resp)
        assertEquals("text/html", resp!!.mimeType)
        assertEquals("utf-8", resp.encoding.lowercase())
        assertEquals("<html>v1</html>", resp.data.readBytes().decodeToString())
        assertEquals("<html>v1</html>", arquivo.readText())
    }

    @Test
    fun `sem rede entrega a copia gravada`() {
        server.put("tv", "<html>v1</html>".toByteArray())
        pagina().resposta(tvUrl)
        server.close()
        val resp = pagina().resposta(tvUrl)
        assertEquals("<html>v1</html>", resp!!.data.readBytes().decodeToString())
    }

    @Test
    fun `erro HTTP da Vercel entrega a copia`() {
        // Cópia já gravada; a URL não existe no servidor de teste, que responde 404.
        arquivo.parentFile!!.mkdirs()
        arquivo.writeText("<html>v1</html>")
        val urlQueDa404 = "http://127.0.0.1:${server.port}/real/sumiu"
        val resp = PaginaCache(arquivo, urlQueDa404, allowCleartext = true).resposta(urlQueDa404)
        assertEquals("<html>v1</html>", resp!!.data.readBytes().decodeToString())
    }

    @Test
    fun `sem rede e sem copia devolve null (fluxo de sem conexao de hoje)`() {
        server.close()
        assertNull(pagina().resposta(tvUrl))
    }

    @Test
    fun `outra url nao passa por aqui`() {
        server.put("tv", "x".toByteArray())
        assertNull(pagina().resposta("http://127.0.0.1:${server.port}/real/outra"))
    }

    @Test
    fun `pagina vazia nao substitui a copia boa`() {
        server.put("tv", "<html>v1</html>".toByteArray())
        pagina().resposta(tvUrl)
        server.put("tv", ByteArray(0))
        pagina().resposta(tvUrl)
        assertEquals("<html>v1</html>", arquivo.readText())
    }
}
```

Em `TvWebViewClientTest.kt`, no estilo dos testes do arquivo (Robolectric, `WebResourceRequest` fake): pedido de main frame GET para a URL da página com `pagina` configurada devolve a resposta da `PaginaCache`; main frame sem `pagina` devolve `null`; sub-recurso continua indo para `artes`; POST devolve `null`.

- [ ] **Step 2: Run to verify they fail** — `cd artifacts/android-tv && ./gradlew testDebugUnitTest --tests 'com.smarttvads.signage.PaginaCacheTest' --tests 'com.smarttvads.signage.TvWebViewClientTest'`. Expected: FAIL.

- [ ] **Step 3: `PaginaCache.kt`**

```kotlin
package com.smarttvads.signage

import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Última cópia boa da tv.html, servida à WebView quando a Vercel não
 * responde. Sem ela, TV que liga sem internet fica na tela de "sem conexão";
 * com ela, a página abre e toca a lista salva no localStorage.
 *
 * Sempre tenta a rede primeiro (10 s no total): página nova chega assim que
 * a internet volta. Falha → cópia. Sem cópia → null, e a WebView segue o
 * caminho de hoje (erro, aviso de sem conexão, retentativas).
 *
 * Síncrono: o `shouldInterceptRequest` já roda fora da main thread.
 */
class PaginaCache(
    private val arquivo: File,
    private val tvUrl: String = BuildConfig.TV_URL,
    // Mesmo motivo do ArteCache: usesCleartextTraffic só vale de API 23 em diante.
    private val allowCleartext: Boolean = BuildConfig.DEBUG,
) {
    fun resposta(url: String): WebResourceResponse? {
        if (url != tvUrl) return null
        val nova = baixar()
        if (nova != null) {
            gravar(nova)
            return html(nova)
        }
        return try {
            if (arquivo.exists()) html(arquivo.readBytes()) else null
        } catch (e: IOException) {
            null
        }
    }

    private fun baixar(): ByteArray? {
        if (!allowCleartext && !tvUrl.startsWith("https://")) return null
        var conn: HttpURLConnection? = null
        return try {
            conn = URL(tvUrl).openConnection() as HttpURLConnection
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
            // Página vazia (proxy, captive portal) nunca substitui a cópia boa.
            conn.inputStream.use { it.readBytes() }.takeIf { it.isNotEmpty() }
        } catch (e: IOException) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    // .part + rename: queda de energia no meio não deixa cópia pela metade.
    private fun gravar(corpo: ByteArray) {
        try {
            arquivo.parentFile?.mkdirs()
            val parte = File(arquivo.parentFile, arquivo.name + ".part")
            parte.writeBytes(corpo)
            if (!parte.renameTo(arquivo)) parte.delete()
        } catch (e: IOException) {
            // Sem disco: entrega a página igual, só não guarda.
        }
    }

    private fun html(corpo: ByteArray) = WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(corpo))

    companion object {
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 10_000
    }
}
```

Atenção ao `renameTo` em cima de arquivo existente: no Android (Linux) substitui; se o teste "pagina vazia" ou "com rede" falhar por isso, apague o destino antes do `renameTo`.

- [ ] **Step 4: `TvWebViewClient.kt`** — construtor `(listener, artes: ArteCache? = null, pagina: PaginaCache? = null)`, KDoc acrescenta "Com [pagina], a própria tv.html sai do disco quando a Vercel não responde." e:

```kotlin
    // API 21+. Roda fora da main thread; null = a WebView busca sozinha.
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        if (request.method != "GET") return null
        val url = request.url.toString()
        return if (request.isForMainFrame) pagina?.resposta(url) else artes?.resposta(url)
    }
```

`MainActivity.createWebView`: `TvWebViewClient(this, artes, PaginaCache(File(filesDir, "pagina/tv.html")))`.

- [ ] **Step 5: Run** — comando do Step 2 e `./gradlew testDebugUnitTest` inteiro. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/android-tv/app/src
git commit -m "feat(android-tv): TV abre a última tv.html boa quando liga sem internet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Verificação final (controlador)

- `pnpm -w run typecheck`; suítes da API e do web inteiras; `cd artifacts/android-tv && ./gradlew testDebugUnitTest`.
- Migração nova só com os cinco `ADD COLUMN`.
- PR: `feat(android-tv): TV toca sem internet e mostra o espaço em disco`.
