# Correções essenciais do veículo de mídia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir as três lacunas estruturais da auditoria — (1) atribuir cada play à campanha que o gerou, (2) uma campanha = um anunciante, (3) renomear o conceito `impression` → `play` em toda a stack.

**Architecture:** Monorepo pnpm. Fonte da verdade do contrato HTTP é `lib/api-spec/openapi.yaml`, do qual `orval` gera `lib/api-zod` e `lib/api-client-react` (não editar gerados à mão). Schema do banco em `lib/db/src/schema` (Drizzle), aplicado via `drizzle-kit push` no dev. As rotas de `advertisers`/`campaigns` NÃO estão no OpenAPI (usam `fetch` manual no frontend), então mudanças de anunciante não passam por codegen. As demais rotas (telemetry, analytics, display, clients, devices) são tipadas pelo codegen.

**Testing:** O repositório não possui framework de testes. A verificação de cada tarefa usa `pnpm run typecheck`, `pnpm run build` e smokes manuais via `curl` contra `./dev.sh`. Não introduzir framework de testes (fora de escopo).

**Tech Stack:** TypeScript, Express, Drizzle ORM, PostgreSQL, Zod, orval, React/Vite, drizzle-kit.

**Convenções de nomenclatura (travadas):**
- Tabela/entidade: `plays` / `playsTable`; coluna nova `campaign_id` (`campaignId`), FK → `campaigns(id)` `ON DELETE SET NULL` (preserva o histórico de exibição se a campanha for excluída).
- Endpoint de telemetria: `POST /telemetry/play`, `operationId: recordPlay`, schema `PlayInput`.
- Campos de analytics: `totalImpressions` → `totalPlays`; `impressions` → `plays`; schema `AnnouncementImpressionStat` → `AnnouncementPlayStat`.
- Rótulos PT na UI: "Impressões" → "Exibições" (tradução correta de *plays*).

---

## Ordem de execução

Grupo A (schema/migração) → Grupo B (contrato + codegen) → Grupo C (rotas) → Grupo D (backfill) → Grupo E (frontend) → Grupo F (validação final). Cada tarefa termina em commit.

---

## Grupo A — Schema do banco e migração

### Task 1: Renomear schema `impressions` → `plays` e adicionar `campaignId`

**Files:**
- Create: `lib/db/src/schema/plays.ts`
- Delete: `lib/db/src/schema/impressions.ts`
- Modify: `lib/db/src/schema/index.ts`

- [ ] **Step 1: Criar `lib/db/src/schema/plays.ts`**

```ts
import { pgTable, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";
import { announcementsTable } from "./announcements";
import { campaignsTable } from "./campaigns";

export const playsTable = pgTable("plays", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").references(() => campaignsTable.id, { onDelete: "set null" }),
  durationSeconds: real("duration_seconds").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Play = typeof playsTable.$inferSelect;
```

- [ ] **Step 2: Excluir o arquivo antigo**

Run: `git rm lib/db/src/schema/impressions.ts`

- [ ] **Step 3: Atualizar `lib/db/src/schema/index.ts`**

Trocar a linha `export * from "./impressions";` por `export * from "./plays";`. Resultado esperado do arquivo:

```ts
export * from "./announcements";
export * from "./clients";
export * from "./devices";
export * from "./device_playlist";
export * from "./plays";
export * from "./advertisers";
export * from "./campaigns";
export * from "./campaign_devices";
export * from "./campaign_advertisers";
export * from "./campaign_announcements";
```

- [ ] **Step 4: Compilar a lib de db**

Run: `cd lib/db && npx tsc --build && cd ../..`
Expected: PASS (sem erros de tipo na lib db).

- [ ] **Step 5: Commit**

```bash
git add lib/db/src/schema/plays.ts lib/db/src/schema/index.ts
git commit -m "refactor(db): renomear schema impressions para plays e adicionar campaignId"
```

---

### Task 2: Remover o schema `campaign_advertisers` (uma campanha = um anunciante)

**Files:**
- Delete: `lib/db/src/schema/campaign_advertisers.ts`
- Modify: `lib/db/src/schema/index.ts`

- [ ] **Step 1: Excluir o arquivo de schema**

Run: `git rm lib/db/src/schema/campaign_advertisers.ts`

- [ ] **Step 2: Remover o export em `lib/db/src/schema/index.ts`**

Remover a linha `export * from "./campaign_advertisers";`.

- [ ] **Step 3: Compilar a lib de db**

Run: `cd lib/db && npx tsc --build && cd ../..`
Expected: A lib db compila. (Os consumidores em `advertisers.ts` ainda referenciam `campaignAdvertisersTable` e vão quebrar — isso é corrigido na Task 9; a compilação isolada da lib db passa.)

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/index.ts
git commit -m "refactor(db): remover tabela campaign_advertisers (campanha pertence a um anunciante)"
```

---

### Task 3: Aplicar a migração no banco (rename + coluna + drop) preservando dados

**Files:**
- Create: `scripts/src/migrate-plays.ts`
- Modify: `scripts/package.json`

**Contexto:** `drizzle-kit push` pode tratar rename de tabela como drop+create (perda de dados). Por isso aplicamos um `ALTER` explícito e só então usamos `push` para conferir que não há divergência. Este mesmo SQL deve ser aplicado manualmente em produção (não confiar no diff automático para o rename).

- [ ] **Step 1: Criar `scripts/src/migrate-plays.ts`**

```ts
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`ALTER TABLE IF EXISTS impressions RENAME TO plays`);
  await db.execute(sql`ALTER TABLE plays ADD COLUMN IF NOT EXISTS campaign_id integer`);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'plays_campaign_id_campaigns_id_fk'
      ) THEN
        ALTER TABLE plays
          ADD CONSTRAINT plays_campaign_id_campaigns_id_fk
          FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  await db.execute(sql`DROP TABLE IF EXISTS campaign_advertisers`);
  console.log("Migração plays aplicada.");
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
```

- [ ] **Step 2: Adicionar o script em `scripts/package.json`**

No bloco `"scripts"`, adicionar a entrada `migrate:plays`:

```json
    "migrate:plays": "tsx ./src/migrate-plays.ts",
```

- [ ] **Step 3: Garantir que o banco está no ar SEM aplicar push**

**Importante:** NÃO rode `./dev.sh --db` aqui — ele executa `drizzle-kit push`, que compararia o schema novo (`plays`, sem `campaign_advertisers`) com o banco antigo (`impressions`, `campaign_advertisers`) e faria drop+create, **perdendo os dados de `impressions`**. A migração explícita (Step 4) tem que rodar ANTES de qualquer `push`.

Confirme que o Postgres está acessível (o container de dev normalmente já está no ar). Se não estiver, suba apenas o container do banco sem aplicar schema (ex.: `docker start signage-db`), sem rodar `drizzle-kit push`.

- [ ] **Step 4: Rodar a migração**

Run: `pnpm --filter @workspace/scripts run migrate:plays`
Expected: Imprime "Migração plays aplicada." sem erro.

- [ ] **Step 5: Conferir que o schema Drizzle bate com o banco**

Run: `cd lib/db && npx drizzle-kit push --config ./drizzle.config.ts && cd ../..`
Expected: "No changes detected" (ou apenas normalizações de constraint já presentes). Se aparecer intenção de dropar/recriar `plays`, **abortar** e revisar a migração — não confirmar perda de dados.

- [ ] **Step 6: Commit**

```bash
git add scripts/src/migrate-plays.ts scripts/package.json
git commit -m "chore(scripts): migração para renomear impressions->plays e remover campaign_advertisers"
```

---

## Grupo B — Contrato OpenAPI + codegen

### Task 4: Atualizar `openapi.yaml` (telemetry, DisplaySlide, analytics) e regenerar

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 1: Renomear o path de telemetria**

Substituir o bloco atual (por volta da linha 468):

```yaml
  /telemetry/impression:
    post:
      operationId: recordImpression
      tags: [telemetry]
      summary: Record a slide impression from a TV display
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ImpressionInput"
```

por:

```yaml
  /telemetry/play:
    post:
      operationId: recordPlay
      tags: [telemetry]
      summary: Record a slide play (proof-of-play) from a TV display
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PlayInput"
```

- [ ] **Step 2: Adicionar `campaignId` ao `DisplaySlide`**

No schema `DisplaySlide` (bloco `required: [announcementId, title, imageUrl, duration]`), adicionar a propriedade `campaignId` (opcional, nullable). Resultado:

```yaml
    DisplaySlide:
      type: object
      required: [announcementId, title, imageUrl, duration]
      properties:
        announcementId: { type: integer }
        campaignId: { type: integer, nullable: true }
        title: { type: string }
        imageUrl: { type: string }
        duration: { type: integer }
```

- [ ] **Step 3: Renomear `ImpressionInput` → `PlayInput` e adicionar `campaignId`**

```yaml
    PlayInput:
      type: object
      required: [deviceKey, announcementId, durationSeconds]
      properties:
        deviceKey: { type: string }
        announcementId: { type: integer }
        campaignId: { type: integer, nullable: true }
        durationSeconds: { type: number }
```

- [ ] **Step 4: Renomear `AnnouncementImpressionStat` → `AnnouncementPlayStat`**

```yaml
    AnnouncementPlayStat:
      type: object
      required: [announcementId, title, plays, totalDuration]
      properties:
        announcementId: { type: integer }
        title: { type: string }
        plays: { type: integer }
        totalDuration: { type: integer }
```

- [ ] **Step 5: Atualizar os schemas de analytics**

Em `AnalyticsSummary`, `ClientAnalytics`, `DeviceAnalytics`, `AnnouncementAnalytics`:
- Trocar toda ocorrência de `totalImpressions` por `totalPlays` (nas listas `required` e em `properties`).
- Trocar todas as referências `$ref: "#/components/schemas/AnnouncementImpressionStat"` por `$ref: "#/components/schemas/AnnouncementPlayStat"`.
- Em `AnnouncementAnalytics.byDevice.items`, trocar o campo `impressions` por `plays` (na lista `required` e em `properties`).

Resultado esperado dos quatro schemas:

```yaml
    AnalyticsSummary:
      type: object
      required: [totalClients, totalDevices, totalPlays, totalDuration]
      properties:
        totalClients: { type: integer }
        totalDevices: { type: integer }
        totalPlays: { type: integer }
        totalDuration: { type: integer }
        topAnnouncements:
          type: array
          items:
            $ref: "#/components/schemas/AnnouncementPlayStat"

    ClientAnalytics:
      type: object
      required: [clientId, clientName, totalDevices, totalPlays, totalDuration]
      properties:
        clientId: { type: integer }
        clientName: { type: string }
        totalDevices: { type: integer }
        totalPlays: { type: integer }
        totalDuration: { type: integer }
        topAnnouncements:
          type: array
          items:
            $ref: "#/components/schemas/AnnouncementPlayStat"

    DeviceAnalytics:
      type: object
      required: [deviceId, deviceName, clientId, clientName, totalPlays, totalDuration]
      properties:
        deviceId: { type: integer }
        deviceName: { type: string }
        clientId: { type: integer }
        clientName: { type: string }
        totalPlays: { type: integer }
        totalDuration: { type: integer }
        byAnnouncement:
          type: array
          items:
            $ref: "#/components/schemas/AnnouncementPlayStat"

    AnnouncementAnalytics:
      type: object
      required: [announcementId, title, totalPlays, totalDuration]
      properties:
        announcementId: { type: integer }
        title: { type: string }
        totalPlays: { type: integer }
        totalDuration: { type: integer }
        byDevice:
          type: array
          items:
            type: object
            required: [deviceId, deviceName, clientName, plays, totalDuration]
            properties:
              deviceId: { type: integer }
              deviceName: { type: string }
              clientName: { type: string }
              plays: { type: integer }
              totalDuration: { type: integer }
```

- [ ] **Step 6: Também renomear em `ClientStats`**

O schema `ClientStats` (por volta da linha 628) também usa `totalImpressions` e `AnnouncementImpressionStat`. Aplicar as mesmas trocas: `totalImpressions` → `totalPlays` e `$ref` → `AnnouncementPlayStat`.

Confirme que não sobrou nenhuma referência antiga:
Run: `grep -n "Impression\|totalImpressions\|impressions" lib/api-spec/openapi.yaml`
Expected: nenhum resultado.

- [ ] **Step 7: Regenerar os clientes**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: Gera `lib/api-zod` e `lib/api-client-react` e roda `typecheck:libs` com sucesso.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): renomear telemetry/analytics para plays e adicionar campaignId ao slide"
```

---

## Grupo C — Rotas do api-server

### Task 5: `display.ts` — expor `campaignId` por slide

**Files:**
- Modify: `artifacts/api-server/src/routes/display.ts`

- [ ] **Step 1: Adicionar `campaignId` no select da playlist (sempre null)**

No `db.select({...})` de `playlistSlides`, adicionar a primeira propriedade:

```ts
      announcementId: devicePlaylistTable.announcementId,
      campaignId: sql<number | null>`NULL`,
      title: announcementsTable.title,
```

E adicionar `sql` ao import do `drizzle-orm` (linha 2):

```ts
import { eq, asc, and, or, gte, lte, sql } from "drizzle-orm";
```

- [ ] **Step 2: Adicionar `campaignId` no select das campanhas**

No `db.select({...})` de `campaignSlides`, adicionar:

```ts
      announcementId: campaignAnnouncementsTable.announcementId,
      campaignId: campaignsTable.id,
      title: announcementsTable.title,
```

(A ordem playlist-vs-campanha na dedup permanece: `[...campaignSlides, ...playlistSlides]` — o slide de campanha vence e carrega a atribuição.)

- [ ] **Step 3: Verificar tipos e build**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/display.ts
git commit -m "feat(display): incluir campaignId em cada slide para atribuição de play"
```

---

### Task 6: `telemetry.ts` — endpoint `/telemetry/play` grava `campaignId`

**Files:**
- Modify: `artifacts/api-server/src/routes/telemetry.ts`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```ts
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable, playsTable } from "@workspace/db";
import { RecordPlayBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/telemetry/play", async (req, res): Promise<void> => {
  const parsed = RecordPlayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { deviceKey, announcementId, campaignId, durationSeconds } = parsed.data;

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.deviceKey, deviceKey));

  if (!device) {
    res.status(400).json({ error: "Unknown device key" });
    return;
  }

  await db.insert(playsTable).values({
    deviceId: device.id,
    announcementId,
    campaignId: campaignId ?? null,
    durationSeconds,
  });

  res.status(201).json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS. (Confirma que o nome gerado `RecordPlayBody` existe.)

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/telemetry.ts
git commit -m "feat(telemetry): endpoint /telemetry/play grava campaignId"
```

---

### Task 7: `analytics.ts` — renomear `impressions` → `plays`

**Files:**
- Modify: `artifacts/api-server/src/routes/analytics.ts`

- [ ] **Step 1: Atualizar import de tabela (linhas 3-9)**

Trocar `impressionsTable` por `playsTable`:

```ts
import {
  db,
  clientsTable,
  devicesTable,
  playsTable,
  announcementsTable,
  devicePlaylistTable,
} from "@workspace/db";
```

- [ ] **Step 2: Substituir todas as referências de tabela e campos**

No corpo inteiro do arquivo, aplicar:
- `impressionsTable` → `playsTable` (todas as ocorrências).
- Nos objetos de `.select({...})` e nos `.parse({...})`: a chave `totalImpressions:` → `totalPlays:`, e a chave `impressions:` (aliases de contagem por anúncio/dispositivo) → `plays:`.
- Nas montagens de resposta, `totalImpressions: agg?.totalImpressions ?? 0` → `totalPlays: agg?.totalPlays ?? 0`.

Após a edição, confirme:
Run: `grep -n "impression\|Impression" artifacts/api-server/src/routes/analytics.ts`
Expected: nenhum resultado.

- [ ] **Step 3: Verificar tipos**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS (os nomes de resposta `GetAnalyticsSummaryResponse` etc. agora exigem `totalPlays`/`plays`).

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/analytics.ts
git commit -m "refactor(analytics): renomear impressions para plays"
```

---

### Task 8: `clients.ts` e `devices.ts` — renomear `impressions` → `plays`

**Files:**
- Modify: `artifacts/api-server/src/routes/clients.ts`
- Modify: `artifacts/api-server/src/routes/devices.ts`

- [ ] **Step 1: `clients.ts` — atualizar import (linha 3)**

```ts
import { db, clientsTable, devicesTable, playsTable, announcementsTable } from "@workspace/db";
```

- [ ] **Step 2: `clients.ts` — substituir referências no bloco `/clients/:id/stats`**

- `impressionsTable` → `playsTable` (todas as ocorrências).
- `totalImpressions:` → `totalPlays:` (no `.select` e no `.parse`).
- `impressions:` → `plays:` (no alias de `topAnnouncements`).

Confirme:
Run: `grep -n "impression\|Impression" artifacts/api-server/src/routes/clients.ts`
Expected: nenhum resultado.

- [ ] **Step 3: `devices.ts` — remover import não usado**

A linha 10 importa `impressionsTable` mas ele não é usado. Remover `impressionsTable,` do import de `@workspace/db` em `devices.ts`.

Confirme:
Run: `grep -n "impression\|Impression" artifacts/api-server/src/routes/devices.ts`
Expected: nenhum resultado.

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/clients.ts artifacts/api-server/src/routes/devices.ts
git commit -m "refactor(clients,devices): renomear impressions para plays"
```

---

### Task 9: `advertisers.ts` — anunciante único + atribuição por `plays.campaign_id`

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts`

Esta tarefa reescreve o arquivo inteiro: remove o m2m `campaign_advertisers`, passa a usar um único `advertiserId` por campanha, e troca as subqueries de inferência por timestamp por `plays.campaign_id = campaigns.id`.

- [ ] **Step 1: Substituir o conteúdo inteiro de `advertisers.ts`**

```ts
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  advertisersTable,
  campaignsTable,
  campaignDevicesTable,
  announcementsTable,
  devicesTable,
  playsTable,
  campaignAnnouncementsTable,
} from "@workspace/db";

const router: IRouter = Router();

const advertiserInput = z.object({
  name: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
});

const campaignInput = z.object({
  advertiserId: z.coerce.number().int().positive(),
  announcementId: z.coerce.number().int().positive().optional(),
  announcementIds: z.array(z.coerce.number().int().positive()).default([]),
  name: z.string().min(1),
  contractValue: z.coerce.number().min(0).default(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDevices: z.boolean().default(true),
  deviceIds: z.array(z.coerce.number().int().positive()).default([]),
});

function announcementIdsFor(input: z.infer<typeof campaignInput>) {
  return [...new Set([...(input.announcementIds || []), ...(input.announcementId ? [input.announcementId] : [])])];
}

const campaignSelection = {
  id: campaignsTable.id,
  advertiserId: campaignsTable.advertiserId,
  advertiserName: advertisersTable.name,
  company: advertisersTable.company,
  deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id order by cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
  announcementIds: sql<number[]>`coalesce((select array_agg(cn.announcement_id order by cn.announcement_id) from campaign_announcements cn where cn.campaign_id = ${campaignsTable.id}), array[]::int[])`,
  announcementTitles: sql<string[]>`coalesce((select array_agg(an.title order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), array[]::text[])`,
  name: campaignsTable.name,
  contractValue: campaignsTable.contractValue,
  startsAt: campaignsTable.startsAt,
  endsAt: campaignsTable.endsAt,
  allDevices: campaignsTable.allDevices,
  isActive: campaignsTable.isActive,
  plays: sql<number>`(select count(*)::int from plays p where p.campaign_id = ${campaignsTable.id})`,
  totalDuration: sql<number>`(select coalesce(sum(p.duration_seconds), 0)::int from plays p where p.campaign_id = ${campaignsTable.id})`,
  playsByAnnouncement: sql<Array<{ announcementId: number; title: string; plays: number }>>`coalesce((select json_agg(json_build_object('announcementId', an.id, 'title', an.title, 'plays', (select count(*)::int from plays p where p.campaign_id = ${campaignsTable.id} and p.announcement_id = an.id)) order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), '[]'::json)`,
};

async function campaignWithStats(campaignId: number) {
  const [row] = await db
    .select(campaignSelection)
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .where(eq(campaignsTable.id, campaignId));
  if (!row) return null;
  const devices = await db
    .select({ id: devicesTable.id, name: devicesTable.name, location: devicesTable.location })
    .from(campaignDevicesTable)
    .innerJoin(devicesTable, eq(devicesTable.id, campaignDevicesTable.deviceId))
    .where(eq(campaignDevicesTable.campaignId, campaignId));
  return { ...row, devices };
}

router.get("/advertisers", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: advertisersTable.id,
      name: advertisersTable.name,
      company: advertisersTable.company,
      email: advertisersTable.email,
      phone: advertisersTable.phone,
      createdAt: advertisersTable.createdAt,
      campaignCount: sql<number>`count(distinct ${campaignsTable.id})::int`,
      totalPlays: sql<number>`count(${playsTable.id})::int`,
    })
    .from(advertisersTable)
    .leftJoin(campaignsTable, eq(campaignsTable.advertiserId, advertisersTable.id))
    .leftJoin(playsTable, eq(playsTable.campaignId, campaignsTable.id))
    .groupBy(advertisersTable.id)
    .orderBy(asc(advertisersTable.name));
  res.json(rows);
});

router.post("/advertisers", async (req, res): Promise<void> => {
  const parsed = advertiserInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(advertisersTable).values({
    ...parsed.data,
    email: parsed.data.email || null,
  }).returning();
  res.status(201).json({ ...row, campaignCount: 0, totalPlays: 0 });
});

router.get("/advertisers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [advertiser] = await db.select().from(advertisersTable).where(eq(advertisersTable.id, id));
  if (!advertiser) {
    res.status(404).json({ error: "Advertiser not found" });
    return;
  }
  const campaigns = await db
    .select(campaignSelection)
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .where(eq(campaignsTable.advertiserId, id))
    .orderBy(desc(campaignsTable.startsAt));
  res.json({ ...advertiser, campaigns });
});

router.patch("/advertisers/:id", async (req, res): Promise<void> => {
  const parsed = advertiserInput.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(advertisersTable).set({
    ...parsed.data,
    email: parsed.data.email === "" ? null : parsed.data.email,
  }).where(eq(advertisersTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Advertiser not found" });
    return;
  }
  res.json(row);
});

router.delete("/advertisers/:id", async (req, res): Promise<void> => {
  const [row] = await db.delete(advertisersTable).where(eq(advertisersTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Advertiser not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/campaigns", async (_req, res): Promise<void> => {
  const rows = await db
    .select(campaignSelection)
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .orderBy(desc(campaignsTable.startsAt));
  res.json(rows);
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = campaignInput.refine((v) => v.endsAt > v.startsAt, { message: "End date must be after start date" }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const announcementIds = announcementIdsFor(input);
  if (announcementIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anúncio" });
    return;
  }
  if (!input.allDevices && input.deviceIds.length === 0) {
    res.status(400).json({ error: "Select at least one TV or enable all devices" });
    return;
  }
  const [advertiser] = await db.select({ id: advertisersTable.id }).from(advertisersTable).where(eq(advertisersTable.id, input.advertiserId));
  if (!advertiser) {
    res.status(400).json({ error: "Anunciante não encontrado" });
    return;
  }
  const [campaign] = await db.insert(campaignsTable).values({
    advertiserId: input.advertiserId,
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDevices: input.allDevices,
  }).returning();
  await db.insert(campaignAnnouncementsTable).values(announcementIds.map((announcementId) => ({ campaignId: campaign.id, announcementId }))).onConflictDoNothing();
  if (!input.allDevices && input.deviceIds.length) {
    await db.insert(campaignDevicesTable).values(
      input.deviceIds.map((deviceId) => ({ campaignId: campaign.id, deviceId })),
    ).onConflictDoNothing();
  }
  res.status(201).json(await campaignWithStats(campaign.id));
});

router.patch("/campaigns/:id/toggle", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  await db.update(campaignsTable).set({ isActive: !existing.isActive }).where(eq(campaignsTable.id, id));
  res.json(await campaignWithStats(id));
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  const parsed = campaignInput.refine((v) => v.endsAt > v.startsAt, { message: "End date must be after start date" }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const announcementIds = announcementIdsFor(input);
  if (announcementIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anúncio" });
    return;
  }
  if (!input.allDevices && input.deviceIds.length === 0) {
    res.status(400).json({ error: "Select at least one TV or enable all devices" });
    return;
  }
  const [advertiser] = await db.select({ id: advertisersTable.id }).from(advertisersTable).where(eq(advertisersTable.id, input.advertiserId));
  if (!advertiser) {
    res.status(400).json({ error: "Anunciante não encontrado" });
    return;
  }
  await db.update(campaignsTable).set({
    advertiserId: input.advertiserId,
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDevices: input.allDevices,
  }).where(eq(campaignsTable.id, id));
  await db.insert(campaignAnnouncementsTable).values(announcementIds.map((announcementId) => ({ campaignId: id, announcementId }))).onConflictDoNothing();
  await db.delete(campaignAnnouncementsTable).where(and(eq(campaignAnnouncementsTable.campaignId, id), notInArray(campaignAnnouncementsTable.announcementId, announcementIds)));
  if (input.allDevices || input.deviceIds.length === 0) {
    await db.delete(campaignDevicesTable).where(eq(campaignDevicesTable.campaignId, id));
  } else {
    await db.insert(campaignDevicesTable).values(input.deviceIds.map((deviceId) => ({ campaignId: id, deviceId }))).onConflictDoNothing();
    await db.delete(campaignDevicesTable).where(and(eq(campaignDevicesTable.campaignId, id), notInArray(campaignDevicesTable.deviceId, input.deviceIds)));
  }
  res.json(await campaignWithStats(id));
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const [row] = await db.delete(campaignsTable).where(eq(campaignsTable.id, Number(req.params.id))).returning();
  if (!row) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
```

- [ ] **Step 2: Verificar tipos e build do api-server**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS. Confirme também que sumiram as referências antigas:
Run: `grep -n "impression\|Impression\|campaignAdvertisers\|advertiserIds\|advertiserNames" artifacts/api-server/src/routes/advertisers.ts`
Expected: nenhum resultado.

- [ ] **Step 3: Commit**

```bash
git add artifacts/api-server/src/routes/advertisers.ts
git commit -m "refactor(advertisers): anunciante único por campanha e atribuição via plays.campaign_id"
```

---

## Grupo D — Backfill dos plays históricos

### Task 10: Backfill best-effort de `plays.campaign_id`

**Files:**
- Create: `scripts/src/backfill-play-campaign.ts`
- Modify: `scripts/package.json`

**Contexto:** Plays antigos não têm campanha. Atribuímos apenas os casos **inequívocos** (exatamente uma campanha compatível por play). Ambíguos/sem match permanecem `NULL` — é a atribuição honesta possível.

- [ ] **Step 1: Criar `scripts/src/backfill-play-campaign.ts`**

```ts
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    UPDATE plays p
    SET campaign_id = sub.campaign_id
    FROM (
      SELECT p2.id AS play_id,
             MIN(c.id) AS campaign_id,
             COUNT(DISTINCT c.id) AS n
      FROM plays p2
      JOIN campaign_announcements ca ON ca.announcement_id = p2.announcement_id
      JOIN campaigns c ON c.id = ca.campaign_id
      WHERE p2.created_at >= greatest(c.starts_at, ca.created_at)
        AND p2.created_at <= c.ends_at
        AND (
          c.all_devices
          OR EXISTS (
            SELECT 1 FROM campaign_devices cd
            WHERE cd.campaign_id = c.id
              AND cd.device_id = p2.device_id
              AND p2.created_at >= cd.created_at
          )
        )
      GROUP BY p2.id
    ) sub
    WHERE p.id = sub.play_id
      AND sub.n = 1
      AND p.campaign_id IS NULL
  `);
  console.log(`Backfill de campaign_id concluído. Plays atribuídos: ${result.rowCount ?? 0}`);
}

main()
  .then(async () => { await pool.end(); process.exit(0); })
  .catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
```

- [ ] **Step 2: Adicionar o script em `scripts/package.json`**

No bloco `"scripts"`, adicionar:

```json
    "backfill:play-campaign": "tsx ./src/backfill-play-campaign.ts",
```

- [ ] **Step 3: Rodar o backfill**

Run: `pnpm --filter @workspace/scripts run backfill:play-campaign`
Expected: Imprime "Backfill de campaign_id concluído. Plays atribuídos: N" sem erro.

- [ ] **Step 4: Commit**

```bash
git add scripts/src/backfill-play-campaign.ts scripts/package.json
git commit -m "chore(scripts): backfill best-effort de plays.campaign_id"
```

---

## Grupo E — Frontend

### Task 11: `tv.html` — enviar play com `campaignId` no endpoint novo

**Files:**
- Modify: `artifacts/signage/public/tv.html`

- [ ] **Step 1: Renomear variável e endpoint, incluir campaignId**

No script inline:
- Trocar `var impressionSent = false;` por `var playSent = false;` (linha ~115) e todas as ocorrências de `impressionSent` por `playSent` (linhas ~199, 200, 214).
- Trocar a URL `apiBase() + '/api/telemetry/impression'` por `apiBase() + '/api/telemetry/play'` (linha ~203).
- No corpo do POST (linhas ~203-206), incluir `campaignId`:

```js
        xhrPost(apiBase() + '/api/telemetry/play', {
          deviceKey: key,
          announcementId: slide.announcementId,
          campaignId: slide.campaignId != null ? slide.campaignId : null,
          durationSeconds: slide.duration
```

(Ajuste o nome do campo `deviceKey`/`key` conforme já usado no arquivo — mantenha os demais campos existentes.)

Confirme:
Run: `grep -n "impression\|/telemetry/" artifacts/signage/public/tv.html`
Expected: só a nova URL `/api/telemetry/play`, sem "impression".

- [ ] **Step 2: Commit**

```bash
git add artifacts/signage/public/tv.html
git commit -m "feat(tv): enviar play com campaignId no endpoint /telemetry/play"
```

---

### Task 12: `display.tsx` — enviar play com `campaignId`

**Files:**
- Modify: `artifacts/signage/src/pages/display.tsx`

- [ ] **Step 1: Renomear ref e atualizar o fetch de telemetria**

- Trocar `const impressionSent = useRef(false);` por `const playSent = useRef(false);` e as ocorrências `impressionSent.current` por `playSent.current` (linhas ~22, 37, 45, 46).
- Trocar a URL e o corpo (linhas ~47-53):

```ts
          playSent.current = true;
          fetch(`${import.meta.env.BASE_URL}api/telemetry/play`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceKey,
              announcementId: slide.announcementId,
              campaignId: slide.campaignId ?? null,
              durationSeconds: slide.duration,
            }),
          });
```

(O tipo de `slide` vem de `useGetDeviceSlides`, que após o codegen já inclui `campaignId`.)

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add artifacts/signage/src/pages/display.tsx
git commit -m "feat(display-tsx): enviar play com campaignId no endpoint /telemetry/play"
```

---

### Task 13: Páginas de UI — renomear campos e rótulos (`impressions` → `plays` / "Exibições") e anunciante único

**Files:**
- Modify: `artifacts/signage/src/pages/advertisers.tsx`
- Modify: `artifacts/signage/src/pages/advertiser-detail.tsx`
- Modify: `artifacts/signage/src/pages/analytics.tsx`
- Modify: `artifacts/signage/src/pages/device-detail.tsx`

**Mapeamento de campos (aplicar em todas as páginas):**
- `totalImpressions` → `totalPlays`
- `impressions` (campo numérico e por-anúncio) → `plays`
- `impressionsByAnnouncement` → `playsByAnnouncement`
- Rótulo de UI PT "Impressões"/"impressões" → "Exibições"/"exibições"

- [ ] **Step 1: `advertisers.tsx` — tipos**

No `type Advertiser`: trocar `totalImpressions: number;` por `totalPlays: number;`.
No `type Campaign`: remover as linhas `advertiserNames?: string[];` e `advertiserIds?: number[];`; trocar `impressions: number;` por `plays: number;`; trocar `impressionsByAnnouncement?: Array<{ announcementId: number; title: string; impressions: number }>;` por `playsByAnnouncement?: Array<{ announcementId: number; title: string; plays: number }>;`.

- [ ] **Step 2: `advertisers.tsx` — estado do formulário (anunciante único)**

Trocar `const [selectedAdvertisers, setSelectedAdvertisers] = useState<number[]>([]);` por:

```ts
  const [selectedAdvertiser, setSelectedAdvertiser] = useState<number | null>(null);
```

Em `openNewCampaign`: trocar `setSelectedAdvertisers([]);` por `setSelectedAdvertiser(null);`.
Em `openEditCampaign`: trocar `setSelectedAdvertisers(campaign.advertiserIds ?? []);` por `setSelectedAdvertiser(campaign.advertiserId);`.
Em `submitCampaign` (reset após sucesso): trocar `setSelectedAdvertisers([]);` por `setSelectedAdvertiser(null);`.

- [ ] **Step 3: `advertisers.tsx` — corpo do POST/PATCH**

No `body: JSON.stringify({...})` de `submitCampaign`, trocar `advertiserIds: selectedAdvertisers,` por `advertiserId: selectedAdvertiser,`.

- [ ] **Step 4: `advertisers.tsx` — UI do seletor de anunciante (checkbox múltiplo → rádio único)**

Substituir o bloco do campo "Anunciantes" no formulário de campanha por seleção única:

```tsx
            <div className="space-y-2"><Label>Anunciante</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{advertisers.map((a) => <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="radio" name="advertiser" checked={selectedAdvertiser === a.id} onChange={() => setSelectedAdvertiser(a.id)} />{a.company || a.name}</label>)}</div><p className="text-xs text-muted-foreground">Cada campanha pertence a um único anunciante.</p></div>
```

No botão de submit do formulário de campanha, trocar `disabled={!selectedAdvertisers.length || !selectedAnnouncements.length}` por `disabled={selectedAdvertiser === null || !selectedAnnouncements.length}`.

- [ ] **Step 5: `advertisers.tsx` — render de listas e métricas**

- Métrica: trocar o rótulo `label="Impressões"` por `label="Exibições"` e o valor `campaigns.reduce((s, c) => s + c.impressions, 0)` por `campaigns.reduce((s, c) => s + c.plays, 0)`.
- No card de anunciante: trocar `{advertiser.totalImpressions} impressões` por `{advertiser.totalPlays} exibições`.
- No card de campanha: trocar a expressão `{(campaign.advertiserNames?.length ? campaign.advertiserNames.join(", ") : campaign.advertiserName)}` por `{campaign.advertiserName}`; e trocar `{campaign.impressions} impressões` por `{campaign.plays} exibições`.

Confirme:
Run: `grep -n "impression\|Impression\|advertiserIds\|advertiserNames\|selectedAdvertisers" artifacts/signage/src/pages/advertisers.tsx`
Expected: nenhum resultado.

- [ ] **Step 6: `advertiser-detail.tsx`, `analytics.tsx`, `device-detail.tsx` — aplicar o mapeamento**

Em cada arquivo, aplicar o mapeamento de campos/rótulos acima. Use grep para localizar e ajuste cada ocorrência (tipos locais, JSX e labels):

Run: `grep -rn "impression\|Impression\|advertiserIds\|advertiserNames" artifacts/signage/src/pages/advertiser-detail.tsx artifacts/signage/src/pages/analytics.tsx artifacts/signage/src/pages/device-detail.tsx`

Para cada linha retornada:
- `totalImpressions` → `totalPlays`; `impressions` → `plays`; `impressionsByAnnouncement` → `playsByAnnouncement`.
- Texto visível "Impressões"/"impressões" → "Exibições"/"exibições".
- Em `advertiser-detail.tsx`, se houver uso de `advertiserNames`/`advertiserIds`, trocar por `advertiserName`/`advertiserId` (anunciante único).

Depois, confirme que não sobrou nada:
Run: `grep -rn "impression\|Impression\|advertiserIds\|advertiserNames" artifacts/signage/src/pages/`
Expected: nenhum resultado.

- [ ] **Step 7: Verificar tipos do frontend**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/pages/advertisers.tsx artifacts/signage/src/pages/advertiser-detail.tsx artifacts/signage/src/pages/analytics.tsx artifacts/signage/src/pages/device-detail.tsx
git commit -m "refactor(ui): renomear impressions para exibições/plays e anunciante único por campanha"
```

---

## Grupo F — Validação final

### Task 14: Typecheck, build e smoke test de atribuição

**Files:** nenhum (validação).

- [ ] **Step 1: Typecheck do workspace**

Run: `pnpm run typecheck`
Expected: PASS em libs e artifacts.

- [ ] **Step 2: Build completo**

Run: `PORT=8081 BASE_PATH=/ pnpm run build`
Expected: Build de todos os pacotes sem erro.

- [ ] **Step 3: Subir o ambiente e smoke test de telemetria**

Em um terminal: `./dev.sh` (deixe rodando).
Em outro terminal, gerar um play e conferir a atribuição. Primeiro descubra um `deviceKey`, `announcementId` e `campaignId` válidos e ativos (via painel ou consulta), depois:

```bash
curl -s -X POST http://localhost:8080/api/telemetry/play \
  -H 'Content-Type: application/json' \
  -d '{"deviceKey":"<DEVICE_KEY>","announcementId":<ANN_ID>,"campaignId":<CAMP_ID>,"durationSeconds":10}'
```
Expected: `{"ok":true}` com HTTP 201.

- [ ] **Step 4: Conferir que o play foi atribuído à campanha**

```bash
curl -s http://localhost:8080/api/campaigns | grep -o '"plays":[0-9]*' | head
```
Expected: A campanha alvo mostra `plays` incrementado (atribuição direta via `campaign_id`, sem inferência por timestamp).

- [ ] **Step 5: Conferir analytics renomeado**

```bash
curl -s http://localhost:8080/api/analytics/summary
```
Expected: JSON contém `totalPlays` (e não `totalImpressions`); `topAnnouncements[].plays`.

- [ ] **Step 6: Commit final (se houve ajustes de validação)**

```bash
git add -A
git commit -m "chore: validação final das correções do veículo de mídia" || echo "nada a commitar"
```

---

## Notas de produção (fora do fluxo de tarefas, para o deploy)

- O rename de tabela e o `DROP TABLE campaign_advertisers` devem ser aplicados em produção como o `ALTER`/`DROP` explícito da Task 3 (rodar o mesmo `migrate-plays` contra o banco de produção **antes** de publicar a nova API), para não perder dados no diff automático do Replit.
- Rodar `backfill:play-campaign` (Task 10) em produção após a migração, uma vez.
- Documentação a atualizar após o merge: `README.md` (seção "Arquitetura funcional" menciona "Impressões são registradas pela API de telemetria" → passar a falar de "plays/exibições" e do endpoint `/telemetry/play`).
