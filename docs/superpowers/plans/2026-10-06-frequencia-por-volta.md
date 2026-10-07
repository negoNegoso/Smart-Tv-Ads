# Frequência por volta nas campanhas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campanha toca N vezes (1 a 5) a cada volta da TV, com as inserções espalhadas pela volta por round-robin ponderado suave.

**Architecture:** Coluna `campaigns.loop_insertions smallint DEFAULT 1`. Módulo puro `lib/loop-schedule.ts` (`buildLoop`) intercala blocos por peso; `composeDeviceLoop` (no lugar de `composeDeviceSlides`) tira duplicatas, agrupa campanhas por `campaignId` (peso = inserções), painéis por `panelId` (peso 1) e itens da playlist (peso 1), e chama `buildLoop`. O feed filtra orientação antes de montar. API valida 1–5; painel ganha um select e mostra o valor.

**Tech Stack:** TypeScript, Express, drizzle-orm (Postgres), zod, vitest + supertest (API), React + Testing Library + vitest (web), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-06-frequencia-por-volta-design.md`

## Global Constraints

- Branch `feat/frequencia-por-volta`; PR com título `feat(api): frequência por volta nas campanhas`, merge commit.
- Commits no formato `tipo(escopo): descrição em português`, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (exatamente essa, sem trocar o nome do modelo).
- Código e comentários em português, explicando o porquê. Acentos e símbolos (×, –) como UTF-8 real, nunca `\uXXXX`.
- Inserções por volta: inteiro de 1 a 5, padrão 1. Cada inserção toca o bloco inteiro de peças da campanha, na ordem atual.
- Com todos os pesos em 1, a volta sai idêntica à de hoje (campanhas, painéis, playlist).
- Algoritmo: round-robin ponderado suave; empate → menor índice (ordem de entrada); determinístico.
- Conteúdo do lojista pesa 1: cada painel (todas as páginas juntas) é um bloco; cada item da playlist é um bloco.
- Duplicata por `announcementId` toca só na primeira fonte (campanha > painel > playlist); repetição só vem do peso.
- Toda mudança de schema gera migração versionada com `pnpm --filter @workspace/db run generate` e a commita.
- Landing fica de fora.

## Review Focus

- Painel antigo em cache salvando campanha sem `loopInsertions` → grava 1, sem 400. Teste na Task 3.
- Linhas de painel/playlist/mocks sem `loopInsertions` ou `panelId` → peso 1, cada linha sem `panelId` vira seu próprio bloco; nunca derruba o feed. Teste na Task 2 (fixtures sem os campos).
- Encarte do lojista (várias páginas do mesmo painel) intercalado com campanha 2× → páginas ficam juntas. Teste na Task 2.
- Peça na campanha 2× e também na playlist → toca só as 2 vezes da campanha (não 3). Teste na Task 2.
- Peso inválido chegando ao `buildLoop` (0, NaN, fração) → tratado como 1 / parte inteira, sem laço infinito nem volta vazia. Teste na Task 1.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/loop-schedule.ts` (novo) | `LoopBlock`, `buildLoop` |
| `artifacts/api-server/src/lib/panels/device-slides.ts` | `composeDeviceLoop` (substitui `composeDeviceSlides`); query de painéis traz `panelId` e `loopInsertions` |
| `lib/db/src/schema/campaigns.ts` + `lib/db/drizzle/*` | coluna `loop_insertions` e migração |
| `artifacts/api-server/src/lib/device-feed.ts` | seleciona os campos novos, filtra orientação antes, monta a volta, tira os campos da resposta |
| `artifacts/api-server/src/routes/advertisers.ts` | zod, gravação, seleção |
| `artifacts/signage/src/components/use-campaign-form.ts` | estado e envio |
| `artifacts/signage/src/components/campaign-form-dialog.tsx` | `CampaignLoopInsertionsPicker` |
| `artifacts/signage/src/pages/campaign-detail.tsx` | picker na edição, valor na leitura |
| `artifacts/signage/src/components/campaign-row.tsx` | ` · 2× por volta` |

Desvios conscientes da spec:
- A troca de chave do `player-stage.tsx` sai (YAGNI): a mesma peça seguida só acontece quando ela é o único conteúdo, caso que já existe hoje com uma peça só e funciona.
- `composeDeviceLoop` não recebe a tela: o `device-feed.ts` filtra a orientação de cada fonte antes de chamá-la — mesmo efeito (bloco vazio some), função mais simples.

---

### Task 1: `buildLoop` — round-robin ponderado suave

**Files:**
- Create: `artifacts/api-server/src/lib/loop-schedule.ts`
- Test: `artifacts/api-server/src/lib/__tests__/loop-schedule.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export type LoopBlock<T> = { weight: number; slides: T[] }` e `export function buildLoop<T>(blocks: LoopBlock<T>[]): T[]` — usados pela Task 2.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// artifacts/api-server/src/lib/__tests__/loop-schedule.test.ts
import { describe, expect, it } from "vitest";
import { buildLoop, type LoopBlock } from "../loop-schedule";

const bloco = (weight: number, ...slides: string[]): LoopBlock<string> => ({ weight, slides });

describe("buildLoop", () => {
  it("com tudo em 1× a volta é a concatenação na ordem de entrada (igual a hoje)", () => {
    expect(buildLoop([bloco(1, "a"), bloco(1, "b"), bloco(1, "c")])).toEqual(["a", "b", "c"]);
  });

  it("espalha as inserções: A 3× com B e C sai A B A C A", () => {
    expect(buildLoop([bloco(3, "a"), bloco(1, "b"), bloco(1, "c")])).toEqual(["a", "b", "a", "c", "a"]);
  });

  it("cada bloco aparece exatamente o número de vezes do peso", () => {
    const volta = buildLoop([bloco(2, "a"), bloco(3, "b"), bloco(1, "c"), bloco(1, "d")]);
    const conta = (x: string) => volta.filter((s) => s === x).length;
    expect([conta("a"), conta("b"), conta("c"), conta("d")]).toEqual([2, 3, 1, 1]);
    expect(volta).toHaveLength(7);
  });

  it("o bloco toca as peças em sequência a cada inserção", () => {
    expect(buildLoop([bloco(2, "a1", "a2"), bloco(1, "b")])).toEqual(["a1", "a2", "b", "a1", "a2"]);
  });

  it("bloco sem peça some e não ocupa inserção", () => {
    expect(buildLoop([bloco(3), bloco(1, "b"), bloco(1, "c")])).toEqual(["b", "c"]);
  });

  it("sem blocos a volta é vazia", () => {
    expect(buildLoop([])).toEqual([]);
  });

  it("mesma entrada, mesma volta (a TV recomeça quando a lista muda)", () => {
    const entrada = () => [bloco(2, "a"), bloco(3, "b"), bloco(1, "c")];
    expect(buildLoop(entrada())).toEqual(buildLoop(entrada()));
  });

  it("não altera os blocos recebidos", () => {
    const blocos = [bloco(2, "a1", "a2"), bloco(1, "b")];
    buildLoop(blocos);
    expect(blocos).toEqual([bloco(2, "a1", "a2"), bloco(1, "b")]);
  });

  it("peso inválido vale 1 e fração vale a parte inteira", () => {
    expect(buildLoop([bloco(0, "a"), bloco(Number.NaN, "b"), bloco(-2, "c")])).toEqual(["a", "b", "c"]);
    expect(buildLoop([bloco(2.9, "a"), bloco(1, "b")])).toEqual(["a", "b", "a"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/loop-schedule.test.ts`
Expected: FAIL — `Failed to load url ../loop-schedule` (módulo não existe).

- [ ] **Step 3: Implementar**

```ts
// artifacts/api-server/src/lib/loop-schedule.ts
/**
 * Um bloco da volta: as peças que tocam juntas (todas as peças de uma
 * campanha, as páginas de um painel, um item da playlist) e quantas vezes o
 * bloco entra em cada volta.
 */
export type LoopBlock<T> = { weight: number; slides: T[] };

/**
 * Peso que a montagem aceita: inteiro ≥ 1. A API já valida; isto é a rede de
 * segurança para nunca ficar sem volta nem girar para sempre.
 */
function safeWeight(weight: number): number {
  return Number.isFinite(weight) && weight >= 1 ? Math.floor(weight) : 1;
}

/**
 * Monta a volta da TV por round-robin ponderado suave (o do balanceador do
 * nginx): a cada passo todo bloco ganha crédito igual ao peso, toca o de
 * maior crédito e ele paga o total. Cada bloco entra exatamente `peso` vezes
 * e as repetições ficam espalhadas, em vez de coladas.
 *
 * Empate vai para o bloco que veio antes: com tudo em 1× a volta é a ordem de
 * entrada, a mesma de antes da frequência existir. Sem aleatoriedade — a TV
 * recomeça a volta quando a lista muda, então duas buscas iguais têm de dar a
 * mesma fila.
 */
export function buildLoop<T>(blocks: LoopBlock<T>[]): T[] {
  const active = blocks
    .filter((block) => block.slides.length > 0)
    .map((block) => ({ weight: safeWeight(block.weight), slides: block.slides }));
  const total = active.reduce((sum, block) => sum + block.weight, 0);
  const credit = active.map(() => 0);
  const loop: T[] = [];
  for (let step = 0; step < total; step++) {
    let chosen = 0;
    for (let i = 0; i < active.length; i++) {
      credit[i] += active[i].weight;
      if (credit[i] > credit[chosen]) chosen = i;
    }
    credit[chosen] -= total;
    loop.push(...active[chosen].slides);
  }
  return loop;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/loop-schedule.test.ts`
Expected: PASS (9 testes).

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/loop-schedule.ts artifacts/api-server/src/lib/__tests__/loop-schedule.test.ts
git commit -F - <<'EOF'
feat(api): montagem da volta por round-robin ponderado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Coluna `loop_insertions` e volta intercalada no feed

**Files:**
- Modify: `lib/db/src/schema/campaigns.ts`
- Create: `lib/db/drizzle/<gerado>.sql` (+ meta do drizzle-kit)
- Modify: `artifacts/api-server/src/lib/panels/device-slides.ts`
- Modify: `artifacts/api-server/src/lib/device-feed.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/device-slides.test.ts`
- Test: `artifacts/api-server/src/lib/__tests__/device-feed-query.test.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `buildLoop`, `LoopBlock` (Task 1).
- Produces:
  - `campaignsTable.loopInsertions` (`smallint NOT NULL DEFAULT 1`) — usada pela Task 3.
  - `export type LoopSlide = { announcementId: number; campaignId?: number | null; panelId?: number | null; loopInsertions?: number }`
  - `export function composeDeviceLoop<T extends LoopSlide>(campaigns: T[], panels: T[], playlist: T[]): T[]` (em `lib/panels/device-slides.ts`); `composeDeviceSlides` deixa de existir.

- [ ] **Step 1: Escrever os testes que falham**

Em `device-slides.test.ts`:

1. Trocar `composeDeviceSlides` por `composeDeviceLoop` no `await import(...)` e em todos os testes do `describe` (renomear o `describe("composeDeviceSlides", ...)` para `describe("composeDeviceLoop", ...)`). Os 5 testes existentes continuam iguais no resto — o fixture `slide(id, label)` não tem `campaignId`, `panelId` nem `loopInsertions`, e por isso também cobre a regra "linha sem os campos vale peso 1 e bloco próprio".
2. No fim desse `describe`, acrescentar:

```ts
  // Tipo explícito: as três listas precisam caber no mesmo genérico T.
  type Linha = { announcementId: number; label: string; campaignId?: number; panelId?: number; loopInsertions?: number };
  const campanha = (announcementId: number, campaignId: number, loopInsertions: number): Linha =>
    ({ announcementId, label: `c${announcementId}`, campaignId, loopInsertions });
  const pagina = (announcementId: number, panelId: number): Linha =>
    ({ announcementId, label: `p${announcementId}`, panelId });

  it("campanha 2× com um painel e um item de playlist sai C P C L", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2)], [pagina(2, 5)], [slide(3, "l")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2, 3, 1]);
  });

  it("cada inserção toca todas as peças da campanha em sequência", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2), campanha(2, 9, 2)], [], [slide(3, "l")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2, 3, 1, 2]);
  });

  it("páginas do mesmo painel ficam juntas; cada painel é um bloco", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2)], [pagina(2, 5), pagina(3, 5), pagina(4, 6)], []);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2, 3, 1, 4]);
  });

  it("peça na campanha 2× e na playlist toca só as inserções da campanha", () => {
    const out = composeDeviceLoop([campanha(1, 9, 2)], [], [slide(1, "l")]);
    expect(out.map((s) => s.label)).toEqual(["c1", "c1"]);
  });
```

3. No `describe("buildPanelSlidesQuery", ...)`, acrescentar:

```ts
  it("traz o panel_id para a volta manter as páginas do painel juntas", () => {
    const { sql } = buildPanelSlidesQuery(42).toSQL();
    // Só a lista do SELECT: o join já cita panel_slides.panel_id.
    expect(sql.split(" from ")[0]).toContain('"panel_slides"."panel_id"');
  });
```

Em `device-feed-query.test.ts`, dentro do `describe("buildCampaignSlidesQuery", ...)`:

```ts
  it("traz as inserções por volta da campanha", () => {
    const { sql } = buildCampaignSlidesQuery(new Date("2026-09-24T12:00:00Z")).toSQL();
    expect(sql).toContain('"campaigns"."loop_insertions"');
  });
```

Em `display-slides.test.ts`:

1. No mock de `@workspace/db`, acrescentar `loopInsertions: "loopInsertions"` ao objeto `campaignsTable` (mantendo as chaves que já existem).
2. No fim do arquivo, acrescentar:

```ts
describe("GET /display/:deviceKey/feed — inserções por volta", () => {
  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    selectResults = [];
    selectCallIndex = 0;
  });

  it("campanha 2× toca duas vezes, intercalada com a playlist, sem levar os campos da montagem", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [PLAYLIST_ROW], [{ ...CAMPAIGN_ROW, loopInsertions: 2 }]];
    panelSlidesForClientMock.mockResolvedValue([]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    const ids = res.body.slides.map((s: { announcementId: number }) => s.announcementId);
    expect(ids).toEqual([CAMPAIGN_ROW.announcementId, PLAYLIST_ROW.announcementId, CAMPAIGN_ROW.announcementId]);
    expect(res.body.slides[0]).not.toHaveProperty("loopInsertions");
    expect(res.body.slides[0]).not.toHaveProperty("panelId");
  });

  it("as páginas de um painel ficam juntas entre as inserções da campanha", async () => {
    selectResults = [[{ ...DEVICE_ROW, showcase: false }], [], [{ ...CAMPAIGN_ROW, loopInsertions: 2 }]];
    panelSlidesForClientMock.mockResolvedValue([
      { ...PANEL_ROW, panelId: 9 },
      { ...PANEL_ROW, announcementId: 304, panelId: 9 },
    ]);
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).get("/display/tv-1/feed");

    const ids = res.body.slides.map((s: { announcementId: number }) => s.announcementId);
    expect(ids).toEqual([CAMPAIGN_ROW.announcementId, PANEL_ROW.announcementId, 304, CAMPAIGN_ROW.announcementId]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/panels/__tests__/device-slides.test.ts src/lib/__tests__/device-feed-query.test.ts src/routes/__tests__/display-slides.test.ts`
Expected: FAIL — `composeDeviceLoop is not a function`; SQL sem `loop_insertions` e sem `panel_slides.panel_id` no SELECT; feed devolve a campanha uma vez só.

- [ ] **Step 3: Implementar a coluna e a migração**

Em `lib/db/src/schema/campaigns.ts` (`smallint` já está importado), logo depois da coluna `timeWindows`:

```ts
  // Quantas vezes a campanha toca a cada volta da TV (1 a 5). Cada inserção
  // toca o bloco inteiro de peças. O default 1 mantém as campanhas antigas e o
  // servidor da versão anterior como estavam durante o deploy.
  loopInsertions: smallint("loop_insertions").notNull().default(1),
```

Gerar e conferir (o drizzle-kit exige `DATABASE_URL` mesmo sem conectar; use um fictício):

```bash
cd lib/db && npx tsc --build && cd ../..
DATABASE_URL=postgres://u:p@localhost:5432/x pnpm --filter @workspace/db run generate
ls -t lib/db/drizzle/*.sql | head -1 | xargs cat
```

Expected: um único `ALTER TABLE "campaigns" ADD COLUMN "loop_insertions" smallint DEFAULT 1 NOT NULL;`. Qualquer outra alteração → parar e reportar BLOCKED com o SQL.

- [ ] **Step 4: Implementar `composeDeviceLoop` e a query de painéis**

Em `artifacts/api-server/src/lib/panels/device-slides.ts`:

1. Import: `import { buildLoop, type LoopBlock } from "../loop-schedule";`
2. Trocar a função `composeDeviceSlides` inteira (e o comentário acima dela) por:

```ts
/** Campos que a montagem da volta lê. Ausente vale peso 1 e bloco próprio. */
export type LoopSlide = {
  announcementId: number;
  campaignId?: number | null;
  panelId?: number | null;
  loopInsertions?: number;
};

/**
 * Monta a volta da TV a partir das três fontes. Peça repetida entre fontes
 * fica só na primeira (campanha > painel > playlist): repetição só vem das
 * inserções compradas. Cada campanha vira um bloco com suas peças em ordem e
 * peso = inserções por volta; cada painel do lojista (todas as páginas) e
 * cada item da playlist pesam 1. Com tudo em 1× a volta é campanhas, painéis
 * e playlist, como antes da frequência existir.
 */
export function composeDeviceLoop<T extends LoopSlide>(campaigns: T[], panels: T[], playlist: T[]): T[] {
  const seen = new Set<number>();
  const firstTime = (rows: T[]) =>
    rows.filter((slide) => {
      if (seen.has(slide.announcementId)) return false;
      seen.add(slide.announcementId);
      return true;
    });
  // Ordem importa: a dedupe dá preferência a quem é filtrado primeiro.
  const campaignRows = firstTime(campaigns);
  const panelRows = firstTime(panels);
  const playlistRows = firstTime(playlist);
  return buildLoop([
    ...groupConsecutive(campaignRows, (slide) => slide.campaignId, (slide) => slide.loopInsertions ?? 1),
    ...groupConsecutive(panelRows, (slide) => slide.panelId, () => 1),
    ...playlistRows.map((slide) => ({ weight: 1, slides: [slide] })),
  ]);
}

/**
 * Junta linhas seguidas com a mesma chave num bloco (as queries já devolvem
 * campanha por campanha e painel por painel). Chave nula ou ausente não junta:
 * cada linha vira um bloco.
 */
function groupConsecutive<T>(
  rows: T[],
  keyOf: (row: T) => number | null | undefined,
  weightOf: (row: T) => number,
): LoopBlock<T>[] {
  const blocks: LoopBlock<T>[] = [];
  let previousKey: number | null | undefined;
  for (const row of rows) {
    const key = keyOf(row);
    const last = blocks[blocks.length - 1];
    if (last && key != null && key === previousKey) {
      last.slides.push(row);
    } else {
      blocks.push({ weight: weightOf(row), slides: [row] });
    }
    previousKey = key;
  }
  return blocks;
}
```

3. No comentário de `CampaignOnlyFields`, trocar a menção a `composeDeviceSlides` por `composeDeviceLoop`, e acrescentar ao tipo, depois de `timeWindows?: ...;`:

```ts
  loopInsertions?: number;
```

4. No tipo `PanelSlideRow`, depois de `orientation: string;` (antes do `} & CampaignOnlyFields`):

```ts
  // Agrupa as páginas de um painel num bloco só da volta.
  panelId: number | null;
```

5. Em `buildPanelSlidesQuery`, no `select`, depois de `orientation: announcementsTable.orientation,`:

```ts
      panelId: panelSlidesTable.panelId,
      loopInsertions: sql<number>`1`,
```

- [ ] **Step 5: Implementar o feed**

Em `artifacts/api-server/src/lib/device-feed.ts`:

1. Import: trocar `composeDeviceSlides` por `composeDeviceLoop` em `import { composeDeviceSlides, panelSlidesForClient } from "./panels/device-slides";`.
2. Em `buildCampaignSlidesQuery`, depois de `timeWindows: campaignsTable.timeWindows,`:

```ts
      loopInsertions: campaignsTable.loopInsertions,
      panelId: sql<number | null>`NULL`,
```

3. Na query da playlist em `loadDeviceSlides`, depois de `timeWindows: sql<TimeWindow[]>\`'[]'::jsonb\`,`:

```ts
      loopInsertions: sql<number>`1`,
      panelId: sql<number | null>`NULL`,
```

4. Trocar o trecho que vai de `const deduped = composeDeviceSlides(` até `const visible = filterByOrientation(deduped, screenOrientationOf(device.orientation));` (inclusive o comentário entre eles) por:

```ts
  // A orientação sai antes de montar a volta: bloco que fica sem peça some e
  // não ocupa inserção no rodízio.
  const screen = screenOrientationOf(device.orientation);
  const visible = composeDeviceLoop(
    tagSource(filterByOrientation(eligibleCampaignSlides, screen), "campaign"),
    tagSource(filterByOrientation(panelSlides, screen), "panel"),
    tagSource(filterByOrientation(playlistSlides, screen), "playlist"),
  );
```

5. No `visible.map(async ({ ... }) => ...)`, depois de `timeWindows,` na desestruturação, acrescentar:

```ts
      // Só servem para montar a volta; o player não precisa deles.
      loopInsertions,
      panelId,
```

- [ ] **Step 6: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/panels/__tests__/device-slides.test.ts src/lib/__tests__/device-feed-query.test.ts src/routes/__tests__/display-slides.test.ts src/routes/__tests__/device-preview.test.ts src/routes/__tests__/portal-device-preview.test.ts src/routes/__tests__/public-vitrine.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo PASS, sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/campaigns.ts lib/db/drizzle artifacts/api-server/src/lib/panels/device-slides.ts artifacts/api-server/src/lib/device-feed.ts artifacts/api-server/src/lib/panels/__tests__/device-slides.test.ts artifacts/api-server/src/lib/__tests__/device-feed-query.test.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts
git commit -F - <<'EOF'
feat(api): volta da TV intercala as inserções de cada campanha

Coluna campaigns.loop_insertions (1 a 5, default 1) com migração. Painel do
lojista vira um bloco só, com as páginas juntas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: API de campanhas aceita e devolve as inserções

**Files:**
- Modify: `artifacts/api-server/src/routes/advertisers.ts` (`campaignInput`, seleção das campanhas, insert do POST, update do PATCH)
- Test: `artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts` (reaproveita o fake de banco que já existe ali; não mudar o harness)

**Interfaces:**
- Consumes: `campaignsTable.loopInsertions` (Task 2).
- Produces: POST/PATCH `/campaigns` aceitam `loopInsertions` (inteiro 1–5, opcional, default 1); GET devolve `loopInsertions` — usado pelas Tasks 4 e 5.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `campaign-flyers-route.test.ts`:

```ts
describe("inserções por volta da campanha", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    state.advertiserRow = { id: ADVERTISER_ID };
    state.insertCampaignReturning = { id: CAMPAIGN_ID };
    state.joinedStatsRow = joinedFrom(baseExisting());
    app = await buildApp();
  });

  function insertedCampaign() {
    return state.insertCalls.find((c) => c.table === "campaigns")?.values as Record<string, unknown>;
  }

  function updatedCampaign() {
    return state.updateCalls.find((c) => c.table === "campaigns")?.patch as Record<string, unknown>;
  }

  it("POST grava as inserções escolhidas", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody({ loopInsertions: 3 }));
    expect(res.status).toBe(201);
    expect(insertedCampaign().loopInsertions).toBe(3);
  });

  it("POST sem o campo grava 1×", async () => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody());
    expect(res.status).toBe(201);
    expect(insertedCampaign().loopInsertions).toBe(1);
  });

  it("PATCH grava as inserções escolhidas", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app).patch(`/campaigns/${CAMPAIGN_ID}`).send(campaignBody({ loopInsertions: 2 }));
    expect(res.status).toBe(200);
    expect(updatedCampaign().loopInsertions).toBe(2);
  });

  it("PATCH sem o campo volta a 1× (painel antigo em cache não quebra)", async () => {
    state.existingCampaignRow = baseExisting();
    const { default: request } = await import("supertest");
    const res = await request(app).patch(`/campaigns/${CAMPAIGN_ID}`).send(campaignBody());
    expect(res.status).toBe(200);
    expect(updatedCampaign().loopInsertions).toBe(1);
  });

  it.each([
    ["zero", 0],
    ["acima de 5", 6],
    ["fração", 2.5],
  ])("rejeita com 400: %s", async (_caso, loopInsertions) => {
    const { default: request } = await import("supertest");
    const res = await request(app).post("/campaigns").send(campaignBody({ loopInsertions }));
    expect(res.status).toBe(400);
    expect(state.insertCalls.some((c) => c.table === "campaigns")).toBe(false);
  });

  it("a resposta da campanha traz as inserções (seleção inclui a coluna)", async () => {
    const { default: request } = await import("supertest");
    await request(app).post("/campaigns").send(campaignBody());
    expect(state.lastJoinedCampaignCols).toHaveProperty("loopInsertions");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-flyers-route.test.ts`
Expected: FAIL — `loopInsertions` é `undefined` no insert/update, os inválidos devolvem 201, e a seleção não tem `loopInsertions`.

- [ ] **Step 3: Implementar**

Em `advertisers.ts`:

1. No `campaignInput`, logo depois do campo `timeWindows` (depois do `.default([]),` dele):

```ts
  // Inserções por volta (1 a 5): quantas vezes a campanha toca a cada volta
  // da TV. O default cobre o painel antigo em cache que ainda não manda o
  // campo: a campanha segue 1×.
  loopInsertions: z.coerce.number().int().min(1).max(5).default(1),
```

2. Na seleção das campanhas, depois de `timeWindows: campaignsTable.timeWindows,`:

```ts
  loopInsertions: campaignsTable.loopInsertions,
```

3. No `db.insert(campaignsTable).values({...})` do POST e no `db.update(campaignsTable).set({...})` do PATCH, depois de `timeWindows: normalizeTimeWindows(input.timeWindows),`:

```ts
    loopInsertions: input.loopInsertions,
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/campaign-flyers-route.test.ts`
Expected: PASS (novos e antigos).

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo PASS, sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/advertisers.ts artifacts/api-server/src/routes/__tests__/campaign-flyers-route.test.ts
git commit -F - <<'EOF'
feat(api): campanha aceita e devolve inserções por volta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Estado no formulário e seletor de inserções

**Files:**
- Modify: `artifacts/signage/src/components/use-campaign-form.ts`
- Modify: `artifacts/signage/src/components/campaign-form-dialog.tsx`
- Test: `artifacts/signage/src/components/__tests__/use-campaign-form.test.ts`
- Test: `artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx`

**Interfaces:**
- Consumes: API da Task 3 (`loopInsertions` no corpo).
- Produces (usado pela Task 5):
  - `CampaignFormCampaign.loopInsertions?: number`
  - `UseCampaignForm` ganha `loopInsertions: number` e `setLoopInsertions: (value: number) => void`
  - `export function CampaignLoopInsertionsPicker({ form }: { form: ReturnType<typeof useCampaignForm> })`

- [ ] **Step 1: Escrever os testes que falham**

No fim de `use-campaign-form.test.ts` (o arquivo já tem `okFetch()`; reaproveitar):

```ts
describe('useCampaignForm — inserções por volta', () => {
  it('envia 1 sem mexer e o valor escolhido depois', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    await act(async () => { await result.current.submit(); });
    act(() => result.current.setLoopInsertions(3));
    await act(async () => { await result.current.submit(); });
    const bodies = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(init.body as string));
    expect(bodies.map((body) => body.loopInsertions)).toEqual([1, 3]);
  });

  it('reset carrega as inserções da campanha e volta a 1 na nova', () => {
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.reset({
      id: 1, advertiserId: 3, name: 'C', contractValue: 0, targetMode: 'all',
      startsAt: '2026-09-20T00:00:00.000Z', endsAt: '2026-09-27T00:00:00.000Z',
      loopInsertions: 4,
    }));
    expect(result.current.loopInsertions).toBe(4);
    act(() => result.current.reset(null));
    expect(result.current.loopInsertions).toBe(1);
  });
});
```

Em `campaign-form-dialog.test.tsx`: acrescentar `within` ao import de `@testing-library/react` (`import { render, screen, waitFor, within } from '@testing-library/react';`) e, no fim do `describe('CampaignFormDialog', ...)`:

```ts
  it('escolhe inserções por volta de 1× a 5×, começando em 1×', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, preview())));
    renderDialog();
    const select = screen.getByRole('combobox', { name: 'Inserções por volta' });
    expect(select).toHaveValue('1');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['1×', '2×', '3×', '4×', '5×']);
    await userEvent.selectOptions(select, '3');
    expect(select).toHaveValue('3');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/use-campaign-form.test.ts src/components/__tests__/campaign-form-dialog.test.tsx`
Expected: FAIL — `setLoopInsertions is not a function`; combobox "Inserções por volta" não encontrado.

- [ ] **Step 3: Implementar o hook**

Em `use-campaign-form.ts`:

1. Em `CampaignFormCampaign`, depois de `timeWindows?: TimeWindow[];`: `loopInsertions?: number;`
2. Em `UseCampaignForm`, depois de `removeWindow: (index: number) => void;`:
   ```ts
  loopInsertions: number;
  setLoopInsertions: (value: number) => void;
   ```
3. Estado, depois do `useState` de `timeWindows`:
   ```ts
  // 1× = como antes da frequência existir, mesma convenção do servidor.
  const [loopInsertions, setLoopInsertions] = useState(1);
   ```
4. Em `reset`: no ramo com campanha, depois de `setTimeWindows(campaign.timeWindows ?? []);` → `setLoopInsertions(campaign.loopInsertions ?? 1);`; no ramo sem campanha, depois de `setTimeWindows([]);` → `setLoopInsertions(1);`.
5. No `JSON.stringify({...})` do `submit`, depois de `timeWindows,`: `loopInsertions,` — sempre enviado (painel novo nunca depende do default da API).
6. No `return`, depois da linha `timeWindows, timeWindowsValid, addWindow, updateWindow, removeWindow,`:
   ```ts
    loopInsertions, setLoopInsertions,
   ```

- [ ] **Step 4: Implementar o seletor**

Em `campaign-form-dialog.tsx`, logo depois da função `CampaignTimeWindowsPicker` (o `SELECT_CLASS` já existe no arquivo):

```tsx
const LOOP_INSERTION_OPTIONS = [1, 2, 3, 4, 5] as const;

/**
 * Inserções por volta: quantas vezes a campanha toca a cada volta da TV. O
 * teto de 5 vem da API — mais que isso engoliria a TV do lojista.
 */
export function CampaignLoopInsertionsPicker({ form }: { form: ReturnType<typeof useCampaignForm> }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="campaign-loop-insertions">Inserções por volta</Label>
      <select
        id="campaign-loop-insertions"
        className={SELECT_CLASS}
        value={form.loopInsertions}
        onChange={(e) => form.setLoopInsertions(Number(e.target.value))}
      >
        {LOOP_INSERTION_OPTIONS.map((n) => <option key={n} value={n}>{n}×</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Quantas vezes a campanha toca a cada volta da TV. Com várias peças, cada inserção toca todas em sequência.</p>
    </div>
  );
}
```

No JSX do diálogo, logo depois de `<CampaignTimeWindowsPicker form={form} />`: `<CampaignLoopInsertionsPicker form={form} />`

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/use-campaign-form.test.ts src/components/__tests__/campaign-form-dialog.test.tsx`
Expected: PASS (novos e antigos).

Run: `pnpm --filter @workspace/signage run test && pnpm --filter @workspace/signage run typecheck`
Expected: tudo PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/use-campaign-form.ts artifacts/signage/src/components/campaign-form-dialog.tsx artifacts/signage/src/components/__tests__/use-campaign-form.test.ts artifacts/signage/src/components/__tests__/campaign-form-dialog.test.tsx
git commit -F - <<'EOF'
feat(portal): seletor de inserções por volta no formulário da campanha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Inserções na página da campanha e na linha da lista

**Files:**
- Modify: `artifacts/signage/src/pages/campaign-detail.tsx` (import ~linha 15, tipo ~linha 36, edição ~linha 261, leitura ~linha 272)
- Modify: `artifacts/signage/src/components/campaign-row.tsx`
- Test: `artifacts/signage/src/components/__tests__/campaign-row.test.tsx`

**Interfaces:**
- Consumes: `CampaignLoopInsertionsPicker`, `loopInsertions` do hook (Task 4); `loopInsertions` no GET (Task 3).
- Produces: `CampaignRowData.loopInsertions?: number`.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `campaign-row.test.tsx` (o arquivo já define `base`):

```tsx
describe('CampaignRow — inserções por volta', () => {
  it('mostra as inserções quando passa de 1×', () => {
    render(<CampaignRow campaign={{ ...base, loopInsertions: 2 }} onToggle={vi.fn()} />);
    expect(screen.getByText(/· 2× por volta/)).toBeInTheDocument();
  });

  it('1× não polui a linha', () => {
    render(<CampaignRow campaign={{ ...base, loopInsertions: 1 }} onToggle={vi.fn()} />);
    expect(screen.getByText('Café da manhã')).toBeInTheDocument();
    expect(screen.queryByText(/por volta/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/campaign-row.test.tsx`
Expected: FAIL no primeiro teste novo — `· 2× por volta` não aparece.

- [ ] **Step 3: Implementar a linha**

Em `campaign-row.tsx`:

1. Em `CampaignRowData`, depois de `timeWindows?: TimeWindow[];`: `loopInsertions?: number;`
2. Depois da função `hours`:
   ```ts
// Mesmo critério dos horários: 1× é o implícito e não aparece.
function frequency(campaign: CampaignRowData) {
  const insertions = campaign.loopInsertions ?? 1;
  return insertions > 1 ? ` · ${insertions}× por volta` : "";
}
   ```
3. No JSX, trocar `{recurrence(campaign)}{hours(campaign)}` por `{recurrence(campaign)}{hours(campaign)}{frequency(campaign)}`.

- [ ] **Step 4: Implementar a página da campanha**

Em `campaign-detail.tsx`:

1. Import: trocar `import { CampaignTargetPicker, CampaignTimeWindowsPicker, CampaignWeekdayPicker } from "@/components/campaign-form-dialog";` por
   `import { CampaignLoopInsertionsPicker, CampaignTargetPicker, CampaignTimeWindowsPicker, CampaignWeekdayPicker } from "@/components/campaign-form-dialog";`
2. No tipo da campanha, depois de `timeWindows?: TimeWindow[];`: `loopInsertions?: number;`
3. Na edição, logo depois do bloco
   ```tsx
              <div className="space-y-2 sm:col-span-2">
                <CampaignTimeWindowsPicker form={form} />
              </div>
   ```
   acrescentar:
   ```tsx
              <div className="space-y-2 sm:col-span-2">
                <CampaignLoopInsertionsPicker form={form} />
              </div>
   ```
4. Na leitura, logo depois de `<div><p className="text-xs text-muted-foreground">Horários</p><p>{timeWindowsLabel(data.timeWindows)}</p></div>`:
   ```tsx
              <div><p className="text-xs text-muted-foreground">Inserções por volta</p><p>{data.loopInsertions ?? 1}×</p></div>
   ```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/campaign-row.test.tsx`
Expected: PASS.

Run: `pnpm --filter @workspace/signage run test && pnpm --filter @workspace/signage run typecheck`
Expected: tudo PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add artifacts/signage/src/components/campaign-row.tsx artifacts/signage/src/pages/campaign-detail.tsx artifacts/signage/src/components/__tests__/campaign-row.test.tsx
git commit -F - <<'EOF'
feat(portal): inserções por volta na página e na lista da campanha

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Verificação final

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
git diff main -- 'lib/db/drizzle/*.sql'
```

Expected: só o `ADD COLUMN "loop_insertions" smallint DEFAULT 1 NOT NULL`.

- [ ] **Step 3: Acentos**

```bash
git diff main -- . ':!docs' | grep -n '\\u00\|\\u20' || echo "sem escapes"
```

Expected: `sem escapes`.
