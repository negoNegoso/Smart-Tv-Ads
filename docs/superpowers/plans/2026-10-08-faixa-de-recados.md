# Faixa de recados na TV — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada TV pode ter até 5 recados do admin correndo numa faixa no rodapé, sem cobrir o anúncio.

**Architecture:** Coluna `devices.ticker_messages`; o admin edita na página da TV (PATCH). O feed da TV ganha `ticker: { text } | null` (recados juntos com " · "; `null` sem recados, na vitrine e durante aviso urgente). O `tv.html` mostra a faixa com animação CSS e, com ela, o palco ganha `com-faixa`, que encolhe a área da arte e sobe legenda, QR e barra de progresso. O player web (`display.tsx`) espelha com um componente `TickerBar`.

**Tech Stack:** TypeScript, Express, drizzle-orm (Postgres), orval (OpenAPI), React + TanStack Query + Testing Library, `tv.html` em ES5 testado com jsdom, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-10-08-faixa-de-recados-design.md`

## Global Constraints

- Branch `feat/faixa-de-recados`; PR com título `feat(tv): faixa de recados no rodapé da TV`, merge commit.
- Commits no formato `tipo(escopo): descrição em português`, terminando com a linha exata `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Código e comentários em português explicando o porquê; acentos e símbolos (·, …) como UTF-8 real, nunca `\uXXXX`.
- Até 5 recados por TV, até 80 caracteres cada; espaços das pontas saem; recado vazio é descartado.
- Texto da faixa = recados juntos com `" · "`; `ticker` é `null` sem recados, na vitrine e com aviso urgente no ar.
- No `tv.html`: faixa com `8vh` no rodapé, fundo `#111`, texto branco `4.5vh`; com faixa, slots da arte e do YouTube terminam em `bottom: 8vh`, `#overlay` e `#qr-box` sobem para `bottom: 11vh`, `#progress-track` para `bottom: 8vh`. Duração da animação: `max(12, ceil(texto.length * 0.25))` segundos.
- `tv.html` é ES5 (sem `let`/`const`/arrow/template string), como o resto do arquivo.
- Feed de servidor antigo (sem `ticker`) não pode quebrar a TV.
- Toda mudança de schema gera migração versionada com `pnpm --filter @workspace/db run generate` (com `DATABASE_URL` fictício) e a commita.

## Review Focus

- Refresh do feed em TV em pé: `applyOrientation` reescreve a classe do `#stage` a cada busca → a faixa tem de ser reaplicada depois, sem sumir. Teste na Task 3.
- Refresh com o mesmo texto não reescreve o texto nem a duração (a faixa não "pula"). Teste na Task 3.
- Recado só com espaços ou lista com vazios no meio → descartados, sem virar " ·  · ". Teste na Task 1.
- Aviso urgente entra no ar com faixa ligada → faixa some; aviso encerrado → volta. Teste na Task 2.
- Admin apaga todos os recados e salva → `tickerMessages: []`, TV sem faixa. Teste na Task 5.

---

## Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `artifacts/api-server/src/lib/ticker.ts` (novo) | `normalizeTickerMessages`, `tickerText`, limites |
| `lib/db/src/schema/devices.ts` + `lib/db/drizzle/*` | coluna `ticker_messages` |
| `artifacts/api-server/src/routes/devices.ts` | PATCH aceita, GET devolve |
| `lib/api-spec/openapi.yaml` + gerados | `Device.tickerMessages`, `DeviceUpdate.tickerMessages`, `DisplayFeed.ticker` |
| `artifacts/api-server/src/routes/display.ts` | `ticker` no feed |
| `artifacts/signage/public/tv.html` | faixa na TV |
| `artifacts/signage/src/components/ticker-bar.tsx` (novo) + `src/index.css` + `pages/display.tsx` | faixa no player web |
| `artifacts/signage/src/components/device-ticker-field.tsx` (novo) + `pages/device-detail.tsx` | edição no admin |

Desvios conscientes da spec:
- O `openapi.yaml` declara `tickerMessages` como lista de strings **sem** `maxItems`/`maxLength`: com eles o zod gerado recusaria antes do servidor e a mensagem em português ("Até 5 recados.") nunca chegaria ao admin. A validação fica toda em `normalizeTickerMessages`.
- O player web não ganha prop nova no `PlayerStage`: `display.tsx` põe o `PlayerStage` numa caixa que termina `8vh` acima do rodapé e a `TickerBar` embaixo — mesmo efeito, sem mexer no componente usado pela landing.
- Sem fallback de texto parado para navegador sem animação CSS: todas as TVs suportadas têm `-webkit-animation`.

---

### Task 1: Recados na TV (dados, regra e API)

**Files:**
- Create: `artifacts/api-server/src/lib/ticker.ts`
- Modify: `lib/db/src/schema/devices.ts`
- Create: `lib/db/drizzle/<gerado>.sql` (+ meta)
- Modify: `artifacts/api-server/src/routes/devices.ts` (`getDeviceWithClient`, `PATCH /devices/:id`)
- Modify: `lib/api-spec/openapi.yaml` (`Device`, `DeviceUpdate`, `DisplayFeed`) + gerados
- Test: `artifacts/api-server/src/lib/__tests__/ticker.test.ts` (novo)
- Test: `artifacts/api-server/src/routes/__tests__/device-update.test.ts`

**Interfaces:**
- Produces:
  - `export const MAX_TICKER_MESSAGES = 5; export const MAX_TICKER_LENGTH = 80;`
  - `export function normalizeTickerMessages(input: unknown): { ok: true; messages: string[] } | { ok: false; error: string }`
  - `export function tickerText(messages: string[]): string | null`
  - `devicesTable.tickerMessages` (`text[] NOT NULL DEFAULT '{}'`)
  - Contrato: `Device.tickerMessages?: string[]`, `DeviceUpdate.tickerMessages?: string[]`, `DisplayFeed.ticker?: { text: string } | null` (usados pelas Tasks 2, 4 e 5).

- [ ] **Step 1: Escrever os testes que falham**

```ts
// artifacts/api-server/src/lib/__tests__/ticker.test.ts
import { describe, expect, it } from "vitest";
import { normalizeTickerMessages, tickerText } from "../ticker";

describe("tickerText", () => {
  it("junta os recados com ponto médio", () => {
    expect(tickerText(["Pão quentinho às 17h", "Siga @padaria"])).toBe("Pão quentinho às 17h · Siga @padaria");
  });

  it("sem recados não há faixa", () => {
    expect(tickerText([])).toBeNull();
  });
});

describe("normalizeTickerMessages", () => {
  it("tira espaços das pontas e descarta recados vazios", () => {
    expect(normalizeTickerMessages(["  Pão às 17h  ", "", "   ", "Siga @padaria"])).toEqual({
      ok: true,
      messages: ["Pão às 17h", "Siga @padaria"],
    });
  });

  it("lista vazia é válida (tira a faixa)", () => {
    expect(normalizeTickerMessages([])).toEqual({ ok: true, messages: [] });
  });

  it("aceita 5 recados de 80 caracteres", () => {
    const cinco = Array.from({ length: 5 }, (_, i) => `${i}`.padEnd(80, "x"));
    expect(normalizeTickerMessages(cinco)).toEqual({ ok: true, messages: cinco });
  });

  it("recusa 6 recados", () => {
    expect(normalizeTickerMessages(["a", "b", "c", "d", "e", "f"])).toEqual({ ok: false, error: "Até 5 recados." });
  });

  it("recusa recado com mais de 80 caracteres", () => {
    expect(normalizeTickerMessages(["x".repeat(81)])).toEqual({ ok: false, error: "Cada recado tem até 80 caracteres." });
  });

  it("vazios não contam no limite de 5", () => {
    expect(normalizeTickerMessages(["a", "", "b", "c", "d", "e", " "])).toEqual({
      ok: true,
      messages: ["a", "b", "c", "d", "e"],
    });
  });

  it.each([["texto solto", "oi"], ["número na lista", ["a", 2]], ["nulo", null]])(
    "entrada inválida (%s) é recusada",
    (_caso, entrada) => {
      expect(normalizeTickerMessages(entrada)).toEqual({ ok: false, error: "Recados inválidos." });
    },
  );
});
```

Em `device-update.test.ts`:

1. No mock de `@workspace/db`, acrescentar `tickerMessages: "tickerMessages"` ao `devicesTable` (mantendo as chaves existentes).
2. No fim do arquivo:

```ts
describe("PATCH /devices/:id — faixa de recados", () => {
  it("grava os recados normalizados e devolve a TV com eles", async () => {
    // 1) TV atual  2) TV com cliente (resposta)
    selectQueue = [
      [{ id: 1, showcase: false, orientation: "landscape" }],
      [{ ...DEVICE, tickerMessages: ["Pão às 17h", "Siga @padaria"] }],
    ];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app)
      .patch("/devices/1")
      .send({ tickerMessages: ["  Pão às 17h  ", "", "Siga @padaria"] });
    expect(res.status).toBe(200);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ tickerMessages: ["Pão às 17h", "Siga @padaria"] }));
    expect(res.body.tickerMessages).toEqual(["Pão às 17h", "Siga @padaria"]);
  });

  it.each([
    ["6 recados", ["a", "b", "c", "d", "e", "f"], "Até 5 recados."],
    ["recado longo", ["x".repeat(81)], "Cada recado tem até 80 caracteres."],
  ])("400 com a mensagem: %s, sem tocar no banco", async (_caso, tickerMessages, error) => {
    const app = await buildApp();
    const { default: request } = await import("supertest");
    const res = await request(app).patch("/devices/1").send({ tickerMessages });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect(setMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/ticker.test.ts src/routes/__tests__/device-update.test.ts`
Expected: FAIL — `../ticker` não existe; PATCH ignora/recusa `tickerMessages`.

- [ ] **Step 3: Regra pura**

```ts
// artifacts/api-server/src/lib/ticker.ts
/** Limites da faixa de recados: o que cabe ler passando na frente da TV. */
export const MAX_TICKER_MESSAGES = 5;
export const MAX_TICKER_LENGTH = 80;

export type TickerNormalization = { ok: true; messages: string[] } | { ok: false; error: string };

/**
 * Lista que o admin mandou → lista gravada. Espaços das pontas saem e recado
 * vazio é descartado antes de contar o limite: campo deixado em branco no
 * formulário não pode virar " ·  · " na TV nem estourar os 5.
 */
export function normalizeTickerMessages(input: unknown): TickerNormalization {
  if (!Array.isArray(input) || input.some((message) => typeof message !== "string")) {
    return { ok: false, error: "Recados inválidos." };
  }
  const messages = (input as string[]).map((message) => message.trim()).filter((message) => message.length > 0);
  if (messages.length > MAX_TICKER_MESSAGES) return { ok: false, error: "Até 5 recados." };
  if (messages.some((message) => message.length > MAX_TICKER_LENGTH)) {
    return { ok: false, error: "Cada recado tem até 80 caracteres." };
  }
  return { ok: true, messages };
}

/** Texto que corre na faixa. O servidor junta para os dois players mostrarem igual. */
export function tickerText(messages: string[]): string | null {
  return messages.length > 0 ? messages.join(" · ") : null;
}
```

- [ ] **Step 4: Coluna e migração**

Em `lib/db/src/schema/devices.ts`, depois da coluna `showWeather`:

```ts
    // Recados que correm na faixa do rodapé desta TV (até 5, até 80
    // caracteres cada; a API valida). Vazio = TV sem faixa.
    tickerMessages: text("ticker_messages").array().notNull().default([]),
```

Gerar e conferir:

```bash
cd lib/db && npx tsc --build && cd ../..
DATABASE_URL=postgres://u:p@localhost:5432/x pnpm --filter @workspace/db run generate
cat "$(ls -t lib/db/drizzle/*.sql | head -1)"
```

Expected: só `ALTER TABLE "devices" ADD COLUMN "ticker_messages" text[] DEFAULT '{}' NOT NULL;`. Qualquer outra alteração → parar e reportar BLOCKED com o SQL.

- [ ] **Step 5: Contrato**

Em `lib/api-spec/openapi.yaml`:

- `Device`, depois de `companyHasCoordinates`:
  ```yaml
        # Recados da faixa do rodapé desta TV.
        tickerMessages:
          type: array
          items: { type: string }
  ```
- `DeviceUpdate`, depois de `showWeather`:
  ```yaml
        # Recados da faixa (até 5, até 80 caracteres). Sem maxItems/maxLength
        # aqui de propósito: a API valida e devolve a mensagem em português.
        tickerMessages:
          type: array
          items: { type: string }
  ```
- `DisplayFeed`, depois de `music`:
  ```yaml
        # Faixa de recados no rodapé. Fora de `slides`: não é peça, não conta
        # exibição. Nulo = TV sem faixa (ou aviso urgente no ar).
        ticker:
          type: ["object", "null"]
          required: [text]
          properties:
            text: { type: string }
  ```

Regenerar e conferir:

```bash
pnpm --filter @workspace/api-spec run codegen
git diff --stat lib/api-zod lib/api-client-react
```

- [ ] **Step 6: Rota**

Em `routes/devices.ts`:

1. `import { normalizeTickerMessages } from "../lib/ticker";`
2. No `select` de `getDeviceWithClient`, depois de `showWeather: devicesTable.showWeather,`: `tickerMessages: devicesTable.tickerMessages,`
3. No `PATCH /devices/:id`, logo depois do bloco que trata `data.musicUrl` (e antes do `select` da TV atual):

```ts
  // Recados da faixa: a mesma regra vale para quem chama pela API sem o
  // formulário — lista limpa e dentro do limite, ou 400 com o motivo.
  if (data.tickerMessages !== undefined) {
    const ticker = normalizeTickerMessages(data.tickerMessages);
    if (!ticker.ok) {
      res.status(400).json({ error: ticker.error });
      return;
    }
    data.tickerMessages = ticker.messages;
  }
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/__tests__/ticker.test.ts src/routes/__tests__/device-update.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm run typecheck && pnpm --filter @workspace/signage run test`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/lib/ticker.ts artifacts/api-server/src/lib/__tests__/ticker.test.ts artifacts/api-server/src/routes/devices.ts artifacts/api-server/src/routes/__tests__/device-update.test.ts lib/db/src/schema/devices.ts lib/db/drizzle lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -F - <<'EOF'
feat(api): recados da faixa por TV

Coluna devices.ticker_messages com migração; PATCH valida até 5 recados de
até 80 caracteres.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Faixa no feed da TV

**Files:**
- Modify: `artifacts/api-server/src/routes/display.ts`
- Test: `artifacts/api-server/src/routes/__tests__/display-slides.test.ts`

**Interfaces:**
- Consumes: `tickerText` (Task 1), `devicesTable.tickerMessages`, `DisplayFeed.ticker` no zod gerado (Task 1).
- Produces: `/display/:key/feed` com `ticker: { text } | null` (usado pelas Tasks 3 e 4).

- [ ] **Step 1: Escrever os testes que falham**

Em `display-slides.test.ts`:

1. No mock de `@workspace/db`, acrescentar `tickerMessages: "tickerMessages"` ao `devicesTable` (mantendo as chaves existentes).
2. No fim do arquivo:

```ts
describe("GET /display/:deviceKey/feed — faixa de recados", () => {
  const RECADOS = ["Pão quentinho às 17h", "Siga @padaria"];

  beforeEach(() => {
    dbSelect.mockReset();
    dbUpdate.mockReset();
    panelSlidesForClientMock.mockReset();
    panelSlidesForClientMock.mockResolvedValue([]);
    selectResults = [];
    selectCallIndex = 0;
  });

  async function feed(device: Record<string, unknown>, extra: unknown[] = [[]]) {
    selectResults = [[device], [PLAYLIST_ROW], [CAMPAIGN_ROW], ...extra];
    const app = await buildApp();
    const { default: request } = await import("supertest");
    return (await request(app).get("/display/tv-1/feed")).body;
  }

  it("TV com recados recebe o texto da faixa", async () => {
    const body = await feed({ ...DEVICE_ROW, showcase: false, tickerMessages: RECADOS });
    expect(body.ticker).toEqual({ text: "Pão quentinho às 17h · Siga @padaria" });
  });

  it("TV sem recados: ticker nulo", async () => {
    const body = await feed({ ...DEVICE_ROW, showcase: false, tickerMessages: [] });
    expect(body.ticker).toBeNull();
  });

  it("linha sem a coluna (servidor em transição): ticker nulo", async () => {
    const body = await feed({ ...DEVICE_ROW, showcase: false });
    expect(body.ticker).toBeNull();
  });

  it("vitrine não tem faixa", async () => {
    const body = await feed({ ...DEVICE_ROW, showcase: true, tickerMessages: RECADOS });
    expect(body.ticker).toBeNull();
  });

  it("aviso urgente no ar tira a faixa", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-08T15:00:00Z"), toFake: ["Date"] });
    try {
      const aviso = {
        id: 1, title: "Aviso", body: null, targetMode: "all", segmentIds: [], companyIds: [],
        startsAt: new Date("2026-10-08T14:00:00Z"), endsAt: new Date("2026-10-08T16:00:00Z"), endedAt: null,
        landscapeAnnouncementId: 901, portraitAnnouncementId: 902, createdAt: new Date("2026-10-08T14:00:00Z"),
      };
      const peca = { announcementId: 901, title: "Aviso", imageUrl: "/api/uploads/aviso.png", duration: 15 };
      const body = await feed({ ...DEVICE_ROW, showcase: false, tickerMessages: RECADOS }, [[aviso], [peca]]);
      expect(body.slides.map((s: { announcementId: number }) => s.announcementId)).toEqual([901]);
      expect(body.ticker).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts`
Expected: FAIL — `ticker` ausente (`undefined`) no corpo.

- [ ] **Step 3: Implementar**

Em `routes/display.ts`:

1. `import { tickerText } from "../lib/ticker";`
2. No `select` do `loadForTv`, depois de `musicUrl: devicesTable.musicUrl,`: `tickerMessages: devicesTable.tickerMessages,`
3. Em `loadForTv`, antes do `return` que tira a origem dos slides, calcular se o aviso tomou a TV e devolver junto:

```ts
  const slides = await loadDeviceSlides(device, req.log);
  // Aviso urgente toma a tela inteira, faixa incluída. Decidido aqui porque
  // a origem do slide sai antes da resposta.
  const alertActive = slides.some((slide) => slide.source === "alert");
  // A origem do slide é só para a prévia do admin; a TV não precisa dela.
  return { device, appVersion, now, alertActive, slides: slides.map(({ source, ...slide }) => slide) };
```

4. No `GetDisplayFeedResponse.parse({...})` do `/display/:deviceKey/feed`, depois de `music: …,`:

```ts
      // Faixa de recados: fora de `slides` como a música. Some na vitrine
      // (espelhada na landing) e durante aviso urgente.
      ticker: (() => {
        if (tv.device.showcase || tv.alertActive) return null;
        const text = tickerText(tv.device.tickerMessages ?? []);
        return text ? { text } : null;
      })(),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/display-slides.test.ts`
Expected: PASS.

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/api-server run typecheck`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/display.ts artifacts/api-server/src/routes/__tests__/display-slides.test.ts
git commit -F - <<'EOF'
feat(api): feed da TV leva o texto da faixa de recados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Faixa no `tv.html`

**Files:**
- Modify: `artifacts/signage/public/tv.html`
- Test: `artifacts/signage/src/__tests__/tv-html.test.ts`

**Interfaces:**
- Consumes: feed com `ticker: { text } | null` (Task 2).
- Produces: elementos `#ticker` e `#ticker-text`; classe `com-faixa` no `#stage`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tv-html.test.ts`:

1. Junto das outras variáveis do topo (perto de `let musica`), acrescentar:
   ```ts
// Faixa de recados que o /feed devolve (undefined = servidor antigo, sem o campo).
let faixa: unknown = undefined;
   ```
2. No `beforeEach` principal, junto de `musica = null;`: `faixa = undefined;`
3. No `XhrStub`, no JSON do `/feed`, acrescentar `ticker: faixa` ao objeto: `JSON.stringify({ screen: { orientation: orientacao }, music: musica, appUpdate: atualizacao, ticker: faixa, slides: listaDeSlides })`.
4. No fim do arquivo:

```ts
describe("tv.html: faixa de recados", () => {
  const stage = () => document.getElementById("stage")!;
  const texto = () => document.getElementById("ticker-text")!;

  it("com ticker: mostra o texto e o palco ganha com-faixa", () => {
    faixa = { text: "Pão quentinho às 17h · Siga @padaria" };
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    expect(texto().textContent).toBe("Pão quentinho às 17h · Siga @padaria");
    expect(stage().className).toContain("com-faixa");
  });

  it("duração cresce com o texto, com mínimo de 12s", () => {
    faixa = { text: "Curto" };
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    expect(texto().style.animationDuration).toBe("12s");

    faixa = { text: "x".repeat(200) };
    vi.advanceTimersByTime(60000);
    expect(texto().style.animationDuration).toBe("50s");
  });

  it("sem ticker: sem faixa", () => {
    faixa = null;
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    expect(stage().className).not.toContain("com-faixa");
    expect(texto().textContent).toBe("");
  });

  it("servidor antigo, sem o campo: não quebra e fica sem faixa", () => {
    faixa = undefined;
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    responder("https://blob/a.png", true);
    expect(noAr()).toBe("https://blob/a.png");
    expect(stage().className).not.toContain("com-faixa");
  });

  it("refresh com o mesmo texto não reescreve a faixa", () => {
    faixa = { text: "Pão quentinho às 17h" };
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    const no = texto().firstChild;
    vi.advanceTimersByTime(60000);
    expect(texto().firstChild).toBe(no);
    expect(stage().className).toContain("com-faixa");
  });

  it("refresh com texto novo troca", () => {
    faixa = { text: "Pão quentinho às 17h" };
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    faixa = { text: "Hoje fechamos às 18h" };
    vi.advanceTimersByTime(60000);
    expect(texto().textContent).toBe("Hoje fechamos às 18h");
  });

  it("refresh com ticker nulo tira a faixa", () => {
    faixa = { text: "Pão quentinho às 17h" };
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    faixa = null;
    vi.advanceTimersByTime(60000);
    expect(stage().className).not.toContain("com-faixa");
    expect(texto().textContent).toBe("");
  });

  it("TV em pé: a faixa continua depois do refresh (o giro reescreve a classe do palco)", () => {
    orientacao = "portrait_right";
    faixa = { text: "Pão quentinho às 17h" };
    listaDeSlides = [slide(1, "https://blob/a.png")];
    carregarTv();
    vi.advanceTimersByTime(60000);
    expect(stage().className).toContain("portrait-right");
    expect(stage().className).toContain("com-faixa");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/tv-html.test.ts`
Expected: FAIL nos testes novos — `#ticker-text` não existe (`null`).

- [ ] **Step 3: Implementar no `tv.html`**

1. HTML: logo depois da linha `<div id="qr-box">…</div>` (dentro do `#stage`):

```html
    <div id="ticker"><div id="ticker-text"></div></div>
```

2. CSS: no `<style>`, logo depois da regra `#qr-img { … }`:

```css
    /* Faixa de recados no rodapé. Com ela o palco ganha `com-faixa` e tudo o
       que ficava no rodapé sobe: nenhuma arte paga fica coberta. Espelho de
       src/components/ticker-bar.tsx — mudou lá, mude aqui. */
    #ticker {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: 8vh;
      background: #111;
      color: #fff;
      overflow: hidden;
      white-space: nowrap;
      display: none;
      z-index: 4;
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      font-size: 4.5vh;
      line-height: 8vh;
    }
    #stage.com-faixa #ticker { display: block; }
    /* O #yt-slot tem bottom:0 em estilo inline: só !important vence. */
    #stage.com-faixa #slot-a,
    #stage.com-faixa #slot-b,
    #stage.com-faixa #yt-slot { bottom: 8vh !important; }
    #stage.com-faixa #overlay,
    #stage.com-faixa #qr-box { bottom: 11vh; }
    #stage.com-faixa #progress-track { bottom: 8vh; }
    /* Começa fora da tela à direita (padding de 100%) e anda até sair pela
       esquerda; a duração vem do JS para a velocidade não depender do tamanho. */
    #ticker-text {
      display: inline-block;
      padding-left: 100%;
      -webkit-animation-name: ticker-correr;
      animation-name: ticker-correr;
      -webkit-animation-timing-function: linear;
      animation-timing-function: linear;
      -webkit-animation-iteration-count: infinite;
      animation-iteration-count: infinite;
    }
    @-webkit-keyframes ticker-correr {
      from { -webkit-transform: translateX(0); }
      to { -webkit-transform: translateX(-100%); }
    }
    @keyframes ticker-correr {
      from { transform: translateX(0); }
      to { transform: translateX(-100%); }
    }
```

3. JS: logo antes de `function aplicarMusica(music) {`:

```js
      // ─── Faixa de recados ────────────────────────────────────────────────
      // O servidor manda o texto pronto (recados juntos com " · "). Texto igual
      // ao que já corre não é reescrito: a faixa não pula a cada refresh.
      // Chamada depois de applyOrientation, que reescreve a classe do palco.
      var faixaTexto = '';
      function aplicarFaixa(ticker) {
        var el = document.getElementById('ticker-text');
        var texto = ticker && typeof ticker.text === 'string' ? ticker.text : '';
        if (!texto) {
          stageEl.className = stageEl.className.replace(/\s*com-faixa/g, '');
          if (faixaTexto) { el.textContent = ''; }
          faixaTexto = '';
          return;
        }
        if (stageEl.className.indexOf('com-faixa') === -1) {
          stageEl.className = stageEl.className ? stageEl.className + ' com-faixa' : 'com-faixa';
        }
        if (texto === faixaTexto) { return; }
        faixaTexto = texto;
        el.textContent = texto;
        var segundos = Math.max(12, Math.ceil(texto.length * 0.25)) + 's';
        el.style.webkitAnimationDuration = segundos;
        el.style.animationDuration = segundos;
      }

```

4. No fluxo do feed, logo depois de `var girou = applyOrientation(data.screen && data.screen.orientation);`:

```js
          // Depois do giro: applyOrientation reescreve a classe do palco.
          aplicarFaixa(data.ticker);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/__tests__/tv-html.test.ts`
Expected: PASS (novos e todos os antigos).

Run: `pnpm --filter @workspace/signage run test`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/public/tv.html artifacts/signage/src/__tests__/tv-html.test.ts
git commit -F - <<'EOF'
feat(tv): faixa de recados correndo no rodapé do tv.html

Com faixa, a arte, a legenda e o QR sobem: nenhum anúncio fica coberto.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Faixa no player web

**Files:**
- Create: `artifacts/signage/src/components/ticker-bar.tsx`
- Modify: `artifacts/signage/src/index.css`
- Modify: `artifacts/signage/src/pages/display.tsx`
- Test: `artifacts/signage/src/components/__tests__/ticker-bar.test.tsx` (novo)
- Test: `artifacts/signage/src/pages/__tests__/display.test.tsx` (novo)

**Interfaces:**
- Consumes: `feed.ticker` do `useGetDisplayFeed` (tipo gerado na Task 1).
- Produces: `export function tickerDurationSeconds(text: string): number`, `export function TickerBar({ text }: { text: string })`.

- [ ] **Step 1: Escrever os testes que falham**

```tsx
// artifacts/signage/src/components/__tests__/ticker-bar.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TickerBar, tickerDurationSeconds } from '../ticker-bar';

describe('tickerDurationSeconds', () => {
  it('mesma regra do tv.html: 0,25s por caractere, mínimo 12s', () => {
    expect(tickerDurationSeconds('Curto')).toBe(12);
    expect(tickerDurationSeconds('x'.repeat(200))).toBe(50);
  });
});

describe('TickerBar', () => {
  it('mostra o texto correndo com a duração da regra', () => {
    render(<TickerBar text="Pão quentinho às 17h" />);
    const texto = screen.getByText('Pão quentinho às 17h');
    expect(texto.style.animation).toContain('ticker-correr');
    expect(texto.style.animation).toContain('12s');
    expect(screen.getByTestId('ticker')).toBeInTheDocument();
  });
});
```

```tsx
// artifacts/signage/src/pages/__tests__/display.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Display from '../display';

function feed(ticker: unknown) {
  return {
    screen: { orientation: 'landscape' },
    music: null,
    ticker,
    slides: [{
      announcementId: 1, campaignId: null, title: 't', displayText: null, imageUrl: '/api/storage/objects/a.jpg',
      duration: 10, qrImageUrl: null, mediaKind: 'image', youtubeId: null, playbackMode: 'capped',
      audioMode: 'muted', videoIds: null,
    }],
  };
}

function stub(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  )));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Display /></QueryClientProvider>);
}

beforeEach(() => window.history.replaceState({}, '', '/display/CHAVE'));
afterEach(() => vi.unstubAllGlobals());

describe('Display — faixa de recados', () => {
  it('com ticker: mostra a faixa e o palco termina acima dela', async () => {
    stub(feed({ text: 'Pão quentinho às 17h' }));
    renderPage();
    expect(await screen.findByText('Pão quentinho às 17h')).toBeInTheDocument();
    expect(screen.getByTestId('player-area').style.bottom).toBe('8vh');
  });

  it('sem ticker: sem faixa e o palco vai até o rodapé', async () => {
    stub(feed(null));
    renderPage();
    expect(await screen.findByTestId('player-area')).toBeInTheDocument();
    expect(screen.queryByTestId('ticker')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-area').style.bottom).toBe('0px');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/ticker-bar.test.tsx src/pages/__tests__/display.test.tsx`
Expected: FAIL — `../ticker-bar` não existe; `player-area` não existe.

- [ ] **Step 3: Implementar**

```tsx
// artifacts/signage/src/components/ticker-bar.tsx
/**
 * Faixa de recados no rodapé do palco. Espelho do #ticker de public/tv.html —
 * mudou lá, mude aqui: mesma altura (8vh), cores e regra de velocidade.
 */
export function tickerDurationSeconds(text: string): number {
  return Math.max(12, Math.ceil(text.length * 0.25));
}

export function TickerBar({ text }: { text: string }) {
  return (
    <div
      data-testid="ticker"
      className="absolute inset-x-0 bottom-0 z-40 h-[8vh] overflow-hidden whitespace-nowrap bg-[#111] text-[4.5vh] leading-[8vh] text-white"
    >
      {/* key: texto novo recomeça a animação do início, como no tv.html. */}
      <div
        key={text}
        className="inline-block pl-[100%]"
        style={{ animation: `ticker-correr ${tickerDurationSeconds(text)}s linear infinite` }}
      >
        {text}
      </div>
    </div>
  );
}
```

Em `src/index.css`, no fim do arquivo:

```css
/* Faixa de recados (components/ticker-bar.tsx): mesmo keyframe do tv.html. */
@keyframes ticker-correr {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
```

Em `pages/display.tsx`:

1. `import { TickerBar } from '@/components/ticker-bar';`
2. Depois de `const orientation = feed?.screen.orientation;`: `const tickerText = feed?.ticker?.text ?? null;`
3. Trocar o conteúdo do `<div style={stageStyle(orientation)}>` do palco por:

```tsx
      <div style={stageStyle(orientation)}>
        {/* Com faixa, o player termina acima dela: nenhuma arte paga fica
            coberta (mesma regra do `com-faixa` do tv.html). */}
        <div data-testid="player-area" className="absolute inset-x-0 top-0" style={{ bottom: tickerText ? '8vh' : 0 }}>
          {/* key: girou a TV, recomeça do primeiro slide no formato novo (mesma regra do tv.html). */}
          {/* Passar pelo estado de erro/vazio desmonta o palco: ao voltar, o rodízio recomeça sem cursor de playlist nem posição de vídeo — aceito. */}
          <PlayerStage key={orientation} slides={slides} onPlay={sendPlay} />
        </div>
        {tickerText && <TickerBar text={tickerText} />}
      </div>
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/components/__tests__/ticker-bar.test.tsx src/pages/__tests__/display.test.tsx`
Expected: PASS. (Se o jsdom normalizar `style.bottom` de `0` para `"0px"` de outro jeito, ajustar só a asserção do caso sem faixa e dizer no relatório.)

Run: `pnpm --filter @workspace/signage run test && pnpm --filter @workspace/signage run typecheck`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/ticker-bar.tsx artifacts/signage/src/components/__tests__/ticker-bar.test.tsx artifacts/signage/src/index.css artifacts/signage/src/pages/display.tsx artifacts/signage/src/pages/__tests__/display.test.tsx
git commit -F - <<'EOF'
feat(tv): faixa de recados no player web

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Recados na página da TV (admin)

**Files:**
- Create: `artifacts/signage/src/components/device-ticker-field.tsx`
- Modify: `artifacts/signage/src/pages/device-detail.tsx`
- Test: `artifacts/signage/src/pages/__tests__/device-detail.test.tsx`

**Interfaces:**
- Consumes: `Device.tickerMessages` e `DeviceUpdate.tickerMessages` (Task 1).
- Produces: `export function DeviceTickerField({ deviceId, messages }: { deviceId: number; messages: string[] })`.

- [ ] **Step 1: Escrever os testes que falham**

Em `device-detail.test.tsx`:

1. Acrescentar ao objeto `DEVICE`: `tickerMessages: [] as string[],`
2. No fim do `describe` principal (o mesmo onde estão os testes de vitrine e clima):

```tsx
  it('escreve um recado e salva a lista sem vazios', async () => {
    const patches: unknown[] = [];
    stubTv(DEVICE, [ANUNCIO], patches);
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: '+ recado' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Recado 1' }), 'Pão quentinho às 17h');
    await userEvent.click(screen.getByRole('button', { name: '+ recado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar recados' }));
    await waitFor(() => expect(patches).toEqual([{ tickerMessages: ['Pão quentinho às 17h'] }]));
  });

  it('mostra os recados gravados e "+ recado" some no quinto', async () => {
    stubTv({ ...DEVICE, tickerMessages: ['a', 'b', 'c', 'd'] }, [ANUNCIO]);
    renderPagina();
    expect(await screen.findByRole('textbox', { name: 'Recado 4' })).toHaveValue('d');
    await userEvent.click(screen.getByRole('button', { name: '+ recado' }));
    expect(screen.queryByRole('button', { name: '+ recado' })).not.toBeInTheDocument();
  });

  it('remover todos e salvar manda lista vazia', async () => {
    const patches: unknown[] = [];
    stubTv({ ...DEVICE, tickerMessages: ['Pão quentinho às 17h'] }, [ANUNCIO], patches);
    renderPagina();
    await userEvent.click(await screen.findByRole('button', { name: 'Remover recado 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar recados' }));
    await waitFor(() => expect(patches).toEqual([{ tickerMessages: [] }]));
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/device-detail.test.tsx`
Expected: FAIL — botão "+ recado" não existe.

- [ ] **Step 3: Implementar o campo**

```tsx
// artifacts/signage/src/components/device-ticker-field.tsx
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDevice, getGetDeviceQueryKey, getGetDevicePreviewQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { mensagemDeErro } from '@/lib/api-error';

/** Mesmos limites da API: o que dá para ler passando na frente da TV. */
const MAX_RECADOS = 5;
const MAX_CARACTERES = 80;

/**
 * Recados que correm na faixa do rodapé da TV. Campo vazio não vai para o
 * servidor; lista vazia tira a faixa.
 */
export function DeviceTickerField({ deviceId, messages }: { deviceId: number; messages: string[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [recados, setRecados] = useState<string[]>(messages);

  // O valor gravado chega depois do primeiro render e muda a cada salvar.
  useEffect(() => setRecados(messages), [messages]);

  const update = useUpdateDevice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
        queryClient.invalidateQueries({ queryKey: getGetDevicePreviewQueryKey(deviceId) });
        toast({ title: 'Faixa salva.' });
      },
      // Sem mexer nos campos: quem errou quer corrigir o que digitou.
      onError: (err) =>
        toast({ title: mensagemDeErro(err, 'Não foi possível salvar a faixa'), variant: 'destructive' }),
    },
  });

  const limpos = recados.map((recado) => recado.trim()).filter((recado) => recado.length > 0);

  return (
    <div className="mb-6 rounded-lg border px-3 py-2.5 text-sm">
      <p className="font-medium">Faixa de recados</p>
      <p className="text-muted-foreground mb-2">
        Os recados correm no rodapé da TV, juntos, em loop. O anúncio encolhe um pouco para não ficar coberto.
      </p>
      <div className="space-y-2">
        {recados.map((recado, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Recado ${index + 1}`}
              maxLength={MAX_CARACTERES}
              value={recado}
              disabled={update.isPending}
              onChange={(e) => setRecados(recados.map((r, i) => (i === index ? e.target.value : r)))}
            />
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">{recado.length}/{MAX_CARACTERES}</span>
            <Button
              size="sm"
              variant="outline"
              aria-label={`Remover recado ${index + 1}`}
              disabled={update.isPending}
              onClick={() => setRecados(recados.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {recados.length < MAX_RECADOS && (
          <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setRecados([...recados, ''])}>
            + recado
          </Button>
        )}
        <Button
          size="sm"
          aria-label="Salvar recados"
          disabled={update.isPending}
          onClick={() => update.mutate({ id: deviceId, data: { tickerMessages: limpos } })}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
```

Em `pages/device-detail.tsx`: `import { DeviceTickerField } from '@/components/device-ticker-field';` e, logo depois de `<DeviceMusicField deviceId={deviceId} musicUrl={device.musicUrl ?? null} />`:

```tsx
      <DeviceTickerField deviceId={deviceId} messages={device.tickerMessages ?? NO_MESSAGES} />
```

com `const NO_MESSAGES: string[] = [];` no topo do arquivo (fora do componente — referência estável para o `useEffect` do campo não repor a lista a cada render).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage exec vitest run src/pages/__tests__/device-detail.test.tsx`
Expected: PASS.

Run: `pnpm --filter @workspace/signage run test && pnpm --filter @workspace/signage run typecheck`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add artifacts/signage/src/components/device-ticker-field.tsx artifacts/signage/src/pages/device-detail.tsx artifacts/signage/src/pages/__tests__/device-detail.test.tsx
git commit -F - <<'EOF'
feat(portal): recados da faixa na página da TV

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
cat "$(ls -t lib/db/drizzle/*.sql | head -1)"
```

Expected: só o `ADD COLUMN "ticker_messages" text[] DEFAULT '{}' NOT NULL`.

- [ ] **Step 3: Acentos e ES5 no tv.html**

```bash
git diff main -- . ':!docs' ':!lib/api-zod' ':!lib/api-client-react' | grep -n '\\u00\|\\u20' || echo "sem escapes"
git diff main -- artifacts/signage/public/tv.html | grep -nE '^\+.*\b(let|const)\b|=>|`' || echo "tv.html segue ES5"
```

Expected: `sem escapes` e `tv.html segue ES5`.
