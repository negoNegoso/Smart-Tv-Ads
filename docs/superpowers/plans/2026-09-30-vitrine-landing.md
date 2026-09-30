# TV vitrine na landing — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TV do hero da landing (e do slide "Solução" da `/apresentacao`) passa a ser o player real, espelhando o feed de duas TVs "vitrine" da Smart Vale TV, com cada exibição contando como play.

**Architecture:** Flag `devices.showcase` marca a vitrine (uma por orientação de tela). `loadDeviceSlides` ganha o modo vitrine (todas as campanhas no ar, sem alvo nem concorrência, sem painéis). Duas rotas públicas sem `deviceKey` (`GET /public/vitrine/:orientation/feed`, `POST /public/vitrine/plays`). O miolo de `pages/display.tsx` vira `PlayerStage`, usado pela TV e pelo `TvMockup`.

**Tech Stack:** Express 5 + drizzle (api-server), Postgres + drizzle-kit (lib/db), OpenAPI + orval (lib/api-spec → api-zod / api-client-react), React + react-query + Tailwind + vitest/testing-library (signage).

**Spec:** `docs/superpowers/specs/2026-09-30-vitrine-landing-design.md`

## Global Constraints

- Branch `feat/vitrine-landing`; commits no formato `tipo(escopo): descrição em português`, imperativo, sem ponto final, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português, explicando o porquê. Acentos como UTF-8 real, nunca `\uXXXX`.
- `public/tv.html` (player ES5 das TVs Android) **não muda**.
- Não editar `versionName`/`versionCode` nem criar tag.
- Uma vitrine por orientação de tela: `landscape` = horizontal; `portrait_right` e `portrait_left` = vertical.
- Mensagem do 409: `Já existe uma vitrine <horizontal|vertical>: <nome>`.
- Corpo do 404 das rotas públicas da vitrine: `{ "error": "Showcase not found" }`.
- Cache do feed: `public, s-maxage=60, stale-while-revalidate=120`.
- Lote de plays: máximo 10 itens. Robô (`isBotUserAgent`) → `202` sem gravar.
- Vídeo sempre mudo na landing. Refetch do feed na landing: 60 s. Envio da fila de plays: 15 s e no `pagehide`.
- Código gerado (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`) é commitado; regerar com `pnpm --filter @workspace/api-spec run codegen`, nunca editar à mão.
- Migration gerada com `cd lib/db && DATABASE_URL=postgres://x@localhost/x pnpm run generate` (o banco não é acessado; o deploy aplica via `migrate.mjs`).

## Review Focus

1. **Vitrine inflando os números públicos da landing** — a TV vitrine fica "online" com as visitas; "telas ativas" do `/public/stats` não pode contar vitrine. Coberto na Task 6.
2. **Visitante com aba em segundo plano / TV fora da tela** — não pode contar play nem avançar rodízio. Coberto na Task 10 (teste com `document.hidden` e IntersectionObserver).
3. **Visitante fecha a aba com plays na fila** — `pagehide` manda o que houver por `sendBeacon`; fila nunca passa de 10 por envio nem cresce sem limite (teto 100). Coberto na Task 9.
4. **TV física comum não pode mudar de comportamento** — refactor do `PlayerStage` mantém avanço por duração, play 1× por exibição e vídeo "natural" avançando no fim. Coberto na Task 8 (testes do `PlayerStage`) e no modo não-vitrine da Task 3 (teste de alvo `devices` ainda filtrando TV comum).
5. **Mudar orientação de uma vitrine para a de outra vitrine** — tem de dar 409, senão ficam duas vitrines verticais. Coberto na Task 2.

---

### Task 1: Contrato — coluna `showcase`, migration e OpenAPI

**Files:**
- Modify: `lib/db/src/schema/devices.ts`
- Create: `lib/db/drizzle/0015_*.sql` (+ `meta/0015_snapshot.json`, `meta/_journal.json`, gerados)
- Modify: `lib/api-spec/openapi.yaml` (paths `/public/...`, schemas `Device`, `DeviceUpdate`, novo `VitrinePlaysInput`)
- Regenerate: `lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`
- Modify: `artifacts/api-server/src/routes/devices.ts` (selects de `getDeviceWithClient` e `GET /devices`)
- Test: `artifacts/api-server/src/routes/__tests__/device-update.test.ts`

**Interfaces:**
- Produces: coluna `devicesTable.showcase: boolean` (not null, default false); `Device.showcase: boolean` (obrigatório na resposta); `DeviceUpdate.showcase?: boolean`; zod `GetVitrineFeedParams` (`{ orientation: "landscape" | "portrait" }`), `GetVitrineFeedResponse` (= `DisplayFeed`), `RecordVitrinePlaysBody` (`{ orientation, plays: PlayBatchItem[] }`, 1..10), `RecordVitrinePlaysResponse` (= `PlayBatchResult`); react-query `useGetVitrineFeed(orientation, options)`, `getGetVitrineFeedQueryKey(orientation)`, `recordVitrinePlays(body)`.

- [ ] **Step 1: Teste que a resposta do device traz `showcase`**

Em `device-update.test.ts`, acrescentar `showcase: false` ao objeto `DEVICE` e ao mock de `devicesTable` (`showcase: "showcase"`), e este caso novo no `describe` existente:

```ts
  it("devolve se a TV é vitrine", async () => {
    selectResult = [{ ...DEVICE, showcase: true }];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ name: "Vitrine horizontal" });

    expect(res.status).toBe(200);
    expect(res.body.showcase).toBe(true);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/device-update.test.ts`
Expected: FAIL no caso novo (`showcase` some: o `UpdateDeviceResponse` atual não tem o campo e o zod o descarta).

- [ ] **Step 3: Coluna no schema**

Em `lib/db/src/schema/devices.ts`, importar `boolean` de `drizzle-orm/pg-core` e acrescentar depois de `lastSeenAt`:

```ts
    // TV vitrine da landing: recebe toda campanha no ar, sem alvo nem
    // concorrência, e é espelhada na página pública. Uma por orientação de
    // tela — a regra fica no PATCH /devices/:id (retrato tem dois valores).
    showcase: boolean("showcase").notNull().default(false),
```

- [ ] **Step 4: Gerar a migration**

Run: `cd lib/db && DATABASE_URL=postgres://x@localhost/x pnpm run generate`
Expected: novo `drizzle/0015_*.sql` com exatamente `ALTER TABLE "devices" ADD COLUMN "showcase" boolean DEFAULT false NOT NULL;`. Conferir o arquivo; se trouxer qualquer outra alteração, parar e investigar (snapshot defasado).

- [ ] **Step 5: OpenAPI**

Em `lib/api-spec/openapi.yaml`:

Logo depois do bloco `/public/pieces:` (antes do comentário `# ── Announcements`), acrescentar:

```yaml
  /public/vitrine/{orientation}/feed:
    get:
      operationId: getVitrineFeed
      tags: [public]
      summary: Rotação da TV vitrine da Smart Vale, para o player da landing
      description: >
        Mesmo formato de /display/{deviceKey}/feed, sem expor a key: a
        vitrine é achada pela orientação de tela. Cada consulta marca a
        vitrine como vista (lastSeenAt).
      parameters:
        - name: orientation
          in: path
          required: true
          schema: { type: string, enum: [landscape, portrait] }
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/DisplayFeed"
        "400":
          description: Orientação inválida
        "404":
          description: Nenhuma vitrine nessa orientação

  /public/vitrine/plays:
    post:
      operationId: recordVitrinePlays
      tags: [public]
      summary: Exibições da vitrine vistas por visitantes da landing
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/VitrinePlaysInput"
      responses:
        "200":
          description: Lote processado
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PlayBatchResult"
        "202":
          description: Robô; nada gravado
        "400":
          description: Corpo inválido
        "404":
          description: Nenhuma vitrine nessa orientação
```

No schema `Device`: acrescentar `showcase` a `required` e a propriedade:

```yaml
      required: [id, clientId, clientName, name, deviceKey, orientation, showcase, createdAt]
      ...
        showcase: { type: boolean }
```

No schema `DeviceUpdate`, acrescentar:

```yaml
        showcase: { type: boolean }
```

Depois de `PlayBatchResult`, acrescentar:

```yaml
    VitrinePlaysInput:
      type: object
      required: [orientation, plays]
      properties:
        orientation: { type: string, enum: [landscape, portrait] }
        plays:
          type: array
          minItems: 1
          # Lote pequeno: a rota é pública, e um visitante gera poucas
          # exibições a cada 15 s.
          maxItems: 10
          items:
            $ref: "#/components/schemas/PlayBatchItem"
```

- [ ] **Step 6: Regerar clientes**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: sem erro; `grep -n "GetVitrineFeedParams\|RecordVitrinePlaysBody" lib/api-zod/src/generated/api.ts` acha os dois; `grep -n "useGetVitrineFeed" lib/api-client-react/src/generated/api.ts` acha o hook.

- [ ] **Step 7: Selects do device devolvem `showcase`**

Em `artifacts/api-server/src/routes/devices.ts`, no select de `getDeviceWithClient` e no de `GET /devices`, acrescentar depois de `lastSeenAt: devicesTable.lastSeenAt,`:

```ts
      showcase: devicesTable.showcase,
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/device-update.test.ts`
Expected: PASS (3 casos).

Run: `pnpm run typecheck`
Expected: sem erro. Se algum fixture de teste tipado como `Device` reclamar de `showcase`, acrescentar `showcase: false` nele.

- [ ] **Step 9: Commit**

```bash
git add lib/db lib/api-spec lib/api-zod lib/api-client-react artifacts/api-server/src/routes/devices.ts artifacts/api-server/src/routes/__tests__/device-update.test.ts
git commit -m "feat(db): flag de TV vitrine e contrato das rotas públicas da vitrine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: PATCH /devices/:id — uma vitrine por orientação de tela

**Files:**
- Create: `artifacts/api-server/src/lib/showcase.ts`
- Create: `artifacts/api-server/src/lib/__tests__/showcase.test.ts`
- Modify: `artifacts/api-server/src/routes/devices.ts` (handler `router.patch("/devices/:id", …)`)
- Test: `artifacts/api-server/src/routes/__tests__/device-update.test.ts`

**Interfaces:**
- Consumes: `devicesTable.showcase`, `UpdateDeviceBody` com `showcase?` (Task 1); `screenOrientationOf` de `@workspace/db/orientation`.
- Produces: `showcaseConflictMessage(target: { id: number; showcase: boolean; orientation: string }, others: Array<{ id: number; name: string; orientation: string }>): string | null` em `lib/showcase.ts`.

- [ ] **Step 1: Teste da regra pura**

`artifacts/api-server/src/lib/__tests__/showcase.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { showcaseConflictMessage } from "../showcase";

const OUTRAS = [
  { id: 2, name: "Vitrine horizontal", orientation: "landscape" },
  { id: 3, name: "Vitrine vertical", orientation: "portrait_right" },
];

describe("showcaseConflictMessage", () => {
  it("TV que não é vitrine nunca conflita", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: false, orientation: "landscape" }, OUTRAS)).toBeNull();
  });

  it("segunda vitrine horizontal conflita, com o nome da primeira", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: true, orientation: "landscape" }, OUTRAS)).toBe(
      "Já existe uma vitrine horizontal: Vitrine horizontal",
    );
  });

  it("retrato para a esquerda conflita com retrato para a direita: a tela é a mesma vertical", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: true, orientation: "portrait_left" }, OUTRAS)).toBe(
      "Já existe uma vitrine vertical: Vitrine vertical",
    );
  });

  it("a própria TV não conta como outra", () => {
    expect(
      showcaseConflictMessage({ id: 2, showcase: true, orientation: "landscape" }, OUTRAS),
    ).toBeNull();
  });

  it("vitrine sozinha na orientação passa", () => {
    expect(showcaseConflictMessage({ id: 1, showcase: true, orientation: "landscape" }, [OUTRAS[1]])).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/showcase.test.ts`
Expected: FAIL — `Cannot find module '../showcase'`.

- [ ] **Step 3: Implementar**

`artifacts/api-server/src/lib/showcase.ts`:

```ts
import { screenOrientationOf } from "@workspace/db/orientation";

const LABEL = { landscape: "horizontal", portrait: "vertical" } as const;

/**
 * A landing espelha uma vitrine por formato de tela. Duas vitrines no mesmo
 * formato deixariam a rota pública escolher uma ao acaso, e os números
 * ficariam divididos sem ninguém saber por quê.
 *
 * Compara pela tela que o público vê, não pelo valor bruto: retrato para a
 * direita e para a esquerda são a mesma TV em pé. Por isso a regra fica aqui
 * e não num índice único do banco.
 *
 * Devolve a mensagem do 409, ou null quando pode gravar.
 */
export function showcaseConflictMessage(
  target: { id: number; showcase: boolean; orientation: string },
  others: Array<{ id: number; name: string; orientation: string }>,
): string | null {
  if (!target.showcase) return null;
  const screen = screenOrientationOf(target.orientation);
  const clash = others.find((o) => o.id !== target.id && screenOrientationOf(o.orientation) === screen);
  return clash ? `Já existe uma vitrine ${LABEL[screen]}: ${clash.name}` : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/showcase.test.ts`
Expected: PASS (5 casos).

- [ ] **Step 5: Testes da rota**

Em `device-update.test.ts`, trocar o `selectResult` único por uma fila, porque o PATCH passa a fazer até três selects: TV atual; outras vitrines (só quando o estado final é vitrine); TV com cliente (resposta).

```ts
let selectQueue: unknown[][] = [];
```

No mock: `select: () => makeChain(selectQueue.shift() ?? [])`. No `beforeEach`: `selectQueue = [];` (remover `selectResult`). No teste existente "grava um retrato válido" (TV não vitrine, sem consulta às outras):

```ts
// 1) TV atual  2) TV com cliente (resposta)
selectQueue = [[{ id: 1, showcase: false, orientation: "landscape" }], [DEVICE]];
```

O teste "recusa valor fora do enum" não chega ao banco: fila vazia. O de "devolve se a TV é vitrine" usa `selectQueue = [[{ id: 1, showcase: true, orientation: "landscape" }], [], [{ ...DEVICE, showcase: true }]]`.

Novo `describe`:

```ts
describe("PATCH /devices/:id — vitrine", () => {
  it("liga a vitrine quando não há outra na mesma orientação", async () => {
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "landscape" }],
      [{ id: 9, name: "Vitrine vertical", orientation: "portrait_right" }],
      [{ ...DEVICE, orientation: "landscape", showcase: true }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showcase: true });

    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith({ showcase: true });
  });

  it("409 com o nome da vitrine que já ocupa a orientação, sem gravar", async () => {
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "portrait_left" }],
      [{ id: 9, name: "Vitrine vertical", orientation: "portrait_right" }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showcase: true });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Já existe uma vitrine vertical: Vitrine vertical");
    expect(setMock).not.toHaveBeenCalled();
  });

  it("girar uma vitrine para a orientação de outra também é 409", async () => {
    selectQueue = [
      [{ id: 1, showcase: true, orientation: "landscape" }],
      [{ id: 9, name: "Vitrine vertical", orientation: "portrait_right" }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ orientation: "portrait_left" });

    expect(res.status).toBe(409);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("desligar a vitrine não consulta as outras", async () => {
    selectQueue = [
      [{ id: 1, showcase: true, orientation: "landscape" }],
      [{ ...DEVICE, orientation: "landscape", showcase: false }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ showcase: false });

    expect(res.status).toBe(200);
    expect(res.body.showcase).toBe(false);
  });

  it("TV inexistente é 404", async () => {
    selectQueue = [[]];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/99").send({ showcase: true });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/device-update.test.ts`
Expected: FAIL nos casos de 409 e 404 (a rota ainda grava direto).

- [ ] **Step 7: Implementar na rota**

Em `routes/devices.ts`, importar `showcaseConflictMessage` de `../lib/showcase` e `ne` de `drizzle-orm`. No handler do PATCH, entre o parse do corpo e o `db.update`, inserir:

```ts
  const [current] = await db
    .select({ id: devicesTable.id, showcase: devicesTable.showcase, orientation: devicesTable.orientation })
    .from(devicesTable)
    .where(eq(devicesTable.id, params.data.id));
  if (!current) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  // Vale o estado depois do PATCH: ligar a vitrine e girar uma vitrine
  // existente caem na mesma regra.
  const next = {
    id: current.id,
    showcase: parsed.data.showcase ?? current.showcase,
    orientation: parsed.data.orientation ?? current.orientation,
  };
  if (next.showcase) {
    const others = await db
      .select({ id: devicesTable.id, name: devicesTable.name, orientation: devicesTable.orientation })
      .from(devicesTable)
      .where(and(eq(devicesTable.showcase, true), ne(devicesTable.id, current.id)));
    const conflict = showcaseConflictMessage(next, others);
    if (conflict) {
      res.status(409).json({ error: conflict });
      return;
    }
  }
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/device-update.test.ts`
Expected: PASS (todos).

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/lib/showcase.ts artifacts/api-server/src/lib/__tests__/showcase.test.ts artifacts/api-server/src/routes/devices.ts artifacts/api-server/src/routes/__tests__/device-update.test.ts
git commit -m "feat(api): uma TV vitrine por orientação de tela

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Feed em modo vitrine

**Files:**
- Modify: `artifacts/api-server/src/lib/device-feed.ts`
- Modify: `artifacts/api-server/src/routes/display.ts` (select de `loadForTv`)
- Modify: `artifacts/api-server/src/routes/devices.ts` (select de `GET /devices/:id/preview`)
- Modify: `artifacts/api-server/src/lib/portal/queries.ts` (`previewDevice`)
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `devicesTable.showcase` (Task 1); `campaignRunsOnDay` de `lib/ad-eligibility.ts`.
- Produces: `FeedDevice.showcase?: boolean` (ausente = `false`). `loadDeviceSlides(device, log, now?)` inalterada na assinatura; com `device.showcase === true` aplica o modo vitrine.

- [ ] **Step 1: Testes**

Em `display-slides.test.ts`, acrescentar `showcase: "showcase"` ao mock de `devicesTable` e, no fim do arquivo:

```ts
describe("GET /display/:deviceKey/feed — TV vitrine", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
  });

  // Campanha mirada em outra TV, e de concorrente do mesmo segmento: a TV
  // comum não mostra; a vitrine mostra, porque ela é a amostra da rede.
  const MIRADA_EM_OUTRA = {
    ...CAMPAIGN_ROW,
    announcementId: 404,
    campaignId: 6,
    targetMode: "devices" as const,
    deviceIds: [99],
    advertiserSegmentId: 3,
    advertiserCompanyId: 30,
  };

  it("vitrine recebe campanha de qualquer alvo e ignora concorrência", async () => {
    selectResults = [
      [{ ...DEVICE_ROW, segmentId: 3, showcase: true }],
      [PLAYLIST_ROW],
      [CAMPAIGN_ROW, MIRADA_EM_OUTRA],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    const ids = res.body.slides.map((s: { announcementId: number }) => s.announcementId);
    expect(ids).toEqual(expect.arrayContaining([CAMPAIGN_ROW.announcementId, 404, PLAYLIST_ROW.announcementId]));
  });

  it("vitrine não carrega painéis de lojista", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: true }], [PLAYLIST_ROW], [CAMPAIGN_ROW]];
    panelSlidesForClientMock.mockResolvedValue([PANEL_ROW]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(panelSlidesForClientMock).not.toHaveBeenCalled();
    const ids = res.body.slides.map((s: { announcementId: number }) => s.announcementId);
    expect(ids).not.toContain(PANEL_ROW.announcementId);
  });

  it("vitrine respeita os dias da semana da campanha", async () => {
    // Lista com um dia só, que não é hoje: basta escolher um dia diferente
    // do atual em São Paulo.
    const hoje = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date());
    const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(hoje);
    const outroDia = (idx + 1) % 7;
    selectResults = [
      [{ ...DEVICE_ROW, showcase: true }],
      [],
      [{ ...CAMPAIGN_ROW, weekdays: [outroDia] }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.slides).toEqual([]);
  });

  it("TV comum segue filtrando pelo alvo", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [], [MIRADA_EM_OUTRA]];
    panelSlidesForClientMock.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    expect(res.body.slides).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts`
Expected: FAIL nos dois primeiros casos da vitrine (campanha 404 filtrada; painel carregado).

- [ ] **Step 3: Implementar em `device-feed.ts`**

Importar `campaignRunsOnDay` junto de `filterEligibleSlides` (`import { campaignRunsOnDay, filterEligibleSlides } from "./ad-eligibility";`). Em `FeedDevice`, acrescentar:

```ts
  /** TV vitrine da landing. Ausente vale false (quem monta o device sem a coluna). */
  showcase?: boolean;
```

Trocar o bloco `eligibleCampaignSlides` e o carregamento de painéis por:

```ts
  // A vitrine é a amostra da rede na landing: toda campanha no ar entra,
  // sem alvo nem concorrência. Só a agenda vale — campanha que não roda hoje
  // também não roda em TV nenhuma.
  const eligibleCampaignSlides = device.showcase
    ? campaignSlides.filter((slide) => campaignRunsOnDay(slide.weekdays, now))
    : filterEligibleSlides(campaignSlides, device, now);

  // Terceira fonte: painéis que o próprio lojista publicou no portal. A
  // vitrine não tem lojista — mostra só o que foi pago e a playlist dela.
  // Para as outras TVs essa é a fonte menos crítica das três — uma falha aqui
  // (tabela ausente, lock, linha inválida) nunca pode apagar campanhas pagas e
  // a playlist do device que já estavam prontas para ir ao ar, então cai para
  // lista vazia.
  let panelSlides: Awaited<ReturnType<typeof panelSlidesForClient>> = [];
  if (!device.showcase) {
    try {
      panelSlides = await panelSlidesForClient(device.clientId);
    } catch (error) {
      log.error({ err: error }, "Could not load panel slides for device");
    }
  }
```

- [ ] **Step 4: Selects que montam o `FeedDevice` levam `showcase`**

Acrescentar `showcase: devicesTable.showcase,` depois de `orientation: devicesTable.orientation,` em:
- `routes/display.ts`, `loadForTv`;
- `routes/devices.ts`, `GET /devices/:id/preview` (a prévia do admin tem de mostrar o mesmo que a vitrine exibe);
- `lib/portal/queries.ts`, `previewDevice`.

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run`
Expected: PASS (suíte inteira do api-server; `device-preview.test.ts` e `portal-device-preview.test.ts` seguem verdes — se o mock de `devicesTable` deles não tiver `showcase`, o select recebe `undefined` na chave e o device fica sem vitrine, que é o comportamento de antes).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/device-feed.ts artifacts/api-server/src/routes/display.ts artifacts/api-server/src/routes/devices.ts artifacts/api-server/src/lib/portal/queries.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts
git commit -m "feat(api): TV vitrine recebe toda campanha no ar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /public/vitrine/:orientation/feed`

**Files:**
- Create: `artifacts/api-server/src/lib/vitrine.ts`
- Create: `artifacts/api-server/src/routes/public-vitrine.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Test: `artifacts/api-server/src/routes/__tests__/public-vitrine.test.ts`

**Interfaces:**
- Consumes: `FeedDevice` com `showcase` e `loadDeviceSlides` (Task 3); `GetVitrineFeedParams`, `GetVitrineFeedResponse` (Task 1).
- Produces: `findShowcaseDevice(orientation: "landscape" | "portrait"): Promise<(FeedDevice & { showcase: true }) | null>` em `lib/vitrine.ts`; router default de `routes/public-vitrine.ts` (a Task 5 acrescenta o POST no mesmo arquivo).

- [ ] **Step 1: Teste da rota**

`artifacts/api-server/src/routes/__tests__/public-vitrine.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetVitrineFeedResponse } from "@workspace/api-zod";

// vitrine.ts e device-feed.ts importam @workspace/db, que lança sem DATABASE_URL.
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

const findShowcaseDevice = vi.fn();
const loadDeviceSlides = vi.fn();
const dbUpdate = vi.fn();

vi.mock("../../lib/vitrine", () => ({
  findShowcaseDevice: (...a: unknown[]) => findShowcaseDevice(...a),
}));
vi.mock("../../lib/device-feed", () => ({
  loadDeviceSlides: (...a: unknown[]) => loadDeviceSlides(...a),
}));
vi.mock("@workspace/db", () => {
  const chain = { set: () => chain, where: () => Promise.resolve() };
  return {
    db: { update: (...a: unknown[]) => (dbUpdate(...a), chain) },
    devicesTable: { id: "id", lastSeenAt: "lastSeenAt" },
  };
});

async function buildApp(): Promise<Express> {
  const { default: express } = await import("express");
  const { default: pinoHttp } = await import("pino-http");
  const { default: router } = await import("../public-vitrine");
  const app = express();
  app.use(pinoHttp({ enabled: false }));
  app.use(express.json());
  app.use(router);
  return app;
}

const VITRINE = { id: 5, clientId: 1, companyId: 1, segmentId: null, orientation: "portrait_right", showcase: true };
const SLIDE = {
  announcementId: 10,
  campaignId: 3,
  title: "Pão",
  displayText: "Pão quente",
  imageUrl: "/api/storage/objects/p.jpg",
  duration: 8,
  qrImageUrl: "/api/qr/abc.png",
  mediaKind: "image",
  youtubeId: null,
  playbackMode: "capped",
  audioMode: "muted",
  videoIds: null,
  source: "campaign",
};

beforeEach(() => {
  findShowcaseDevice.mockReset();
  loadDeviceSlides.mockReset();
  dbUpdate.mockReset();
});

describe("GET /public/vitrine/:orientation/feed", () => {
  it("devolve a rotação da vitrine no formato do feed da TV, sem a origem", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/portrait/feed");

    expect(res.status).toBe(200);
    expect(findShowcaseDevice).toHaveBeenCalledWith("portrait");
    expect(res.body.screen.orientation).toBe("portrait_right");
    expect(res.body.slides[0]).not.toHaveProperty("source");
    expect(() => GetVitrineFeedResponse.parse(res.body)).not.toThrow();
  });

  it("marca a vitrine como vista e libera cache curto de CDN", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([]);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/portrait/feed");

    expect(dbUpdate).toHaveBeenCalledTimes(1);
    expect(res.headers["cache-control"]).toBe("public, s-maxage=60, stale-while-revalidate=120");
  });

  it("sem vitrine na orientação, 404 com corpo fixo e sem cache", async () => {
    findShowcaseDevice.mockResolvedValue(null);
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/landscape/feed");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Showcase not found" });
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("orientação fora do enum é 400 sem consultar nada", async () => {
    const { default: request } = await import("supertest");
    const res = await request(await buildApp()).get("/public/vitrine/portrait_right/feed");

    expect(res.status).toBe(400);
    expect(findShowcaseDevice).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/public-vitrine.test.ts`
Expected: FAIL — `Cannot find module '../public-vitrine'`.

- [ ] **Step 3: `lib/vitrine.ts`**

```ts
import { and, eq, inArray } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import type { AnnouncementOrientation } from "@workspace/db/orientation";
import type { FeedDevice } from "./device-feed";

/** Valores brutos de devices.orientation que dão cada formato de tela. */
const RAW_ORIENTATIONS: Record<AnnouncementOrientation, string[]> = {
  landscape: ["landscape"],
  portrait: ["portrait_right", "portrait_left"],
};

/**
 * A vitrine que a landing espelha naquele formato de tela. O PATCH garante
 * no máximo uma por formato; se ainda assim houver duas (gravação
 * concorrente), vale a de menor id, para a resposta ser estável.
 */
export async function findShowcaseDevice(
  orientation: AnnouncementOrientation,
): Promise<(FeedDevice & { showcase: true }) | null> {
  const [row] = await db
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
    .where(and(eq(devicesTable.showcase, true), inArray(devicesTable.orientation, RAW_ORIENTATIONS[orientation])))
    .orderBy(devicesTable.id)
    .limit(1);
  return row ? { ...row, showcase: true } : null;
}
```

- [ ] **Step 4: `routes/public-vitrine.ts`**

```ts
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { deviceOrientationOf } from "@workspace/db/orientation";
import { GetVitrineFeedParams, GetVitrineFeedResponse } from "@workspace/api-zod";
import { findShowcaseDevice } from "../lib/vitrine";
import { loadDeviceSlides } from "../lib/device-feed";

const router: IRouter = Router();

export const SHOWCASE_NOT_FOUND = { error: "Showcase not found" } as const;

/**
 * Rotação da TV vitrine para o player da landing. Pública: fica acima do
 * loadSession em routes/index.ts, e nunca devolve a deviceKey — com ela
 * qualquer um postaria exibição em /telemetry.
 *
 * Cache curto de CDN: segura a carga na função e na API do YouTube quando a
 * landing recebe muita visita. O preço é o lastSeenAt subir no máximo uma vez
 * por minuto por região, o que basta para a vitrine aparecer online. 404 sai
 * sem Cache-Control para a vitrine recém-ligada aparecer logo.
 */
router.get("/public/vitrine/:orientation/feed", async (req, res): Promise<void> => {
  const params = GetVitrineFeedParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const device = await findShowcaseDevice(params.data.orientation);
  if (!device) {
    res.status(404).json(SHOWCASE_NOT_FOUND);
    return;
  }

  await db.update(devicesTable).set({ lastSeenAt: new Date() }).where(eq(devicesTable.id, device.id));

  const slides = await loadDeviceSlides(device, req.log);
  res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  res.json(
    GetVitrineFeedResponse.parse({
      screen: { orientation: deviceOrientationOf(device.orientation) },
      // A origem do slide é só para a prévia do admin, como em /display.
      slides: slides.map(({ source, ...slide }) => slide),
    }),
  );
});

export default router;
```

- [ ] **Step 5: Registrar como rota pública**

Em `routes/index.ts`, importar `publicVitrineRouter from "./public-vitrine"` e acrescentar `router.use(publicVitrineRouter);` logo depois de `router.use(publicPiecesRouter);`.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/public-vitrine.test.ts`
Expected: PASS (4 casos).

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/vitrine.ts artifacts/api-server/src/routes/public-vitrine.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/__tests__/public-vitrine.test.ts
git commit -m "feat(api): rota pública com a rotação da TV vitrine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `POST /public/vitrine/plays`

**Files:**
- Modify: `artifacts/api-server/src/lib/vitrine.ts` (acrescenta `onAirKeys`)
- Modify: `artifacts/api-server/src/routes/public-vitrine.ts`
- Test: `artifacts/api-server/src/routes/__tests__/public-vitrine.test.ts`

**Interfaces:**
- Consumes: `findShowcaseDevice`, `SHOWCASE_NOT_FOUND` (Task 4); `loadDeviceSlides` (Task 3); `buildPlayRows`, `PlayBatchItem` de `lib/telemetry/record-plays.ts`; `isBotUserAgent` de `lib/bot-detect.ts`; `RecordVitrinePlaysBody`, `RecordVitrinePlaysResponse` (Task 1).
- Produces: `onAirKeys(slides: Array<{ announcementId: number; campaignId?: number | null }>): Set<string>` e `playKey(announcementId: number, campaignId: number | null | undefined): string` em `lib/vitrine.ts`.

- [ ] **Step 1: Testes**

No mock de `@workspace/db` do `public-vitrine.test.ts`, acrescentar `insert` e `playsTable`:

```ts
const dbInsert = vi.fn();
let insertReturning: unknown[] = [];
// dentro do factory do vi.mock("@workspace/db"):
    db: {
      update: (...a: unknown[]) => (dbUpdate(...a), chain),
      insert: () => ({
        values: (rows: unknown) => {
          dbInsert(rows);
          return { onConflictDoNothing: () => ({ returning: () => Promise.resolve(insertReturning) }) };
        },
      }),
    },
    devicesTable: { id: "id", lastSeenAt: "lastSeenAt" },
    playsTable: { deviceId: "deviceId", clientPlayId: "clientPlayId", id: "id" },
```

`vi.mock("@workspace/db", …)` é içado: declarar `dbInsert`/`insertReturning` com `vi.hoisted` se o vitest reclamar de acesso antes da inicialização. No `beforeEach`: `dbInsert.mockReset(); insertReturning = [];`. O mock de `../../lib/vitrine` passa a manter o resto do módulo real:

```ts
vi.mock("../../lib/vitrine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/vitrine")>()),
  findShowcaseDevice: (...a: unknown[]) => findShowcaseDevice(...a),
}));
```

Casos:

```ts
const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const PLAY = { playId: "a1b2c3d4-0000-4000-8000-000000000001", announcementId: 10, campaignId: 3, durationSeconds: 8, ageSeconds: 2 };

async function post(body: unknown, ua = UA) {
  const { default: request } = await import("supertest");
  return request(await buildApp()).post("/public/vitrine/plays").set("User-Agent", ua).send(body);
}

describe("POST /public/vitrine/plays", () => {
  it("grava a exibição de peça no ar na vitrine", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    insertReturning = [{ id: 1 }];
    const res = await post({ orientation: "portrait", plays: [PLAY] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 1, duplicates: 0, discarded: 0 });
    const [rows] = dbInsert.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(rows[0]).toMatchObject({ deviceId: 5, announcementId: 10, campaignId: 3, clientPlayId: PLAY.playId });
  });

  it("descarta peça fora do ar e campanha trocada", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    insertReturning = [];
    const res = await post({
      orientation: "portrait",
      plays: [
        { ...PLAY, playId: "fora-do-ar-0001", announcementId: 77 },
        { ...PLAY, playId: "campanha-errada-01", campaignId: 999 },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 0, duplicates: 0, discarded: 2 });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("playId repetido conta como duplicata", async () => {
    findShowcaseDevice.mockResolvedValue(VITRINE);
    loadDeviceSlides.mockResolvedValue([SLIDE]);
    insertReturning = []; // ON CONFLICT DO NOTHING não devolveu linha
    const res = await post({ orientation: "portrait", plays: [PLAY] });

    expect(res.body).toEqual({ accepted: 0, duplicates: 1, discarded: 0 });
  });

  it("lote com mais de 10 é 400", async () => {
    const plays = Array.from({ length: 11 }, (_, i) => ({ ...PLAY, playId: `lote-grande-${String(i).padStart(4, "0")}` }));
    const res = await post({ orientation: "portrait", plays });

    expect(res.status).toBe(400);
    expect(findShowcaseDevice).not.toHaveBeenCalled();
  });

  it("robô recebe 202 e nada é gravado", async () => {
    const res = await post({ orientation: "portrait", plays: [PLAY] }, "Googlebot/2.1");

    expect(res.status).toBe(202);
    expect(findShowcaseDevice).not.toHaveBeenCalled();
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("sem vitrine, 404 com o corpo do feed", async () => {
    findShowcaseDevice.mockResolvedValue(null);
    const res = await post({ orientation: "landscape", plays: [PLAY] });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Showcase not found" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/public-vitrine.test.ts`
Expected: FAIL nos casos do POST (rota 404 do express).

- [ ] **Step 3: `onAirKeys` e `playKey` em `lib/vitrine.ts`**

```ts
/** Chave "peça:campanha" — a mesma peça pode estar no ar por campanha e pela playlist. */
export function playKey(announcementId: number, campaignId: number | null | undefined): string {
  return `${announcementId}:${campaignId ?? ""}`;
}

/**
 * O que pode virar exibição agora: exatamente o que o feed da vitrine manda.
 * A rota de plays é pública, então só aceita peça que um visitante de fato
 * poderia estar vendo — play de peça fora do ar ou com campanha trocada é
 * descartado, e não pesa no relatório de ninguém.
 */
export function onAirKeys(slides: Array<{ announcementId: number; campaignId?: number | null }>): Set<string> {
  return new Set(slides.map((s) => playKey(s.announcementId, s.campaignId)));
}
```

- [ ] **Step 4: Rota em `routes/public-vitrine.ts`**

Acrescentar imports:

```ts
import { playsTable } from "@workspace/db";
import { RecordVitrinePlaysBody, RecordVitrinePlaysResponse } from "@workspace/api-zod";
import { onAirKeys, playKey } from "../lib/vitrine";
import { buildPlayRows } from "../lib/telemetry/record-plays";
import { isBotUserAgent } from "../lib/bot-detect";
```

(juntar `playsTable` ao import existente de `@workspace/db`, e `onAirKeys, playKey` ao de `../lib/vitrine`.)

E a rota, antes do `export default`:

```ts
/**
 * Exibições da vitrine vistas na landing. Contam no relatório do anunciante
 * como as de qualquer TV — decisão do dono do projeto.
 *
 * Por ser pública, a rota só aceita o que um visitante poderia ter visto: a
 * peça tem de estar no feed da vitrine agora, com a mesma campanha. O lote é
 * pequeno (10), o playId deduplica reenvio, e robô (inclusive prévia de link
 * em app de mensagem) não conta. O rate limit por IP fica no Firewall da
 * Vercel, não aqui: função serverless não guarda contador entre instâncias.
 */
router.post("/public/vitrine/plays", async (req, res): Promise<void> => {
  if (isBotUserAgent(req.get("user-agent"))) {
    res.sendStatus(202);
    return;
  }
  const parsed = RecordVitrinePlaysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const device = await findShowcaseDevice(parsed.data.orientation);
  if (!device) {
    res.status(404).json(SHOWCASE_NOT_FOUND);
    return;
  }

  const allowed = onAirKeys(await loadDeviceSlides(device, req.log));
  const onAir = parsed.data.plays.filter((p) => allowed.has(playKey(p.announcementId, p.campaignId)));
  const offAir = parsed.data.plays.length - onAir.length;

  // Tudo que sobrou está no feed, então peça e campanha existem: os dois
  // conjuntos de "existentes" do buildPlayRows saem do próprio lote.
  const { rows, discarded } = buildPlayRows(
    device.id,
    onAir,
    new Set(onAir.map((p) => p.announcementId)),
    new Set(onAir.flatMap((p) => (p.campaignId != null ? [p.campaignId] : []))),
    new Date(),
  );

  const inserted = rows.length
    ? await db
        .insert(playsTable)
        .values(rows)
        .onConflictDoNothing({ target: [playsTable.deviceId, playsTable.clientPlayId] })
        .returning({ id: playsTable.id })
    : [];

  res.json(
    RecordVitrinePlaysResponse.parse({
      accepted: inserted.length,
      duplicates: rows.length - inserted.length,
      discarded: discarded + offAir,
    }),
  );
});
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/public-vitrine.test.ts`
Expected: PASS (10 casos).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/vitrine.ts artifacts/api-server/src/routes/public-vitrine.ts artifacts/api-server/src/routes/__tests__/public-vitrine.test.ts
git commit -m "feat(api): exibições da vitrine na landing contam como play

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: "Telas ativas" da landing não conta vitrine

**Files:**
- Modify: `artifacts/api-server/src/lib/public-stats/queries.ts`
- Test: `artifacts/api-server/src/routes/__tests__/public-stats.test.ts`

**Interfaces:**
- Consumes: `devicesTable.showcase` (Task 1).
- Produces: `buildActiveScreensQuery(now: Date)` exportada de `lib/public-stats/queries.ts`.

- [ ] **Step 1: Teste**

No `describe("janelas de tempo dos números públicos")` de `public-stats.test.ts`:

```ts
  it("telas ativas não contam a TV vitrine, que fica online com as visitas da landing", async () => {
    const { buildActiveScreensQuery } = await import("../../lib/public-stats/queries");
    const { sql } = buildActiveScreensQuery(new Date("2026-03-31T12:00:00.000Z")).toSQL();
    expect(sql).toContain('"devices"."last_seen_at" >= $');
    expect(sql).toContain('"devices"."showcase" = $');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/public-stats.test.ts`
Expected: FAIL — `buildActiveScreensQuery is not a function`.

- [ ] **Step 3: Implementar**

Em `queries.ts`, importar `and` de `drizzle-orm` e acrescentar antes de `publicStats`:

```ts
/**
 * Telas ativas nas últimas 24h. A vitrine fica de fora: ela aparece online
 * enquanto alguém está na landing, e não é tela instalada em comércio.
 * Separada para o teste inspecionar o SQL via `.toSQL()` sem banco.
 */
export function buildActiveScreensQuery(now: Date) {
  // lastSeenAt nulo não satisfaz o gte: device cadastrado que nunca reportou
  // presença não conta como tela ativa.
  return db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(devicesTable)
    .where(and(gte(devicesTable.lastSeenAt, activeSince(now)), eq(devicesTable.showcase, false)));
}
```

E em `publicStats`, trocar o bloco de `screens` (com o comentário do lastSeenAt, que foi para a função) por:

```ts
  const [screens] = await buildActiveScreensQuery(now);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/public-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/public-stats/queries.ts artifacts/api-server/src/routes/__tests__/public-stats.test.ts
git commit -m "fix(api): telas ativas da landing não contam a TV vitrine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Admin — switch "Vitrine da landing" e badge

**Files:**
- Modify: `artifacts/signage/src/pages/device-detail.tsx`
- Modify: `artifacts/signage/src/components/client-devices-section.tsx`
- Modify: `artifacts/signage/src/lib/api-error.ts`
- Test: `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`
- Test: `artifacts/signage/src/lib/__tests__/api-error.test.ts` (criar se não existir; se existir, acrescentar o caso)

**Interfaces:**
- Consumes: `Device.showcase`, `DeviceUpdate.showcase`, `useUpdateDevice` (Task 1); 409 com `error` em português (Task 2).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Teste da mensagem de erro**

`mensagemDeErro` hoje só repassa a duplicata da playlist. O 409 da vitrine já vem em português e nomeia a causa; tem de chegar ao toast. Caso de teste:

```ts
import { describe, expect, it } from 'vitest';
import { mensagemDeErro } from '../api-error';

describe('mensagemDeErro', () => {
  it('repassa o conflito de vitrine, que o servidor já escreve em português', () => {
    const err = { data: { error: 'Já existe uma vitrine vertical: Vitrine vertical' } };
    expect(mensagemDeErro(err, 'falhou')).toBe('Já existe uma vitrine vertical: Vitrine vertical');
  });

  it('mensagem qualquer do servidor continua caindo no fallback', () => {
    expect(mensagemDeErro({ data: { error: 'Device not found' } }, 'falhou')).toBe('falhou');
  });
});
```

- [ ] **Step 2: Teste da página**

Em `device-detail.test.tsx`, acrescentar `showcase: false` ao `DEVICE`. Novo `describe` (usa o mesmo padrão de `stubApi`/render do arquivo; ler o arquivo inteiro antes e reusar o helper de render existente):

```tsx
describe('vitrine da landing', () => {
  it('liga a vitrine pelo switch e manda showcase no PATCH', async () => {
    const chamadas: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        if (init?.method === 'PATCH') {
          chamadas.push({ url, body: JSON.parse(String(init.body)) });
          return json({ ...DEVICE, showcase: true });
        }
        if (url.match(/\/devices\/1$/)) return json(DEVICE);
        return json([]);
      }),
    );
    renderPage(); // helper existente do arquivo que monta DeviceDetail em /devices/1

    const sw = await screen.findByRole('switch', { name: 'Vitrine da landing' });
    await userEvent.click(sw);
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0].body).toEqual({ showcase: true });
  });

  it('mostra no toast o conflito com a outra vitrine', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        if (init?.method === 'PATCH') return json({ error: 'Já existe uma vitrine horizontal: Vitrine H' }, 409);
        if (url.match(/\/devices\/1$/)) return json(DEVICE);
        return json([]);
      }),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('switch', { name: 'Vitrine da landing' }));
    expect(await screen.findByText('Já existe uma vitrine horizontal: Vitrine H')).toBeInTheDocument();
  });
});
```

Se o arquivo não tiver helper `renderPage`, extrair um do teste existente (o que monta `QueryClientProvider` + `Router` com `memoryLocation({ path: '/devices/1' })` + `Toaster`) e usá-lo nos dois.

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/api-error.test.ts src/pages/__tests__/device-detail.test.tsx`
Expected: FAIL (mensagem cai no fallback; switch não existe).

- [ ] **Step 4: `api-error.ts`**

Antes do `return fallback;`:

```ts
  // O 409 da vitrine já sai do servidor em português e nomeia a outra TV.
  if (mensagem.startsWith("Já existe uma vitrine")) return mensagem;
```

- [ ] **Step 5: Switch na página do device**

Em `device-detail.tsx`: importar `Switch` de `@/components/ui/switch` e `mensagemDeErro` de `@/lib/api-error`. Acrescentar uma segunda mutação logo depois de `updateDevice` (a existente tem toast de orientação):

```tsx
  const updateShowcase = useUpdateDevice({
    mutation: {
      // Ligar/desligar muda a rotação (modo vitrine) e a prévia ao lado.
      onSuccess: (d) => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
        queryClient.invalidateQueries({ queryKey: getGetDevicePreviewQueryKey(deviceId) });
        toast({ title: d.showcase ? 'Vitrine ligada. A landing espelha esta TV.' : 'Vitrine desligada.' });
      },
      onError: (err) =>
        toast({
          title: mensagemDeErro(err, 'Não foi possível salvar a vitrine'),
          variant: 'destructive',
        }),
    },
  });
```

Logo depois do `<div>` do select de orientação (antes do grid de playlist/prévia), acrescentar:

```tsx
      <div className="mb-6 flex items-start gap-3 rounded-lg border px-3 py-2.5">
        <Switch
          id="device-showcase"
          aria-label="Vitrine da landing"
          checked={device.showcase}
          disabled={updateShowcase.isPending}
          onCheckedChange={(checked) => updateShowcase.mutate({ id: deviceId, data: { showcase: checked } })}
        />
        <div className="text-sm">
          <label htmlFor="device-showcase" className="font-medium">Vitrine da landing</label>
          <p className="text-muted-foreground">
            A landing espelha esta TV. Recebe todas as campanhas no ar, sem alvo nem concorrência, e cada
            visita na landing conta como exibição. Uma vitrine por orientação.
          </p>
        </div>
      </div>
```

- [ ] **Step 6: Badge na lista de TVs do cliente**

Em `client-devices-section.tsx`, no `<h3>` do nome (linha ~146), depois do nome:

```tsx
{device.showcase ? (
  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Vitrine</span>
) : null}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/api-error.test.ts src/pages/__tests__/device-detail.test.tsx`
Expected: PASS.

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/pages/device-detail.tsx artifacts/signage/src/components/client-devices-section.tsx artifacts/signage/src/lib/api-error.ts artifacts/signage/src/lib/__tests__/api-error.test.ts artifacts/signage/src/pages/__tests__/device-detail.test.tsx
git commit -m "feat(portal): ligar a TV vitrine da landing no admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `PlayerStage` — miolo do player compartilhado

**Files:**
- Create: `artifacts/signage/src/components/player-stage.tsx`
- Create: `artifacts/signage/src/components/__tests__/player-stage.test.tsx`
- Modify: `artifacts/signage/src/pages/display.tsx` (vira casca)
- Modify: `artifacts/signage/src/components/slide-caption.tsx` (`vh` → `cqmin`)

**Interfaces:**
- Consumes: `DisplaySlide` de `@workspace/api-client-react`; `YouTubeSlide`, `ArtLayers`, `SlideCaption`, `mediaUrl` existentes.
- Produces:

```ts
export interface PlayerStageProps {
  slides: DisplaySlide[];
  /** Força vídeo mudo (landing: navegador bloqueia autoplay com som). */
  muted?: boolean;
  /** Congela rodízio e contagem; vídeo vira pôster até voltar. */
  paused?: boolean;
  /** Uma vez por exibição concluída — quem chama decide para onde mandar. */
  onPlay?: (slide: DisplaySlide) => void;
  /** Slide na tela mudou (null = lista vazia). */
  onSlideChange?: (slide: DisplaySlide | null) => void;
}
export function PlayerStage(props: PlayerStageProps): JSX.Element;
```

Ocupa a caixa pai inteira (`absolute inset-0`), com `container-type: size`. Não gira (quem gira é a casca do `display.tsx`). Troca de orientação = o pai remonta com `key`.

- [ ] **Step 1: Testes**

`artifacts/signage/src/components/__tests__/player-stage.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisplaySlide } from '@workspace/api-client-react';
import { PlayerStage } from '../player-stage';

const youtubeProps = vi.fn();
vi.mock('../youtube-slide', () => ({
  YouTubeSlide: (props: Record<string, unknown>) => {
    youtubeProps(props);
    return <div data-testid="youtube" />;
  },
}));

function slide(over: Partial<DisplaySlide>): DisplaySlide {
  return {
    announcementId: 1,
    campaignId: null,
    title: 't',
    displayText: null,
    imageUrl: '/api/storage/objects/a.jpg',
    duration: 2,
    qrImageUrl: null,
    mediaKind: 'image',
    youtubeId: null,
    playbackMode: 'capped',
    audioMode: 'muted',
    videoIds: null,
    ...over,
  };
}

const A = slide({ announcementId: 1, displayText: 'Pão quente', campaignId: 7 });
const B = slide({ announcementId: 2, displayText: 'Farmácia 24h' });

beforeEach(() => {
  vi.useFakeTimers();
  youtubeProps.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('PlayerStage', () => {
  it('avança pela duração e conta uma exibição por slide', () => {
    const onPlay = vi.fn();
    render(<PlayerStage slides={[A, B]} onPlay={onPlay} />);
    expect(screen.getByText('Pão quente')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(A);
    expect(screen.getByText('Farmácia 24h')).toBeInTheDocument();
  });

  it('pausado não avança nem conta; ao voltar, termina o tempo que faltava', () => {
    const onPlay = vi.fn();
    const { rerender } = render(<PlayerStage slides={[A, B]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(1500));
    rerender(<PlayerStage slides={[A, B]} onPlay={onPlay} paused />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onPlay).not.toHaveBeenCalled();

    rerender(<PlayerStage slides={[A, B]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(500));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('muted força o YouTube mudo mesmo com peça de som', () => {
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', audioMode: 'sound' });
    render(<PlayerStage slides={[video]} muted />);
    expect(youtubeProps).toHaveBeenLastCalledWith(expect.objectContaining({ audioMode: 'muted' }));
  });

  it('sem muted, respeita o som da peça (TV)', () => {
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', audioMode: 'sound' });
    render(<PlayerStage slides={[video]} />);
    expect(youtubeProps).toHaveBeenLastCalledWith(expect.objectContaining({ audioMode: 'sound' }));
  });

  it('pausado mostra o pôster no lugar do vídeo', () => {
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', imageUrl: null });
    render(<PlayerStage slides={[video]} paused />);
    expect(screen.queryByTestId('youtube')).not.toBeInTheDocument();
  });

  it('vídeo natural avança e conta no fim, não pelo timer', () => {
    const onPlay = vi.fn();
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', playbackMode: 'natural' });
    render(<PlayerStage slides={[video, B]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onPlay).not.toHaveBeenCalled();

    act(() => (youtubeProps.mock.lastCall![0] as { onEnded: () => void }).onEnded());
    expect(onPlay).toHaveBeenCalledWith(video);
    expect(screen.getByText('Farmácia 24h')).toBeInTheDocument();
  });

  it('avisa o slide na tela', () => {
    const onSlideChange = vi.fn();
    render(<PlayerStage slides={[A, B]} onSlideChange={onSlideChange} />);
    expect(onSlideChange).toHaveBeenLastCalledWith(A);
    act(() => vi.advanceTimersByTime(2000));
    expect(onSlideChange).toHaveBeenLastCalledWith(B);
  });

  it('QR real da peça com o rótulo SAIBA +', () => {
    render(<PlayerStage slides={[slide({ qrImageUrl: '/api/qr/xyz.png' })]} />);
    expect(screen.getByText('SAIBA +')).toBeInTheDocument();
    expect(document.querySelector('img[src$="api/qr/xyz.png"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/player-stage.test.tsx`
Expected: FAIL — `Cannot find module '../player-stage'`.

- [ ] **Step 3: `SlideCaption` em `cqmin`**

Em `slide-caption.tsx`, trocar toda unidade `vh` por `cqmin` nas classes (`bottom-[3cqmin] left-[3cqmin] right-[20cqmin]`, `h-[14cqmin]`, `rounded-[1cqmin]`, `px-[3cqmin]`, `text-[5cqmin]`, `leading-[14cqmin]`) e ajustar o comentário:

```
 * As medidas acompanham o QR code do slide (base em 3cqmin, 14cqmin de
 * largura). `cqmin` é 1% do lado curto do palco (PlayerStage declara
 * container-type: size): na TV em tela cheia é o mesmo 1vh do tv.html; na
 * landing escala com a moldura.
```

- [ ] **Step 4: Implementar `player-stage.tsx`**

Mover de `display.tsx` para cá, sem mudar regra: `NO_SLIDES`, estados `currentIndex`/`progress`, refs `playSent`/`playlistCursor`/`videoPositions`, `fallbackIds`, `videoIdFor`, `fbKeyFor`, o reset por `slidesSig`, o efeito de auto-advance, `advance`, e o JSX de dentro do palco (YouTube ou `ArtLayers`, `SlideCaption`, QR, barra de progresso). Mudanças em relação ao original:

1. `fetch('/api/telemetry/play', …)` (dois lugares) vira `onPlayRef.current?.(slide)`, guardando o callback num ref (`const onPlayRef = useRef(onPlay); onPlayRef.current = onPlay;`) para trocar de callback não reiniciar o timer. O guard continua `if (!playSent.current)`.
2. `elapsedRef = useRef(0)` guarda o tempo do slide atual: o efeito começa em `let elapsed = elapsedRef.current`, grava `elapsedRef.current = elapsed` a cada tick, e zera `elapsedRef.current = 0` sempre que o índice muda (em `advance` e nos dois ramos do fim do tempo). `paused` entra nas dependências e, se verdadeiro, o efeito retorna sem timer.
3. `isYouTube` exige também `!paused`; pausado cai no ramo do pôster.
4. `audioMode={muted ? 'muted' : slide.audioMode === 'sound' ? 'sound' : 'muted'}`.
5. `useEffect(() => onSlideChangeRef.current?.(slides[currentIndex] ?? null), [slides, currentIndex])` com o mesmo padrão de ref.
6. Medidas do QR em `cqmin` (`bottom-[3cqmin] right-[3cqmin] rounded-[1cqmin] p-[1cqmin]`, rótulo `mb-[0.5cqmin] w-[12cqmin] text-[1.8cqmin] leading-[2.4cqmin]`, imagem `h-[12cqmin] w-[12cqmin]`). Os comentários do rótulo (espelho em `tv.html`, caixa alta literal) vão junto, sem mudança de texto.
7. Lista vazia: `return null` (a casca decide o estado vazio).

Casca do componente:

```tsx
/**
 * O que a TV mostra, sem a TV: rodízio, vídeo, legenda, QR e barra de
 * progresso. Usado pela TV (`pages/display.tsx`, em tela cheia) e pela
 * landing (`TvMockup`, dentro da moldura) — os dois não podem divergir no
 * que vai ao ar.
 *
 * Ocupa a caixa pai e mede tudo em `cqmin` (1% do lado curto do palco), por
 * isso escala da TV de 55" à moldura de 28rem sem mudar proporção. Não gira:
 * girar a TV em pé é assunto da casca do display.
 */
export function PlayerStage({ slides, muted = false, paused = false, onPlay, onSlideChange }: PlayerStageProps) {
  // …estado e efeitos movidos de display.tsx…
  return (
    <div className="absolute inset-0 overflow-hidden bg-black select-none" style={{ containerType: 'size' }}>
      {/* …conteúdo do palco movido de display.tsx… */}
    </div>
  );
}
```

- [ ] **Step 5: `display.tsx` vira casca**

Fica em `display.tsx`: `useRoute`, `useGetDisplayFeed`, o efeito de cursor/overflow, `FullscreenHint`, `EmptyState` e os três estados (sem key, carregando, erro/vazio). O retorno principal passa a ser:

```tsx
  return (
    <div className="relative h-[100dvh] w-screen bg-black overflow-hidden select-none">
      <div style={stageStyle(orientation)}>
        {/* key: girou a TV, recomeça do primeiro slide no formato novo (mesma regra do tv.html). */}
        <PlayerStage key={orientation} slides={slides} onPlay={sendPlay} />
      </div>
      <FullscreenHint />
    </div>
  );
```

com, antes dos `return`s:

```tsx
  // Prova de exibição da TV: a key identifica o device.
  const sendPlay = (slide: DisplaySlide) => {
    fetch(`${import.meta.env.BASE_URL}api/telemetry/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceKey,
        announcementId: slide.announcementId,
        campaignId: slide.campaignId ?? null,
        durationSeconds: slide.duration,
      }),
    }).catch(() => {});
  };
```

O efeito que zerava o índice ao girar sai (o `key` faz isso). Atualizar o comentário de `stageStyle` em `lib/stage-rotation.ts`: "As medidas em cqmin de dentro não mudam (o palco girado segue com o lado curto igual ao da tela)".

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run`
Expected: PASS na suíte inteira do signage, inclusive `player-stage.test.tsx` (8 casos) e `tv-html.test.ts`.

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erro.

- [ ] **Step 7: Conferir no navegador**

Run: `pnpm --filter @workspace/signage run dev` (com a API local, se houver `.env`), abrir `/display/<key de uma TV de teste>`: legenda, QR e barra com o mesmo tamanho de antes em landscape e em `portrait_right`. Sem banco local, pular e registrar no PR que a conferência visual fica para o preview da Vercel.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/components/player-stage.tsx artifacts/signage/src/components/__tests__/player-stage.test.tsx artifacts/signage/src/pages/display.tsx artifacts/signage/src/components/slide-caption.tsx artifacts/signage/src/lib/stage-rotation.ts
git commit -m "refactor(tv): miolo do player em componente próprio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Fila de exibições da vitrine (web)

**Files:**
- Create: `artifacts/signage/src/lib/vitrine-plays.ts`
- Create: `artifacts/signage/src/lib/__tests__/vitrine-plays.test.ts`

**Interfaces:**
- Consumes: tipos `DisplaySlide`, `VitrinePlaysInput` de `@workspace/api-client-react` (Task 1).
- Produces:

```ts
export const VITRINE_BATCH = 10;
export const VITRINE_QUEUE_MAX = 100;
export interface VitrinePlaysQueue {
  push(slide: DisplaySlide): void;
  /** Manda até 10; devolve os itens à fila se `send` falhar. */
  flush(): Promise<void>;
  /** No pagehide: sendBeacon com até 10, sem esperar resposta. */
  flushBeacon(): void;
  size(): number;
}
export function createVitrinePlaysQueue(opts: {
  orientation: 'landscape' | 'portrait';
  send: (body: VitrinePlaysInput) => Promise<unknown>;
  beacon?: (body: VitrinePlaysInput) => boolean;
  now?: () => number;
  newId?: () => string;
}): VitrinePlaysQueue;
export function beaconVitrinePlays(body: VitrinePlaysInput): boolean;
```

- [ ] **Step 1: Testes**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { DisplaySlide } from '@workspace/api-client-react';
import { createVitrinePlaysQueue, VITRINE_QUEUE_MAX } from '../vitrine-plays';

const SLIDE = { announcementId: 10, campaignId: 3, duration: 8 } as DisplaySlide;

function queue(send = vi.fn(async () => ({})), start = 1_000_000) {
  let t = start;
  let n = 0;
  const q = createVitrinePlaysQueue({
    orientation: 'portrait',
    send,
    beacon: vi.fn(() => true),
    now: () => t,
    newId: () => `play-id-${String(++n).padStart(4, '0')}`,
  });
  return { q, send, tick: (ms: number) => (t += ms) };
}

describe('fila de exibições da vitrine', () => {
  it('manda o lote com idade em segundos e playId único', async () => {
    const { q, send, tick } = queue();
    q.push(SLIDE);
    tick(4_000);
    await q.flush();
    expect(send).toHaveBeenCalledWith({
      orientation: 'portrait',
      plays: [{ playId: 'play-id-0001', announcementId: 10, campaignId: 3, durationSeconds: 8, ageSeconds: 4 }],
    });
    expect(q.size()).toBe(0);
  });

  it('no máximo 10 por envio', async () => {
    const { q, send } = queue();
    for (let i = 0; i < 12; i++) q.push(SLIDE);
    await q.flush();
    expect((send.mock.calls[0][0] as { plays: unknown[] }).plays).toHaveLength(10);
    expect(q.size()).toBe(2);
  });

  it('falha no envio devolve os itens com o mesmo playId', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue({});
    const { q } = queue(send);
    q.push(SLIDE);
    await q.flush();
    expect(q.size()).toBe(1);
    await q.flush();
    expect((send.mock.calls[1][0] as { plays: Array<{ playId: string }> }).plays[0].playId).toBe('play-id-0001');
  });

  it('fila vazia não chama a rede', async () => {
    const { q, send } = queue();
    await q.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('fila nunca passa do teto: descarta a mais antiga', () => {
    const { q } = queue();
    for (let i = 0; i < VITRINE_QUEUE_MAX + 5; i++) q.push(SLIDE);
    expect(q.size()).toBe(VITRINE_QUEUE_MAX);
  });

  it('flushBeacon manda até 10 e esvazia o que mandou', () => {
    const beacon = vi.fn(() => true);
    const q = createVitrinePlaysQueue({ orientation: 'landscape', send: vi.fn(), beacon, now: () => 0 });
    for (let i = 0; i < 3; i++) q.push(SLIDE);
    q.flushBeacon();
    expect((beacon.mock.calls[0][0] as { plays: unknown[] }).plays).toHaveLength(3);
    expect(q.size()).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/vitrine-plays.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import type { DisplaySlide, VitrinePlaysInput } from '@workspace/api-client-react';

/** Mesmo teto do servidor (VitrinePlaysInput.maxItems). */
export const VITRINE_BATCH = 10;
/** Aba esquecida aberta sem rede não pode crescer a fila sem limite. */
export const VITRINE_QUEUE_MAX = 100;

type Item = { playId: string; announcementId: number; campaignId: number | null; durationSeconds: number; at: number };

export interface VitrinePlaysQueue {
  push(slide: DisplaySlide): void;
  flush(): Promise<void>;
  flushBeacon(): void;
  size(): number;
}

/** sendBeacon com JSON: sobrevive ao fechamento da aba, que o fetch comum não garante. */
export function beaconVitrinePlays(body: VitrinePlaysInput): boolean {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  return navigator.sendBeacon(`${import.meta.env.BASE_URL}api/public/vitrine/plays`, blob);
}

/**
 * Exibições que o visitante viu na TV da landing, esperando envio.
 *
 * Como a fila da TV (tv.html): cada exibição ganha um playId na hora, e a
 * idade vai em segundos em vez de data — o relógio do visitante pode estar
 * errado, a diferença não. Reenvio depois de falha usa o mesmo playId, e o
 * servidor deduplica.
 */
export function createVitrinePlaysQueue(opts: {
  orientation: 'landscape' | 'portrait';
  send: (body: VitrinePlaysInput) => Promise<unknown>;
  beacon?: (body: VitrinePlaysInput) => boolean;
  now?: () => number;
  newId?: () => string;
}): VitrinePlaysQueue {
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const beacon = opts.beacon ?? beaconVitrinePlays;
  let items: Item[] = [];

  const body = (batch: Item[]): VitrinePlaysInput => ({
    orientation: opts.orientation,
    plays: batch.map((i) => ({
      playId: i.playId,
      announcementId: i.announcementId,
      campaignId: i.campaignId,
      durationSeconds: i.durationSeconds,
      ageSeconds: Math.max(0, Math.round((now() - i.at) / 1000)),
    })),
  });

  return {
    push(slide) {
      items.push({
        playId: newId(),
        announcementId: slide.announcementId,
        campaignId: slide.campaignId ?? null,
        durationSeconds: slide.duration,
        at: now(),
      });
      if (items.length > VITRINE_QUEUE_MAX) items = items.slice(-VITRINE_QUEUE_MAX);
    },
    async flush() {
      if (items.length === 0) return;
      const batch = items.slice(0, VITRINE_BATCH);
      items = items.slice(VITRINE_BATCH);
      try {
        await opts.send(body(batch));
      } catch {
        // Volta para a frente: a próxima rodada tenta de novo com o mesmo playId.
        items = [...batch, ...items].slice(0, VITRINE_QUEUE_MAX);
      }
    },
    flushBeacon() {
      if (items.length === 0) return;
      const batch = items.slice(0, VITRINE_BATCH);
      if (beacon(body(batch))) items = items.slice(VITRINE_BATCH);
    },
    size: () => items.length,
  };
}
```

Se `VitrinePlaysInput` sair do codegen com outro nome, usar o nome gerado (conferir em `lib/api-client-react/src/generated/api.schemas.ts`).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/lib/__tests__/vitrine-plays.test.ts`
Expected: PASS (6 casos).

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/lib/vitrine-plays.ts artifacts/signage/src/lib/__tests__/vitrine-plays.test.ts
git commit -m "feat(landing): fila das exibições da TV vitrine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `TvMockup` vira o player da vitrine

**Files:**
- Create: `artifacts/signage/src/hooks/use-seen.ts`
- Modify: `artifacts/signage/src/components/landing/tv-mockup.tsx`
- Modify: `artifacts/signage/src/components/landing/__tests__/tv-mockup.test.tsx` (reescrito)
- Modify: `artifacts/signage/src/lib/landing-content.ts` (tira `flyer` de `mockup.kinds`)
- Delete: `artifacts/signage/src/hooks/use-public-pieces.ts` (fica sem uso; a rota `/public/pieces` continua)

**Interfaces:**
- Consumes: `PlayerStage` (Task 8); `createVitrinePlaysQueue` (Task 9); `useGetVitrineFeed`, `getGetVitrineFeedQueryKey`, `recordVitrinePlays` (Task 1).
- Produces: `useSeen(ref: RefObject<Element>): boolean` — true quando a aba está visível e o elemento está na tela (sem IntersectionObserver, considera na tela). `TvMockup` sem props, mesmo export.

- [ ] **Step 1: Testes (reescrever `tv-mockup.test.tsx`)**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANDING } from '@/lib/landing-content';
import { TvMockup } from '../tv-mockup';

vi.mock('@/components/youtube-slide', () => ({ YouTubeSlide: () => <div data-testid="youtube" /> }));

function slide(id: number, text: string, over: Record<string, unknown> = {}) {
  return {
    announcementId: id,
    campaignId: 3,
    title: text,
    displayText: text,
    imageUrl: `/api/storage/objects/${id}.jpg`,
    duration: 2,
    qrImageUrl: null,
    mediaKind: 'image',
    youtubeId: null,
    playbackMode: 'capped',
    audioMode: 'muted',
    videoIds: null,
    ...over,
  };
}

const FEEDS: Record<string, unknown> = {
  landscape: { screen: { orientation: 'landscape' }, slides: [slide(1, 'Pão quente'), slide(2, 'Farmácia 24h', { mediaKind: 'youtube_video', youtubeId: 'abc' })] },
  portrait: { screen: { orientation: 'portrait_right' }, slides: [slide(5, 'Açaí')] },
};

let posts: Array<{ orientation: string; plays: unknown[] }> = [];

function stubApi(feeds: Record<string, unknown> = FEEDS) {
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ accepted: 1, duplicates: 0, discarded: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const m = url.match(/vitrine\/(landscape|portrait)\/feed/);
      const feed = m ? feeds[m[1]] : undefined;
      return feed
        ? new Response(JSON.stringify(feed), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ error: 'Showcase not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

function renderTv() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TvMockup />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('TvMockup', () => {
  it('toca o feed da vitrine horizontal e conta a exibição', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi();
    renderTv();
    expect(await screen.findByText('Pão quente')).toBeInTheDocument();
    expect(screen.getByTestId('tv-kind')).toHaveTextContent(LANDING.mockup.kinds.image);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByTestId('tv-kind')).toHaveTextContent(LANDING.mockup.kinds.video);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await waitFor(() => expect(posts.length).toBeGreaterThan(0));
    expect(posts[0].orientation).toBe('landscape');
    expect(posts[0].plays[0]).toMatchObject({ announcementId: 1, campaignId: 3 });
  });

  it('vertical troca para a vitrine vertical, em pé e sem girar', async () => {
    stubApi();
    renderTv();
    await screen.findByText('Pão quente');
    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.portrait }));
    expect(await screen.findByText('Açaí')).toBeInTheDocument();
    expect(screen.getByTestId('tv-screen')).toHaveAttribute('data-orientation', 'portrait');
  });

  it('sem vitrine (404), mostra o slide de exemplo', async () => {
    stubApi({});
    renderTv();
    expect(await screen.findByText(LANDING.mockup.caption)).toBeInTheDocument();
    expect(screen.queryByTestId('tv-kind')).not.toBeInTheDocument();
  });

  it('vitrine sem peça também cai no exemplo', async () => {
    stubApi({ landscape: { screen: { orientation: 'landscape' }, slides: [] } });
    renderTv();
    expect(await screen.findByText(LANDING.mockup.caption)).toBeInTheDocument();
  });

  it('aba escondida não avança nem conta exibição', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi();
    renderTv();
    await screen.findByText('Pão quente');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('Pão quente')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('TV fora da tela não avança', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let callback: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    stubApi();
    renderTv();
    await screen.findByText('Pão quente');
    act(() => callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('Pão quente')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/landing/__tests__/tv-mockup.test.tsx`
Expected: FAIL (o componente ainda busca `/public/pieces`).

- [ ] **Step 3: `hooks/use-seen.ts`**

```ts
import { useEffect, useState, type RefObject } from 'react';

/**
 * O visitante pode estar vendo o elemento agora? Aba visível e elemento na
 * tela. Exibição que ninguém podia ver não conta no relatório do anunciante.
 *
 * Sem IntersectionObserver (navegador antigo, jsdom), vale "na tela": melhor
 * contar do que parar a TV.
 */
export function useSeen(ref: RefObject<Element | null>): boolean {
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const onChange = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  return tabVisible && onScreen;
}
```

- [ ] **Step 4: Reescrever `tv-mockup.tsx`**

Mantém: botões de orientação, badge de tipo, moldura (`rounded-xl border-4 …`, pé da TV), `data-testid="tv-screen"` com `data-orientation`, e o slide de exemplo (gradiente + legenda `LANDING.mockup.caption` + QR de ícone) para quando não há feed. Sai: `usePublicPieces`, `TV_MOCKUP_INTERVAL_MS`, o rodízio próprio e as camadas empilhadas.

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PlayCircle, QrCode, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import {
  getGetVitrineFeedQueryKey,
  recordVitrinePlays,
  useGetVitrineFeed,
  type DisplaySlide,
} from '@workspace/api-client-react';
import { PlayerStage } from '@/components/player-stage';
import { useSeen } from '@/hooks/use-seen';
import { LANDING } from '@/lib/landing-content';
import { createVitrinePlaysQueue } from '@/lib/vitrine-plays';
import { cn } from '@/lib/utils';

type Orientation = 'landscape' | 'portrait';

/** Mesmo ritmo da TV: a rotação é buscada a cada minuto. */
const FEED_REFETCH_MS = 60_000;
/** Exibições vão em lote; no pagehide vai o resto por sendBeacon. */
const PLAYS_FLUSH_MS = 15_000;

// ORIENTATIONS: igual ao atual.

/**
 * A TV do hero: o player real espelhando a TV vitrine da Smart Vale naquela
 * orientação. Mesmo `PlayerStage` da TV (vídeo, legenda, QR escaneável,
 * tempo de cada peça), sempre mudo — navegador bloqueia autoplay com som.
 *
 * Cada exibição conta no relatório do anunciante, por isso a TV para quando
 * ninguém pode vê-la (aba escondida ou fora da tela). Sem vitrine ou sem
 * peça, fica o slide de exemplo desenhado em CSS.
 */
export function TvMockup() {
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [current, setCurrent] = useState<DisplaySlide | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(screenRef);

  const feed = useGetVitrineFeed(orientation, {
    query: {
      queryKey: getGetVitrineFeedQueryKey(orientation),
      retry: false,
      refetchInterval: FEED_REFETCH_MS,
      refetchOnWindowFocus: false,
    },
  });
  const slides = feed.data?.slides ?? [];
  const live = slides.length > 0;

  // Uma fila por orientação: o lote diz de qual vitrine são as exibições.
  const queue = useMemo(
    () => createVitrinePlaysQueue({ orientation, send: (body) => recordVitrinePlays(body) }),
    [orientation],
  );
  useEffect(() => {
    const id = window.setInterval(() => void queue.flush(), PLAYS_FLUSH_MS);
    const onHide = () => queue.flushBeacon();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pagehide', onHide);
      // Trocou de orientação ou saiu da página: o que sobrou vai agora.
      queue.flushBeacon();
    };
  }, [queue]);

  useEffect(() => setCurrent(null), [orientation]);

  const portrait = orientation === 'portrait';
  const kind = current ? (current.mediaKind === 'image' ? 'image' : 'video') : null;
  const KindIcon = kind === 'video' ? PlayCircle : Image;

  return (
    // …mesmo layout de hoje: grupo de botões, badge `tv-kind` quando `live && kind`…
    //   badge: {LANDING.mockup.kinds[kind]} com <KindIcon/>
    // …moldura; dentro, o `tv-screen` (com ref={screenRef}):
    //   {live ? (
    //     <PlayerStage
    //       key={orientation}
    //       slides={slides}
    //       muted
    //       paused={!seen}
    //       onPlay={(s) => queue.push(s)}
    //       onSlideChange={setCurrent}
    //     />
    //   ) : (
    //     /* slide de exemplo atual: gradiente, legenda LANDING.mockup.caption com data-testid="tv-caption", QR de ícone */
    //   )}
  );
}
```

Escrever o JSX completo partindo do `return` atual de `tv-mockup.tsx`: o grupo de botões fica igual; o badge usa `live && kind`; a classe de gradiente do `tv-screen` passa a depender de `!live`; o conteúdo interno do `tv-screen` vira o ternário acima; o bloco de exemplo reaproveita a legenda e o QR em `cqmin` que já existem, sem o `pieces.map`. O comentário do topo do arquivo (sobre `ArtLayers`/`cqmin`) é substituído pelo docblock acima.

- [ ] **Step 5: Limpeza**

- Em `landing-content.ts`: `kinds: { image: 'Imagem', video: 'Vídeo' },`.
- Apagar `hooks/use-public-pieces.ts` (`git rm`). Conferir: `grep -rn "use-public-pieces\|TV_MOCKUP_INTERVAL_MS" artifacts/signage/src` não acha nada.

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run`
Expected: PASS na suíte inteira (inclusive `apresentacao.test.tsx`; se ele stubava `/public/pieces`, o fetch da vitrine cai no 404 e a TV mostra o exemplo — ajustar só se algum `expect` dependia das peças).

Run: `pnpm --filter @workspace/signage run typecheck`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add -A artifacts/signage/src/components/landing artifacts/signage/src/hooks artifacts/signage/src/lib/landing-content.ts
git commit -m "feat(landing): TV da landing espelha a TV vitrine da Smart Vale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verificação final e PR

**Files:** nenhum código novo.

- [ ] **Step 1: Tudo verde**

Run: `pnpm run typecheck && pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/signage run test`
Expected: sem erro em nenhum.

- [ ] **Step 2: Build**

Run: `pnpm --filter @workspace/signage run build && pnpm --filter @workspace/api-server run build`
Expected: sem erro.

- [ ] **Step 3: Push e PR**

```bash
git push -u origin feat/vitrine-landing
gh pr create --title "feat(landing): TV da landing espelha a TV vitrine da Smart Vale" --body "$(cat <<'EOF'
## O quê

A TV do hero da landing (e do slide Solução da /apresentacao) deixa de ser mockup e passa a ser o player real, espelhando a TV vitrine da Smart Vale TV.

- `devices.showcase`: TV vitrine, uma por orientação de tela (409 no PATCH).
- Vitrine recebe toda campanha no ar (sem alvo nem concorrência, respeita dias da semana) + a playlist dela; sem painéis de lojista.
- Rotas públicas sem deviceKey: `GET /api/public/vitrine/:orientation/feed` e `POST /api/public/vitrine/plays`.
- `PlayerStage`: miolo do `display.tsx` compartilhado entre TV e landing. `tv.html` não mudou.
- Exibição na landing conta como play; só com aba visível e TV na tela. "Telas ativas" da landing não conta a vitrine.

Spec: `docs/superpowers/specs/2026-09-30-vitrine-landing-design.md`

## Depois do merge (manual)

1. Admin: cadastrar a empresa Smart Vale TV como cliente e as TVs "Vitrine horizontal" (landscape) e "Vitrine vertical" (retrato), e ligar "Vitrine da landing" em cada.
2. Vercel Firewall: regra de rate limit por IP em `/api/public/vitrine/plays` (ex.: 30 req/min, ação 429).

Até isso, a landing mostra o slide de exemplo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Conferir o preview**

Abrir o preview da Vercel do PR: landing sem vitrine mostra o exemplo; sem erro no console.
