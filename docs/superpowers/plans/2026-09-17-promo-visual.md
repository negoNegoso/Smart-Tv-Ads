# Visual novo do slide de promoção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slide de promoção com painel colorido em diagonal, foto à direita, selo pontilhado, enfeites e preço em destaque; lojista escolhe a cor e o estilo (preço DE/POR ou porcentagem).

**Architecture:** Duas colunas novas em `panels` (`accent_color`, `promo_style`) atravessam OpenAPI → rota → `publish.ts` → template satori. Fundo diagonal, enfeites e selo pontilhado são SVG gerados por funções puras e embutidos como `data:` URI; cores derivadas da cor escolhida por contraste WCAG. A prévia do portal reimplementa o mesmo layout com unidades `cqw` (1920px = 100cqw) usando uma cópia das funções puras.

**Tech Stack:** pnpm monorepo, Drizzle (Postgres), OpenAPI + orval, Express + zod v4, satori + resvg-wasm, React + Tailwind + react-query, vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-promo-visual-design.md`

## Global Constraints

- Branch `feat/promo-visual` (já criada). Nunca commitar em `main`. Não adicionar `lib/db/diag*.mjs` (arquivos soltos do usuário).
- Cor padrão: `#D63A6A`. Texto escuro: `#1F1B2E`. Texto claro: `#FFFFFF`.
- Hex aceito: `^#[0-9A-Fa-f]{6}$`.
- Estilos: `"price" | "percent"`; `null` → `"price"`.
- `percent = Math.round((old - price) / old * 100)`; só vale com `old > price > 0` e resultado ≥ 1, senão cai para `price` sem lançar.
- Quadro 1920×1080; diagonal de `x=1120` (topo) a `x=960` (base); foto a partir de `x=860`.
- Fonte Fredoka (woff estático do `@fontsource/fredoka`, latin, 400 e 700) só no slide de promoção; menu e aviso seguem Inter e **não mudam**.
- Escapes `\uXXXX` não devem ser escritos por Write/Edit (corrompem o arquivo): escrever os caracteres literais (`ç`, `ã`, `—`).
- Comentários e mensagens em português, no tom dos arquivos vizinhos.
- Commits terminam com `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/panels.ts` (mod) | colunas `accentColor`, `promoStyle`; `PROMO_STYLES` |
| `lib/db/drizzle/0009_*.sql` (novo, gerado) | migração |
| `lib/api-spec/openapi.yaml` (mod) | campos em `Panel` e `UpdatePanelRequest` |
| `lib/api-zod/**`, `lib/api-client-react/**` (gerados) | codegen |
| `artifacts/api-server/src/routes/panels.ts` (mod) | `patchBody` aceita os campos |
| `artifacts/api-server/src/lib/panels/queries.ts` (mod) | tipo do patch |
| `artifacts/api-server/src/lib/panels/promo-palette.ts` (novo) | cor normalizada, paleta, % e estilo efetivo |
| `artifacts/api-server/src/lib/panels/promo-background.ts` (novo) | SVG do fundo, SVG e medidas do selo |
| `artifacts/api-server/assets/fonts/Fredoka-*.woff`, `OFL-Fredoka.txt` (novos) | fonte |
| `artifacts/api-server/src/lib/panels/assets.ts` (mod) | carrega Fredoka |
| `artifacts/api-server/build.mjs` (mod) | loader `.woff` |
| `artifacts/api-server/src/lib/panels/templates.ts` (mod) | `RenderPanel` + `promoNode` novo |
| `artifacts/api-server/src/lib/panels/publish.ts` (mod) | repassa cor e estilo |
| `artifacts/signage/src/lib/promo-visual.ts` (novo) | cópia das funções puras para a prévia |
| `artifacts/signage/src/components/portal/panel-preview.tsx` (mod) | `PromoPreview` novo |
| `artifacts/signage/index.html` (mod) | Google Fonts carrega Fredoka |
| `artifacts/signage/src/pages/portal-panel-editor.tsx` (mod) | cor + estilo + aviso |

---

### Task 1: Colunas no banco e campos na API

**Files:**
- Modify: `lib/db/src/schema/panels.ts`
- Create (gerado): `lib/db/drizzle/0009_*.sql`, `lib/db/drizzle/meta/0009_snapshot.json`, `lib/db/drizzle/meta/_journal.json`
- Modify: `lib/api-spec/openapi.yaml:1547-1583`
- Regenerate: `lib/api-zod`, cliente react (saída do `orval.config.ts`)
- Modify: `artifacts/api-server/src/routes/panels.ts:36-42`
- Modify: `artifacts/api-server/src/lib/panels/queries.ts:67-70`
- Modify: `artifacts/api-server/src/lib/panels/__tests__/publish-plan.test.ts` (objeto `base`)
- Test: `artifacts/api-server/src/routes/__tests__/panels-scope.test.ts`

**Interfaces:**
- Produces: `Panel.accentColor: string | null`, `Panel.promoStyle: string | null` (Drizzle); `PROMO_STYLES = ["price", "percent"] as const`, `type PromoStyle` exportados de `@workspace/db`; API `Panel.accentColor`/`promoStyle` e `UpdatePanelRequest.accentColor`/`promoStyle` no cliente gerado.

- [ ] **Step 1: Write the failing route tests**

Adicionar ao fim do `describe("escopo das rotas de painéis", ...)` em `artifacts/api-server/src/routes/__tests__/panels-scope.test.ts`:

```ts
  it("PATCH grava cor e estilo da promoção", async () => {
    panelClientId.mockResolvedValue(7);
    updatePanel.mockResolvedValue({ id: 5 });
    getPanel.mockResolvedValue({ id: 5, items: [] });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ accentColor: "#d63a6a", promoStyle: "percent" });
    expect(res.status).toBe(200);
    expect(updatePanel).toHaveBeenCalledWith(5, { accentColor: "#D63A6A", promoStyle: "percent" });
  });

  it("PATCH aceita null para voltar cor e estilo ao padrão", async () => {
    panelClientId.mockResolvedValue(7);
    updatePanel.mockResolvedValue({ id: 5 });
    getPanel.mockResolvedValue({ id: 5, items: [] });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ accentColor: null, promoStyle: null });
    expect(res.status).toBe(200);
    expect(updatePanel).toHaveBeenCalledWith(5, { accentColor: null, promoStyle: null });
  });

  it.each(["#abc", "red", "#GGGGGG", "D63A6A"])("PATCH recusa cor %s com 400", async (accentColor) => {
    panelClientId.mockResolvedValue(7);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ accentColor });
    expect(res.status).toBe(400);
    expect(updatePanel).not.toHaveBeenCalled();
  });

  it("PATCH recusa estilo fora do enum com 400", async () => {
    panelClientId.mockResolvedValue(7);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ promoStyle: "bogo" });
    expect(res.status).toBe(400);
    expect(updatePanel).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd artifacts/api-server && pnpm vitest run src/routes/__tests__/panels-scope.test.ts`
Expected: FAIL — o primeiro teste recebe `updatePanel` chamado com `{}` (zod descarta chaves desconhecidas) e os de 400 recebem 200.

- [ ] **Step 3: Schema**

Em `lib/db/src/schema/panels.ts`, depois de `PanelStatus`:

```ts
/** Como a promoção mostra o desconto: DE/POR ou porcentagem. */
export const PROMO_STYLES = ["price", "percent"] as const;
export type PromoStyle = (typeof PROMO_STYLES)[number];
```

E dentro de `pgTable`, logo depois de `body: text("body"),`:

```ts
    // Cor do painel da promoção, "#RRGGBB". Nulo usa a cor padrão do template.
    accentColor: text("accent_color"),
    // "price" | "percent". Nulo vale "price". Só o template de promoção lê.
    promoStyle: text("promo_style"),
```

Conferir que `lib/db/src/schema/index.ts` já reexporta tudo de `./panels` (`export * from "./panels"`); se exportar nomes explícitos, adicionar `PROMO_STYLES` e `PromoStyle`.

- [ ] **Step 4: Gerar migração**

Run: `cd lib/db && DATABASE_URL=postgres://gerar:gerar@localhost:5432/gerar pnpm generate`
(`generate` não conecta; a URL só satisfaz o `drizzle.config.ts`.)
Expected: cria `drizzle/0009_<nome>.sql` com exatamente:

```sql
ALTER TABLE "panels" ADD COLUMN "accent_color" text;--> statement-breakpoint
ALTER TABLE "panels" ADD COLUMN "promo_style" text;
```

Se o SQL gerado tiver qualquer outra instrução, parar e investigar (schema local divergente) em vez de commitar.

- [ ] **Step 5: OpenAPI**

Em `lib/api-spec/openapi.yaml`, no schema `Panel`, depois de `body: { type: string, nullable: true }`:

```yaml
        accentColor: { type: string, pattern: "^#[0-9A-Fa-f]{6}$", nullable: true }
        promoStyle: { type: string, enum: [price, percent], nullable: true }
```

No schema `UpdatePanelRequest`, depois de `body: { type: string, maxLength: 300, nullable: true }`, as mesmas duas linhas.

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: termina sem erro; `git status` mostra arquivos alterados em `lib/api-zod/src/generated/` e no cliente react gerado, contendo `accentColor`.

- [ ] **Step 6: Rota e queries**

Em `artifacts/api-server/src/routes/panels.ts`, trocar o import do topo para trazer `PROMO_STYLES`:

```ts
import { PROMO_STYLES } from "@workspace/db";
```

e `patchBody` por:

```ts
const patchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  template: z.string().trim().min(1).max(40).optional(),
  duration: z.number().int().min(5).max(60).optional(),
  headline: z.string().trim().max(80).nullable().optional(),
  body: z.string().trim().max(300).nullable().optional(),
  // Maiúsculas no banco: a mesma cor digitada de dois jeitos não vira dois valores.
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .transform((c) => c.toUpperCase())
    .nullable()
    .optional(),
  promoStyle: z.enum(PROMO_STYLES).nullable().optional(),
});
```

Em `artifacts/api-server/src/lib/panels/queries.ts`, a assinatura de `updatePanel`:

```ts
  patch: Partial<
    Pick<Panel, "name" | "template" | "duration" | "headline" | "body" | "accentColor" | "promoStyle">
  >,
```

Se `routes/panels.ts` importar de `@workspace/db` pela primeira vez e o mock de `panels-scope.test.ts` quebrar o import por falta de `DATABASE_URL`, trocar o import por uma constante local `const PROMO_STYLES = ["price", "percent"] as const;` com comentário `// Espelha PROMO_STYLES de @workspace/db; importar de lá puxa a conexão no teste.`

- [ ] **Step 7: Ajustar fixture tipada**

Em `artifacts/api-server/src/lib/panels/__tests__/publish-plan.test.ts`, no objeto `base`, ao lado de `headline: null,`:

```ts
  accentColor: null,
  promoStyle: null,
```

- [ ] **Step 8: Run tests and typecheck**

Run: `cd artifacts/api-server && pnpm vitest run src/routes/__tests__/panels-scope.test.ts && pnpm typecheck`
Expected: PASS; typecheck sem erros.

- [ ] **Step 9: Commit**

```bash
git add lib/db/src/schema/panels.ts lib/db/drizzle lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/panels.ts artifacts/api-server/src/lib/panels/queries.ts artifacts/api-server/src/lib/panels/__tests__/publish-plan.test.ts artifacts/api-server/src/routes/__tests__/panels-scope.test.ts
git commit -m "feat(panels): cor e estilo da promoção no banco e na API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(Se o cliente react gerado não morar em `lib/api-client-react`, usar o caminho que o `git status` do Step 5 mostrou.)

---

### Task 2: Paleta, porcentagem e estilo efetivo (servidor)

**Files:**
- Create: `artifacts/api-server/src/lib/panels/promo-palette.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/promo-palette.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_ACCENT_COLOR = "#D63A6A"`
  - `type PromoStyle = "price" | "percent"`
  - `interface PromoPalette { panel: string; text: string; price: string }`
  - `normalizeAccentColor(color: string | null | undefined): string`
  - `promoPalette(color: string | null | undefined): PromoPalette`
  - `discountPercent(oldPriceCents: number, priceCents: number): number`
  - `resolvePromoStyle(style: string | null | undefined, item: { priceCents: number; oldPriceCents: number | null } | undefined): PromoStyle`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCENT_COLOR,
  discountPercent,
  normalizeAccentColor,
  promoPalette,
  resolvePromoStyle,
} from "../promo-palette";

describe("normalizeAccentColor", () => {
  it("cor válida sai em maiúsculas", () => {
    expect(normalizeAccentColor("#d63a6a")).toBe("#D63A6A");
  });

  it.each([null, undefined, "", "red", "#abc", "#12345G"])("%s vira a cor padrão", (color) => {
    expect(normalizeAccentColor(color)).toBe(DEFAULT_ACCENT_COLOR);
  });
});

describe("promoPalette", () => {
  it("rosa padrão: texto branco e preço num tom escuro da própria cor", () => {
    expect(promoPalette(null)).toEqual({ panel: "#D63A6A", text: "#FFFFFF", price: "#3A2037" });
  });

  it("cor clara: texto escuro", () => {
    expect(promoPalette("#FFE600").text).toBe("#1F1B2E");
  });

  it("cor muito escura: preço usa o texto, o tom escurecido sumiria", () => {
    expect(promoPalette("#1A1A1A")).toEqual({ panel: "#1A1A1A", text: "#FFFFFF", price: "#FFFFFF" });
  });

  it("azul médio: tom escurecido não chega a 3:1, preço usa o texto", () => {
    expect(promoPalette("#2563EB").price).toBe("#FFFFFF");
  });
});

describe("discountPercent", () => {
  it("14,99 por 8,99 é 40%", () => {
    expect(discountPercent(1499, 899)).toBe(40);
  });

  it("arredonda para o inteiro mais próximo", () => {
    expect(discountPercent(3000, 2000)).toBe(33);
  });
});

describe("resolvePromoStyle", () => {
  const item = (priceCents: number, oldPriceCents: number | null) => ({ priceCents, oldPriceCents });

  it("nulo vale price", () => {
    expect(resolvePromoStyle(null, item(899, 1499))).toBe("price");
  });

  it("percent com desconto de verdade fica percent", () => {
    expect(resolvePromoStyle("percent", item(899, 1499))).toBe("percent");
  });

  it.each([
    ["sem preço antigo", item(899, null)],
    ["preço antigo igual", item(899, 899)],
    ["preço antigo menor", item(899, 500)],
    ["preço zero", item(0, 1499)],
    ["desconto que arredonda para 0%", item(99_600, 100_000)],
    ["sem item", undefined],
  ])("percent %s cai para price", (_caso, it_) => {
    expect(resolvePromoStyle("percent", it_)).toBe("price");
  });

  it("valor desconhecido vale price", () => {
    expect(resolvePromoStyle("bogo", item(899, 1499))).toBe("price");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/promo-palette.test.ts`
Expected: FAIL — `Failed to resolve import "../promo-palette"`.

- [ ] **Step 3: Implement**

```ts
/**
 * Cores e regra de desconto do slide de promoção. Funções puras: o portal
 * (`artifacts/signage/src/lib/promo-visual.ts`) tem uma cópia para a prévia,
 * então qualquer mudança aqui precisa ser espelhada lá.
 */

export const DEFAULT_ACCENT_COLOR = "#D63A6A";
const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#1F1B2E";
/** Quanto do tom escuro entra na cor para desenhar o preço (roxo da referência). */
const PRICE_DARKEN = 0.85;
/** WCAG para texto grande: o preço tem 170px, 3:1 basta. */
const PRICE_MIN_CONTRAST = 3;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export type PromoStyle = "price" | "percent";

export interface PromoPalette {
  panel: string;
  text: string;
  price: string;
}

/** Cor válida em maiúsculas; qualquer outra coisa vira a cor padrão. */
export function normalizeAccentColor(color: string | null | undefined): string {
  return color && HEX_COLOR.test(color) ? color.toUpperCase() : DEFAULT_ACCENT_COLOR;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

function mix(from: string, to: string, amount: number): string {
  const target = channels(to);
  const hex = channels(from)
    .map((c, i) => Math.round(c * (1 - amount) + target[i]! * amount).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`.toUpperCase();
}

export function promoPalette(color: string | null | undefined): PromoPalette {
  const panel = normalizeAccentColor(color);
  const text = contrastRatio(panel, LIGHT_TEXT) >= contrastRatio(panel, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  const darkened = mix(panel, DARK_TEXT, PRICE_DARKEN);
  const price = contrastRatio(darkened, panel) >= PRICE_MIN_CONTRAST ? darkened : text;
  return { panel, text, price };
}

export function discountPercent(oldPriceCents: number, priceCents: number): number {
  return Math.round(((oldPriceCents - priceCents) / oldPriceCents) * 100);
}

/**
 * Estilo que o slide realmente usa. Porcentagem sem desconto de verdade
 * (sem preço antigo, antigo não maior, 0%) cai para DE/POR em vez de lançar:
 * a publicação segue, como na foto que falha em `promo-image.ts`.
 */
export function resolvePromoStyle(
  style: string | null | undefined,
  item: { priceCents: number; oldPriceCents: number | null } | undefined,
): PromoStyle {
  if (style !== "percent" || !item) return "price";
  const { priceCents, oldPriceCents } = item;
  if (oldPriceCents === null || priceCents <= 0 || oldPriceCents <= priceCents) return "price";
  return discountPercent(oldPriceCents, priceCents) >= 1 ? "percent" : "price";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/promo-palette.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/panels/promo-palette.ts artifacts/api-server/src/lib/panels/__tests__/promo-palette.test.ts
git commit -m "feat(panels): paleta e regra de desconto da promoção

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: SVG do fundo e do selo (servidor)

**Files:**
- Create: `artifacts/api-server/src/lib/panels/promo-background.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/promo-background.test.ts`

**Interfaces:**
- Produces:
  - `PROMO_SPLIT_TOP = 1120`, `PROMO_SPLIT_BOTTOM = 960`, `PROMO_PHOTO_LEFT = 860`
  - `promoBackgroundSvg(opts: { color: string; ornament: string; hasImage: boolean }): string`
  - `promoBadgeMetrics(text: string): { fontSize: number; width: number; height: number }`
  - `promoBadgeSvg(opts: { width: number; height: number; stroke: string }): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { promoBackgroundSvg, promoBadgeMetrics, promoBadgeSvg } from "../promo-background";

describe("promoBackgroundSvg", () => {
  it("com foto desenha a diagonal na cor escolhida", () => {
    const svg = promoBackgroundSvg({ color: "#D63A6A", ornament: "#FFFFFF", hasImage: true });
    expect(svg).toContain('<polygon points="0,0 1120,0 960,1080 0,1080" fill="#D63A6A"/>');
    expect(svg).not.toContain("<rect");
  });

  it("sem foto preenche o quadro inteiro", () => {
    const svg = promoBackgroundSvg({ color: "#D63A6A", ornament: "#FFFFFF", hasImage: false });
    expect(svg).toContain('<rect width="1920" height="1080" fill="#D63A6A"/>');
    expect(svg).not.toContain("<polygon");
  });

  it("enfeites usam a cor de enfeite", () => {
    const svg = promoBackgroundSvg({ color: "#FFE600", ornament: "#1F1B2E", hasImage: true });
    expect(svg).toContain('stroke="#1F1B2E"');
    expect(svg).toContain('fill="#1F1B2E"');
  });
});

describe("promoBadgeMetrics", () => {
  it("PROMOÇÃO cabe em fonte grande", () => {
    expect(promoBadgeMetrics("PROMOÇÃO")).toEqual({ fontSize: 96, width: 573, height: 182 });
  });

  it("texto médio reduz a fonte", () => {
    expect(promoBadgeMetrics("OFERTA DA SEMANA").fontSize).toBe(64);
  });

  it("texto longo nunca passa de 800px", () => {
    const m = promoBadgeMetrics("X".repeat(40));
    expect(m.fontSize).toBe(44);
    expect(m.width).toBe(800);
  });
});

describe("promoBadgeSvg", () => {
  it("cápsula pontilhada do tamanho pedido", () => {
    const svg = promoBadgeSvg({ width: 573, height: 182, stroke: "#FFFFFF" });
    expect(svg).toContain('width="573" height="182"');
    expect(svg).toContain('stroke="#FFFFFF"');
    expect(svg).toContain('stroke-dasharray="0 22"');
    expect(svg).toContain('rx="85"');
  });
});
```

(`573 = round(8 × 0,6 × 96) + 112 = 461 + 112`; `182 = round(96 × 1,9)`; `rx = (182 − 12) / 2 = 85`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/promo-background.test.ts`
Expected: FAIL — `Failed to resolve import "../promo-background"`.

- [ ] **Step 3: Implement**

```ts
/**
 * Desenho do slide de promoção que o satori não sabe fazer sozinho: corte
 * diagonal, enfeites geométricos e borda pontilhada. Tudo sai como string SVG
 * e entra no template como `data:` URI; o resvg desenha SVG nativo com
 * fidelidade. O portal (`artifacts/signage/src/lib/promo-visual.ts`) tem uma
 * cópia para a prévia — mudança aqui precisa ser espelhada lá.
 */

const WIDTH = 1920;
const HEIGHT = 1080;

/** x da diagonal no topo e na base do quadro. */
export const PROMO_SPLIT_TOP = 1120;
export const PROMO_SPLIT_BOTTOM = 960;
/** Onde a foto começa: um pouco antes da diagonal, para ela passar por trás. */
export const PROMO_PHOTO_LEFT = 860;

const BADGE_MAX_WIDTH = 800;
const BADGE_HORIZONTAL_PADDING = 112;
/** Largura média de um caractere maiúsculo da Fredoka Bold, em frações da fonte. */
const BADGE_CHAR_WIDTH = 0.6;
const BADGE_HEIGHT_RATIO = 1.9;
const BADGE_INSET = 6;

export function promoBackgroundSvg(opts: { color: string; ornament: string; hasImage: boolean }): string {
  const { color, ornament, hasImage } = opts;
  const shape = hasImage
    ? `<polygon points="0,0 ${PROMO_SPLIT_TOP},0 ${PROMO_SPLIT_BOTTOM},${HEIGHT} 0,${HEIGHT}" fill="${color}"/>`
    : `<rect width="${WIDTH}" height="${HEIGHT}" fill="${color}"/>`;
  // Enfeites no alto do painel, acima de y=290 — o conteúdo começa em 310.
  const strokes =
    `<g fill="none" stroke="${ornament}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">` +
    `<path d="M80 230 q30 -34 60 0 t60 0 t60 0 t60 0" stroke-width="14"/>` +
    `<path d="M360 150 h90" stroke-width="12"/>` +
    `<circle cx="430" cy="245" r="34" stroke-width="8"/>` +
    `<path d="M490 245 h30 M505 230 v30" stroke-width="5"/>` +
    `<path d="M880 50 l20 20 l-20 20 l20 20 l-20 20" stroke-width="7"/>` +
    `<path d="M930 110 h30 M945 95 v30" stroke-width="5"/>` +
    `</g>`;
  const dots =
    `<g fill="${ornament}" opacity="0.85">` +
    `<circle cx="530" cy="165" r="26"/>` +
    `<circle cx="890" cy="160" r="9"/>` +
    `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${shape}${strokes}${dots}</svg>`;
}

/**
 * Tamanho do selo. O satori não mede texto antes de desenhar, então a largura
 * é estimada pela contagem de caracteres; o teto evita invadir a foto.
 */
export function promoBadgeMetrics(text: string): { fontSize: number; width: number; height: number } {
  const length = text.length;
  const fontSize = length <= 10 ? 96 : length <= 16 ? 64 : 44;
  const width = Math.min(
    BADGE_MAX_WIDTH,
    Math.round(length * BADGE_CHAR_WIDTH * fontSize) + BADGE_HORIZONTAL_PADDING,
  );
  return { fontSize, width, height: Math.round(fontSize * BADGE_HEIGHT_RATIO) };
}

/** Cápsula de pontos: traço de comprimento 0 com ponta redonda vira ponto. */
export function promoBadgeSvg(opts: { width: number; height: number; stroke: string }): string {
  const { width, height, stroke } = opts;
  const innerWidth = width - BADGE_INSET * 2;
  const innerHeight = height - BADGE_INSET * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="${BADGE_INSET}" y="${BADGE_INSET}" width="${innerWidth}" height="${innerHeight}" rx="${innerHeight / 2}" ` +
    `fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 22"/>` +
    `</svg>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/promo-background.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/panels/promo-background.ts artifacts/api-server/src/lib/panels/__tests__/promo-background.test.ts
git commit -m "feat(panels): SVG de fundo e selo da promoção

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Fonte Fredoka no renderizador

**Files:**
- Create: `artifacts/api-server/assets/fonts/Fredoka-Regular.woff`, `Fredoka-Bold.woff`, `OFL-Fredoka.txt`
- Modify: `artifacts/api-server/src/lib/panels/assets.ts:58-76`
- Modify: `artifacts/api-server/build.mjs:178`
- Test: `artifacts/api-server/src/lib/panels/__tests__/assets.test.ts` (criar se não existir; se existir, adicionar o `it`)

**Interfaces:**
- Produces: `panelFonts()` devolve também `{ name: "Fredoka", weight: 400 }` e `{ name: "Fredoka", weight: 700 }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { panelFonts } from "../assets";

describe("panelFonts", () => {
  it("carrega Inter e Fredoka nos pesos 400 e 700", async () => {
    const fonts = await panelFonts();
    expect(fonts.map((f) => `${f.name}-${f.weight}`).sort()).toEqual([
      "Fredoka-400",
      "Fredoka-700",
      "Inter-400",
      "Inter-700",
    ]);
    for (const font of fonts) expect(font.data.byteLength).toBeGreaterThan(10_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/assets.test.ts`
Expected: FAIL — lista só com `Inter-400`, `Inter-700`.

- [ ] **Step 3: Baixar a fonte**

```bash
cd artifacts/api-server/assets/fonts
curl -fsSL -o Fredoka-Regular.woff https://cdn.jsdelivr.net/npm/@fontsource/fredoka@5/files/fredoka-latin-400-normal.woff
curl -fsSL -o Fredoka-Bold.woff https://cdn.jsdelivr.net/npm/@fontsource/fredoka@5/files/fredoka-latin-700-normal.woff
curl -fsSL -o OFL-Fredoka.txt https://cdn.jsdelivr.net/npm/@fontsource/fredoka@5/LICENSE
head -c 4 Fredoka-Bold.woff | xxd
```

Expected: `xxd` mostra `774f 4646` (`wOFF`). Se mostrar `774f 4632` (`wOF2`), o arquivo é woff2, que o satori não lê — parar.

- [ ] **Step 4: Carregar em `assets.ts`**

Substituir o corpo de `panelFonts` por:

```ts
  const [interRegular, interBold, fredokaRegular, fredokaBold] = await Promise.all([
    bytes(() => import("../../../assets/fonts/Inter-Regular.ttf") as never, "fonts/Inter-Regular.ttf"),
    bytes(() => import("../../../assets/fonts/Inter-Bold.ttf") as never, "fonts/Inter-Bold.ttf"),
    // Fredoka só no slide de promoção. woff estático: o Google Fonts publica a
    // Fredoka só como fonte variável, e o satori não instancia peso de variável.
    bytes(() => import("../../../assets/fonts/Fredoka-Regular.woff") as never, "fonts/Fredoka-Regular.woff"),
    bytes(() => import("../../../assets/fonts/Fredoka-Bold.woff") as never, "fonts/Fredoka-Bold.woff"),
  ]);
  const toArrayBuffer = (b: Buffer): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return [
    { name: "Inter", data: toArrayBuffer(interRegular), weight: 400, style: "normal" },
    { name: "Inter", data: toArrayBuffer(interBold), weight: 700, style: "normal" },
    { name: "Fredoka", data: toArrayBuffer(fredokaRegular), weight: 400, style: "normal" },
    { name: "Fredoka", data: toArrayBuffer(fredokaBold), weight: 700, style: "normal" },
  ];
```

- [ ] **Step 5: Loader no build**

Em `artifacts/api-server/build.mjs`, trocar:

```js
    loader: { ".ttf": "binary", ".wasm": "binary" },
```

por:

```js
    loader: { ".ttf": "binary", ".woff": "binary", ".wasm": "binary" },
```

Se o `tsconfig`/declarações de módulo do api-server tiverem `declare module "*.ttf"`, adicionar `declare module "*.woff"` igual (procurar com `grep -rn '\*.ttf' artifacts/api-server/src`).

- [ ] **Step 6: Run test, typecheck e build**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/assets.test.ts && pnpm typecheck && pnpm build`
Expected: PASS; typecheck ok; build termina e `ls dist/assets/fonts` lista os dois `.woff`.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/assets/fonts artifacts/api-server/src/lib/panels/assets.ts artifacts/api-server/build.mjs artifacts/api-server/src/lib/panels/__tests__/assets.test.ts
git commit -m "feat(panels): fonte Fredoka para o slide de promoção

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(Incluir o arquivo de declaração `*.woff` no `git add` se o Step 5 criou um.)

---

### Task 5: Template novo da promoção

**Files:**
- Modify: `artifacts/api-server/src/lib/panels/templates.ts` (`RenderPanel`, `promoNode`, imports)
- Modify: `artifacts/api-server/src/lib/panels/publish.ts:84-87`
- Test: `artifacts/api-server/src/lib/panels/__tests__/render.test.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/promo-template.test.ts` (novo)

**Interfaces:**
- Consumes: Task 2 (`promoPalette`, `resolvePromoStyle`, `discountPercent`), Task 3 (`promoBackgroundSvg`, `promoBadgeMetrics`, `promoBadgeSvg`, `PROMO_SPLIT_BOTTOM`, `PROMO_PHOTO_LEFT`), Task 4 (família `"Fredoka"`), Task 1 (`Panel.accentColor`, `Panel.promoStyle`).
- Produces: `RenderPanel { kind; headline; body; accentColor?: string | null; promoStyle?: string | null }`.

- [ ] **Step 1: Write the failing template test**

O teste percorre a árvore satori (objetos `{ type, props }`) e junta os textos — não depende de rasterizar.

```ts
import { describe, expect, it } from "vitest";
import { panelPageNode, type RenderItem } from "../templates";

interface SatoriNode {
  type: string;
  props: { children?: unknown; src?: string; style?: Record<string, unknown> };
}

function texts(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object" && "props" in node) return texts((node as SatoriNode).props.children);
  return [];
}

function images(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(images);
  if (node && typeof node === "object" && "props" in node) {
    const n = node as SatoriNode;
    return [...(n.type === "img" && n.props.src ? [n.props.src] : []), ...images(n.props.children)];
  }
  return [];
}

function decodedSvgs(node: unknown): string[] {
  return images(node)
    .filter((src) => src.startsWith("data:image/svg+xml;base64,"))
    .map((src) => Buffer.from(src.split(",")[1]!, "base64").toString("utf8"));
}

const cheesecake: RenderItem = {
  name: "Cheesecake de morango",
  description: null,
  priceCents: 899,
  oldPriceCents: 1499,
  imageUrl: "data:image/png;base64,AAAA",
};

const page = (item: RenderItem) => ({ category: null, items: [item] });

describe("promoNode", () => {
  it("estilo price mostra DE/POR, preço grande e aviso de imagem ilustrativa", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: "Só hoje", accentColor: null, promoStyle: null },
      page(cheesecake),
    );
    const t = texts(tree);
    expect(t).toEqual(
      expect.arrayContaining(["PROMOÇÃO", "CHEESECAKE DE MORANGO", "DE", "14,99", "POR", "R$", "8,99", "Só hoje", "*imagens meramente ilustrativas"]),
    );
    expect(t.some((s) => s.includes("%"))).toBe(false);
  });

  it("estilo percent mostra a porcentagem e o DE/POR em uma linha", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: "percent" },
      page(cheesecake),
    );
    expect(texts(tree)).toEqual(expect.arrayContaining(["40%", "OFF", "DE R$ 14,99 POR R$ 8,99"]));
  });

  it("percent sem preço antigo cai para price", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: "percent" },
      page({ ...cheesecake, oldPriceCents: null }),
    );
    const t = texts(tree);
    expect(t).toContain("8,99");
    expect(t.some((s) => s.includes("%"))).toBe(false);
    expect(t).not.toContain("DE");
  });

  it("usa a cor escolhida no fundo e desenha a diagonal com foto", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: "Oferta", body: null, accentColor: "#2563eb", promoStyle: null },
      page(cheesecake),
    );
    const svgs = decodedSvgs(tree);
    expect(svgs.some((s) => s.includes('<polygon') && s.includes('fill="#2563EB"'))).toBe(true);
    expect(images(tree)).toContain(cheesecake.imageUrl);
  });

  it("sem foto: retângulo cheio e sem aviso de imagem ilustrativa", () => {
    const tree = panelPageNode(
      { kind: "promo", headline: null, body: null, accentColor: null, promoStyle: null },
      page({ ...cheesecake, imageUrl: null }),
    );
    expect(decodedSvgs(tree).some((s) => s.includes('<rect width="1920" height="1080"'))).toBe(true);
    expect(texts(tree)).not.toContain("*imagens meramente ilustrativas");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/promo-template.test.ts`
Expected: FAIL — `"PROMOÇÃO"`/`"DE"` ausentes (template antigo mostra nome em caixa normal e preço inteiro `R$ 8,99`); TS pode reclamar de `accentColor` em `RenderPanel` (vitest não bloqueia por tipo).

- [ ] **Step 3: `RenderPanel`**

Em `templates.ts`:

```ts
export interface RenderPanel {
  kind: "menu" | "promo" | "notice";
  headline: string | null;
  body: string | null;
  /** Só a promoção lê. Ausente ou inválida usa a cor padrão. */
  accentColor?: string | null;
  /** "price" | "percent". Só a promoção lê. */
  promoStyle?: string | null;
}
```

Imports no topo:

```ts
import { discountPercent, promoPalette, resolvePromoStyle } from "./promo-palette";
import {
  PROMO_PHOTO_LEFT,
  PROMO_SPLIT_BOTTOM,
  promoBackgroundSvg,
  promoBadgeMetrics,
  promoBadgeSvg,
} from "./promo-background";
```

- [ ] **Step 4: Reescrever `promoNode`**

Substituir a função `promoNode` inteira por:

```ts
const PROMO_CONTENT_LEFT = 80;
/** Abaixo dos enfeites, que vão até y≈290 (`promo-background.ts`). */
const PROMO_CONTENT_TOP = 310;
/** Com foto, o conteúdo vai até a diagonal na base, com a mesma margem dos dois lados. */
const PROMO_CONTENT_WIDTH_WITH_PHOTO = PROMO_SPLIT_BOTTOM - 2 * PROMO_CONTENT_LEFT;
const PROMO_CONTENT_WIDTH_FULL = 1400;
/** Aparece só se a foto não cobrir a área dela. */
const PROMO_PHOTO_BACKDROP = "#F1F1F3";
const PROMO_DISCLAIMER_COLOR = "#3A2A4A";
/** 52px de Fredoka Bold em maiúsculas: ~28 caracteres cabem em 800px. */
const MAX_PROMO_NAME = 28;

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** "R$ 8,99" → ["R$", "8,99"]. `formatPriceBRL` sempre separa com espaço comum. */
function splitCurrency(formatted: string): [string, string] {
  const space = formatted.indexOf(" ");
  return [formatted.slice(0, space), formatted.slice(space + 1)];
}

function promoNode(panel: RenderPanel, item: RenderItem | undefined) {
  const palette = promoPalette(panel.accentColor);
  const style = resolvePromoStyle(panel.promoStyle, item);
  const photo = item?.imageUrl ?? null;
  const contentWidth = photo ? PROMO_CONTENT_WIDTH_WITH_PHOTO : PROMO_CONTENT_WIDTH_FULL;
  const bold = { fontWeight: 700 };

  const badgeText = truncate(panel.headline ?? "PROMOÇÃO", MAX_HEADLINE).toUpperCase();
  const badge = promoBadgeMetrics(badgeText);
  const badgeNode = node("div", {
    style: {
      display: "flex",
      position: "relative",
      width: badge.width,
      height: badge.height,
      alignItems: "center",
      justifyContent: "center",
    },
    children: [
      node("img", {
        src: svgDataUri(promoBadgeSvg({ width: badge.width, height: badge.height, stroke: palette.text })),
        width: badge.width,
        height: badge.height,
        style: { position: "absolute", left: 0, top: 0 },
      }),
      node("div", { style: { ...bold, fontSize: badge.fontSize }, children: badgeText }),
    ],
  });

  const nameNode = node("div", {
    style: { ...bold, fontSize: 52, marginTop: 24 },
    children: truncate((item?.name ?? "").toUpperCase(), MAX_PROMO_NAME),
  });

  const priceCents = item?.priceCents ?? 0;
  const oldPriceCents = item?.oldPriceCents ?? null;
  const [currency, amount] = splitCurrency(formatPriceBRL(priceCents));

  const priceNodes =
    style === "percent" && oldPriceCents !== null
      ? [
          node("div", {
            style: { display: "flex", alignItems: "baseline", color: palette.price, marginTop: 8 },
            children: [
              node("div", {
                style: { ...bold, fontSize: 200, lineHeight: 1 },
                children: `${discountPercent(oldPriceCents, priceCents)}%`,
              }),
              node("div", { style: { ...bold, fontSize: 72, marginLeft: 16 }, children: "OFF" }),
            ],
          }),
          node("div", {
            style: { ...bold, fontSize: 40 },
            children: `DE ${formatPriceBRL(oldPriceCents)} POR ${formatPriceBRL(priceCents)}`,
          }),
        ]
      : [
          oldPriceCents !== null
            ? node("div", {
                style: { display: "flex", alignItems: "baseline", marginTop: 24 },
                children: [
                  node("div", { style: { ...bold, fontSize: 36 }, children: "DE" }),
                  node("div", {
                    style: { ...bold, fontSize: 52, margin: "0 16px" },
                    children: splitCurrency(formatPriceBRL(oldPriceCents))[1],
                  }),
                  node("div", { style: { ...bold, fontSize: 36 }, children: "POR" }),
                ],
              })
            : null,
          node("div", {
            style: { display: "flex", alignItems: "baseline", color: palette.price },
            children: [
              node("div", { style: { ...bold, fontSize: 52, marginRight: 12 }, children: currency }),
              // "1.299,99" em 170px invadiria a foto.
              node("div", {
                style: { ...bold, fontSize: amount.length > 6 ? 130 : 170, lineHeight: 1 },
                children: amount,
              }),
            ],
          }),
        ].filter(Boolean);

  const bodyNode = panel.body
    ? node("div", {
        style: { ...bold, display: "block", fontSize: 38, lineHeight: 1.2, lineClamp: 2, marginTop: 16, color: palette.price },
        children: truncate(panel.body, MAX_BODY),
      })
    : null;

  return node("div", {
    style: {
      display: "flex",
      position: "relative",
      width: "100%",
      height: "100%",
      backgroundColor: PROMO_PHOTO_BACKDROP,
      color: palette.text,
      fontFamily: "Fredoka",
      overflow: "hidden",
    },
    children: [
      photo
        ? node("img", {
            src: photo,
            width: FRAME_WIDTH - PROMO_PHOTO_LEFT,
            height: FRAME_HEIGHT,
            style: { position: "absolute", left: PROMO_PHOTO_LEFT, top: 0, objectFit: "cover" },
          })
        : null,
      node("img", {
        src: svgDataUri(promoBackgroundSvg({ color: palette.panel, ornament: palette.text, hasImage: Boolean(photo) })),
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        style: { position: "absolute", left: 0, top: 0 },
      }),
      node("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: PROMO_CONTENT_LEFT,
          top: PROMO_CONTENT_TOP,
          width: contentWidth,
        },
        children: [badgeNode, nameNode, ...priceNodes, bodyNode].filter(Boolean),
      }),
      photo
        ? node("div", {
            style: { ...bold, position: "absolute", right: 80, bottom: 40, fontSize: 32, color: PROMO_DISCLAIMER_COLOR },
            children: "*imagens meramente ilustrativas",
          })
        : null,
    ].filter(Boolean),
  });
}
```

E junto de `const FRAME_HEIGHT = 1080;` adicionar:

```ts
const FRAME_WIDTH = 1920; // mesmo valor de PANEL_WIDTH (render.ts); mesma razão do FRAME_HEIGHT.
```

- [ ] **Step 5: Run template test**

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/promo-template.test.ts`
Expected: PASS.

- [ ] **Step 6: Render tests (rasterização real)**

Em `render.test.ts`, depois do teste `"promoção vira PNG 1920x1080"`, adicionar. A foto é um PNG 1×1 válido para o resvg decodificar:

```ts
  const PIXEL_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it.each([
    ["price com foto", "price", PIXEL_PNG],
    ["percent com foto", "percent", PIXEL_PNG],
    ["price sem foto", "price", null],
    ["percent sem foto", "percent", null],
  ])("promoção %s vira PNG 1920x1080", async (_caso, promoStyle, imageUrl) => {
    const png = await renderPanelPage(
      { kind: "promo", headline: null, body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", accentColor: "#D63A6A", promoStyle },
      { category: null, items: [{ ...item("Cheesecake", 899), oldPriceCents: 1499, imageUrl }] },
    );
    expect(pngSize(png)).toEqual({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  });
```

Run: `cd artifacts/api-server && pnpm vitest run src/lib/panels/__tests__/render.test.ts`
Expected: PASS (todos, inclusive os antigos de menu e aviso).

- [ ] **Step 7: `publish.ts` repassa os campos**

Em `publish.ts`, trocar a chamada de `renderPanelPage`:

```ts
      const png = await renderPanelPage(
        {
          kind: panel.kind as "menu" | "promo" | "notice",
          headline: panel.headline,
          body: panel.body,
          accentColor: panel.accentColor,
          promoStyle: panel.promoStyle,
        },
        renderPage,
      );
```

- [ ] **Step 8: Conferência visual**

Criar `src/lib/panels/__tests__/promo-snapshot.local.test.ts` **sem commitar**:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { renderPanelPage } from "../render";

// Trocar pelos caminhos reais: um JPEG qualquer do disco e o scratchpad da sessão.
const PHOTO = "/caminho/para/uma/foto.jpg";
const OUT = "/caminho/do/scratchpad";

it("gera PNGs para conferência visual", async () => {
  const imageUrl = `data:image/jpeg;base64,${readFileSync(PHOTO).toString("base64")}`;
  const item = { name: "Cheesecake de morango", description: null, priceCents: 899, oldPriceCents: 1499, imageUrl };
  for (const promoStyle of ["price", "percent"]) {
    const png = await renderPanelPage(
      { kind: "promo", headline: null, body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", accentColor: "#D63A6A", promoStyle },
      { category: null, items: [item] },
    );
    writeFileSync(`${OUT}/promo-${promoStyle}.png`, png);
  }
}, 30_000);
```

Rodar com `pnpm vitest run src/lib/panels/__tests__/promo-snapshot.local.test.ts`, abrir as imagens (Read) e checar contra a referência:
  - diagonal no lugar, foto à direita, selo pontilhado legível, enfeites acima do selo sem tocar nele;
  - preço não invade a foto; corpo em até 2 linhas; nada cortado na base.
Ajustar constantes de tamanho/posição se precisar (e os números esperados nos testes das Tasks 3 e 5, se mudarem). Apagar o arquivo local no fim.

- [ ] **Step 9: Suite completa e typecheck**

Run: `cd artifacts/api-server && pnpm test && pnpm typecheck`
Expected: tudo PASS; `menu-layout.test.ts` inalterado e passando (menu não mudou).

- [ ] **Step 10: Commit**

```bash
git add artifacts/api-server/src/lib/panels/templates.ts artifacts/api-server/src/lib/panels/publish.ts artifacts/api-server/src/lib/panels/__tests__/render.test.ts artifacts/api-server/src/lib/panels/__tests__/promo-template.test.ts
git commit -m "feat(panels): visual novo do slide de promoção

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Prévia da promoção no portal

**Files:**
- Create: `artifacts/signage/src/lib/promo-visual.ts`
- Test: `artifacts/signage/src/lib/__tests__/promo-visual.test.ts`
- Modify: `artifacts/signage/src/components/portal/panel-preview.tsx`
- Modify: `artifacts/signage/index.html:27`
- Test: `artifacts/signage/src/components/portal/__tests__/panel-preview.test.tsx`

**Interfaces:**
- Consumes: mesmo contrato das Tasks 2 e 3 (copiado).
- Produces: `artifacts/signage/src/lib/promo-visual.ts` exporta `DEFAULT_ACCENT_COLOR`, `normalizeAccentColor`, `promoPalette`, `discountPercent`, `resolvePromoStyle`, `type PromoStyle`, `PROMO_PHOTO_LEFT`, `PROMO_SPLIT_BOTTOM`, `promoBackgroundSvg`, `promoBadgeMetrics`, `promoBadgeSvg`. `PanelPreviewProps` ganha `accentColor?: string | null` e `promoStyle?: string | null`.

- [ ] **Step 1: Write the failing tests**

`artifacts/signage/src/lib/__tests__/promo-visual.test.ts` — guarda de deriva contra o servidor (mesmos valores esperados):

```ts
import { describe, expect, it } from 'vitest';
import { promoBadgeMetrics, promoPalette, resolvePromoStyle } from '../promo-visual';

describe('promo-visual (cópia do servidor)', () => {
  it('paleta do rosa padrão igual à do servidor', () => {
    expect(promoPalette(null)).toEqual({ panel: '#D63A6A', text: '#FFFFFF', price: '#3A2037' });
  });

  it('medidas do selo iguais às do servidor', () => {
    expect(promoBadgeMetrics('PROMOÇÃO')).toEqual({ fontSize: 96, width: 573, height: 182 });
  });

  it('percent sem preço antigo cai para price', () => {
    expect(resolvePromoStyle('percent', { priceCents: 899, oldPriceCents: null })).toBe('price');
  });
});
```

Em `panel-preview.test.tsx`, substituir o teste `'mostra o preço antigo riscado na promoção'` por:

```tsx
  it('promoção price mostra DE/POR e o preço grande', () => {
    render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        items={[{ ...item('Pizza', 4990), oldPriceCents: 6990 }]}
        page={1}
      />,
    );
    expect(screen.getByText('PROMOÇÃO')).toBeInTheDocument();
    expect(screen.getByText('DE')).toBeInTheDocument();
    expect(screen.getByText('69,90')).toBeInTheDocument();
    expect(screen.getByText('49,90')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('promoção percent mostra a porcentagem', () => {
    render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        promoStyle="percent"
        items={[{ ...item('Cheesecake', 899), oldPriceCents: 1499 }]}
        page={1}
      />,
    );
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('DE R$ 14,99 POR R$ 8,99')).toBeInTheDocument();
  });

  it('promoção usa a cor escolhida no fundo', () => {
    const { container } = render(
      <PanelPreview
        kind="promo"
        headline={null}
        body={null}
        accentColor="#2563eb"
        items={[item('Pizza', 4990)]}
        page={1}
      />,
    );
    const bg = container.querySelector('img[data-promo-background]');
    expect(decodeURIComponent(bg!.getAttribute('src')!)).toContain('fill="#2563EB"');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd artifacts/signage && pnpm vitest run src/lib/__tests__/promo-visual.test.ts src/components/portal/__tests__/panel-preview.test.tsx`
Expected: FAIL — `promo-visual` não existe; prévia sem `PROMOÇÃO`/`40%`.

- [ ] **Step 3: Criar `promo-visual.ts`**

Arquivo novo com cabeçalho:

```ts
/**
 * Cópia para a prévia de `artifacts/api-server/src/lib/panels/promo-palette.ts`
 * e `promo-background.ts`. O signage não depende do pacote do servidor (mesma
 * razão das constantes de paginação em `portal-panel-editor.tsx`); os testes
 * em `__tests__/promo-visual.test.ts` repetem valores do servidor para acusar
 * deriva. Quem decide o visual de verdade é o PNG do servidor.
 */
```

Seguido do conteúdo **integral** de `promo-palette.ts` (Task 2, Step 3) e de `promo-background.ts` (Task 3, Step 3), sem os comentários de cabeçalho de cada um, com aspas simples no estilo do signage. Nenhuma mudança de lógica.

- [ ] **Step 4: Reescrever `PromoPreview`**

Em `panel-preview.tsx`, importar:

```tsx
import {
  PROMO_PHOTO_LEFT,
  PROMO_SPLIT_BOTTOM,
  discountPercent,
  promoBackgroundSvg,
  promoBadgeMetrics,
  promoBadgeSvg,
  promoPalette,
  resolvePromoStyle,
} from '@/lib/promo-visual';
```

Adicionar em `PanelPreviewProps`:

```tsx
  accentColor?: string | null;
  promoStyle?: string | null;
```

Substituir `PromoPreview` por:

```tsx
/** Pixel do quadro 1920×1080 em unidade do container: 1920px = 100cqw. */
const px = (value: number) => `${(value / 1920) * 100}cqw`;

const svgSrc = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

/** "R$ 8,99" → ["R$", "8,99"], mesma regra do servidor. */
function splitCurrency(formatted: string): [string, string] {
  const space = formatted.indexOf(' ');
  return [formatted.slice(0, space), formatted.slice(space + 1)];
}

function PromoPreview({
  headline,
  body,
  item,
  accentColor,
  promoStyle,
}: {
  headline: string | null;
  body: string | null;
  item: PanelPreviewItem | undefined;
  accentColor: string | null;
  promoStyle: string | null;
}) {
  // Mesmas posições e tamanhos de `promoNode` em templates.ts, convertidos por px().
  const palette = promoPalette(accentColor);
  const style = resolvePromoStyle(promoStyle, item);
  const photo = item?.imageUrl ?? null;
  const badgeText = (headline ?? 'PROMOÇÃO').toUpperCase();
  const badge = promoBadgeMetrics(badgeText);
  const priceCents = item?.priceCents ?? 0;
  const oldPriceCents = item?.oldPriceCents ?? null;
  const [currency, amount] = splitCurrency(formatPriceBRL(priceCents));

  return (
    <div
      className="relative h-full w-full overflow-hidden font-bold"
      style={{ backgroundColor: '#F1F1F3', color: palette.text, fontFamily: 'Fredoka, sans-serif' }}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          className="absolute top-0 h-full object-cover"
          style={{ left: px(PROMO_PHOTO_LEFT), width: px(1920 - PROMO_PHOTO_LEFT) }}
        />
      ) : null}
      <img
        data-promo-background
        src={svgSrc(promoBackgroundSvg({ color: palette.panel, ornament: palette.text, hasImage: Boolean(photo) }))}
        alt=""
        className="absolute inset-0 h-full w-full"
      />
      <div
        className="absolute flex flex-col"
        style={{ left: px(80), top: px(310), width: px(photo ? PROMO_SPLIT_BOTTOM - 160 : 1400) }}
      >
        <div
          className="relative flex items-center justify-center"
          style={{ width: px(badge.width), height: px(badge.height) }}
        >
          <img
            src={svgSrc(promoBadgeSvg({ width: badge.width, height: badge.height, stroke: palette.text }))}
            alt=""
            className="absolute inset-0 h-full w-full"
          />
          <span style={{ fontSize: px(badge.fontSize) }}>{badgeText}</span>
        </div>
        <div className="truncate" style={{ fontSize: px(52), marginTop: px(24) }}>
          {(item?.name ?? '').toUpperCase()}
        </div>
        {style === 'percent' && oldPriceCents !== null ? (
          <>
            <div className="flex items-baseline" style={{ color: palette.price, marginTop: px(8) }}>
              <span style={{ fontSize: px(200), lineHeight: 1 }}>{`${discountPercent(oldPriceCents, priceCents)}%`}</span>
              <span style={{ fontSize: px(72), marginLeft: px(16) }}>OFF</span>
            </div>
            <div style={{ fontSize: px(40) }}>
              {`DE ${formatPriceBRL(oldPriceCents)} POR ${formatPriceBRL(priceCents)}`}
            </div>
          </>
        ) : (
          <>
            {oldPriceCents !== null ? (
              <div className="flex items-baseline" style={{ marginTop: px(24) }}>
                <span style={{ fontSize: px(36) }}>DE</span>
                <span style={{ fontSize: px(52), margin: `0 ${px(16)}` }}>
                  {splitCurrency(formatPriceBRL(oldPriceCents))[1]}
                </span>
                <span style={{ fontSize: px(36) }}>POR</span>
              </div>
            ) : null}
            <div className="flex items-baseline" style={{ color: palette.price }}>
              <span style={{ fontSize: px(52), marginRight: px(12) }}>{currency}</span>
              <span style={{ fontSize: px(amount.length > 6 ? 130 : 170), lineHeight: 1 }}>{amount}</span>
            </div>
          </>
        )}
        {body ? (
          <div className="line-clamp-2" style={{ fontSize: px(38), lineHeight: 1.2, marginTop: px(16), color: palette.price }}>
            {body}
          </div>
        ) : null}
      </div>
      {photo ? (
        <div className="absolute" style={{ right: px(80), bottom: px(40), fontSize: px(32), color: '#3A2A4A' }}>
          *imagens meramente ilustrativas
        </div>
      ) : null}
    </div>
  );
}
```

Em `PanelPreview`, receber `accentColor` e `promoStyle`, tirar o padding só da promoção (o quadro dela é sangrado) e repassar:

```tsx
export function PanelPreview({ kind, headline, body, items, page, accentColor = null, promoStyle = null }: PanelPreviewProps) {
  return (
    <div
      className={cn('aspect-[16/9] w-full overflow-hidden rounded-lg', kind === 'promo' ? null : 'p-[4%]')}
      style={{
        backgroundColor: COLORS.background,
        color: COLORS.text,
        containerType: 'inline-size',
      }}
    >
      {kind === 'menu' ? <MenuPreview items={items} page={page} /> : null}
      {kind === 'promo' ? (
        <PromoPreview headline={headline} body={body} item={items[0]} accentColor={accentColor} promoStyle={promoStyle} />
      ) : null}
      {kind === 'notice' ? <NoticePreview headline={headline} body={body} /> : null}
    </div>
  );
}
```

Atualizar o comentário do topo do arquivo: a promoção agora espelha `promoNode` por `px()` (quase pixel a pixel); menu e aviso seguem aproximados. Se `COLORS.accent` ficar sem uso, removê-lo.

- [ ] **Step 5: Fonte na prévia**

Em `artifacts/signage/index.html`, trocar a URL da linha 27 por:

```html
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 6: Run tests**

Run: `cd artifacts/signage && pnpm vitest run src/lib/__tests__/promo-visual.test.ts src/components/portal/__tests__/panel-preview.test.tsx && pnpm test && pnpm typecheck`
Expected: PASS em tudo.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src/lib/promo-visual.ts artifacts/signage/src/lib/__tests__/promo-visual.test.ts artifacts/signage/src/components/portal/panel-preview.tsx artifacts/signage/src/components/portal/__tests__/panel-preview.test.tsx artifacts/signage/index.html
git commit -m "feat(portal): prévia no visual novo da promoção

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Cor e estilo no editor

**Files:**
- Modify: `artifacts/signage/src/pages/portal-panel-editor.tsx` (estado ~317, carga ~332, salvar ~447, JSX promo ~655, `<PanelPreview>` ~832)
- Test: `artifacts/signage/src/pages/__tests__/portal-panel-editor.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`UpdatePanelRequest.accentColor`, `promoStyle` no cliente gerado), Task 6 (`DEFAULT_ACCENT_COLOR`, `normalizeAccentColor`, `resolvePromoStyle` de `@/lib/promo-visual`; props `accentColor`/`promoStyle` de `PanelPreview`).

- [ ] **Step 1: Write the failing tests**

Adicionar ao `describe('PortalPanelEditor', ...)`:

```tsx
  const promoPanel = {
    ...panel,
    kind: 'promo',
    accentColor: null,
    promoStyle: null,
    items: [
      { id: 2, panelId: 1, name: 'Cheesecake', description: null, priceCents: 899, oldPriceCents: null, category: null, imageUrl: null, displayOrder: 0, isActive: true },
    ],
  };

  function stubPromoFetch() {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(promoPanel), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('promoção envia cor e estilo escolhidos no salvar', async () => {
    const fetchMock = stubPromoFetch();
    renderEditor();
    await screen.findByDisplayValue('Cheesecake');
    const hex = screen.getByLabelText(/código da cor/i);
    await userEvent.clear(hex);
    await userEvent.type(hex, '#112233');
    await userEvent.click(screen.getByRole('button', { name: /porcentagem/i }));
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PATCH');
      expect(patch).toBeDefined();
      const sent = JSON.parse((patch![1] as RequestInit).body as string);
      expect(sent.accentColor).toBe('#112233');
      expect(sent.promoStyle).toBe('percent');
    });
  });

  it('porcentagem sem preço antigo maior mostra aviso', async () => {
    stubPromoFetch();
    renderEditor();
    await screen.findByDisplayValue('Cheesecake');
    expect(screen.queryByText(/sem preço antigo maior/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /porcentagem/i }));
    expect(screen.getByText('Sem preço antigo maior, o slide mostra o preço normal.')).toBeInTheDocument();
  });

  it('código de cor inválido não é enviado', async () => {
    const fetchMock = stubPromoFetch();
    renderEditor();
    await screen.findByDisplayValue('Cheesecake');
    const hex = screen.getByLabelText(/código da cor/i);
    await userEvent.clear(hex);
    await userEvent.type(hex, '#12');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PATCH');
      expect(patch).toBeDefined();
      expect(JSON.parse((patch![1] as RequestInit).body as string).accentColor).toBeNull();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd artifacts/signage && pnpm vitest run src/pages/__tests__/portal-panel-editor.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: /código da cor/i`.

- [ ] **Step 3: Estado e carga**

Import:

```tsx
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor, resolvePromoStyle } from '@/lib/promo-visual';
```

Junto dos outros `useState` (depois de `body`):

```tsx
  // accentColor guarda só cor válida ('' = padrão); accentText é o que o
  // lojista está digitando, que pode estar pela metade.
  const [accentColor, setAccentColor] = useState('');
  const [accentText, setAccentText] = useState('');
  const [promoStyle, setPromoStyle] = useState<'price' | 'percent'>('price');
```

No `useEffect` de carga, depois de `setBody(panel.body ?? '');`:

```tsx
      setAccentColor(panel.accentColor ?? '');
      setAccentText(panel.accentColor ?? '');
      setPromoStyle(panel.promoStyle === 'percent' ? 'percent' : 'price');
```

- [ ] **Step 4: Salvar**

No `data` do `updatePanel.mutateAsync`, depois de `body`:

```tsx
          accentColor: accentColor === '' ? null : accentColor,
          promoStyle,
```

- [ ] **Step 5: Controles no bloco `kind === 'promo'`**

Logo depois do `<div>` do campo "Manchete" da promoção:

```tsx
                  <div className="space-y-1.5">
                    <Label htmlFor="panel-accent-text">Cor do painel</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Escolher cor"
                        value={normalizeAccentColor(accentColor).toLowerCase()}
                        onChange={(e) => {
                          const color = e.target.value.toUpperCase();
                          setAccentColor(color);
                          setAccentText(color);
                        }}
                        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                      />
                      <Input
                        id="panel-accent-text"
                        aria-label="Código da cor"
                        placeholder={DEFAULT_ACCENT_COLOR}
                        value={accentText}
                        maxLength={7}
                        onChange={(e) => {
                          const text = e.target.value;
                          setAccentText(text);
                          // Só vira cor quando está completa; pela metade, o
                          // slide segue com a última cor válida (ou a padrão).
                          if (text === '') setAccentColor('');
                          else if (/^#[0-9A-Fa-f]{6}$/.test(text)) setAccentColor(text.toUpperCase());
                        }}
                        className="w-32 font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Mostrar desconto como</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={promoStyle === 'price' ? 'default' : 'outline'}
                        aria-pressed={promoStyle === 'price'}
                        onClick={() => setPromoStyle('price')}
                      >
                        Preço
                      </Button>
                      <Button
                        type="button"
                        variant={promoStyle === 'percent' ? 'default' : 'outline'}
                        aria-pressed={promoStyle === 'percent'}
                        onClick={() => setPromoStyle('percent')}
                      >
                        Porcentagem
                      </Button>
                    </div>
                    {promoStyle === 'percent' &&
                    resolvePromoStyle('percent', items[0] ? draftToPreviewItem(items[0]) : undefined) === 'price' ? (
                      <p className="text-xs text-muted-foreground">
                        Sem preço antigo maior, o slide mostra o preço normal.
                      </p>
                    ) : null}
                  </div>
```

Com o id `panel-accent-text` e o `aria-label` "Código da cor" no mesmo input, o `aria-label` prevalece para `getByLabelText(/código da cor/i)`; o `<Label>` visível continua clicável.

- [ ] **Step 6: Prévia recebe cor e estilo**

```tsx
          <PanelPreview
            kind={kind}
            headline={headline.trim() === '' ? null : headline}
            body={body.trim() === '' ? null : body}
            items={previewItems}
            page={previewPage + 1}
            accentColor={accentColor === '' ? null : accentColor}
            promoStyle={promoStyle}
          />
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd artifacts/signage && pnpm vitest run src/pages/__tests__/portal-panel-editor.test.tsx && pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add artifacts/signage/src/pages/portal-panel-editor.tsx artifacts/signage/src/pages/__tests__/portal-panel-editor.test.tsx
git commit -m "feat(portal): cor e estilo da promoção no editor

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Verificação ponta a ponta

**Files:** nenhum novo (só correções que a verificação apontar).

- [ ] **Step 1: Typecheck e testes do monorepo**

Run: `pnpm run typecheck && pnpm -r --if-present run test`
Expected: tudo verde. Qualquer falha: corrigir na task de origem, commit `fix(...)`.

- [ ] **Step 2: Migração no banco de desenvolvimento**

Perguntar ao usuário antes: aplicar migração muda o banco. Com ok: `cd lib/db && pnpm migrate`.
Expected: aplica `0009` sem erro.

- [ ] **Step 3: Fluxo no app**

Subir api + signage (skill `run` ou scripts `dev`), entrar no portal com um cliente, criar painel de promoção:
  1. Nome, preço 8,99, preço antigo 14,99, foto JPEG, manchete vazia, corpo com duas frases.
  2. Cor `#D63A6A`, estilo Preço → prévia confere com a referência. Salvar, Publicar.
  3. Abrir a imagem publicada (announcement do painel) e comparar com a prévia.
  4. Trocar para Porcentagem → prévia mostra `40% OFF`; publicar e conferir PNG.
  5. Apagar o preço antigo com Porcentagem → aviso aparece; publicar sai DE/POR sem erro.
  6. Cor clara `#FFE600` → texto escuro legível no PNG.
  7. Painel de tabela de preços e de aviso existentes: republicar e confirmar visual igual ao de antes.

- [ ] **Step 4: Relatar**

Resumo ao usuário com os PNGs gerados (caminhos no scratchpad), o que passou e qualquer desvio da spec.

## Desvios durante a implementação

Os blocos de código acima ficaram como foram planejados; o que mudou na
implementação (e está valendo no código) é isto:

- **Largura estimada do selo**: `BADGE_CHAR_WIDTH` passou de `0.6` para `0.7` —
  a Fredoka Bold em maiúsculas é mais larga que o chute inicial. Com isso
  `promoBadgeMetrics("PROMOÇÃO")` dá `width: 650` (não 573) e os testes do plano
  que citam 573 usam 650.
- **Degraus de fonte do selo**: em vez de `96 / 64 / 44`, ficou
  `96 (≤10) / 64 (≤15) / 46 (≤21) / 34 (≤28) / 24 (acima)`. A altura do selo é
  fixa (`fonte × 1,9`); com os degraus antigos um texto perto dos 40 caracteres
  (`MAX_HEADLINE`) ficava mais largo que a cápsula, o satori quebrava em duas
  linhas e a segunda saía por cima da borda pontilhada.
- **Corte do nome do produto**: `MAX_PROMO_NAME` é 24 (não 28), para caber em
  800px a 52px de Fredoka Bold. A prévia do portal aplica o mesmo `truncate`
  em vez de confiar só no `truncate` do CSS.
- **Fonte do preço**: ganhou um terceiro degrau — `amount.length > 9 ? 100 :
  amount.length > 6 ? 130 : 170` — porque a API aceita até 100.000.000 centavos
  e `1.000.000,00` a 130px invadia a foto.
- **DE/POR**: só aparece quando o preço antigo é **maior** que o atual (a API
  não compara os dois), no servidor e na prévia.
- **Aviso do editor**: o texto é "Sem desconto válido, o slide mostra o preço
  normal." — o aviso também aparece com preço zerado ou desconto que arredonda
  para 0%, casos em que falar de "preço antigo maior" seria impreciso.
- **Cortes espelhados na prévia**: `MAX_HEADLINE`, `MAX_PROMO_NAME` e `MAX_BODY`
  são exportados de `artifacts/signage/src/lib/promo-visual.ts` e testados
  contra os valores do servidor em `promo-visual.test.ts`.

## Painel mais estreito (pedido do lojista, 2026-09-17)

Pedido: dar mais espaço à foto do produto, estreitando o painel colorido.
`PROMO_SPLIT_TOP`/`PROMO_SPLIT_BOTTOM` foram deslocados 140/130px para a
esquerda (mantendo a mesma inclinação da diagonal) e todo o resto que dependia
da largura da coluna foi recalculado:

- **Geometria**: `PROMO_SPLIT_TOP` 1120→980 (~58%→~51% da largura),
  `PROMO_SPLIT_BOTTOM` 960→830 (~50%→~43%), `PROMO_PHOTO_LEFT` 860→730 (mesma
  folga de 100px antes da diagonal na base).
- **Enfeites**: o "+" e o zigue-zague perto da borda direita (x=880-960)
  foram deslocados 140px para a esquerda (x=740-820) — com a diagonal mais
  estreita eles ficariam quase colados nela.
- **Selo (`BADGE_MAX_WIDTH`)**: 800→670 (= `PROMO_SPLIT_BOTTOM - 160`, a nova
  largura da coluna de conteúdo com foto). Degraus de fonte recalculados para
  a estimativa (`caracteres × 0,7 × fonte + 112`) caber em 670px até 40
  caracteres: `96/64/46/34/24` → `79/53/37/28/19` (mesmos limiares de
  caracteres: 10/15/21/28).
- **Nome do produto (`MAX_PROMO_NAME`)**: 24→20 — a 52px de Fredoka Bold
  (~32px/caractere), 24 caracteres precisavam de ~768px, que não cabem mais em
  670px.
- **Fonte do preço**: degraus 170/130/100 → 150/100/75 (mesmos limiares de
  `amount.length`: ≤6/7-9/>9), usando a estimativa `caracteres × 0,62 × fonte`
  mais a largura de "R$" a 52px e a margem de 12px, para `1.000.000,00` (12
  dígitos) continuar sem invadir a foto.
- **Verificação visual**: renderizados (e conferidos com o Read de imagem)
  price, percent, sem foto, manchete de 39 caracteres, nome de 24 caracteres
  (corta em "CHEESECAKE DE MORAN…") e preço de R$ 1.000.000,00 — nada cruza a
  diagonal, sobrepõe o selo pontilhado ou é cortado pela borda do quadro.
- **Achado não corrigido**: a linha `DE R$ ... POR R$ ...` do estilo percent
  já estourava a coluna de conteúdo antes desta mudança quando os dois preços
  têm muitos dígitos (ex.: `DE R$ 1.000.000,00 POR R$ 999.999,99`, ~893px a
  40px de fonte, tanto nos 800px antigos quanto nos 670px novos). Não é uma
  regressão desta mudança; fica registrado para uma correção futura.
