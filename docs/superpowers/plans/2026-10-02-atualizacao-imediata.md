# Atualização em minutos e gatilho pelo admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda box ligada começa a se atualizar em até ~2 minutos depois de uma release, e o admin tem um botão em `/parque` para mandar uma TV (ou todas) checar agora.

**Architecture:** O feed que a TV já busca a cada 60 s (`GET /display/:key/feed`) ganha o campo `appUpdate`, preenchido quando a TV está em versão menor que a última release ou quando o admin pediu a checagem há menos de 15 minutos. O `tv.html` repassa o aviso ao app por uma ponte JS nova (`window.SignageUpdate.check()`), e o app roda a checagem que já existe. O servidor só avisa: o app continua lendo o `update.json` do GitHub e conferindo o SHA-256 do APK.

**Tech Stack:** pnpm monorepo, Drizzle + Postgres (`lib/db`), Express + zod gerado por orval (`artifacts/api-server`, `lib/api-spec`), React + TanStack Query (`artifacts/signage`), `tv.html` em ES5 puro, Kotlin + Robolectric (`artifacts/android-tv`), vitest + jsdom + supertest.

**Spec:** `docs/superpowers/specs/2026-10-02-atualizacao-imediata-design.md`

> **Nota pós-execução (2026-10-02):** duas partes do código deste plano foram trocadas durante a execução, por decisão registrada depois de achados da revisão. Vale o que está na spec e no código, não o texto das tarefas:
> - **Task 2:** a consulta em andamento compartilhada (`inFlight`) é só do feed (`refreshForFeed`); `latestTvAppRelease()` faz a própria consulta de 5 s. O `refresh(timeoutMs)` compartilhado do Step 3 deixaria um feed esperando a consulta de 5 s da página do APK.
> - **Task 5:** depois de qualquer falha de instalação (`onUpdateFailed`), o app ignora os avisos da página até a próxima checagem periódica (`avisoDaPaginaSuspenso` em `MainActivity`). Sem isso, uma box que não consegue instalar refaria a sessão e mostraria "Falha ao atualizar" a cada 10 minutos.

## Global Constraints

- Branch `feat/atualizacao-imediata`. Nunca commitar na `main`.
- Commit: `tipo(escopo): descrição curta em português`, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como caracteres UTF-8 reais, nunca `\uXXXX`.
- `artifacts/signage/public/tv.html` é ES5: só `var` e `function`. Nada de `let`, `const`, arrow function, template string, `Array.prototype.includes`, `Object.assign`.
- Não editar à mão `lib/api-zod/src/generated/**` nem `lib/api-client-react/src/generated/**`: mudar `lib/api-spec/openapi.yaml` e rodar o codegen.
- Não criar tag `vX.Y.Z`, não mexer em `versionName`/`versionCode` no Gradle.
- Migração só de acréscimo.
- O servidor só avisa. Nenhum campo novo diz ao app de onde baixar nem o que instalar.
- O feed nunca espera o GitHub mais que **1,5 s**, e no máximo uma tentativa por **1 minuto** por instância.
- Pedido do admin vale **15 minutos**. `tv.html` repete o aviso ao app a cada **10 minutos** enquanto o sinal persistir.
- A checagem periódica do app (2 min após abrir, depois a cada 6 h) não muda.
- O app nunca abre o diálogo de instalação sozinho; a guarda de hoje (sem confirmação pendente e sem sessão ativa) vale também para o aviso da página.
- `/display/:deviceKey/slides` e a vitrine pública não mudam.
- Textos exatos: botões `Atualizar agora` e `Atualizar todas`; confirmação `Mandar todas as TVs checarem atualização agora?`; toasts `Pedido enviado. A TV checa no próximo minuto.`, `Pedido enviado. As TVs checam no próximo minuto.` e `Não foi possível enviar o pedido.`; rótulo `atualização pedida há 2 min` (`atualização pedida agora` no primeiro minuto); ajuda `As TVs se atualizam sozinhas em poucos minutos depois de cada release. Em Android 11 ou anterior, alguém precisa apertar OK no controle.`

## Review Focus

Condições que a spec não nomeia mas que a frota vai produzir. Cada uma tem teste na tarefa dona do código.

1. **GitHub fora do ar por minutos**: sem cuidado, cada feed de cada TV esperaria 1,5 s. Esperado: uma tentativa por minuto por instância; os outros feeds respondem na hora com o último valor conhecido. → Task 2.
2. **TV sem nenhuma peça no ar** (lista de slides vazia): o `tv.html` sai cedo nesse caso. Esperado: o aviso de atualização chega ao app mesmo assim. → Task 4.
3. **Aviso da página chegando com atualização já baixada, esperando o OK**: Esperado: o app não refaz a sessão nem perde a confirmação pendente. → Task 5.
4. **`update_requested_at` alguns segundos no futuro** (relógio do banco à frente do servidor): Esperado: conta como pedido recente, não como vencido. → Task 1.
5. **Várias requisições de feed no mesmo instante com o cache vencido**: Esperado: uma consulta só ao GitHub, compartilhada. → Task 2.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/devices.ts` (modificar) | coluna `updateRequestedAt` |
| `lib/db/drizzle/0018_*.sql` (gerado) | migration |
| `artifacts/api-server/src/lib/tv-app-update.ts` (criar) | regra do sinal: `appUpdateSignal`, `isRecentUpdateRequest` |
| `artifacts/api-server/src/lib/tv-app-release.ts` (modificar) | cache de 1 min; `latestTvAppReleaseForFeed` |
| `lib/api-spec/openapi.yaml` (modificar) | `DisplayFeed.appUpdate`, `FleetDevice.updateRequestedAt`, `POST /fleet/update-requests` |
| `artifacts/api-server/src/routes/display.ts` (modificar) | feed leva `appUpdate` |
| `artifacts/api-server/src/routes/fleet.ts` (modificar) | `updateRequestedAt` no parque; rota do pedido |
| `artifacts/signage/public/tv.html` (modificar) | repassa o aviso ao app |
| `artifacts/android-tv/.../AtualizacaoPelaPagina.kt` (criar) | ponte `window.SignageUpdate` |
| `artifacts/android-tv/.../UpdateState.kt` (modificar) | `canCheck()` |
| `artifacts/android-tv/.../MainActivity.kt` (modificar) | registra a ponte; um caminho só de checagem |
| `artifacts/signage/src/lib/fleet.ts` (modificar) | `updateRequestedLabel` |
| `artifacts/signage/src/pages/fleet.tsx` (modificar) | botões, rótulo e ajuda |

Comandos de teste, da raiz do repo (o `-- <arquivo>` do script `test` não filtra; usar `exec vitest run`):

- API: `pnpm --filter @workspace/api-server exec vitest run <padrão>`
- Web: `pnpm --filter @workspace/signage exec vitest run <padrão>`
- Android: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests '<Classe>'`
- Tipos: `pnpm run typecheck`

---

### Task 1: Coluna do pedido e regra do sinal

**Files:**
- Modify: `lib/db/src/schema/devices.ts`
- Create (gerado): `lib/db/drizzle/0018_*.sql`, `lib/db/drizzle/meta/0018_snapshot.json`, `lib/db/drizzle/meta/_journal.json`
- Create: `artifacts/api-server/src/lib/tv-app-update.ts`
- Test: `artifacts/api-server/src/lib/__tests__/tv-app-update.test.ts` (criar)

**Interfaces:**
- Consumes: `isOutdatedTvApp(appVersion: string | null, latestVersion: string | null): boolean` de `./tv-app-version` (já existe).
- Produces:
  - `devicesTable.updateRequestedAt` (`timestamptz`, nulo).
  - De `lib/tv-app-update.ts`:
    - `UPDATE_REQUEST_TTL_MINUTES = 15`
    - `isRecentUpdateRequest(requestedAt: Date | null | undefined, now: Date): boolean`
    - `interface AppUpdateSignal { version: string | null; forcedAt: Date | null }`
    - `appUpdateSignal(input: { appVersion: string | null; latestVersion: string | null; updateRequestedAt: Date | null | undefined; now: Date }): AppUpdateSignal | null`

- [ ] **Step 1: Coluna no schema**

Em `lib/db/src/schema/devices.ts`, logo depois de `appVersion`:

```ts
    // Quando o admin mandou esta TV checar atualização do app. O feed leva o
    // aviso à TV enquanto o pedido tem menos de 15 minutos. Nulo = nunca pediu.
    updateRequestedAt: timestamp("update_requested_at", { withTimezone: true }),
```

- [ ] **Step 2: Gerar a migration**

Run: `DATABASE_URL=postgres://local/gerar pnpm --filter @workspace/db run generate`
Expected: cria `lib/db/drizzle/0018_<nome>.sql` com exatamente:

```sql
ALTER TABLE "devices" ADD COLUMN "update_requested_at" timestamp with time zone;
```

Se o arquivo trouxer qualquer outra instrução, parar: o snapshot `0017` está fora de sincronia com o schema.

- [ ] **Step 3: Aplicar num Postgres descartável**

```bash
docker run -d --rm --name atualiza-pg -e POSTGRES_PASSWORD=x -p 55436:5432 postgres:16-alpine
for i in $(seq 1 30); do docker exec atualiza-pg pg_isready -U postgres -q && break; sleep 1; done; sleep 1
for f in lib/db/drizzle/*.sql; do sed 's/--> statement-breakpoint//' "$f" | docker exec -i atualiza-pg psql -q -v ON_ERROR_STOP=1 -U postgres >/dev/null || echo "FALHOU $f"; done
docker exec -i atualiza-pg psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
insert into companies (id, name) values (1, 'Loja');
insert into clients (id, company_id) values (1, 1);
insert into devices (id, client_id, name, device_key) values (1, 1, 'TV', 'K1'), (2, 1, 'TV 2', 'K2');
update devices set update_requested_at = now() where id in (1);
select id, update_requested_at is not null as pedido from devices order by id;
SQL
docker stop atualiza-pg
```

Expected: nenhuma linha `FALHOU`; `UPDATE 1`; `1 | t` e `2 | f`.

- [ ] **Step 4: Teste da regra do sinal**

Criar `artifacts/api-server/src/lib/__tests__/tv-app-update.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { UPDATE_REQUEST_TTL_MINUTES, appUpdateSignal, isRecentUpdateRequest } from "../tv-app-update";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const minutosAtras = (min: number) => new Date(NOW.getTime() - min * 60 * 1000);

function sinal(over: Partial<Parameters<typeof appUpdateSignal>[0]> = {}) {
  return appUpdateSignal({
    appVersion: "1.16.0",
    latestVersion: "1.16.0",
    updateRequestedAt: null,
    now: NOW,
    ...over,
  });
}

describe("isRecentUpdateRequest", () => {
  it("pedido vale 15 minutos", () => {
    expect(UPDATE_REQUEST_TTL_MINUTES).toBe(15);
    expect(isRecentUpdateRequest(minutosAtras(1), NOW)).toBe(true);
    expect(isRecentUpdateRequest(minutosAtras(14), NOW)).toBe(true);
    expect(isRecentUpdateRequest(minutosAtras(15), NOW)).toBe(false);
    expect(isRecentUpdateRequest(minutosAtras(16), NOW)).toBe(false);
  });

  it("TV que nunca recebeu pedido", () => {
    expect(isRecentUpdateRequest(null, NOW)).toBe(false);
    expect(isRecentUpdateRequest(undefined, NOW)).toBe(false);
  });

  // Relógio do banco alguns segundos à frente do servidor: o pedido acabou
  // de ser feito, não pode ser descartado como vencido.
  it("pedido alguns segundos no futuro conta como recente", () => {
    expect(isRecentUpdateRequest(new Date(NOW.getTime() + 20_000), NOW)).toBe(true);
  });
});

describe("appUpdateSignal", () => {
  it("TV em dia e sem pedido não recebe sinal", () => {
    expect(sinal()).toBeNull();
  });

  it("TV em versão menor que a última release recebe a versão nova", () => {
    expect(sinal({ appVersion: "1.15.1" })).toEqual({ version: "1.16.0", forcedAt: null });
  });

  it("TV no navegador (sem app) não recebe sinal automático", () => {
    expect(sinal({ appVersion: null })).toBeNull();
  });

  it("build de teste (-rc) não recebe sinal automático", () => {
    expect(sinal({ appVersion: "1.0.1-rc1" })).toBeNull();
  });

  it("sem release conhecida (GitHub fora) não há sinal automático", () => {
    expect(sinal({ appVersion: "1.0.0", latestVersion: null })).toBeNull();
  });

  it("pedido recente do admin vale mesmo com a TV em dia", () => {
    const pedido = minutosAtras(1);
    expect(sinal({ updateRequestedAt: pedido })).toEqual({ version: "1.16.0", forcedAt: pedido });
  });

  it("pedido vencido não cutuca a TV em dia", () => {
    expect(sinal({ updateRequestedAt: minutosAtras(16) })).toBeNull();
  });

  // Pedido vencido não apaga o sinal automático: só deixa de ir o forcedAt.
  it("pedido vencido com TV desatualizada: sinal automático, sem forcedAt", () => {
    expect(sinal({ appVersion: "1.15.1", updateRequestedAt: minutosAtras(16) })).toEqual({
      version: "1.16.0",
      forcedAt: null,
    });
  });

  it("pedido recente com TV desatualizada leva os dois", () => {
    const pedido = minutosAtras(2);
    expect(sinal({ appVersion: "1.15.1", updateRequestedAt: pedido })).toEqual({
      version: "1.16.0",
      forcedAt: pedido,
    });
  });

  // O admin pede justamente quando algo não vai bem: o pedido tem de chegar
  // mesmo que o servidor não consiga dizer qual é a última versão.
  it("pedido recente sem release conhecida vai com versão nula", () => {
    const pedido = minutosAtras(1);
    expect(sinal({ latestVersion: null, updateRequestedAt: pedido })).toEqual({ version: null, forcedAt: pedido });
  });

  it("pedido recente para TV no navegador ainda vai (a página sem ponte ignora)", () => {
    const pedido = minutosAtras(1);
    expect(sinal({ appVersion: null, updateRequestedAt: pedido })).toEqual({ version: "1.16.0", forcedAt: pedido });
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run tv-app-update`
Expected: FAIL, módulo `../tv-app-update` não existe.

- [ ] **Step 6: Implementar `tv-app-update.ts`**

Criar `artifacts/api-server/src/lib/tv-app-update.ts`:

```ts
import { isOutdatedTvApp } from "./tv-app-version";

/**
 * Aviso que o feed leva à TV: "cheque atualização do app agora". O servidor
 * só avisa — quem decide o que instalar continua sendo o app, lendo o
 * update.json do GitHub e conferindo o SHA-256 do APK. Um aviso forjado
 * consegue, no máximo, provocar uma checagem.
 */

/** Pedido do admin para de cutucar a TV depois disto. */
export const UPDATE_REQUEST_TTL_MINUTES = 15;

/**
 * Idade negativa (relógio do banco à frente do servidor) conta como recente:
 * o pedido acabou de ser feito.
 */
export function isRecentUpdateRequest(requestedAt: Date | null | undefined, now: Date): boolean {
  if (!requestedAt) return false;
  return now.getTime() - requestedAt.getTime() < UPDATE_REQUEST_TTL_MINUTES * 60 * 1000;
}

export interface AppUpdateSignal {
  /** Última release conhecida; nulo quando o servidor não conseguiu ler. */
  version: string | null;
  /** Quando o admin pediu, enquanto o pedido é recente. */
  forcedAt: Date | null;
}

export function appUpdateSignal(input: {
  appVersion: string | null;
  latestVersion: string | null;
  updateRequestedAt: Date | null | undefined;
  now: Date;
}): AppUpdateSignal | null {
  const forcedAt = isRecentUpdateRequest(input.updateRequestedAt, input.now) ? input.updateRequestedAt ?? null : null;
  // Mesma regra do selo "Desatualizada" do parque: só afirma quando dá para
  // comparar. Navegador, build de teste e GitHub fora ficam sem sinal automático.
  const outdated = isOutdatedTvApp(input.appVersion, input.latestVersion);
  if (!outdated && !forcedAt) return null;
  return { version: input.latestVersion, forcedAt };
}
```

- [ ] **Step 7: Rodar**

Run: `pnpm --filter @workspace/api-server exec vitest run tv-app-update`
Expected: PASS.

Run: `pnpm run typecheck:libs`
Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/schema/devices.ts lib/db/drizzle artifacts/api-server/src/lib/tv-app-update.ts artifacts/api-server/src/lib/__tests__/tv-app-update.test.ts
git commit -m "feat(api): pedido de atualização por TV e regra do aviso ao app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Última release sem atrasar o feed

**Files:**
- Modify: `artifacts/api-server/src/lib/tv-app-release.ts`
- Test: `artifacts/api-server/src/lib/__tests__/tv-app-release.test.ts` (criar)

**Interfaces:**
- Consumes: nada.
- Produces (de `lib/tv-app-release.ts`):
  - `latestTvAppReleaseForFeed(): Promise<TvAppRelease | null>` — nunca lança; no máximo 1,5 s; no máximo uma tentativa por minuto.
  - `latestTvAppRelease(): Promise<TvAppRelease>` — assinatura e erros iguais aos de hoje; cache passa de 5 min para 1 min.

- [ ] **Step 1: Teste**

Criar `artifacts/api-server/src/lib/__tests__/tv-app-release.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UPDATE_JSON = {
  versionName: "1.16.0",
  versionCode: 1016000,
  apk: "signage-tv-1.16.0.apk",
  sha256: "a".repeat(64),
};

const fetchMock = vi.fn();

function ok(body: unknown = UPDATE_JSON) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const MINUTO = 60 * 1000;

async function carregar() {
  return import("../tv-app-release");
}

beforeEach(() => {
  // O cache vive no módulo: sem zerar, um teste herdaria a resposta do outro.
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Só o relógio: o código usa Date.now() para a idade do cache.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("latestTvAppReleaseForFeed", () => {
  it("lê a release e devolve a versão", async () => {
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
  });

  it("cache com menos de 1 minuto não consulta de novo", async () => {
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    vi.setSystemTime(Date.now() + MINUTO - 1000);
    await latestTvAppReleaseForFeed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache vencido consulta de novo e pega a release nova", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + MINUTO + 1000);
    fetchMock.mockResolvedValueOnce(ok({ ...UPDATE_JSON, versionName: "1.17.0", apk: "signage-tv-1.17.0.apk" }));
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.17.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("GitHub fora devolve o último valor conhecido, mesmo vencido", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + 10 * MINUTO);
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
  });

  it("sem nenhum valor conhecido e GitHub fora devolve null, sem lançar", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { latestTvAppReleaseForFeed } = await carregar();
    await expect(latestTvAppReleaseForFeed()).resolves.toBeNull();
  });

  it("update.json inválido devolve o último valor conhecido", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + 2 * MINUTO);
    fetchMock.mockResolvedValueOnce(ok({ versionName: "x", apk: "../../evil.apk", sha256: "z" }));
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
  });

  // GitHub fora por minutos: sem isto, cada feed de cada TV esperaria o teto
  // de 1,5 s. Uma tentativa por minuto; as outras respondem na hora.
  it("depois de uma falha, não tenta de novo antes de 1 minuto", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    await latestTvAppReleaseForFeed();
    vi.setSystemTime(Date.now() + 30 * 1000);
    await latestTvAppReleaseForFeed();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + MINUTO);
    await latestTvAppReleaseForFeed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Várias TVs batem no mesmo instante com o cache vencido.
  it("chamadas simultâneas compartilham uma consulta só", async () => {
    let liberar: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { liberar = resolve; }));
    const { latestTvAppReleaseForFeed } = await carregar();
    const a = latestTvAppReleaseForFeed();
    const b = latestTvAppReleaseForFeed();
    const c = latestTvAppReleaseForFeed();
    liberar(ok());
    const versoes = (await Promise.all([a, b, c])).map((r) => r?.versionName);
    expect(versoes).toEqual(["1.16.0", "1.16.0", "1.16.0"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a consulta do feed vai com sinal de cancelamento (teto de tempo)", async () => {
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("latestTvAppRelease (página do APK)", () => {
  it("segue lançando quando o GitHub está fora", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { latestTvAppRelease, TvAppReleaseUnavailableError } = await carregar();
    await expect(latestTvAppRelease()).rejects.toBeInstanceOf(TvAppReleaseUnavailableError);
  });

  // A página de download não herda a espera de 1 minuto do feed: quem está
  // instalando uma box precisa da tentativa agora.
  it("tenta de novo logo depois de uma falha do feed", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const { latestTvAppRelease, latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    fetchMock.mockResolvedValueOnce(ok());
    expect((await latestTvAppRelease()).versionName).toBe("1.16.0");
  });

  it("o cache vale 1 minuto", async () => {
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppRelease } = await carregar();
    await latestTvAppRelease();
    vi.setSystemTime(Date.now() + MINUTO - 1000);
    await latestTvAppRelease();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2000);
    await latestTvAppRelease();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run lib/__tests__/tv-app-release`
Expected: FAIL — `latestTvAppReleaseForFeed` não é exportada; o teste "o cache vale 1 minuto" falha na segunda contagem (cache ainda de 5 min).

- [ ] **Step 3: Implementar**

Em `artifacts/api-server/src/lib/tv-app-release.ts`:

Trocar a constante do cache e o comentário dela:

```ts
/** Teto da consulta feita pela página de download. */
const TIMEOUT_MS = 5000;
/** Teto da consulta feita pelo feed da TV: a rota mais chamada do sistema não
 *  pode ficar esperando o GitHub. */
const FEED_TIMEOUT_MS = 1500;
/** 1 minuto: o feed usa este valor para avisar as TVs de uma release nova, e
 *  o atraso do aviso é este cache mais os 60 s do próprio feed. Uma consulta
 *  por minuto por instância ao link de download (sem limite de API). */
const CACHE_MS = 60 * 1000;
```

(Apagar a declaração antiga de `TIMEOUT_MS` e a de `CACHE_MS` com o comentário dos 5 minutos.)

Trocar o estado do módulo e a função `latestTvAppRelease` por:

```ts
let cache: { at: number; release: TvAppRelease } | null = null;
/** Consulta em andamento, para chamadas simultâneas não irem todas ao GitHub. */
let inFlight: Promise<TvAppRelease> | null = null;
/** Quando o feed tentou pela última vez, tenha dado certo ou não. */
let feedAttemptAt = 0;

/**
 * Só o resultado bom entra no cache: guardar falha faria uma queda passageira do
 * GitHub derrubar o download pelos minutos seguintes.
 */
async function fetchRelease(timeoutMs: number): Promise<TvAppRelease> {
  let body: unknown;
  try {
    const res = await fetch(`${BASE_URL}update.json`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    throw new TvAppReleaseUnavailableError(`Falha ao ler update.json: ${String(err)}`);
  }

  const release = parse(body);
  if (!release) throw new TvAppReleaseUnavailableError("update.json inválido");

  cache = { at: Date.now(), release };
  return release;
}

function refresh(timeoutMs: number): Promise<TvAppRelease> {
  if (!inFlight) {
    inFlight = fetchRelease(timeoutMs).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

function freshCache(): TvAppRelease | null {
  return cache && Date.now() - cache.at < CACHE_MS ? cache.release : null;
}

/** Página de download e redirect do APK: tenta agora e lança se não der. */
export async function latestTvAppRelease(): Promise<TvAppRelease> {
  return freshCache() ?? refresh(TIMEOUT_MS);
}

/**
 * Para o feed da TV. Nunca lança e nunca segura o feed além do teto: com o
 * GitHub fora, devolve o último valor conhecido (mesmo vencido) ou null, e só
 * volta a tentar depois de 1 minuto — senão cada feed de cada TV esperaria o
 * teto inteiro enquanto durasse a queda.
 */
export async function latestTvAppReleaseForFeed(): Promise<TvAppRelease | null> {
  const fresh = freshCache();
  if (fresh) return fresh;

  const stale = cache?.release ?? null;
  if (!inFlight && Date.now() - feedAttemptAt < CACHE_MS) return stale;
  feedAttemptAt = Date.now();
  try {
    return await refresh(FEED_TIMEOUT_MS);
  } catch {
    return stale;
  }
}
```

Atualizar o comentário de `CACHE_MS` antigo, se sobrar alguma menção a "5 min" no arquivo.

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @workspace/api-server exec vitest run tv-app`
Expected: PASS em `lib/__tests__/tv-app-release.test.ts`, `lib/__tests__/tv-app-update.test.ts`, `lib/__tests__/tv-app-version.test.ts` e `routes/__tests__/tv-app.test.ts` (os testes antigos da rota do APK seguem valendo: o que avança o relógio 6 min continua vencendo o cache).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/tv-app-release.ts artifacts/api-server/src/lib/__tests__/tv-app-release.test.ts
git commit -m "feat(api): última release em cache de 1 min, sem atrasar o feed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Contrato, feed com `appUpdate` e rota do pedido

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerado: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`
- Modify: `artifacts/api-server/src/routes/display.ts`
- Modify: `artifacts/api-server/src/routes/fleet.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts` (acrescentar)
- Test: `artifacts/api-server/src/routes/__tests__/fleet.test.ts` (acrescentar)
- Test: `artifacts/api-server/src/routes/__tests__/gate.test.ts` (acrescentar)

**Interfaces:**
- Consumes:
  - `appUpdateSignal(...)` de `../lib/tv-app-update` (Task 1).
  - `latestTvAppReleaseForFeed(): Promise<TvAppRelease | null>` de `../lib/tv-app-release` (Task 2).
  - `devicesTable.updateRequestedAt` (Task 1).
- Produces:
  - `GET /api/display/:deviceKey/feed` → acrescenta `appUpdate: { version: string | null; forcedAt: string | null } | null`.
  - `GET /api/fleet` → cada TV ganha `updateRequestedAt: string | null`.
  - `POST /api/fleet/update-requests` com `{ deviceIds?: number[] }` → `200 { requested: number }`; `400` para corpo inválido.
  - Zod gerado: `RequestFleetUpdateBody`, `RequestFleetUpdateResponse`.
  - Cliente gerado: `useRequestFleetUpdate` (mutation; variáveis `{ data: { deviceIds?: number[] } }`).

- [ ] **Step 1: Contrato no openapi**

Em `lib/api-spec/openapi.yaml`:

No schema `DisplayFeed`, logo depois do bloco `music` e antes de `slides` (fora de `required`: a vitrine pública usa o mesmo schema e não manda o campo):

```yaml
        # Aviso para o app Android checar atualização agora. O servidor só
        # avisa: o app segue lendo o update.json e conferindo o APK.
        appUpdate:
          type: ["object", "null"]
          required: [version, forcedAt]
          properties:
            # Última release conhecida; nulo quando o servidor não conseguiu ler.
            version: { type: ["string", "null"] }
            # Quando o admin pediu, enquanto o pedido tem menos de 15 minutos.
            forcedAt: { type: ["string", "null"], format: date-time }
```

No schema `FleetDevice`, acrescentar `updateRequestedAt` no fim da lista `required` e, depois de `outdated`:

```yaml
        # Quando o admin mandou esta TV checar atualização. Nulo = nunca pediu.
        updateRequestedAt: { type: ["string", "null"], format: date-time }
```

Depois do schema `DeviceSessions`:

```yaml
    FleetUpdateRequest:
      type: object
      properties:
        # Sem a lista = todas as TVs.
        deviceIds:
          type: array
          minItems: 1
          items: { type: integer }

    FleetUpdateResult:
      type: object
      required: [requested]
      properties:
        requested: { type: integer }
```

Em `paths`, logo depois do bloco `/fleet:`:

```yaml
  /fleet/update-requests:
    post:
      operationId: requestFleetUpdate
      tags: [devices]
      summary: Manda as TVs escolhidas (ou todas) checarem atualização do app agora
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/FleetUpdateRequest"
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/FleetUpdateResult"
        "400":
          description: Bad request
```

- [ ] **Step 2: Regenerar os clientes**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: termina sem erro. O `typecheck:libs` passa; o typecheck do api-server só roda no fim da tarefa.

Run: `grep -n "export const RequestFleetUpdateBody\|export const RequestFleetUpdateResponse\|\"appUpdate\"\|\"updateRequestedAt\"" lib/api-zod/src/generated/api.ts; grep -n "export const useRequestFleetUpdate" lib/api-client-react/src/generated/api.ts`
Expected: os dois schemas zod, `"appUpdate"` em `GetDisplayFeedResponse` como objeto anulável e opcional, `"updateRequestedAt"` em `GetFleetResponse`, e o hook `useRequestFleetUpdate`.

Se o orval gerar `appUpdate` sem aceitar `null`, trocar o bloco pela forma equivalente e rodar o codegen de novo:

```yaml
        appUpdate:
          oneOf:
            - type: object
              required: [version, forcedAt]
              properties:
                version: { type: ["string", "null"] }
                forcedAt: { type: ["string", "null"], format: date-time }
            - type: "null"
```

- [ ] **Step 3: Teste do feed**

Em `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`:

Junto das outras declarações do topo:

```ts
const latestTvAppReleaseForFeedMock = vi.fn();
```

Depois do `vi.mock("../../lib/device-sessions", …)`:

```ts
// Sem este mock o feed iria ao GitHub de verdade a cada teste.
vi.mock("../../lib/tv-app-release", () => ({
  latestTvAppReleaseForFeed: (...args: unknown[]) => latestTvAppReleaseForFeedMock(...args),
}));
```

No fim do arquivo:

```ts
describe("GET /display/:deviceKey/feed — aviso de atualização do app", () => {
  const APP = (versao: string) => `Mozilla/5.0 (Linux; Android 11) SignageApp/${versao}`;

  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    setMock.mockReset();
    touchDeviceSessionMock.mockReset();
    latestTvAppReleaseForFeedMock.mockReset();
    latestTvAppReleaseForFeedMock.mockResolvedValue({ versionName: "1.16.0" });
    panelSlidesForClientMock.mockReset();
    panelSlidesForClientMock.mockResolvedValue([]);
    selectResults = [[DEVICE_ROW], [PLAYLIST_ROW], []];
    selectCallIndex = 0;
  });

  async function feed(userAgent: string) {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    return request(app).get("/display/tv-1/feed").set("User-Agent", userAgent);
  }

  it("TV em versão antiga recebe o aviso com a última release", async () => {
    const res = await feed(APP("1.15.1"));
    expect(res.status).toBe(200);
    expect(res.body.appUpdate).toEqual({ version: "1.16.0", forcedAt: null });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV em dia não recebe aviso", async () => {
    const res = await feed(APP("1.16.0"));
    expect(res.body.appUpdate).toBeNull();
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV no navegador não recebe aviso", async () => {
    const res = await feed("Mozilla/5.0 (SmartTV)");
    expect(res.body.appUpdate).toBeNull();
  });

  it("pedido recente do admin vai no aviso, mesmo com a TV em dia", async () => {
    const pedido = new Date(Date.now() - 60 * 1000);
    selectResults = [[{ ...DEVICE_ROW, updateRequestedAt: pedido }], [PLAYLIST_ROW], []];
    const res = await feed(APP("1.16.0"));
    expect(res.body.appUpdate).toEqual({ version: "1.16.0", forcedAt: pedido.toISOString() });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("pedido de mais de 15 minutos não vai", async () => {
    const pedido = new Date(Date.now() - 16 * 60 * 1000);
    selectResults = [[{ ...DEVICE_ROW, updateRequestedAt: pedido }], [PLAYLIST_ROW], []];
    const res = await feed(APP("1.16.0"));
    expect(res.body.appUpdate).toBeNull();
  });

  it("sem release conhecida, o pedido do admin vai com versão nula", async () => {
    latestTvAppReleaseForFeedMock.mockResolvedValue(null);
    const pedido = new Date(Date.now() - 60 * 1000);
    selectResults = [[{ ...DEVICE_ROW, updateRequestedAt: pedido }], [PLAYLIST_ROW], []];
    const res = await feed(APP("1.0.0"));
    expect(res.status).toBe(200);
    expect(res.body.appUpdate).toEqual({ version: null, forcedAt: pedido.toISOString() });
    expect(() => GetDisplayFeedResponse.parse(res.body)).not.toThrow();
  });

  it("TV sem peças também recebe o aviso", async () => {
    selectResults = [[DEVICE_ROW], [], []];
    const res = await feed(APP("1.15.1"));
    expect(res.body.slides).toEqual([]);
    expect(res.body.appUpdate).toEqual({ version: "1.16.0", forcedAt: null });
  });

  it("/slides (tv.html antigo) segue sendo só a lista e não consulta a release", async () => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/slides").set("User-Agent", APP("1.15.1"));
    expect(Array.isArray(res.body)).toBe(true);
    expect(latestTvAppReleaseForFeedMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run display-slides`
Expected: os testes antigos passam; os novos que esperam `appUpdate` falham (`undefined`).

- [ ] **Step 5: Feed leva `appUpdate`**

Em `artifacts/api-server/src/routes/display.ts`:

Imports:

```ts
import { latestTvAppReleaseForFeed } from "../lib/tv-app-release";
import { appUpdateSignal } from "../lib/tv-app-update";
```

No `select` de `loadForTv`, depois de `musicUrl: devicesTable.musicUrl,`:

```ts
      updateRequestedAt: devicesTable.updateRequestedAt,
```

Ainda em `loadForTv`, guardar a versão numa variável e devolvê-la com o instante. Trocar o trecho que começa em `const now = new Date();` e vai até o `return` por:

```ts
  // Um instante só para a TV e para a sessão: a linha do tempo e o "visto por
  // último" têm de contar a mesma história.
  const now = new Date();
  const appVersion = tvAppVersionFromUserAgent(req.get("user-agent"));

  // A versão é a do último contato, mesmo quando é nula: TV que passou a
  // abrir no navegador não pode seguir mostrando a versão antiga do app.
  await db
    .update(devicesTable)
    .set({ lastSeenAt: now, appVersion })
    .where(eq(devicesTable.id, device.id));

  // Histórico é acessório: a TV recebe a rotação mesmo que ele falhe.
  try {
    await touchDeviceSession(device.id, now);
  } catch (err) {
    req.log.error({ err, deviceId: device.id }, "Falha ao registrar a sessão de conexão da TV");
  }

  const slides = await loadDeviceSlides(device, req.log);
  // A origem do slide é só para a prévia do admin; a TV não precisa dela.
  return { device, appVersion, now, slides: slides.map(({ source, ...slide }) => slide) };
```

Na rota `/display/:deviceKey/feed`, antes do `res.json(`:

```ts
  // Nunca lança e nunca segura o feed além do teto (lib/tv-app-release.ts).
  const latest = await latestTvAppReleaseForFeed();
```

E, dentro do objeto passado a `GetDisplayFeedResponse.parse`, depois de `music`:

```ts
      // Aviso para o app checar atualização agora: versão nova no ar ou
      // pedido do admin. Só avisa; o app decide o que instalar.
      appUpdate: appUpdateSignal({
        appVersion: tv.appVersion,
        latestVersion: latest?.versionName ?? null,
        updateRequestedAt: tv.device.updateRequestedAt,
        now: tv.now,
      }),
```

- [ ] **Step 6: Rodar**

Run: `pnpm --filter @workspace/api-server exec vitest run display-slides`
Expected: PASS.

- [ ] **Step 7: Teste do parque e do pedido**

Em `artifacts/api-server/src/routes/__tests__/fleet.test.ts`:

Junto das declarações do topo:

```ts
const setMock = vi.fn();
const whereMock = vi.fn();
let updated: unknown[] = [];
```

Trocar `makeChain` e o `db` do mock por versões que também atendem ao `update`:

```ts
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: (cond: unknown) => {
      whereMock(cond);
      return chain;
    },
    orderBy: () => chain,
    set: (values: unknown) => {
      setMock(values);
      return chain;
    },
    returning: () => chain,
    then: (resolve: (v: unknown) => void, reject?: (r: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}
```

```ts
  db: {
    select: () => makeChain(selectQueue.shift() ?? []),
    update: () => makeChain(updated),
  },
```

No objeto `devicesTable` do mock, acrescentar `updateRequestedAt: "updateRequestedAt"`.

Em `buildApp`, antes de `app.use(router);`:

```ts
  app.use(express.json());
```

Em `tv(...)`, acrescentar `updateRequestedAt: null` aos valores padrão.

No `beforeEach`, acrescentar:

```ts
  setMock.mockReset();
  whereMock.mockReset();
  updated = [];
```

Dentro do `describe("GET /fleet", …)`:

```ts
  it("devolve quando o admin pediu atualização de cada TV", async () => {
    const pedido = minutosAtras(2);
    selectQueue = [[tv({ id: 1, updateRequestedAt: pedido }), tv({ id: 2 })]];
    const res = await get("/fleet");
    expect(res.body.devices.map((d: { updateRequestedAt: string | null }) => d.updateRequestedAt)).toEqual([
      pedido.toISOString(),
      null,
    ]);
    expect(() => GetFleetResponse.parse(res.body)).not.toThrow();
  });
```

No fim do arquivo:

```ts
describe("POST /fleet/update-requests", () => {
  async function post(body?: unknown) {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const req = request(app).post("/fleet/update-requests");
    return body === undefined ? req : req.send(body as object);
  }

  it("marca o pedido nas TVs escolhidas", async () => {
    updated = [{ id: 1 }, { id: 3 }];
    const res = await post({ deviceIds: [1, 3] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 2 });
    expect(setMock).toHaveBeenCalledWith({ updateRequestedAt: expect.any(Date) });
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("sem lista, marca todas (sem filtro)", async () => {
    updated = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const res = await post({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 3 });
    expect(setMock).toHaveBeenCalledWith({ updateRequestedAt: expect.any(Date) });
    expect(whereMock).not.toHaveBeenCalled();
  });

  it("requisição sem corpo vale como todas", async () => {
    updated = [{ id: 1 }];
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 1 });
    expect(whereMock).not.toHaveBeenCalled();
  });

  // Lista vazia não pode virar "todas" por engano: quem mandou [] quis
  // escolher e não escolheu nada.
  it("lista vazia é erro, não 'todas'", async () => {
    const res = await post({ deviceIds: [] });
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("id que não é inteiro é erro", async () => {
    const res = await post({ deviceIds: ["abc"] });
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("id de TV que não existe conta zero, sem erro", async () => {
    updated = [];
    const res = await post({ deviceIds: [999] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: 0 });
  });
});
```

Em `artifacts/api-server/src/routes/__tests__/gate.test.ts`, depois do teste `protege /api/devices/:id/sessions sem login`:

```ts
  it("protege POST /api/fleet/update-requests sem login", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/api/fleet/update-requests").send({});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Não autenticado." });
  });
```

- [ ] **Step 8: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run routes/__tests__/fleet`
Expected: os testes de `GET /fleet` antigos passam; `devolve quando o admin pediu…` falha (campo ausente na resposta) e os de `POST` falham com 404.

- [ ] **Step 9: Implementar em `routes/fleet.ts`**

Imports: trocar `import { asc, eq } from "drizzle-orm";` por

```ts
import { asc, eq, inArray } from "drizzle-orm";
```

e acrescentar `RequestFleetUpdateBody, RequestFleetUpdateResponse` ao import de `@workspace/api-zod`.

No `select` de `GET /fleet`, depois de `appVersion: devicesTable.appVersion,`:

```ts
      updateRequestedAt: devicesTable.updateRequestedAt,
```

Depois da rota `GET /fleet` e antes da rota das sessões:

```ts
/**
 * Gatilho do admin: marca o pedido e o próximo feed de cada TV leva o aviso
 * (routes/display.ts). Não instala nada daqui — a TV checa, baixa e, onde o
 * Android exige, espera o OK no controle.
 */
router.post("/fleet/update-requests", async (req, res): Promise<void> => {
  // Sem corpo o Express entrega `undefined`; vale o mesmo que `{}` (todas).
  const body = RequestFleetUpdateBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const marcar = db.update(devicesTable).set({ updateRequestedAt: new Date() });
  const ids = body.data.deviceIds;
  const rows = await (ids ? marcar.where(inArray(devicesTable.id, ids)) : marcar).returning({
    id: devicesTable.id,
  });

  res.json(RequestFleetUpdateResponse.parse({ requested: rows.length }));
});
```

- [ ] **Step 10: Rodar tudo da API e os tipos**

Run: `pnpm --filter @workspace/api-server exec vitest run`
Expected: PASS em toda a suíte (a suíte completa tem instabilidade conhecida sob carga em arquivos sem relação — `device-update`, `announcements-orientation`, `panels-scope`; se um deles falhar, rodar o arquivo sozinho e a suíte de novo antes de concluir qualquer coisa).

Run: `pnpm run typecheck`
Expected: sem erro.

- [ ] **Step 11: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated artifacts/api-server/src/routes
git commit -m "feat(api): feed avisa a TV da atualização e admin pede a checagem" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `tv.html` repassa o aviso ao app

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts` (acrescentar)

**Interfaces:**
- Consumes: campo `appUpdate: { version, forcedAt } | null` do feed (Task 3); `window.SignageUpdate.check()` do app (Task 5).
- Produces: nada para outras tarefas.

- [ ] **Step 1: Teste**

Em `artifacts/signage/src/__tests__/tv-html.test.ts`:

Junto das variáveis do topo (perto de `let musica: unknown = null;`):

```ts
// Aviso de atualização do app que o /feed devolve (undefined = servidor
// antigo, sem o campo).
let atualizacao: unknown = undefined;
```

No `beforeEach` global, junto de `musica = null;`:

```ts
  atualizacao = undefined;
```

No `XhrStub`, trocar a linha que monta o corpo do `/feed`:

```ts
          ? JSON.stringify({ screen: { orientation: orientacao }, music: musica, appUpdate: atualizacao, slides: listaDeSlides })
```

No fim do arquivo:

```ts
describe("tv.html: aviso de atualização do app", () => {
  // O app Android expõe `window.SignageUpdate`. O feed diz quando há versão
  // nova (ou quando o admin pediu) e a página repassa: é o que faz a box se
  // atualizar em minutos em vez de esperar a checagem de 6 horas.
  let checagens = 0;

  const SINAL = { version: "1.16.0", forcedAt: null };
  const MINUTO = 60000;

  beforeEach(() => {
    checagens = 0;
    vi.stubGlobal("SignageUpdate", { check: () => { checagens += 1; } });
    listaDeSlides = [slide(1, "/a.png")];
  });

  it("avisa o app quando o feed traz o sinal", () => {
    atualizacao = SINAL;
    carregarTv();
    expect(checagens).toBe(1);
  });

  it("feed sem o sinal não avisa", () => {
    atualizacao = null;
    carregarTv();
    vi.advanceTimersByTime(3 * MINUTO);
    expect(checagens).toBe(0);
  });

  it("servidor antigo (sem o campo) não avisa", () => {
    atualizacao = undefined;
    carregarTv();
    expect(checagens).toBe(0);
  });

  it("o mesmo sinal no feed seguinte não repete o aviso", () => {
    atualizacao = SINAL;
    carregarTv();
    vi.advanceTimersByTime(3 * MINUTO);
    expect(checagens).toBe(1);
  });

  // Download que falhou na box: o sinal continua vindo, e o app precisa de
  // outra chance sem esperar a checagem de 6 horas.
  it("repete o aviso depois de 10 minutos com o sinal ainda no ar", () => {
    atualizacao = SINAL;
    carregarTv();
    vi.advanceTimersByTime(9 * MINUTO);
    expect(checagens).toBe(1);
    vi.advanceTimersByTime(2 * MINUTO);
    expect(checagens).toBe(2);
  });

  it("pedido do admin (forcedAt novo) avisa de novo no próximo feed", () => {
    atualizacao = SINAL;
    carregarTv();
    atualizacao = { version: "1.16.0", forcedAt: "2026-10-02T15:00:00.000Z" };
    vi.advanceTimersByTime(MINUTO);
    expect(checagens).toBe(2);
  });

  it("versão nova avisa de novo no próximo feed", () => {
    atualizacao = SINAL;
    carregarTv();
    atualizacao = { version: "1.17.0", forcedAt: null };
    vi.advanceTimersByTime(MINUTO);
    expect(checagens).toBe(2);
  });

  // TV sem campanha nenhuma também tem de se atualizar: o aviso não pode
  // ficar atrás do retorno antecipado da lista vazia.
  it("TV sem peças também avisa o app", () => {
    listaDeSlides = [];
    atualizacao = SINAL;
    carregarTv();
    expect(checagens).toBe(1);
  });

  it("navegador sem o app ignora o sinal e segue exibindo", () => {
    vi.stubGlobal("SignageUpdate", undefined);
    atualizacao = SINAL;
    expect(() => carregarTv()).not.toThrow();
    responder("/a.png", true);
    expect(noAr()).toContain("/a.png");
  });

  it("ponte que lança não interrompe o rodízio", () => {
    vi.stubGlobal("SignageUpdate", { check: () => { throw new Error("ponte quebrada"); } });
    atualizacao = SINAL;
    expect(() => carregarTv()).not.toThrow();
    responder("/a.png", true);
    expect(noAr()).toContain("/a.png");
  });

  it("objeto sem o método check é ignorado", () => {
    vi.stubGlobal("SignageUpdate", {});
    atualizacao = SINAL;
    expect(() => carregarTv()).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run tv-html`
Expected: os testes antigos passam; os novos que esperam `checagens` 1 ou 2 falham com 0.

- [ ] **Step 3: Implementar no `tv.html`**

Em `artifacts/signage/public/tv.html`, logo antes da função `fetchAndStart` (depois do bloco do pareamento):

```js
      // ---- Atualização do app Android (aviso do servidor) ----
      // O feed diz quando há versão nova do app ou quando o admin pediu a
      // checagem. A página só repassa ao app (window.SignageUpdate); quem
      // baixa, confere e instala é ele. Sem isso a box só descobriria a
      // versão nova na checagem própria, a cada 6 horas.
      var ATUALIZACAO_REPETIR_MS = 600000; // 10 min: outra chance se o download falhou
      var atualizacaoChave = null;         // version + '|' + forcedAt do último aviso repassado
      var atualizacaoEm = 0;               // quando o app foi avisado pela última vez

      function avisarAtualizacao(appUpdate) {
        try {
          if (!appUpdate) { return; }
          var ponte = window.SignageUpdate;
          if (!ponte || !ponte.check) { return; }
          var chave = String(appUpdate.version) + '|' + String(appUpdate.forcedAt);
          var agora = Date.now();
          if (chave === atualizacaoChave && agora - atualizacaoEm < ATUALIZACAO_REPETIR_MS) { return; }
          // Marca antes de chamar: ponte que lança não vira aviso a cada feed.
          atualizacaoChave = chave;
          atualizacaoEm = agora;
          ponte.check();
        } catch (e) {}
      }
```

Em `fetchAndStart`, logo depois da linha `aplicarMusica(data.music);`:

```js
          // Também antes do teste de lista vazia: TV sem peças se atualiza igual.
          avisarAtualizacao(data.appUpdate);
```

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @workspace/signage exec vitest run tv-html`
Expected: PASS em todo o arquivo.

Run: `grep -nE "^\s*(let|const) |=>|\`" artifacts/signage/public/tv.html | head`
Expected: nenhuma linha (o arquivo segue ES5).

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -m "feat(tv): página repassa ao app o aviso de atualização do feed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ponte `window.SignageUpdate` no app Android

**Files:**
- Create: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/AtualizacaoPelaPagina.kt`
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateState.kt`
- Modify: `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt`
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdateStateTest.kt` (criar)
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/AtualizacaoPelaPaginaTest.kt` (criar)
- Test: `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/MainActivityUpdateTest.kt` (acrescentar)
- Test: `artifacts/android-tv/app/src/androidTest/java/com/smarttvads/signage/TvScreenTest.kt` (acrescentar)

**Interfaces:**
- Consumes: nada das outras tarefas (o `tv.html` do Task 4 chama `window.SignageUpdate.check()`).
- Produces:
  - `UpdateState.canCheck(): Boolean`
  - `class AtualizacaoPelaPagina(handler: Handler, pedir: () -> Unit)` com `@JavascriptInterface fun check()` e `NOME_NA_PAGINA = "SignageUpdate"`.
  - `MainActivity.atualizacaoPelaPagina` (`internal`, para o teste).

- [ ] **Step 1: Testes da guarda e da ponte**

Criar `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/UpdateStateTest.kt`:

```kotlin
package com.smarttvads.signage

import android.content.Intent
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A mesma guarda vale para a checagem periódica e para o aviso da página:
 * checar de novo com uma sessão em andamento faria o instalador abandonar a
 * sessão que a pessoa está confirmando.
 */
@RunWith(RobolectricTestRunner::class)
class UpdateStateTest {
    @After
    fun limpa() {
        UpdateState.installed() // reseta pendingConfirmation/pendingVersion e activeSessionId
        UpdateState.listener = null
    }

    @Test
    fun `sem nada em andamento pode checar`() {
        assertTrue(UpdateState.canCheck())
    }

    @Test
    fun `com atualizacao esperando o OK nao checa`() {
        UpdateState.ready("1.2.0", Intent("confirmar"))
        assertFalse(UpdateState.canCheck())
    }

    @Test
    fun `com sessao do instalador em andamento nao checa`() {
        UpdateState.sessionStarted(7)
        assertFalse(UpdateState.canCheck())
    }

    @Test
    fun `depois de instalada volta a poder checar`() {
        UpdateState.sessionStarted(7)
        UpdateState.ready("1.2.0", Intent("confirmar"))
        UpdateState.installed()
        assertTrue(UpdateState.canCheck())
    }

    @Test
    fun `depois de falhar volta a poder checar`() {
        UpdateState.sessionStarted(7)
        UpdateState.failed(aborted = false)
        assertTrue(UpdateState.canCheck())
    }
}
```

Criar `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/AtualizacaoPelaPaginaTest.kt`:

```kotlin
package com.smarttvads.signage

import android.os.Handler
import android.os.Looper
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/**
 * O tv.html chama `window.SignageUpdate.check()` quando o feed avisa de uma
 * versão nova. A chamada chega numa thread da WebView; o pedido só pode ser
 * entregue na principal, onde vivem o UpdateState e os timers da Activity.
 */
@RunWith(RobolectricTestRunner::class)
class AtualizacaoPelaPaginaTest {
    private var pedidos = 0
    private val handler = Handler(Looper.getMainLooper())
    private val ponte = AtualizacaoPelaPagina(handler) { pedidos++ }

    private fun rodarPrincipal() = shadowOf(Looper.getMainLooper()).idle()

    @Test
    fun `nome que o tv html procura em window`() {
        assertEquals("SignageUpdate", AtualizacaoPelaPagina.NOME_NA_PAGINA)
    }

    @Test
    fun `check entrega o pedido na thread principal, nao na da chamada`() {
        ponte.check()
        // O looper do Robolectric só roda quando mandado: ainda não entregou.
        assertEquals(0, pedidos)
        rodarPrincipal()
        assertEquals(1, pedidos)
    }

    @Test
    fun `cada chamada vira um pedido`() {
        ponte.check()
        ponte.check()
        rodarPrincipal()
        assertEquals(2, pedidos)
    }

    @Test
    fun `pedido pendente some quando a Activity limpa o handler`() {
        ponte.check()
        handler.removeCallbacksAndMessages(null)
        rodarPrincipal()
        assertEquals(0, pedidos)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests 'com.smarttvads.signage.UpdateStateTest' --tests 'com.smarttvads.signage.AtualizacaoPelaPaginaTest'`
Expected: falha de compilação — `canCheck` e `AtualizacaoPelaPagina` não existem.

- [ ] **Step 3: Implementar a guarda e a ponte**

Em `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/UpdateState.kt`, logo depois da declaração de `var listener: Listener? = null`:

```kotlin
    /**
     * Pode checar atualização agora? Não com confirmação esperando o OK nem
     * com sessão do instalador em andamento: uma checagem nova chamaria
     * prepare() de novo, e a varredura de sessões velhas mataria a que está
     * sendo confirmada. Vale para a checagem periódica e para o aviso da página.
     */
    fun canCheck(): Boolean = pendingConfirmation == null && activeSessionId == null
```

Criar `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/AtualizacaoPelaPagina.kt`:

```kotlin
package com.smarttvads.signage

import android.os.Handler
import android.webkit.JavascriptInterface

/**
 * Ponte `window.SignageUpdate`: o tv.html chama `check()` quando o feed do
 * servidor avisa que há versão nova do app (ou que o admin pediu a checagem).
 * É o que faz a box se atualizar em minutos em vez de esperar a checagem
 * periódica de 6 horas.
 *
 * A página só pede a checagem. De onde baixar e o que instalar seguem fixos
 * no build (UPDATE_BASE_URL) e conferidos por SHA-256, então expor isto a
 * qualquer frame da página — inclusive o iframe do YouTube — não deixa
 * ninguém instalar nada: o pior caso é uma checagem a mais.
 */
class AtualizacaoPelaPagina(
    private val handler: Handler,
    private val pedir: () -> Unit,
) {
    // Chamado pelo tv.html numa thread da WebView; o UpdateState e os timers
    // da Activity só podem ser tocados na principal.
    @JavascriptInterface
    fun check() {
        handler.post { pedir() }
    }

    companion object {
        /** Nome que o tv.html procura em `window`. */
        const val NOME_NA_PAGINA = "SignageUpdate"
    }
}
```

- [ ] **Step 4: Rodar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests 'com.smarttvads.signage.UpdateStateTest' --tests 'com.smarttvads.signage.AtualizacaoPelaPaginaTest'`
Expected: PASS (5 + 4 testes).

- [ ] **Step 5: Teste da Activity**

Em `artifacts/android-tv/app/src/test/java/com/smarttvads/signage/MainActivityUpdateTest.kt`, depois do teste `checa 2 min depois de abrir e depois a cada 6 h`:

```kotlin
    @Test
    fun `aviso da pagina checa na hora, sem esperar os 2 min`() {
        val a = abrir()
        a.atualizacaoPelaPagina.check()
        passar(0)
        assertEquals(1, checagens)
    }

    @Test
    fun `aviso da pagina nao tira a checagem periodica do lugar`() {
        val a = abrir()
        a.atualizacaoPelaPagina.check()
        passar(0)
        passar(MainActivity.UPDATE_FIRST_CHECK_MS)
        assertEquals(2, checagens)
    }

    // Atualização já baixada, esperando o OK: checar de novo refaria a sessão
    // e a pessoa perderia a confirmação que está na tela.
    @Test
    fun `aviso da pagina nao checa com atualizacao esperando o OK`() {
        val a = abrir()
        UpdateState.ready("1.2.0", Intent("confirmar"))
        a.atualizacaoPelaPagina.check()
        passar(0)
        assertEquals(0, checagens)
        assertEquals("confirmar", UpdateState.pendingConfirmation?.action)
    }

    @Test
    fun `aviso da pagina nao checa com sessao do instalador em andamento`() {
        val a = abrir()
        UpdateState.sessionStarted(7)
        a.atualizacaoPelaPagina.check()
        passar(0)
        assertEquals(0, checagens)
    }

    @Test
    fun `aviso que chega depois de a Activity fechar nao checa nem quebra`() {
        val c = Robolectric.buildActivity(MainActivity::class.java)
        MainActivity.updateControllerFactory = {
            UpdateController(1, semVersaoNova, UpdateController.Installer { _, _ -> }, Executor { it.run() })
        }
        val a = c.setup().get()
        c.pause().stop().destroy()
        a.atualizacaoPelaPagina.check()
        passar(0)
        assertEquals(0, checagens)
    }
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest --tests 'com.smarttvads.signage.MainActivityUpdateTest'`
Expected: falha de compilação — `atualizacaoPelaPagina` não existe em `MainActivity`.

- [ ] **Step 7: Ligar a ponte na Activity**

Em `artifacts/android-tv/app/src/main/java/com/smarttvads/signage/MainActivity.kt`:

Junto de `private lateinit var musica: MusicaDeFundo`:

```kotlin
    internal lateinit var atualizacaoPelaPagina: AtualizacaoPelaPagina
```

E uma flag para o aviso que chega tarde, junto das outras propriedades:

```kotlin
    // Aviso da página pode chegar depois do onDestroy (thread da WebView):
    // sem isto, entraria no handler já limpo e checaria numa Activity morta.
    private var destruida = false
```

Trocar o `Runnable` `updateCheck` para usar o caminho comum (mantendo o comentário que já existe acima dele):

```kotlin
    private val updateCheck = object : Runnable {
        override fun run() {
            checarAtualizacao()
            handler.postDelayed(this, UPDATE_INTERVAL_MS)
        }
    }

    /** Um caminho só para a checagem periódica e para o aviso da página. */
    private fun checarAtualizacao() {
        if (destruida) return
        if (UpdateState.canCheck()) updateController.check()
    }
```

Em `onCreate`, logo depois de `musica = MusicaDeFundo(this)`:

```kotlin
        atualizacaoPelaPagina = AtualizacaoPelaPagina(handler) { checarAtualizacao() }
```

Em `onDestroy`, como primeira linha do corpo:

```kotlin
        destruida = true
```

Em `createWebView`, logo depois de `view.addJavascriptInterface(musica, MusicaDeFundo.NOME_NA_PAGINA)`:

```kotlin
        view.addJavascriptInterface(atualizacaoPelaPagina, AtualizacaoPelaPagina.NOME_NA_PAGINA)
```

- [ ] **Step 8: Teste instrumentado (não roda no CI nem sem emulador)**

Em `artifacts/android-tv/app/src/androidTest/java/com/smarttvads/signage/TvScreenTest.kt`, depois do teste `dentroDoAppSemAvisoDeTelaCheia`:

```kotlin
    @Test
    fun paginaEnxergaAPonteDeAtualizacao() {
        waitFor(pareando)
        assertEquals("\"function\"", js("typeof window.SignageUpdate.check"))
    }
```

Este teste só compila aqui; rodar exige emulador ou box ligada (`./gradlew :app:connectedDebugAndroidTest`). Registrar no fim da tarefa se foi rodado ou não.

- [ ] **Step 9: Rodar a suíte do app**

Run: `cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest :app:assembleDebug :app:compileDebugAndroidTestKotlin`
Expected: BUILD SUCCESSFUL, todos os testes unitários passam e o teste instrumentado compila.

- [ ] **Step 10: Commit**

```bash
git add artifacts/android-tv/app/src
git commit -m "feat(android-tv): página manda o app checar atualização na hora" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Botões no `/parque`

**Files:**
- Modify: `artifacts/signage/src/lib/fleet.ts`
- Modify: `artifacts/signage/src/pages/fleet.tsx`
- Test: `artifacts/signage/src/lib/__tests__/fleet.test.ts` (acrescentar)
- Test: `artifacts/signage/src/pages/__tests__/fleet.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `useRequestFleetUpdate` de `@workspace/api-client-react` (Task 3); `updateRequestedAt` em cada TV de `GET /fleet` (Task 3).
- Produces:
  - `FleetRow.updateRequestedAt: string | null`
  - `updateRequestedLabel(updateRequestedAt: string | null, now: Date): string | null`

- [ ] **Step 1: Teste do rótulo**

Em `artifacts/signage/src/lib/__tests__/fleet.test.ts`:

Acrescentar `updateRequestedLabel` ao import de `'../fleet'` e `updateRequestedAt: null,` aos valores padrão de `tv(...)`.

No fim do arquivo:

```ts
describe('updateRequestedLabel', () => {
  const NOW = new Date('2026-10-02T15:00:00.000Z');

  it('TV sem pedido não tem rótulo', () => {
    expect(updateRequestedLabel(null, NOW)).toBeNull();
  });

  it('diz há quanto tempo o admin pediu', () => {
    expect(updateRequestedLabel('2026-10-02T14:59:40.000Z', NOW)).toBe('atualização pedida agora');
    expect(updateRequestedLabel('2026-10-02T14:58:00.000Z', NOW)).toBe('atualização pedida há 2 min');
    expect(updateRequestedLabel('2026-10-02T14:46:00.000Z', NOW)).toBe('atualização pedida há 14 min');
  });

  // O servidor para de avisar a TV depois de 15 minutos; o rótulo some junto,
  // senão o admin acharia que o pedido ainda está valendo.
  it('pedido de 15 minutos ou mais não aparece', () => {
    expect(updateRequestedLabel('2026-10-02T14:45:00.000Z', NOW)).toBeNull();
    expect(updateRequestedLabel('2026-10-01T15:00:00.000Z', NOW)).toBeNull();
  });

  it('pedido alguns segundos no futuro é "agora"', () => {
    expect(updateRequestedLabel('2026-10-02T15:00:20.000Z', NOW)).toBe('atualização pedida agora');
  });

  it('data inválida não tem rótulo', () => {
    expect(updateRequestedLabel('não é data', NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run lib/__tests__/fleet`
Expected: FAIL — `updateRequestedLabel` não é exportada.

- [ ] **Step 3: Implementar o rótulo**

Em `artifacts/signage/src/lib/fleet.ts`:

Na interface `FleetRow`, depois de `outdated: boolean;`:

```ts
  updateRequestedAt: string | null;
```

No fim do arquivo:

```ts
/** Mesmo prazo do servidor (lib/tv-app-update.ts): depois disso ele para de avisar a TV. */
const UPDATE_REQUEST_TTL_MINUTES = 15;

/** Rótulo do pedido de atualização, enquanto ele ainda vale. Nulo = sem rótulo. */
export function updateRequestedLabel(updateRequestedAt: string | null, now: Date): string | null {
  if (!updateRequestedAt) return null;
  const ms = now.getTime() - new Date(updateRequestedAt).getTime();
  if (!Number.isFinite(ms)) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes >= UPDATE_REQUEST_TTL_MINUTES) return null;
  // Inclui pedido "no futuro": relógio do banco à frente do navegador.
  if (minutes < 1) return 'atualização pedida agora';
  return `atualização pedida há ${minutes} min`;
}
```

- [ ] **Step 4: Rodar**

Run: `pnpm --filter @workspace/signage exec vitest run lib/__tests__/fleet`
Expected: PASS.

- [ ] **Step 5: Teste da página**

Em `artifacts/signage/src/pages/__tests__/fleet.test.tsx`:

Trocar os imports do topo para incluir `waitFor` e o `Toaster`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react';
```

```tsx
import { Toaster } from '@/components/ui/toaster';
```

Em `tv(...)`, acrescentar `updateRequestedAt: null,` aos valores padrão.

Em `renderPage`, renderizar o `Toaster` junto da página:

```tsx
    <QueryClientProvider client={client}>
      <Fleet />
      <Toaster />
    </QueryClientProvider>,
```

Depois de `stubFleet`, acrescentar um stub que separa o GET do POST:

```tsx
/** GET devolve o parque; POST do pedido responde com o status pedido e fica registrado. */
function stubComPedido(parque: unknown, statusDoPedido = 200) {
  const pedidos: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      const method = init?.method ?? (typeof input === 'string' ? 'GET' : (input as Request).method ?? 'GET');
      if (method === 'POST' && url.includes('/fleet/update-requests')) {
        pedidos.push(JSON.parse(String(init?.body ?? '{}')));
        return statusDoPedido === 200 ? json({ requested: 1 }) : json({ error: 'boom' }, statusDoPedido);
      }
      return json(parque);
    }),
  );
  return pedidos;
}
```

No `afterEach`, restaurar também os mocks (o `window.confirm` é espionado nos testes novos):

```tsx
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
```

Dentro do `describe('Parque de TVs', …)`, no fim:

```tsx
  it('TV com app tem o botão de atualizar; TV no navegador não', async () => {
    stubFleet(PARQUE);
    renderPage();
    const balcao = await screen.findByTestId('fleet-row-1');
    expect(within(balcao).getByRole('button', { name: 'Atualizar agora' })).toBeInTheDocument();
    expect(within(screen.getByTestId('fleet-row-3')).queryByRole('button', { name: 'Atualizar agora' })).not.toBeInTheDocument();
  });

  it('"Atualizar agora" pede a atualização só daquela TV', async () => {
    const pedidos = stubComPedido(PARQUE);
    renderPage();
    const acougue = await screen.findByTestId('fleet-row-2');
    await userEvent.click(within(acougue).getByRole('button', { name: 'Atualizar agora' }));

    await waitFor(() => expect(pedidos).toEqual([{ deviceIds: [2] }]));
    expect(await screen.findByText('Pedido enviado. A TV checa no próximo minuto.')).toBeInTheDocument();
  });

  it('"Atualizar todas" pede confirmação e manda sem lista', async () => {
    const pedidos = stubComPedido(PARQUE);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Balcão');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar todas' }));

    expect(confirmar).toHaveBeenCalledWith('Mandar todas as TVs checarem atualização agora?');
    await waitFor(() => expect(pedidos).toEqual([{}]));
    expect(await screen.findByText('Pedido enviado. As TVs checam no próximo minuto.')).toBeInTheDocument();
  });

  it('"Atualizar todas" cancelado não manda nada', async () => {
    const pedidos = stubComPedido(PARQUE);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByText('Balcão');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar todas' }));
    expect(pedidos).toEqual([]);
  });

  it('mostra há quanto tempo a atualização foi pedida', async () => {
    stubFleet({
      latestVersion: '1.9.0',
      devices: [
        tv({ id: 1, name: 'Balcão', updateRequestedAt: minutosAtras(2) }),
        tv({ id: 2, name: 'Açougue', updateRequestedAt: minutosAtras(40) }),
      ],
    });
    renderPage();
    const balcao = await screen.findByTestId('fleet-row-1');
    expect(balcao).toHaveTextContent('atualização pedida há 2 min');
    expect(screen.getByTestId('fleet-row-2')).not.toHaveTextContent('atualização pedida');
  });

  it('erro no pedido mostra o aviso', async () => {
    stubComPedido(PARQUE, 500);
    renderPage();
    const balcao = await screen.findByTestId('fleet-row-1');
    await userEvent.click(within(balcao).getByRole('button', { name: 'Atualizar agora' }));
    expect(await screen.findByText('Não foi possível enviar o pedido.')).toBeInTheDocument();
  });

  it('explica que as TVs se atualizam sozinhas e onde é preciso o OK', async () => {
    stubFleet(PARQUE);
    renderPage();
    expect(await screen.findByText(/As TVs se atualizam sozinhas em poucos minutos depois de cada release/)).toBeInTheDocument();
    expect(screen.getByText(/Em Android 11 ou anterior, alguém precisa apertar OK no controle/)).toBeInTheDocument();
  });

  it('parque vazio não oferece "Atualizar todas"', async () => {
    stubFleet({ latestVersion: '1.9.0', devices: [] });
    renderPage();
    await screen.findByText('Nenhuma TV cadastrada.');
    expect(screen.queryByRole('button', { name: 'Atualizar todas' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run pages/__tests__/fleet`
Expected: os testes antigos passam; os novos falham por não achar os botões, o rótulo e o texto de ajuda.

- [ ] **Step 7: Implementar na página**

Em `artifacts/signage/src/pages/fleet.tsx`:

Imports — trocar a linha do `@tanstack`/client e acrescentar o que falta:

```tsx
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Monitor, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useGetFleet, useRequestFleetUpdate, getGetFleetQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { filterFleet, fleetCounts, lastSeenLabel, updateRequestedLabel, versionsInUse, type FleetFilter, type FleetRow } from '@/lib/fleet';
```

(As linhas antigas de `lucide-react`, `@workspace/api-client-react` e `@/lib/fleet` são substituídas por estas.)

No componente `Fleet`, depois do `useGetFleet(...)`:

```tsx
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // O servidor só marca o pedido; a TV recebe o aviso no próximo feed (60 s),
  // checa, baixa e — onde o Android exige — espera o OK no controle.
  const requestUpdate = useRequestFleetUpdate({
    mutation: {
      onSuccess: (_result, variables) => {
        queryClient.invalidateQueries({ queryKey: getGetFleetQueryKey() });
        toast({
          title: variables.data.deviceIds
            ? 'Pedido enviado. A TV checa no próximo minuto.'
            : 'Pedido enviado. As TVs checam no próximo minuto.',
        });
      },
      onError: () => toast({ title: 'Não foi possível enviar o pedido.', variant: 'destructive' }),
    },
  });

  function atualizarTodas() {
    if (!window.confirm('Mandar todas as TVs checarem atualização agora?')) return;
    requestUpdate.mutate({ data: {} });
  }
```

Trocar o cabeçalho da página (o `<div className="mb-8">` com o `h1`) por:

```tsx
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Parque de TVs</h1>
          <p className="mt-1 text-muted-foreground">Quem está no ar agora e que versão do app cada TV roda.</p>
        </div>
        {devices.length > 0 ? (
          <Button variant="outline" onClick={atualizarTodas} disabled={requestUpdate.isPending}>
            <RefreshCw className="mr-2 h-4 w-4" />Atualizar todas
          </Button>
        ) : null}
      </div>
```

No bloco "Versões em uso", dentro do `CardHeader`, depois do parágrafo da última versão:

```tsx
              <p className="text-sm text-muted-foreground">
                As TVs se atualizam sozinhas em poucos minutos depois de cada release. Em Android 11 ou anterior,
                alguém precisa apertar OK no controle.
              </p>
```

Na tabela, acrescentar uma coluna sem título no cabeçalho, depois de `Versão`:

```tsx
                      <th className="pb-2 font-medium"><span className="sr-only">Ações</span></th>
```

O rótulo do pedido é calculado uma vez por linha. Trocar a abertura do `map` das linhas de `{rows.map((d) => (` para

```tsx
                    {rows.map((d) => {
                      const pedido = updateRequestedLabel(d.updateRequestedAt, now);
                      return (
```

e o fechamento correspondente de `))}` para `); })}`. Na célula da versão, acrescentar o rótulo depois do selo `Desatualizada`:

```tsx
                        <td className="py-3">
                          <span className="flex flex-wrap items-center gap-2 tabular-nums">
                            {d.appVersion ?? 'navegador'}
                            {d.outdated ? <Badge variant="outline">Desatualizada</Badge> : null}
                          </span>
                          {pedido ? <span className="block text-xs text-muted-foreground">{pedido}</span> : null}
                        </td>
```

E, como última célula de cada linha:

```tsx
                        <td className="py-3 text-right">
                          {/* Só TV que roda o app: no navegador não há o que atualizar. */}
                          {d.appVersion !== null ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={requestUpdate.isPending}
                              onClick={() => requestUpdate.mutate({ data: { deviceIds: [d.id] } })}
                            >
                              Atualizar agora
                            </Button>
                          ) : null}
                        </td>
```

- [ ] **Step 8: Rodar**

Run: `pnpm --filter @workspace/signage exec vitest run pages/__tests__/fleet lib/__tests__/fleet`
Expected: PASS.

Se o orval tiver gerado as variáveis da mutation com outro formato (conferir a assinatura de `useRequestFleetUpdate` em `lib/api-client-react/src/generated/api.ts`), ajustar as duas chamadas de `mutate` e o `variables.data.deviceIds` do `onSuccess` ao formato gerado; os testes continuam valendo como estão, porque olham o corpo do POST.

- [ ] **Step 9: Suíte completa e tipos**

Run: `pnpm --filter @workspace/signage exec vitest run`
Expected: PASS em toda a suíte web.

Run: `pnpm run typecheck`
Expected: sem erro.

- [ ] **Step 10: Commit**

```bash
git add artifacts/signage/src/lib/fleet.ts artifacts/signage/src/lib/__tests__/fleet.test.ts artifacts/signage/src/pages/fleet.tsx artifacts/signage/src/pages/__tests__/fleet.test.tsx
git commit -m "feat(portal): botões para mandar as TVs checarem atualização" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Depois das tarefas

- **Suíte inteira:** `pnpm run typecheck && pnpm --filter @workspace/api-server exec vitest run && pnpm --filter @workspace/signage exec vitest run && (cd artifacts/android-tv && ./gradlew :app:testDebugUnitTest :app:assembleDebug)`.
- **Ponta a ponta local** (Postgres descartável + API compilada, como no parque): feed com `SignageApp/1.0.0` devolve `appUpdate` com a última release real; `POST /fleet/update-requests` marca o pedido e o feed seguinte leva `forcedAt`; TV em dia sem pedido recebe `appUpdate: null`.
- **Não automatizável** (dizer no PR o que não foi feito): o teste instrumentado da WebView (`paginaEnxergaAPonteDeAtualizacao`) e a instalação de verdade numa box. Conferência na box real depois do merge: (1) esperar a box receber esta versão pela checagem de 6 h; (2) na release seguinte, ela deve começar a baixar em ~2 minutos; (3) "Atualizar agora" no `/parque` mostra "atualização pedida agora" e a box checa no feed seguinte.
- **PR:** título `feat(android-tv): atualização em minutos após a release e gatilho pelo admin` (sobe minor). Merge com `gh pr merge --merge`. Não escrever `BREAKING CHANGE:` no início de linha da descrição.
- **Deploy:** a migration `0018` roda no build da Vercel; coluna nula, servidor antigo e novo convivem. O `tv.html` novo chega às TVs na recarga diária da página; a ponte nova só existe na box depois que ela instalar esta versão.
