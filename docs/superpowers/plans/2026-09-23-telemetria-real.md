# Duração real das exibições e fila de reenvio — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TV registra o tempo real dos vídeos e guarda as exibições não enviadas numa fila que reenvia em lote, sem contar duas vezes.

**Architecture:** Banco ganha `plays.client_play_id` com índice único por TV. A API ganha `POST /api/telemetry/plays` (lote de até 200, idade relativa em vez de data, `ON CONFLICT DO NOTHING`). O `tv.html` passa a registrar `getDuration()` no fim do vídeo e troca o envio fire-and-forget por uma fila no `localStorage`.

**Tech Stack:** Postgres + Drizzle (migração via `drizzle-kit generate`), Express 5, OpenAPI → Orval (Zod em `@workspace/api-zod`), `tv.html` em ES5, Vitest (jsdom no web, node na API).

**Spec:** `docs/superpowers/specs/2026-09-23-telemetria-real-design.md`

## Global Constraints

- `artifacts/signage/public/tv.html` é **ES5**: sem `let`/`const`, arrow function, template string, `Array.prototype.includes`, spread. Todo acesso a `localStorage` em `try/catch`.
- Código e comentários em português, explicando o porquê; acentos como caracteres UTF-8 reais, nunca `\uXXXX`.
- Commits: `tipo(escopo): descrição curta em português`, imperativo, sem ponto final; terminar com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Branch `feat/telemetria-fila` (já existe, com o spec). Nunca criar tag `vX.Y.Z` nem mexer em `versionName`/`versionCode`.
- Migração só de acréscimo: preview e produção usam o **mesmo banco** e as migrações rodam no build do preview.
- `POST /api/telemetry/play` (antigo) continua funcionando sem mudança.
- Constantes da fila (copiar exatamente): lote **200**; idade máxima **7 dias**; teto **70.000** itens; gravação imediata até **500** itens, acima disso no máximo a cada **30 s**; chave `signage_play_queue`; `playId` de **12** caracteres base36.
- Validação do lote: `playId` 8..40 caracteres; `durationSeconds` 0..86400; `ageSeconds` ≥ 0; `plays` 1..200 itens.

## Review Focus

1. **Relógio da TV errado ou que pulou** (item com `shownAtMs` no futuro): `ageSeconds` sai 0, a exibição conta agora — nunca data futura nem negativa. Teste na Task 4.
2. **Fila corrompida no `localStorage`** (JSON inválido, item com formato errado): a TV não quebra, descarta o lixo e continua enviando o que é válido. Teste na Task 4.
3. **Resposta perdida e lote reenviado**: o servidor não conta duas vezes. Teste de `ON CONFLICT` real na Task 1 (Postgres no Docker) e da contagem `duplicates` na Task 2.
4. **Peça apagada enquanto a exibição estava na fila**: só aquele item é descartado; o resto do lote grava. Teste na Task 2.
5. **`getDuration()` do YouTube devolve 0**: a duração cai para a última posição lida pela vigia, não para a duração configurada. Teste na Task 3.

---

### Task 1: Coluna `client_play_id` e índice único (migração 0013)

**Files:**
- Modify: `lib/db/src/schema/plays.ts`
- Create: `lib/db/drizzle/0013_*.sql` (nome gerado pelo drizzle-kit) e `lib/db/drizzle/meta/0013_snapshot.json`, `lib/db/drizzle/meta/_journal.json` (gerados)

**Interfaces:**
- Produces: `playsTable.clientPlayId` (coluna `client_play_id text`, anulável) e o índice único `plays_device_client_play_idx` em `(device_id, client_play_id)`, usados como alvo de `onConflictDoNothing` na Task 2.

- [ ] **Step 1: Alterar o schema**

Em `lib/db/src/schema/plays.ts`, trocar o import e acrescentar a coluna e o índice:

```ts
import { pgTable, serial, integer, real, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
```

Dentro das colunas, depois de `durationSeconds`:

```ts
    // Código que a TV gera para cada exibição da fila de reenvio. Nulo nas
    // linhas antigas e no endpoint antigo (um por vez). Com o índice único
    // abaixo, um lote reenviado porque a resposta se perdeu não conta duas vezes.
    clientPlayId: text("client_play_id"),
```

No array de índices, depois de `plays_device_created_idx`:

```ts
    // Postgres aceita vários NULL num índice único: as linhas antigas não
    // conflitam entre si.
    uniqueIndex("plays_device_client_play_idx").on(t.deviceId, t.clientPlayId),
```

- [ ] **Step 2: Gerar a migração**

Run: `cd lib/db && DATABASE_URL=postgres://gerar@localhost/nada pnpm run generate`
(O `drizzle.config.ts` exige a variável, mas `generate` só compara com o snapshot, não conecta.)

Expected: cria `lib/db/drizzle/0013_<nome>.sql`. Conferir o conteúdo:

Run: `cat lib/db/drizzle/0013_*.sql`
Expected: exatamente um `ALTER TABLE "plays" ADD COLUMN "client_play_id" text;` e um `CREATE UNIQUE INDEX "plays_device_client_play_idx" ON "plays" USING btree ("device_id","client_play_id");` — nada de `DROP`. Se aparecer qualquer outra instrução, parar e investigar (snapshot fora de sincronia).

- [ ] **Step 3: Aplicar num Postgres descartável e testar o `ON CONFLICT`**

```bash
docker run -d --rm --name telemetria-pg -e POSTGRES_PASSWORD=x -p 55433:5432 postgres:16-alpine
for i in $(seq 1 30); do docker exec telemetria-pg pg_isready -U postgres -q && break; sleep 1; done
for f in lib/db/drizzle/*.sql; do sed 's/--> statement-breakpoint//' "$f" | docker exec -i telemetria-pg psql -q -v ON_ERROR_STOP=1 -U postgres >/dev/null || echo "FALHOU $f"; done
docker exec -i telemetria-pg psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
truncate segments, companies, clients, devices, announcements, plays restart identity cascade;
insert into companies (id, name) values (1, 'Loja');
insert into clients (id, company_id) values (1, 1);
insert into devices (id, client_id, name, device_key) values (1, 1, 'TV', 'K1');
insert into announcements (id, title) values (1, 'Peça');
insert into plays (device_id, announcement_id, client_play_id) values (1, 1, 'abcdefgh0001')
  on conflict (device_id, client_play_id) do nothing;
insert into plays (device_id, announcement_id, client_play_id) values (1, 1, 'abcdefgh0001')
  on conflict (device_id, client_play_id) do nothing;
insert into plays (device_id, announcement_id) values (1, 1), (1, 1);
select count(*) filter (where client_play_id is not null) as com_id, count(*) filter (where client_play_id is null) as sem_id from plays;
SQL
docker stop telemetria-pg
```

Expected: nenhuma linha `FALHOU`; o `select` final mostra `com_id = 1` (o repetido não entrou) e `sem_id = 2` (NULLs não conflitam).

- [ ] **Step 4: Typecheck dos pacotes**

Run: `pnpm -w run typecheck:libs`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/plays.ts lib/db/drizzle/
git commit -m "feat(db): código da exibição vindo da TV com índice único por TV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `POST /api/telemetry/plays` (lote com idempotência)

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (path depois de `/telemetry/play`, ~linha 663; schemas depois de `PlayInput`, ~linha 1437)
- Regenerate: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**` (via codegen)
- Create: `artifacts/api-server/src/lib/telemetry/record-plays.ts`
- Create: `artifacts/api-server/src/lib/telemetry/__tests__/record-plays.test.ts`
- Modify: `artifacts/api-server/src/routes/telemetry.ts`
- Create: `artifacts/api-server/src/routes/__tests__/telemetry-plays.test.ts`

**Interfaces:**
- Consumes: `playsTable.clientPlayId` e o índice único da Task 1.
- Produces (contrato HTTP usado pela Task 4):
  - `POST /api/telemetry/plays`, corpo `{ deviceKey: string, plays: Array<{ playId: string, announcementId: number, campaignId: number | null, durationSeconds: number, ageSeconds: number }> }`
  - `200 { accepted: number, duplicates: number, discarded: number }`
  - `404 {"error":"Device not found"}` para key desconhecida; `400 { error }` para corpo inválido.
- Produces (código): `MAX_PLAY_AGE_SECONDS` e `buildPlayRows(deviceId, items, existingAnnouncementIds, existingCampaignIds, now)` em `lib/telemetry/record-plays.ts`.

- [ ] **Step 1: Contrato no openapi**

Em `lib/api-spec/openapi.yaml`, logo depois do bloco `/telemetry/play` (antes de `# ── Analytics`):

```yaml
  /telemetry/plays:
    post:
      operationId: recordPlays
      tags: [telemetry]
      summary: Record a batch of plays queued by a TV (proof-of-play)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PlayBatchInput"
      responses:
        "200":
          description: Batch processed
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PlayBatchResult"
        "400":
          description: Bad request
        "404":
          description: Device not found
```

Em `components/schemas`, logo depois de `PlayInput`:

```yaml
    PlayBatchItem:
      type: object
      required: [playId, announcementId, durationSeconds, ageSeconds]
      properties:
        playId: { type: string, minLength: 8, maxLength: 40 }
        announcementId: { type: integer }
        campaignId: { type: integer, nullable: true }
        durationSeconds: { type: number, minimum: 0, maximum: 86400 }
        ageSeconds: { type: number, minimum: 0 }

    PlayBatchInput:
      type: object
      required: [deviceKey, plays]
      properties:
        deviceKey: { type: string }
        plays:
          type: array
          minItems: 1
          maxItems: 200
          items:
            $ref: "#/components/schemas/PlayBatchItem"

    PlayBatchResult:
      type: object
      required: [accepted, duplicates, discarded]
      properties:
        accepted: { type: integer }
        duplicates: { type: integer }
        discarded: { type: integer }
```

- [ ] **Step 2: Gerar os tipos**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro. Conferir os nomes gerados:

Run: `grep -n "export const RecordPlaysBody\|export const RecordPlaysResponse" lib/api-zod/src/generated/api.ts`
Expected: as duas linhas existem. Conferir que os limites viraram Zod:

Run: `grep -n -A12 "export const RecordPlaysBody" lib/api-zod/src/generated/api.ts`
Expected: aparecem `.min(8)`/`.max(40)` no `playId`, `.min(1)`/`.max(200)` no array e `.min(0)`/`.max(86400)` na duração (a forma exata pode usar constantes geradas; o que importa é o limite estar lá). Se o Orval não gerar algum limite, os testes do Step 6 pegam.

- [ ] **Step 3: Teste da regra pura (falhando)**

Criar `artifacts/api-server/src/lib/telemetry/__tests__/record-plays.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPlayRows, MAX_PLAY_AGE_SECONDS } from "../record-plays";

const agora = new Date("2026-09-23T15:00:00.000Z");
const item = (over: Partial<Parameters<typeof buildPlayRows>[1][number]> = {}) => ({
  playId: "abcdefgh0001",
  announcementId: 1,
  campaignId: 10,
  durationSeconds: 77.7,
  ageSeconds: 60,
  ...over,
});

describe("buildPlayRows", () => {
  it("data da exibição = agora do servidor menos a idade", () => {
    const { rows } = buildPlayRows(5, [item()], new Set([1]), new Set([10]), agora);
    expect(rows).toEqual([
      {
        deviceId: 5,
        announcementId: 1,
        campaignId: 10,
        durationSeconds: 77.7,
        clientPlayId: "abcdefgh0001",
        createdAt: new Date("2026-09-23T14:59:00.000Z"),
      },
    ]);
  });

  it("idade acima de 7 dias fica em 7 dias", () => {
    const { rows } = buildPlayRows(5, [item({ ageSeconds: MAX_PLAY_AGE_SECONDS * 3 })], new Set([1]), new Set([10]), agora);
    expect(rows[0].createdAt.getTime()).toBe(agora.getTime() - MAX_PLAY_AGE_SECONDS * 1000);
  });

  it("peça que não existe mais é descartada e o resto do lote segue", () => {
    const { rows, discarded } = buildPlayRows(
      5,
      [item({ playId: "abcdefgh0001", announcementId: 99 }), item({ playId: "abcdefgh0002" })],
      new Set([1]),
      new Set([10]),
      agora,
    );
    expect(discarded).toBe(1);
    expect(rows.map((r) => r.clientPlayId)).toEqual(["abcdefgh0002"]);
  });

  it("campanha que não existe mais grava sem campanha", () => {
    const { rows } = buildPlayRows(5, [item({ campaignId: 77 })], new Set([1]), new Set([10]), agora);
    expect(rows[0].campaignId).toBeNull();
  });

  it("exibição sem campanha continua sem campanha", () => {
    const { rows } = buildPlayRows(5, [item({ campaignId: null })], new Set([1]), new Set(), agora);
    expect(rows[0].campaignId).toBeNull();
  });
});
```

Run: `cd artifacts/api-server && ./node_modules/.bin/vitest run src/lib/telemetry/__tests__/record-plays.test.ts`
Expected: FAIL — `Cannot find module '../record-plays'` (ou equivalente).

- [ ] **Step 4: Implementar a regra pura**

Criar `artifacts/api-server/src/lib/telemetry/record-plays.ts`:

```ts
/**
 * Transforma o lote que a TV reenviou em linhas de `plays`.
 *
 * A TV manda "há quantos segundos" cada exibição passou, e não a data: um
 * relógio de TV errado (comum em TV box sem bateria) se cancela na subtração
 * que ela faz, e aqui a idade vira data pelo relógio do servidor. O teto de
 * 7 dias é o mesmo da fila na TV — nada mais velho que isso deveria chegar, e
 * um relógio que pulou não pode jogar uma exibição para o mês passado.
 */
export const MAX_PLAY_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface PlayBatchItem {
  playId: string;
  announcementId: number;
  campaignId?: number | null;
  durationSeconds: number;
  ageSeconds: number;
}

export interface PlayRow {
  deviceId: number;
  announcementId: number;
  campaignId: number | null;
  durationSeconds: number;
  clientPlayId: string;
  createdAt: Date;
}

export function buildPlayRows(
  deviceId: number,
  items: PlayBatchItem[],
  existingAnnouncementIds: Set<number>,
  existingCampaignIds: Set<number>,
  now: Date,
): { rows: PlayRow[]; discarded: number } {
  const rows: PlayRow[] = [];
  let discarded = 0;
  for (const item of items) {
    // Peça apagada enquanto a exibição esperava na fila: a FK recusaria o
    // lote inteiro. Descarta só ela.
    if (!existingAnnouncementIds.has(item.announcementId)) {
      discarded += 1;
      continue;
    }
    const campaignId =
      item.campaignId != null && existingCampaignIds.has(item.campaignId) ? item.campaignId : null;
    const age = Math.min(Math.max(item.ageSeconds, 0), MAX_PLAY_AGE_SECONDS);
    rows.push({
      deviceId,
      announcementId: item.announcementId,
      // Campanha apagada: mesmo efeito do ON DELETE SET NULL das linhas que já existiam.
      campaignId,
      durationSeconds: item.durationSeconds,
      clientPlayId: item.playId,
      createdAt: new Date(now.getTime() - age * 1000),
    });
  }
  return { rows, discarded };
}
```

Run: `cd artifacts/api-server && ./node_modules/.bin/vitest run src/lib/telemetry/__tests__/record-plays.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Teste da rota (falhando)**

Criar `artifacts/api-server/src/routes/__tests__/telemetry-plays.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O mock reproduz só a parte do drizzle que a rota usa: select().from().where()
 * (device, peças, campanhas — nessa ordem, resolvidas por uma fila) e
 * insert().values().onConflictDoNothing().returning(). O ON CONFLICT de verdade
 * foi testado contra Postgres na migração 0013; aqui o que se testa é a rota.
 */
let selectResults: unknown[][] = [];
let inserted: Array<Record<string, unknown>> = [];
let returningRows: unknown[] = [];
let conflictTarget: unknown = null;

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.from = () => c;
  c.where = () => c;
  c.then = (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => chain(selectResults.shift() ?? []),
    insert: () => ({
      values: (rows: Array<Record<string, unknown>>) => {
        inserted = rows;
        return {
          onConflictDoNothing: (opts: { target: unknown }) => {
            conflictTarget = opts.target;
            return { returning: () => Promise.resolve(returningRows) };
          },
        };
      },
    }),
  },
  devicesTable: { id: "id", deviceKey: "deviceKey" },
  playsTable: { id: "id", deviceId: "deviceId", clientPlayId: "clientPlayId" },
  announcementsTable: { id: "id" },
  campaignsTable: { id: "id" },
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: router } = await import("../telemetry");
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

async function post(app: Express, body: unknown) {
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/telemetry/plays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

const play = (playId: string, over: Record<string, unknown> = {}) => ({
  playId, announcementId: 1, campaignId: 10, durationSeconds: 77.7, ageSeconds: 30, ...over,
});

beforeEach(() => {
  selectResults = [];
  inserted = [];
  returningRows = [];
  conflictTarget = null;
});

describe("POST /api/telemetry/plays", () => {
  it("grava o lote e conta as aceitas", async () => {
    selectResults = [[{ id: 5 }], [{ id: 1 }], [{ id: 10 }]];
    returningRows = [{ id: 100 }, { id: 101 }];
    const app = await buildApp();
    const res = await post(app, { deviceKey: "K1", plays: [play("abcdefgh0001"), play("abcdefgh0002")] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 2, duplicates: 0, discarded: 0 });
    expect(inserted.map((r) => r.clientPlayId)).toEqual(["abcdefgh0001", "abcdefgh0002"]);
    expect(inserted[0].deviceId).toBe(5);
    expect(conflictTarget).toEqual(["deviceId", "clientPlayId"]);
  });

  it("lote reenviado (resposta perdida) volta como duplicadas", async () => {
    selectResults = [[{ id: 5 }], [{ id: 1 }], [{ id: 10 }]];
    returningRows = []; // ON CONFLICT DO NOTHING não devolveu nada: já existiam
    const app = await buildApp();
    const res = await post(app, { deviceKey: "K1", plays: [play("abcdefgh0001"), play("abcdefgh0002")] });
    expect(res.body).toEqual({ accepted: 0, duplicates: 2, discarded: 0 });
  });

  it("peça apagada é descartada e o resto do lote grava", async () => {
    selectResults = [[{ id: 5 }], [{ id: 1 }], [{ id: 10 }]];
    returningRows = [{ id: 100 }];
    const app = await buildApp();
    const res = await post(app, {
      deviceKey: "K1",
      plays: [play("abcdefgh0001", { announcementId: 99 }), play("abcdefgh0002")],
    });
    expect(res.body).toEqual({ accepted: 1, duplicates: 0, discarded: 1 });
    expect(inserted.map((r) => r.clientPlayId)).toEqual(["abcdefgh0002"]);
  });

  it("lote só com peças apagadas não chama o insert", async () => {
    selectResults = [[{ id: 5 }], [], [{ id: 10 }]];
    const app = await buildApp();
    const res = await post(app, { deviceKey: "K1", plays: [play("abcdefgh0001")] });
    expect(res.body).toEqual({ accepted: 0, duplicates: 0, discarded: 1 });
    expect(inserted).toEqual([]);
  });

  it("key desconhecida responde 404 com o corpo que a TV reconhece", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const res = await post(app, { deviceKey: "NAOEXISTE", plays: [play("abcdefgh0001")] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
  });

  it.each([
    ["lote vazio", { deviceKey: "K1", plays: [] }],
    ["mais de 200", { deviceKey: "K1", plays: Array.from({ length: 201 }, (_, i) => play(`abcdefgh${String(i).padStart(4, "0")}`)) }],
    ["playId curto", { deviceKey: "K1", plays: [play("curto")] }],
    ["duração negativa", { deviceKey: "K1", plays: [play("abcdefgh0001", { durationSeconds: -1 })] }],
    ["idade negativa", { deviceKey: "K1", plays: [play("abcdefgh0001", { ageSeconds: -5 })] }],
  ])("%s responde 400", async (_nome, body) => {
    const app = await buildApp();
    const res = await post(app, body);
    expect(res.status).toBe(400);
  });
});
```

Run: `cd artifacts/api-server && ./node_modules/.bin/vitest run src/routes/__tests__/telemetry-plays.test.ts`
Expected: FAIL — os testes recebem 404 do Express (rota não existe).

- [ ] **Step 6: Implementar a rota**

Em `artifacts/api-server/src/routes/telemetry.ts`, trocar os imports:

```ts
import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, devicesTable, playsTable, announcementsTable, campaignsTable } from "@workspace/db";
import { RecordPlayBody, RecordPlaysBody, RecordPlaysResponse } from "@workspace/api-zod";
import { buildPlayRows } from "../lib/telemetry/record-plays";
```

E acrescentar, antes do `export default router;`:

```ts
/**
 * Lote da fila de reenvio da TV (tv.html). Cada exibição traz um `playId`
 * gerado na TV: se a resposta se perder e a TV mandar o mesmo lote de novo,
 * o índice único (device, client_play_id) faz o ON CONFLICT ignorar o que já
 * entrou. O endpoint antigo (/telemetry/play) segue para TVs com tv.html em cache.
 */
router.post("/telemetry/plays", async (req, res): Promise<void> => {
  const parsed = RecordPlaysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { deviceKey, plays } = parsed.data;

  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.deviceKey, deviceKey));
  // Mesmo corpo do 404 do feed: a TV reconhece e esvazia a fila, que não tem
  // mais dono (TV apagada ou desvinculada).
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const announcementIds = [...new Set(plays.map((p) => p.announcementId))];
  const campaignIds = [...new Set(plays.map((p) => p.campaignId).filter((id): id is number => id != null))];
  const announcements = await db
    .select({ id: announcementsTable.id })
    .from(announcementsTable)
    .where(inArray(announcementsTable.id, announcementIds));
  const campaigns = campaignIds.length
    ? await db
        .select({ id: campaignsTable.id })
        .from(campaignsTable)
        .where(inArray(campaignsTable.id, campaignIds))
    : [];

  const { rows, discarded } = buildPlayRows(
    device.id,
    plays,
    new Set(announcements.map((a) => a.id)),
    new Set(campaigns.map((c) => c.id)),
    new Date(),
  );

  const insertedRows = rows.length
    ? await db
        .insert(playsTable)
        .values(rows)
        .onConflictDoNothing({ target: [playsTable.deviceId, playsTable.clientPlayId] })
        .returning({ id: playsTable.id })
    : [];

  res.json(
    RecordPlaysResponse.parse({
      accepted: insertedRows.length,
      duplicates: rows.length - insertedRows.length,
      discarded,
    }),
  );
});
```

Observação para o teste "lote só com peças apagadas": com `campaignIds` não vazio há 3 selects (device, peças, campanhas); o teste já enfileira os 3.

Run: `cd artifacts/api-server && ./node_modules/.bin/vitest run src/routes/__tests__/telemetry-plays.test.ts src/lib/telemetry`
Expected: PASS (todos). Se algum caso de 400 passar como 200, o limite correspondente não foi gerado no Zod (Step 2): acrescentar a checagem que falta no `openapi.yaml` e regerar — não validar à mão na rota.

- [ ] **Step 7: Suíte e tipos da API**

Run: `cd artifacts/api-server && pnpm -s typecheck && ./node_modules/.bin/vitest run 2>&1 | tail -4`
Expected: typecheck limpo; todos os testes passando.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/src/lib/telemetry artifacts/api-server/src/routes/telemetry.ts artifacts/api-server/src/routes/__tests__/telemetry-plays.test.ts
git commit -m "feat(api): recebe exibições da TV em lote sem contar duas vezes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Duração real do vídeo no `tv.html`

Ainda envia pelo endpoint antigo (`/telemetry/play`); a Task 4 troca o transporte.

**Files:**
- Modify: `artifacts/signage/public/tv.html` (`vigiarFim`, `recordImpression`, `goNext`, `startTimer`, variáveis do YouTube ~linha 248)
- Modify: `artifacts/signage/src/__tests__/tv-html.test.ts` (stub do XHR, helper `exibicoes()`, testes novos no `describe("tv.html: vídeo do YouTube em modo natural")`)

**Interfaces:**
- Produces: `recordImpression(slide, durationSeconds)` e `goNext(durationSeconds)` — `durationSeconds` omitido = `slide.duration`. `duracaoDoVideo(slide)` devolve a duração do vídeo em segundos. No teste: `exibicoes()` devolve as exibições aceitas pelo servidor (dos dois endpoints) e `statusDoPost` controla a resposta dos POSTs.

- [ ] **Step 1: Stub do POST com resposta e helper `exibicoes()`**

Em `artifacts/signage/src/__tests__/tv-html.test.ts`:

Trocar a declaração de `posts` (linha ~26) por:

```ts
let posts: Array<{ url: string; payload: Record<string, unknown>; status: number }> = [];
// Resposta dos POSTs de telemetria. 0 = rede caiu (como um XHR de verdade).
let statusDoPost = 200;
```

No `beforeEach`, junto de `posts = [];`:

```ts
  statusDoPost = 200;
```

No `XhrStub.send`, trocar o bloco do POST por:

```ts
      if (this.method === "POST") {
        posts.push({ url: this.url, payload: JSON.parse(body ?? "{}"), status: statusDoPost });
        this.readyState = 4;
        this.status = statusDoPost;
        this.responseText =
          statusDoPost === 404
            ? '{"error":"Device not found"}'
            : statusDoPost >= 200 && statusDoPost < 300
              ? '{"accepted":0,"duplicates":0,"discarded":0}'
              : "";
        this.onreadystatechange?.();
        return;
      }
```

Depois da função `noAr()`, acrescentar:

```ts
/**
 * Exibições que o servidor aceitou, venham do endpoint antigo (uma por POST)
 * ou do lote da fila. POST que falhou não conta: a exibição não chegou.
 */
function exibicoes(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const p of posts) {
    if (p.status < 200 || p.status >= 300) continue;
    if (p.url.indexOf("/api/telemetry/plays") !== -1) {
      out.push(...(p.payload.plays as Array<Record<string, unknown>>));
    } else if (p.url.indexOf("/api/telemetry/play") !== -1) {
      out.push(p.payload);
    }
  }
  return out;
}
```

No teste `"não conta exibição de slide que nunca apareceu"`, trocar `vi.advanceTimersByTime(5000);` por `vi.advanceTimersByTime(5080);` (o tick é de 80 ms: em 5000 ms exatos o cronômetro ainda está em 99,2% e o slide 2 não fechou) e o cálculo de `exibidos` por:

```ts
    const exibidos = exibicoes().map((p) => p.announcementId);
    expect(exibidos).toContain(2);
    expect(exibidos).not.toContain(1);
```

(O `toContain(2)` garante que o teste não passa vazio.)

Run: `cd artifacts/signage && npx vitest run src/__tests__/tv-html.test.ts`
Expected: PASS em tudo (só mudou o stub e o helper).

- [ ] **Step 2: Testes da duração (falhando)**

No fim do `describe("tv.html: vídeo do YouTube em modo natural", ...)`, antes do `});` que o fecha:

```ts
  it("imagem registra a duração configurada", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(5080);
    expect(exibicoes()[0]).toMatchObject({ announcementId: 1, durationSeconds: 5 });
  });

  it("Short que termina registra a duração do vídeo, não a configurada", () => {
    listaDeSlides = [video(1, "AAAAAAAAAAA"), video(2, "BBBBBBBBBBB")];
    carregarTv();
    const p = ultimo();
    p.duracao = 77.741;
    p.eventos.onReady({ target: p });
    p.eventos.onStateChange({ data: 0, target: p });
    expect(exibicoes()).toEqual([expect.objectContaining({ announcementId: 1, durationSeconds: 77.741 })]);
  });

  it("Short que recomeça sozinho também registra a duração do vídeo", () => {
    listaDeSlides = [video(1, "AAAAAAAAAAA"), video(2, "BBBBBBBBBBB")];
    carregarTv();
    const p = ultimo();
    p.duracao = 77.741;
    p.eventos.onReady({ target: p });
    for (let t = 0; t <= 77.5; t += 0.5) {
      p.tempo = t;
      vi.advanceTimersByTime(500);
    }
    p.tempo = 0.08;
    vi.advanceTimersByTime(1000);
    expect(exibicoes()).toEqual([expect.objectContaining({ announcementId: 1, durationSeconds: 77.741 })]);
  });

  it("vídeo capped passado em pedaços conta 1 exibição com a duração do vídeo", () => {
    listaDeSlides = [{ ...video(1, "AAAAAAAAAAA"), playbackMode: "capped" }, slide(2, "https://blob/b.png")];
    carregarTv();
    const p1 = ultimo();
    p1.duracao = 12;
    p1.eventos.onReady({ target: p1 });
    p1.tempo = 5;
    // Corte do cronômetro (5 s): cede a tela sem contar.
    vi.advanceTimersByTime(5080);
    expect(exibicoes().filter((e) => e.announcementId === 1)).toEqual([]);
    responder("https://blob/b.png", true);
    vi.advanceTimersByTime(5080);
    // Volta ao vídeo, que retoma e termina.
    const p2 = ultimo();
    expect(p2).not.toBe(p1);
    p2.duracao = 12;
    p2.eventos.onReady({ target: p2 });
    p2.eventos.onStateChange({ data: 0, target: p2 });
    expect(exibicoes().filter((e) => e.announcementId === 1)).toEqual([
      expect.objectContaining({ durationSeconds: 12 }),
    ]);
  });

  it("YouTube sem duração (0) registra a última posição lida", () => {
    listaDeSlides = [video(1, "AAAAAAAAAAA"), video(2, "BBBBBBBBBBB")];
    carregarTv();
    const p = ultimo();
    p.duracao = 0;
    p.eventos.onReady({ target: p });
    p.tempo = 30;
    vi.advanceTimersByTime(500);
    p.eventos.onStateChange({ data: 0, target: p });
    expect(exibicoes()).toEqual([expect.objectContaining({ announcementId: 1, durationSeconds: 30 })]);
  });
```

Run: `cd artifacts/signage && npx vitest run src/__tests__/tv-html.test.ts`
Expected: FAIL nos quatro testes de vídeo com `durationSeconds: 5` recebido (a duração configurada). O de imagem passa.

- [ ] **Step 3: Implementar no `tv.html`**

Junto das variáveis do YouTube (depois de `var YT_SOUND_CHECK_MS = 3000;`):

```js
      var ytUltimaPosicao = 0;   // última posição lida pela vigia (s)
```

Substituir o corpo de `vigiarFim` inteiro por:

```js
      function vigiarFim(player, onEnded) {
        if (ytEndWatch) { clearInterval(ytEndWatch); }
        var anterior = 0;
        ytUltimaPosicao = 0;
        ytEndWatch = setInterval(function () {
          var agora, duracao;
          try {
            agora = player.getCurrentTime();
            duracao = player.getDuration();
          } catch (e) { return; }
          if (typeof agora !== 'number') { return; }
          if (duracao > 0 && agora + 1 < anterior && anterior >= duracao - 2) {
            clearInterval(ytEndWatch); ytEndWatch = null;
            onEnded();
            return;
          }
          anterior = agora;
          // Guardada fora da checagem de duração: é o plano B quando o
          // YouTube não informa a duração (duracaoDoVideo). Atualizada depois
          // da detecção do laço, então no laço ainda vale a posição do fim.
          ytUltimaPosicao = agora;
        }, YT_END_WATCH_MS);
      }

      // Tempo total do vídeo que acabou de terminar. Lido antes de goNext
      // destruir o player. Sem duração do YouTube, a última posição lida é
      // praticamente a duração; sem nenhuma das duas, a configurada na peça.
      function duracaoDoVideo(slide) {
        var d = 0;
        try { d = ytPlayer ? ytPlayer.getDuration() : 0; } catch (e) { d = 0; }
        if (typeof d === 'number' && d > 0 && isFinite(d)) { return d; }
        if (ytUltimaPosicao > 0) { return ytUltimaPosicao; }
        return slide.duration;
      }
```

Trocar `recordImpression` por (o transporte ainda é o antigo):

```js
      // durationSeconds omitido = a duração configurada (imagem, miniatura de
      // fallback). Vídeo passa o tempo total do vídeo (duracaoDoVideo).
      function recordImpression(slide, durationSeconds) {
        if (playSent) { return; }
        playSent = true;
        var key = deviceKey;
        if (!key) { return; }
        xhrPost(apiBase() + '/api/telemetry/play', {
          deviceKey: key,
          announcementId: slide.announcementId,
          campaignId: slide.campaignId != null ? slide.campaignId : null,
          durationSeconds: durationSeconds != null ? durationSeconds : slide.duration
        });
      }
```

Em `goNext`, trocar a assinatura e a chamada:

```js
      function goNext(durationSeconds) {
```

```js
        recordImpression(slides[currentIndex], durationSeconds);
```

Em `startTimer`, trocar o `onEnded`:

```js
            function onEnded() { if (!naturalDone) { naturalDone = true; goNext(duracaoDoVideo(slide)); } },
```

(A chamada `goNext()` do `runTimer` continua sem argumento: imagem e fallback usam a duração configurada.)

Run: `cd artifacts/signage && npx vitest run src/__tests__/tv-html.test.ts`
Expected: PASS em todos.

- [ ] **Step 4: Suíte do web**

Run: `cd artifacts/signage && npx vitest run 2>&1 | tail -3 && pnpm -s typecheck`
Expected: todos passando, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "fix(tv): exibição de vídeo registra o tempo total do vídeo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fila de reenvio no `tv.html`

**Files:**
- Modify: `artifacts/signage/public/tv.html` (helper `xhrPostJson` no lugar de `xhrPost`; bloco da fila; `recordImpression`; `init`)
- Modify: `artifacts/signage/src/__tests__/tv-html.test.ts` (novo `describe("tv.html: fila de exibições")`)

**Interfaces:**
- Consumes: `POST /api/telemetry/plays` da Task 2 (contrato no topo da Task 2); `recordImpression(slide, durationSeconds)` e `exibicoes()`/`statusDoPost` da Task 3.
- Produces: fila no `localStorage` sob `signage_play_queue`, itens `[playId, announcementId, campaignId|null, durationSeconds, shownAtMs]`.

- [ ] **Step 1: Testes da fila (falhando)**

No fim de `artifacts/signage/src/__tests__/tv-html.test.ts`:

```ts
describe("tv.html: fila de exibições", () => {
  const CHAVE = "signage_play_queue";
  const DIA = 24 * 60 * 60 * 1000;
  const filaGuardada = (): unknown[][] => JSON.parse(window.localStorage.getItem(CHAVE) ?? "[]");
  const semear = (itens: unknown) => window.localStorage.setItem(CHAVE, JSON.stringify(itens));
  const idsEnviados = () => exibicoes().map((e) => e.playId);

  it("sem rede guarda a exibição e reenvia quando a rede volta", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    statusDoPost = 0;
    carregarTv();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(5080);
    expect(exibicoes()).toEqual([]);
    const [primeiro] = filaGuardada();
    expect(primeiro).toEqual([expect.any(String), 1, null, 5, expect.any(Number)]);
    expect((primeiro[0] as string).length).toBe(12);

    statusDoPost = 200;
    vi.advanceTimersByTime(60000);
    expect(idsEnviados()).toContain(primeiro[0]);
    expect(filaGuardada()).toEqual([]);
  });

  it("manda a idade da exibição, não a data", () => {
    semear([["seedaaaa0001", 1, 3, 5, Date.now() - 3600 * 1000]]);
    listaDeSlides = [];
    carregarTv();
    expect(exibicoes()).toEqual([
      { playId: "seedaaaa0001", announcementId: 1, campaignId: 3, durationSeconds: 5, ageSeconds: 3600 },
    ]);
    expect(posts[posts.length - 1].payload.deviceKey).toBe("CHAVE");
  });

  it("fila sobrevive a recarregar a página", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    statusDoPost = 0;
    carregarTv();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(5080);
    const id = filaGuardada()[0][0];

    statusDoPost = 200;
    carregarTv();
    expect(idsEnviados()).toContain(id);
  });

  it("TV desconhecida (404) esvazia a fila", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    statusDoPost = 404;
    carregarTv();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(5080);
    expect(filaGuardada()).toEqual([]);
  });

  it("lote recusado (400) é descartado e não trava a fila", () => {
    listaDeSlides = [slide(1, "https://blob/a.png")];
    statusDoPost = 400;
    carregarTv();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(5080);
    expect(filaGuardada()).toEqual([]);
  });

  it("exibição com mais de 7 dias sai da fila sem ser enviada", () => {
    semear([
      ["seedvelho001", 1, null, 5, Date.now() - 8 * DIA],
      ["seednovo0001", 1, null, 5, Date.now() - 60 * 1000],
    ]);
    listaDeSlides = [];
    carregarTv();
    expect(idsEnviados()).toEqual(["seednovo0001"]);
  });

  it("relógio da TV que voltou no tempo não gera idade negativa", () => {
    semear([["seedfutur001", 1, null, 5, Date.now() + 3600 * 1000]]);
    listaDeSlides = [];
    carregarTv();
    expect(exibicoes()).toEqual([expect.objectContaining({ playId: "seedfutur001", ageSeconds: 0 })]);
  });

  it("fila corrompida não quebra a TV e o que é válido segue", () => {
    window.localStorage.setItem(
      CHAVE,
      JSON.stringify([["curto", 1, null, 5, Date.now()], "lixo", ["seedvalid001", 1, null, 5, Date.now()]]),
    );
    listaDeSlides = [];
    carregarTv();
    expect(idsEnviados()).toEqual(["seedvalid001"]);

    window.localStorage.setItem(CHAVE, "{lixo");
    listaDeSlides = [slide(1, "https://blob/a.png")];
    expect(() => carregarTv()).not.toThrow();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(5080);
    expect(exibicoes().some((e) => e.announcementId === 1 && e.durationSeconds === 5)).toBe(true);
  });

  it("envia em lotes de até 200", () => {
    semear(Array.from({ length: 450 }, (_, i) => [`seed${String(i).padStart(8, "0")}`, 1, null, 5, Date.now() - 1000]));
    listaDeSlides = [];
    carregarTv();
    const lotes = posts.filter((p) => p.url.indexOf("/api/telemetry/plays") !== -1).map((p) => (p.payload.plays as unknown[]).length);
    expect(lotes).toEqual([200, 200, 50]);
    expect(filaGuardada()).toEqual([]);
  });

  it("fila grande grava no máximo a cada 30 s", () => {
    semear(Array.from({ length: 600 }, (_, i) => [`seed${String(i).padStart(8, "0")}`, 1, null, 5, Date.now() - 1000]));
    listaDeSlides = [slide(1, "https://blob/a.png")];
    statusDoPost = 0;
    carregarTv();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(5080);
    expect(filaGuardada()).toHaveLength(600); // exibição nova só na memória
    vi.advanceTimersByTime(30000);
    expect(filaGuardada().length).toBeGreaterThan(600);
  });

  it("passa de 70 mil itens: saem os mais antigos", () => {
    semear(Array.from({ length: 70000 }, (_, i) => [`seed${String(i).padStart(8, "0")}`, 1, null, 5, Date.now() - 1000]));
    listaDeSlides = [slide(1, "https://blob/a.png")];
    statusDoPost = 0;
    carregarTv();
    responder("https://blob/a.png", true);
    vi.advanceTimersByTime(35080); // exibições + janela de 30 s da gravação
    const fila = filaGuardada();
    expect(fila).toHaveLength(70000);
    expect(fila[0][0]).not.toBe("seed00000000");
  });
});
```

Run: `cd artifacts/signage && npx vitest run src/__tests__/tv-html.test.ts -t "fila de exibições"`
Expected: FAIL — a fila não existe (`filaGuardada()` vazia, nada em `/telemetry/plays`).

- [ ] **Step 2: Implementar o transporte e a fila**

Em `tv.html`, substituir a função `xhrPost` inteira por:

```js
      // POST com resposta: a fila precisa saber se o lote chegou. status 0 =
      // rede caiu ou estourou o tempo (o XHR chega a readyState 4 com status 0).
      function xhrPostJson(url, payload, cb) {
        var respondeu = false;
        function fim(status, texto) {
          if (respondeu) { return; }
          respondeu = true;
          var body = null;
          try { body = JSON.parse(texto); } catch (e) {}
          cb(status, body);
        }
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          try { xhr.timeout = 20000; } catch (e) {}
          xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) { return; }
            fim(xhr.status, xhr.responseText);
          };
          xhr.send(JSON.stringify(payload));
        } catch (e) { fim(0, ''); }
      }

      // ─── Fila de exibições ────────────────────────────────────────────────
      // Cada exibição vira um item compacto guardado no localStorage até o
      // servidor confirmar. Internet instável na loja deixava de contar o que
      // passou na tela. Item: [playId, announcementId, campaignId|null,
      // durationSeconds, shownAtMs].
      var QUEUE_KEY = 'signage_play_queue';
      var QUEUE_BATCH = 200;
      var QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
      var QUEUE_MAX_ITEMS = 70000;
      var QUEUE_SAVE_SMALL = 500;
      var QUEUE_SAVE_EVERY_MS = 30000;
      var playQueue = carregarFila();
      var queueSending = false;
      var queueDirty = false;
      // O disco acabou de ser lido: está igual à memória. Conta a janela de
      // 30 s a partir daqui, senão a primeira exibição regrava 3 MB na hora.
      var queueSavedAt = Date.now();

      function itemDaFilaValido(it) {
        return it instanceof Array && it.length === 5 &&
          typeof it[0] === 'string' && it[0].length >= 8 && it[0].length <= 40 &&
          typeof it[1] === 'number' &&
          (it[2] === null || typeof it[2] === 'number') &&
          typeof it[3] === 'number' && it[3] >= 0 &&
          typeof it[4] === 'number';
      }

      function carregarFila() {
        try {
          var arr = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]');
          if (!(arr instanceof Array)) { return []; }
          var ok = [];
          for (var i = 0; i < arr.length; i++) {
            if (itemDaFilaValido(arr[i])) { ok.push(arr[i]); }
          }
          return ok;
        } catch (e) { return []; }
      }

      // Fila pequena (TV online, caso normal): grava a cada mudança. Grande
      // (TV offline): no máximo a cada 30 s, para não regravar megabytes a
      // cada exibição num aparelho fraco. Sem localStorage, segue em memória.
      function gravarFila(forcar) {
        queueDirty = true;
        var agora = Date.now();
        if (!forcar && playQueue.length > QUEUE_SAVE_SMALL && agora - queueSavedAt < QUEUE_SAVE_EVERY_MS) { return; }
        try {
          window.localStorage.setItem(QUEUE_KEY, JSON.stringify(playQueue));
          queueSavedAt = agora;
          queueDirty = false;
        } catch (e) {}
      }

      function novoPlayId() {
        var s = '';
        while (s.length < 12) { s += Math.random().toString(36).slice(2); }
        return s.slice(0, 12);
      }

      function podarFila() {
        var limite = Date.now() - QUEUE_MAX_AGE_MS;
        var mantidos = [];
        for (var i = 0; i < playQueue.length; i++) {
          if (playQueue[i][4] >= limite) { mantidos.push(playQueue[i]); }
        }
        if (mantidos.length !== playQueue.length) {
          playQueue = mantidos;
          gravarFila(false);
        }
      }

      function tirarDaFila(lote) {
        var enviados = {};
        for (var i = 0; i < lote.length; i++) { enviados[lote[i][0]] = true; }
        var resto = [];
        for (var j = 0; j < playQueue.length; j++) {
          if (!enviados[playQueue[j][0]]) { resto.push(playQueue[j]); }
        }
        playQueue = resto;
        gravarFila(playQueue.length === 0);
      }

      function enfileirarExibicao(slide, durationSeconds) {
        playQueue.push([
          novoPlayId(),
          slide.announcementId,
          slide.campaignId != null ? slide.campaignId : null,
          durationSeconds,
          Date.now()
        ]);
        if (playQueue.length > QUEUE_MAX_ITEMS) {
          playQueue.splice(0, playQueue.length - QUEUE_MAX_ITEMS);
        }
        gravarFila(false);
        enviarFila();
      }

      // Um envio por vez, lote dos mais antigos. Vai a idade de cada exibição
      // (segundos atrás, pelo relógio da TV), e não a data: um relógio de TV
      // errado se cancela na subtração, e o servidor converte com o dele.
      function enviarFila() {
        if (queueSending || !deviceKey) { return; }
        podarFila();
        if (!playQueue.length) { return; }
        var lote = playQueue.slice(0, QUEUE_BATCH);
        var agora = Date.now();
        var plays = [];
        for (var i = 0; i < lote.length; i++) {
          var idade = (agora - lote[i][4]) / 1000;
          if (idade < 0) { idade = 0; }
          if (idade > QUEUE_MAX_AGE_MS / 1000) { idade = QUEUE_MAX_AGE_MS / 1000; }
          plays.push({
            playId: lote[i][0],
            announcementId: lote[i][1],
            campaignId: lote[i][2],
            durationSeconds: lote[i][3],
            ageSeconds: idade
          });
        }
        queueSending = true;
        xhrPostJson(apiBase() + '/api/telemetry/plays', { deviceKey: deviceKey, plays: plays }, function (status, body) {
          queueSending = false;
          if (status >= 200 && status < 300) {
            tirarDaFila(lote);
            enviarFila();
            return;
          }
          // TV apagada ou desvinculada: essas exibições não têm mais dono.
          if (status === 404 && body && body.error === 'Device not found') {
            playQueue = [];
            gravarFila(true);
            return;
          }
          // Lote recusado: descartar é melhor que travar a fila para sempre
          // num item estragado.
          if (status === 400) {
            tirarDaFila(lote);
            enviarFila();
            return;
          }
          // Rede ou servidor fora: fica tudo, tenta no próximo gatilho.
        });
      }
```

Trocar `recordImpression` por:

```js
      // durationSeconds omitido = a duração configurada (imagem, miniatura de
      // fallback). Vídeo passa o tempo total do vídeo (duracaoDoVideo).
      function recordImpression(slide, durationSeconds) {
        if (playSent) { return; }
        playSent = true;
        if (!deviceKey) { return; }
        enfileirarExibicao(slide, durationSeconds != null ? durationSeconds : slide.duration);
      }
```

Trocar `init` por:

```js
      function init() {
        fetchAndStart(deviceKey, false);
        // O que ficou na fila de antes (TV reiniciou sem rede) sai logo.
        enviarFila();

        // Refresh slide list every 60 s without interrupting current slide
        refreshTimer = setInterval(function () {
          fetchAndStart(deviceKey, true);
          // Fila grande pode ter mudança só em memória (gravação espaçada).
          if (queueDirty) { gravarFila(false); }
          enviarFila();
        }, 60000);
      }
```

Conferir que não sobrou uso de `xhrPost(`:

Run: `grep -n "xhrPost(" artifacts/signage/public/tv.html`
Expected: nenhuma linha.

Run: `cd artifacts/signage && npx vitest run src/__tests__/tv-html.test.ts`
Expected: PASS em todos (os da Task 3 passam a ler as exibições do lote via `exibicoes()`).

Se "fila grande grava no máximo a cada 30 s" falhar no segundo `expect`: a gravação espaçada depende de uma exibição nova (ou do refresh de 60 s) depois da janela; com peça de 5 s há exibição a cada 5 s, então 30 s depois a próxima grava. Conferir que `gravarFila(false)` compara com `queueSavedAt`, não com `0`.

- [ ] **Step 3: Checagem de ES5**

Run: `grep -nE "\b(let|const)\b|=>|\`" artifacts/signage/public/tv.html | grep -v "^\s*//" | head`
Expected: nenhuma linha dentro do `<script>` (CSS e comentários não contam; conferir cada linha que aparecer).

- [ ] **Step 4: Suíte do web**

Run: `cd artifacts/signage && npx vitest run 2>&1 | tail -3 && pnpm -s typecheck`
Expected: todos passando, typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): fila de reenvio das exibições com envio em lote

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verificação final e PR

**Files:** nenhum novo.

- [ ] **Step 1: Suítes e tipos do monorepo**

Run: `pnpm -w run typecheck:libs && (cd artifacts/api-server && pnpm -s typecheck && ./node_modules/.bin/vitest run 2>&1 | tail -3) && (cd artifacts/signage && pnpm -s typecheck && npx vitest run 2>&1 | tail -3)`
Expected: tudo limpo e passando.

- [ ] **Step 2: Conferir que o codegen está em dia**

Run: `pnpm --filter @workspace/api-spec run codegen && git status --short`
Expected: nenhum arquivo modificado (o gerado já está commitado).

- [ ] **Step 3: Push e PR**

```bash
git push -u origin feat/telemetria-fila
gh pr create --base main --title "feat(tv): duração real dos vídeos e fila de reenvio das exibições" --body "..."
```

Corpo do PR (sem nenhuma linha começando com a expressão de quebra de compatibilidade): resumo das regras do spec, a migração 0013 só de acréscimo (entra no banco compartilhado já no preview), o endpoint novo, a fila, os testes rodados, e o rodapé `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: Teste manual no preview**

No preview da branch, abrir `tv.html?key=<TV de teste>` com o DevTools em Network:
- peça de imagem: `POST /api/telemetry/plays` com `durationSeconds` = duração configurada;
- Short natural: no fim, `durationSeconds` ≈ duração do vídeo;
- DevTools → Network → Offline por 1 min, depois Online: um POST com vários itens e `ageSeconds` coerentes; `localStorage["signage_play_queue"]` volta a `[]`.

Lembrete: preview grava no banco de produção. Usar uma TV de teste e zerar as métricas da campanha de teste depois.
