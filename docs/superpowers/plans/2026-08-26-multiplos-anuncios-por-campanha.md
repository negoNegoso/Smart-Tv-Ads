# Vários anúncios por campanha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir vincular vários anúncios (peças) a uma mesma campanha, substituindo a coluna única `campaigns.announcement_id` por uma tabela de junção `campaign_announcements`.

**Architecture:** Segue o padrão many-to-many já existente para anunciantes (`campaign_advertisers`) e dispositivos (`campaign_devices`). O banco recebe uma nova tabela de junção; os dados atuais são migrados; a coluna antiga é removida. Backend, exibição e frontend passam a operar com listas de anúncios. Impressões continuam sendo contadas por `announcement_id` (comportamento preservado).

**Tech Stack:** TypeScript, Express, Drizzle ORM (Postgres, `drizzle-kit push`), React + Vite, pnpm workspaces.

**Convenções deste repositório:**
- Não há suíte de testes automatizada. "Verificação" = `typecheck` por pacote + smoke manual.
- Migrations via `drizzle-kit push` (sem arquivos de migration). Antes de qualquer `push` ou script que use o banco, exporte o env: `set -a; source .env; set +a` (o `.env` fica na raiz e contém `DATABASE_URL`).
- Rode comandos a partir da raiz do repo, salvo indicação contrária.

---

## File Structure

- **Create:** `lib/db/src/schema/campaign_announcements.ts` — tabela de junção campanha↔anúncio.
- **Modify:** `lib/db/src/schema/index.ts` — exportar o novo schema.
- **Modify:** `lib/db/src/schema/campaigns.ts` — remover a coluna `announcementId`.
- **Create:** `scripts/src/backfill-campaign-announcements.ts` — backfill único dos vínculos existentes.
- **Modify:** `scripts/package.json` — dependência `@workspace/db` + `drizzle-orm` e script de backfill.
- **Modify:** `artifacts/api-server/src/routes/advertisers.ts` — input, helper, stats e handlers POST/PATCH/GET.
- **Modify:** `artifacts/api-server/src/routes/display.ts` — join via junção (um slide por anúncio).
- **Modify:** `artifacts/signage/src/pages/advertisers.tsx` — multi-select de anúncios + listagem.
- **Modify:** `artifacts/signage/src/pages/advertiser-detail.tsx` — exibir múltiplos títulos.

---

### Task 1: Criar schema da tabela de junção

**Files:**
- Create: `lib/db/src/schema/campaign_announcements.ts`
- Modify: `lib/db/src/schema/index.ts`

- [ ] **Step 1: Criar o schema da tabela de junção**

Create `lib/db/src/schema/campaign_announcements.ts`:

```ts
import { pgTable, serial, integer, unique } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { announcementsTable } from "./announcements";

export const campaignAnnouncementsTable = pgTable(
  "campaign_announcements",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
    announcementId: integer("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
  },
  (t) => [unique("campaign_announcement_unique").on(t.campaignId, t.announcementId)],
);
```

- [ ] **Step 2: Exportar o novo schema**

Modify `lib/db/src/schema/index.ts` — adicionar após a linha `export * from "./campaign_advertisers";`:

```ts
export * from "./campaign_announcements";
```

- [ ] **Step 3: Verificar typecheck da lib db**

Run: `pnpm run typecheck:libs`
Expected: PASS (compila sem erros).

- [ ] **Step 4: Commit**

```bash
git add lib/db/src/schema/campaign_announcements.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add campaign_announcements junction table schema

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Aplicar a criação da tabela no banco (não destrutivo)

**Files:** nenhum (operação de banco). A coluna `campaigns.announcement_id` ainda existe neste ponto.

- [ ] **Step 1: Exportar env e criar a tabela via drizzle push**

Run:
```bash
set -a; source .env; set +a
pnpm --filter @workspace/db push
```
Expected: drizzle-kit reporta a criação da tabela `campaign_announcements` e conclui sem erro. Nenhuma coluna é removida nesta etapa.

- [ ] **Step 2: Confirmar que a tabela existe**

Run:
```bash
set -a; source .env; set +a
node -e "const pg=require('pg');const p=new pg.Pool({connectionString:process.env.DATABASE_URL});p.query(\"select to_regclass('public.campaign_announcements') as t\").then(r=>{console.log(r.rows[0]);return p.end();})"
```
Expected: `{ t: 'campaign_announcements' }` (não `null`).

---

### Task 3: Backfill dos vínculos existentes

**Files:**
- Create: `scripts/src/backfill-campaign-announcements.ts`
- Modify: `scripts/package.json`

- [ ] **Step 1: Adicionar dependências e script ao pacote scripts**

Modify `scripts/package.json`:
- Em `"scripts"`, adicionar a entrada:
```json
"backfill:campaign-announcements": "tsx ./src/backfill-campaign-announcements.ts",
```
- Adicionar bloco `"dependencies"` (o pacote hoje só tem devDependencies):
```json
"dependencies": {
  "@workspace/db": "workspace:*",
  "drizzle-orm": "catalog:"
},
```

Resultado esperado do arquivo (topo):
```json
{
  "name": "@workspace/scripts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "hello": "tsx ./src/hello.ts",
    "backfill:campaign-announcements": "tsx ./src/backfill-campaign-announcements.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@workspace/db": "workspace:*",
    "drizzle-orm": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "tsx": "catalog:"
  }
}
```

- [ ] **Step 2: Instalar para linkar a workspace dep**

Run: `pnpm install`
Expected: instala sem erro; `@workspace/db` linkado em `scripts`.

- [ ] **Step 3: Criar o script de backfill**

Create `scripts/src/backfill-campaign-announcements.ts`:

```ts
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    insert into campaign_announcements (campaign_id, announcement_id)
    select id, announcement_id from campaigns
    on conflict (campaign_id, announcement_id) do nothing
  `);
  console.log(`Backfill concluído. Linhas inseridas: ${result.rowCount ?? 0}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
```

- [ ] **Step 4: Rodar o backfill**

Run:
```bash
set -a; source .env; set +a
pnpm --filter @workspace/scripts run backfill:campaign-announcements
```
Expected: imprime `Backfill concluído. Linhas inseridas: N` (N = número de campanhas existentes) e encerra com código 0.

- [ ] **Step 5: Conferir que cada campanha tem ao menos um vínculo**

Run:
```bash
set -a; source .env; set +a
node -e "const pg=require('pg');const p=new pg.Pool({connectionString:process.env.DATABASE_URL});p.query('select (select count(*) from campaigns) as campaigns, (select count(distinct campaign_id) from campaign_announcements) as linked').then(r=>{console.log(r.rows[0]);return p.end();})"
```
Expected: `campaigns` == `linked` (todas as campanhas migradas).

- [ ] **Step 6: Commit**

```bash
git add scripts/package.json scripts/src/backfill-campaign-announcements.ts pnpm-lock.yaml
git commit -m "chore(scripts): add campaign_announcements backfill script

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Remover a coluna antiga do schema e aplicar (destrutivo — dados já migrados)

**Files:**
- Modify: `lib/db/src/schema/campaigns.ts`

- [ ] **Step 1: Remover a coluna `announcementId` do schema de campaigns**

Modify `lib/db/src/schema/campaigns.ts`. Remover o import de `announcementsTable` (fica sem uso) e a linha da coluna. Resultado completo:

```ts
import { pgTable, text, serial, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { advertisersTable } from "./advertisers";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  advertiserId: integer("advertiser_id").notNull().references(() => advertisersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contractValue: real("contract_value").notNull().default(0),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  allDevices: boolean("all_devices").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
```

> **NÃO faça `push` ainda.** O `push` que remove a coluna só pode rodar depois do backend parar de referenciar `campaignsTable.announcementId` (Task 5), senão o typecheck do backend quebra e a coluna já não existiria. A ordem correta é: editar backend (Task 5) → depois aplicar o push desta task (Task 5, Step final). Este step apenas edita o schema TS.

- [ ] **Step 2: Verificar typecheck da lib db**

Run: `pnpm run typecheck:libs`
Expected: PASS. (O backend ainda referencia a coluna e será corrigido na Task 5; a lib db compila isoladamente.)

_Sem commit isolado aqui — este schema é commitado junto com a Task 5, pois as mudanças são interdependentes._

---

### Task 5: Backend — input, stats e handlers de campanha

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts`

Neste ponto o backend passa a usar `campaign_announcements` em vez de `campaigns.announcement_id`.

- [ ] **Step 1: Importar a tabela de junção**

Modify o bloco de import de `@workspace/db` (linhas ~4-13) para incluir `campaignAnnouncementsTable`:

```ts
import {
  db,
  advertisersTable,
  campaignsTable,
  campaignDevicesTable,
  announcementsTable,
  devicesTable,
  impressionsTable,
  campaignAdvertisersTable,
  campaignAnnouncementsTable,
} from "@workspace/db";
```

- [ ] **Step 2: Atualizar `campaignInput` e adicionar helper de anúncios**

Modify `campaignInput` (linhas ~24-34): tornar `announcementId` opcional e adicionar `announcementIds`:

```ts
const campaignInput = z.object({
  advertiserId: z.coerce.number().int().positive().optional(),
  advertiserIds: z.array(z.coerce.number().int().positive()).default([]),
  announcementId: z.coerce.number().int().positive().optional(),
  announcementIds: z.array(z.coerce.number().int().positive()).default([]),
  name: z.string().min(1),
  contractValue: z.coerce.number().min(0).default(0),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDevices: z.boolean().default(true),
  deviceIds: z.array(z.coerce.number().int().positive()).default([]),
});
```

Logo após `advertiserIdsFor` (linha ~38), adicionar:

```ts
function announcementIdsFor(input: z.infer<typeof campaignInput>) {
  return [...new Set([...(input.announcementIds || []), ...(input.announcementId ? [input.announcementId] : [])])];
}
```

- [ ] **Step 3: Reescrever `campaignWithStats` usando subselects**

Substituir a função `campaignWithStats` inteira (linhas ~40-73) por:

```ts
async function campaignWithStats(campaignId: number) {
  const [row] = await db
    .select({
      id: campaignsTable.id,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      advertiserNames: sql<string[]>`coalesce((select array_agg(a.name order by a.name) from campaign_advertisers ca join advertisers a on a.id = ca.advertiser_id where ca.campaign_id = ${campaignsTable.id}), array[]::text[])`,
      company: advertisersTable.company,
      announcementIds: sql<number[]>`coalesce((select array_agg(cn.announcement_id order by cn.announcement_id) from campaign_announcements cn where cn.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      announcementTitles: sql<string[]>`coalesce((select array_agg(an.title order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), array[]::text[])`,
      name: campaignsTable.name,
      contractValue: campaignsTable.contractValue,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      allDevices: campaignsTable.allDevices,
      isActive: campaignsTable.isActive,
      impressions: sql<number>`(select count(*)::int from impressions i join campaign_announcements cn on cn.announcement_id = i.announcement_id where cn.campaign_id = ${campaignsTable.id} and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})`,
      totalDuration: sql<number>`(select coalesce(sum(i.duration_seconds), 0)::int from impressions i join campaign_announcements cn on cn.announcement_id = i.announcement_id where cn.campaign_id = ${campaignsTable.id} and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})`,
      impressionsByAnnouncement: sql<Array<{ announcementId: number; title: string; impressions: number }>>`coalesce((select json_agg(json_build_object('announcementId', an.id, 'title', an.title, 'impressions', (select count(*)::int from impressions i where i.announcement_id = an.id and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})) order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), '[]'::json)`,
    })
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
```

- [ ] **Step 4: Atualizar `GET /advertisers/:id` (subquery de campanhas)**

No handler `router.get("/advertisers/:id", ...)`, substituir o `.select({...})` das campanhas e seus joins (linhas ~122-145). O select passa a usar subselects e remove os joins de announcement/impressions e o `groupBy`:

```ts
  const campaigns = await db
    .select({
      id: campaignsTable.id,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      advertiserNames: sql<string[]>`coalesce((select array_agg(a.name order by a.name) from campaign_advertisers ca join advertisers a on a.id = ca.advertiser_id where ca.campaign_id = ${campaignsTable.id}), array[]::text[])`,
      announcementIds: sql<number[]>`coalesce((select array_agg(cn.announcement_id order by cn.announcement_id) from campaign_announcements cn where cn.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      announcementTitles: sql<string[]>`coalesce((select array_agg(an.title order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), array[]::text[])`,
      name: campaignsTable.name,
      contractValue: campaignsTable.contractValue,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      allDevices: campaignsTable.allDevices,
      isActive: campaignsTable.isActive,
      impressions: sql<number>`(select count(*)::int from impressions i join campaign_announcements cn on cn.announcement_id = i.announcement_id where cn.campaign_id = ${campaignsTable.id} and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})`,
      totalDuration: sql<number>`(select coalesce(sum(i.duration_seconds), 0)::int from impressions i join campaign_announcements cn on cn.announcement_id = i.announcement_id where cn.campaign_id = ${campaignsTable.id} and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})`,
      impressionsByAnnouncement: sql<Array<{ announcementId: number; title: string; impressions: number }>>`coalesce((select json_agg(json_build_object('announcementId', an.id, 'title', an.title, 'impressions', (select count(*)::int from impressions i where i.announcement_id = an.id and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})) order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), '[]'::json)`,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .where(sql`exists (select 1 from campaign_advertisers ca where ca.campaign_id = ${campaignsTable.id} and ca.advertiser_id = ${id})`)
    .orderBy(desc(campaignsTable.startsAt));
  res.json({ ...advertiser, campaigns });
```

- [ ] **Step 5: Atualizar `GET /campaigns`**

No handler `router.get("/campaigns", ...)`, substituir o `.select({...})` e joins (linhas ~176-199) por:

```ts
  const rows = await db
    .select({
      id: campaignsTable.id,
      advertiserId: campaignsTable.advertiserId,
      advertiserName: advertisersTable.name,
      advertiserIds: sql<number[]>`coalesce((select array_agg(ca.advertiser_id order by ca.advertiser_id) from campaign_advertisers ca where ca.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      deviceIds: sql<number[]>`coalesce((select array_agg(cd.device_id order by cd.device_id) from campaign_devices cd where cd.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      announcementIds: sql<number[]>`coalesce((select array_agg(cn.announcement_id order by cn.announcement_id) from campaign_announcements cn where cn.campaign_id = ${campaignsTable.id}), array[]::int[])`,
      announcementTitles: sql<string[]>`coalesce((select array_agg(an.title order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), array[]::text[])`,
      name: campaignsTable.name,
      contractValue: campaignsTable.contractValue,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      allDevices: campaignsTable.allDevices,
      isActive: campaignsTable.isActive,
      impressions: sql<number>`(select count(*)::int from impressions i join campaign_announcements cn on cn.announcement_id = i.announcement_id where cn.campaign_id = ${campaignsTable.id} and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})`,
      totalDuration: sql<number>`(select coalesce(sum(i.duration_seconds), 0)::int from impressions i join campaign_announcements cn on cn.announcement_id = i.announcement_id where cn.campaign_id = ${campaignsTable.id} and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})`,
      impressionsByAnnouncement: sql<Array<{ announcementId: number; title: string; impressions: number }>>`coalesce((select json_agg(json_build_object('announcementId', an.id, 'title', an.title, 'impressions', (select count(*)::int from impressions i where i.announcement_id = an.id and i.created_at >= ${campaignsTable.startsAt} and i.created_at <= ${campaignsTable.endsAt})) order by an.title) from campaign_announcements cn join announcements an on an.id = cn.announcement_id where cn.campaign_id = ${campaignsTable.id}), '[]'::json)`,
    })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .orderBy(desc(campaignsTable.startsAt));
  res.json(rows);
```

- [ ] **Step 6: Atualizar `POST /campaigns`**

No handler `router.post("/campaigns", ...)`: (a) validar anúncios; (b) inserir sem `announcementId`; (c) inserir vínculos na junção.

Após o bloco que calcula `advertiserIds` e valida (logo antes de `if (!input.allDevices && ...)`), adicionar a validação de anúncios:

```ts
  const announcementIds = announcementIdsFor(input);
  if (announcementIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anúncio" });
    return;
  }
```

Substituir o `db.insert(campaignsTable).values({...})` (que hoje inclui `announcementId`) por:

```ts
  const [campaign] = await db.insert(campaignsTable).values({
    advertiserId: advertiserIds[0],
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDevices: input.allDevices,
  }).returning();
```

Após o insert em `campaignAdvertisersTable`, adicionar o insert dos anúncios:

```ts
  await db.insert(campaignAnnouncementsTable).values(announcementIds.map((announcementId) => ({ campaignId: campaign.id, announcementId }))).onConflictDoNothing();
```

- [ ] **Step 7: Atualizar `PATCH /campaigns/:id`**

No handler `router.patch("/campaigns/:id", ...)`: adicionar validação de anúncios, remover `announcementId` do `update`, e ressincronizar a junção.

Após o cálculo/validação de `advertiserIds`, adicionar (igual ao POST):

```ts
  const announcementIds = announcementIdsFor(input);
  if (announcementIds.length === 0) {
    res.status(400).json({ error: "Selecione pelo menos um anúncio" });
    return;
  }
```

Substituir o `db.update(campaignsTable).set({...})` por (sem `announcementId`):

```ts
  await db.update(campaignsTable).set({
    advertiserId: advertiserIds[0],
    name: input.name,
    contractValue: input.contractValue,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDevices: input.allDevices,
  }).where(eq(campaignsTable.id, id));
```

Após o bloco que ressincroniza `campaignAdvertisersTable` (delete + insert), adicionar a ressincronização dos anúncios:

```ts
  await db.delete(campaignAnnouncementsTable).where(eq(campaignAnnouncementsTable.campaignId, id));
  await db.insert(campaignAnnouncementsTable).values(announcementIds.map((announcementId) => ({ campaignId: id, announcementId }))).onConflictDoNothing();
```

- [ ] **Step 8: Aplicar o `push` que remove a coluna antiga**

Agora que o backend não referencia mais `campaignsTable.announcementId`, aplique o schema da Task 4:

Run:
```bash
set -a; source .env; set +a
pnpm --filter @workspace/db push
```
Expected: drizzle-kit detecta a remoção da coluna `announcement_id` de `campaigns`. Se pedir confirmação para dropar a coluna, confirmar (ou usar `pnpm --filter @workspace/db push-force`). Conclui sem erro.

- [ ] **Step 9: Verificar typecheck do backend + lib**

Run: `pnpm run typecheck:libs && pnpm --filter @workspace/api-server run typecheck`
Expected: PASS nos dois.

- [ ] **Step 10: Commit**

```bash
git add lib/db/src/schema/campaigns.ts artifacts/api-server/src/routes/advertisers.ts
git commit -m "feat(api): support multiple announcements per campaign

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Exibição — um slide por anúncio

**Files:**
- Modify: `artifacts/api-server/src/routes/display.ts`

- [ ] **Step 1: Importar a tabela de junção**

Modify o import de `@workspace/db` (linhas ~3-10) para incluir `campaignAnnouncementsTable`:

```ts
import {
  db,
  devicesTable,
  devicePlaylistTable,
  announcementsTable,
  campaignsTable,
  campaignDevicesTable,
  campaignAnnouncementsTable,
} from "@workspace/db";
```

- [ ] **Step 2: Trocar o join direto por join via junção**

Substituir a query `campaignSlides` (linhas ~53-71) por:

```ts
  const campaignSlides = await db
    .select({
      announcementId: campaignAnnouncementsTable.announcementId,
      title: announcementsTable.title,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
    })
    .from(campaignsTable)
    .innerJoin(campaignAnnouncementsTable, eq(campaignAnnouncementsTable.campaignId, campaignsTable.id))
    .innerJoin(announcementsTable, eq(announcementsTable.id, campaignAnnouncementsTable.announcementId))
    .leftJoin(campaignDevicesTable, eq(campaignDevicesTable.campaignId, campaignsTable.id))
    .where(
      and(
        eq(campaignsTable.isActive, true),
        lte(campaignsTable.startsAt, now),
        gte(campaignsTable.endsAt, now),
        or(eq(campaignsTable.allDevices, true), eq(campaignDevicesTable.deviceId, device.id)),
      ),
    )
    .orderBy(asc(campaignsTable.id));
```

O bloco de dedupe por `seen.has(slide.announcementId)` (linhas ~73-77) permanece inalterado.

- [ ] **Step 3: Verificar typecheck do backend**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/display.ts
git commit -m "feat(api): emit one slide per campaign announcement in display

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Frontend — multi-select de anúncios na página de anunciantes

**Files:**
- Modify: `artifacts/signage/src/pages/advertisers.tsx`

- [ ] **Step 1: Atualizar o tipo `Campaign`**

Modify o tipo `Campaign` (linhas ~23-40): trocar os campos singulares de anúncio por arrays e adicionar o detalhamento:

```ts
type Campaign = {
  id: number;
  advertiserId: number;
  advertiserName: string;
  advertiserNames?: string[];
  advertiserIds?: number[];
  deviceIds?: number[];
  announcementIds: number[];
  announcementTitles: string[];
  name: string;
  contractValue: number;
  startsAt: string;
  endsAt: string;
  allDevices: boolean;
  isActive: boolean;
  impressions: number;
  totalDuration: number;
  impressionsByAnnouncement?: Array<{ announcementId: number; title: string; impressions: number }>;
};
```

- [ ] **Step 2: Adicionar estado de anúncios selecionados e remover `announcementId` do form**

Localizar o estado dos selects (perto de `selectedAdvertisers`/`selectedDevices`, ~linha 59-70). Adicionar:

```ts
  const [selectedAnnouncements, setSelectedAnnouncements] = useState<number[]>([]);
```

No `campaignForm` inicial (linha ~70) e nos resets (linhas ~107 e ~151), remover a chave `announcementId`. Exemplo do estado inicial:

```ts
    name: "", contractValue: "", startsAt: "", endsAt: "",
```

E cada reset `setCampaignForm({ name: "", contractValue: "", startsAt: "", endsAt: "" })`. Nos mesmos pontos de reset, zerar também os anúncios: `setSelectedAnnouncements([]);`.

- [ ] **Step 3: Pré-preencher anúncios ao editar / limpar ao criar**

No `openNewCampaign` (onde hoje zera advertisers/devices), adicionar `setSelectedAnnouncements([]);`.

Na função que abre a edição (onde há `setSelectedAdvertisers(campaign.advertiserIds ?? [])` e `setSelectedDevices(campaign.deviceIds ?? [])`, ~linha 118-124), remover a linha `announcementId: String(campaign.announcementId),` do `setCampaignForm` e adicionar:

```ts
    setSelectedAnnouncements(campaign.announcementIds ?? []);
```

- [ ] **Step 4: Enviar `announcementIds` no submit**

No `submitCampaign` (payload, ~linha 137-141), remover `announcementId: Number(campaignForm.announcementId),` e adicionar:

```ts
        announcementIds: selectedAnnouncements,
```

- [ ] **Step 5: Substituir o `<Select>` único por checkboxes**

Substituir o bloco do "Anúncio / peça" (linha ~264) por um multi-select espelhando o de Anunciantes:

```tsx
            <div className="space-y-2"><Label>Anúncios / peças</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border p-2">{announcements.map((a) => <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted"><input type="checkbox" checked={selectedAnnouncements.includes(a.id)} onChange={(e) => setSelectedAnnouncements(e.target.checked ? [...selectedAnnouncements, a.id] : selectedAnnouncements.filter((id) => id !== a.id))} />{a.title}</label>)}</div><p className="text-xs text-muted-foreground">Você pode vincular vários anúncios à mesma campanha.</p></div>
```

- [ ] **Step 6: Atualizar validação do botão submit**

No `DialogFooter` (linha ~269), trocar `!campaignForm.announcementId` por `!selectedAnnouncements.length`:

```tsx
            <DialogFooter><Button type="submit" disabled={!selectedAdvertisers.length || !selectedAnnouncements.length}>{editingCampaignId !== null ? "Salvar alterações" : "Publicar campanha"}</Button></DialogFooter>
```

- [ ] **Step 7: Atualizar a listagem de campanhas**

Na linha que exibe `campaign.announcementTitle` (linha ~225), trocar por `campaign.announcementTitles.join(", ")`:

```tsx
                    <p className="text-xs text-muted-foreground">{(campaign.advertiserNames?.length ? campaign.advertiserNames.join(", ") : campaign.advertiserName)} · {campaign.announcementTitles.join(", ")}</p>
```

- [ ] **Step 8: Ajustar o disable do botão "Nova campanha"**

A linha ~180 já usa `!announcements.length` — manter. Nenhuma mudança necessária aqui.

- [ ] **Step 9: Verificar typecheck do signage**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: PASS. (Se acusar `announcementTitle`/`announcementId` residual, corrigir os pontos indicados.)

- [ ] **Step 10: Commit**

```bash
git add artifacts/signage/src/pages/advertisers.tsx
git commit -m "feat(signage): multi-select announcements when creating/editing campaigns

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Frontend — página de detalhe do anunciante

**Files:**
- Modify: `artifacts/signage/src/pages/advertiser-detail.tsx`

- [ ] **Step 1: Atualizar o tipo local de campanha**

Modify o tipo que contém `announcementTitle: string;` (linha ~14). Trocar por:

```ts
  announcementTitles: string[];
```

- [ ] **Step 2: Atualizar a exibição do título**

Na linha ~100 que renderiza `{campaign.announcementTitle}`, trocar por:

```tsx
                  <p className="text-sm text-muted-foreground">{campaign.announcementTitles.join(", ")}</p>
```

- [ ] **Step 3: Verificar typecheck do signage**

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add artifacts/signage/src/pages/advertiser-detail.tsx
git commit -m "feat(signage): show multiple announcement titles on advertiser detail

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Verificação final end-to-end

**Files:** nenhum.

- [ ] **Step 1: Typecheck completo do monorepo**

Run: `pnpm run typecheck`
Expected: PASS em todos os pacotes.

- [ ] **Step 2: Build do backend e subir a API**

Run (async/background):
```bash
set -a; source .env; set +a
pnpm --filter @workspace/api-server run dev
```
Expected: servidor sobe na porta configurada sem erro.

- [ ] **Step 3: Smoke manual da API**

Com a API no ar, criar uma campanha com 2 anúncios e conferir a resposta:
```bash
curl -s -X POST http://localhost:8080/api/campaigns \
  -H 'Content-Type: application/json' \
  -d '{"advertiserIds":[1],"announcementIds":[1,2],"name":"Teste multi","contractValue":100,"startsAt":"2026-01-01","endsAt":"2027-01-01","allDevices":true}' | head
```
Expected: JSON com `announcementIds: [1,2]`, `announcementTitles` com 2 itens e `impressionsByAnnouncement` como array. (Ajustar IDs de anunciante/anúncio conforme os existentes no banco.)

- [ ] **Step 4: Conferir slides do display**

```bash
curl -s http://localhost:8080/api/display/<DEVICE_KEY>/slides | head
```
Expected: os 2 anúncios da campanha aparecem como slides distintos (a menos que já estejam em outra campanha/playlist — dedupe por `announcementId`).

- [ ] **Step 5: Smoke manual do frontend**

Rodar o signage (`pnpm --filter @workspace/signage run dev`), abrir a página de anunciantes, criar/editar uma campanha marcando vários anúncios via checkbox, salvar, e confirmar que a listagem mostra os títulos separados por vírgula.

- [ ] **Step 6: Parar a API de dev**

Encerrar o processo iniciado no Step 2 (via o gerenciador de processos da sessão / `kill <PID>`).

---

## Notas de verificação

- **Sem testes automatizados:** este repositório não possui suíte de testes; a verificação é `typecheck` por pacote + smoke manual (curl + UI).
- **Ordem de migração é crítica:** criar tabela (Task 2) → backfill (Task 3) → só então remover a coluna (Task 5, Step 8), garantindo que nenhum dado seja perdido.
- **Impressões compartilhadas:** um anúncio em duas campanhas conta para ambas (contagem por `announcement_id`), e aparece uma vez por TV (dedupe). Comportamento preservado, conforme o spec.
