# Peças verticais e TVs em modo retrato — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Peças verticais (imagem e YouTube Shorts) tocam só em TVs cadastradas como retrato, com o player girando o conteúdo, e o admin vê o preview da peça no formato certo ao criá-la.

**Architecture:** Duas colunas novas (`announcements.orientation`, `devices.orientation`). O servidor filtra a rotação de cada TV em `loadDeviceSlides` e expõe `GET /display/:key/feed` com `{ screen, slides }`. `tv.html` e `display.tsx` giram um `#stage` com CSS transform. O admin detecta a orientação no formulário (imagem local, `/youtube/meta` para YouTube) e mostra o preview numa moldura 16:9 ou 9:16.

**Tech Stack:** pnpm monorepo, Express + drizzle (Postgres), OpenAPI + orval (api-zod, api-client-react), React + react-hook-form + zod + TanStack Query, `tv.html` ES5, vitest + supertest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-22-pecas-verticais-design.md`

## Global Constraints

- Branch `feat/pecas-verticais`; nunca commit na `main`.
- Commits: `tipo(escopo): descrição curta em português`, imperativo, sem ponto final; corpo termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como UTF-8 real, nunca `\uXXXX` (escrever escape por Write/Edit corrompe o arquivo — conferir com `grep -n '\\u[0-9a-fA-F]\{4\}'`).
- `public/tv.html` é ES5: sem `let`/`const`, arrow function, template string, `classList`.
- Valores: peça `landscape` | `portrait`; TV `landscape` | `portrait_right` | `portrait_left`; default `landscape` nas duas colunas.
- Valor desconhecido em qualquer lugar vale `landscape` (nunca derruba o parse).
- Não criar tag `vX.Y.Z` nem mexer em `versionName`/`versionCode`.
- Título do PR: `feat(tv): peças verticais para TVs em modo retrato`.

## Comandos

- Testes da API: `pnpm --filter @workspace/api-server test -- <caminho-ou-nome>`
- Testes do web: `pnpm --filter @workspace/signage test -- <caminho-ou-nome>`
- Codegen: `pnpm --filter @workspace/api-spec codegen`
- Typecheck geral: `pnpm run typecheck`

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `lib/db/src/orientation.ts` (novo) | Constantes, tipos, `screenOrientationOf`, `parseAnnouncementOrientation` — puro, sem DB |
| `lib/db/src/schema/announcements.ts`, `devices.ts` | Coluna `orientation` |
| `lib/db/drizzle/0012_*.sql` (gerado) | Migration |
| `lib/api-spec/openapi.yaml` | Campos, `DisplayFeed`, `YouTubeMeta`, rotas novas |
| `artifacts/api-server/src/lib/slide-orientation.ts` (novo) | `filterByOrientation` |
| `artifacts/api-server/src/lib/youtube/orientation.ts` (novo) | `detectYouTubeMeta` (regra do link + oEmbed) |
| `artifacts/api-server/src/routes/youtube.ts` (novo) | `GET /youtube/meta` |
| `artifacts/api-server/src/lib/device-feed.ts` | Seleciona `orientation`, filtra |
| `artifacts/api-server/src/routes/display.ts` | `/feed` + lookup compartilhado |
| `artifacts/api-server/src/routes/devices.ts` | `orientation` nas respostas, PATCH, 400 no playlist/add |
| `artifacts/api-server/src/routes/announcements.ts` | Lê `orientation` no POST/PATCH |
| `artifacts/api-server/src/lib/portal/queries.ts` | `orientation` em `clientDevices` e `previewDevice` |
| `artifacts/signage/public/tv.html` | `#stage`, `/feed`, giro |
| `artifacts/signage/src/lib/stage-rotation.ts` (novo) | Estilo do palco para React |
| `artifacts/signage/src/pages/display.tsx` | `/feed` + palco |
| `artifacts/signage/src/components/piece-preview.tsx` (novo) | Moldura + mídia + legenda |
| `artifacts/signage/src/lib/piece-orientation.ts` (novo) | `imageOrientation(file)` |
| `artifacts/signage/src/components/piece-orientation-field.tsx` (novo) | Detecção + preview + seletor no form |
| `artifacts/signage/src/components/device-preview.tsx`, `tv-preview-grid.tsx` | Moldura em pé |
| `artifacts/signage/src/pages/admin.tsx` | Form e lista |
| `artifacts/signage/src/pages/device-detail.tsx` | Seletor de orientação, picker filtrado |

---

### Task 1: Orientação no banco

**Files:**
- Create: `lib/db/src/orientation.ts`
- Modify: `lib/db/package.json` (exports), `lib/db/src/schema/announcements.ts`, `lib/db/src/schema/devices.ts`
- Create (gerado): `lib/db/drizzle/0012_*.sql` + `lib/db/drizzle/meta/*`
- Test: `artifacts/api-server/src/lib/__tests__/orientation.test.ts`

**Interfaces:**
- Produces (import `@workspace/db/orientation`):
  - `ANNOUNCEMENT_ORIENTATIONS = ["landscape", "portrait"] as const`, `type AnnouncementOrientation`
  - `DEVICE_ORIENTATIONS = ["landscape", "portrait_right", "portrait_left"] as const`, `type DeviceOrientation`
  - `screenOrientationOf(device: string | null | undefined): AnnouncementOrientation`
  - `pieceOrientationOf(piece: string | null | undefined): AnnouncementOrientation`
  - `parseAnnouncementOrientation(raw: unknown): AnnouncementOrientation | undefined | null` — `undefined` = não enviado, `null` = inválido
- Produces: colunas `announcementsTable.orientation`, `devicesTable.orientation` (`text not null default 'landscape'`)

- [ ] **Step 1: Teste que falha**

`artifacts/api-server/src/lib/__tests__/orientation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseAnnouncementOrientation,
  pieceOrientationOf,
  screenOrientationOf,
} from "@workspace/db/orientation";

describe("screenOrientationOf", () => {
  it("os dois retratos viram portrait", () => {
    expect(screenOrientationOf("portrait_right")).toBe("portrait");
    expect(screenOrientationOf("portrait_left")).toBe("portrait");
  });
  it("landscape, nulo e valor desconhecido viram landscape", () => {
    expect(screenOrientationOf("landscape")).toBe("landscape");
    expect(screenOrientationOf(null)).toBe("landscape");
    expect(screenOrientationOf(undefined)).toBe("landscape");
    expect(screenOrientationOf("diagonal")).toBe("landscape");
  });
});

describe("pieceOrientationOf", () => {
  it("só portrait é portrait", () => {
    expect(pieceOrientationOf("portrait")).toBe("portrait");
    expect(pieceOrientationOf("landscape")).toBe("landscape");
    expect(pieceOrientationOf(undefined)).toBe("landscape");
    expect(pieceOrientationOf("x")).toBe("landscape");
  });
});

describe("parseAnnouncementOrientation", () => {
  it("ausente ou vazio é undefined (cliente antigo)", () => {
    expect(parseAnnouncementOrientation(undefined)).toBeUndefined();
    expect(parseAnnouncementOrientation("")).toBeUndefined();
  });
  it("valor válido passa", () => {
    expect(parseAnnouncementOrientation("portrait")).toBe("portrait");
    expect(parseAnnouncementOrientation("landscape")).toBe("landscape");
  });
  it("valor inválido é null", () => {
    expect(parseAnnouncementOrientation("portrait_right")).toBeNull();
    expect(parseAnnouncementOrientation("vertical")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- orientation.test`
Expected: FAIL — `Failed to resolve import "@workspace/db/orientation"`.

- [ ] **Step 3: Implementar**

`lib/db/src/orientation.ts`:

```ts
/**
 * Orientação da peça e da TV. Fica fora de `schema/` e sem importar o banco
 * para o front (formulário, prévias) e os testes usarem sem DATABASE_URL.
 */
export const ANNOUNCEMENT_ORIENTATIONS = ["landscape", "portrait"] as const;
export type AnnouncementOrientation = (typeof ANNOUNCEMENT_ORIENTATIONS)[number];

/** A TV retrato é uma TV comum girada na parede; o sentido decide o giro do player. */
export const DEVICE_ORIENTATIONS = ["landscape", "portrait_right", "portrait_left"] as const;
export type DeviceOrientation = (typeof DEVICE_ORIENTATIONS)[number];

/**
 * Formato da tela que o público vê. Valor desconhecido vale landscape: uma
 * linha estranha no banco não pode tirar a TV do ar.
 */
export function screenOrientationOf(device: string | null | undefined): AnnouncementOrientation {
  return device === "portrait_right" || device === "portrait_left" ? "portrait" : "landscape";
}

/** Mesma tolerância para a peça. */
export function pieceOrientationOf(piece: string | null | undefined): AnnouncementOrientation {
  return piece === "portrait" ? "portrait" : "landscape";
}

/**
 * Lê o campo vindo do multipart. `undefined` = não enviado (cliente antigo,
 * o POST usa o default e o PATCH não mexe); `null` = enviado inválido (400).
 */
export function parseAnnouncementOrientation(raw: unknown): AnnouncementOrientation | undefined | null {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const value = String(raw);
  return (ANNOUNCEMENT_ORIENTATIONS as readonly string[]).includes(value)
    ? (value as AnnouncementOrientation)
    : null;
}
```

`lib/db/package.json`, em `exports`, depois de `"./youtube"`:

```json
    "./youtube": "./src/youtube.ts",
    "./orientation": "./src/orientation.ts"
```

`lib/db/src/schema/announcements.ts`, depois de `audioMode`:

```ts
  // "landscape" | "portrait". A TV só toca peça da orientação dela; o default
  // mantém o servidor da versão anterior funcionando durante o deploy.
  orientation: text("orientation").notNull().default("landscape"),
```

`lib/db/src/schema/devices.ts`, depois de `location`:

```ts
    // "landscape" | "portrait_right" | "portrait_left". Retrato = TV comum
    // girada na parede; o sentido diz ao player para que lado girar.
    orientation: text("orientation").notNull().default("landscape"),
```

- [ ] **Step 4: Gerar a migration**

Run: `DATABASE_URL=postgres://gerar@localhost/gerar pnpm --filter @workspace/db generate`
(o `generate` não conecta; a URL só satisfaz o `drizzle.config.ts`.)

Expected: arquivo novo `lib/db/drizzle/0012_<nome>.sql` com exatamente:

```sql
ALTER TABLE "announcements" ADD COLUMN "orientation" text DEFAULT 'landscape' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "orientation" text DEFAULT 'landscape' NOT NULL;
```

Se aparecer qualquer outra instrução, parar: o snapshot estava fora de sincronia com o schema e isso precisa ser resolvido antes.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- orientation.test`
Expected: PASS (9 asserts, 6 testes).

- [ ] **Step 6: Commit**

```bash
git add lib/db artifacts/api-server/src/lib/__tests__/orientation.test.ts
git commit -m "feat(db): orientação da peça e da TV"
```

---

### Task 2: Contrato OpenAPI e `orientation` nas respostas de TV

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-zod/src/**`, `lib/api-client-react/src/generated/**`
- Modify: `artifacts/api-server/src/routes/devices.ts:43-60,70-80` (selects), `artifacts/api-server/src/lib/portal/queries.ts:79-114` (`clientDevices`)
- Test: `artifacts/api-server/src/routes/__tests__/device-update.test.ts` (novo)

**Interfaces:**
- Consumes: colunas da Task 1.
- Produces (api-zod / api-client-react):
  - `Announcement.orientation: string` (obrigatório)
  - `Device.orientation: "landscape" | "portrait_right" | "portrait_left"` (obrigatório)
  - `DeviceUpdate.orientation?` (mesmo enum) → `UpdateDeviceBody`
  - `PortalDevice.orientation: string` (obrigatório)
  - `DisplayFeed = { screen: { orientation }, slides: DisplaySlide[] }`, operação `getDisplayFeed` → `GetDisplayFeedResponse`, `useGetDisplayFeed`, `getGetDisplayFeedQueryKey`
  - `YouTubeMeta = { kind: "youtube_video" | "youtube_playlist", id: string, orientation: "landscape" | "portrait" }`, operação `getYouTubeMeta` (query `url`) → `GetYouTubeMetaQueryParams`, `GetYouTubeMetaResponse`, `getYouTubeMeta(params)`

- [ ] **Step 1: Editar o `openapi.yaml`**

Em `components/schemas/Announcement`: incluir `orientation` no `required` e a propriedade depois de `audioMode`:

```yaml
        # "landscape" | "portrait". Sem enum pelo mesmo motivo de mediaKind:
        # um valor novo não pode derrubar a lista inteira.
        orientation: { type: string }
```

Em `AnnouncementInput` e `AnnouncementUpdate`, depois de `audioMode`:

```yaml
        orientation: { type: string, enum: [landscape, portrait] }
```

Em `Device`: `required: [id, clientId, clientName, name, deviceKey, orientation, createdAt]` e, depois de `location`:

```yaml
        orientation: { type: string, enum: [landscape, portrait_right, portrait_left] }
```

Em `DeviceUpdate`, depois de `location`:

```yaml
        orientation: { type: string, enum: [landscape, portrait_right, portrait_left] }
```

Em `PortalDevice`: `required: [id, name, orientation, totalPlays]` e `orientation: { type: string }`.

Schemas novos, depois de `DevicePreviewSlide`:

```yaml
    DisplayFeed:
      type: object
      required: [screen, slides]
      properties:
        screen:
          type: object
          required: [orientation]
          properties:
            orientation: { type: string, enum: [landscape, portrait_right, portrait_left] }
        slides:
          type: array
          items:
            $ref: "#/components/schemas/DisplaySlide"

    YouTubeMeta:
      type: object
      required: [kind, id, orientation]
      properties:
        kind: { type: string, enum: [youtube_video, youtube_playlist] }
        id: { type: string }
        orientation: { type: string, enum: [landscape, portrait] }
```

Paths novos. Depois de `/display/{deviceKey}/slides`:

```yaml
  /display/{deviceKey}/feed:
    get:
      operationId: getDisplayFeed
      tags: [devices]
      summary: Rotação da TV e como a tela está montada
      description: >
        Mesma lista de /display/{deviceKey}/slides, junto com a orientação da
        TV para o player girar o palco. /slides continua para TVs com tv.html
        antigo em cache.
      parameters:
        - { name: deviceKey, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DisplayFeed"
        "404":
          description: Device not found
```

Depois do bloco de `/announcements/{id}/toggle`:

```yaml
  /youtube/meta:
    get:
      operationId: getYouTubeMeta
      tags: [announcements]
      summary: Tipo, ID e orientação de um link do YouTube
      parameters:
        - { name: url, in: query, required: true, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/YouTubeMeta"
        "400":
          description: Link inválido
```

- [ ] **Step 2: Regenerar**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: termina sem erro; `grep -rn "GetDisplayFeedResponse\|GetYouTubeMetaResponse" lib/api-zod/src` acha as duas.

- [ ] **Step 3: Teste que falha (PATCH da TV)**

`artifacts/api-server/src/routes/__tests__/device-update.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A orientação da TV é trocada pelo admin e chega ao player no próximo
 * refresh. O PATCH tem de aceitar só os três valores: um valor fora do enum
 * gravado no banco viraria landscape em silêncio, e a TV girada ficaria de
 * lado sem ninguém entender por quê.
 */
const setMock = vi.fn();
let updateResult: unknown[] = [];
let selectResult: unknown[] = [];

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    returning: () => chain,
    set: (values: unknown) => {
      setMock(values);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectResult),
    update: () => makeChain(updateResult),
  },
  devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey", orientation: "orientation" },
  devicePlaylistTable: {},
  announcementsTable: {},
  clientsTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", name: "name", segmentId: "segmentId" },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../devices");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const DEVICE = {
  id: 1,
  clientId: 7,
  clientName: "Padaria Central",
  name: "TV do balcão",
  location: null,
  deviceKey: "A1B2C3D4E5F6A7B8",
  orientation: "portrait_right",
  lastSeenAt: null,
  createdAt: new Date("2026-09-01T12:00:00Z"),
};

beforeEach(() => {
  setMock.mockReset();
  updateResult = [{ id: 1 }];
  selectResult = [DEVICE];
});

describe("PATCH /devices/:id — orientação", () => {
  it("grava um retrato válido e devolve a TV com a orientação", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait_right" });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ orientation: "portrait_right" });
    expect(res.body.orientation).toBe("portrait_right");
  });

  it("recusa valor fora do enum sem tocar no banco", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait" });

    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- device-update.test`
Expected: o primeiro teste FAIL com erro do `UpdateDeviceResponse.parse` (`orientation` obrigatório e ausente, porque `getDeviceWithClient` não seleciona a coluna). O segundo já passa (o enum veio do codegen).

- [ ] **Step 5: Selecionar `orientation` nas respostas de TV**

`artifacts/api-server/src/routes/devices.ts` — nos dois selects que têm `lastSeenAt: devicesTable.lastSeenAt` (`getDeviceWithClient` e `GET /devices`), acrescentar logo depois de `location`:

```ts
      orientation: devicesTable.orientation,
```

`artifacts/api-server/src/lib/portal/queries.ts`:

```ts
export interface PortalDeviceRow {
  id: number; name: string; location: string | null; orientation: string; lastSeenAt: Date | null; totalPlays: number;
  isOnline: boolean;
}
```

e no select de `clientDevices`, depois de `location: devicesTable.location,`:

```ts
      orientation: devicesTable.orientation,
```

Se `GET /devices/by-key/...` (resposta `GetDeviceByKeyResponse`) tiver select próprio, fazer o mesmo: `grep -n "GetDeviceByKeyResponse" -B30 artifacts/api-server/src/routes/devices.ts`.

- [ ] **Step 6: Rodar a suíte da API e corrigir fixtures**

Run: `pnpm --filter @workspace/api-server test`
Expected: `device-update.test` PASS. Testes que montam `Announcement`/`Device`/`PortalDevice` sem `orientation` podem falhar no `.parse` da resposta com `orientation ... Required`. Para cada um, acrescentar `orientation: "landscape"` à fixture (é o valor que o banco devolve por default). Não mexer em mais nada nesses testes. Rodar de novo até verde.

- [ ] **Step 7: Typecheck**

Run: `pnpm run typecheck`
Expected: sem erro. Se o web reclamar de fixture tipada sem `orientation`, acrescentar `orientation: 'landscape'`.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec lib/api-zod lib/api-client-react artifacts/api-server artifacts/signage
git commit -m "feat(api): orientação no contrato da TV e da peça"
```

---

### Task 3: Peça salva com orientação (POST/PATCH `/announcements`)

**Files:**
- Modify: `artifacts/api-server/src/routes/announcements.ts` (POST ~148-205, PATCH ~269-345)
- Test: `artifacts/api-server/src/routes/__tests__/announcements-orientation.test.ts` (novo)

**Interfaces:**
- Consumes: `parseAnnouncementOrientation` (Task 1).
- Produces: `POST /announcements` e `PATCH /announcements/:id` aceitam campo multipart `orientation`; 400 `{ error: "Orientação inválida" }` quando fora do enum.

- [ ] **Step 1: Teste que falha**

`artifacts/api-server/src/routes/__tests__/announcements-orientation.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O formulário manda a orientação detectada (ou corrigida pelo operador). Peça
 * gravada com a orientação errada some das TVs certas, então valor fora do
 * enum é 400, e ausência (cliente antigo) cai no default do banco.
 */
const insertValues = vi.fn();
const updateSet = vi.fn();
let selectQueue: unknown[] = [];

function makeChain(result: unknown, onValues?: (v: unknown) => void) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    returning: () => chain,
    values: (v: unknown) => {
      onValues?.(v);
      return chain;
    },
    set: (v: unknown) => {
      onValues?.(v);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const ROW = {
  id: 9,
  title: "Short da padaria",
  displayText: null,
  showText: false,
  imageUrl: null,
  mediaKind: "youtube_video",
  youtubeId: "abc123def45",
  playbackMode: "capped",
  audioMode: "muted",
  orientation: "portrait",
  isActive: true,
  displayOrder: 0,
  source: "admin",
  duration: 10,
  createdAt: new Date("2026-09-22T12:00:00Z"),
  updatedAt: new Date("2026-09-22T12:00:00Z"),
};

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeChain(selectQueue.shift()),
    insert: () => makeChain([ROW], insertValues),
    update: () => makeChain([ROW], updateSet),
  },
  announcementsTable: { id: "id", displayOrder: "displayOrder", createdAt: "createdAt", isActive: "isActive" },
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

const SHORT = "https://www.youtube.com/shorts/abc123def45";

beforeEach(() => {
  insertValues.mockReset();
  updateSet.mockReset();
  selectQueue = [];
});

describe("POST /announcements — orientação", () => {
  it("grava a orientação enviada", async () => {
    selectQueue = [[{ maxOrder: -1 }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/announcements")
      .field("title", "Short da padaria")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("orientation", "portrait");

    expect(res.status).toBe(201);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ orientation: "portrait" }));
  });

  it("sem o campo, não manda orientação (vale o default do banco)", async () => {
    selectQueue = [[{ maxOrder: -1 }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app)
      .post("/announcements")
      .field("title", "Vídeo antigo")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT);

    expect(insertValues.mock.calls[0][0]).not.toHaveProperty("orientation");
  });

  it("recusa orientação inválida", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .post("/announcements")
      .field("title", "X")
      .field("mediaKind", "youtube_video")
      .field("youtubeUrl", SHORT)
      .field("orientation", "portrait_right");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Orientação inválida" });
    expect(insertValues).not.toHaveBeenCalled();
  });
});

describe("PATCH /announcements/:id — orientação", () => {
  it("atualiza só a orientação", async () => {
    selectQueue = [[{ ...ROW, orientation: "landscape" }]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/9").field("orientation", "portrait");

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ orientation: "portrait" });
  });

  it("recusa orientação inválida", async () => {
    selectQueue = [[ROW]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/announcements/9").field("orientation", "deitada");

    expect(res.status).toBe(400);
    expect(updateSet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- announcements-orientation`
Expected: FAIL — o POST não grava `orientation`, o inválido volta 201.

- [ ] **Step 3: Implementar**

`artifacts/api-server/src/routes/announcements.ts`, import:

```ts
import { parseAnnouncementOrientation } from "@workspace/db/orientation";
```

No POST, logo depois do bloco `const yt = readYouTubeFields(req.body); if ("error" in yt) {...}`:

```ts
    const orientation = parseAnnouncementOrientation(req.body.orientation);
    if (orientation === null) {
      res.status(400).json({ error: "Orientação inválida" });
      return;
    }
```

e no `.values({...})`, depois de `audioMode: yt.audioMode,`:

```ts
        // Ausente (cliente antigo): fica o default do banco, landscape.
        ...(orientation ? { orientation } : {}),
```

No PATCH, antes de `const [existing] = await db` (validação barata vem antes da consulta, como o `UpdateAnnouncementBody`):

```ts
    const orientation = parseAnnouncementOrientation(req.body.orientation);
    if (orientation === null) {
      res.status(400).json({ error: "Orientação inválida" });
      return;
    }
```

e depois de `const updates: Record<string, unknown> = { ...parsed.data };`:

```ts
    if (orientation) updates.orientation = orientation;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- announcements`
Expected: PASS em `announcements-orientation`, `announcements-upload` e `announcement-source`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/announcements.ts artifacts/api-server/src/routes/__tests__/announcements-orientation.test.ts
git commit -m "feat(api): peça salva com a orientação"
```

---

### Task 4: Detecção de orientação do YouTube (`GET /youtube/meta`)

**Files:**
- Create: `artifacts/api-server/src/lib/youtube/orientation.ts`, `artifacts/api-server/src/routes/youtube.ts`
- Modify: `artifacts/api-server/src/routes/index.ts` (registrar depois de `requireAdmin`)
- Test: `artifacts/api-server/src/lib/__tests__/youtube-orientation.test.ts`, `artifacts/api-server/src/routes/__tests__/youtube-meta.test.ts`

**Interfaces:**
- Consumes: `parseYouTubeUrl` (`@workspace/db/youtube`), `GetYouTubeMetaQueryParams`, `GetYouTubeMetaResponse` (Task 2).
- Produces: `detectYouTubeMeta(url: string, fetchImpl?: typeof fetch): Promise<{ kind: "youtube_video" | "youtube_playlist"; id: string; orientation: "landscape" | "portrait" } | null>`; rota `GET /youtube/meta?url=` (admin).

- [ ] **Step 1: Sondar o oEmbed (decide a regra, não gera código)**

Pegar o ID de qualquer Short público (abrir youtube.com/shorts, copiar o ID da URL) e rodar:

```bash
ID=<id-do-short>
curl -s "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D$ID" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['width'],d['height'])"
curl -s "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['width'],d['height'])"
```

- Se o Short vier com `height > width` e o vídeo comum com `width > height`: seguir o plano como está.
- Se o Short vier com proporção deitada: **apagar** do Step 3 o bloco do oEmbed (fica só a regra `/shorts/`), apagar os testes "oEmbed ..." do Step 2 e registrar o resultado no corpo do commit. O seletor manual cobre o resto (decisão da spec).

- [ ] **Step 2: Testes que falham**

`artifacts/api-server/src/lib/__tests__/youtube-orientation.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { detectYouTubeMeta } from "../youtube/orientation";

const oembed = (width: number, height: number) =>
  vi.fn(async () => new Response(JSON.stringify({ width, height }), { status: 200 })) as unknown as typeof fetch;

describe("detectYouTubeMeta", () => {
  it("link /shorts/ é vertical sem consultar a rede", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const meta = await detectYouTubeMeta("https://www.youtube.com/shorts/abc123def45", fetchImpl);
    expect(meta).toEqual({ kind: "youtube_video", id: "abc123def45", orientation: "portrait" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("playlist é horizontal sem consultar a rede", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const meta = await detectYouTubeMeta("https://www.youtube.com/playlist?list=PL1234567890abc", fetchImpl);
    expect(meta).toEqual({ kind: "youtube_playlist", id: "PL1234567890abc", orientation: "landscape" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("oEmbed mais alto que largo é vertical", async () => {
    const meta = await detectYouTubeMeta("https://www.youtube.com/watch?v=abc123def45", oembed(113, 200));
    expect(meta?.orientation).toBe("portrait");
  });

  it("oEmbed deitado é horizontal", async () => {
    const meta = await detectYouTubeMeta("https://youtu.be/dQw4w9WgXcQ", oembed(200, 113));
    expect(meta?.orientation).toBe("landscape");
  });

  it("erro na consulta é horizontal (o seletor corrige)", async () => {
    const falha = vi.fn(async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    const meta = await detectYouTubeMeta("https://www.youtube.com/watch?v=abc123def45", falha);
    expect(meta).toEqual({ kind: "youtube_video", id: "abc123def45", orientation: "landscape" });
  });

  it("link que não é do YouTube é null", async () => {
    expect(await detectYouTubeMeta("https://vimeo.com/123")).toBeNull();
  });
});
```

`artifacts/api-server/src/routes/__tests__/youtube-meta.test.ts`:

```ts
import type { Express } from "express";
import { describe, expect, it } from "vitest";

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../youtube");
  const app = express();
  app.use(router);
  return app;
}

describe("GET /youtube/meta", () => {
  it("devolve tipo, ID e orientação de um Short", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .get("/youtube/meta")
      .query({ url: "https://www.youtube.com/shorts/abc123def45" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: "youtube_video", id: "abc123def45", orientation: "portrait" });
  });

  it("400 para link que não é do YouTube", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/youtube/meta").query({ url: "https://vimeo.com/1" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Link do YouTube inválido" });
  });

  it("400 sem url", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/youtube/meta");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- youtube-orientation youtube-meta`
Expected: FAIL — módulos `../youtube/orientation` e `../youtube` não existem.

- [ ] **Step 4: Implementar**

`artifacts/api-server/src/lib/youtube/orientation.ts`:

```ts
import { parseYouTubeUrl } from "@workspace/db/youtube";
import type { AnnouncementOrientation } from "@workspace/db/orientation";

export type YouTubeMeta = {
  kind: "youtube_video" | "youtube_playlist";
  id: string;
  orientation: AnnouncementOrientation;
};

const OEMBED_TIMEOUT_MS = 3000;

/**
 * Tipo, ID e orientação de um link do YouTube, para o formulário do admin
 * mostrar o preview no formato certo antes de salvar. Na dúvida (playlist,
 * rede fora, resposta estranha) é landscape: o operador corrige no seletor.
 */
export async function detectYouTubeMeta(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<YouTubeMeta | null> {
  const ref = parseYouTubeUrl(url);
  if (!ref) return null;
  if (ref.kind === "youtube_playlist") return { ...ref, orientation: "landscape" };

  // Link de Short já diz o formato; não gasta uma consulta externa.
  if (/\/shorts\//.test(new URL(url.trim()).pathname)) return { ...ref, orientation: "portrait" };

  // Short também circula como watch?v=; o oEmbed devolve a proporção do player.
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${ref.id}`);
    const res = await fetchImpl(endpoint, { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) });
    if (res.ok) {
      const body = (await res.json()) as { width?: unknown; height?: unknown };
      if (typeof body.width === "number" && typeof body.height === "number" && body.height > body.width) {
        return { ...ref, orientation: "portrait" };
      }
    }
  } catch {
    // Timeout ou rede: segue como landscape.
  }
  return { ...ref, orientation: "landscape" };
}
```

`artifacts/api-server/src/routes/youtube.ts`:

```ts
import { Router, type IRouter } from "express";
import { GetYouTubeMetaQueryParams, GetYouTubeMetaResponse } from "@workspace/api-zod";
import { detectYouTubeMeta } from "../lib/youtube/orientation";

const router: IRouter = Router();

// O formulário da biblioteca pergunta antes de salvar, para o preview já sair
// no formato da peça. Roda no servidor porque o oEmbed não libera CORS.
router.get("/youtube/meta", async (req, res): Promise<void> => {
  const query = GetYouTubeMetaQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const meta = await detectYouTubeMeta(query.data.url);
  if (!meta) {
    res.status(400).json({ error: "Link do YouTube inválido" });
    return;
  }
  res.json(GetYouTubeMetaResponse.parse(meta));
});

export default router;
```

`artifacts/api-server/src/routes/index.ts`: `import youtubeRouter from "./youtube";` e, depois de `router.use(announcementsRouter);`:

```ts
router.use(youtubeRouter);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- youtube`
Expected: PASS (inclui o `youtube-parse.test` existente).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/youtube/orientation.ts artifacts/api-server/src/routes/youtube.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/lib/__tests__/youtube-orientation.test.ts artifacts/api-server/src/routes/__tests__/youtube-meta.test.ts
git commit -m "feat(api): detecta se o link do YouTube é vertical"
```

---

### Task 5: Rotação da TV filtrada pela orientação

**Files:**
- Create: `artifacts/api-server/src/lib/slide-orientation.ts`
- Modify: `artifacts/api-server/src/lib/device-feed.ts`, `artifacts/api-server/src/lib/panels/device-slides.ts` (`PanelSlideRow`, `buildPanelSlidesQuery`), `artifacts/api-server/src/routes/display.ts` (select do device), `artifacts/api-server/src/routes/devices.ts` (select do preview), `artifacts/api-server/src/lib/portal/queries.ts` (`previewDevice`)
- Test: `artifacts/api-server/src/lib/__tests__/slide-orientation.test.ts`, `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `screenOrientationOf`, `pieceOrientationOf` (Task 1).
- Produces:
  - `filterByOrientation<T extends { orientation: string | null }>(slides: T[], screen: AnnouncementOrientation): T[]`
  - `FeedDevice = { id; clientId; companyId; segmentId; orientation: string }`
  - `loadDeviceSlides` devolve slides já filtrados e **sem** o campo `orientation`.

- [ ] **Step 1: Teste unitário que falha**

`artifacts/api-server/src/lib/__tests__/slide-orientation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterByOrientation } from "../slide-orientation";

const slides = [
  { announcementId: 1, orientation: "landscape" },
  { announcementId: 2, orientation: "portrait" },
  { announcementId: 3, orientation: null },
  { announcementId: 4, orientation: "algo-novo" },
];

describe("filterByOrientation", () => {
  it("TV deitada fica com as horizontais (nulo e desconhecido contam como horizontal)", () => {
    expect(filterByOrientation(slides, "landscape").map((s) => s.announcementId)).toEqual([1, 3, 4]);
  });
  it("TV retrato fica só com as verticais", () => {
    expect(filterByOrientation(slides, "portrait").map((s) => s.announcementId)).toEqual([2]);
  });
  it("preserva a ordem", () => {
    const ordem = [
      { announcementId: 9, orientation: "portrait" },
      { announcementId: 5, orientation: "portrait" },
    ];
    expect(filterByOrientation(ordem, "portrait").map((s) => s.announcementId)).toEqual([9, 5]);
  });
});
```

- [ ] **Step 2: Teste de rota que falha**

Em `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`:

1. No mock, `devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey", orientation: "orientation" }` e `announcementsTable: { id: "id", isActive: "isActive", orientation: "orientation" }`.
2. `DEVICE_ROW` ganha `orientation: "landscape"`; `PLAYLIST_ROW`, `CAMPAIGN_ROW` e `PANEL_ROW` ganham `orientation: "landscape"`.
3. Acrescentar dentro do `describe("GET /display/:deviceKey/slides")`:

```ts
  it("TV retrato recebe só as peças verticais, sem o campo orientation", async () => {
    const vertical = { ...PLAYLIST_ROW, announcementId: 111, orientation: "portrait" };
    selectResults = [[{ ...DEVICE_ROW, orientation: "portrait_left" }], [PLAYLIST_ROW, vertical], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([PANEL_ROW]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect(res.status).toBe(200);
    expect((res.body as Array<{ announcementId: number }>).map((s) => s.announcementId)).toEqual([111]);
    expect(res.body[0]).not.toHaveProperty("orientation");
  });

  it("TV deitada não recebe peça vertical", async () => {
    const vertical = { ...CAMPAIGN_ROW, announcementId: 222, orientation: "portrait" };
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], [vertical]];
    panelSlidesForClientMock.mockResolvedValue([]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides");

    expect((res.body as Array<{ announcementId: number }>).map((s) => s.announcementId)).toEqual([
      PLAYLIST_ROW.announcementId,
    ]);
  });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- slide-orientation display-slides`
Expected: FAIL — `../slide-orientation` não existe; a rota devolve as peças verticais.

- [ ] **Step 4: Implementar**

`artifacts/api-server/src/lib/slide-orientation.ts`:

```ts
import { pieceOrientationOf, type AnnouncementOrientation } from "@workspace/db/orientation";

/**
 * A TV só toca peça da orientação dela: horizontal numa TV em pé sairia
 * minúscula ou cortada. Mantém a ordem da rotação.
 */
export function filterByOrientation<T extends { orientation: string | null }>(
  slides: T[],
  screen: AnnouncementOrientation,
): T[] {
  return slides.filter((slide) => pieceOrientationOf(slide.orientation) === screen);
}
```

`artifacts/api-server/src/lib/device-feed.ts`:

- import: `import { screenOrientationOf } from "@workspace/db/orientation";` e `import { filterByOrientation } from "./slide-orientation";`
- `export type FeedDevice = { id: number; clientId: number; companyId: number; segmentId: number | null; orientation: string };`
- Nos selects de `playlistSlides` e `campaignSlides`, depois de `audioMode: announcementsTable.audioMode,`: `orientation: announcementsTable.orientation,`
- Trocar o bloco final:

```ts
  const deduped = composeDeviceSlides(
    tagSource(eligibleCampaignSlides, "campaign"),
    tagSource(panelSlides, "panel"),
    tagSource(playlistSlides, "playlist"),
  );

  // Por último, depois da dedupe: filtrar antes deixaria a regra de
  // concorrência decidir com peças que esta TV nem vai mostrar.
  const visible = filterByOrientation(deduped, screenOrientationOf(device.orientation));

  return Promise.all(
    visible.map(async ({
      scanCode,
      showText,
      displayText,
      advertiserSegmentId,
      advertiserCompanyId,
      targetMode,
      deviceIds,
      segmentIds,
      weekdays,
      // Já cumpriu o papel no filtro; o player não precisa dela.
      orientation,
      ...slide
    }) => {
```

(o resto do `map` fica igual).

`artifacts/api-server/src/lib/panels/device-slides.ts`: em `PanelSlideRow` acrescentar `orientation: string;` depois de `audioMode: string;` e, em `buildPanelSlidesQuery`, `orientation: announcementsTable.orientation,` depois de `audioMode`.

Os três selects de device que alimentam `loadDeviceSlides` ganham `orientation: devicesTable.orientation,` depois de `segmentId: companiesTable.segmentId,`:
- `artifacts/api-server/src/routes/display.ts` (rota `/slides`)
- `artifacts/api-server/src/routes/devices.ts` (rota `/devices/:id/preview`)
- `artifacts/api-server/src/lib/portal/queries.ts` (`previewDevice`)

- [ ] **Step 5: Rodar a suíte da API**

Run: `pnpm --filter @workspace/api-server test`
Expected: PASS. Se `device-preview.test`, `portal-device-preview.test` ou `panels-scope.test` falharem por mock de tabela sem `orientation`, acrescentar `orientation: "orientation"` ao mock de `devicesTable`/`announcementsTable` desses arquivos — fixture sem `orientation` já cai em landscape e passa.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server
git commit -m "feat(api): TV recebe só peças da orientação dela"
```

---

### Task 6: Endpoint `GET /display/:deviceKey/feed`

**Files:**
- Modify: `artifacts/api-server/src/routes/display.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `loadDeviceSlides` (Task 5), `GetDisplayFeedResponse` (Task 2).
- Produces: `GET /display/:deviceKey/feed` → `{ screen: { orientation }, slides }`; 404 `{ error: "Device not found" }` (corpo idêntico ao `/slides` — o `tv.html` abre o pareamento por ele).

- [ ] **Step 1: Teste que falha**

No fim de `display-slides.test.ts`:

```ts
describe("GET /display/:deviceKey/feed", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
  });

  it("devolve a orientação da TV junto com a rotação filtrada", async () => {
    const vertical = { ...PLAYLIST_ROW, announcementId: 111, orientation: "portrait" };
    selectResults = [[{ ...DEVICE_ROW, orientation: "portrait_right" }], [PLAYLIST_ROW, vertical], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([]);

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect(res.body.screen).toEqual({ orientation: "portrait_right" });
    expect(res.body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([111]);
    expect(res.body.slides[0]).not.toHaveProperty("source");
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
    // Como o /slides: a TV que pergunta está no ar.
    expect(dbUpdate).toHaveBeenCalledTimes(1);
  });

  it("404 com o mesmo corpo do /slides quando a key não existe", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/nao-existe/feed");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
  });
});
```

E no import do topo: `import { GetDeviceSlidesResponse, GetDisplayFeedResponse } from "@workspace/api-zod";`

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- display-slides`
Expected: FAIL — `/feed` responde 404 do Express.

- [ ] **Step 3: Implementar**

`artifacts/api-server/src/routes/display.ts` inteiro:

```ts
import { Router, type IRouter, type Request } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import { GetDeviceSlidesResponse, GetDisplayFeedResponse } from "@workspace/api-zod";
import { loadDeviceSlides } from "../lib/device-feed";

const router: IRouter = Router();

/**
 * O que as duas rotas da TV fazem igual: acha o device pela key, marca a TV
 * como vista e monta a rotação. Null = key desconhecida (o player abre o
 * pareamento pelo corpo exato do 404).
 */
async function loadForTv(req: Request) {
  const { deviceKey } = req.params;
  const raw = Array.isArray(deviceKey) ? deviceKey[0] : deviceKey;

  const [device] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
      orientation: devicesTable.orientation,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.deviceKey, raw));

  if (!device) return null;

  await db
    .update(devicesTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(devicesTable.id, device.id));

  const slides = await loadDeviceSlides(device, req.log);
  // A origem do slide é só para a prévia do admin; a TV não precisa dela.
  return { device, slides: slides.map(({ source, ...slide }) => slide) };
}

// Mantida para TVs com tv.html antigo em cache: mesma lista, sem o giro.
router.get("/display/:deviceKey/slides", async (req, res): Promise<void> => {
  const tv = await loadForTv(req);
  if (!tv) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(GetDeviceSlidesResponse.parse(tv.slides));
});

router.get("/display/:deviceKey/feed", async (req, res): Promise<void> => {
  const tv = await loadForTv(req);
  if (!tv) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(
    GetDisplayFeedResponse.parse({
      screen: { orientation: tv.device.orientation },
      slides: tv.slides,
    }),
  );
});

export default router;
```

Nota: `GetDisplayFeedResponse` valida `screen.orientation` contra o enum. Um valor estranho no banco derrubaria a TV; por isso o `PATCH` só aceita o enum (Task 2) e a coluna tem default.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- display-slides`
Expected: PASS (todos os testes de `/slides` e de `/feed`).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/display.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts
git commit -m "feat(api): /display/:key/feed com a orientação da TV"
```

---

### Task 7: Playlist recusa peça de orientação diferente

**Files:**
- Modify: `artifacts/api-server/src/routes/devices.ts` (`POST /devices/:id/playlist/add`)
- Test: `artifacts/api-server/src/routes/__tests__/device-playlist.test.ts`

**Interfaces:**
- Consumes: `screenOrientationOf`, `pieceOrientationOf` (Task 1).
- Produces: 400 `{ error: "Peça vertical não toca em TV horizontal" }` ou `{ error: "Peça horizontal não toca em TV retrato" }`; 404 `{ error: "Device or announcement not found" }`.

- [ ] **Step 1: Teste que falha**

Em `device-playlist.test.ts`:

1. Mock: `devicesTable: { id: "id", clientId: "clientId", deviceKey: "deviceKey", orientation: "orientation" }` e `announcementsTable` ganha `orientation: "orientation"`.
2. O teste existente "aceita peça sem imagem" passa a enfileirar a checagem primeiro:
   `selectResults = [[{ deviceOrientation: "landscape", pieceOrientation: "landscape" }], [{ maxOrder: 0 }], [SEM_IMAGEM]];`
3. Acrescentar ao `describe("POST /devices/:id/playlist/add")`:

```ts
  it("recusa peça vertical em TV horizontal, sem inserir", async () => {
    selectResults = [[{ deviceOrientation: "landscape", pieceOrientation: "portrait" }]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 102 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Peça vertical não toca em TV horizontal" });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("recusa peça horizontal em TV retrato", async () => {
    selectResults = [[{ deviceOrientation: "portrait_left", pieceOrientation: "landscape" }]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 102 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Peça horizontal não toca em TV retrato" });
  });

  it("aceita peça vertical em TV retrato", async () => {
    selectResults = [
      [{ deviceOrientation: "portrait_right", pieceOrientation: "portrait" }],
      [{ maxOrder: 0 }],
      [SEM_IMAGEM],
    ];
    insertResult = [{ id: SEM_IMAGEM.id }];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 102 });

    expect(res.status).toBe(201);
  });

  it("404 quando a TV ou a peça não existe", async () => {
    selectResults = [[]];

    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).post("/devices/1/playlist/add").send({ announcementId: 999 });

    expect(res.status).toBe(404);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- device-playlist`
Expected: FAIL — os dois 400 voltam 201 e o 404 dá erro.

- [ ] **Step 3: Implementar**

`artifacts/api-server/src/routes/devices.ts`, import: `import { pieceOrientationOf, screenOrientationOf } from "@workspace/db/orientation";`

Em `POST /devices/:id/playlist/add`, logo depois de `const deviceId = params.data.id;`:

```ts
  // Peça de outra orientação nunca iria ao ar nesta TV (o feed filtra); aceitar
  // deixaria um item fantasma na playlist, contando como se estivesse passando.
  const [pair] = await db
    .select({ deviceOrientation: devicesTable.orientation, pieceOrientation: announcementsTable.orientation })
    .from(devicesTable)
    .innerJoin(announcementsTable, eq(announcementsTable.id, parsed.data.announcementId))
    .where(eq(devicesTable.id, deviceId));
  if (!pair) {
    res.status(404).json({ error: "Device or announcement not found" });
    return;
  }
  const screen = screenOrientationOf(pair.deviceOrientation);
  const piece = pieceOrientationOf(pair.pieceOrientation);
  if (screen !== piece) {
    res.status(400).json({
      error: piece === "portrait" ? "Peça vertical não toca em TV horizontal" : "Peça horizontal não toca em TV retrato",
    });
    return;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server test -- device-playlist`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/devices.ts artifacts/api-server/src/routes/__tests__/device-playlist.test.ts
git commit -m "feat(api): playlist recusa peça de outra orientação"
```

---

### Task 8: `tv.html` gira o palco

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts`

**Interfaces:**
- Consumes: `GET /api/display/:key/feed` (Task 6).
- Produces: `<div id="stage">` com `className` `""` | `"portrait-right"` | `"portrait-left"`.

Por que as medidas internas não mudam: numa tela física deitada, `1vh` é sempre 1% do lado curto. Com o palco girado, o lado curto passa a ser a largura visível, e legenda (14vh) e QR (12vh) continuam proporcionais ao lado curto. Não precisa de classe para trocar `vh` por `vw` (corrige a spec).

- [ ] **Step 1: Ajustar o harness e escrever os testes que falham**

Em `tv-html.test.ts`:

1. Junto das outras variáveis: `let orientacao = "landscape";` e, no `beforeEach`, `orientacao = "landscape";`.
2. No `XhrStub.send`, trocar a linha do 200 por:

```ts
      if (statusDaLista === 200) {
        // /feed embrulha a lista com a orientação da TV; /slides é a lista pura.
        this.responseText = this.url.indexOf("/feed") >= 0
          ? JSON.stringify({ screen: { orientation: orientacao }, slides: listaDeSlides })
          : JSON.stringify(listaDeSlides);
```

3. Nas asserções de URL (linhas ~322, 331, 339, 348, 446), trocar `/slides` por `/feed` (ex.: `` expect(gets[0]).toContain(`/api/display/${key}/feed`); `` e `/\/api\/display\/[0-9A-F]{16}\/feed/`).
4. Novo bloco no fim:

```ts
describe("tv.html: TV em retrato", () => {
  const palco = () => document.getElementById("stage")!;

  it("TV deitada não gira", () => {
    listaDeSlides = [slide(1, "/api/uploads/a.png")];
    carregarTv();
    expect(palco().className).toBe("");
  });

  it("portrait_right gira o palco para a direita", () => {
    orientacao = "portrait_right";
    listaDeSlides = [slide(1, "/api/uploads/a.png")];
    carregarTv();
    expect(palco().className).toBe("portrait-right");
  });

  it("portrait_left gira para a esquerda", () => {
    orientacao = "portrait_left";
    listaDeSlides = [slide(1, "/api/uploads/a.png")];
    carregarTv();
    expect(palco().className).toBe("portrait-left");
  });

  it("slides, legenda, QR, progresso e tela vazia ficam dentro do palco; pareamento fica fora", () => {
    carregarTv();
    for (const id of ["slot-a", "slot-b", "yt-slot", "overlay", "progress-track", "qr-box", "empty-screen"]) {
      expect(palco().contains(document.getElementById(id))).toBe(true);
    }
    expect(palco().contains(document.getElementById("pair-screen"))).toBe(false);
  });

  it("troca de orientação no refresh gira o palco e recomeça do primeiro slide", () => {
    listaDeSlides = [slide(1, "/api/uploads/a.png"), slide(2, "/api/uploads/b.png")];
    carregarTv();
    responder("/api/uploads/a.png", true);
    vi.advanceTimersByTime(5000);
    responder("/api/uploads/b.png", true);
    expect(noAr()).toContain("b.png");

    orientacao = "portrait_right";
    vi.advanceTimersByTime(60000);
    expect(palco().className).toBe("portrait-right");
    responder("/api/uploads/a.png", true);
    expect(noAr()).toContain("a.png");
  });

  it("o CSS gira com prefixo -webkit- para os WebViews antigos", () => {
    expect(HTML).toMatch(/#stage\.portrait-right\s*\{[^}]*-webkit-transform:\s*translate\(-50%,\s*-50%\)\s*rotate\(90deg\)/);
    expect(HTML).toMatch(/#stage\.portrait-left\s*\{[^}]*-webkit-transform:\s*translate\(-50%,\s*-50%\)\s*rotate\(-90deg\)/);
  });
});
```

Se o teste de troca não bater com o avanço de slide do harness (duração 5 s, `tickMs` 80), ajustar só os tempos seguindo o padrão dos testes vizinhos. A intenção é: o slide 2 está no ar, a orientação muda, e o slide 1 volta.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- tv-html`
Expected: FAIL — sem `#stage`, URL ainda `/slides`, e o JSON do `/feed` não é lista.

- [ ] **Step 3: Implementar o CSS**

Depois do bloco `html, body { ... }`:

```css
    /* Palco: tudo o que vai ao ar. Na TV em pé, a TV é uma tela comum girada na
       parede e a box segue mandando imagem deitada; quem gira é este palco.
       Largura e altura trocadas (100vh x 100vw) e rotação em torno do centro.
       As medidas internas em vh não mudam: 1vh segue sendo 1% do lado curto
       da tela, que é o que legenda e QR usam. */
    #stage {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      overflow: hidden;
    }
    #stage.portrait-right,
    #stage.portrait-left {
      right: auto; bottom: auto;
      top: 50%; left: 50%;
      width: 100vh; height: 100vw;
    }
    #stage.portrait-right {
      -webkit-transform: translate(-50%, -50%) rotate(90deg);
      transform: translate(-50%, -50%) rotate(90deg);
    }
    #stage.portrait-left {
      -webkit-transform: translate(-50%, -50%) rotate(-90deg);
      transform: translate(-50%, -50%) rotate(-90deg);
    }
```

- [ ] **Step 4: Implementar o HTML**

Envolver, na ordem atual, `#slot-a`, `#slot-b`, `#yt-slot`, `#overlay`, `#progress-track`, `#qr-box` e `#empty-screen` em `<div id="stage"> ... </div>`. `#fs-hint` e `#pair-screen` ficam fora: o aviso é para quem está com o controle, e o pareamento acontece antes de a TV ter orientação.

- [ ] **Step 5: Implementar o JS (ES5)**

Junto dos DOM refs:

```js
      var stageEl      = document.getElementById('stage');
      var screenOrientation = 'landscape';

      // Aplica o giro que o servidor mandou. Devolve true se mudou, para o
      // chamador recomeçar a rotação do primeiro slide já no formato novo.
      function applyOrientation(orientation) {
        var o = orientation === 'portrait_right' || orientation === 'portrait_left' ? orientation : 'landscape';
        stageEl.className = o === 'portrait_right' ? 'portrait-right' : o === 'portrait_left' ? 'portrait-left' : '';
        var mudou = o !== screenOrientation;
        screenOrientation = o;
        return mudou;
      }
```

Em `fetchAndStart`:

```js
        var url = apiBase() + '/api/display/' + encodeURIComponent(key) + '/feed';
```

Trocar o trecho do `if (err || !data)` em diante até `slides = data;` por:

```js
          var lista = data && data.slides;
          if (err || !lista) {
            if (!isRefresh) { emptyEl.className = 'visible'; }
            return;
          }
          hidePairing();

          var girou = applyOrientation(data.screen && data.screen.orientation);

          // Lista vazia é resposta boa do servidor, não falha: a TV tem de
          // parar. Antes isso caía no mesmo return do erro e a campanha
          // seguia em loop para sempre depois de sair do ar.
          if (lista.length === 0) {
            showEmpty();
            return;
          }

          emptyEl.className = '';

          // On refresh, only reset if the slide list (or the rotation) changed
          var changed = girou || lista.length !== slides.length;
          if (!changed) {
            for (var i = 0; i < lista.length; i++) {
              if (lista[i].announcementId !== slides[i].announcementId) { changed = true; break; }
            }
          }

          slides = lista;
```

(o resto da função fica igual). Atualizar o comentário do `xhrGet` que cita `GetDeviceSlides -> routes/display.ts` para citar `GetDisplayFeed`.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage test -- tv-html`
Expected: PASS, incluindo os testes antigos (arte que não carrega, pareamento, tela cheia).

- [ ] **Step 7: Conferir ES5**

Run: `sed -n '/<script>/,/<\/script>/p' artifacts/signage/public/tv.html | grep -nE '\b(let|const)\b|=>|`'`
Expected: nenhuma linha.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): tv.html gira o palco nas TVs em retrato"
```

---

### Task 9: `display.tsx` usa `/feed` e gira o palco

**Files:**
- Create: `artifacts/signage/src/lib/stage-rotation.ts`
- Modify: `artifacts/signage/src/pages/display.tsx`
- Test: `artifacts/signage/src/lib/__tests__/stage-rotation.test.ts`

**Interfaces:**
- Consumes: `useGetDisplayFeed`, `getGetDisplayFeedQueryKey` (Task 2).
- Produces: `stageStyle(orientation: string | undefined): React.CSSProperties`.

- [ ] **Step 1: Teste que falha**

`artifacts/signage/src/lib/__tests__/stage-rotation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stageStyle } from '../stage-rotation';

describe('stageStyle', () => {
  it('TV deitada ocupa a tela, sem giro', () => {
    expect(stageStyle('landscape')).toEqual({ position: 'absolute', inset: 0 });
    expect(stageStyle(undefined)).toEqual({ position: 'absolute', inset: 0 });
  });

  it('portrait_right troca largura e altura e gira 90°', () => {
    expect(stageStyle('portrait_right')).toEqual({
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '100vh',
      height: '100vw',
      transform: 'translate(-50%, -50%) rotate(90deg)',
    });
  });

  it('portrait_left gira -90°', () => {
    expect(stageStyle('portrait_left').transform).toBe('translate(-50%, -50%) rotate(-90deg)');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- stage-rotation`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o helper**

`artifacts/signage/src/lib/stage-rotation.ts`:

```ts
import type { CSSProperties } from 'react';

/**
 * Espelho do `#stage` de `public/tv.html` — mudou lá, mude aqui. A TV retrato
 * é uma TV comum girada na parede: o palco troca largura por altura e gira em
 * torno do centro. As medidas em vh de dentro não mudam (1vh segue sendo 1%
 * do lado curto da tela).
 */
export function stageStyle(orientation: string | undefined): CSSProperties {
  if (orientation !== 'portrait_right' && orientation !== 'portrait_left') {
    return { position: 'absolute', inset: 0 };
  }
  const deg = orientation === 'portrait_right' ? 90 : -90;
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '100vh',
    height: '100vw',
    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
  };
}
```

- [ ] **Step 4: Ligar no `display.tsx`**

Imports: trocar `useGetDeviceSlides, getGetDeviceSlidesQueryKey` por `useGetDisplayFeed, getGetDisplayFeedQueryKey`; acrescentar `import { stageStyle } from '@/lib/stage-rotation';`.

Fora do componente:

```ts
// Referência estável: `[]` novo a cada render reiniciaria o timer do slide.
const NO_SLIDES: never[] = [];
```

Trocar a busca:

```ts
  const { data: feed, isLoading, isError } = useGetDisplayFeed(deviceKey, {
    query: {
      enabled: !!deviceKey,
      queryKey: getGetDisplayFeedQueryKey(deviceKey),
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
    },
  });
  const slides = feed?.slides ?? NO_SLIDES;
  const orientation = feed?.screen.orientation;

  // Mesma regra do tv.html: girou, recomeça do primeiro slide no formato novo.
  useEffect(() => {
    setCurrentIndex(0);
    setProgress(0);
  }, [orientation]);
```

(o `useEffect` entra depois das declarações de `useState`).

No `return` principal, manter o contêiner externo como moldura preta e mover o conteúdo para o palco:

```tsx
  return (
    <div className="relative h-[100dvh] w-screen bg-black overflow-hidden select-none">
      <div style={stageStyle(orientation)} className="flex items-center justify-center overflow-hidden">
        {/* ...YouTubeSlide / AnimatePresence, SlideCaption, QR e barra de progresso, como estão hoje... */}
      </div>
      <FullscreenHint />
    </div>
  );
```

`FullscreenHint` sai do palco (como o `#fs-hint` do tv.html). O `EmptyState` recebe `orientation` e usa o mesmo palco:

```tsx
function EmptyState({ title, subtitle, orientation }: { title: string; subtitle: string; orientation?: string }) {
  return (
    <div className="relative h-[100dvh] w-screen bg-black text-white">
      <FullscreenHint />
      <div style={stageStyle(orientation)} className="flex flex-col items-center justify-center">
        {/* conteúdo atual (ícone, título, subtítulo) */}
      </div>
    </div>
  );
}
```

Passar `orientation={orientation}` no `EmptyState` de "Nenhum slide configurado".

- [ ] **Step 5: Rodar testes e typecheck**

Run: `pnpm --filter @workspace/signage test && pnpm --filter @workspace/signage typecheck`
Expected: PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/lib/stage-rotation.ts artifacts/signage/src/lib/__tests__/stage-rotation.test.ts artifacts/signage/src/pages/display.tsx
git commit -m "feat(tv): display.tsx usa o feed e gira o palco"
```

---

### Task 10: Moldura em pé nas prévias

**Files:**
- Create: `artifacts/signage/src/components/piece-preview.tsx`
- Modify: `artifacts/signage/src/components/device-preview.tsx`, `artifacts/signage/src/components/tv-preview-grid.tsx`
- Test: `artifacts/signage/src/components/__tests__/piece-preview.test.tsx` (novo), `artifacts/signage/src/components/__tests__/device-preview.test.tsx`

**Interfaces:**
- Consumes: `screenOrientationOf` (Task 1), `Device.orientation`/`PortalDevice.orientation` (Task 2).
- Produces:
  - `tvFrameClass(orientation: 'landscape' | 'portrait'): string` (exportado de `piece-preview.tsx`)
  - `<PiecePreview orientation posterUrl caption videoId? />`, com `data-testid="piece-frame"` e `data-orientation`
  - `<DevicePreview slides orientation? compact? />`, com `data-testid="tv-frame"` e `data-orientation`
  - `TvPreviewGridProps.devices: Array<{ id: number; name: string; orientation?: string }>`

- [ ] **Step 1: Testes que falham**

`artifacts/signage/src/components/__tests__/piece-preview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PiecePreview } from '../piece-preview';

describe('PiecePreview', () => {
  it('moldura deitada para peça horizontal', () => {
    render(<PiecePreview orientation="landscape" posterUrl="/a.png" caption={null} />);
    const frame = screen.getByTestId('piece-frame');
    expect(frame.dataset.orientation).toBe('landscape');
    expect(frame.className).toContain('aspect-video');
  });

  it('moldura em pé para peça vertical', () => {
    render(<PiecePreview orientation="portrait" posterUrl="/a.png" caption={null} />);
    const frame = screen.getByTestId('piece-frame');
    expect(frame.dataset.orientation).toBe('portrait');
    expect(frame.className).toContain('aspect-[9/16]');
  });

  it('mostra a legenda por cima quando há texto', () => {
    render(<PiecePreview orientation="portrait" posterUrl="/a.png" caption="Pão quente às 17h" />);
    expect(screen.getByText('Pão quente às 17h')).toBeInTheDocument();
  });

  it('sem mídia mostra o aviso em vez de moldura vazia', () => {
    render(<PiecePreview orientation="landscape" posterUrl={null} caption={null} />);
    expect(screen.getByText('Escolha uma imagem ou cole um link')).toBeInTheDocument();
  });

  it('vídeo começa na capa e toca o embed mudo no clique', async () => {
    render(<PiecePreview orientation="portrait" posterUrl="/capa.jpg" caption={null} videoId="abc123def45" />);
    expect(document.querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tocar prévia do vídeo' }));
    const iframe = document.querySelector('iframe')!;
    expect(iframe.src).toContain('https://www.youtube.com/embed/abc123def45');
    expect(iframe.src).toContain('mute=1');
  });
});
```

Em `device-preview.test.tsx`, acrescentar (usando a fixture de slide que o arquivo já tem — aqui chamada `SLIDE`; trocar pelo nome real):

```tsx
  it('TV retrato usa moldura em pé', () => {
    render(<DevicePreview slides={[SLIDE]} orientation="portrait" />);
    const frame = screen.getByTestId('tv-frame');
    expect(frame.dataset.orientation).toBe('portrait');
    expect(frame.className).toContain('aspect-[9/16]');
  });

  it('sem orientação continua deitada', () => {
    render(<DevicePreview slides={[SLIDE]} />);
    expect(screen.getByTestId('tv-frame').className).toContain('aspect-video');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- piece-preview device-preview`
Expected: FAIL — `../piece-preview` não existe; `tv-frame` não encontrado.

- [ ] **Step 3: Implementar `piece-preview.tsx`**

```tsx
import { useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

type Orientation = 'landscape' | 'portrait';

/**
 * Moldura de TV na proporção da orientação. Vertical tem largura máxima: 9:16
 * na largura toda do dialog ficaria mais alto que a tela.
 */
export function tvFrameClass(orientation: Orientation): string {
  return orientation === 'portrait'
    ? 'mx-auto aspect-[9/16] w-full max-w-[16rem]'
    : 'aspect-video w-full';
}

/**
 * Prévia da peça na biblioteca, antes de salvar: mesmo `cover` e mesma
 * legenda que a TV usa. Medidas em `cqmin` (1% do lado curto da moldura),
 * pelo mesmo motivo do `vh` no player: legenda e QR seguem o lado curto nas
 * duas orientações.
 */
export function PiecePreview({
  orientation,
  posterUrl,
  caption,
  videoId,
}: {
  orientation: Orientation;
  posterUrl: string | null;
  caption: string | null;
  videoId?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const showVideo = playing && !!videoId;

  return (
    <div
      data-testid="piece-frame"
      data-orientation={orientation}
      className={cn('relative overflow-hidden rounded-lg bg-black', tvFrameClass(orientation))}
      style={{ containerType: 'size' }}
    >
      {showVideo ? (
        <iframe
          title="Prévia do vídeo"
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0`}
          allow="autoplay; encrypted-media"
        />
      ) : posterUrl ? (
        <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/60">
          Escolha uma imagem ou cole um link
        </p>
      )}

      {videoId && !showVideo ? (
        <button
          type="button"
          aria-label="Tocar prévia do vídeo"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/20 text-white hover:bg-black/30"
        >
          <Play className="h-[14cqmin] w-[14cqmin] fill-current" />
        </button>
      ) : null}

      {/* Espelho de components/slide-caption.tsx com cqmin no lugar de vh. */}
      {caption ? (
        <div className="pointer-events-none absolute bottom-[3cqmin] left-[3cqmin] right-[3cqmin] z-10">
          <span className="inline-block h-[14cqmin] max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[1cqmin] bg-black/55 px-[3cqmin] text-[5cqmin] font-medium leading-[14cqmin] tracking-tight text-white">
            {caption}
          </span>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Moldura em pé no `DevicePreview`**

`artifacts/signage/src/components/device-preview.tsx`:

1. `import { tvFrameClass } from '@/components/piece-preview';`
2. Assinatura: `export function DevicePreview({ slides, compact = false, orientation = 'landscape' }: { slides: DevicePreviewSlide[]; compact?: boolean; orientation?: 'landscape' | 'portrait' })`
3. Trocar **todas** as ocorrências de `cqh` por `cqmin` no arquivo, classes e comentários: `sed -i '' 's/cqh/cqmin/g' artifacts/signage/src/components/device-preview.tsx`. `cqmin` é 1% do lado curto do palco: igual a `cqh` na moldura deitada, e certo também na moldura em pé. Acrescentar essa frase ao comentário do topo. Conferir com `grep -c cqh artifacts/signage/src/components/device-preview.tsx` → `0`.
4. Palco vazio: `className={cn('flex flex-col items-center justify-center rounded-lg bg-black px-6 text-center text-white', tvFrameClass(orientation))}` com `data-testid="tv-frame" data-orientation={orientation}`.
5. Palco com slide: `className={cn('relative overflow-hidden rounded-lg bg-black select-none', tvFrameClass(orientation))}` com `data-testid="tv-frame" data-orientation={orientation}` (tira o `aspect-video w-full` fixo).

`artifacts/signage/src/components/tv-preview-grid.tsx`:

1. `import { screenOrientationOf } from '@workspace/db/orientation';`
2. `devices: Array<{ id: number; name: string; orientation?: string }>;` e o mesmo tipo em `TvPreviewCard`.
3. `<DevicePreview slides={preview.data ?? []} compact orientation={screenOrientationOf(device.orientation)} />`
4. O `Skeleton` e o aviso de erro usam `tvFrameClass(screenOrientationOf(device.orientation))` no lugar de `aspect-video w-full`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage test -- piece-preview device-preview tv-preview-grid`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components
git commit -m "feat(portal): prévia em pé para peça e TV em retrato"
```

---

### Task 11: Preview e orientação no formulário da biblioteca

**Files:**
- Create: `artifacts/signage/src/lib/piece-orientation.ts`, `artifacts/signage/src/components/piece-orientation-field.tsx`
- Modify: `artifacts/signage/src/pages/admin.tsx`
- Test: `artifacts/signage/src/lib/__tests__/piece-orientation.test.ts`, `artifacts/signage/src/components/__tests__/piece-orientation-field.test.tsx`

**Interfaces:**
- Consumes: `PiecePreview`, `tvFrameClass` (Task 10); `getYouTubeMeta` (Task 2); `parseYouTubeUrl`, `youtubeThumbnailUrl` (`@workspace/db/youtube`); `pieceOrientationOf` (Task 1).
- Produces:
  - `imageOrientation(file: File): Promise<'landscape' | 'portrait'>`
  - `<PieceOrientationField mediaKind youtubeUrl files fallbackPoster caption value onChange />`

- [ ] **Step 1: Testes que falham**

`artifacts/signage/src/lib/__tests__/piece-orientation.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageOrientation } from '../piece-orientation';

function stubImage(width: number, height: number, falha = false) {
  class ImageStub {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      queueMicrotask(() => (falha ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal('Image', ImageStub);
  // jsdom não tem createObjectURL. Troca só os dois métodos: substituir o
  // `URL` inteiro quebraria o `new URL(...)` de quem vier depois.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
}

afterEach(() => vi.unstubAllGlobals());

const arquivo = new File(['x'], 'arte.png', { type: 'image/png' });

describe('imageOrientation', () => {
  it('mais alta que larga é vertical', async () => {
    stubImage(1080, 1920);
    await expect(imageOrientation(arquivo)).resolves.toBe('portrait');
  });
  it('deitada é horizontal', async () => {
    stubImage(1920, 1080);
    await expect(imageOrientation(arquivo)).resolves.toBe('landscape');
  });
  it('quadrada é horizontal', async () => {
    stubImage(1000, 1000);
    await expect(imageOrientation(arquivo)).resolves.toBe('landscape');
  });
  it('arquivo ilegível é horizontal (o seletor corrige)', async () => {
    stubImage(0, 0, true);
    await expect(imageOrientation(arquivo)).resolves.toBe('landscape');
  });
});
```

`artifacts/signage/src/components/__tests__/piece-orientation-field.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PieceOrientationField } from '../piece-orientation-field';

vi.mock('@/lib/piece-orientation', () => ({
  imageOrientation: vi.fn(async () => 'portrait'),
}));

function fileList(file: File): FileList {
  return { 0: file, length: 1, item: () => file } as unknown as FileList;
}

const base = {
  mediaKind: 'image' as const,
  youtubeUrl: '',
  files: undefined as FileList | undefined,
  fallbackPoster: null,
  caption: null,
  value: 'landscape' as const,
};

beforeEach(() => {
  // Só os dois métodos que o jsdom não tem; o `new URL` do parseYouTubeUrl segue real.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:arte', configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PieceOrientationField', () => {
  it('imagem escolhida: detecta vertical e mostra a arte local', async () => {
    const onChange = vi.fn();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    render(<PieceOrientationField {...base} files={fileList(file)} onChange={onChange} />);

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('portrait'));
    expect(screen.getByTestId('piece-frame').querySelector('img')!.getAttribute('src')).toBe('blob:arte');
  });

  it('link de Short: mostra "Detectando formato…" e aplica a resposta do servidor', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let responder!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (responder = r))));
    const onChange = vi.fn();

    render(
      <PieceOrientationField
        {...base}
        mediaKind="youtube_video"
        youtubeUrl="https://www.youtube.com/shorts/abc123def45"
        onChange={onChange}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('Detectando formato…')).toBeInTheDocument();

    await act(async () => {
      responder(
        new Response(JSON.stringify({ kind: 'youtube_video', id: 'abc123def45', orientation: 'portrait' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('portrait'));
    expect(screen.queryByText('Detectando formato…')).toBeNull();
  });

  it('edição: link já salvo não é redetectado (mantém a escolha manual)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PieceOrientationField
        {...base}
        mediaKind="youtube_video"
        youtubeUrl="https://www.youtube.com/watch?v=abc123def45"
        value="portrait"
        onChange={vi.fn()}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('seletor troca a orientação e a moldura segue o valor', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PieceOrientationField {...base} onChange={onChange} />);
    expect(screen.getByTestId('piece-frame').dataset.orientation).toBe('landscape');

    await userEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    expect(onChange).toHaveBeenCalledWith('portrait');

    rerender(<PieceOrientationField {...base} value="portrait" onChange={onChange} />);
    expect(screen.getByTestId('piece-frame').dataset.orientation).toBe('portrait');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- piece-orientation`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `lib/piece-orientation.ts`**

```ts
/**
 * Formato de uma imagem escolhida no formulário, lido das dimensões reais do
 * arquivo. Quadrada ou ilegível conta como horizontal: é o caso comum, e o
 * operador corrige no seletor.
 */
export function imageOrientation(file: File): Promise<'landscape' | 'portrait'> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalHeight > img.naturalWidth ? 'portrait' : 'landscape');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('landscape');
    };
    img.src = url;
  });
}
```

- [ ] **Step 4: Implementar `components/piece-orientation-field.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { getYouTubeMeta } from '@workspace/api-client-react';
import { parseYouTubeUrl, youtubeThumbnailUrl } from '@workspace/db/youtube';
import { PiecePreview } from '@/components/piece-preview';
import { imageOrientation } from '@/lib/piece-orientation';
import { cn } from '@/lib/utils';

type Orientation = 'landscape' | 'portrait';
type MediaKind = 'image' | 'youtube_video' | 'youtube_playlist';

const DEBOUNCE_MS = 500;

const OPTIONS: Array<{ value: Orientation; label: string }> = [
  { value: 'landscape', label: 'Horizontal' },
  { value: 'portrait', label: 'Vertical' },
];

/**
 * Preview da peça e o seletor de orientação, no formulário da biblioteca.
 * Detecta sozinho quando o operador escolhe outro arquivo ou cola outro link;
 * o que já veio salvo (edição) não é redetectado, para não desfazer uma
 * correção manual.
 */
export function PieceOrientationField({
  mediaKind,
  youtubeUrl,
  files,
  fallbackPoster,
  caption,
  value,
  onChange,
}: {
  mediaKind: MediaKind;
  youtubeUrl: string;
  files: FileList | undefined;
  /** Arte já salva (edição), mostrada enquanto nenhum arquivo novo é escolhido. */
  fallbackPoster: string | null;
  caption: string | null;
  value: Orientation;
  onChange: (value: Orientation) => void;
}) {
  const file = files && files.length > 0 ? files[0] : undefined;
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const initialUrl = useRef(youtubeUrl);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Arte local para o preview; liberada ao trocar de arquivo ou fechar o dialog.
  useEffect(() => {
    if (!file) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Arquivo novo: a orientação vem das dimensões da imagem. Em peça de
  // YouTube o arquivo é só a capa de fallback e não decide nada.
  useEffect(() => {
    if (!file || mediaKind !== 'image') return;
    let cancelled = false;
    imageOrientation(file).then((o) => {
      if (!cancelled) onChangeRef.current(o);
    });
    return () => {
      cancelled = true;
    };
  }, [file, mediaKind]);

  // Link novo: pergunta ao servidor (Short por watch?v= só o oEmbed revela).
  useEffect(() => {
    if (mediaKind === 'image' || youtubeUrl === initialUrl.current || !parseYouTubeUrl(youtubeUrl)) {
      setDetecting(false);
      return;
    }
    let cancelled = false;
    setDetecting(true);
    const timer = setTimeout(() => {
      getYouTubeMeta({ url: youtubeUrl })
        .then((meta) => {
          if (!cancelled) onChangeRef.current(meta.orientation);
        })
        .catch(() => {
          // Sem resposta: fica o que está marcado; o operador decide.
        })
        .finally(() => {
          if (!cancelled) setDetecting(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mediaKind, youtubeUrl]);

  const ref = mediaKind === 'image' ? null : parseYouTubeUrl(youtubeUrl);
  const videoId = ref?.kind === 'youtube_video' ? ref.id : null;
  const poster = localUrl ?? (videoId ? youtubeThumbnailUrl(videoId) : fallbackPoster);

  return (
    <div className="space-y-3">
      <PiecePreview orientation={value} posterUrl={poster} caption={caption} videoId={videoId} />
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Orientação da peça" className="inline-flex rounded-md border p-0.5">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors',
                value === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {detecting ? <span className="text-xs text-muted-foreground">Detectando formato…</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {value === 'portrait' ? 'Toca só nas TVs em modo retrato.' : 'Toca só nas TVs deitadas.'}
      </p>
    </div>
  );
}
```

Se o orval gerar a função com outro nome (conferir: `grep -n "export const getYouTubeMeta\b" -r lib/api-client-react/src/generated`), usar o nome gerado.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage test -- piece-orientation`
Expected: PASS.

- [ ] **Step 6: Ligar no `admin.tsx`**

1. Imports: `import { PieceOrientationField } from '@/components/piece-orientation-field';`, `import { tvFrameClass } from '@/components/piece-preview';` e `import { pieceOrientationOf } from '@workspace/db/orientation';`.
2. `uploadSchema` e `editSchema`: acrescentar `orientation: z.enum(['landscape', 'portrait']).default('landscape'),` depois de `audioMode`.
3. `defaultValues` dos dois `useForm`: `orientation: 'landscape',`.
4. `onUpload` e `onEditSubmit`: `formData.append('orientation', values.orientation);` depois de `formData.append('audioMode', ...)`.
5. `openEdit`: `orientation: pieceOrientationOf(item.orientation),`.
6. Dialog de criar: `<DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">` e o `<form>` vira grade com o preview à direita:

```tsx
<form onSubmit={form.handleSubmit(onUpload)} className="mt-4 grid gap-6 md:grid-cols-[1fr_16rem]">
  <div className="space-y-6">
    {/* todos os FormField atuais, na mesma ordem */}
  </div>
  <div className="md:sticky md:top-0 self-start">
    <PieceOrientationField
      mediaKind={form.watch('mediaKind')}
      youtubeUrl={form.watch('youtubeUrl')}
      files={form.watch('image') as FileList | undefined}
      fallbackPoster={null}
      caption={form.watch('showText') ? form.watch('displayText') || null : null}
      value={form.watch('orientation')}
      onChange={(o) => form.setValue('orientation', o)}
    />
  </div>
  <DialogFooter className="pt-4 md:col-span-2">
    {/* botão atual */}
  </DialogFooter>
</form>
```

7. Dialog de editar: mesma mudança com `editForm`, e `fallbackPoster={editing ? (editing.imageUrl ? mediaUrl(editing.imageUrl) : null) : null}`.
8. Texto do campo de imagem: trocar o "Recomendado: ..." por `Horizontal: <strong>1920x1080</strong>. Vertical: <strong>1080x1920</strong>.`
9. Lista (`SortableAnnouncementRow`): a caixa da miniatura usa `item.orientation === 'portrait' ? 'h-24 w-[3.375rem]' : 'h-16 w-24'` no lugar de `h-16 w-24`, e depois do selo de YouTube:

```tsx
          {item.orientation === 'portrait' && (
            <span className="ml-2 rounded bg-emerald-600/10 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              Vertical
            </span>
          )}
```

(`tvFrameClass` não é usado na lista; se não sobrar uso dele no arquivo, remover o import.)

- [ ] **Step 7: Rodar testes e typecheck do web**

Run: `pnpm --filter @workspace/signage test && pnpm --filter @workspace/signage typecheck`
Expected: PASS.

- [ ] **Step 8: Conferir no navegador**

Run: `pnpm --filter @workspace/signage dev` (com a API rodando, `pnpm --filter @workspace/api-server dev`). Na biblioteca de mídia:
- escolher uma imagem 1080x1920 → moldura em pé e "Vertical" marcado;
- colar `https://www.youtube.com/shorts/<id>` → "Detectando formato…", depois moldura em pé com a capa; o clique toca mudo;
- ligar "Mostrar texto" com um texto → legenda aparece no preview;
- salvar → a peça aparece na lista com o selo "Vertical" e miniatura em pé;
- editar a peça → abre com "Vertical" marcado, sem redetectar.

- [ ] **Step 9: Commit**

```bash
git add artifacts/signage/src
git commit -m "feat(portal): preview e orientação da peça na biblioteca"
```

---

### Task 12: Orientação na página da TV

**Files:**
- Modify: `artifacts/signage/src/pages/device-detail.tsx`
- Test: `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`

**Interfaces:**
- Consumes: `useUpdateDevice`, `Device.orientation` (Task 2); `screenOrientationOf`, `pieceOrientationOf` (Task 1); `DevicePreview orientation` (Task 10).
- Produces: `<select aria-label="Orientação da TV">`; `PlaylistTab({ deviceId, screen })`.

- [ ] **Step 1: Testes que falham**

Em `device-detail.test.tsx`:

1. `DEVICE` ganha `orientation: 'landscape'`; `ANUNCIO` ganha `orientation: 'landscape'`.
2. Novo helper e testes:

```tsx
const VERTICAL = { ...ANUNCIO, id: 102, title: 'Short da padaria', orientation: 'portrait' };

/** API normal, com a TV e as peças escolhidas; guarda os PATCH enviados. */
function stubTv(device: typeof DEVICE, anuncios: unknown[], patches: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patches.push(body);
        return json({ ...device, ...body });
      }
      if (url.includes('/playlist')) return json([]);
      if (url.includes('/preview')) return json([]);
      if (url.includes('/announcements')) return json(anuncios);
      if (url.includes('/devices/1')) return json(device);
      return json([]);
    }),
  );
}

describe('orientação da TV', () => {
  it('trocar para retrato envia o PATCH com a orientação', async () => {
    const patches: unknown[] = [];
    stubTv(DEVICE, [ANUNCIO], patches);
    renderPagina();

    const select = await screen.findByLabelText('Orientação da TV');
    await userEvent.selectOptions(select, 'portrait_right');

    await waitFor(() => expect(patches).toEqual([{ orientation: 'portrait_right' }]));
  });

  it('TV retrato só oferece peças verticais na playlist', async () => {
    stubTv({ ...DEVICE, orientation: 'portrait_left' }, [ANUNCIO, VERTICAL]);
    renderPagina();

    await userEvent.click(await screen.findByRole('button', { name: /Adicionar anúncio/ }));
    expect(await screen.findByText('Short da padaria')).toBeInTheDocument();
    expect(screen.queryByText('Cartaz da padaria')).toBeNull();
  });

  it('sem peça compatível, diz qual formato falta', async () => {
    stubTv({ ...DEVICE, orientation: 'portrait_right' }, [ANUNCIO]);
    renderPagina();

    await userEvent.click(await screen.findByRole('button', { name: /Adicionar anúncio/ }));
    expect(await screen.findByText('Nenhuma peça vertical disponível para esta TV.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- device-detail`
Expected: FAIL — não existe `Orientação da TV`; o picker lista as duas peças.

- [ ] **Step 3: Implementar**

`artifacts/signage/src/pages/device-detail.tsx`:

1. Imports: `useUpdateDevice` (junto dos outros hooks) e `import { pieceOrientationOf, screenOrientationOf } from '@workspace/db/orientation';`.
2. Constante no topo do arquivo:

```tsx
/** O sentido importa: girar para o lado errado deixa a arte de cabeça para baixo. */
const DEVICE_ORIENTATION_OPTIONS = [
  { value: 'landscape', label: 'Horizontal' },
  { value: 'portrait_right', label: 'Retrato, girada para a direita ↻' },
  { value: 'portrait_left', label: 'Retrato, girada para a esquerda ↺' },
] as const;
```

3. `PlaylistTab` passa a receber `screen`:

```tsx
function PlaylistTab({ deviceId, screen }: { deviceId: number; screen: 'landscape' | 'portrait' }) {
```

e o filtro vira:

```tsx
  const playlistIds = new Set(playlist.map((p) => p.announcementId));
  // Só o que esta TV consegue tocar: o servidor recusa o resto (400).
  const available = allAnnouncements.filter(
    (a) => !playlistIds.has(a.id) && pieceOrientationOf(a.orientation) === screen,
  );
```

e a mensagem de lista vazia:

```tsx
              <p className="text-muted-foreground text-sm py-4 text-center">
                {allAnnouncements.some((a) => !playlistIds.has(a.id))
                  ? `Nenhuma peça ${screen === 'portrait' ? 'vertical' : 'horizontal'} disponível para esta TV.`
                  : 'Todos os anúncios já estão na playlist.'}
              </p>
```

4. Em `DeviceDetail`, depois do `useGetDevicePreview`:

```tsx
  const queryClient = useQueryClient();
  const updateDevice = useUpdateDevice({
    mutation: {
      // Orientação nova muda a rotação (filtro) e a moldura da prévia.
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
        queryClient.invalidateQueries({ queryKey: getGetDevicePreviewQueryKey(deviceId) });
        toast({ title: 'Orientação salva. A TV gira no próximo minuto.' });
      },
      onError: () => toast({ title: 'Não foi possível salvar a orientação', variant: 'destructive' }),
    },
  });
```

(`useQueryClient` já é importado no arquivo; se `DeviceDetail` já tiver um `queryClient`, reutilizar.)

5. Depois de `if (!device) {...}`: `const screen = screenOrientationOf(device.orientation);`
6. No cabeçalho, logo abaixo do bloco da URL da TV:

```tsx
      <div className="flex items-center gap-3 mb-6">
        <label htmlFor="device-orientation" className="text-sm font-medium shrink-0">Orientação da TV</label>
        <select
          id="device-orientation"
          aria-label="Orientação da TV"
          className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={device.orientation}
          disabled={updateDevice.isPending}
          onChange={(e) =>
            updateDevice.mutate({
              id: deviceId,
              data: { orientation: e.target.value as (typeof DEVICE_ORIENTATION_OPTIONS)[number]['value'] },
            })
          }
        >
          {DEVICE_ORIENTATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
```

7. `<PlaylistTab deviceId={deviceId} screen={screen} />` e `<DevicePreview slides={preview.data ?? []} orientation={screen} />`; o `Skeleton` da prévia usa `tvFrameClass(screen)` (import de `@/components/piece-preview`).
8. Na playlist e no picker, miniatura de peça vertical em pé: onde está `h-10 w-16`, usar `pieceOrientationOf(a.orientation) === 'portrait' ? 'h-16 w-9' : 'h-10 w-16'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage test -- device-detail`
Expected: PASS (inclui o teste antigo do toast de erro no add).

- [ ] **Step 5: Portal do cliente**

Nada a mudar em `portal-client.tsx`: `devices.data` já traz `orientation` (Task 2) e o `TvPreviewGrid` repassa (Task 10). Conferir com `pnpm --filter @workspace/signage test -- portal-client` → PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/pages/device-detail.tsx artifacts/signage/src/pages/__tests__/device-detail.test.tsx
git commit -m "feat(portal): orientação da TV e playlist filtrada"
```

---

### Task 13: Verificação final e PR

**Files:** nenhum código novo.

- [ ] **Step 1: Suíte completa e typecheck**

Run: `pnpm run typecheck && pnpm --filter @workspace/api-server test && pnpm --filter @workspace/signage test`
Expected: tudo verde. Colar a contagem de testes no corpo do PR.

- [ ] **Step 2: Escapes unicode**

Run: `git diff main --name-only | xargs grep -ln '\\u[0-9a-fA-F]\{4\}' 2>/dev/null`
Expected: nenhum arquivo além dos gerados pelo orval (se houver, conferir que não foi escrito à mão).

- [ ] **Step 3: Validação em TV box real (obrigatória, pedir ao dono do projeto)**

Com o deploy de preview, numa TV box com o app Android:
1. Cadastrar a TV como `Retrato, girada para a direita`, com a TV fisicamente girada.
2. Conferir, com a TV em pé: imagem vertical ocupa a tela, Short toca em pé, legenda e QR no canto inferior certo, barra de progresso embaixo.
3. Trocar para `girada para a esquerda` → a TV gira em até 60 s.
4. Voltar para `Horizontal` → peças verticais somem, horizontais voltam.

jsdom não renderiza `transform`: se o WebView da box não girar o iframe do YouTube, parar e reportar antes do merge.

- [ ] **Step 4: PR**

```bash
git push -u origin feat/pecas-verticais
gh pr create --title "feat(tv): peças verticais para TVs em modo retrato" --body "$(cat <<'EOF'
## O que muda

- Peça ganha orientação (horizontal/vertical), detectada no upload: imagem pelas dimensões, YouTube pelo link `/shorts/` ou pelo oEmbed. O operador corrige num seletor.
- TV ganha orientação (horizontal / retrato girada para a direita / para a esquerda), na página da TV.
- Cada TV toca só as peças da orientação dela (campanha, playlist e painel). A playlist recusa peça de outra orientação.
- `GET /display/:key/feed` entrega a rotação com a orientação; `tv.html` e `display.tsx` giram o palco. `/slides` continua (já filtrado) para TVs com `tv.html` antigo em cache.
- Biblioteca de mídia mostra o preview da peça numa moldura 16:9 ou 9:16, com a legenda.

## Compatibilidade

Colunas novas com default `landscape`: conteúdo e TVs atuais não mudam. Painéis do lojista seguem 16:9 e não aparecem em TV retrato (fora do escopo).

## Testes

- [ ] typecheck, testes da API e do web verdes
- [ ] TV box real em retrato (direita e esquerda): imagem, Short, legenda, QR

Spec: `docs/superpowers/specs/2026-09-22-pecas-verticais-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merge só depois da validação do Step 3, com `gh pr merge --merge`.
