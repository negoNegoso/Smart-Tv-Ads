# Empresas — cadastro unificado — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clientes e anunciantes passam a ser perfis de uma `companies` com endereço por CEP (lat/lng), status e observações; admins passam a existir no banco.

**Architecture:** Nova tabela `companies` guarda nome, contato, segmento, status, notas e endereço. `clients` e `advertisers` ficam só com `company_id` único, preservando os ids usados por `devices`, `campaigns`, `panels` e vínculos de usuário. A regra de concorrência compara empresas. A migração zera cadastro/operação e mantém só `announcements` (admin) e `segments`.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM + PostgreSQL (Neon), zod, Orval, vitest + supertest, React 18 + wouter + TanStack Query + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-15-empresas-cadastro-unificado-design.md`

## Global Constraints

- Branch: `feat/empresas`. Nunca commitar em `main`.
- Gerenciador: **pnpm**. Nunca `npm`/`yarn`.
- Textos de UI e mensagens de erro da API em **português do Brasil**.
- Testes da API não tocam banco nem rede: `vi.mock` de módulo de serviço e `vi.stubGlobal("fetch")`, como em `src/routes/__tests__/portal-scope.test.ts`.
- Status válidos: `active` | `paused` | `closed`. Status **não** bloqueia exibição.
- CEP gravado com 8 dígitos, sem máscara. Timeout de cada API de CEP: **5000 ms**.
- AwesomeAPI: `https://cep.awesomeapi.com.br/json/{cep}`. Reserva: `https://brasilapi.com.br/api/cep/v2/{cep}`.
- Toda empresa tem pelo menos um papel (cliente e/ou anunciante).
- Após alterar `lib/db`: `cd lib/db && npx tsc --build`.
- Após alterar `lib/api-spec/openapi.yaml`: `pnpm --filter @workspace/api-spec run codegen`.
- `pnpm run typecheck` só fica verde de novo ao fim da Task 4 (backend) e da Task 10 (frontend). Entre elas, rode apenas os testes indicados.
- Nenhum comando contra o banco de produção. Validação só no branch do Neon (Task 11), com confirmação explícita do dono antes de qualquer deploy.

---

## Estrutura de arquivos

**Criar:**

| arquivo | responsabilidade |
| --- | --- |
| `lib/db/src/schema/companies.ts` | tabela `companies` + `COMPANY_STATUSES` |
| `lib/db/drizzle/0007_*.sql`, `0008_*.sql` | limpeza + schema novo |
| `artifacts/api-server/src/lib/cep.ts` | consulta de CEP com reserva |
| `artifacts/api-server/src/routes/cep.ts` | `GET /cep/:cep` |
| `artifacts/api-server/src/lib/companies/input.ts` | validação zod da empresa (puro) |
| `artifacts/api-server/src/lib/companies/roles.ts` | regra de ligar/desligar papel e bloqueio de exclusão (puro) |
| `artifacts/api-server/src/lib/companies/store.ts` | leitura/escrita de empresas e perfis |
| `artifacts/api-server/src/routes/companies.ts` | CRUD `/companies` |
| `artifacts/api-server/src/lib/auth/admin-guard.ts` | regra do último admin (puro) |
| `artifacts/signage/src/lib/companies-api.ts` | chamadas HTTP de empresas e CEP |
| `artifacts/signage/src/components/company-form-dialog.tsx` | formulário de empresa com CEP |
| `artifacts/signage/src/components/client-devices-section.tsx` | TVs do cliente (extraído) |
| `artifacts/signage/src/components/advertiser-campaigns-section.tsx` | campanhas do anunciante (extraído) |
| `artifacts/signage/src/pages/companies.tsx` | lista de empresas |
| `artifacts/signage/src/pages/company-detail.tsx` | detalhe com abas |
| `artifacts/signage/src/pages/legacy-redirect.tsx` | `/clients/:id` e `/advertisers/:id` → empresa |

**Modificar:** `lib/db/src/schema/{clients,advertisers,users,index}.ts`, `lib/api-spec/openapi.yaml`, `artifacts/api-server/src/lib/{ad-eligibility,device-feed}.ts`, `lib/portal/{queries,overview}.ts`, `lib/public-stats/queries.ts`, `lib/auth/{user-store,middleware}.ts`, `routes/{index,clients,advertisers,devices,display,analytics,users,auth}.ts` e testes existentes; `artifacts/signage/src/{App.tsx,components/layout.tsx,pages/users.tsx}`. Links para `/clients/:id` e `/advertisers/:id` em `device-detail.tsx` e `campaign-detail.tsx` seguem funcionando pelo redirecionamento da Task 10.

**Remover (Task 10):** `artifacts/signage/src/pages/{clients,client-detail,advertisers,advertiser-detail}.tsx`.

---

### Task 1: Schema de empresas e migração com recomeço

**Files:**
- Create: `lib/db/src/schema/companies.ts`
- Modify: `lib/db/src/schema/clients.ts`, `lib/db/src/schema/advertisers.ts`, `lib/db/src/schema/users.ts`, `lib/db/src/schema/index.ts`
- Create (gerados): `lib/db/drizzle/0007_*.sql`, `lib/db/drizzle/0008_*.sql`, snapshots em `lib/db/drizzle/meta/`

**Interfaces:**
- Produces: `companiesTable`, `Company`, `InsertCompany`, `COMPANY_STATUSES`, `CompanyStatus`; `clientsTable.companyId`; `advertisersTable.companyId`, `advertisersTable.company`; `usersTable.name`, `usersTable.isAdmin`. Removidos: `clientsTable.{name,email,phone,segmentId}`, `advertisersTable.{name,email,phone,segmentId,clientId}`.

A geração é feita em **duas passadas** para o `drizzle-kit` não abrir prompt interativo de "coluna renomeada?" (ele pergunta quando a mesma tabela perde e ganha coluna no mesmo diff).

- [ ] **Step 1: Criar `companies.ts`**

```ts
// lib/db/src/schema/companies.ts
import { pgTable, text, serial, timestamp, integer, doublePrecision, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { segmentsTable } from "./segments";

/** Situação cadastral. Só organização: não tira nada do ar. */
export const COMPANY_STATUSES = ["active", "paused", "closed"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

// Empresa é o cadastro único. Ser dona de TV (clients) ou anunciar
// (advertisers) são perfis ligados a ela — a mesma loja não se repete.
export const companiesTable = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // Ramo da empresa: chave da regra de concorrência nos dois papéis.
    segmentId: integer("segment_id").references(() => segmentsTable.id, { onDelete: "set null" }),
    // "active" | "paused" | "closed"
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    // 8 dígitos, sem máscara.
    cep: text("cep"),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    district: text("district"),
    city: text("city"),
    // UF, duas letras.
    state: text("state"),
    cityIbge: text("city_ibge"),
    // Centro do CEP; nulos quando a API não devolve coordenada.
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("companies_status_idx").on(t.status), index("companies_segment_idx").on(t.segmentId)],
);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
```

- [ ] **Step 2: Exportar em `index.ts`**

Em `lib/db/src/schema/index.ts`, logo após `export * from "./segments";`:

```ts
export * from "./companies";
```

- [ ] **Step 3: Passada 1 — só remover colunas antigas**

`lib/db/src/schema/clients.ts` inteiro:

```ts
import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
```

`lib/db/src/schema/advertisers.ts` inteiro:

```ts
import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const advertisersTable = pgTable("advertisers", {
  id: serial("id").primaryKey(),
  // Nome comercial exibido nas campanhas; o nome da empresa vem de companies.
  company: text("company"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAdvertiserSchema = createInsertSchema(advertisersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdvertiser = z.infer<typeof insertAdvertiserSchema>;
export type Advertiser = typeof advertisersTable.$inferSelect;
```

Run: `cd lib/db && DATABASE_URL=postgres://gerar@localhost/gerar pnpm run generate`
Expected: cria `drizzle/0007_<nome>.sql` com `CREATE TABLE "companies"` e `ALTER TABLE ... DROP COLUMN` sem nenhum prompt. (O `DATABASE_URL` falso só satisfaz o `drizzle.config.ts`; `generate` não conecta.)

- [ ] **Step 4: Passada 2 — adicionar `company_id` e colunas de usuário**

Em `clients.ts`, importar `integer` e `companiesTable` e adicionar depois de `id`:

```ts
import { pgTable, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
// ...
  // Perfil de dono de TV da empresa. Único: uma empresa, no máximo um perfil.
  companyId: integer("company_id")
    .notNull()
    .unique()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
```

Em `advertisers.ts`, importar `integer` e `companiesTable` e adicionar depois de `id`:

```ts
import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
// ...
  // Perfil de anunciante da empresa. Único: uma empresa, no máximo um perfil.
  companyId: integer("company_id")
    .notNull()
    .unique()
    .references(() => companiesTable.id, { onDelete: "cascade" }),
```

Em `users.ts`, depois de `passwordHash`:

```ts
  name: text("name"),
  // Admin no banco: mesmo acesso do admin do env.
  isAdmin: boolean("is_admin").notNull().default(false),
```

Run: `cd lib/db && DATABASE_URL=postgres://gerar@localhost/gerar pnpm run generate`
Expected: cria `drizzle/0008_<nome>.sql` só com `ADD COLUMN` / `ADD CONSTRAINT`, sem prompt.

- [ ] **Step 5: Pôr a limpeza no topo do `0007`**

No início de `lib/db/drizzle/0007_<nome>.sql`, antes de qualquer outra linha:

```sql
-- Recomeço do cadastro (decisão do dono, spec 2026-09-15): sobrevivem só
-- announcements de origem admin e segments. Nenhuma FK de announcements ou
-- segments aponta para as tabelas abaixo, então o CASCADE não os alcança.
TRUNCATE TABLE "scans", "plays", "campaign_announcements", "campaign_devices", "campaign_segments", "campaigns", "device_playlist", "panel_slides", "panel_items", "panels", "devices", "user_clients", "user_advertisers", "users", "advertisers", "clients" RESTART IDENTITY CASCADE;--> statement-breakpoint
-- Peças geradas por painel ficam sem painel para editar ou republicar.
DELETE FROM "announcements" WHERE "source" = 'panel';--> statement-breakpoint
```

- [ ] **Step 6: Conferir que nada aponta de announcements/segments para as tabelas truncadas**

Run: `cd lib/db && grep -n "references" src/schema/announcements.ts src/schema/segments.ts`
Expected: nenhuma saída.

- [ ] **Step 7: Compilar a lib**

Run: `cd lib/db && npx tsc --build`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/schema lib/db/drizzle
git commit -m "feat(db): empresas como cadastro único de clientes e anunciantes"
```

---

### Task 2: Regra de concorrência por empresa

**Files:**
- Modify: `artifacts/api-server/src/lib/ad-eligibility.ts`
- Test: `artifacts/api-server/src/lib/__tests__/ad-eligibility.test.ts`

**Interfaces:**
- Produces:
  - `canPlayOnDevice(input: { advertiserSegmentId: number | null; advertiserCompanyId: number | null; deviceCompanyId: number; deviceSegmentId: number | null }): boolean`
  - `filterEligibleSlides<T extends CampaignTarget & CampaignSchedule & { advertiserSegmentId: number | null; advertiserCompanyId: number | null }>(slides: T[], device: { id: number; companyId: number; segmentId: number | null }, now?: Date): T[]`
  - `countReachedDevices(campaign: CampaignTarget & { advertiserSegmentId: number | null; advertiserCompanyId: number | null }, devices: Array<{ id: number; companyId: number; segmentId: number | null }>): number`

- [ ] **Step 1: Renomear no teste existente**

Run: `cd artifacts/api-server && sed -i '' 's/ClientId/CompanyId/g; s/clientId/companyId/g' src/lib/__tests__/ad-eligibility.test.ts`

No `describe("canPlayOnDevice")`, trocar o título do caso "libera o anunciante na TV do próprio cliente mesmo com segmento igual" por "libera o anunciante na TV da própria empresa mesmo com segmento igual" (o corpo já ficou com `advertiserCompanyId: 20, deviceCompanyId: 20`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/__tests__/ad-eligibility.test.ts`
Expected: FAIL em "bloqueia anunciante de fora com o mesmo segmento do dono da TV" (o código ainda lê `advertiserClientId`, que chega `undefined === undefined`).

- [ ] **Step 3: Implementar**

Em `ad-eligibility.ts`, substituir `canPlayOnDevice`, `filterEligibleSlides` e `countReachedDevices`:

```ts
/**
 * Decide se a peça de um anunciante pode ir ao ar na TV de um cliente.
 *
 * Regra do concorrente: anunciante e dono da TV do mesmo segmento não se
 * misturam — a padaria A não anuncia na TV da padaria B. A exceção é a TV da
 * própria empresa: o perfil de anunciante e o de cliente apontam para a mesma
 * `companies.id`.
 *
 * Sem segmento em qualquer um dos lados, a peça passa.
 */
export function canPlayOnDevice(input: {
  advertiserSegmentId: number | null;
  advertiserCompanyId: number | null;
  deviceCompanyId: number;
  deviceSegmentId: number | null;
}): boolean {
  const { advertiserSegmentId, advertiserCompanyId, deviceCompanyId, deviceSegmentId } = input;
  if (advertiserSegmentId === null || deviceSegmentId === null) return true;
  if (advertiserSegmentId !== deviceSegmentId) return true;
  return advertiserCompanyId === deviceCompanyId;
}

/**
 * Monta a grade da TV: primeiro o alvo da campanha (esta TV está na mira?),
 * depois a concorrência (o anunciante pode entrar aqui?).
 */
export function filterEligibleSlides<
  T extends CampaignTarget &
    CampaignSchedule & { advertiserSegmentId: number | null; advertiserCompanyId: number | null },
>(
  slides: T[],
  device: { id: number; companyId: number; segmentId: number | null },
  now: Date = new Date(),
): T[] {
  return slides.filter(
    (slide) =>
      campaignRunsOnDay(slide.weekdays, now) &&
      campaignReachesDevice(slide, device) &&
      canPlayOnDevice({
        advertiserSegmentId: slide.advertiserSegmentId,
        advertiserCompanyId: slide.advertiserCompanyId,
        deviceCompanyId: device.companyId,
        deviceSegmentId: device.segmentId,
      }),
  );
}

/** Quantas TVs a campanha realmente alcança, já descontada a concorrência. */
export function countReachedDevices(
  campaign: CampaignTarget & { advertiserSegmentId: number | null; advertiserCompanyId: number | null },
  devices: Array<{ id: number; companyId: number; segmentId: number | null }>,
): number {
  return devices.filter(
    (device) =>
      campaignReachesDevice(campaign, device) &&
      canPlayOnDevice({
        advertiserSegmentId: campaign.advertiserSegmentId,
        advertiserCompanyId: campaign.advertiserCompanyId,
        deviceCompanyId: device.companyId,
        deviceSegmentId: device.segmentId,
      }),
  ).length;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/__tests__/ad-eligibility.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/ad-eligibility.ts artifacts/api-server/src/lib/__tests__/ad-eligibility.test.ts
git commit -m "feat(ads): concorrência compara empresas, não cliente dono"
```

---
### Task 3: TV e feed leem segmento e empresa pela `companies`

**Files:**
- Modify: `artifacts/api-server/src/lib/device-feed.ts`, `artifacts/api-server/src/routes/display.ts`, `artifacts/api-server/src/routes/devices.ts:190-215`, `artifacts/api-server/src/lib/portal/queries.ts:30-135`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`, `device-preview.test.ts`, `portal-device-preview.test.ts`

**Interfaces:**
- Consumes: `filterEligibleSlides`, `countReachedDevices` (Task 2); `companiesTable`, `clientsTable.companyId`, `advertisersTable.companyId` (Task 1).
- Produces: `type FeedDevice = { id: number; clientId: number; companyId: number; segmentId: number | null }`; `previewDevice(deviceId: number): Promise<FeedDevice | null>`.

- [ ] **Step 1: Mudar o feed**

Em `lib/device-feed.ts`:

```ts
import {
  db,
  devicePlaylistTable,
  announcementsTable,
  campaignsTable,
  campaignAnnouncementsTable,
  advertisersTable,
  companiesTable,
} from "@workspace/db";
// ...
export type FeedDevice = { id: number; clientId: number; companyId: number; segmentId: number | null };
```

No select de `playlistSlides`, trocar `advertiserClientId: sql<number | null>\`NULL\`,` por:

```ts
      advertiserCompanyId: sql<number | null>`NULL`,
```

No select de `campaignSlides`, trocar as duas linhas de anunciante por:

```ts
      advertiserSegmentId: companiesTable.segmentId,
      advertiserCompanyId: advertisersTable.companyId,
```

e logo depois de `.innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))`:

```ts
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
```

No `deduped.map(async ({ ... }))`, trocar `advertiserClientId,` por `advertiserCompanyId,`.

- [ ] **Step 2: Mudar as três leituras de device**

Em `routes/display.ts`:

```ts
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
// ...
  const [device] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.deviceKey, raw));
```

Em `routes/devices.ts` (rota `/devices/:id/preview`), adicionar `companiesTable` ao import de `@workspace/db` e usar:

```ts
  const [device] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.id, params.data.id));
```

Em `lib/portal/queries.ts`, adicionar `companiesTable` ao import. Em `advertiserCampaigns`:

```ts
      advertiserSegmentId: companiesTable.segmentId,
      advertiserCompanyId: advertisersTable.companyId,
```

```ts
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
```

```ts
    .groupBy(campaignsTable.id, companiesTable.segmentId, advertisersTable.companyId)
```

```ts
  const network = await db
    .select({ id: devicesTable.id, companyId: clientsTable.companyId, segmentId: companiesTable.segmentId })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId));

  return rows.map(({ targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId, ...campaign }) => ({
    ...campaign,
    deviceCount: countReachedDevices(
      { targetMode, deviceIds, segmentIds, advertiserSegmentId, advertiserCompanyId },
      network,
    ),
  }));
```

E `previewDevice`:

```ts
export async function previewDevice(deviceId: number): Promise<FeedDevice | null> {
  const [row] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.id, deviceId));
  return row ?? null;
}
```

com `import type { FeedDevice } from "../device-feed";` no topo.

- [ ] **Step 3: Rodar os testes e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/routes/__tests__/display-slides.test.ts src/routes/__tests__/device-preview.test.ts`
Expected: FAIL — o mock de `@workspace/db` não tem `companiesTable` (`Cannot read properties of undefined (reading 'id')`).

- [ ] **Step 4: Atualizar os mocks**

Em `display-slides.test.ts` e `device-preview.test.ts`, dentro do `vi.mock("@workspace/db", ...)`:

```ts
  advertisersTable: { id: "id", companyId: "companyId" },
  clientsTable: { id: "id", companyId: "companyId", name: "name" },
  companiesTable: { id: "id", segmentId: "segmentId", name: "name" },
```

e a linha do device:

```ts
const DEVICE_ROW = { id: 1, clientId: 7, companyId: 70, segmentId: null };
```

Em todas as fixtures de slide de campanha desses dois arquivos, trocar `advertiserClientId` por `advertiserCompanyId`:

Run: `cd artifacts/api-server && sed -i '' 's/advertiserClientId/advertiserCompanyId/g' src/routes/__tests__/display-slides.test.ts src/routes/__tests__/device-preview.test.ts`

Em `portal-device-preview.test.ts`, acrescentar `companyId` aos devices mockados:

```ts
    const device = { id: 3, clientId: 12, companyId: 120, segmentId: null };
```

```ts
    previewDevice.mockResolvedValue({ id: 4, clientId: 99, companyId: 990, segmentId: null });
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/routes/__tests__/display-slides.test.ts src/routes/__tests__/device-preview.test.ts src/routes/__tests__/portal-device-preview.test.ts src/routes/__tests__/portal-scope.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src
git commit -m "feat(devices): TV resolve segmento e empresa pelo cadastro de empresa"
```

---
### Task 4: Leituras de cliente e anunciante vêm da empresa

**Files:**
- Modify: `artifacts/api-server/src/routes/clients.ts`, `routes/advertisers.ts`, `routes/devices.ts:39-80`, `routes/analytics.ts`, `lib/portal/overview.ts:42-60`, `lib/portal/queries.ts:148-153`, `lib/public-stats/queries.ts:45-52`
- Modify: `lib/api-spec/openapi.yaml` (schema `Client`)

**Interfaces:**
- Consumes: `companiesTable` (Task 1).
- Produces: `GET /clients` e `GET /clients/:id` → `{ id, companyId, name, email, phone, segmentId, segmentName, deviceCount, createdAt }`; `GET /advertisers` → `{ id, companyId, name, company, email, phone, segmentId, segmentName, campaignCount, totalPlays, createdAt }`; `GET /advertisers/:id` → `{ id, companyId, name, company, email, phone, segmentId, campaigns }`. Removidos: `POST/PATCH/DELETE /clients[/:id]` e `POST/PATCH/DELETE /advertisers[/:id]` (escrita passa por `/companies`, Task 6).

Mudança só de consulta, sem regra nova: a verificação é typecheck + suíte inteira.

- [ ] **Step 1: `Client` no OpenAPI ganha `companyId`**

Em `lib/api-spec/openapi.yaml`, schema `Client`:

```yaml
    Client:
      type: object
      required: [id, companyId, name, createdAt, deviceCount]
      properties:
        id: { type: integer }
        companyId: { type: integer }
        name: { type: string }
        email: { type: ["string", "null"] }
        phone: { type: ["string", "null"] }
        segmentId: { type: ["integer", "null"] }
        segmentName: { type: ["string", "null"] }
        deviceCount: { type: integer }
        createdAt: { type: string, format: date-time }
```

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro.

- [ ] **Step 2: `routes/clients.ts`**

Imports:

```ts
import { eq, asc, sql, desc } from "drizzle-orm";
import { db, clientsTable, companiesTable, devicesTable, playsTable, announcementsTable, segmentsTable } from "@workspace/db";
import {
  ListClientsResponse,
  GetClientParams,
  GetClientResponse,
  GetClientStatsParams,
  GetClientStatsResponse,
} from "@workspace/api-zod";
```

Seleção compartilhada (substitui o corpo de `getClientWithCount` e do `GET /clients`):

```ts
const clientSelection = {
  id: clientsTable.id,
  companyId: clientsTable.companyId,
  name: companiesTable.name,
  email: companiesTable.email,
  phone: companiesTable.phone,
  segmentId: companiesTable.segmentId,
  segmentName: segmentsTable.name,
  createdAt: clientsTable.createdAt,
  deviceCount: sql<number>`COUNT(${devicesTable.id})::int`,
};

function clientQuery() {
  return db
    .select(clientSelection)
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .leftJoin(segmentsTable, eq(segmentsTable.id, companiesTable.segmentId))
    .leftJoin(devicesTable, eq(devicesTable.clientId, clientsTable.id))
    .groupBy(clientsTable.id, companiesTable.id, segmentsTable.name);
}

async function getClientWithCount(id: number) {
  const rows = await clientQuery().where(eq(clientsTable.id, id));
  return rows[0] ?? null;
}

router.get("/clients", async (_req, res): Promise<void> => {
  const rows = await clientQuery().orderBy(asc(companiesTable.name));
  res.json(ListClientsResponse.parse(rows));
});
```

Apagar os handlers `router.post("/clients")`, `router.patch("/clients/:id")` e `router.delete("/clients/:id")`. `GET /clients/:id` e `/clients/:id/stats` ficam como estão.

- [ ] **Step 3: `routes/advertisers.ts`**

1. Adicionar `companiesTable` ao import de `@workspace/db`; remover `clientsTable` e `segmentsTable` só se nada mais os usar depois das mudanças abaixo (`segmentsTable` continua usado).
2. Apagar a constante `advertiserInput` e os handlers `router.post("/advertisers")`, `router.patch("/advertisers/:id")`, `router.delete("/advertisers/:id")`.
3. Em `campaignSelection`: `advertiserName: companiesTable.name,`.
4. Em **todo** `.innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))` do arquivo (hoje nas linhas ~166, ~226 e ~262), acrescentar logo abaixo:

```ts
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
```

Run: `grep -c "innerJoin(companiesTable" artifacts/api-server/src/routes/advertisers.ts`
Expected: igual ao número de `innerJoin(advertisersTable` (`grep -c "innerJoin(advertisersTable" ...`).

5. `GET /advertisers`:

```ts
router.get("/advertisers", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: advertisersTable.id,
      companyId: advertisersTable.companyId,
      name: companiesTable.name,
      company: advertisersTable.company,
      email: companiesTable.email,
      phone: companiesTable.phone,
      segmentId: companiesTable.segmentId,
      segmentName: segmentsTable.name,
      createdAt: advertisersTable.createdAt,
      campaignCount: sql<number>`count(distinct ${campaignsTable.id})::int`,
      totalPlays: sql<number>`count(${playsTable.id})::int`,
    })
    .from(advertisersTable)
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .leftJoin(segmentsTable, eq(segmentsTable.id, companiesTable.segmentId))
    .leftJoin(campaignsTable, eq(campaignsTable.advertiserId, advertisersTable.id))
    .leftJoin(playsTable, eq(playsTable.campaignId, campaignsTable.id))
    .groupBy(advertisersTable.id, companiesTable.id, segmentsTable.name)
    .orderBy(asc(companiesTable.name));
  res.json(rows);
});
```

6. `GET /advertisers/:id`, trocar a busca do anunciante:

```ts
  const [advertiser] = await db
    .select({
      id: advertisersTable.id,
      companyId: advertisersTable.companyId,
      name: companiesTable.name,
      company: advertisersTable.company,
      email: companiesTable.email,
      phone: companiesTable.phone,
      segmentId: companiesTable.segmentId,
    })
    .from(advertisersTable)
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(eq(advertisersTable.id, id));
```

- [ ] **Step 4: `routes/devices.ts`**

Adicionar `companiesTable` ao import. Em `getDeviceWithClient` e no `GET /devices`: `clientName: companiesTable.name,` e, logo após cada `.innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))`:

```ts
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
```

- [ ] **Step 5: `routes/analytics.ts`**

Adicionar `companiesTable` ao import.

Linha ~106 (analytics de cliente):

```ts
  const [client] = await db
    .select({ id: clientsTable.id, name: companiesTable.name })
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(clientsTable.id, clientId));
```

Linhas ~162 e ~235: `clientName: companiesTable.name` e, após o `innerJoin(clientsTable, ...)`, `.innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))`. No `groupBy` da linha ~243, trocar `clientsTable.name` por `companiesTable.name`.

Linha ~333: `advertiserName: companiesTable.name,` e, após o `innerJoin(advertisersTable, ...)`, `.innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))`.

Run: `grep -nE "(clientsTable|advertisersTable)\.(name|email|phone|segmentId|clientId)" artifacts/api-server/src -r`
Expected: nenhuma saída.

- [ ] **Step 6: portal e estatísticas públicas**

`lib/portal/overview.ts` (adicionar `companiesTable` ao import):

```ts
async function advertiserName(advertiserIds: number[]): Promise<string | null> {
  if (advertiserIds.length !== 1) return null;
  const [row] = await db
    .select({ name: companiesTable.name })
    .from(advertisersTable)
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(eq(advertisersTable.id, advertiserIds[0]));
  return row?.name ?? null;
}

/** Mesma regra de `advertiserName`, para clientes. */
async function clientName(clientIds: number[]): Promise<string | null> {
  if (clientIds.length !== 1) return null;
  const [row] = await db
    .select({ name: companiesTable.name })
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(clientsTable.id, clientIds[0]));
  return row?.name ?? null;
}
```

`lib/portal/queries.ts`, `clientsOf`:

```ts
  return db
    .select({ id: clientsTable.id, name: companiesTable.name })
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(inArray(clientsTable.id, clientIds))
    .orderBy(companiesTable.name);
```

`lib/public-stats/queries.ts` (adicionar `companiesTable` e `eq` aos imports):

```ts
  const [segments] = await db
    .select({ n: sql<number>`COUNT(DISTINCT ${companiesTable.segmentId})::int` })
    .from(clientsTable)
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(isNotNull(companiesTable.segmentId));
```

- [ ] **Step 7: Verificar**

Run: `cd lib/db && npx tsc --build && cd ../.. && pnpm run typecheck`
Expected: sem erros. Se o frontend acusar `useCreateClient`/`useUpdateClient`, confira se o Step 1 não removeu essas operações — elas saem só na Task 10.

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec lib/api-client-react lib/api-zod artifacts/api-server/src
git commit -m "feat(api): clientes e anunciantes leem nome, contato e segmento da empresa"
```

---
### Task 5: Consulta de CEP com reserva

**Files:**
- Create: `artifacts/api-server/src/lib/cep.ts`, `artifacts/api-server/src/routes/cep.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`, `lib/api-spec/openapi.yaml`
- Test: `artifacts/api-server/src/lib/__tests__/cep.test.ts`, `artifacts/api-server/src/routes/__tests__/cep.test.ts`

**Interfaces:**
- Produces:
  - `interface CepResult { cep: string; street: string | null; district: string | null; city: string; state: string; cityIbge: string | null; lat: number | null; lng: number | null }`
  - `normalizeCep(raw: string): string` — lança `CepInvalidError`
  - `lookupCep(raw: string): Promise<CepResult>` — lança `CepInvalidError`, `CepNotFoundError`, `CepUnavailableError`
  - `GET /cep/:cep` → `200 CepResult` | `400` | `404` | `502`, corpo de erro `{ error: string }`

Regra: AwesomeAPI primeiro. `404`/`400` dela = CEP inexistente (não consulta a reserva). Erro de rede, timeout ou outro status = tenta BrasilAPI. BrasilAPI `404` = inexistente; qualquer outra falha = indisponível.

- [ ] **Step 1: Teste da lib**

```ts
// artifacts/api-server/src/lib/__tests__/cep.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { CepInvalidError, CepNotFoundError, CepUnavailableError, lookupCep, normalizeCep } from "../cep";

const AWESOME_PAULISTA = {
  cep: "01310100", address: "Avenida Paulista", state: "SP", district: "Bela Vista",
  lat: "-23.5632188", lng: "-46.6542596", city: "São Paulo", city_ibge: "3550308",
};
const BRASIL_PAULISTA = {
  cep: "01310100", state: "SP", city: "São Paulo", neighborhood: "Bela Vista", street: "Avenida Paulista",
  ibge: { city: "3550308" }, location: { type: "Point", coordinates: { longitude: "-46.6553299", latitude: "-23.5617698" } },
};

function reply(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

/** Responde por host: cada chave é um pedaço da URL. */
function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    return key ? routes[key]() : Promise.reject(new Error(`URL inesperada: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeCep", () => {
  it("aceita máscara e devolve 8 dígitos", () => {
    expect(normalizeCep("01310-100")).toBe("01310100");
  });
  it("recusa tamanho errado", () => {
    expect(() => normalizeCep("1234")).toThrow(CepInvalidError);
  });
});

describe("lookupCep", () => {
  it("normaliza a resposta da AwesomeAPI", async () => {
    stubFetch({ "awesomeapi": () => reply(200, AWESOME_PAULISTA) });
    await expect(lookupCep("01310-100")).resolves.toEqual({
      cep: "01310100", street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo",
      state: "SP", cityIbge: "3550308", lat: -23.5632188, lng: -46.6542596,
    });
  });

  it("cai para a BrasilAPI quando a AwesomeAPI falha", async () => {
    const fetchMock = stubFetch({
      "awesomeapi": () => Promise.reject(new Error("timeout")),
      "brasilapi": () => reply(200, BRASIL_PAULISTA),
    });
    const result = await lookupCep("01310100");
    expect(result).toMatchObject({ street: "Avenida Paulista", district: "Bela Vista", lat: -23.5617698, lng: -46.6553299 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("BrasilAPI sem coordenada devolve lat/lng nulos", async () => {
    stubFetch({
      "awesomeapi": () => reply(503),
      "brasilapi": () => reply(200, { ...BRASIL_PAULISTA, location: { type: "Point", coordinates: {} } }),
    });
    await expect(lookupCep("01310100")).resolves.toMatchObject({ lat: null, lng: null });
  });

  it("404 na AwesomeAPI é CEP inexistente, sem consultar a reserva", async () => {
    const fetchMock = stubFetch({ "awesomeapi": () => reply(404, { code: "not_found" }) });
    await expect(lookupCep("99999999")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("404 na reserva também é CEP inexistente", async () => {
    stubFetch({ "awesomeapi": () => reply(500), "brasilapi": () => reply(404) });
    await expect(lookupCep("99999999")).rejects.toBeInstanceOf(CepNotFoundError);
  });

  it("as duas fora é indisponível", async () => {
    stubFetch({
      "awesomeapi": () => Promise.reject(new Error("rede")),
      "brasilapi": () => reply(502),
    });
    await expect(lookupCep("01310100")).rejects.toBeInstanceOf(CepUnavailableError);
  });

  it("usa timeout de 5 s em cada chamada", async () => {
    const fetchMock = stubFetch({ "awesomeapi": () => reply(200, AWESOME_PAULISTA) });
    await lookupCep("01310100");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/__tests__/cep.test.ts`
Expected: FAIL — `Failed to resolve import "../cep"`.

- [ ] **Step 3: Implementar a lib**

```ts
// artifacts/api-server/src/lib/cep.ts

/** Endereço de um CEP, no formato único que o resto do sistema usa. */
export interface CepResult {
  cep: string;
  street: string | null;
  district: string | null;
  city: string;
  state: string;
  cityIbge: string | null;
  // Centro do CEP, não o número exato. Nulos quando a API não informa.
  lat: number | null;
  lng: number | null;
}

export class CepInvalidError extends Error {}
export class CepNotFoundError extends Error {}
export class CepUnavailableError extends Error {}

const TIMEOUT_MS = 5000;
const AWESOME_URL = "https://cep.awesomeapi.com.br/json/";
const BRASIL_URL = "https://brasilapi.com.br/api/cep/v2/";

export function normalizeCep(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) throw new CepInvalidError("CEP deve ter 8 dígitos.");
  return digits;
}

type Attempt = { kind: "ok"; result: CepResult } | { kind: "not_found" } | { kind: "unavailable" };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function coordinate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getJson(url: string): Promise<{ status: number; body: Record<string, any> | null } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = res.ok ? ((await res.json()) as Record<string, any>) : null;
    return { status: res.status, body };
  } catch {
    // Rede, DNS, timeout: para quem chama é tudo "serviço fora".
    return null;
  }
}

async function fromAwesome(cep: string): Promise<Attempt> {
  const res = await getJson(AWESOME_URL + cep);
  if (res && (res.status === 404 || res.status === 400)) return { kind: "not_found" };
  const b = res?.body;
  if (!b || !text(b.city) || !text(b.state)) return { kind: "unavailable" };
  return {
    kind: "ok",
    result: {
      cep,
      street: text(b.address),
      district: text(b.district),
      city: text(b.city)!,
      state: text(b.state)!,
      cityIbge: text(b.city_ibge),
      lat: coordinate(b.lat),
      lng: coordinate(b.lng),
    },
  };
}

async function fromBrasil(cep: string): Promise<Attempt> {
  const res = await getJson(BRASIL_URL + cep);
  if (res && res.status === 404) return { kind: "not_found" };
  const b = res?.body;
  if (!b || !text(b.city) || !text(b.state)) return { kind: "unavailable" };
  return {
    kind: "ok",
    result: {
      cep,
      street: text(b.street),
      district: text(b.neighborhood),
      city: text(b.city)!,
      state: text(b.state)!,
      cityIbge: text(b.ibge?.city),
      lat: coordinate(b.location?.coordinates?.latitude),
      lng: coordinate(b.location?.coordinates?.longitude),
    },
  };
}

/**
 * AwesomeAPI primeiro (traz coordenada quase sempre); BrasilAPI só quando a
 * primeira está fora. "Não existe" na primeira encerra: a reserva não sabe
 * mais que ela sobre CEP inexistente e só atrasaria o formulário.
 */
export async function lookupCep(raw: string): Promise<CepResult> {
  const cep = normalizeCep(raw);
  const first = await fromAwesome(cep);
  if (first.kind === "ok") return first.result;
  if (first.kind === "not_found") throw new CepNotFoundError("CEP não encontrado.");
  const second = await fromBrasil(cep);
  if (second.kind === "ok") return second.result;
  if (second.kind === "not_found") throw new CepNotFoundError("CEP não encontrado.");
  throw new CepUnavailableError("Serviço de CEP indisponível.");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/__tests__/cep.test.ts`
Expected: PASS.

- [ ] **Step 5: Teste da rota**

```ts
// artifacts/api-server/src/routes/__tests__/cep.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupCep = vi.fn();
vi.mock("../../lib/cep", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/cep")>()),
  lookupCep: (...a: unknown[]) => lookupCep(...a),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: cepRouter } = await import("../cep");
  const app = express();
  app.use(cepRouter);
  return app;
}

describe("GET /cep/:cep", () => {
  beforeEach(() => lookupCep.mockReset());

  it("200 com o endereço", async () => {
    lookupCep.mockResolvedValue({ cep: "01310100", city: "São Paulo", state: "SP" });
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/cep/01310-100");
    expect(res.status).toBe(200);
    expect(res.body.city).toBe("São Paulo");
    expect(lookupCep).toHaveBeenCalledWith("01310-100");
  });

  it.each([
    ["CepInvalidError", 400],
    ["CepNotFoundError", 404],
    ["CepUnavailableError", 502],
  ])("%s vira %i", async (errorName, status) => {
    const errors = await import("../../lib/cep");
    const ErrorClass = errors[errorName as "CepInvalidError"];
    lookupCep.mockRejectedValue(new ErrorClass("x"));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/cep/00000000");
    expect(res.status).toBe(status);
    expect(typeof res.body.error).toBe("string");
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/routes/__tests__/cep.test.ts`
Expected: FAIL — `Failed to resolve import "../cep"`.

- [ ] **Step 7: Implementar a rota e montar**

```ts
// artifacts/api-server/src/routes/cep.ts
import { Router, type IRouter } from "express";
import { CepInvalidError, CepNotFoundError, CepUnavailableError, lookupCep } from "../lib/cep";

const router: IRouter = Router();

router.get("/cep/:cep", async (req, res): Promise<void> => {
  try {
    res.json(await lookupCep(String(req.params.cep)));
  } catch (err) {
    if (err instanceof CepInvalidError) {
      res.status(400).json({ error: "CEP deve ter 8 dígitos." });
      return;
    }
    if (err instanceof CepNotFoundError) {
      res.status(404).json({ error: "CEP não encontrado. Preencha o endereço manualmente." });
      return;
    }
    if (err instanceof CepUnavailableError) {
      res.status(502).json({ error: "Serviço de CEP indisponível. Preencha o endereço manualmente." });
      return;
    }
    throw err;
  }
});

export default router;
```

Em `routes/index.ts`: `import cepRouter from "./cep";` e, na seção de gestão, logo após `router.use(segmentsRouter);`:

```ts
router.use(cepRouter);
```

- [ ] **Step 8: Documentar no OpenAPI**

Em `lib/api-spec/openapi.yaml`, antes de `/clients:`:

```yaml
  # ── CEP (endereço + coordenadas; proxy de AwesomeAPI com BrasilAPI de reserva)
  /cep/{cep}:
    get:
      operationId: lookupCep
      tags: [cep]
      parameters:
        - { name: cep, in: path, required: true, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CepResult"
        "400": { description: CEP com formato inválido }
        "404": { description: CEP não encontrado }
        "502": { description: Serviços de CEP indisponíveis }
```

E em `components.schemas`, antes de `Client:`:

```yaml
    CepResult:
      type: object
      required: [cep, street, district, city, state, cityIbge, lat, lng]
      properties:
        cep: { type: string }
        street: { type: ["string", "null"] }
        district: { type: ["string", "null"] }
        city: { type: string }
        state: { type: string }
        cityIbge: { type: ["string", "null"] }
        lat: { type: ["number", "null"] }
        lng: { type: ["number", "null"] }
```

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: sem erro.

- [ ] **Step 9: Rodar e ver passar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/__tests__/cep.test.ts src/routes/__tests__/cep.test.ts src/routes/__tests__/gate.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src lib/api-spec lib/api-client-react lib/api-zod
git commit -m "feat(api): consulta de CEP com coordenadas e API de reserva"
```

---

### Task 6: Cadastro de empresas na API

**Files:**
- Create: `artifacts/api-server/src/lib/companies/input.ts`, `lib/companies/roles.ts`, `lib/companies/store.ts`, `routes/companies.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`, `lib/api-spec/openapi.yaml`
- Test: `artifacts/api-server/src/lib/companies/__tests__/input.test.ts`, `lib/companies/__tests__/roles.test.ts`, `routes/__tests__/companies.test.ts`

**Interfaces:**
- Consumes: `companiesTable`, `clientsTable`, `advertisersTable`, `devicesTable`, `panelsTable`, `campaignsTable`, `COMPANY_STATUSES` (Task 1).
- Produces:
  - `createCompanyInput`, `updateCompanyInput` (zod), `type CompanyFields`, `type CreateCompanyInput`, `type UpdateCompanyInput`
  - `interface CompanyDependencies { devices: number; panels: number; campaigns: number }`
  - `interface RolePlan { createClient: boolean; removeClient: boolean; createAdvertiser: boolean; removeAdvertiser: boolean }`
  - `planRoles(current: { clientId: number | null; advertiserId: number | null }, wanted: { isClient?: boolean; isAdvertiser?: boolean }, deps: CompanyDependencies): { ok: true; plan: RolePlan } | { ok: false; status: 400 | 409; error: string; dependencies?: CompanyDependencies }`
  - `deleteBlock(deps: CompanyDependencies): string | null`
  - `interface CompanyRow` (todas as colunas de `companies` + `clientId: number | null; advertiserId: number | null; advertiserCompany: string | null`)
  - `interface CompanyDetail extends CompanyRow { dependencies: CompanyDependencies }`
  - store: `listCompanies(filter: { status?: string; role?: "client" | "advertiser"; q?: string }): Promise<CompanyRow[]>`, `getCompany(id: number): Promise<CompanyDetail | null>`, `createCompany(input: CreateCompanyInput): Promise<CompanyDetail>`, `updateCompany(id: number, fields: Partial<CompanyFields>, plan: RolePlan, advertiserCompany: string | null | undefined): Promise<CompanyDetail>`, `deleteCompany(id: number): Promise<void>`, `class CompanyConflictError extends Error`
  - Rotas: `GET /companies?status=&role=&q=`, `POST /companies` (201), `GET /companies/:id`, `PATCH /companies/:id`, `DELETE /companies/:id` (204). Erros `{ error: string, dependencies?: CompanyDependencies }`.

- [ ] **Step 1: Teste da validação**

```ts
// artifacts/api-server/src/lib/companies/__tests__/input.test.ts
import { describe, expect, it } from "vitest";
import { createCompanyInput, updateCompanyInput } from "../input";

const base = { name: "Padaria Central", isClient: true, isAdvertiser: false };

describe("createCompanyInput", () => {
  it("exige pelo menos um papel", () => {
    const r = createCompanyInput.safeParse({ ...base, isClient: false });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Marque cliente e/ou anunciante.");
  });

  it("normaliza CEP, UF e campos vazios", () => {
    const r = createCompanyInput.parse({ ...base, cep: "01310-100", state: "sp", email: "", notes: "  " });
    expect(r).toMatchObject({ cep: "01310100", state: "SP", email: null, notes: null, status: "active" });
  });

  it("recusa CEP incompleto e status desconhecido", () => {
    expect(createCompanyInput.safeParse({ ...base, cep: "0131" }).success).toBe(false);
    expect(createCompanyInput.safeParse({ ...base, status: "inadimplente" }).success).toBe(false);
  });

  it("recusa coordenada fora do globo", () => {
    expect(createCompanyInput.safeParse({ ...base, lat: 91 }).success).toBe(false);
  });
});

describe("updateCompanyInput", () => {
  it("aceita patch parcial sem papéis", () => {
    expect(updateCompanyInput.parse({ status: "paused" })).toEqual({ status: "paused" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/companies/__tests__/input.test.ts`
Expected: FAIL — `Failed to resolve import "../input"`.

- [ ] **Step 3: Implementar a validação**

Importa de `@workspace/db/schema` (só tipos e constantes; não abre conexão).

```ts
// artifacts/api-server/src/lib/companies/input.ts
import { z } from "zod";
import { COMPANY_STATUSES } from "@workspace/db/schema";

/** Texto opcional: vazio ou só espaços vira null, para o banco não guardar "". */
const optionalText = z
  .string()
  .nullish()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const fields = {
  name: z.string().trim().min(1, "Informe o nome da empresa."),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido."),
  phone: optionalText,
  segmentId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  status: z.enum(COMPANY_STATUSES),
  notes: optionalText,
  cep: z
    .string()
    .nullish()
    .transform((v) => (v ? v.replace(/\D/g, "") : null))
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || v.length === 8, "CEP deve ter 8 dígitos."),
  street: optionalText,
  number: optionalText,
  complement: optionalText,
  district: optionalText,
  city: optionalText,
  state: optionalText
    .transform((v) => (v ? v.toUpperCase() : null))
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "UF deve ter 2 letras."),
  cityIbge: optionalText,
  lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
};

export const companyFields = z.object(fields);
export type CompanyFields = z.infer<typeof companyFields>;

export const createCompanyInput = z
  .object({
    ...fields,
    status: fields.status.default("active"),
    isClient: z.boolean(),
    isAdvertiser: z.boolean(),
    advertiserCompany: optionalText,
  })
  .refine((v) => v.isClient || v.isAdvertiser, { message: "Marque cliente e/ou anunciante." });
export type CreateCompanyInput = z.infer<typeof createCompanyInput>;

export const updateCompanyInput = companyFields.partial().extend({
  isClient: z.boolean().optional(),
  isAdvertiser: z.boolean().optional(),
  advertiserCompany: optionalText.optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanyInput>;
```

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/companies/__tests__/input.test.ts`
Expected: PASS. Se `updateCompanyInput.parse({ status: "paused" })` devolver chaves extras com `null` (campos opcionais com transform), trocar `optionalText` no `partial` por `optionalText.optional()` campo a campo até o teste passar — o patch não pode apagar o que não veio.

- [ ] **Step 4: Teste da regra de papéis**

```ts
// artifacts/api-server/src/lib/companies/__tests__/roles.test.ts
import { describe, expect, it } from "vitest";
import { deleteBlock, planRoles } from "../roles";

const none = { devices: 0, panels: 0, campaigns: 0 };
const both = { clientId: 1, advertiserId: 2 };

describe("planRoles", () => {
  it("sem mudança de papel não faz nada", () => {
    expect(planRoles(both, {}, none)).toEqual({
      ok: true,
      plan: { createClient: false, removeClient: false, createAdvertiser: false, removeAdvertiser: false },
    });
  });

  it("ligar anunciante cria o perfil", () => {
    const r = planRoles({ clientId: 1, advertiserId: null }, { isAdvertiser: true }, none);
    expect(r).toMatchObject({ ok: true, plan: { createAdvertiser: true } });
  });

  it("desligar cliente sem TV nem painel remove o perfil", () => {
    expect(planRoles(both, { isClient: false }, none)).toMatchObject({ ok: true, plan: { removeClient: true } });
  });

  it("desligar cliente com TV é 409 com as contagens", () => {
    const deps = { devices: 3, panels: 0, campaigns: 0 };
    expect(planRoles(both, { isClient: false }, deps)).toEqual({
      ok: false, status: 409, error: "Não dá para tirar o papel de cliente: tem 3 TV(s) e 0 painel(éis).", dependencies: deps,
    });
  });

  it("desligar anunciante com campanha é 409", () => {
    const deps = { devices: 0, panels: 0, campaigns: 2 };
    expect(planRoles(both, { isAdvertiser: false }, deps)).toMatchObject({ ok: false, status: 409 });
  });

  it("ficar sem nenhum papel é 400", () => {
    expect(planRoles({ clientId: 1, advertiserId: null }, { isClient: false }, none)).toMatchObject({
      ok: false, status: 400, error: "Marque cliente e/ou anunciante.",
    });
  });
});

describe("deleteBlock", () => {
  it("libera empresa sem dependência", () => {
    expect(deleteBlock(none)).toBeNull();
  });
  it("bloqueia com qualquer dependência", () => {
    expect(deleteBlock({ devices: 1, panels: 2, campaigns: 3 })).toBe(
      "Não dá para excluir: a empresa tem 1 TV(s), 2 painel(éis) e 3 campanha(s).",
    );
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/companies/__tests__/roles.test.ts`
Expected: FAIL — `Failed to resolve import "../roles"`.

- [ ] **Step 6: Implementar a regra**

```ts
// artifacts/api-server/src/lib/companies/roles.ts

export interface CompanyDependencies {
  devices: number;
  panels: number;
  campaigns: number;
}

export interface RolePlan {
  createClient: boolean;
  removeClient: boolean;
  createAdvertiser: boolean;
  removeAdvertiser: boolean;
}

export type RoleDecision =
  | { ok: true; plan: RolePlan }
  | { ok: false; status: 400 | 409; error: string; dependencies?: CompanyDependencies };

/**
 * Traduz o que o formulário pediu em criar/remover perfil. Remover perfil com
 * TV, painel ou campanha apagaria tudo em cascata: isso é recusado aqui, e o
 * admin tira as dependências antes, de propósito.
 */
export function planRoles(
  current: { clientId: number | null; advertiserId: number | null },
  wanted: { isClient?: boolean; isAdvertiser?: boolean },
  deps: CompanyDependencies,
): RoleDecision {
  const hasClient = current.clientId !== null;
  const hasAdvertiser = current.advertiserId !== null;
  const willBeClient = wanted.isClient ?? hasClient;
  const willBeAdvertiser = wanted.isAdvertiser ?? hasAdvertiser;

  if (!willBeClient && !willBeAdvertiser) {
    return { ok: false, status: 400, error: "Marque cliente e/ou anunciante." };
  }

  const removeClient = hasClient && !willBeClient;
  const removeAdvertiser = hasAdvertiser && !willBeAdvertiser;

  if (removeClient && (deps.devices > 0 || deps.panels > 0)) {
    return {
      ok: false,
      status: 409,
      error: `Não dá para tirar o papel de cliente: tem ${deps.devices} TV(s) e ${deps.panels} painel(éis).`,
      dependencies: deps,
    };
  }
  if (removeAdvertiser && deps.campaigns > 0) {
    return {
      ok: false,
      status: 409,
      error: `Não dá para tirar o papel de anunciante: tem ${deps.campaigns} campanha(s).`,
      dependencies: deps,
    };
  }

  return {
    ok: true,
    plan: {
      createClient: !hasClient && willBeClient,
      removeClient,
      createAdvertiser: !hasAdvertiser && willBeAdvertiser,
      removeAdvertiser,
    },
  };
}

/** Motivo para recusar a exclusão, ou null quando pode excluir. */
export function deleteBlock(deps: CompanyDependencies): string | null {
  if (deps.devices === 0 && deps.panels === 0 && deps.campaigns === 0) return null;
  return `Não dá para excluir: a empresa tem ${deps.devices} TV(s), ${deps.panels} painel(éis) e ${deps.campaigns} campanha(s).`;
}
```

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/companies/__tests__/roles.test.ts`
Expected: PASS.

- [ ] **Step 7: Implementar o store** (acesso a banco; coberto pelo teste de rota via mock e pela validação da Task 11)

```ts
// artifacts/api-server/src/lib/companies/store.ts
import { and, asc, eq, ilike, isNotNull, sql, type SQL } from "drizzle-orm";
import {
  db,
  companiesTable,
  clientsTable,
  advertisersTable,
  devicesTable,
  panelsTable,
  campaignsTable,
} from "@workspace/db";
import type { CompanyFields, CreateCompanyInput } from "./input";
import type { CompanyDependencies, RolePlan } from "./roles";

export type { CompanyDependencies } from "./roles";

export type CompanyRow = typeof companiesTable.$inferSelect & {
  clientId: number | null;
  advertiserId: number | null;
  advertiserCompany: string | null;
};

export interface CompanyDetail extends CompanyRow {
  dependencies: CompanyDependencies;
}

/** Corrida criando o mesmo perfil duas vezes: o UNIQUE(company_id) barra. */
export class CompanyConflictError extends Error {}

const PG_UNIQUE_VIOLATION = "23505";

function rowQuery() {
  return db
    .select({
      company: companiesTable,
      clientId: clientsTable.id,
      advertiserId: advertisersTable.id,
      advertiserCompany: advertisersTable.company,
    })
    .from(companiesTable)
    .leftJoin(clientsTable, eq(clientsTable.companyId, companiesTable.id))
    .leftJoin(advertisersTable, eq(advertisersTable.companyId, companiesTable.id));
}

type RawRow = Awaited<ReturnType<typeof rowQuery>>[number];

function flatten(r: RawRow): CompanyRow {
  return { ...r.company, clientId: r.clientId, advertiserId: r.advertiserId, advertiserCompany: r.advertiserCompany };
}

export async function listCompanies(filter: {
  status?: string;
  role?: "client" | "advertiser";
  q?: string;
}): Promise<CompanyRow[]> {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(companiesTable.status, filter.status));
  if (filter.role === "client") conditions.push(isNotNull(clientsTable.id));
  if (filter.role === "advertiser") conditions.push(isNotNull(advertisersTable.id));
  if (filter.q) conditions.push(ilike(companiesTable.name, `%${filter.q}%`));
  const rows = await rowQuery()
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(companiesTable.name));
  return rows.map(flatten);
}

async function dependenciesOf(clientId: number | null, advertiserId: number | null): Promise<CompanyDependencies> {
  const count = sql<number>`count(*)::int`;
  const [devices] = clientId
    ? await db.select({ n: count }).from(devicesTable).where(eq(devicesTable.clientId, clientId))
    : [{ n: 0 }];
  const [panels] = clientId
    ? await db.select({ n: count }).from(panelsTable).where(eq(panelsTable.clientId, clientId))
    : [{ n: 0 }];
  const [campaigns] = advertiserId
    ? await db.select({ n: count }).from(campaignsTable).where(eq(campaignsTable.advertiserId, advertiserId))
    : [{ n: 0 }];
  return { devices: devices.n, panels: panels.n, campaigns: campaigns.n };
}

export async function getCompany(id: number): Promise<CompanyDetail | null> {
  const [raw] = await rowQuery().where(eq(companiesTable.id, id));
  if (!raw) return null;
  const row = flatten(raw);
  return { ...row, dependencies: await dependenciesOf(row.clientId, row.advertiserId) };
}

function rethrowConflict(err: unknown): never {
  if ((err as { code?: string })?.code === PG_UNIQUE_VIOLATION) {
    throw new CompanyConflictError("A empresa já tem esse papel.");
  }
  throw err;
}

export async function createCompany(input: CreateCompanyInput): Promise<CompanyDetail> {
  const { isClient, isAdvertiser, advertiserCompany, ...fields } = input;
  const id = await db
    .transaction(async (tx) => {
      const [company] = await tx.insert(companiesTable).values(fields).returning({ id: companiesTable.id });
      if (isClient) await tx.insert(clientsTable).values({ companyId: company.id });
      if (isAdvertiser) await tx.insert(advertisersTable).values({ companyId: company.id, company: advertiserCompany });
      return company.id;
    })
    .catch(rethrowConflict);
  return (await getCompany(id))!;
}

export async function updateCompany(
  id: number,
  fields: Partial<CompanyFields>,
  plan: RolePlan,
  advertiserCompany: string | null | undefined,
): Promise<CompanyDetail> {
  await db
    .transaction(async (tx) => {
      if (Object.keys(fields).length) {
        await tx.update(companiesTable).set(fields).where(eq(companiesTable.id, id));
      }
      if (plan.createClient) await tx.insert(clientsTable).values({ companyId: id });
      if (plan.removeClient) await tx.delete(clientsTable).where(eq(clientsTable.companyId, id));
      if (plan.createAdvertiser) {
        await tx.insert(advertisersTable).values({ companyId: id, company: advertiserCompany ?? null });
      } else if (advertiserCompany !== undefined && !plan.removeAdvertiser) {
        await tx.update(advertisersTable).set({ company: advertiserCompany }).where(eq(advertisersTable.companyId, id));
      }
      if (plan.removeAdvertiser) await tx.delete(advertisersTable).where(eq(advertisersTable.companyId, id));
    })
    .catch(rethrowConflict);
  return (await getCompany(id))!;
}

export async function deleteCompany(id: number): Promise<void> {
  // Cascata remove perfis e vínculos de usuário; TVs/painéis/campanhas já
  // foram barrados pela rota.
  await db.delete(companiesTable).where(eq(companiesTable.id, id));
}
```

- [ ] **Step 8: Teste da rota**

```ts
// artifacts/api-server/src/routes/__tests__/companies.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = {
  listCompanies: vi.fn(),
  getCompany: vi.fn(),
  createCompany: vi.fn(),
  updateCompany: vi.fn(),
  deleteCompany: vi.fn(),
};
vi.mock("../../lib/companies/store", () => ({
  listCompanies: (...a: unknown[]) => store.listCompanies(...a),
  getCompany: (...a: unknown[]) => store.getCompany(...a),
  createCompany: (...a: unknown[]) => store.createCompany(...a),
  updateCompany: (...a: unknown[]) => store.updateCompany(...a),
  deleteCompany: (...a: unknown[]) => store.deleteCompany(...a),
  CompanyConflictError: class CompanyConflictError extends Error {},
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: companiesRouter } = await import("../companies");
  const app = express();
  app.use(express.json());
  app.use(companiesRouter);
  return app;
}

const none = { devices: 0, panels: 0, campaigns: 0 };
const detail = (over: Record<string, unknown> = {}) => ({
  id: 5, name: "Padaria Central", status: "active", clientId: 1, advertiserId: null, advertiserCompany: null,
  dependencies: none, ...over,
});

describe("rotas de empresas", () => {
  beforeEach(() => Object.values(store).forEach((fn) => fn.mockReset()));

  it("cria com os dois papéis", async () => {
    store.createCompany.mockResolvedValue(detail({ advertiserId: 2 }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/companies")
      .send({ name: "Padaria Central", isClient: true, isAdvertiser: true, cep: "01310-100" });
    expect(res.status).toBe(201);
    expect(store.createCompany).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Padaria Central", isClient: true, isAdvertiser: true, cep: "01310100" }),
    );
  });

  it("criar sem papel é 400", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).post("/companies").send({ name: "X", isClient: false, isAdvertiser: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Marque cliente e/ou anunciante.");
    expect(store.createCompany).not.toHaveBeenCalled();
  });

  it("lista repassando os filtros", async () => {
    store.listCompanies.mockResolvedValue([]);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/companies?status=paused&role=client&q=pada");
    expect(res.status).toBe(200);
    expect(store.listCompanies).toHaveBeenCalledWith({ status: "paused", role: "client", q: "pada" });
  });

  it("empresa inexistente é 404", async () => {
    store.getCompany.mockResolvedValue(null);
    const { default: request } = await import("supertest");
    expect((await request(await buildApp()).get("/companies/99")).status).toBe(404);
  });

  it("ligar anunciante manda o plano para o store", async () => {
    store.getCompany.mockResolvedValue(detail());
    store.updateCompany.mockResolvedValue(detail({ advertiserId: 2 }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/companies/5").send({ isAdvertiser: true, advertiserCompany: "Pão Quente" });
    expect(res.status).toBe(200);
    expect(store.updateCompany).toHaveBeenCalledWith(
      5,
      {},
      { createClient: false, removeClient: false, createAdvertiser: true, removeAdvertiser: false },
      "Pão Quente",
    );
  });

  it("desligar cliente com TV é 409 e não grava", async () => {
    store.getCompany.mockResolvedValue(detail({ advertiserId: 2, dependencies: { devices: 3, panels: 0, campaigns: 0 } }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/companies/5").send({ isClient: false });
    expect(res.status).toBe(409);
    expect(res.body.dependencies).toEqual({ devices: 3, panels: 0, campaigns: 0 });
    expect(store.updateCompany).not.toHaveBeenCalled();
  });

  it("excluir com dependência é 409", async () => {
    store.getCompany.mockResolvedValue(detail({ dependencies: { devices: 1, panels: 0, campaigns: 0 } }));
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).delete("/companies/5");
    expect(res.status).toBe(409);
    expect(store.deleteCompany).not.toHaveBeenCalled();
  });

  it("excluir sem dependência é 204", async () => {
    store.getCompany.mockResolvedValue(detail());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).delete("/companies/5");
    expect(res.status).toBe(204);
    expect(store.deleteCompany).toHaveBeenCalledWith(5);
  });
});
```

- [ ] **Step 9: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/routes/__tests__/companies.test.ts`
Expected: FAIL — `Failed to resolve import "../companies"`.

- [ ] **Step 10: Implementar a rota e montar**

```ts
// artifacts/api-server/src/routes/companies.ts
import { Router, type IRouter } from "express";
import { createCompanyInput, updateCompanyInput } from "../lib/companies/input";
import { deleteBlock, planRoles } from "../lib/companies/roles";
import {
  CompanyConflictError,
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  updateCompany,
} from "../lib/companies/store";

const router: IRouter = Router();

function idParam(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/companies", async (req, res): Promise<void> => {
  const role = req.query.role === "client" || req.query.role === "advertiser" ? req.query.role : undefined;
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
  res.json(await listCompanies({ status, role, q }));
});

router.post("/companies", async (req, res): Promise<void> => {
  const parsed = createCompanyInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  try {
    res.status(201).json(await createCompany(parsed.data));
  } catch (err) {
    if (err instanceof CompanyConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.get("/companies/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const company = id ? await getCompany(id) : null;
  if (!company) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  res.json(company);
});

router.patch("/companies/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const parsed = updateCompanyInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." });
    return;
  }
  const current = id ? await getCompany(id) : null;
  if (!id || !current) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  const { isClient, isAdvertiser, advertiserCompany, ...fields } = parsed.data;
  const decision = planRoles(current, { isClient, isAdvertiser }, current.dependencies);
  if (!decision.ok) {
    res.status(decision.status).json({ error: decision.error, dependencies: decision.dependencies });
    return;
  }
  try {
    res.json(await updateCompany(id, fields, decision.plan, advertiserCompany));
  } catch (err) {
    if (err instanceof CompanyConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/companies/:id", async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const current = id ? await getCompany(id) : null;
  if (!id || !current) {
    res.status(404).json({ error: "Empresa não encontrada." });
    return;
  }
  const block = deleteBlock(current.dependencies);
  if (block) {
    res.status(409).json({ error: block, dependencies: current.dependencies });
    return;
  }
  await deleteCompany(id);
  res.sendStatus(204);
});

export default router;
```

Em `routes/index.ts`: `import companiesRouter from "./companies";` e, na seção de gestão, logo após `router.use(cepRouter);`:

```ts
router.use(companiesRouter);
```

- [ ] **Step 11: Rodar e ver passar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/companies src/routes/__tests__/companies.test.ts src/routes/__tests__/gate.test.ts`
Expected: PASS.

- [ ] **Step 12: Documentar no OpenAPI**

Em `lib/api-spec/openapi.yaml`, depois do bloco `/cep/{cep}`:

```yaml
  # ── Companies (cadastro único; cliente e anunciante são papéis) ─────────────
  /companies:
    get:
      operationId: listCompanies
      tags: [companies]
      parameters:
        - { name: status, in: query, required: false, schema: { type: string, enum: [active, paused, closed] } }
        - { name: role, in: query, required: false, schema: { type: string, enum: [client, advertiser] } }
        - { name: q, in: query, required: false, schema: { type: string } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { type: array, items: { $ref: "#/components/schemas/Company" } }
    post:
      operationId: createCompany
      tags: [companies]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CompanyInput" }
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CompanyDetail" }
        "400": { description: Dados inválidos ou nenhum papel marcado }
        "409": { description: Papel duplicado }

  /companies/{id}:
    get:
      operationId: getCompany
      tags: [companies]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CompanyDetail" }
        "404": { description: Empresa não encontrada }
    patch:
      operationId: updateCompany
      tags: [companies]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CompanyUpdate" }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema: { $ref: "#/components/schemas/CompanyDetail" }
        "400": { description: Dados inválidos ou nenhum papel }
        "404": { description: Empresa não encontrada }
        "409": { description: Papel com TVs, painéis ou campanhas }
    delete:
      operationId: deleteCompany
      tags: [companies]
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        "204": { description: Deleted }
        "404": { description: Empresa não encontrada }
        "409": { description: Empresa com TVs, painéis ou campanhas }
```

E em `components.schemas`, depois de `CepResult`:

```yaml
    CompanyFields:
      type: object
      properties:
        name: { type: string, minLength: 1 }
        email: { type: ["string", "null"] }
        phone: { type: ["string", "null"] }
        segmentId: { type: ["integer", "null"] }
        status: { type: string, enum: [active, paused, closed] }
        notes: { type: ["string", "null"] }
        cep: { type: ["string", "null"] }
        street: { type: ["string", "null"] }
        number: { type: ["string", "null"] }
        complement: { type: ["string", "null"] }
        district: { type: ["string", "null"] }
        city: { type: ["string", "null"] }
        state: { type: ["string", "null"] }
        cityIbge: { type: ["string", "null"] }
        lat: { type: ["number", "null"] }
        lng: { type: ["number", "null"] }
    CompanyInput:
      allOf:
        - $ref: "#/components/schemas/CompanyFields"
        - type: object
          required: [name, isClient, isAdvertiser]
          properties:
            isClient: { type: boolean }
            isAdvertiser: { type: boolean }
            advertiserCompany: { type: ["string", "null"] }
    CompanyUpdate:
      allOf:
        - $ref: "#/components/schemas/CompanyFields"
        - type: object
          properties:
            isClient: { type: boolean }
            isAdvertiser: { type: boolean }
            advertiserCompany: { type: ["string", "null"] }
    Company:
      allOf:
        - $ref: "#/components/schemas/CompanyFields"
        - type: object
          required: [id, name, status, clientId, advertiserId, advertiserCompany, createdAt, updatedAt]
          properties:
            id: { type: integer }
            clientId: { type: ["integer", "null"] }
            advertiserId: { type: ["integer", "null"] }
            advertiserCompany: { type: ["string", "null"] }
            createdAt: { type: string, format: date-time }
            updatedAt: { type: string, format: date-time }
    CompanyDetail:
      allOf:
        - $ref: "#/components/schemas/Company"
        - type: object
          required: [dependencies]
          properties:
            dependencies:
              type: object
              required: [devices, panels, campaigns]
              properties:
                devices: { type: integer }
                panels: { type: integer }
                campaigns: { type: integer }
```

Run: `pnpm --filter @workspace/api-spec run codegen && pnpm run typecheck`
Expected: sem erros.

- [ ] **Step 13: Commit**

```bash
git add artifacts/api-server/src lib/api-spec lib/api-client-react lib/api-zod
git commit -m "feat(api): cadastro de empresas com papéis de cliente e anunciante"
```

---

### Task 7: Admins no banco

**Files:**
- Create: `artifacts/api-server/src/lib/auth/admin-guard.ts`
- Modify: `artifacts/api-server/src/lib/auth/user-store.ts`, `lib/auth/middleware.ts`, `routes/users.ts`, `routes/auth.ts`, `lib/api-spec/openapi.yaml` (schemas `UserAccount`, `UserInput`, `UserUpdate`)
- Test: `artifacts/api-server/src/lib/auth/__tests__/admin-guard.test.ts`, `lib/auth/__tests__/user-middleware.test.ts`, `routes/__tests__/users.test.ts`

**Interfaces:**
- Consumes: `usersTable.name`, `usersTable.isAdmin` (Task 1).
- Produces:
  - `removesLastAdmin(target: { isAdmin: boolean; isActive: boolean }, change: { isAdmin?: boolean; isActive?: boolean; deleting?: boolean }, activeAdmins: number): boolean`
  - `AuthContext` ganha `name: string | null; isAdmin: boolean`
  - `UserAccountRow` ganha `name: string | null; isAdmin: boolean`
  - `createUser(input: { email; passwordHash; name: string | null; isAdmin: boolean; clientIds; advertiserIds })`
  - `updateUser(id, patch: { name?: string | null; isAdmin?: boolean; isActive?: boolean; clientIds?: number[]; advertiserIds?: number[] })` — lança `LastAdminError`
  - `deleteUser(id)` — lança `LastAdminError`
  - `class LastAdminError extends Error`
  - `GET /auth/me` ganha `name: string | null`; usuário admin do banco recebe `isAdmin: true` e `roles` com `"admin"`.

Regras: usuário com `is_admin` passa em `requireAdmin`, exceto com `mustChangePassword` (403). Desativar, rebaixar ou apagar o último admin **ativo do banco** → 409. O admin do env não conta e continua funcionando.

- [ ] **Step 1: Teste da regra do último admin**

```ts
// artifacts/api-server/src/lib/auth/__tests__/admin-guard.test.ts
import { describe, expect, it } from "vitest";
import { removesLastAdmin } from "../admin-guard";

const admin = { isAdmin: true, isActive: true };

describe("removesLastAdmin", () => {
  it("bloqueia desativar o único admin ativo", () => {
    expect(removesLastAdmin(admin, { isActive: false }, 1)).toBe(true);
  });
  it("bloqueia rebaixar o único admin ativo", () => {
    expect(removesLastAdmin(admin, { isAdmin: false }, 1)).toBe(true);
  });
  it("bloqueia apagar o único admin ativo", () => {
    expect(removesLastAdmin(admin, { deleting: true }, 1)).toBe(true);
  });
  it("libera quando há outro admin ativo", () => {
    expect(removesLastAdmin(admin, { isActive: false }, 2)).toBe(false);
  });
  it("libera mexer em quem não é admin ativo", () => {
    expect(removesLastAdmin({ isAdmin: false, isActive: true }, { deleting: true }, 1)).toBe(false);
    expect(removesLastAdmin({ isAdmin: true, isActive: false }, { deleting: true }, 1)).toBe(false);
  });
  it("libera edição que mantém o admin ativo", () => {
    expect(removesLastAdmin(admin, { isAdmin: true, isActive: true }, 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/auth/__tests__/admin-guard.test.ts`
Expected: FAIL — `Failed to resolve import "../admin-guard"`.

- [ ] **Step 3: Implementar**

```ts
// artifacts/api-server/src/lib/auth/admin-guard.ts

/**
 * A mudança tira do banco o último admin ativo? O admin do env não entra na
 * conta de propósito: ele é a reserva, não o dia a dia — e perder o último
 * admin do banco obrigaria alguém a usar a senha de emergência.
 */
export function removesLastAdmin(
  target: { isAdmin: boolean; isActive: boolean },
  change: { isAdmin?: boolean; isActive?: boolean; deleting?: boolean },
  activeAdmins: number,
): boolean {
  if (!(target.isAdmin && target.isActive)) return false;
  const staysActiveAdmin = !change.deleting && (change.isAdmin ?? true) && (change.isActive ?? true);
  return !staysActiveAdmin && activeAdmins <= 1;
}
```

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/auth/__tests__/admin-guard.test.ts`
Expected: PASS.

- [ ] **Step 4: Testes do middleware**

Em `lib/auth/__tests__/user-middleware.test.ts`, no `buildApp`, importar também `requireAdmin` e registrar:

```ts
  const { loadSession, requireAdvertiser, requireClient, requireAdmin } = await import("../middleware");
  // ...
  app.get("/admin", requireAdmin, (_req, res) => res.json({ ok: true }));
```

E acrescentar ao `describe`:

```ts
  it("usuário admin do banco passa em requireAdmin", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, isAdmin: true, name: "Yuri" });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/admin").set("Cookie", `sid=${createSession(SECRET, "7")}`);
    expect(res.status).toBe(200);
  });

  it("admin do banco com troca de senha pendente recebe 403", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, isAdmin: true, mustChangePassword: true });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/admin").set("Cookie", `sid=${createSession(SECRET, "7")}`);
    expect(res.status).toBe(403);
  });

  it("usuário comum não passa em requireAdmin", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, isAdmin: false });
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/admin").set("Cookie", `sid=${createSession(SECRET, "7")}`);
    expect(res.status).toBe(401);
  });
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/auth/__tests__/user-middleware.test.ts`
Expected: FAIL em "usuário admin do banco passa em requireAdmin" (401).

- [ ] **Step 6: Implementar store, middleware e auth**

`lib/auth/user-store.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";
import { removesLastAdmin } from "./admin-guard";
// ...
export interface AuthContext {
  userId: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
}

/** Recusa tirar do banco o último admin ativo. */
export class LastAdminError extends Error {
  constructor() {
    super("Não dá para remover o último administrador ativo.");
  }
}

async function countActiveAdmins(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(and(eq(usersTable.isAdmin, true), eq(usersTable.isActive, true)));
  return row?.n ?? 0;
}
```

Em `loadAuthContext`, no objeto devolvido, acrescentar `name: user.name, isAdmin: user.isAdmin,`.

Trocar `UserAccountRow` e as funções de conta:

```ts
export interface UserAccountRow {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  clientIds: number[];
  advertiserIds: number[];
}

function accountRow(u: User, links: { clientIds: number[]; advertiserIds: number[] }): UserAccountRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    ...links,
  };
}

export async function listUsers(): Promise<UserAccountRow[]> {
  const rows = await db.select().from(usersTable).orderBy(usersTable.email);
  const out: UserAccountRow[] = [];
  for (const u of rows) out.push(accountRow(u, await linksFor(u.id)));
  return out;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string | null;
  isAdmin: boolean;
  clientIds: number[];
  advertiserIds: number[];
}): Promise<UserAccountRow> {
  const [u] = await db
    .insert(usersTable)
    .values({ email: input.email, passwordHash: input.passwordHash, name: input.name, isAdmin: input.isAdmin })
    .returning();
  await replaceLinks(u.id, input.clientIds, input.advertiserIds);
  return accountRow(u, await linksFor(u.id));
}

export async function updateUser(
  id: number,
  patch: { name?: string | null; isAdmin?: boolean; isActive?: boolean; clientIds?: number[]; advertiserIds?: number[] },
): Promise<UserAccountRow | null> {
  const existing = await findUserById(id);
  if (!existing) return null;
  if (removesLastAdmin(existing, patch, await countActiveAdmins())) throw new LastAdminError();
  const set: Partial<Pick<User, "name" | "isAdmin" | "isActive">> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (typeof patch.isAdmin === "boolean") set.isAdmin = patch.isAdmin;
  if (typeof patch.isActive === "boolean") set.isActive = patch.isActive;
  if (Object.keys(set).length) await db.update(usersTable).set(set).where(eq(usersTable.id, id));
  if (patch.clientIds || patch.advertiserIds) {
    const links = await linksFor(id);
    await replaceLinks(id, patch.clientIds ?? links.clientIds, patch.advertiserIds ?? links.advertiserIds);
  }
  const u = await findUserById(id);
  return u ? accountRow(u, await linksFor(id)) : null;
}

export async function deleteUser(id: number): Promise<boolean> {
  const existing = await findUserById(id);
  if (!existing) return false;
  if (removesLastAdmin(existing, { deleting: true }, await countActiveAdmins())) throw new LastAdminError();
  const [row] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  return !!row;
}
```

`lib/auth/middleware.ts` — no `loadSession`, trocar o `req.auth = { isAdmin: false, ... }` final por:

```ts
  req.auth = {
    // Admin do banco tem o mesmo acesso do admin do env nas rotas de gestão.
    isAdmin: ctx.isAdmin,
    user: ctx,
    clientIds: ctx.clientIds,
    advertiserIds: ctx.advertiserIds,
  };
```

E `requireAdmin`:

```ts
/** Exige admin: o do env (cookie "admin") ou usuário do banco com is_admin. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.SESSION_SECRET ?? "";
  const sub = secret ? sessionSubject(req.cookies?.[SESSION_COOKIE], secret) : null;
  if (sub === "admin") {
    req.auth = { isAdmin: true, clientIds: [], advertiserIds: [] };
    next();
    return;
  }
  if (req.auth?.isAdmin && req.auth.user) {
    if (req.auth.user.mustChangePassword) {
      res.status(403).json({ error: "Troque a senha antes de continuar." });
      return;
    }
    next();
    return;
  }
  unauthorized(res);
}
```

`routes/auth.ts`:

- `change-password`: trocar a guarda por `if (!req.auth?.user) {`.
- `/auth/me`: trocar `if (req.auth.isAdmin) {` por `if (req.auth.isAdmin && !req.auth.user) {` e acrescentar `name: null,` nessa resposta. Na resposta de usuário:

```ts
  const u = req.auth.user!;
  const roles: string[] = [];
  if (u.isAdmin) roles.push("admin");
  if (u.advertiserIds.length > 0) roles.push("advertiser");
  if (u.clientIds.length > 0) roles.push("client");
  res.json({
    authenticated: true,
    isAdmin: u.isAdmin,
    name: u.name,
    roles,
    clientIds: u.clientIds,
    advertiserIds: u.advertiserIds,
    mustChangePassword: u.mustChangePassword,
    maxUploadBytes: maxUploadBytes(),
  });
```

(`App.tsx` já checa `mustChangePassword` antes de `isAdmin`, então admin do banco com senha temporária cai na troca de senha.)

- [ ] **Step 7: Rodar e ver passar**

Run: `cd artifacts/api-server && pnpm exec vitest run src/lib/auth src/routes/__tests__/auth.test.ts src/routes/__tests__/gate.test.ts`
Expected: PASS.

- [ ] **Step 8: Teste da rota de usuários**

```ts
// artifacts/api-server/src/routes/__tests__/users.test.ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = { listUsers: vi.fn(), createUser: vi.fn(), updateUser: vi.fn(), resetPassword: vi.fn(), deleteUser: vi.fn() };
vi.mock("../../lib/auth/user-store", () => {
  class LastAdminError extends Error {
    constructor() {
      super("Não dá para remover o último administrador ativo.");
    }
  }
  return {
    listUsers: (...a: unknown[]) => store.listUsers(...a),
    createUser: (...a: unknown[]) => store.createUser(...a),
    updateUser: (...a: unknown[]) => store.updateUser(...a),
    resetPassword: (...a: unknown[]) => store.resetPassword(...a),
    deleteUser: (...a: unknown[]) => store.deleteUser(...a),
    LastAdminError,
  };
});

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: usersRouter } = await import("../users");
  const app = express();
  app.use(express.json());
  app.use(usersRouter);
  return app;
}

describe("rotas de usuários", () => {
  beforeEach(() => Object.values(store).forEach((fn) => fn.mockReset()));

  it("cria com nome e admin", async () => {
    store.createUser.mockResolvedValue({ id: 1 });
    const { default: request } = await import("supertest");
    const res = await request(await buildApp())
      .post("/users")
      .send({ email: "yuri@ex.com", tempPassword: "12345678", name: " Yuri ", isAdmin: true });
    expect(res.status).toBe(201);
    expect(store.createUser).toHaveBeenCalledWith(expect.objectContaining({ name: "Yuri", isAdmin: true }));
  });

  it("rebaixar o último admin é 409", async () => {
    const { LastAdminError } = await import("../../lib/auth/user-store");
    store.updateUser.mockRejectedValue(new LastAdminError());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).patch("/users/1").send({ isAdmin: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Não dá para remover o último administrador ativo.");
  });

  it("apagar o último admin é 409", async () => {
    const { LastAdminError } = await import("../../lib/auth/user-store");
    store.deleteUser.mockRejectedValue(new LastAdminError());
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).delete("/users/1");
    expect(res.status).toBe(409);
  });
});
```

Run: `cd artifacts/api-server && pnpm exec vitest run src/routes/__tests__/users.test.ts`
Expected: FAIL — `createUser` chamado sem `name`/`isAdmin` e 500 no lugar de 409.

- [ ] **Step 9: Implementar `routes/users.ts`**

```ts
import {
  listUsers, createUser, updateUser, resetPassword, deleteUser, LastAdminError,
} from "../lib/auth/user-store";

function nameOf(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
```

No `POST /users`, ler `name` e `isAdmin` do corpo e passar:

```ts
  const { email, tempPassword, name, isAdmin, clientIds, advertiserIds } = (req.body ?? {}) as {
    email?: unknown; tempPassword?: unknown; name?: unknown; isAdmin?: unknown; clientIds?: unknown; advertiserIds?: unknown;
  };
  // ... validação atual de email/senha ...
  const created = await createUser({
    email,
    passwordHash: hashPassword(tempPassword),
    name: nameOf(name) ?? null,
    isAdmin: isAdmin === true,
    clientIds: Array.isArray(clientIds) ? (clientIds as number[]) : [],
    advertiserIds: Array.isArray(advertiserIds) ? (advertiserIds as number[]) : [],
  });
```

`PATCH /users/:id`:

```ts
router.patch("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  const { name, isAdmin, isActive, clientIds, advertiserIds } = (req.body ?? {}) as {
    name?: unknown; isAdmin?: boolean; isActive?: boolean; clientIds?: number[]; advertiserIds?: number[];
  };
  try {
    const updated = await updateUser(id, { name: nameOf(name), isAdmin, isActive, clientIds, advertiserIds });
    if (!updated) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.json(updated);
  } catch (err) {
    if (err instanceof LastAdminError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
});
```

`DELETE /users/:id`:

```ts
router.delete("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "id inválido" }); return; }
  try {
    const ok = await deleteUser(id);
    if (!ok) { res.status(404).json({ error: "Usuário não encontrado" }); return; }
    res.sendStatus(204);
  } catch (err) {
    if (err instanceof LastAdminError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
});
```

- [ ] **Step 10: OpenAPI dos usuários**

Em `lib/api-spec/openapi.yaml`:

```yaml
    UserAccount:
      type: object
      required: [id, email, name, isAdmin, isActive, mustChangePassword, clientIds, advertiserIds]
      properties:
        id: { type: integer }
        email: { type: string }
        name: { type: ["string", "null"] }
        isAdmin: { type: boolean }
        isActive: { type: boolean }
        mustChangePassword: { type: boolean }
        clientIds: { type: array, items: { type: integer } }
        advertiserIds: { type: array, items: { type: integer } }
    UserInput:
      type: object
      required: [email, tempPassword]
      properties:
        email: { type: string }
        tempPassword: { type: string, minLength: 8 }
        name: { type: ["string", "null"] }
        isAdmin: { type: boolean }
        clientIds: { type: array, items: { type: integer } }
        advertiserIds: { type: array, items: { type: integer } }
    UserUpdate:
      type: object
      properties:
        name: { type: ["string", "null"] }
        isAdmin: { type: boolean }
        isActive: { type: boolean }
        clientIds: { type: array, items: { type: integer } }
        advertiserIds: { type: array, items: { type: integer } }
```

Run: `pnpm --filter @workspace/api-spec run codegen && pnpm run typecheck && pnpm --filter @workspace/api-server run test`
Expected: sem erros; PASS.

- [ ] **Step 11: Commit**

```bash
git add artifacts/api-server/src lib/api-spec lib/api-client-react lib/api-zod
git commit -m "feat(auth): administradores no banco com proteção do último admin"
```

---

### Task 8: Formulário de empresa com CEP

**Files:**
- Create: `artifacts/signage/src/lib/companies-api.ts`, `artifacts/signage/src/components/company-form-dialog.tsx`
- Test: `artifacts/signage/src/components/__tests__/company-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /companies`, `GET/PATCH/DELETE /companies/:id`, `GET /cep/:cep` (Tasks 5 e 6); `useListSegments` de `@workspace/api-client-react`.
- Produces (`lib/companies-api.ts`):
  - `type CompanyStatus = 'active' | 'paused' | 'closed'`
  - `const STATUS_LABELS: Record<CompanyStatus, string>`
  - `interface CompanyDependencies { devices: number; panels: number; campaigns: number }`
  - `interface Company { id; name; email; phone; segmentId; status; notes; cep; street; number; complement; district; city; state; cityIbge; lat; lng; clientId: number | null; advertiserId: number | null; advertiserCompany: string | null; createdAt: string; updatedAt: string }`
  - `interface CompanyDetail extends Company { dependencies: CompanyDependencies }`
  - `type CompanyPayload = Partial<Omit<Company, 'id' | 'clientId' | 'advertiserId' | 'createdAt' | 'updatedAt'>> & { isClient?: boolean; isAdvertiser?: boolean }`
  - `interface CepResult { cep; street; district; city; state; cityIbge; lat; lng }`
  - `class ApiError extends Error { status: number }`
  - `listCompanies(filter?: { status?: CompanyStatus; role?: 'client' | 'advertiser'; q?: string }): Promise<Company[]>`
  - `getCompany(id: number): Promise<CompanyDetail>`, `createCompany(p: CompanyPayload): Promise<CompanyDetail>`, `updateCompany(id: number, p: CompanyPayload): Promise<CompanyDetail>`, `deleteCompany(id: number): Promise<void>`, `lookupCep(cep: string): Promise<CepResult>`
  - `companiesQueryKey: readonly ['companies']`, `companyQueryKey(id: number): readonly ['companies', number]`
- Produces (`components/company-form-dialog.tsx`):
  - `CompanyFormDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; company?: CompanyDetail | null; onSaved: (company: CompanyDetail) => void })`

- [ ] **Step 1: Cliente HTTP**

```ts
// artifacts/signage/src/lib/companies-api.ts
export type CompanyStatus = 'active' | 'paused' | 'closed';

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  closed: 'Encerrada',
};

export interface CompanyDependencies {
  devices: number;
  panels: number;
  campaigns: number;
}

export interface Company {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  segmentId: number | null;
  status: CompanyStatus;
  notes: string | null;
  cep: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cityIbge: string | null;
  lat: number | null;
  lng: number | null;
  clientId: number | null;
  advertiserId: number | null;
  advertiserCompany: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDetail extends Company {
  dependencies: CompanyDependencies;
}

export type CompanyPayload = Partial<Omit<Company, 'id' | 'clientId' | 'advertiserId' | 'createdAt' | 'updatedAt'>> & {
  isClient?: boolean;
  isAdvertiser?: boolean;
};

export interface CepResult {
  cep: string;
  street: string | null;
  district: string | null;
  city: string;
  state: string;
  cityIbge: string | null;
  lat: number | null;
  lng: number | null;
}

/** Erro da API com o status e a mensagem em português que o servidor mandou. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(api(path), {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? 'Não foi possível completar a operação.', res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const companiesQueryKey = ['companies'] as const;
export const companyQueryKey = (id: number) => ['companies', id] as const;

export function listCompanies(filter: { status?: CompanyStatus; role?: 'client' | 'advertiser'; q?: string } = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.role) params.set('role', filter.role);
  if (filter.q) params.set('q', filter.q);
  const qs = params.toString();
  return request<Company[]>(`/companies${qs ? `?${qs}` : ''}`);
}

export const getCompany = (id: number) => request<CompanyDetail>(`/companies/${id}`);

export const createCompany = (payload: CompanyPayload) =>
  request<CompanyDetail>('/companies', { method: 'POST', body: JSON.stringify(payload) });

export const updateCompany = (id: number, payload: CompanyPayload) =>
  request<CompanyDetail>(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteCompany = (id: number) => request<void>(`/companies/${id}`, { method: 'DELETE' });

export const lookupCep = (cep: string) => request<CepResult>(`/cep/${cep.replace(/\D/g, '')}`);
```

- [ ] **Step 2: Teste do formulário**

```tsx
// artifacts/signage/src/components/__tests__/company-form-dialog.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyFormDialog } from '../company-form-dialog';

const PAULISTA = {
  cep: '01310100', street: 'Avenida Paulista', district: 'Bela Vista', city: 'São Paulo',
  state: 'SP', cityIbge: '3550308', lat: -23.56, lng: -46.65,
};

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

/** Responde por trecho de URL; o que não casar vira 404. */
function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    return key ? routes[key]() : json(404, { error: 'não mockado' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDialog(onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CompanyFormDialog open onOpenChange={() => {}} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}

afterEach(() => vi.unstubAllGlobals());

describe('CompanyFormDialog', () => {
  it('preenche o endereço quando o CEP tem 8 dígitos', async () => {
    const fetchMock = stubFetch({ '/segments': () => json(200, []), '/cep/01310100': () => json(200, PAULISTA) });
    renderDialog();
    await userEvent.type(screen.getByLabelText('CEP'), '01310-100');
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Avenida Paulista'));
    expect(screen.getByLabelText('Bairro')).toHaveValue('Bela Vista');
    expect(screen.getByLabelText('Cidade')).toHaveValue('São Paulo');
    expect(screen.getByLabelText('UF')).toHaveValue('SP');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/cep/01310100'), expect.anything());
  });

  it('avisa e deixa digitar quando o CEP não existe', async () => {
    stubFetch({
      '/segments': () => json(200, []),
      '/cep/': () => json(404, { error: 'CEP não encontrado. Preencha o endereço manualmente.' }),
    });
    renderDialog();
    await userEvent.type(screen.getByLabelText('CEP'), '99999999');
    expect(await screen.findByText('CEP não encontrado. Preencha o endereço manualmente.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Rua'), 'Rua Nova');
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua Nova');
  });

  it('não envia sem papel marcado', async () => {
    const fetchMock = stubFetch({ '/segments': () => json(200, []) });
    renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Padaria Central');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }));
    expect(await screen.findByText('Marque cliente e/ou anunciante.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('api/companies'), expect.anything());
  });

  it('envia o cadastro com papéis, endereço e coordenadas', async () => {
    const saved = { id: 5, name: 'Padaria Central' };
    const fetchMock = stubFetch({
      '/segments': () => json(200, []),
      '/cep/01310100': () => json(200, PAULISTA),
      '/companies': () => json(201, saved),
    });
    const onSaved = renderDialog();
    await userEvent.type(screen.getByLabelText('Nome'), 'Padaria Central');
    await userEvent.click(screen.getByLabelText('Cliente (tem TV)'));
    await userEvent.type(screen.getByLabelText('CEP'), '01310100');
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Avenida Paulista'));
    await userEvent.type(screen.getByLabelText('Número'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar empresa' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes('api/companies'))!;
    expect(JSON.parse(init.body)).toMatchObject({
      name: 'Padaria Central', isClient: true, isAdvertiser: false, cep: '01310100',
      street: 'Avenida Paulista', number: '1000', state: 'SP', lat: -23.56, lng: -46.65, status: 'active',
    });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd artifacts/signage && pnpm exec vitest run src/components/__tests__/company-form-dialog.test.tsx`
Expected: FAIL — `Failed to resolve import "../company-form-dialog"`.

- [ ] **Step 4: Implementar o formulário**

```tsx
// artifacts/signage/src/components/company-form-dialog.tsx
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useListSegments } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  ApiError,
  STATUS_LABELS,
  createCompany,
  lookupCep,
  updateCompany,
  type CompanyDetail,
  type CompanyStatus,
} from '@/lib/companies-api';

interface FormState {
  name: string;
  email: string;
  phone: string;
  segmentId: string;
  isClient: boolean;
  isAdvertiser: boolean;
  advertiserCompany: string;
  status: CompanyStatus;
  notes: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  cityIbge: string;
  lat: number | null;
  lng: number | null;
}

function initialState(company?: CompanyDetail | null): FormState {
  return {
    name: company?.name ?? '',
    email: company?.email ?? '',
    phone: company?.phone ?? '',
    segmentId: company?.segmentId ? String(company.segmentId) : '',
    isClient: company ? company.clientId !== null : false,
    isAdvertiser: company ? company.advertiserId !== null : false,
    advertiserCompany: company?.advertiserCompany ?? '',
    status: company?.status ?? 'active',
    notes: company?.notes ?? '',
    cep: company?.cep ?? '',
    street: company?.street ?? '',
    number: company?.number ?? '',
    complement: company?.complement ?? '',
    district: company?.district ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    cityIbge: company?.cityIbge ?? '',
    lat: company?.lat ?? null,
    lng: company?.lng ?? null,
  };
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

export function CompanyFormDialog({
  open,
  onOpenChange,
  company,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: CompanyDetail | null;
  onSaved: (company: CompanyDetail) => void;
}) {
  const { toast } = useToast();
  const { data: segments = [] } = useListSegments();
  const [form, setForm] = useState<FormState>(() => initialState(company));
  const [error, setError] = useState<string | null>(null);
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // CEP já consultado: evita repetir a chamada a cada tecla depois do 8º dígito
  // e não sobrescreve o endereço de uma empresa aberta para edição.
  const lastCep = useRef<string>(company?.cep ?? '');

  useEffect(() => {
    if (open) {
      setForm(initialState(company));
      setError(null);
      setCepMessage(null);
      lastCep.current = company?.cep ?? '';
    }
  }, [open, company]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const digits = form.cep.replace(/\D/g, '');
    if (digits.length !== 8 || digits === lastCep.current) return;
    lastCep.current = digits;
    setCepLoading(true);
    setCepMessage(null);
    lookupCep(digits)
      .then((r) =>
        setForm((f) => ({
          ...f,
          street: r.street ?? '',
          district: r.district ?? '',
          city: r.city,
          state: r.state,
          cityIbge: r.cityIbge ?? '',
          lat: r.lat,
          lng: r.lng,
        })),
      )
      .catch((err) => {
        // Sem resposta confiável, coordenadas antigas não valem para o CEP novo.
        setForm((f) => ({ ...f, lat: null, lng: null, cityIbge: '' }));
        setCepMessage(err instanceof ApiError ? err.message : 'Serviço de CEP indisponível. Preencha o endereço manualmente.');
      })
      .finally(() => setCepLoading(false));
  }, [form.cep]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('Informe o nome da empresa.');
      return;
    }
    if (!form.isClient && !form.isAdvertiser) {
      setError('Marque cliente e/ou anunciante.');
      return;
    }
    setError(null);
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      email: orNull(form.email),
      phone: orNull(form.phone),
      segmentId: form.segmentId ? Number(form.segmentId) : null,
      isClient: form.isClient,
      isAdvertiser: form.isAdvertiser,
      advertiserCompany: form.isAdvertiser ? orNull(form.advertiserCompany) : null,
      status: form.status,
      notes: orNull(form.notes),
      cep: orNull(form.cep.replace(/\D/g, '')),
      street: orNull(form.street),
      number: orNull(form.number),
      complement: orNull(form.complement),
      district: orNull(form.district),
      city: orNull(form.city),
      state: orNull(form.state),
      cityIbge: orNull(form.cityIbge),
      lat: form.lat,
      lng: form.lng,
    };
    try {
      const saved = company ? await updateCompany(company.id, payload) : await createCompany(payload);
      toast({ title: company ? 'Empresa atualizada' : 'Empresa cadastrada' });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível salvar a empresa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company ? 'Editar empresa' : 'Nova empresa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <TextField id="company-name" label="Nome" value={form.name} onChange={(v) => set('name', v)} className="sm:col-span-2" />
            <TextField id="company-email" label="E-mail" type="email" value={form.email} onChange={(v) => set('email', v)} />
            <TextField id="company-phone" label="Telefone" value={form.phone} onChange={(v) => set('phone', v)} />
            <div className="space-y-2">
              <Label htmlFor="company-segment">Segmento</Label>
              <select id="company-segment" className={selectClass} value={form.segmentId} onChange={(e) => set('segmentId', e.target.value)}>
                <option value="">Sem segmento</option>
                {segments.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-status">Status</Label>
              <select id="company-status" className={selectClass} value={form.status} onChange={(e) => set('status', e.target.value as CompanyStatus)}>
                {(Object.keys(STATUS_LABELS) as CompanyStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </section>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Papéis</legend>
            <div className="flex flex-wrap gap-6">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isClient} onChange={(e) => set('isClient', e.target.checked)} />
                Cliente (tem TV)
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isAdvertiser} onChange={(e) => set('isAdvertiser', e.target.checked)} />
                Anunciante
              </label>
            </div>
            {form.isAdvertiser ? (
              <TextField
                id="company-advertiser-name"
                label="Nome comercial nas campanhas"
                value={form.advertiserCompany}
                onChange={(v) => set('advertiserCompany', v)}
              />
            ) : null}
          </fieldset>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Endereço</legend>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company-cep">CEP</Label>
                <div className="relative">
                  <Input id="company-cep" inputMode="numeric" maxLength={9} value={form.cep} onChange={(e) => set('cep', e.target.value)} />
                  {cepLoading ? <Loader2 className="absolute right-2 top-3 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </div>
              </div>
              <TextField id="company-street" label="Rua" value={form.street} onChange={(v) => set('street', v)} className="sm:col-span-4" />
              <TextField id="company-number" label="Número" value={form.number} onChange={(v) => set('number', v)} className="sm:col-span-2" />
              <TextField id="company-complement" label="Complemento" value={form.complement} onChange={(v) => set('complement', v)} className="sm:col-span-4" />
              <TextField id="company-district" label="Bairro" value={form.district} onChange={(v) => set('district', v)} className="sm:col-span-3" />
              <TextField id="company-city" label="Cidade" value={form.city} onChange={(v) => set('city', v)} className="sm:col-span-2" />
              <TextField id="company-state" label="UF" value={form.state} onChange={(v) => set('state', v.toUpperCase().slice(0, 2))} className="sm:col-span-1" />
            </div>
            {cepMessage ? <p className="text-sm text-amber-600">{cepMessage}</p> : null}
            {form.lat !== null && form.lng !== null ? (
              <p className="text-xs text-muted-foreground">Localização do CEP: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</p>
            ) : null}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="company-notes">Observações internas</Label>
            <Textarea id="company-notes" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar empresa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd artifacts/signage && pnpm exec vitest run src/components/__tests__/company-form-dialog.test.tsx`
Expected: PASS. Se `useListSegments` não usar `fetch` global no ambiente de teste, conferir `lib/api-client-react/src/custom-fetch.ts`: o mock por trecho de URL (`'/segments'`) cobre qualquer base.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/lib/companies-api.ts artifacts/signage/src/components/company-form-dialog.tsx artifacts/signage/src/components/__tests__/company-form-dialog.test.tsx
git commit -m "feat(signage): formulário de empresa com endereço pelo CEP"
```

---

### Task 9: Lista e detalhe de empresas

**Files:**
- Create: `artifacts/signage/src/components/client-devices-section.tsx`, `artifacts/signage/src/components/advertiser-campaigns-section.tsx`, `artifacts/signage/src/pages/companies.tsx`, `artifacts/signage/src/pages/company-detail.tsx`
- Test: `artifacts/signage/src/pages/__tests__/companies.test.tsx`, `artifacts/signage/src/pages/__tests__/company-detail.test.tsx`

**Interfaces:**
- Consumes: `companies-api.ts` e `CompanyFormDialog` (Task 8); `CampaignFormDialog` e `CampaignRow` (existentes); `TvPreviewGrid` (existente); hooks `useListDevices`, `useCreateDevice`, `getDevicePreview`, `getGetDevicePreviewQueryKey`, `getListDevicesQueryKey` de `@workspace/api-client-react`.
- Produces:
  - `ClientDevicesSection(props: { clientId: number })`
  - `AdvertiserCampaignsSection(props: { advertiserId: number })`
  - `default function Companies()` (página `/companies`)
  - `CompanyDetailView(props: { companyId: number })` e `default function CompanyDetailPage()` (lê `:id` da rota e renderiza a view)

O conteúdo das seções é o que hoje está em `client-detail.tsx` (TVs + prévias) e `advertiser-detail.tsx` (campanhas), sem o cabeçalho e sem a edição de cadastro, que passam para a empresa. As páginas antigas só saem na Task 10.

- [ ] **Step 1: Testes das páginas**

```tsx
// artifacts/signage/src/pages/__tests__/companies.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Companies from '../companies';

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

const PADARIA = {
  id: 5, name: 'Padaria Central', status: 'active', city: 'São Paulo', state: 'SP',
  clientId: 1, advertiserId: 2, advertiserCompany: null,
};
const MERCADO = { ...PADARIA, id: 6, name: 'Mercado Bom', status: 'paused', clientId: null, advertiserId: 3 };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Companies />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Companies', () => {
  it('lista empresas com papéis, cidade e status', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => json(String(url).includes('/companies') ? [PADARIA, MERCADO] : [])));
    renderPage();
    expect(await screen.findByText('Padaria Central')).toBeInTheDocument();
    expect(screen.getByText('São Paulo/SP', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getAllByText('Cliente')).toHaveLength(1);
    expect(screen.getAllByText('Anunciante')).toHaveLength(2);
    expect(screen.getByText('Pausada', { selector: 'div' })).toBeInTheDocument();
  });

  it('filtra por papel pedindo à API', async () => {
    const fetchMock = vi.fn((_url: string) => json([]));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await userEvent.selectOptions(screen.getByLabelText('Papel'), 'advertiser');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/companies?role=advertiser'), expect.anything()),
    );
  });
});
```

```tsx
// artifacts/signage/src/pages/__tests__/company-detail.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyDetailView } from '../company-detail';

const BASE = {
  id: 5, name: 'Padaria Central', email: null, phone: null, segmentId: null, status: 'active',
  notes: 'Pagamento todo dia 10', cep: '01310100', street: 'Avenida Paulista', number: '1000',
  complement: null, district: 'Bela Vista', city: 'São Paulo', state: 'SP', cityIbge: '3550308',
  lat: -23.56, lng: -46.65, clientId: 1, advertiserId: null, advertiserCompany: null,
  createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
  dependencies: { devices: 0, panels: 0, campaigns: 0 },
};

function renderView(company: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = String(url).includes('/companies/5') ? company : [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CompanyDetailView companyId={5} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CompanyDetailView', () => {
  it('mostra endereço, observações e só a aba de TVs para cliente', async () => {
    renderView(BASE);
    expect(await screen.findByRole('heading', { name: 'Padaria Central' })).toBeInTheDocument();
    expect(screen.getByText('Avenida Paulista, 1000 · Bela Vista · São Paulo/SP · CEP 01310-100')).toBeInTheDocument();
    expect(screen.getByText('Pagamento todo dia 10')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'TVs' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Campanhas' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Contas de acesso' })).toBeInTheDocument();
  });

  it('empresa só anunciante abre na aba de campanhas', async () => {
    renderView({ ...BASE, clientId: null, advertiserId: 2 });
    expect(await screen.findByRole('tab', { name: 'Campanhas' })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByRole('tab', { name: 'TVs' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/signage && pnpm exec vitest run src/pages/__tests__/companies.test.tsx src/pages/__tests__/company-detail.test.tsx`
Expected: FAIL — `Failed to resolve import "../companies"` e `"../company-detail"`.

- [ ] **Step 3: Seção de TVs** (extraída de `client-detail.tsx`)

```tsx
// artifacts/signage/src/components/client-devices-section.tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, Clock, Loader2, MapPin, Monitor, Plus, Trash2 } from 'lucide-react';
import {
  useCreateDevice,
  useListDevices,
  getListDevicesQueryKey,
  getDevicePreview,
  getGetDevicePreviewQueryKey,
} from '@workspace/api-client-react';
import { TvPreviewGrid } from '@/components/tv-preview-grid';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { companiesQueryKey } from '@/lib/companies-api';

const newDeviceSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  location: z.string().optional(),
});
type NewDeviceForm = z.infer<typeof newDeviceSchema>;

/** TVs do perfil de cliente de uma empresa: lista, cadastro, exclusão e prévias. */
export function ClientDevicesSection({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { data: devices = [], isLoading } = useListDevices(
    { clientId },
    { query: { enabled: !!clientId, queryKey: getListDevicesQueryKey({ clientId }) } },
  );

  // A contagem de TVs mora no detalhe da empresa (bloqueio de papel/exclusão).
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey({ clientId }) });
    queryClient.invalidateQueries({ queryKey: companiesQueryKey });
  };

  const form = useForm<NewDeviceForm>({
    resolver: zodResolver(newDeviceSchema),
    defaultValues: { name: '', location: '' },
  });

  const createDevice = useCreateDevice({
    mutation: {
      onSuccess: () => {
        refresh();
        toast({ title: 'TV cadastrada' });
        setOpen(false);
        form.reset();
      },
      onError: () => toast({ title: 'Não foi possível cadastrar a TV', variant: 'destructive' }),
    },
  });

  const deleteDevice = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/devices/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Delete failed');
    },
    onSuccess: () => {
      refresh();
      toast({ title: 'TV excluída' });
    },
    onError: () => toast({ title: 'Não foi possível excluir a TV', variant: 'destructive' }),
  });

  function onSubmit(values: NewDeviceForm) {
    createDevice.mutate({ data: { clientId, name: values.name, location: values.location || undefined } });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">TVs</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />Adicionar TV</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar TV</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl><Input placeholder="TV da recepção" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Local (opcional)</FormLabel>
                      <FormControl><Input placeholder="Entrada principal" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createDevice.isPending}>
                    {createDevice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Adicionar TV
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : devices.length === 0 ? (
        <Card className="py-12 text-center">
          <CardContent>
            <Monitor className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Nenhuma TV ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground/60">Adicione uma TV para começar a configurar as playlists.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div key={device.id} className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/devices/${device.id}`}>
                  <h3 className="cursor-pointer font-semibold transition-colors hover:text-primary">{device.name}</h3>
                </Link>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {device.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{device.location}</span>}
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{device.deviceKey}</span>
                  {device.lastSeenAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Visto por último em {new Date(device.lastSeenAt).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  onClick={() => deleteDevice.mutate(device.id)}
                  disabled={deleteDevice.isPending}
                  aria-label="Excluir TV"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/devices/${device.id}`}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><ChevronRight className="h-4 w-4" /></Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Só aparece com pelo menos uma TV: sem TV não há o que prever. */}
      {devices.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Prévias das TVs</h2>
          <TvPreviewGrid
            devices={devices}
            loadPreview={(id) => getDevicePreview(id)}
            queryKey={getGetDevicePreviewQueryKey}
            hrefFor={(id) => `/devices/${id}`}
          />
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Seção de campanhas** (extraída de `advertiser-detail.tsx`, com "Nova campanha" que antes ficava em `advertisers.tsx`)

Antes de escrever, confira em `artifacts/signage/src/components/use-campaign-form.ts` como `lockedAdvertiserId` é usado. Se ele **não** pré-seleciona o anunciante numa campanha nova, passe `advertisers` só com o anunciante desta empresa (como abaixo) e, no hook, inicialize `selectedAdvertiser` com `lockedAdvertiserId` quando não houver `campaign`.

```tsx
// artifacts/signage/src/components/advertiser-campaigns-section.tsx
import { useCallback, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CampaignFormDialog } from '@/components/campaign-form-dialog';
import { CampaignRow } from '@/components/campaign-row';

type AdvertiserWithCampaigns = {
  id: number;
  name: string;
  company: string | null;
  campaigns: Array<Parameters<typeof CampaignRow>[0]['campaign']>;
};

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Campanhas do perfil de anunciante de uma empresa, com criação e pausa. */
export function AdvertiserCampaignsSection({ advertiserId }: { advertiserId: number }) {
  const [data, setData] = useState<AdvertiserWithCampaigns | null>(null);
  const [announcements, setAnnouncements] = useState<Array<{ id: number; title: string }>>([]);
  const [devices, setDevices] = useState<Array<{ id: number; name: string; location: string | null; clientName: string }>>([]);
  const [segments, setSegments] = useState<Array<{ id: number; slug: string; name: string }>>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [adv, media, tvs, seg] = await Promise.all([
      fetch(api(`/advertisers/${advertiserId}`)).then((r) => (r.ok ? r.json() : null)),
      fetch(api('/announcements')).then((r) => (r.ok ? r.json() : [])),
      fetch(api('/devices')).then((r) => (r.ok ? r.json() : [])),
      fetch(api('/segments')).then((r) => (r.ok ? r.json() : [])),
    ]);
    setData(adv);
    setAnnouncements(asArray(media));
    setDevices(asArray(tvs));
    setSegments(asArray(seg));
    setLoading(false);
  }, [advertiserId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleCampaign(id: number) {
    await fetch(api(`/campaigns/${id}/toggle`), { method: 'PATCH' });
    load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Campanhas</CardTitle>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!data || announcements.length === 0}>
          Nova campanha
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : !data?.campaigns.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma campanha cadastrada.</p>
        ) : (
          data.campaigns.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} onToggle={toggleCampaign} />)
        )}
      </CardContent>
      {data ? (
        <CampaignFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          advertisers={[data]}
          announcements={announcements}
          devices={devices}
          segments={segments}
          lockedAdvertiserId={advertiserId}
          onSaved={load}
        />
      ) : null}
    </Card>
  );
}
```

Se o typecheck acusar incompatibilidade de tipo em `advertisers={[data]}` ou `campaign={campaign}`, use os tipos exportados por `campaign-form-dialog.tsx` (`CampaignFormAdvertiser`) e `campaign-row.tsx` em vez dos locais.

- [ ] **Step 5: Página de lista**

```tsx
// artifacts/signage/src/pages/companies.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Building2, ChevronRight, DollarSign, Megaphone, Monitor, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyFormDialog } from '@/components/company-form-dialog';
import { STATUS_LABELS, companiesQueryKey, listCompanies, type CompanyStatus } from '@/lib/companies-api';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export default function Companies() {
  const [, navigate] = useLocation();
  const [role, setRole] = useState<'' | 'client' | 'advertiser'>('');
  const [status, setStatus] = useState<'' | CompanyStatus>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const filter = { role: role || undefined, status: status || undefined, q: q.trim() || undefined };
  const { data: companies = [], isLoading } = useQuery({
    queryKey: [...companiesQueryKey, filter],
    queryFn: () => listCompanies(filter),
  });

  // Valor contratado somado da rede: era o painel da antiga página de anunciantes.
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async (): Promise<Array<{ contractValue: number }>> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/campaigns`);
      return res.ok ? res.json() : [];
    },
  });
  const totalValue = campaigns.reduce((sum, c) => sum + Number(c.contractValue || 0), 0);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="mt-1 text-muted-foreground">Donos de TV e anunciantes num cadastro só.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Nova empresa</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric icon={Building2} label="Empresas" value={companies.length} />
        <Metric icon={Monitor} label="Clientes" value={companies.filter((c) => c.clientId !== null).length} />
        <Metric icon={Megaphone} label="Anunciantes" value={companies.filter((c) => c.advertiserId !== null).length} />
        <Metric icon={DollarSign} label="Valor contratado" value={money(totalValue)} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="filter-q">Buscar</Label>
          <Input id="filter-q" placeholder="Nome da empresa" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-role">Papel</Label>
          <select id="filter-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="">Todos</option>
            <option value="client">Clientes</option>
            <option value="advertiser">Anunciantes</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="filter-status">Status</Label>
          <select id="filter-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABELS) as CompanyStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : companies.length === 0 ? (
        <Card className="py-16 text-center">
          <CardContent>
            <Building2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Nenhuma empresa encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((company) => (
            <Link key={company.id} href={`/companies/${company.id}`}>
              <div className="group flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/40">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">{company.name}</h3>
                  {company.city ? (
                    <p className="text-sm text-muted-foreground">{[company.city, company.state].filter(Boolean).join('/')}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {company.clientId !== null ? <Badge variant="secondary">Cliente</Badge> : null}
                  {company.advertiserId !== null ? <Badge variant="secondary">Anunciante</Badge> : null}
                  {company.status !== 'active' ? <Badge variant="outline">{STATUS_LABELS[company.status]}</Badge> : null}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <CompanyFormDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={(saved) => {
          setOpen(false);
          navigate(`/companies/${saved.id}`);
        }}
      />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
```

O teste espera `São Paulo/SP` num `<p>`: é o que o card renderiza.

- [ ] **Step 6: Página de detalhe**

```tsx
// artifacts/signage/src/pages/company-detail.tsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useRoute } from 'wouter';
import { ArrowLeft, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { AdvertiserCampaignsSection } from '@/components/advertiser-campaigns-section';
import { ClientDevicesSection } from '@/components/client-devices-section';
import { CompanyFormDialog } from '@/components/company-form-dialog';
import {
  ApiError,
  STATUS_LABELS,
  companiesQueryKey,
  companyQueryKey,
  deleteCompany,
  getCompany,
  type CompanyDetail,
} from '@/lib/companies-api';

interface LinkedUser {
  id: number;
  email: string;
  name: string | null;
  clientIds: number[];
  advertiserIds: number[];
}

function formatCep(cep: string) {
  return cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

/** "Rua, número · bairro · cidade/UF · CEP 00000-000", pulando o que falta. */
function addressLine(c: CompanyDetail): string | null {
  const street = [c.street, c.number].filter(Boolean).join(', ');
  const city = [c.city, c.state].filter(Boolean).join('/');
  const parts = [street, c.complement, c.district, city, c.cep ? `CEP ${formatCep(c.cep)}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export default function CompanyDetailPage() {
  const [, params] = useRoute('/companies/:id');
  const id = params ? Number(params.id) : 0;
  return <CompanyDetailView companyId={id} />;
}

export function CompanyDetailView({ companyId }: { companyId: number }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const { data: company, isLoading, isError } = useQuery({
    queryKey: companyQueryKey(companyId),
    queryFn: () => getCompany(companyId),
    enabled: companyId > 0,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<LinkedUser[]> => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/users`);
      return res.ok ? res.json() : [];
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
        <p className="text-muted-foreground">Empresa não encontrada.</p>
        <Link href="/companies"><Button variant="link" className="mt-2">Voltar para empresas</Button></Link>
      </div>
    );
  }

  const linkedUsers = users.filter(
    (u) =>
      (company.clientId !== null && u.clientIds.includes(company.clientId)) ||
      (company.advertiserId !== null && u.advertiserIds.includes(company.advertiserId)),
  );
  const address = addressLine(company);
  const defaultTab = company.clientId !== null ? 'tvs' : company.advertiserId !== null ? 'campanhas' : 'contas';

  async function handleDelete() {
    if (!company || !window.confirm(`Excluir a empresa "${company.name}"?`)) return;
    try {
      await deleteCompany(company.id);
      queryClient.invalidateQueries({ queryKey: companiesQueryKey });
      toast({ title: 'Empresa excluída' });
      navigate('/companies');
    } catch (err) {
      toast({ title: err instanceof ApiError ? err.message : 'Não foi possível excluir a empresa.', variant: 'destructive' });
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link href="/companies">
        <Button variant="ghost" size="sm" className="-ml-2 mb-6 text-muted-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Empresas</Button>
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{company.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {company.clientId !== null ? <Badge variant="secondary">Cliente</Badge> : null}
            {company.advertiserId !== null ? <Badge variant="secondary">Anunciante</Badge> : null}
            <Badge variant="outline">{STATUS_LABELS[company.status]}</Badge>
          </div>
          {address ? (
            <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><span>{address}</span></p>
          ) : null}
          {company.email || company.phone ? (
            <p className="mt-1 text-sm text-muted-foreground">{[company.email, company.phone].filter(Boolean).join(' · ')}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
          <Button variant="ghost" size="icon" aria-label="Excluir empresa" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {company.notes ? (
        <Card className="mb-8">
          <CardContent className="pt-5">
            <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Observações internas</p>
            <p className="whitespace-pre-wrap text-sm">{company.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {company.clientId !== null ? <TabsTrigger value="tvs">TVs</TabsTrigger> : null}
          {company.advertiserId !== null ? <TabsTrigger value="campanhas">Campanhas</TabsTrigger> : null}
          <TabsTrigger value="contas">Contas de acesso</TabsTrigger>
        </TabsList>
        {company.clientId !== null ? (
          <TabsContent value="tvs" className="pt-4"><ClientDevicesSection clientId={company.clientId} /></TabsContent>
        ) : null}
        {company.advertiserId !== null ? (
          <TabsContent value="campanhas" className="pt-4"><AdvertiserCampaignsSection advertiserId={company.advertiserId} /></TabsContent>
        ) : null}
        <TabsContent value="contas" className="pt-4">
          {linkedUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta vinculada a esta empresa.</p>
          ) : (
            <ul className="space-y-2">
              {linkedUsers.map((u) => (
                <li key={u.id} className="rounded-lg border p-3 text-sm">
                  <span className="font-medium">{u.name ?? u.email}</span>
                  {u.name ? <span className="text-muted-foreground"> · {u.email}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <Link href="/users-admin"><Button variant="link" className="mt-2 px-0">Gerenciar contas de acesso</Button></Link>
        </TabsContent>
      </Tabs>

      <CompanyFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        company={company}
        onSaved={(saved) => {
          setEditOpen(false);
          queryClient.setQueryData(companyQueryKey(company.id), saved);
          queryClient.invalidateQueries({ queryKey: companiesQueryKey });
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `cd artifacts/signage && pnpm exec vitest run src/pages/__tests__/companies.test.tsx src/pages/__tests__/company-detail.test.tsx src/components/__tests__/company-form-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/components/client-devices-section.tsx artifacts/signage/src/components/advertiser-campaigns-section.tsx artifacts/signage/src/pages/companies.tsx artifacts/signage/src/pages/company-detail.tsx artifacts/signage/src/pages/__tests__/companies.test.tsx artifacts/signage/src/pages/__tests__/company-detail.test.tsx
git commit -m "feat(signage): páginas de empresas com abas de TVs, campanhas e contas"
```

---

### Task 10: Menu, rotas antigas, Contas de Acesso e limpeza

**Files:**
- Create: `artifacts/signage/src/pages/legacy-redirect.tsx`
- Modify: `artifacts/signage/src/App.tsx`, `artifacts/signage/src/components/layout.tsx`, `artifacts/signage/src/pages/users.tsx`, `lib/api-spec/openapi.yaml`
- Delete: `artifacts/signage/src/pages/clients.tsx`, `client-detail.tsx`, `advertisers.tsx`, `advertiser-detail.tsx`
- Test: `artifacts/signage/src/pages/__tests__/users.test.tsx`

**Interfaces:**
- Consumes: `Companies`, `CompanyDetailPage` (Task 9); `GET /clients/:id` e `GET /advertisers/:id` com `companyId` (Task 4); `POST/PATCH /users` com `name`/`isAdmin` (Task 7).
- Produces: `LegacyRedirect(props: { kind: 'client' | 'advertiser' })`. Rotas: `/` → `/companies`; `/clients` e `/advertisers` → `/companies`; `/clients/:id` e `/advertisers/:id` → `/companies/:companyId`.

Os links existentes para `/clients/:id` (`device-detail.tsx`) e `/advertisers/:id` (`campaign-detail.tsx`) continuam funcionando pelo redirecionamento; não precisam mudar.

- [ ] **Step 1: Redirecionamento das rotas antigas**

```tsx
// artifacts/signage/src/pages/legacy-redirect.tsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';

/**
 * `/clients/:id` e `/advertisers/:id` viraram abas da empresa. Links salvos e
 * os que ainda existem nas páginas de TV e campanha caem aqui e seguem para a
 * empresa dona do perfil.
 */
export default function LegacyRedirect({ kind }: { kind: 'client' | 'advertiser' }) {
  const [, params] = useRoute(kind === 'client' ? '/clients/:id' : '/advertisers/:id');
  const [, navigate] = useLocation();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    const path = kind === 'client' ? 'clients' : 'advertisers';
    fetch(`${import.meta.env.BASE_URL}api/${path}/${params.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((row: { companyId?: number } | null) => {
        if (row?.companyId) navigate(`/companies/${row.companyId}`, { replace: true });
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [kind, params?.id, navigate]);

  if (!missing) return <div className="container mx-auto max-w-4xl px-4 py-8 text-sm text-muted-foreground">Carregando…</div>;
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 text-center">
      <p className="text-muted-foreground">Cadastro não encontrado.</p>
      <Link href="/companies"><Button variant="link">Ir para empresas</Button></Link>
    </div>
  );
}
```

- [ ] **Step 2: Rotas e menu**

`App.tsx`: remover os imports de `Clients`, `ClientDetail`, `Advertisers`, `AdvertiserDetail` e adicionar:

```tsx
import Companies from './pages/companies';
import CompanyDetailPage from './pages/company-detail';
import LegacyRedirect from './pages/legacy-redirect';
```

Em `AdminRoutes`, trocar os blocos `/`, `/clients`, `/clients/:id`, `/advertisers`, `/advertisers/:id` por:

```tsx
      <Route path="/">
        <Redirect to="/companies" />
      </Route>
      <Route path="/companies">
        <Layout><Companies /></Layout>
      </Route>
      <Route path="/companies/:id">
        <Layout><CompanyDetailPage /></Layout>
      </Route>
      <Route path="/clients">
        <Redirect to="/companies" />
      </Route>
      <Route path="/clients/:id">
        <Layout><LegacyRedirect kind="client" /></Layout>
      </Route>
      <Route path="/advertisers">
        <Redirect to="/companies" />
      </Route>
      <Route path="/advertisers/:id">
        <Layout><LegacyRedirect kind="advertiser" /></Layout>
      </Route>
```

`components/layout.tsx`:

```tsx
import { MonitorPlay, LayoutDashboard, BarChart3, Building2, LogOut, KeyRound, Megaphone } from 'lucide-react';
// ...
  const navItems = [
    { href: '/companies', label: 'Empresas', icon: Building2 },
    { href: '/admin', label: 'Biblioteca de Mídia', icon: LayoutDashboard },
    { href: '/analytics', label: 'Análises', icon: BarChart3 },
    { href: '/users-admin', label: 'Contas de Acesso', icon: KeyRound },
    { href: '/divulgacao', label: 'Divulgação', icon: Megaphone },
  ];
```

- [ ] **Step 3: Teste de Contas de Acesso**

```tsx
// artifacts/signage/src/pages/__tests__/users.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Users from '../users';

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

const ADMIN = {
  id: 1, email: 'yuri@ex.com', name: 'Yuri', isAdmin: true, isActive: true,
  mustChangePassword: false, clientIds: [], advertiserIds: [],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Users />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Users', () => {
  it('mostra nome e marca de administrador', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => json(200, String(url).includes('/users') ? [ADMIN] : [])));
    renderPage();
    expect(await screen.findByText('Yuri')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
  });

  it('cria conta com nome e administrador', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json(201, ADMIN) : json(200, []),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await userEvent.type(screen.getByLabelText('Nome'), 'Yuri');
    await userEvent.type(screen.getByLabelText('Email'), 'yuri@ex.com');
    await userEvent.type(screen.getByLabelText('Senha temporária (mín. 8)'), '12345678');
    await userEvent.click(screen.getByLabelText('Administrador (acesso total)'));
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/users'), expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'Yuri', isAdmin: true, email: 'yuri@ex.com' });
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd artifacts/signage && pnpm exec vitest run src/pages/__tests__/users.test.tsx`
Expected: FAIL — não encontra `Yuri` / label `Nome`.

- [ ] **Step 5: Implementar em `pages/users.tsx`**

1. `UserAccount` ganha `name: string | null; isAdmin: boolean;`. `UserPatch` ganha `name: string | null; isAdmin: boolean;`.
2. Estado de criação: `const [name, setName] = useState(''); const [isAdmin, setIsAdmin] = useState(false);`.
3. Corpo do POST: `JSON.stringify({ email, tempPassword, name: name.trim() || null, isAdmin, clientIds, advertiserIds })`; no `onSuccess`, `setName(''); setIsAdmin(false);`.
4. Corpo do PATCH de edição: acrescentar `name: patch.name, isAdmin: patch.isAdmin,`.
5. No formulário de criação, trocar o `grid` por:

```tsx
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="user-name">Nome</Label>
              <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-temp-password">Senha temporária (mín. 8)</Label>
              <Input
                id="user-temp-password"
                type="text"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Administrador (acesso total)
          </label>
```

6. Legendas dos seletores de vínculo: `label="Empresas clientes"` e `label="Empresas anunciantes"` (as opções já vêm com o nome da empresa desde a Task 4).
7. Tabela: cabeçalho `Nome` antes de `Email` e `Papel` depois de `Email`; `colSpan={7}` na linha vazia; em cada linha:

```tsx
                <td className="px-3 py-2">{u.name ?? '—'}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.isAdmin ? 'Administrador' : 'Portal'}</td>
```

8. `EditUserForm`: estados `const [name, setName] = useState(user.name ?? ''); const [isAdmin, setIsAdmin] = useState(user.isAdmin);`, `onSubmit({ id: user.id, name: name.trim() || null, isAdmin, isActive, clientIds, advertiserIds })`, e antes do checkbox "Conta ativa":

```tsx
      <div className="space-y-2">
        <Label htmlFor="edit-user-name">Nome</Label>
        <Input id="edit-user-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
        Administrador (acesso total)
      </label>
```

Os erros 409 do último admin já aparecem pelo `toast` existente, que mostra `body.error`. Para o toggle e o remover, trocar as mensagens fixas por leitura do corpo:

```tsx
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Não foi possível atualizar a conta.');
      }
```

(e o equivalente com `'Não foi possível remover a conta.'` no delete, mantendo o `res.status !== 204`).

- [ ] **Step 6: Rodar e ver passar**

Run: `cd artifacts/signage && pnpm exec vitest run src/pages/__tests__/users.test.tsx`
Expected: PASS.

- [ ] **Step 7: Remover páginas e operações antigas**

```bash
git rm artifacts/signage/src/pages/clients.tsx artifacts/signage/src/pages/client-detail.tsx artifacts/signage/src/pages/advertisers.tsx artifacts/signage/src/pages/advertiser-detail.tsx
```

Em `lib/api-spec/openapi.yaml`: apagar `post` (createClient) de `/clients`, `patch` (updateClient) e `delete` (deleteClient) de `/clients/{id}`, e os schemas `ClientInput` e `ClientUpdate`.

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: sem erro.

Run: `rtk proxy grep -rnE "useCreateClient|useUpdateClient|useDeleteClient|pages/(clients|client-detail|advertisers|advertiser-detail)" artifacts/signage/src artifacts/api-server/src`
Expected: nenhuma saída.

- [ ] **Step 8: Verificação completa**

Run: `pnpm run typecheck && pnpm --filter @workspace/signage run test && pnpm --filter @workspace/api-server run test`
Expected: sem erros; PASS.

- [ ] **Step 9: Commit**

```bash
git add -A artifacts/signage/src lib/api-spec lib/api-client-react lib/api-zod
git commit -m "feat(signage): menu Empresas substitui Clientes e Anunciantes"
```

---

### Task 11: Validação da migração num branch do Neon

**Files:** nenhum arquivo do repositório. Scripts descartáveis ficam no scratchpad.

**Interfaces:**
- Consumes: migrations `0007`/`0008` (Task 1) e o app completo (Tasks 2–10).

> **Pare e peça confirmação ao dono antes de cada passo marcado com ⚠️.** Nada aqui toca a produção. O branch criado no Step 1 é também o backup: **não apague** até o dono confirmar que produção está estável.

- [ ] **Step 1: ⚠️ Criar o branch-backup a partir da produção**

O CLI do Neon exige login interativo. Peça ao dono para rodar no prompt:

```
! npx neonctl auth
```

Depois:

Run: `set -a; source .env.production.local; set +a; npx neonctl branches create --project-id "$NEON_PROJECT_ID" --name backup-antes-empresas-2026-09-15 --output json | head -40`
Expected: JSON com `"name": "backup-antes-empresas-2026-09-15"`.

Run: `set -a; source .env.production.local; set +a; npx neonctl connection-string backup-antes-empresas-2026-09-15 --project-id "$NEON_PROJECT_ID"`
Expected: uma URL `postgresql://...`. Guarde só na variável de shell `BRANCH_URL` do comando seguinte; não escreva em arquivo do repo.

- [ ] **Step 2: Rodar as migrations no branch**

Run: `MIGRATE_DATABASE_URL='<BRANCH_URL>' pnpm --filter @workspace/db run migrate`
Expected: `[migrate] Migrações aplicadas com sucesso.`

- [ ] **Step 3: Conferir o resultado**

Salvar em `<scratchpad>/confere-empresas.mjs` e rodar a partir de `lib/db` (para achar o `pg`):

```js
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.BRANCH_URL });
const q = async (s) => (await pool.query(s)).rows;
try {
  console.log("contagens:", (await q(`select
    (select count(*) from companies) companies, (select count(*) from clients) clients,
    (select count(*) from advertisers) advertisers, (select count(*) from devices) devices,
    (select count(*) from campaigns) campaigns, (select count(*) from plays) plays,
    (select count(*) from scans) scans, (select count(*) from users) users,
    (select count(*) from panels) panels,
    (select count(*) from announcements where source = 'admin') pecas_admin,
    (select count(*) from announcements where source = 'panel') pecas_painel,
    (select count(*) from segments) segments`))[0]);
  console.log("colunas clients:", (await q(`select column_name from information_schema.columns where table_name='clients' order by 1`)).map((r) => r.column_name));
  console.log("colunas advertisers:", (await q(`select column_name from information_schema.columns where table_name='advertisers' order by 1`)).map((r) => r.column_name));
  console.log("colunas users novas:", (await q(`select column_name from information_schema.columns where table_name='users' and column_name in ('name','is_admin')`)).map((r) => r.column_name));
  console.log("uniques:", (await q(`select conname from pg_constraint where conname in ('clients_company_id_unique','advertisers_company_id_unique')`)).map((r) => r.conname));
} finally {
  await pool.end();
}
```

Run: `cd lib/db && BRANCH_URL='<BRANCH_URL>' node <scratchpad>/confere-empresas.mjs`
Expected:
- `companies`, `clients`, `advertisers`, `devices`, `campaigns`, `plays`, `scans`, `users`, `panels`, `pecas_painel` = `0`;
- `pecas_admin` e `segments` iguais aos da produção antes da migração (compare com o mesmo `select` no branch **antes** do Step 2, ou aceite qualquer valor > 0 se o dono confirmar);
- `clients`: `company_id, created_at, id, updated_at`;
- `advertisers`: `company, company_id, created_at, id, updated_at`;
- `users` novas: `name`, `is_admin`;
- os dois uniques presentes.

- [ ] **Step 4: Fluxo de ponta a ponta apontando para o branch**

Suba API e frontend com o banco do branch (comandos do `replit.md`), em dois terminais:

```bash
DATABASE_URL='<BRANCH_URL>' SESSION_SECRET=dev ADMIN_USERNAME=admin ADMIN_PASSWORD=<senha-local> pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/signage run dev
```

Fazer no navegador e anotar o resultado de cada item:
1. Entrar com o admin do env → cai em `/companies`.
2. "Nova empresa": nome "Padaria Teste", Cliente marcado, CEP `01310-100` → rua "Avenida Paulista", bairro, cidade, UF preenchidos sozinhos; salvar.
3. Detalhe da empresa → aba **TVs** → adicionar TV → aparece com `deviceKey`.
4. Criar "Mercado Teste" só como Anunciante, mesmo segmento da padaria → aba **Campanhas** → nova campanha para todas as TVs com uma peça.
5. Abrir a prévia da TV da padaria → a peça do mercado **não** aparece (concorrência). Editar a padaria marcando também Anunciante e criar campanha dela → a peça **aparece** (mesma empresa).
6. Tentar desmarcar Cliente da padaria → aviso de 409 com "1 TV(s)".
7. CEP `99999-999` → aviso "CEP não encontrado", campos editáveis.
8. "Contas de Acesso": criar usuário com "Administrador" marcado; sair; entrar com ele → troca de senha → acesso ao admin.
9. Tentar desativar esse admin quando ele é o único admin do banco → erro "Não dá para remover o último administrador ativo."

Expected: todos os itens como descrito. Qualquer divergência volta para a task correspondente.

- [ ] **Step 5: Verificação final do código**

Run: `pnpm run typecheck && pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/signage run test`
Expected: sem erros; PASS nas duas suítes.

- [ ] **Step 6: ⚠️ Parar e pedir confirmação para produção**

Informe ao dono: resultado dos Steps 3–5, nome do branch-backup e o aviso de que o deploy **apaga clientes, anunciantes, TVs, exibições, playlists, painéis, campanhas, scans, logins e peças de painel da produção** e que as TVs físicas precisarão de novo `deviceKey`. Só siga para merge/deploy (skill `superpowers:finishing-a-development-branch`) com um "sim" explícito dele.
