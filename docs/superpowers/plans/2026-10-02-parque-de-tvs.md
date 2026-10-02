# Parque de TVs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin abre `/parque` e vê todas as TVs com online/offline, versão do app e selo de desatualizada; no detalhe de cada TV vê a linha do tempo de quedas dos últimos 30 dias.

**Architecture:** A rota do feed da TV (`GET /display/:key/feed`, a cada 60 s) já grava `devices.last_seen_at`; passa a gravar também `devices.app_version` (lida do `User-Agent`) e a manter uma linha em `device_sessions` por período contínuo no ar. Duas rotas novas de admin leem isso: `GET /fleet` (foto do agora) e `GET /devices/:id/sessions` (histórico). O navegador calcula os períodos fora do ar a partir dos buracos entre sessões.

**Tech Stack:** pnpm monorepo, Drizzle + Postgres (`lib/db`), Express + zod gerado por orval (`artifacts/api-server`, `lib/api-spec`), React + TanStack Query + wouter (`artifacts/signage`), vitest + jsdom + supertest.

**Spec:** `docs/superpowers/specs/2026-10-02-parque-de-tvs-design.md`

## Global Constraints

- Branch `feat/parque-de-tvs`. Nunca commitar na `main`.
- Commit: `tipo(escopo): descrição curta em português`, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como caracteres UTF-8 reais, nunca `\uXXXX`.
- Não editar à mão `lib/api-zod/src/generated/**` nem `lib/api-client-react/src/generated/**`: mudar `lib/api-spec/openapi.yaml` e rodar o codegen.
- Nenhuma mudança no app Android nem no `tv.html`. Não criar tag `vX.Y.Z`, não mexer em `versionName`/`versionCode`.
- Migração só de acréscimo: nada de `DROP`, nada de `NOT NULL` em coluna nova de `devices`.
- Online = `last_seen_at` nos últimos **5 minutos** (`DEVICE_ONLINE_WINDOW_MINUTES`). Histórico = **30 dias**. Página do parque e histórico recarregam a cada **60 s**.
- Versão do app: o que vem depois de `SignageApp/` no `User-Agent`, só letras, números, `.` e `-`, até **32** caracteres. Sem marcador → `null`.
- Desatualizada: só quando as duas versões são `X.Y.Z` e a da TV é menor, número a número. Versão nula ou fora do padrão nunca é marcada.
- O feed da TV nunca falha por causa do histórico: erro ao gravar sessão vai para o log e é engolido.
- `routes/public-vitrine.ts` não muda: visita da landing não abre sessão.
- Textos exatos: menu `Parque de TVs`; rota web `/parque`; seção `Histórico de conexão`; estados `No ar` e `Fora do ar`; selos `Desatualizada` e `Vitrine`; TV sem contato `nunca conectou`; TV sem app `navegador`.

## Review Focus

Entradas que a spec não nomeia mas que o parque real vai produzir. Cada uma tem teste na tarefa dona do código.

1. **`User-Agent` com versão absurda** (40 caracteres, `SignageApp/<script>`, `NotSignageApp/1.0.0`): qualquer um pode chamar o feed com a key. Esperado: grava `null`, nunca texto arbitrário no banco. → Task 2.
2. **Sessões sobrepostas ou aninhadas** (mesma key aberta em duas telas, ou duas requisições simultâneas): Esperado: um período "No ar" só, sem "Fora do ar" de duração negativa. → Task 5.
3. **TV online sem nenhuma sessão registrada** (vitrine, TV vista antes do deploy, gravação de sessão que falhou): Esperado: histórico vazio com o aviso, sem inventar queda. → Task 5.
4. **TV com versão maior que a última release, ou `-rc`** (release apagada, build de teste instalado à mão): Esperado: não é desatualizada e entra no bloco de versões sem quebrar a ordenação. → Tasks 2 e 6.
5. **`lastSeenAt` alguns segundos no futuro** (relógio do banco adiantado em relação ao do navegador): Esperado: "agora", nunca "há -1 min". → Task 6.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/devices.ts` (modificar) | coluna `appVersion` |
| `lib/db/src/schema/device_sessions.ts` (criar) | tabela de períodos no ar |
| `lib/db/src/schema/index.ts` (modificar) | exporta a tabela nova |
| `lib/db/drizzle/0017_*.sql` (gerado) | migration |
| `artifacts/api-server/src/lib/device-presence.ts` (criar) | janela de 5 min, corte de 30 dias, `isOnlineAt` |
| `artifacts/api-server/src/lib/tv-app-version.ts` (criar) | versão a partir do `User-Agent`; comparação com a última release |
| `artifacts/api-server/src/lib/device-sessions.ts` (criar) | esticar/abrir/limpar/listar sessões |
| `artifacts/api-server/src/lib/portal/overview.ts`, `queries.ts` (modificar) | passam a importar a janela de `device-presence` |
| `artifacts/api-server/src/routes/display.ts` (modificar) | grava versão e sessão a cada feed |
| `lib/api-spec/openapi.yaml` (modificar) | `GET /fleet`, `GET /devices/{id}/sessions` |
| `artifacts/api-server/src/routes/fleet.ts` (criar) | as duas rotas de leitura |
| `artifacts/api-server/src/routes/index.ts` (modificar) | registra `fleetRouter` depois de `requireAdmin` |
| `artifacts/signage/src/lib/connection-timeline.ts` (criar) | sessões → linha do tempo; formatação de hora e duração |
| `artifacts/signage/src/components/device-connection-history.tsx` (criar) | seção "Histórico de conexão" |
| `artifacts/signage/src/pages/device-detail.tsx` (modificar) | usa a seção |
| `artifacts/signage/src/lib/fleet.ts` (criar) | contagens, versões em uso, filtro, "visto por último" |
| `artifacts/signage/src/pages/fleet.tsx` (criar) | página `/parque` |
| `artifacts/signage/src/App.tsx`, `components/layout.tsx` (modificar) | rota e item de menu |

Comandos de teste, da raiz do repo:

- API: `pnpm --filter @workspace/api-server test -- <arquivo>`
- Web: `pnpm --filter @workspace/signage test -- <arquivo>`
- Tipos: `pnpm run typecheck`

---

### Task 1: Coluna `app_version` e tabela `device_sessions`

**Files:**
- Modify: `lib/db/src/schema/devices.ts`
- Create: `lib/db/src/schema/device_sessions.ts`
- Modify: `lib/db/src/schema/index.ts`
- Create (gerado): `lib/db/drizzle/0017_*.sql`, `lib/db/drizzle/meta/0017_snapshot.json`, `lib/db/drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `devicesTable.appVersion` (`text`, nulo).
  - `deviceSessionsTable` com `id`, `deviceId`, `startedAt`, `lastSeenAt`, exportada de `@workspace/db`.
  - Tipo `DeviceSession`.

- [ ] **Step 1: Coluna no schema de devices**

Em `lib/db/src/schema/devices.ts`, logo depois de `lastSeenAt`:

```ts
    // Versão do app Android no último contato, lida do User-Agent
    // (`SignageApp/<versão>`). Nulo = TV aberta em navegador, ou que nunca falou.
    appVersion: text("app_version"),
```

- [ ] **Step 2: Tabela de sessões**

Criar `lib/db/src/schema/device_sessions.ts`:

```ts
import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

/**
 * Um período contínuo em que a TV falou com o servidor. A TV busca o feed a
 * cada 60 s; enquanto os contatos chegam dentro da janela de presença, a mesma
 * linha é esticada. O buraco entre duas linhas seguidas da mesma TV é uma
 * queda — é disso que sai a linha do tempo do admin.
 */
export const deviceSessionsTable = pgTable(
  "device_sessions",
  {
    id: serial("id").primaryKey(),
    deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  },
  // As três consultas (esticar, limpar, listar) filtram por TV e por
  // last_seen_at; sem o índice, cada feed varreria o histórico inteiro.
  (t) => [index("device_sessions_device_last_seen_idx").on(t.deviceId, t.lastSeenAt)],
);

export type DeviceSession = typeof deviceSessionsTable.$inferSelect;
```

Em `lib/db/src/schema/index.ts`, logo depois de `export * from "./devices";`:

```ts
export * from "./device_sessions";
```

- [ ] **Step 3: Gerar a migration**

O `drizzle.config.ts` exige `DATABASE_URL` mesmo para gerar, mas `generate` não conecta: qualquer valor serve.

Run: `DATABASE_URL=postgres://local/gerar pnpm --filter @workspace/db run generate`
Expected: cria `lib/db/drizzle/0017_<nome>.sql`.

Run: `cat lib/db/drizzle/0017_*.sql`
Expected: só estas quatro instruções (a ordem pode variar): `CREATE TABLE "device_sessions"` com as quatro colunas, `ALTER TABLE "devices" ADD COLUMN "app_version" text;`, `ALTER TABLE "device_sessions" ADD CONSTRAINT … FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade …;` e `CREATE INDEX "device_sessions_device_last_seen_idx" ON "device_sessions" USING btree ("device_id","last_seen_at");`.

Se aparecer `DROP` ou qualquer instrução sobre outra tabela, parar: o snapshot `0016` está fora de sincronia com o schema e isso precisa ser resolvido antes.

- [ ] **Step 4: Aplicar num Postgres descartável e conferir as três consultas**

```bash
docker run -d --rm --name parque-pg -e POSTGRES_PASSWORD=x -p 55434:5432 postgres:16-alpine
for i in $(seq 1 30); do docker exec parque-pg pg_isready -U postgres -q && break; sleep 1; done
for f in lib/db/drizzle/*.sql; do sed 's/--> statement-breakpoint//' "$f" | docker exec -i parque-pg psql -q -v ON_ERROR_STOP=1 -U postgres >/dev/null || echo "FALHOU $f"; done
docker exec -i parque-pg psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into companies (id, name) values (1, 'Loja');
insert into clients (id, company_id) values (1, 1);
insert into devices (id, client_id, name, device_key) values (1, 1, 'TV', 'K1'), (2, 1, 'TV 2', 'K2');
insert into device_sessions (device_id, started_at, last_seen_at) values
  (1, now() - interval '40 days', now() - interval '40 days'),
  (2, now() - interval '40 days', now() - interval '40 days'),
  (1, now() - interval '1 hour',  now() - interval '2 minutes');
-- esticar: só a sessão da TV 1 vista há menos de 5 min
update device_sessions set last_seen_at = now()
  where device_id = 1 and last_seen_at >= now() - interval '5 minutes';
-- limpar: só as velhas da TV 1
delete from device_sessions
  where device_id = 1 and last_seen_at < now() - interval '30 days';
select device_id, count(*) from device_sessions group by 1 order by 1;
-- apagar a TV leva as sessões junto
delete from devices where id = 2;
select count(*) as sessoes_da_tv_apagada from device_sessions where device_id = 2;
select app_version is null as versao_nula from devices where id = 1;
SQL
docker stop parque-pg
```

Expected: nenhuma linha `FALHOU`; `UPDATE 1`; `DELETE 1`; a contagem mostra `1 | 1` e `2 | 1` (a sessão velha da TV 2 não foi tocada); `sessoes_da_tv_apagada = 0`; `versao_nula = t`.

- [ ] **Step 5: Tipos**

Run: `pnpm run typecheck:libs`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/devices.ts lib/db/src/schema/device_sessions.ts lib/db/src/schema/index.ts lib/db/drizzle
git commit -m "feat(db): versão do app e sessões de conexão das TVs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Janela de presença e versão do app (funções puras)

**Files:**
- Create: `artifacts/api-server/src/lib/device-presence.ts`
- Create: `artifacts/api-server/src/lib/tv-app-version.ts`
- Modify: `artifacts/api-server/src/lib/portal/overview.ts:9-18`
- Modify: `artifacts/api-server/src/lib/portal/queries.ts:7`
- Delete: `artifacts/api-server/src/lib/portal/__tests__/overview-window.test.ts`
- Test: `artifacts/api-server/src/lib/__tests__/device-presence.test.ts` (criar)
- Test: `artifacts/api-server/src/lib/__tests__/tv-app-version.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces (de `lib/device-presence.ts`, sem importar o banco):
  - `DEVICE_ONLINE_WINDOW_MINUTES = 5`
  - `onlineSince(now: Date): Date`
  - `isOnlineAt(lastSeenAt: Date | null, now: Date): boolean`
  - `SESSION_HISTORY_DAYS = 30`
  - `sessionHistorySince(now: Date): Date`
- Produces (de `lib/tv-app-version.ts`):
  - `tvAppVersionFromUserAgent(userAgent: string | null | undefined): string | null`
  - `isOutdatedTvApp(appVersion: string | null, latestVersion: string | null): boolean`

- [ ] **Step 1: Teste da janela de presença**

Criar `artifacts/api-server/src/lib/__tests__/device-presence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEVICE_ONLINE_WINDOW_MINUTES,
  SESSION_HISTORY_DAYS,
  isOnlineAt,
  onlineSince,
  sessionHistorySince,
} from "../device-presence";

const NOW = new Date("2026-10-02T15:00:00.000Z");

describe("janela de presença das TVs", () => {
  it("onlineSince olha 5 minutos para trás", () => {
    expect(DEVICE_ONLINE_WINDOW_MINUTES).toBe(5);
    expect(onlineSince(NOW).toISOString()).toBe("2026-10-02T14:55:00.000Z");
  });

  it("TV vista dentro da janela está online; na borda também", () => {
    expect(isOnlineAt(new Date("2026-10-02T14:59:00.000Z"), NOW)).toBe(true);
    expect(isOnlineAt(new Date("2026-10-02T14:55:00.000Z"), NOW)).toBe(true);
  });

  it("TV vista antes da janela está offline", () => {
    expect(isOnlineAt(new Date("2026-10-02T14:54:59.000Z"), NOW)).toBe(false);
  });

  // TV cadastrada que nunca reportou não é "não sei": é offline.
  it("TV que nunca conectou está offline", () => {
    expect(isOnlineAt(null, NOW)).toBe(false);
  });

  it("o histórico olha 30 dias para trás", () => {
    expect(SESSION_HISTORY_DAYS).toBe(30);
    expect(sessionHistorySince(NOW).toISOString()).toBe("2026-09-02T15:00:00.000Z");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- device-presence`
Expected: FAIL, módulo `../device-presence` não existe.

- [ ] **Step 3: Implementar `device-presence.ts`**

Criar `artifacts/api-server/src/lib/device-presence.ts`:

```ts
/**
 * Presença das TVs. Não importa o banco de propósito: portal, parque e
 * sessões de conexão usam a mesma janela, e ela precisa ser testável sozinha.
 */

/**
 * "TVs online agora" é presença, não histórico: cinco minutos é o intervalo
 * em que uma tela saudável reporta (ela busca o feed a cada 60 s). O card diz
 * "agora" e o número precisa concordar com isso.
 */
export const DEVICE_ONLINE_WINDOW_MINUTES = 5;

export function onlineSince(now: Date): Date {
  return new Date(now.getTime() - DEVICE_ONLINE_WINDOW_MINUTES * 60 * 1000);
}

/** Nulo (TV que nunca reportou) é offline, não "não sei". */
export function isOnlineAt(lastSeenAt: Date | null, now: Date): boolean {
  return lastSeenAt !== null && lastSeenAt.getTime() >= onlineSince(now).getTime();
}

/** Quanto do histórico de conexão é guardado e mostrado. */
export const SESSION_HISTORY_DAYS = 30;

export function sessionHistorySince(now: Date): Date {
  return new Date(now.getTime() - SESSION_HISTORY_DAYS * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 4: Portal passa a usar a janela comum**

Em `artifacts/api-server/src/lib/portal/overview.ts`, apagar o bloco das linhas 9–18 (o comentário `"TVs online agora" é presença…`, `export const DEVICE_ONLINE_WINDOW_MINUTES = 5;` e a função `onlineSince`) e acrescentar entre os imports:

```ts
import { onlineSince } from "../device-presence";
```

Em `artifacts/api-server/src/lib/portal/queries.ts`, trocar a linha 7:

```ts
import { onlineSince } from "../device-presence";
```

Apagar o teste antigo, coberto pelo novo:

```bash
git rm artifacts/api-server/src/lib/portal/__tests__/overview-window.test.ts
```

- [ ] **Step 5: Rodar**

Run: `pnpm --filter @workspace/api-server test -- device-presence portal`
Expected: PASS em `device-presence.test.ts` e em todos os testes de portal.

- [ ] **Step 6: Teste da versão do app**

Criar `artifacts/api-server/src/lib/__tests__/tv-app-version.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isOutdatedTvApp, tvAppVersionFromUserAgent } from "../tv-app-version";

// O app monta o User-Agent como `<UA do WebView> SignageApp/<versionName>`
// (artifacts/android-tv/.../TvWebViewConfig.kt).
const WEBVIEW =
  "Mozilla/5.0 (Linux; Android 11; TV BOX) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Safari/537.36";

describe("tvAppVersionFromUserAgent", () => {
  it("lê a versão que o app Android anexa", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/1.9.0`)).toBe("1.9.0");
  });

  it("aceita versão de teste com sufixo", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/1.0.1-rc1`)).toBe("1.0.1-rc1");
  });

  it("navegador sem o app não tem versão", () => {
    expect(tvAppVersionFromUserAgent(WEBVIEW)).toBeNull();
  });

  it("User-Agent ausente ou vazio não tem versão", () => {
    expect(tvAppVersionFromUserAgent(undefined)).toBeNull();
    expect(tvAppVersionFromUserAgent(null)).toBeNull();
    expect(tvAppVersionFromUserAgent("")).toBeNull();
  });

  // A rota do feed é pública (basta a key): o que vier aqui vai para o banco
  // e para a tela do admin. Só entra o que tem cara de versão.
  it("recusa versão com mais de 32 caracteres", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/${"1".repeat(33)}`)).toBeNull();
  });

  it("recusa versão com caracteres fora de letras, números, ponto e hífen", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/<script>`)).toBeNull();
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} SignageApp/1.9.0<x`)).toBeNull();
  });

  it("não confunde outro produto que termina com o mesmo nome", () => {
    expect(tvAppVersionFromUserAgent(`${WEBVIEW} NotSignageApp/1.0.0`)).toBeNull();
  });
});

describe("isOutdatedTvApp", () => {
  it("versão menor que a última release é desatualizada", () => {
    expect(isOutdatedTvApp("1.8.2", "1.9.0")).toBe(true);
  });

  it("mesma versão não é desatualizada", () => {
    expect(isOutdatedTvApp("1.9.0", "1.9.0")).toBe(false);
  });

  // Comparação de texto diria que "1.10.0" < "1.9.0".
  it("compara número a número, não como texto", () => {
    expect(isOutdatedTvApp("1.9.0", "1.10.0")).toBe(true);
    expect(isOutdatedTvApp("1.10.0", "1.9.0")).toBe(false);
  });

  it("versão maior que a última release (release apagada) não é desatualizada", () => {
    expect(isOutdatedTvApp("2.0.0", "1.9.0")).toBe(false);
  });

  it("TV sem versão nunca é marcada", () => {
    expect(isOutdatedTvApp(null, "1.9.0")).toBe(false);
  });

  it("sem a última release (GitHub fora) ninguém é marcado", () => {
    expect(isOutdatedTvApp("1.0.0", null)).toBe(false);
  });

  it("versão fora do padrão X.Y.Z nunca é marcada", () => {
    expect(isOutdatedTvApp("1.0.1-rc1", "1.9.0")).toBe(false);
    expect(isOutdatedTvApp("1.9.0", "ultima")).toBe(false);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- tv-app-version`
Expected: FAIL, módulo `../tv-app-version` não existe.

- [ ] **Step 8: Implementar `tv-app-version.ts`**

Criar `artifacts/api-server/src/lib/tv-app-version.ts`:

```ts
/**
 * Versão do app Android da TV. O app anexa `SignageApp/<versionName>` ao
 * User-Agent do WebView (TvWebViewConfig.kt), então toda requisição da TV já
 * diz que versão ela roda — inclusive as TVs instaladas antes desta mudança.
 */

// A rota do feed é pública: o que casar aqui vai para o banco e para a tela
// do admin. Por isso só letras, números, ponto e hífen, até 32 caracteres, e o
// marcador tem de ser uma palavra inteira (não o fim de outro produto).
const MARKER = /(?:^|\s)SignageApp\/([0-9A-Za-z.-]{1,32})(?=\s|$)/;

export function tvAppVersionFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return MARKER.exec(userAgent)?.[1] ?? null;
}

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;

function releaseParts(version: string | null): [number, number, number] | null {
  const match = version ? RELEASE.exec(version) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * Só afirma "desatualizada" quando dá para comparar: as duas versões no
 * padrão X.Y.Z da pipeline de release. Build de teste (`-rc`), TV sem app e
 * GitHub fora do ar ficam sem selo — melhor não marcar do que marcar errado.
 */
export function isOutdatedTvApp(appVersion: string | null, latestVersion: string | null): boolean {
  const current = releaseParts(appVersion);
  const latest = releaseParts(latestVersion);
  if (!current || !latest) return false;
  for (let i = 0; i < 3; i += 1) {
    if (current[i] !== latest[i]) return current[i] < latest[i];
  }
  return false;
}
```

- [ ] **Step 9: Rodar**

Run: `pnpm --filter @workspace/api-server test -- tv-app-version device-presence`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src/lib
git commit -m "feat(api): janela de presença comum e leitura da versão do app da TV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sessões de conexão e captura no feed

**Files:**
- Create: `artifacts/api-server/src/lib/device-sessions.ts`
- Modify: `artifacts/api-server/src/routes/display.ts:16-45`
- Test: `artifacts/api-server/src/lib/__tests__/device-sessions-query.test.ts` (criar)
- Test: `artifacts/api-server/src/lib/__tests__/device-sessions.test.ts` (criar)
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts` (acrescentar)

**Interfaces:**
- Consumes:
  - `deviceSessionsTable` de `@workspace/db` (Task 1).
  - `onlineSince(now: Date): Date`, `sessionHistorySince(now: Date): Date` de `./device-presence` (Task 2).
  - `tvAppVersionFromUserAgent(userAgent: string | null | undefined): string | null` de `../lib/tv-app-version` (Task 2).
- Produces (de `lib/device-sessions.ts`):
  - `touchDeviceSession(deviceId: number, now: Date): Promise<void>`
  - `listDeviceSessions(deviceId: number, now: Date): Promise<Array<{ startedAt: Date; lastSeenAt: Date }>>` — últimos 30 dias, mais nova primeiro.
  - `buildStretchSessionQuery`, `buildOpenSessionQuery`, `buildPruneSessionsQuery`, `buildListSessionsQuery` — todas `(deviceId: number, now: Date)`, devolvem a query do drizzle sem executar.
- Efeito: cada `GET /display/:deviceKey/feed` e `/slides` grava `devices.app_version` e chama `touchDeviceSession`.

- [ ] **Step 1: Teste do SQL das quatro consultas**

Mesmo truque de `device-feed-query.test.ts`: `.toSQL()` só monta o SQL, nunca conecta.

Criar `artifacts/api-server/src/lib/__tests__/device-sessions-query.test.ts`:

```ts
import { afterAll, describe, expect, it } from "vitest";

// `.toSQL()` só monta o SQL, nunca conecta; o DATABASE_URL fictício é só para
// o import de @workspace/db, e é desfeito no fim para não vazar para outro
// arquivo no mesmo worker.
const previousDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";

afterAll(() => {
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

const {
  buildStretchSessionQuery,
  buildOpenSessionQuery,
  buildPruneSessionsQuery,
  buildListSessionsQuery,
} = await import("../device-sessions");

const NOW = new Date("2026-10-02T15:00:00.000Z");
const CINCO_MIN = 5 * 60 * 1000;
const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

// O drizzle entrega o timestamp como Date ou como texto ISO, conforme a
// versão; o que importa aqui é o instante.
const instante = (param: unknown) => new Date(param as string | Date).getTime();

describe("consultas das sessões de conexão", () => {
  it("esticar: só a sessão desta TV vista nos últimos 5 minutos", () => {
    const { sql, params } = buildStretchSessionQuery(7, NOW).toSQL();
    expect(sql).toContain('update "device_sessions" set "last_seen_at" = $1');
    expect(sql).toContain('"device_sessions"."device_id" = $2');
    expect(sql).toContain('"device_sessions"."last_seen_at" >= $3');
    expect(instante(params[0])).toBe(NOW.getTime());
    expect(params[1]).toBe(7);
    expect(instante(params[2])).toBe(NOW.getTime() - CINCO_MIN);
  });

  it("abrir: começo e último contato no mesmo instante", () => {
    const { sql, params } = buildOpenSessionQuery(7, NOW).toSQL();
    expect(sql).toContain('insert into "device_sessions"');
    expect(params).toContain(7);
    expect(params.filter((p) => p !== 7).map(instante)).toEqual([NOW.getTime(), NOW.getTime()]);
  });

  // "Não toca nas de outra TV": o filtro por device_id tem de estar no DELETE.
  it("limpar: só as sessões desta TV com mais de 30 dias", () => {
    const { sql, params } = buildPruneSessionsQuery(7, NOW).toSQL();
    expect(sql).toContain('delete from "device_sessions"');
    expect(sql).toContain('"device_sessions"."device_id" = $1');
    expect(sql).toContain('"device_sessions"."last_seen_at" < $2');
    expect(params[0]).toBe(7);
    expect(instante(params[1])).toBe(NOW.getTime() - TRINTA_DIAS);
  });

  it("listar: últimos 30 dias desta TV, da mais nova para a mais antiga", () => {
    const { sql, params } = buildListSessionsQuery(7, NOW).toSQL();
    expect(sql).toContain('from "device_sessions"');
    expect(sql).toContain('"device_sessions"."device_id" = $1');
    expect(sql).toContain('"device_sessions"."last_seen_at" >= $2');
    expect(sql).toContain('order by "device_sessions"."started_at" desc');
    expect(params[0]).toBe(7);
    expect(instante(params[1])).toBe(NOW.getTime() - TRINTA_DIAS);
  });
});
```

- [ ] **Step 2: Teste do fluxo esticar-ou-abrir**

Criar `artifacts/api-server/src/lib/__tests__/device-sessions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aqui interessa a decisão (esticar a sessão aberta ou abrir outra), não o
 * SQL — esse é conferido em device-sessions-query.test.ts. O mock reproduz só
 * o encadeamento do drizzle e anota qual operação foi executada.
 */
let executadas: string[] = [];
let esticadas: unknown[] = [];
let linhas: unknown[] = [];
const valuesMock = vi.fn();

function makeChain(result: unknown, nome: string) {
  const chain: Record<string, unknown> = {
    set: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    returning: () => chain,
    values: (v: unknown) => {
      valuesMock(v);
      return chain;
    },
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) => {
      executadas.push(nome);
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: {
    update: () => makeChain(esticadas, "update"),
    insert: () => makeChain(undefined, "insert"),
    delete: () => makeChain(undefined, "delete"),
    select: () => makeChain(linhas, "select"),
  },
  deviceSessionsTable: { id: "id", deviceId: "deviceId", startedAt: "startedAt", lastSeenAt: "lastSeenAt" },
}));

const NOW = new Date("2026-10-02T15:00:00.000Z");

beforeEach(() => {
  executadas = [];
  esticadas = [];
  linhas = [];
  valuesMock.mockReset();
});

describe("touchDeviceSession", () => {
  it("com sessão aberta, só estica: não abre outra nem limpa", async () => {
    esticadas = [{ id: 1 }];
    const { touchDeviceSession } = await import("../device-sessions");
    await touchDeviceSession(7, NOW);
    expect(executadas).toEqual(["update"]);
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("sem sessão aberta, abre uma nova e limpa as antigas", async () => {
    esticadas = [];
    const { touchDeviceSession } = await import("../device-sessions");
    await touchDeviceSession(7, NOW);
    expect(executadas).toEqual(["update", "insert", "delete"]);
    expect(valuesMock).toHaveBeenCalledWith({ deviceId: 7, startedAt: NOW, lastSeenAt: NOW });
  });
});

describe("listDeviceSessions", () => {
  it("devolve as linhas da consulta", async () => {
    linhas = [{ startedAt: NOW, lastSeenAt: NOW }];
    const { listDeviceSessions } = await import("../device-sessions");
    expect(await listDeviceSessions(7, NOW)).toEqual(linhas);
    expect(executadas).toEqual(["select"]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- device-sessions`
Expected: FAIL nos dois arquivos, módulo `../device-sessions` não existe.

- [ ] **Step 4: Implementar `device-sessions.ts`**

Criar `artifacts/api-server/src/lib/device-sessions.ts`:

```ts
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db, deviceSessionsTable } from "@workspace/db";
import { onlineSince, sessionHistorySince } from "./device-presence";

/**
 * Sessões de conexão: uma linha por período contínuo em que a TV falou com o
 * servidor. As consultas ficam em funções `build…` separadas para o teste
 * conferir o SQL com `.toSQL()` sem precisar de banco.
 */

/** Estica a sessão em andamento: a que foi vista dentro da janela de presença. */
export function buildStretchSessionQuery(deviceId: number, now: Date) {
  return db
    .update(deviceSessionsTable)
    .set({ lastSeenAt: now })
    .where(and(eq(deviceSessionsTable.deviceId, deviceId), gte(deviceSessionsTable.lastSeenAt, onlineSince(now))))
    .returning({ id: deviceSessionsTable.id });
}

export function buildOpenSessionQuery(deviceId: number, now: Date) {
  return db.insert(deviceSessionsTable).values({ deviceId, startedAt: now, lastSeenAt: now });
}

/** Só as desta TV: a limpeza de uma não pode apagar o histórico de outra. */
export function buildPruneSessionsQuery(deviceId: number, now: Date) {
  return db
    .delete(deviceSessionsTable)
    .where(and(eq(deviceSessionsTable.deviceId, deviceId), lt(deviceSessionsTable.lastSeenAt, sessionHistorySince(now))));
}

export function buildListSessionsQuery(deviceId: number, now: Date) {
  return db
    .select({ startedAt: deviceSessionsTable.startedAt, lastSeenAt: deviceSessionsTable.lastSeenAt })
    .from(deviceSessionsTable)
    .where(and(eq(deviceSessionsTable.deviceId, deviceId), gte(deviceSessionsTable.lastSeenAt, sessionHistorySince(now))))
    .orderBy(desc(deviceSessionsTable.startedAt));
}

/**
 * Chamado a cada feed da TV. Sessão vista dentro da janela → estica. Nenhuma
 * → a TV voltou depois de uma queda (ou é o primeiro contato): abre outra.
 *
 * A limpeza das sessões velhas pega carona na abertura, que é rara (uma por
 * queda), em vez de um job agendado.
 *
 * Duas requisições simultâneas da mesma key podem abrir duas sessões
 * sobrepostas; a linha do tempo do admin junta as que se sobrepõem.
 */
export async function touchDeviceSession(deviceId: number, now: Date): Promise<void> {
  const stretched = await buildStretchSessionQuery(deviceId, now);
  if (stretched.length > 0) return;
  await buildOpenSessionQuery(deviceId, now);
  await buildPruneSessionsQuery(deviceId, now);
}

export async function listDeviceSessions(
  deviceId: number,
  now: Date,
): Promise<Array<{ startedAt: Date; lastSeenAt: Date }>> {
  return buildListSessionsQuery(deviceId, now);
}
```

- [ ] **Step 5: Rodar**

Run: `pnpm --filter @workspace/api-server test -- device-sessions`
Expected: PASS nos dois arquivos.

Se algum `toContain` do Step 1 falhar só por diferença de aspas ou de qualificação da coluna no SQL que o drizzle imprime, ajustar o texto esperado ao SQL real mantendo o que cada asserção prova (coluna, operador e posição do parâmetro). Não afrouxar para `toContain("device_sessions")`.

- [ ] **Step 6: Teste da captura no feed**

Em `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`:

Junto das outras declarações do topo (`const dbSelect = vi.fn();` …), acrescentar:

```ts
const setMock = vi.fn();
const touchDeviceSessionMock = vi.fn();
```

Em `makeChain`, trocar o tipo e a implementação de `set` para guardar o que a rota grava:

```ts
    set: (values?: unknown) => typeof chain;
```

```ts
    set: (values) => {
      setMock(values);
      return chain;
    },
```

Depois do `vi.mock("../../lib/panels/device-slides", …)`, acrescentar:

```ts
// O histórico de conexão tem teste próprio (lib/__tests__/device-sessions*);
// aqui só interessa que a rota o chame e sobreviva à falha dele.
vi.mock("../../lib/device-sessions", () => ({
  touchDeviceSession: (...args: unknown[]) => touchDeviceSessionMock(...args),
}));
```

No fim do arquivo, acrescentar:

```ts
describe("GET /display/:deviceKey/feed — presença e versão do app", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    setMock.mockReset();
    touchDeviceSessionMock.mockReset();
    panelSlidesForClientMock.mockReset();
    panelSlidesForClientMock.mockResolvedValue([]);
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], []];
    selectCallIndex = 0;
  });

  it("grava a versão do app lida do User-Agent", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .get("/display/tv-1/feed")
      .set("User-Agent", "Mozilla/5.0 (Linux; Android 11) SignageApp/1.9.0");

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ lastSeenAt: expect.any(Date), appVersion: "1.9.0" });
  });

  // TV aberta em navegador: a versão anterior não pode ficar parada na tela
  // do admin como se o app ainda estivesse lá.
  it("contato sem o marcador do app grava versão nula", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/display/tv-1/feed").set("User-Agent", "Mozilla/5.0 (SmartTV)");

    expect(setMock).toHaveBeenCalledWith({ lastSeenAt: expect.any(Date), appVersion: null });
  });

  it("registra a sessão com o mesmo instante do lastSeenAt", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/display/tv-1/feed");

    const gravado = setMock.mock.calls[0][0] as { lastSeenAt: Date };
    expect(touchDeviceSessionMock).toHaveBeenCalledWith(DEVICE_ROW.id, gravado.lastSeenAt);
  });

  it("falha ao gravar a sessão não derruba o feed", async () => {
    touchDeviceSessionMock.mockRejectedValue(new Error('relation "device_sessions" does not exist'));
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.status).toBe(200);
    expect((res.body.slides as unknown[]).length).toBe(1);
  });

  it("/slides (tv.html antigo) também registra presença", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    await request(app).get("/display/tv-1/slides").set("User-Agent", "Mozilla/5.0 SignageApp/1.4.2");

    expect(setMock).toHaveBeenCalledWith({ lastSeenAt: expect.any(Date), appVersion: "1.4.2" });
    expect(touchDeviceSessionMock).toHaveBeenCalledTimes(1);
  });

  it("key desconhecida não grava nada", async () => {
    selectResults = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/nao-existe/feed");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
    expect(setMock).not.toHaveBeenCalled();
    expect(touchDeviceSessionMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- display-slides`
Expected: os testes antigos passam; os novos falham (`setMock` chamado só com `lastSeenAt`; `touchDeviceSessionMock` nunca chamado).

- [ ] **Step 8: Captura em `display.ts`**

Em `artifacts/api-server/src/routes/display.ts`, acrescentar aos imports:

```ts
import { touchDeviceSession } from "../lib/device-sessions";
import { tvAppVersionFromUserAgent } from "../lib/tv-app-version";
```

Em `loadForTv`, trocar o bloco do `update` (hoje `await db.update(devicesTable).set({ lastSeenAt: new Date() })…`) por:

```ts
  // Um instante só para a TV e para a sessão: a linha do tempo e o "visto por
  // último" têm de contar a mesma história.
  const now = new Date();

  // A versão é a do último contato, mesmo quando é nula: TV que passou a
  // abrir no navegador não pode seguir mostrando a versão antiga do app.
  await db
    .update(devicesTable)
    .set({ lastSeenAt: now, appVersion: tvAppVersionFromUserAgent(req.get("user-agent")) })
    .where(eq(devicesTable.id, device.id));

  // Histórico é acessório: a TV recebe a rotação mesmo que ele falhe.
  try {
    await touchDeviceSession(device.id, now);
  } catch (err) {
    req.log.error({ err, deviceId: device.id }, "Falha ao registrar a sessão de conexão da TV");
  }
```

Atualizar o comentário da função, trocando `marca a TV como vista` por `marca a TV como vista (presença, versão do app e sessão de conexão)`.

- [ ] **Step 9: Rodar**

Run: `pnpm --filter @workspace/api-server test`
Expected: PASS em toda a suíte da API.

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src/lib/device-sessions.ts artifacts/api-server/src/lib/__tests__ artifacts/api-server/src/routes/display.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts
git commit -m "feat(tv): feed registra versão do app e sessão de conexão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Contrato e rotas `GET /fleet` e `GET /devices/:id/sessions`

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerado: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`
- Create: `artifacts/api-server/src/routes/fleet.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/routes/__tests__/fleet.test.ts` (criar)
- Test: `artifacts/api-server/src/routes/__tests__/gate.test.ts` (acrescentar)

**Interfaces:**
- Consumes:
  - `isOnlineAt(lastSeenAt: Date | null, now: Date): boolean` de `../lib/device-presence` (Task 2).
  - `isOutdatedTvApp(appVersion: string | null, latestVersion: string | null): boolean` de `../lib/tv-app-version` (Task 2).
  - `listDeviceSessions(deviceId: number, now: Date): Promise<Array<{ startedAt: Date; lastSeenAt: Date }>>` de `../lib/device-sessions` (Task 3).
  - `latestTvAppRelease(): Promise<{ versionName: string; … }>` de `../lib/tv-app-release` (já existe; lança quando o GitHub não responde).
- Produces:
  - `GET /api/fleet` → `{ latestVersion: string | null, devices: FleetDevice[] }`, onde `FleetDevice = { id, clientId, clientName, name, location: string | null, showcase, lastSeenAt: string | null, isOnline, appVersion: string | null, outdated }`.
  - `GET /api/devices/:id/sessions` → `{ isOnline: boolean, sessions: Array<{ startedAt: string; lastSeenAt: string }> }`; `404 {"error":"Device not found"}`.
  - Zod gerado: `GetFleetResponse`, `GetDeviceSessionsParams`, `GetDeviceSessionsResponse`.
  - Cliente gerado (`@workspace/api-client-react`): `useGetFleet`, `getGetFleetQueryKey`, `useGetDeviceSessions`, `getGetDeviceSessionsQueryKey`.

- [ ] **Step 1: Contrato no openapi**

Em `lib/api-spec/openapi.yaml`:

Em `paths`, logo depois do bloco `/devices/{id}/preview:` (e antes de `/devices/{id}/playlist/add:`):

```yaml
  /devices/{id}/sessions:
    get:
      operationId: getDeviceSessions
      tags: [devices]
      summary: Períodos em que a TV esteve conectada nos últimos 30 dias
      parameters:
        - { name: id, in: path, required: true, schema: { type: integer } }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DeviceSessions"
        "404":
          description: Not found

  /fleet:
    get:
      operationId: getFleet
      tags: [devices]
      summary: Parque de TVs — presença e versão do app de todas as telas
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Fleet"
```

Em `components.schemas`, logo depois do schema `DeviceUpdate`:

```yaml
    # ── Parque de TVs ────────────────────────────────────────────────────────
    FleetDevice:
      type: object
      required: [id, clientId, clientName, name, location, showcase, lastSeenAt, isOnline, appVersion, outdated]
      properties:
        id: { type: integer }
        clientId: { type: integer }
        clientName: { type: string }
        name: { type: string }
        location: { type: ["string", "null"] }
        showcase: { type: boolean }
        lastSeenAt: { type: ["string", "null"], format: date-time }
        # Calculado no servidor: falou nos últimos 5 minutos.
        isOnline: { type: boolean }
        # Versão do app no último contato. Nulo = navegador, ou nunca conectou.
        appVersion: { type: ["string", "null"] }
        # Versão X.Y.Z menor que a da última release.
        outdated: { type: boolean }

    Fleet:
      type: object
      required: [latestVersion, devices]
      properties:
        # Nulo quando o GitHub não respondeu: nenhuma TV sai marcada.
        latestVersion: { type: ["string", "null"] }
        devices:
          type: array
          items:
            $ref: "#/components/schemas/FleetDevice"

    DeviceSession:
      type: object
      required: [startedAt, lastSeenAt]
      properties:
        startedAt: { type: string, format: date-time }
        lastSeenAt: { type: string, format: date-time }

    DeviceSessions:
      type: object
      required: [isOnline, sessions]
      properties:
        # Do relógio do servidor: diz se a sessão mais recente segue em andamento.
        isOnline: { type: boolean }
        sessions:
          type: array
          items:
            $ref: "#/components/schemas/DeviceSession"
```

- [ ] **Step 2: Regenerar os clientes**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro (roda o orval e o `typecheck:libs`).

Run: `grep -n "GetFleetResponse\|GetDeviceSessionsParams\|GetDeviceSessionsResponse" lib/api-zod/src/generated/api.ts | head; grep -n "export function useGetFleet\|export const getGetFleetQueryKey\|export function useGetDeviceSessions\|export const getGetDeviceSessionsQueryKey" lib/api-client-react/src/generated/api.ts`
Expected: os três schemas zod e os quatro símbolos do cliente aparecem.

- [ ] **Step 3: Teste das rotas**

Criar `artifacts/api-server/src/routes/__tests__/fleet.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetDeviceSessionsResponse, GetFleetResponse } from "@workspace/api-zod";

/**
 * As duas rotas só leem. O mock reproduz o encadeamento do drizzle que elas
 * usam (select().from().innerJoin().where()/.orderBy()), como em
 * device-update.test.ts; cada select consome um item da fila.
 */
let selectQueue: unknown[][] = [];
const latestTvAppReleaseMock = vi.fn();
const listDeviceSessionsMock = vi.fn();

function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

vi.mock("@workspace/db", () => ({
  db: { select: () => makeChain(selectQueue.shift() ?? []) },
  devicesTable: {
    id: "id", clientId: "clientId", name: "name", location: "location",
    showcase: "showcase", lastSeenAt: "lastSeenAt", appVersion: "appVersion",
  },
  clientsTable: { id: "id", companyId: "companyId" },
  companiesTable: { id: "id", name: "name" },
}));

vi.mock("../../lib/tv-app-release", () => ({
  latestTvAppRelease: (...args: unknown[]) => latestTvAppReleaseMock(...args),
}));

vi.mock("../../lib/device-sessions", () => ({
  listDeviceSessions: (...args: unknown[]) => listDeviceSessionsMock(...args),
}));

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../fleet");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(router);
  return app;
}

const minutosAtras = (min: number) => new Date(Date.now() - min * 60 * 1000);

function tv(over: Record<string, unknown>) {
  return {
    id: 1, clientId: 7, clientName: "Padaria Central", name: "TV do balcão", location: null,
    showcase: false, lastSeenAt: minutosAtras(1), appVersion: "1.9.0",
    ...over,
  };
}

async function get(path: string) {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return request(app).get(path);
}

beforeEach(() => {
  selectQueue = [];
  latestTvAppReleaseMock.mockReset();
  listDeviceSessionsMock.mockReset();
  latestTvAppReleaseMock.mockResolvedValue({ versionName: "1.9.0" });
});

describe("GET /fleet", () => {
  it("marca online quem falou nos últimos 5 minutos", async () => {
    selectQueue = [[
      tv({ id: 1, lastSeenAt: minutosAtras(1) }),
      tv({ id: 2, lastSeenAt: minutosAtras(10) }),
      tv({ id: 3, lastSeenAt: null, appVersion: null }),
    ]];
    const res = await get("/fleet");

    expect(res.status).toBe(200);
    expect(res.body.devices.map((d: { id: number; isOnline: boolean }) => [d.id, d.isOnline])).toEqual([
      [1, true],
      [2, false],
      [3, false],
    ]);
    expect(() => GetFleetResponse.parse(res.body)).not.toThrow();
  });

  it("marca desatualizada a TV com versão menor que a última release", async () => {
    selectQueue = [[
      tv({ id: 1, appVersion: "1.9.0" }),
      tv({ id: 2, appVersion: "1.8.2" }),
      tv({ id: 3, appVersion: null }),
      tv({ id: 4, appVersion: "1.0.1-rc1" }),
    ]];
    const res = await get("/fleet");

    expect(res.body.latestVersion).toBe("1.9.0");
    expect(res.body.devices.map((d: { id: number; outdated: boolean }) => [d.id, d.outdated])).toEqual([
      [1, false],
      [2, true],
      [3, false],
      [4, false],
    ]);
  });

  // GitHub fora não pode esconder o parque: é quando o admin mais precisa dele.
  it("com o GitHub fora, responde 200 sem marcar ninguém", async () => {
    latestTvAppReleaseMock.mockRejectedValue(new Error("Falha ao ler update.json"));
    selectQueue = [[tv({ appVersion: "1.0.0" })]];
    const res = await get("/fleet");

    expect(res.status).toBe(200);
    expect(res.body.latestVersion).toBeNull();
    expect(res.body.devices[0].outdated).toBe(false);
    expect(res.body.devices[0].appVersion).toBe("1.0.0");
  });

  it("devolve a vitrine marcada", async () => {
    selectQueue = [[tv({ id: 9, showcase: true })]];
    const res = await get("/fleet");
    expect(res.body.devices[0].showcase).toBe(true);
  });

  it("parque vazio responde lista vazia", async () => {
    selectQueue = [[]];
    const res = await get("/fleet");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ latestVersion: "1.9.0", devices: [] });
  });
});

describe("GET /devices/:id/sessions", () => {
  it("devolve as sessões e se a TV está online agora", async () => {
    selectQueue = [[{ id: 1, lastSeenAt: minutosAtras(1) }]];
    const startedAt = minutosAtras(120);
    const lastSeenAt = minutosAtras(1);
    listDeviceSessionsMock.mockResolvedValue([{ startedAt, lastSeenAt }]);
    const res = await get("/devices/1/sessions");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      isOnline: true,
      sessions: [{ startedAt: startedAt.toISOString(), lastSeenAt: lastSeenAt.toISOString() }],
    });
    expect(listDeviceSessionsMock).toHaveBeenCalledWith(1, expect.any(Date));
    expect(() => GetDeviceSessionsResponse.parse(res.body)).not.toThrow();
  });

  it("TV offline devolve isOnline falso", async () => {
    selectQueue = [[{ id: 1, lastSeenAt: minutosAtras(30) }]];
    listDeviceSessionsMock.mockResolvedValue([]);
    const res = await get("/devices/1/sessions");
    expect(res.body).toEqual({ isOnline: false, sessions: [] });
  });

  it("TV inexistente responde 404 sem consultar sessões", async () => {
    selectQueue = [[]];
    const res = await get("/devices/99/sessions");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Device not found" });
    expect(listDeviceSessionsMock).not.toHaveBeenCalled();
  });

  it("id que não é número responde 400", async () => {
    const res = await get("/devices/abc/sessions");
    expect(res.status).toBe(400);
    expect(listDeviceSessionsMock).not.toHaveBeenCalled();
  });
});
```

Em `artifacts/api-server/src/routes/__tests__/gate.test.ts`, dentro do `describe("porteiro de rotas", …)`, depois do teste `protege /api/devices/by-key sem login`:

```ts
  it("protege /api/fleet sem login", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/fleet");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });

  it("protege /api/devices/:id/sessions sem login", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).get("/api/devices/1/sessions");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server test -- fleet gate`
Expected: `fleet.test.ts` FAIL (módulo `../fleet` não existe). Os dois testes novos do `gate.test.ts` passam por acaso (rota inexistente depois de `requireAdmin` já responde 401) — eles valem a partir do Step 6, para pegar quem registrar o router acima do porteiro.

- [ ] **Step 5: Implementar `routes/fleet.ts`**

Criar `artifacts/api-server/src/routes/fleet.ts`:

```ts
import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import { GetDeviceSessionsParams, GetDeviceSessionsResponse, GetFleetResponse } from "@workspace/api-zod";
import { isOnlineAt } from "../lib/device-presence";
import { listDeviceSessions } from "../lib/device-sessions";
import { latestTvAppRelease } from "../lib/tv-app-release";
import { isOutdatedTvApp } from "../lib/tv-app-version";

const router: IRouter = Router();

/**
 * Parque de TVs: a foto do agora. `isOnline` e `outdated` saem daqui, e não do
 * navegador, para que o card de contagem e o selo de cada linha venham do
 * mesmo relógio e da mesma release.
 */
router.get("/fleet", async (req, res): Promise<void> => {
  const now = new Date();

  const rows = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      clientName: companiesTable.name,
      name: devicesTable.name,
      location: devicesTable.location,
      showcase: devicesTable.showcase,
      lastSeenAt: devicesTable.lastSeenAt,
      appVersion: devicesTable.appVersion,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .orderBy(asc(devicesTable.name));

  // GitHub fora não pode esconder o parque: sem a última versão, ninguém é
  // marcado como desatualizado e o resto da página segue valendo.
  let latestVersion: string | null = null;
  try {
    latestVersion = (await latestTvAppRelease()).versionName;
  } catch (err) {
    req.log.warn({ err }, "Última versão do app indisponível; parque sem selo de desatualizada");
  }

  res.json(
    GetFleetResponse.parse({
      latestVersion,
      devices: rows.map((row) => ({
        ...row,
        isOnline: isOnlineAt(row.lastSeenAt, now),
        outdated: isOutdatedTvApp(row.appVersion, latestVersion),
      })),
    }),
  );
});

// Histórico de conexão de uma TV. Fica aqui, e não em devices.ts, porque é
// leitura de presença como a rota de cima.
router.get("/devices/:id/sessions", async (req, res): Promise<void> => {
  const params = GetDeviceSessionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [device] = await db
    .select({ id: devicesTable.id, lastSeenAt: devicesTable.lastSeenAt })
    .from(devicesTable)
    .where(eq(devicesTable.id, params.data.id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const now = new Date();
  const sessions = await listDeviceSessions(device.id, now);
  res.json(GetDeviceSessionsResponse.parse({ isOnline: isOnlineAt(device.lastSeenAt, now), sessions }));
});

export default router;
```

- [ ] **Step 6: Registrar o router**

Em `artifacts/api-server/src/routes/index.ts`, junto dos outros imports de router:

```ts
import fleetRouter from "./fleet";
```

E logo depois de `router.use(devicesRouter);` (portanto depois de `router.use(requireAdmin);`):

```ts
router.use(fleetRouter);
```

- [ ] **Step 7: Rodar**

Run: `pnpm --filter @workspace/api-server test`
Expected: PASS em toda a suíte da API.

Run: `pnpm run typecheck`
Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/src/routes
git commit -m "feat(api): rotas do parque de TVs e do histórico de conexão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Histórico de conexão no detalhe da TV

**Files:**
- Create: `artifacts/signage/src/lib/connection-timeline.ts`
- Create: `artifacts/signage/src/components/device-connection-history.tsx`
- Modify: `artifacts/signage/src/pages/device-detail.tsx`
- Test: `artifacts/signage/src/lib/__tests__/connection-timeline.test.ts` (criar)
- Test: `artifacts/signage/src/components/__tests__/device-connection-history.test.tsx` (criar)
- Test: `artifacts/signage/src/pages/__tests__/device-detail.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `useGetDeviceSessions(id, { query })` e `getGetDeviceSessionsQueryKey(id)` de `@workspace/api-client-react` (Task 4). Resposta: `{ isOnline: boolean; sessions: Array<{ startedAt: string; lastSeenAt: string }> }`.
- Produces:
  - `buildConnectionTimeline(sessions: SessionSpan[], isOnline: boolean, now: Date): TimelineEntry[]` — mais recente primeiro.
  - `interface SessionSpan { startedAt: string; lastSeenAt: string }`
  - `interface TimelineEntry { kind: 'online' | 'offline'; from: Date; to: Date; open: boolean }` — `open` = segue até agora.
  - `formatSpan(ms: number): string`, `formatMoment(date: Date, now: Date): string`.
  - `<DeviceConnectionHistory deviceId={number} />`.

- [ ] **Step 1: Teste da linha do tempo**

Criar `artifacts/signage/src/lib/__tests__/connection-timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildConnectionTimeline, formatMoment, formatSpan } from '../connection-timeline';

const NOW = new Date('2026-10-02T15:00:00.000Z');
const iso = (s: string) => new Date(s).toISOString();

// Ontem das 08:00 às 22:00 e hoje das 08:00 até agora há pouco (UTC, só para
// o teste: a função trabalha com instantes, não com hora de parede).
const ONTEM = { startedAt: iso('2026-10-01T08:00:00Z'), lastSeenAt: iso('2026-10-01T22:00:00Z') };
const HOJE = { startedAt: iso('2026-10-02T08:00:00Z'), lastSeenAt: iso('2026-10-02T14:59:30Z') };

function resumo(entries: ReturnType<typeof buildConnectionTimeline>) {
  return entries.map((e) => [e.kind, e.from.toISOString(), e.to.toISOString(), e.open]);
}

describe('buildConnectionTimeline', () => {
  it('sem sessões não há linha do tempo', () => {
    expect(buildConnectionTimeline([], false, NOW)).toEqual([]);
  });

  // Vitrine, TV vista antes do deploy ou gravação de sessão que falhou: a TV
  // está online mas não há o que mostrar. Não inventa queda.
  it('TV online sem sessão registrada segue sem linha do tempo', () => {
    expect(buildConnectionTimeline([], true, NOW)).toEqual([]);
  });

  it('TV online: a sessão mais recente vai até agora', () => {
    expect(resumo(buildConnectionTimeline([HOJE, ONTEM], true, NOW))).toEqual([
      ['online', HOJE.startedAt, NOW.toISOString(), true],
      ['offline', ONTEM.lastSeenAt, HOJE.startedAt, false],
      ['online', ONTEM.startedAt, ONTEM.lastSeenAt, false],
    ]);
  });

  it('TV offline: abre um "fora do ar" do último contato até agora', () => {
    expect(resumo(buildConnectionTimeline([ONTEM], false, NOW))).toEqual([
      ['offline', ONTEM.lastSeenAt, NOW.toISOString(), true],
      ['online', ONTEM.startedAt, ONTEM.lastSeenAt, false],
    ]);
  });

  it('a ordem de entrada não importa', () => {
    expect(resumo(buildConnectionTimeline([ONTEM, HOJE], true, NOW))).toEqual(
      resumo(buildConnectionTimeline([HOJE, ONTEM], true, NOW)),
    );
  });

  // Mesma key em duas telas: duas sessões ao mesmo tempo. Sem juntar, sairia
  // um "fora do ar" de duração negativa entre elas.
  it('sessões sobrepostas viram um período só', () => {
    const a = { startedAt: iso('2026-10-02T08:00:00Z'), lastSeenAt: iso('2026-10-02T12:00:00Z') };
    const b = { startedAt: iso('2026-10-02T11:00:00Z'), lastSeenAt: iso('2026-10-02T13:00:00Z') };
    expect(resumo(buildConnectionTimeline([a, b], false, NOW))).toEqual([
      ['offline', b.lastSeenAt, NOW.toISOString(), true],
      ['online', a.startedAt, b.lastSeenAt, false],
    ]);
  });

  it('sessão inteira dentro de outra não encurta o período', () => {
    const fora = { startedAt: iso('2026-10-02T08:00:00Z'), lastSeenAt: iso('2026-10-02T13:00:00Z') };
    const dentro = { startedAt: iso('2026-10-02T09:00:00Z'), lastSeenAt: iso('2026-10-02T10:00:00Z') };
    expect(resumo(buildConnectionTimeline([dentro, fora], false, NOW))).toEqual([
      ['offline', fora.lastSeenAt, NOW.toISOString(), true],
      ['online', fora.startedAt, fora.lastSeenAt, false],
    ]);
  });

  it('nenhum período tem duração negativa', () => {
    const entries = buildConnectionTimeline([HOJE, ONTEM, { ...ONTEM }], true, NOW);
    for (const e of entries) expect(e.to.getTime()).toBeGreaterThanOrEqual(e.from.getTime());
  });

  it('sessão com data inválida é descartada', () => {
    const ruim = { startedAt: 'não é data', lastSeenAt: ONTEM.lastSeenAt };
    expect(resumo(buildConnectionTimeline([ruim, ONTEM], false, NOW))).toEqual(
      resumo(buildConnectionTimeline([ONTEM], false, NOW)),
    );
  });
});

describe('formatSpan', () => {
  it('escreve a duração do jeito que se fala', () => {
    expect(formatSpan(20 * 1000)).toBe('menos de 1 min');
    expect(formatSpan(45 * 60 * 1000)).toBe('45 min');
    expect(formatSpan((14 * 60 + 9) * 60 * 1000)).toBe('14h09');
    expect(formatSpan((2 * 24 + 3) * 60 * 60 * 1000)).toBe('2d 3h');
  });

  it('duração negativa vira "menos de 1 min", não número negativo', () => {
    expect(formatSpan(-5000)).toBe('menos de 1 min');
  });
});

describe('formatMoment', () => {
  // Datas montadas na hora local de propósito: o rótulo é na hora de quem lê.
  const agora = new Date(2026, 9, 2, 15, 0);

  it('hoje, ontem e dias anteriores', () => {
    expect(formatMoment(new Date(2026, 9, 2, 8, 2), agora)).toBe('hoje 08:02');
    expect(formatMoment(new Date(2026, 9, 1, 22, 10), agora)).toBe('ontem 22:10');
    expect(formatMoment(new Date(2026, 8, 28, 8, 1), agora)).toBe('28/09 08:01');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- connection-timeline`
Expected: FAIL, módulo `../connection-timeline` não existe.

- [ ] **Step 3: Implementar `connection-timeline.ts`**

Criar `artifacts/signage/src/lib/connection-timeline.ts`:

```ts
/**
 * Linha do tempo de conexão de uma TV. O servidor guarda só os períodos no ar
 * (sessões); os períodos fora do ar são os buracos entre eles, calculados
 * aqui.
 */

export interface SessionSpan {
  startedAt: string;
  lastSeenAt: string;
}

export interface TimelineEntry {
  kind: 'online' | 'offline';
  from: Date;
  to: Date;
  /** O período segue até agora (não tem fim registrado). */
  open: boolean;
}

/**
 * Junta sessões que se sobrepõem ou se encostam. Acontece quando a mesma key
 * está aberta em duas telas; sem isto sairia um "fora do ar" de duração
 * negativa entre as duas.
 */
function mergeSpans(sessions: SessionSpan[]): Array<{ start: number; end: number }> {
  const spans = sessions
    .map((s) => ({ start: new Date(s.startedAt).getTime(), end: new Date(s.lastSeenAt).getTime() }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Do mais recente para o mais antigo. `isOnline` vem do servidor: decide se a
 * sessão mais recente segue em andamento ou se já há uma queda aberta depois
 * dela. Sem sessão registrada não há o que mostrar — nem queda inventada.
 */
export function buildConnectionTimeline(sessions: SessionSpan[], isOnline: boolean, now: Date): TimelineEntry[] {
  const spans = mergeSpans(sessions);
  if (spans.length === 0) return [];

  const nowMs = now.getTime();
  const entries: TimelineEntry[] = [];

  spans.forEach((span, i) => {
    const isLast = i === spans.length - 1;
    const ongoing = isLast && isOnline;
    entries.push({
      kind: 'online',
      from: new Date(span.start),
      // Relógio do navegador atrasado não pode encolher a sessão em andamento.
      to: new Date(ongoing ? Math.max(nowMs, span.end) : span.end),
      open: ongoing,
    });
    if (!isLast) {
      entries.push({ kind: 'offline', from: new Date(span.end), to: new Date(spans[i + 1].start), open: false });
    } else if (!isOnline) {
      entries.push({ kind: 'offline', from: new Date(span.end), to: new Date(Math.max(nowMs, span.end)), open: true });
    }
  });

  return entries.reverse();
}

export function formatSpan(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "hoje 08:02", "ontem 22:10", "28/09 08:01" — na hora de quem lê. */
export function formatMoment(date: Date, now: Date): string {
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(date, now)) return `hoje ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return `ontem ${time}`;
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}
```

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @workspace/signage test -- connection-timeline`
Expected: PASS.

- [ ] **Step 5: Teste do componente**

Criar `artifacts/signage/src/components/__tests__/device-connection-history.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceConnectionHistory } from '../device-connection-history';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function stubSessions(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DeviceConnectionHistory deviceId={1} />
    </QueryClientProvider>,
  );
}

const horasAtras = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

afterEach(() => vi.unstubAllGlobals());

describe('DeviceConnectionHistory', () => {
  it('busca as sessões da TV', async () => {
    const fetchMock = stubSessions({ isOnline: false, sessions: [] });
    renderHistory();
    await screen.findByText(/Nenhuma conexão registrada/);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/devices/1/sessions');
  });

  it('alterna períodos no ar e fora do ar, com a duração de cada um', async () => {
    stubSessions({
      isOnline: true,
      sessions: [
        { startedAt: horasAtras(2), lastSeenAt: horasAtras(0) },
        { startedAt: horasAtras(26), lastSeenAt: horasAtras(12) },
      ],
    });
    renderHistory();

    expect(await screen.findAllByText('No ar')).toHaveLength(2);
    expect(screen.getAllByText('Fora do ar')).toHaveLength(1);
    // Sessão em andamento vai "até agora"; a queda entre as duas durou 10 h e
    // a sessão antiga, 14 h.
    expect(screen.getByText(/→ agora/)).toBeInTheDocument();
    expect(screen.getByText('(10h00)')).toBeInTheDocument();
    expect(screen.getByText('(14h00)')).toBeInTheDocument();
  });

  it('TV offline mostra a queda em aberto no topo', async () => {
    stubSessions({ isOnline: false, sessions: [{ startedAt: horasAtras(30), lastSeenAt: horasAtras(20) }] });
    renderHistory();

    const itens = await screen.findAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Fora do ar');
    expect(itens[0]).toHaveTextContent('→ agora');
    expect(itens[1]).toHaveTextContent('No ar');
  });

  it('sem sessão registrada explica que o registro é recente', async () => {
    stubSessions({ isOnline: true, sessions: [] });
    renderHistory();
    expect(await screen.findByText(/Nenhuma conexão registrada nos últimos 30 dias/)).toBeInTheDocument();
    expect(screen.queryByText('Fora do ar')).not.toBeInTheDocument();
  });

  // Resposta fora do contrato (proxy, versão antiga da API em cache): a
  // página da TV não pode cair por causa do histórico.
  it('resposta sem a lista de sessões cai no estado vazio', async () => {
    stubSessions({ qualquer: 'coisa' });
    renderHistory();
    expect(await screen.findByText(/Nenhuma conexão registrada/)).toBeInTheDocument();
  });

  it('erro da API mostra o aviso, sem derrubar a página', async () => {
    stubSessions({ error: 'boom' }, 500);
    renderHistory();
    expect(await screen.findByText('Não foi possível carregar o histórico.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- device-connection-history`
Expected: FAIL, módulo `../device-connection-history` não existe.

- [ ] **Step 7: Implementar o componente**

Criar `artifacts/signage/src/components/device-connection-history.tsx`:

```tsx
import { useGetDeviceSessions, getGetDeviceSessionsQueryKey } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { buildConnectionTimeline, formatMoment, formatSpan } from '@/lib/connection-timeline';

/**
 * Linha do tempo de quedas da TV. Sem percentual de propósito: loja que
 * desliga a TV à noite aparece fora do ar, e quem olha julga se foi problema.
 */
export function DeviceConnectionHistory({ deviceId }: { deviceId: number }) {
  // Mesmo ritmo do player: a TV fala com o servidor a cada 60 s.
  const { data, isLoading, isError } = useGetDeviceSessions(deviceId, {
    query: { enabled: !!deviceId, queryKey: getGetDeviceSessionsQueryKey(deviceId), refetchInterval: 60_000 },
  });

  const now = new Date();
  // `?? []`: resposta fora do contrato não pode derrubar a página da TV.
  const timeline = buildConnectionTimeline(data?.sessions ?? [], data?.isOnline ?? false, now);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de conexão</CardTitle>
        <p className="text-sm text-muted-foreground">
          Últimos 30 dias. Quedas de menos de 5 minutos não aparecem.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : isError ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
        ) : timeline.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma conexão registrada nos últimos 30 dias. O registro de conexões começou em outubro de 2026.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {timeline.map((entry) => (
              <li key={`${entry.kind}-${entry.from.getTime()}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="flex w-28 items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className={cn(
                      'h-2 w-2 rounded-full',
                      entry.kind === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40',
                    )}
                  />
                  <span>{entry.kind === 'online' ? 'No ar' : 'Fora do ar'}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoment(entry.from, now)} → {entry.open ? 'agora' : formatMoment(entry.to, now)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  ({formatSpan(entry.to.getTime() - entry.from.getTime())})
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Rodar**

Run: `pnpm --filter @workspace/signage test -- device-connection-history`
Expected: PASS.

- [ ] **Step 9: Teste da seção no detalhe da TV**

Em `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`, acrescentar no fim do arquivo:

```tsx
describe('histórico de conexão', () => {
  it('a página da TV mostra a linha do tempo de conexão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        // Antes de '/devices/1': a URL das sessões também contém esse trecho.
        if (url.includes('/sessions')) {
          return json({
            isOnline: false,
            sessions: [{ startedAt: '2026-10-01T08:00:00.000Z', lastSeenAt: '2026-10-01T22:00:00.000Z' }],
          });
        }
        if (url.includes('/playlist')) return json([]);
        if (url.includes('/preview')) return json([]);
        if (url.includes('/announcements')) return json([]);
        if (url.includes('/devices/1')) return json(DEVICE);
        return json([]);
      }),
    );
    renderPagina();

    expect(await screen.findByText('Histórico de conexão')).toBeInTheDocument();
    expect(await screen.findByText('No ar')).toBeInTheDocument();
    expect(screen.getByText('Fora do ar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- device-detail`
Expected: o teste novo falha (`Histórico de conexão` não está na página); os antigos passam.

- [ ] **Step 11: Usar o componente em `device-detail.tsx`**

Em `artifacts/signage/src/pages/device-detail.tsx`, junto do import do `DeviceMusicField`:

```tsx
import { DeviceConnectionHistory } from '@/components/device-connection-history';
```

No `return` do componente `DeviceDetail`, logo depois do `</div>` que fecha o grid `<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">` (a última seção da página, depois da prévia da TV) e antes do `</div>` final:

```tsx
      {/* No fim da página: é consulta, não ajuste — não pode empurrar a
          playlist e a prévia para baixo. */}
      <div className="mt-8">
        <DeviceConnectionHistory deviceId={deviceId} />
      </div>
```

- [ ] **Step 12: Rodar**

Run: `pnpm --filter @workspace/signage test -- device-detail device-connection-history connection-timeline`
Expected: PASS, inclusive os testes antigos do `device-detail` (neles a URL das sessões devolve o objeto da TV, sem `sessions`, e a seção cai no estado vazio).

- [ ] **Step 13: Commit**

```bash
git add artifacts/signage/src/lib/connection-timeline.ts artifacts/signage/src/lib/__tests__/connection-timeline.test.ts artifacts/signage/src/components/device-connection-history.tsx artifacts/signage/src/components/__tests__/device-connection-history.test.tsx artifacts/signage/src/pages/device-detail.tsx artifacts/signage/src/pages/__tests__/device-detail.test.tsx
git commit -m "feat(portal): histórico de conexão no detalhe da TV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Página `/parque`

**Files:**
- Create: `artifacts/signage/src/lib/fleet.ts`
- Create: `artifacts/signage/src/pages/fleet.tsx`
- Modify: `artifacts/signage/src/App.tsx`
- Modify: `artifacts/signage/src/components/layout.tsx`
- Test: `artifacts/signage/src/lib/__tests__/fleet.test.ts` (criar)
- Test: `artifacts/signage/src/pages/__tests__/fleet.test.tsx` (criar)

**Interfaces:**
- Consumes: `useGetFleet({ query })` e `getGetFleetQueryKey()` de `@workspace/api-client-react` (Task 4). Resposta: `{ latestVersion: string | null; devices: FleetRow[] }`.
- Produces (de `lib/fleet.ts`):
  - `interface FleetRow { id: number; clientName: string; name: string; location: string | null; showcase: boolean; lastSeenAt: string | null; isOnline: boolean; appVersion: string | null; outdated: boolean }`
  - `type FleetFilter = 'all' | 'online' | 'offline' | 'outdated'`
  - `fleetCounts(devices: FleetRow[]): { total: number; online: number; offline: number; outdated: number }`
  - `versionsInUse(devices: FleetRow[]): Array<{ version: string | null; count: number }>`
  - `filterFleet(devices: FleetRow[], filter: FleetFilter): FleetRow[]`
  - `lastSeenLabel(lastSeenAt: string | null, now: Date): string`

- [ ] **Step 1: Teste das funções do parque**

Criar `artifacts/signage/src/lib/__tests__/fleet.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterFleet, fleetCounts, lastSeenLabel, versionsInUse, type FleetRow } from '../fleet';

function tv(over: Partial<FleetRow>): FleetRow {
  return {
    id: 1, clientName: 'Padaria Central', name: 'TV', location: null, showcase: false,
    lastSeenAt: '2026-10-02T14:59:00.000Z', isOnline: true, appVersion: '1.9.0', outdated: false,
    ...over,
  };
}

const PARQUE: FleetRow[] = [
  tv({ id: 1, name: 'Balcão', isOnline: true, appVersion: '1.9.0' }),
  tv({ id: 2, name: 'Açougue', isOnline: false, appVersion: '1.8.2', outdated: true }),
  tv({ id: 3, name: 'Caixa', isOnline: true, appVersion: '1.10.0' }),
  tv({ id: 4, name: 'Entrada', isOnline: false, appVersion: null, lastSeenAt: null }),
  tv({ id: 5, name: 'Vitrine', isOnline: true, appVersion: null, showcase: true }),
];

describe('fleetCounts', () => {
  it('conta o parque sem a vitrine da landing', () => {
    expect(fleetCounts(PARQUE)).toEqual({ total: 4, online: 2, offline: 2, outdated: 1 });
  });

  it('parque vazio é tudo zero', () => {
    expect(fleetCounts([])).toEqual({ total: 0, online: 0, offline: 0, outdated: 0 });
  });
});

describe('versionsInUse', () => {
  // Ordenado como texto, "1.10.0" ficaria abaixo de "1.9.0". A ordem tem de
  // ser numérica.
  it('agrupa por versão, a mais nova primeiro, e deixa o navegador por último', () => {
    expect(versionsInUse(PARQUE)).toEqual([
      { version: '1.10.0', count: 1 },
      { version: '1.9.0', count: 1 },
      { version: '1.8.2', count: 1 },
      { version: null, count: 1 },
    ]);
  });

  it('versão fora do padrão entra depois das de release, sem quebrar a ordem', () => {
    const parque = [tv({ id: 1, appVersion: '1.0.1-rc1' }), tv({ id: 2, appVersion: '1.9.0' }), tv({ id: 3, appVersion: '1.9.0' })];
    expect(versionsInUse(parque)).toEqual([
      { version: '1.9.0', count: 2 },
      { version: '1.0.1-rc1', count: 1 },
    ]);
  });

  it('não conta a vitrine', () => {
    expect(versionsInUse([tv({ showcase: true })])).toEqual([]);
  });
});

describe('filterFleet', () => {
  const nomes = (rows: FleetRow[]) => rows.map((r) => r.name);

  it('"todas" põe as offline primeiro e ordena por nome dentro de cada grupo', () => {
    expect(nomes(filterFleet(PARQUE, 'all'))).toEqual(['Açougue', 'Entrada', 'Balcão', 'Caixa', 'Vitrine']);
  });

  it('filtra por online, offline e desatualizadas', () => {
    expect(nomes(filterFleet(PARQUE, 'online'))).toEqual(['Balcão', 'Caixa', 'Vitrine']);
    expect(nomes(filterFleet(PARQUE, 'offline'))).toEqual(['Açougue', 'Entrada']);
    expect(nomes(filterFleet(PARQUE, 'outdated'))).toEqual(['Açougue']);
  });

  it('não altera a lista recebida', () => {
    const antes = nomes(PARQUE);
    filterFleet(PARQUE, 'all');
    expect(nomes(PARQUE)).toEqual(antes);
  });
});

describe('lastSeenLabel', () => {
  const NOW = new Date('2026-10-02T15:00:00.000Z');

  it('escreve o tempo desde o último contato', () => {
    expect(lastSeenLabel('2026-10-02T14:59:40.000Z', NOW)).toBe('agora');
    expect(lastSeenLabel('2026-10-02T14:48:00.000Z', NOW)).toBe('há 12 min');
    expect(lastSeenLabel('2026-10-02T12:00:00.000Z', NOW)).toBe('há 3 h');
    expect(lastSeenLabel('2026-10-01T14:00:00.000Z', NOW)).toBe('há 1 dia');
    expect(lastSeenLabel('2026-09-28T15:00:00.000Z', NOW)).toBe('há 4 dias');
  });

  it('TV sem contato nenhum', () => {
    expect(lastSeenLabel(null, NOW)).toBe('nunca conectou');
  });

  // Relógio do banco alguns segundos à frente do navegador.
  it('contato no futuro é "agora", não tempo negativo', () => {
    expect(lastSeenLabel('2026-10-02T15:00:20.000Z', NOW)).toBe('agora');
  });

  it('data inválida não vira "há NaN min"', () => {
    expect(lastSeenLabel('não é data', NOW)).toBe('nunca conectou');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- lib/__tests__/fleet`
Expected: FAIL, módulo `../fleet` não existe.

- [ ] **Step 3: Implementar `lib/fleet.ts`**

Criar `artifacts/signage/src/lib/fleet.ts`:

```ts
/**
 * Contas da página do parque. `isOnline` e `outdated` já chegam calculados
 * pelo servidor; aqui é só agrupar, filtrar e escrever.
 */

export interface FleetRow {
  id: number;
  clientName: string;
  name: string;
  location: string | null;
  showcase: boolean;
  lastSeenAt: string | null;
  isOnline: boolean;
  appVersion: string | null;
  outdated: boolean;
}

export type FleetFilter = 'all' | 'online' | 'offline' | 'outdated';

/**
 * A vitrine da landing fica fora das contas: ela aparece online por causa das
 * visitas do site, não por ser uma TV na parede de alguém.
 */
function realTvs(devices: FleetRow[]): FleetRow[] {
  return devices.filter((d) => !d.showcase);
}

export function fleetCounts(devices: FleetRow[]) {
  const tvs = realTvs(devices);
  const online = tvs.filter((d) => d.isOnline).length;
  return {
    total: tvs.length,
    online,
    offline: tvs.length - online,
    outdated: tvs.filter((d) => d.outdated).length,
  };
}

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;

function releaseParts(version: string): number[] | null {
  const match = RELEASE.exec(version);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Mais nova primeiro; versão fora do padrão X.Y.Z depois das de release. */
function byVersionDesc(a: string, b: string): number {
  const pa = releaseParts(a);
  const pb = releaseParts(b);
  if (pa && pb) {
    for (let i = 0; i < 3; i += 1) {
      if (pa[i] !== pb[i]) return pb[i] - pa[i];
    }
    return 0;
  }
  if (pa) return -1;
  if (pb) return 1;
  return a.localeCompare(b);
}

/** `version: null` = TV sem o app (navegador); sempre por último. */
export function versionsInUse(devices: FleetRow[]): Array<{ version: string | null; count: number }> {
  const counts = new Map<string | null, number>();
  for (const d of realTvs(devices)) {
    counts.set(d.appVersion, (counts.get(d.appVersion) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => {
      if (a.version === null) return 1;
      if (b.version === null) return -1;
      return byVersionDesc(a.version, b.version);
    });
}

/** Offline primeiro: é o que o admin veio procurar. Depois, por nome. */
export function filterFleet(devices: FleetRow[], filter: FleetFilter): FleetRow[] {
  return devices
    .filter((d) => {
      if (filter === 'online') return d.isOnline;
      if (filter === 'offline') return !d.isOnline;
      if (filter === 'outdated') return d.outdated;
      return true;
    })
    .sort((a, b) => Number(a.isOnline) - Number(b.isOnline) || a.name.localeCompare(b.name, 'pt-BR'));
}

export function lastSeenLabel(lastSeenAt: string | null, now: Date): string {
  if (!lastSeenAt) return 'nunca conectou';
  const ms = now.getTime() - new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ms)) return 'nunca conectou';
  const minutes = Math.floor(ms / 60000);
  // Inclui contato "no futuro": relógio do banco à frente do navegador.
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}
```

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @workspace/signage test -- lib/__tests__/fleet`
Expected: PASS.

- [ ] **Step 5: Teste da página**

Criar `artifacts/signage/src/pages/__tests__/fleet.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fleet from '../fleet';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const minutosAtras = (min: number) => new Date(Date.now() - min * 60 * 1000).toISOString();

function tv(over: Record<string, unknown>) {
  return {
    id: 1, clientId: 7, clientName: 'Padaria Central', name: 'TV', location: null, showcase: false,
    lastSeenAt: minutosAtras(1), isOnline: true, appVersion: '1.9.0', outdated: false,
    ...over,
  };
}

const PARQUE = {
  latestVersion: '1.9.0',
  devices: [
    tv({ id: 1, name: 'Balcão', location: 'Entrada' }),
    tv({ id: 2, name: 'Açougue', clientName: 'Mercado Bom', isOnline: false, lastSeenAt: minutosAtras(180), appVersion: '1.8.2', outdated: true }),
    tv({ id: 3, name: 'Depósito', isOnline: false, lastSeenAt: null, appVersion: null }),
    tv({ id: 4, name: 'Vitrine do site', showcase: true, appVersion: null }),
  ],
};

function stubFleet(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Fleet />
    </QueryClientProvider>,
  );
}

const contagem = (id: string) => screen.getByTestId(`fleet-count-${id}`);

afterEach(() => vi.unstubAllGlobals());

describe('Parque de TVs', () => {
  it('busca o parque na API', async () => {
    const fetchMock = stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/fleet');
  });

  it('conta total, online, offline e desatualizadas sem a vitrine', async () => {
    stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');
    expect(contagem('total')).toHaveTextContent('3');
    expect(contagem('online')).toHaveTextContent('1');
    expect(contagem('offline')).toHaveTextContent('2');
    expect(contagem('outdated')).toHaveTextContent('1');
  });

  it('lista as versões em uso com a contagem de TVs', async () => {
    stubFleet(PARQUE);
    renderPage();
    const bloco = await screen.findByTestId('fleet-versions');
    expect(within(bloco).getByText('1.9.0')).toBeInTheDocument();
    expect(within(bloco).getByText('1.8.2')).toBeInTheDocument();
    expect(within(bloco).getByText('navegador')).toBeInTheDocument();
    expect(within(bloco).getAllByText('1 TV')).toHaveLength(3);
  });

  it('cada linha mostra status, empresa, último contato e versão', async () => {
    stubFleet(PARQUE);
    renderPage();
    const acougue = await screen.findByTestId('fleet-row-2');
    expect(acougue).toHaveTextContent('Açougue');
    expect(acougue).toHaveTextContent('Mercado Bom');
    expect(acougue).toHaveTextContent('Offline');
    expect(acougue).toHaveTextContent('há 3 h');
    expect(acougue).toHaveTextContent('1.8.2');
    expect(within(acougue).getByText('Desatualizada')).toBeInTheDocument();
    expect(within(acougue).getByRole('link', { name: 'Açougue' })).toHaveAttribute('href', '/devices/2');

    const deposito = screen.getByTestId('fleet-row-3');
    expect(deposito).toHaveTextContent('nunca conectou');
    expect(deposito).toHaveTextContent('navegador');

    expect(within(screen.getByTestId('fleet-row-4')).getByText('Vitrine')).toBeInTheDocument();
    expect(within(screen.getByTestId('fleet-row-1')).queryByText('Desatualizada')).not.toBeInTheDocument();
  });

  it('offline vem primeiro na lista', async () => {
    stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');
    const ordem = screen.getAllByTestId(/^fleet-row-/).map((row) => row.getAttribute('data-testid'));
    expect(ordem).toEqual(['fleet-row-2', 'fleet-row-3', 'fleet-row-1', 'fleet-row-4']);
  });

  it('o filtro deixa só as TVs pedidas', async () => {
    stubFleet(PARQUE);
    renderPage();
    await screen.findByText('Balcão');

    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'outdated');
    expect(screen.getAllByTestId(/^fleet-row-/)).toHaveLength(1);
    expect(screen.getByTestId('fleet-row-2')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'online');
    expect(screen.queryByTestId('fleet-row-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('fleet-row-1')).toBeInTheDocument();
  });

  it('sem a última versão, avisa e não marca ninguém', async () => {
    stubFleet({
      latestVersion: null,
      devices: [tv({ id: 2, name: 'Açougue', appVersion: '1.8.2', outdated: false })],
    });
    renderPage();
    await screen.findByText('Açougue');
    expect(screen.getByText(/Não foi possível consultar a última versão/)).toBeInTheDocument();
    expect(screen.queryByText('Desatualizada')).not.toBeInTheDocument();
  });

  it('parque vazio mostra zeros e a mensagem', async () => {
    stubFleet({ latestVersion: '1.9.0', devices: [] });
    renderPage();
    expect(await screen.findByText('Nenhuma TV cadastrada.')).toBeInTheDocument();
    expect(contagem('total')).toHaveTextContent('0');
  });

  it('filtro sem resultado diz que nenhuma TV se encaixa', async () => {
    stubFleet({ latestVersion: '1.9.0', devices: [tv({ id: 1, name: 'Balcão' })] });
    renderPage();
    await screen.findByText('Balcão');
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'offline');
    expect(screen.getByText('Nenhuma TV neste filtro.')).toBeInTheDocument();
  });

  it('erro da API mostra o aviso', async () => {
    stubFleet({ error: 'boom' }, 500);
    renderPage();
    expect(await screen.findByText('Não foi possível carregar o parque.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage test -- pages/__tests__/fleet`
Expected: FAIL, módulo `../fleet` não existe.

- [ ] **Step 7: Implementar a página**

Criar `artifacts/signage/src/pages/fleet.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'wouter';
import { CircleAlert, Monitor, Wifi, WifiOff } from 'lucide-react';
import { useGetFleet, getGetFleetQueryKey } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { filterFleet, fleetCounts, lastSeenLabel, versionsInUse, type FleetFilter, type FleetRow } from '@/lib/fleet';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

function tvs(count: number) {
  return count === 1 ? '1 TV' : `${count} TVs`;
}

export default function Fleet() {
  const [filter, setFilter] = useState<FleetFilter>('all');

  // Mesmo ritmo do player: a TV fala com o servidor a cada 60 s.
  const { data, isLoading, isError } = useGetFleet({
    query: { queryKey: getGetFleetQueryKey(), refetchInterval: 60_000 },
  });

  const devices: FleetRow[] = data?.devices ?? [];
  const latestVersion = data?.latestVersion ?? null;
  const counts = fleetCounts(devices);
  const versions = versionsInUse(devices);
  const rows = filterFleet(devices, filter);
  const now = new Date();

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Parque de TVs</h1>
        <p className="mt-1 text-muted-foreground">Quem está no ar agora e que versão do app cada TV roda.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric id="total" icon={Monitor} label="Total" value={counts.total} />
        <Metric id="online" icon={Wifi} label="Online" value={counts.online} />
        <Metric id="offline" icon={WifiOff} label="Offline" value={counts.offline} />
        <Metric id="outdated" icon={CircleAlert} label="Desatualizadas" value={counts.outdated} />
      </div>

      {isError ? (
        <Card className="py-16 text-center">
          <CardContent>
            <p className="font-medium text-muted-foreground">Não foi possível carregar o parque.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : (
        <>
          <Card className="mb-6" data-testid="fleet-versions">
            <CardHeader>
              <CardTitle className="text-base">Versões em uso</CardTitle>
              <p className="text-sm text-muted-foreground">
                {latestVersion
                  ? `Última versão publicada: ${latestVersion}.`
                  : 'Não foi possível consultar a última versão publicada; nenhuma TV é marcada como desatualizada.'}
              </p>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma versão registrada.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {versions.map(({ version, count }) => (
                    <li key={version ?? 'navegador'} className="flex items-center justify-between py-2">
                      <span className="font-medium tabular-nums">{version ?? 'navegador'}</span>
                      <span className="text-muted-foreground">{tvs(count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="mb-4 max-w-xs space-y-2">
            <Label htmlFor="fleet-filter">Mostrar</Label>
            <select
              id="fleet-filter"
              className={selectClass}
              value={filter}
              onChange={(e) => setFilter(e.target.value as FleetFilter)}
            >
              <option value="all">Todas</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="outdated">Desatualizadas</option>
            </select>
          </div>

          {devices.length === 0 ? (
            <Card className="py-12 text-center">
              <CardContent>
                <p className="font-medium text-muted-foreground">Nenhuma TV cadastrada.</p>
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="py-12 text-center">
              <CardContent>
                <p className="font-medium text-muted-foreground">Nenhuma TV neste filtro.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="overflow-x-auto pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">TV</th>
                      <th className="pb-2 font-medium">Empresa</th>
                      <th className="pb-2 font-medium">Local</th>
                      <th className="pb-2 font-medium">Visto por último</th>
                      <th className="pb-2 font-medium">Versão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} data-testid={`fleet-row-${d.id}`} className="border-b last:border-0">
                        <td className="py-3">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className={cn('h-2 w-2 rounded-full', d.isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40')}
                            />
                            {d.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="py-3 font-medium">
                          <span className="flex flex-wrap items-center gap-2">
                            <Link href={`/devices/${d.id}`} className="hover:underline">{d.name}</Link>
                            {d.showcase ? <Badge variant="secondary">Vitrine</Badge> : null}
                          </span>
                        </td>
                        <td className="py-3 text-muted-foreground">{d.clientName}</td>
                        <td className="py-3 text-muted-foreground">{d.location ?? '—'}</td>
                        <td className="py-3 tabular-nums text-muted-foreground">{lastSeenLabel(d.lastSeenAt, now)}</td>
                        <td className="py-3">
                          <span className="flex flex-wrap items-center gap-2 tabular-nums">
                            {d.appVersion ?? 'navegador'}
                            {d.outdated ? <Badge variant="outline">Desatualizada</Badge> : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ id, icon: Icon, label, value }: { id: string; icon: React.ElementType; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold" data-testid={`fleet-count-${id}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
```

Dois estados vazios diferentes de propósito: `Nenhuma TV cadastrada.` (parque vazio) e `Nenhuma TV neste filtro.` (há TVs, o filtro não pegou nenhuma).

- [ ] **Step 8: Rodar**

Run: `pnpm --filter @workspace/signage test -- pages/__tests__/fleet lib/__tests__/fleet`
Expected: PASS.

Se o `lucide-react` instalado não exportar `CircleAlert`, usar `AlertCircle` (nome antigo do mesmo ícone).

- [ ] **Step 9: Rota e item de menu**

Em `artifacts/signage/src/App.tsx`, junto dos outros imports de página:

```tsx
import Fleet from './pages/fleet';
```

Em `AdminRoutes`, logo depois do bloco `<Route path="/companies/:id">…</Route>`:

```tsx
      <Route path="/parque">
        <Layout><Fleet /></Layout>
      </Route>
```

Em `artifacts/signage/src/components/layout.tsx`, acrescentar `Monitor` ao import de `lucide-react` e, em `navItems`, logo depois de `Empresas`:

```tsx
    { href: '/parque', label: 'Parque de TVs', icon: Monitor },
```

- [ ] **Step 10: Suíte completa e tipos**

Run: `pnpm --filter @workspace/signage test`
Expected: PASS em toda a suíte web.

Run: `pnpm run typecheck`
Expected: sem erro. (Se o tipo gerado de `data.devices` não casar com `FleetRow[]`, o campo divergente está no openapi do Task 4: `location`, `lastSeenAt` e `appVersion` têm de estar em `required` com `type: ["string", "null"]`.)

- [ ] **Step 11: Commit**

```bash
git add artifacts/signage/src/lib/fleet.ts artifacts/signage/src/lib/__tests__/fleet.test.ts artifacts/signage/src/pages/fleet.tsx artifacts/signage/src/pages/__tests__/fleet.test.tsx artifacts/signage/src/App.tsx artifacts/signage/src/components/layout.tsx
git commit -m "feat(portal): página do parque de TVs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois das tarefas

- **Suíte inteira:** `pnpm run typecheck && pnpm --filter @workspace/api-server test && pnpm --filter @workspace/signage test`.
- **Conferência no ar** (não automatizável): depois do deploy, abrir `/parque` com pelo menos uma TV ligada pelo app Android e conferir (1) a TV aparece online com a versão do app, (2) desligar a TV da tomada: em até ~6 minutos ela vira offline e o detalhe abre um "Fora do ar … → agora", (3) religar: abre um "No ar" novo e o buraco fica registrado, (4) abrir `tv.html?key=…` de uma TV num navegador comum: a versão dela vira `navegador`.
- **PR:** título `feat(portal): parque de TVs com status, versão do app e histórico de conexão` (sobe minor). Merge com `gh pr merge --merge`. Não escrever `BREAKING CHANGE:` no início de linha da descrição.
- **Deploy:** a migration `0017` roda no build da Vercel. Coluna nula e tabela nova: servidor antigo e novo convivem durante o deploy. O histórico começa vazio e enche a partir do primeiro feed de cada TV.
