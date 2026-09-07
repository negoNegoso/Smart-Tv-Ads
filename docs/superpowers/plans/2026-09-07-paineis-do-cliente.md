# Painéis do cliente — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cliente cadastra cardápio, promoção ou aviso no portal e publica; a publicação vira PNG renderizado no servidor e entra automaticamente nas TVs do próprio cliente.

**Architecture:** Um painel publicado é renderizado no servidor (satori → SVG com texto em `path`; `@resvg/resvg-wasm` → PNG 1920×1080), gravado no `MediaStore` existente e materializado como `announcements` com `mediaKind='image'` e `source='panel'`. `display.ts` ganha uma terceira fonte de slides ligada por `panels.client_id = devices.client_id`. Nenhuma linha muda em `pages/display.tsx` ou `public/tv.html`.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM + PostgreSQL, zod v4, vitest + supertest, React 18 + wouter + TanStack Query + shadcn/ui, esbuild (bundle da API), satori, `@resvg/resvg-wasm`.

**Spec:** `docs/superpowers/specs/2026-09-07-paineis-do-cliente-design.md`

## Global Constraints

- Gerenciador de pacotes: **pnpm** (`npm install` e `yarn` são bloqueados pelo `preinstall`). Instalar dependência sempre com `pnpm --filter <pacote> add <dep>`.
- Node >= 22. Módulos ESM (`"type": "module"` em `api-server` e `signage`).
- Toda tabela nova vive em um arquivo próprio em `lib/db/src/schema/` e é reexportada por `lib/db/src/schema/index.ts`.
- Preço **sempre** em centavos, `integer`. Nunca `real`, nunca float.
- Textos de UI e mensagens de erro da API em **português do Brasil**.
- Testes da API não tocam o banco: mocke o módulo de serviço (`vi.mock`) como em `src/routes/__tests__/portal-scope.test.ts`.
- Nenhuma alteração em `artifacts/signage/src/pages/display.tsx` nem em `artifacts/signage/public/tv.html`. Se um passo parecer exigir isso, pare: a arquitetura foi violada.
- Schema é aplicado manualmente (`pnpm --filter @workspace/db run push`), nunca no build.
- Ao alterar `lib/db`, compile antes de usar em outro pacote: `cd lib/db && npx tsc --build`.
- Verificação final de qualquer tarefa que toque tipos: `pnpm run typecheck`.

---

## Estrutura de arquivos

**Criar:**

| arquivo | responsabilidade |
| --- | --- |
| `lib/db/src/schema/panels.ts` | tabela `panels` |
| `lib/db/src/schema/panel_items.ts` | tabela `panel_items` |
| `lib/db/src/schema/panel_slides.ts` | tabela `panel_slides` |
| `artifacts/api-server/src/lib/panels/paginate.ts` | quebra de itens em páginas (puro) |
| `artifacts/api-server/src/lib/panels/format.ts` | preço em pt-BR e truncagem de texto (puro) |
| `artifacts/api-server/src/lib/panels/templates.ts` | árvore satori de cada tipo de painel (puro) |
| `artifacts/api-server/src/lib/panels/assets.ts` | fontes `.ttf` e `resvg.wasm` como `Uint8Array` |
| `artifacts/api-server/src/lib/panels/render.ts` | página → PNG |
| `artifacts/api-server/src/lib/panels/ownership.ts` | regra de dono (puro) |
| `artifacts/api-server/src/lib/panels/queries.ts` | leitura e escrita do cadastro |
| `artifacts/api-server/src/lib/panels/publish.ts` | publicar e despublicar |
| `artifacts/api-server/src/lib/panels/device-slides.ts` | slides de painel por device + composição das fontes |
| `artifacts/api-server/src/routes/panels.ts` | rotas `/portal/client/panels` |
| `artifacts/signage/src/pages/portal-panels.tsx` | lista de painéis |
| `artifacts/signage/src/pages/portal-panel-editor.tsx` | editor + pré-visualização |
| `artifacts/signage/src/components/portal/panel-preview.tsx` | pré-visualização 16:9 |

**Modificar:**

| arquivo | mudança |
| --- | --- |
| `lib/db/src/schema/index.ts` | exporta as três tabelas novas |
| `lib/db/src/schema/announcements.ts` | coluna `source` |
| `artifacts/api-server/src/routes/display.ts` | terceira fonte de slides |
| `artifacts/api-server/src/routes/portal.ts` | monta o router de painéis |
| `artifacts/api-server/build.mjs` | loaders binários para `.ttf` e `.wasm` |
| `artifacts/api-server/src/routes/announcements.ts` | expõe `source` na listagem |
| `artifacts/signage/src/App.tsx` | área do cliente com abas |
| `artifacts/signage/src/pages/admin.tsx` | peça de painel não editável |
| `lib/api-spec/openapi.yaml` | rotas de painéis |
| `README.md` | seção de painéis do cliente |

---

### Task 1: Schema dos painéis

**Files:**
- Create: `lib/db/src/schema/panels.ts`, `lib/db/src/schema/panel_items.ts`, `lib/db/src/schema/panel_slides.ts`
- Modify: `lib/db/src/schema/index.ts`, `lib/db/src/schema/announcements.ts`

**Interfaces:**
- Consumes: `clientsTable` (`./clients`), `announcementsTable` (`./announcements`).
- Produces: `panelsTable`, `panelItemsTable`, `panelSlidesTable`, e os tipos `Panel`, `PanelItem`, `PanelSlide`, `InsertPanel`, `InsertPanelItem`. Tipo `PanelKind = "menu" | "promo" | "notice"` e `PanelStatus = "draft" | "published"`, exportados de `./panels`.

- [ ] **Step 1: Criar `lib/db/src/schema/panels.ts`**

```ts
import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

/** Tipos de painel que o cliente monta sozinho no portal. */
export const PANEL_KINDS = ["menu", "promo", "notice"] as const;
export type PanelKind = (typeof PANEL_KINDS)[number];

export const PANEL_STATUSES = ["draft", "published"] as const;
export type PanelStatus = (typeof PANEL_STATUSES)[number];

export const panelsTable = pgTable(
  "panels",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    // "menu" | "promo" | "notice"
    kind: text("kind").notNull(),
    // Rótulo interno do portal; não vai para a tela da TV.
    name: text("name").notNull(),
    template: text("template").notNull(),
    // "draft" | "published"
    status: text("status").notNull().default("draft"),
    // Segundos por slide gerado a partir deste painel.
    duration: integer("duration").notNull().default(10),
    headline: text("headline"),
    body: text("body"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  // display.ts consulta por cliente + status a cada 60s por TV.
  (t) => [index("panels_client_status_idx").on(t.clientId, t.status)],
);

export const insertPanelSchema = createInsertSchema(panelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPanel = z.infer<typeof insertPanelSchema>;
export type Panel = typeof panelsTable.$inferSelect;
```

- [ ] **Step 2: Criar `lib/db/src/schema/panel_items.ts`**

```ts
import { pgTable, text, serial, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { panelsTable } from "./panels";

export const panelItemsTable = pgTable(
  "panel_items",
  {
    id: serial("id").primaryKey(),
    panelId: integer("panel_id")
      .notNull()
      .references(() => panelsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Centavos. Float erra centavo em soma e formatação, e este número é o
    // preço que o lojista mostra ao consumidor dele.
    priceCents: integer("price_cents").notNull().default(0),
    // O "de" do "de/por". Nulo quando não há preço antigo.
    oldPriceCents: integer("old_price_cents"),
    // Agrupa no cardápio. Nulo cai num grupo sem título.
    category: text("category"),
    // Só a promoção usa foto; o cardápio é tipográfico.
    imageUrl: text("image_url"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("panel_items_panel_idx").on(t.panelId)],
);

export const insertPanelItemSchema = createInsertSchema(panelItemsTable).omit({ id: true });

export type InsertPanelItem = z.infer<typeof insertPanelItemSchema>;
export type PanelItem = typeof panelItemsTable.$inferSelect;
```

- [ ] **Step 3: Criar `lib/db/src/schema/panel_slides.ts`**

```ts
import { pgTable, serial, integer, index, unique } from "drizzle-orm/pg-core";
import { panelsTable } from "./panels";
import { announcementsTable } from "./announcements";

/**
 * Rastro da renderização: liga o painel às peças geradas na última publicação.
 * Sem ele, republicar acumula PNG e `announcements` órfãs — é esta tabela que
 * diz o que apagar.
 */
export const panelSlidesTable = pgTable(
  "panel_slides",
  {
    id: serial("id").primaryKey(),
    panelId: integer("panel_id")
      .notNull()
      .references(() => panelsTable.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("panel_slides_panel_idx").on(t.panelId),
    unique("panel_slides_panel_page_unique").on(t.panelId, t.pageNo),
  ],
);

export type PanelSlide = typeof panelSlidesTable.$inferSelect;
```

- [ ] **Step 4: Adicionar `source` em `lib/db/src/schema/announcements.ts`**

Depois de `displayOrder`, antes de `duration`:

```ts
  // "admin" (peça subida no painel de gestão) | "panel" (gerada por um painel
  // do cliente). O default mantém o servidor da versão anterior funcionando
  // durante o deploy, antes de conhecer a coluna.
  source: text("source").notNull().default("admin"),
```

- [ ] **Step 5: Exportar no barrel `lib/db/src/schema/index.ts`**

Acrescente ao final:

```ts
export * from "./panels";
export * from "./panel_items";
export * from "./panel_slides";
```

- [ ] **Step 6: Compilar a lib e verificar**

Run: `cd lib/db && npx tsc --build`
Expected: sem erro, `src/schema/panels.d.ts` gerado.

- [ ] **Step 7: Aplicar o schema no banco de desenvolvimento**

Run: `pnpm --filter @workspace/db run push`
Expected: cria `panels`, `panel_items`, `panel_slides` e adiciona `announcements.source`.

- [ ] **Step 8: Commit**

```bash
git add lib/db/src/schema
git commit -m "feat(db): tabelas de painéis do cliente e coluna source"
```

---

### Task 2: Paginação dos itens

**Files:**
- Create: `artifacts/api-server/src/lib/panels/paginate.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/paginate.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export const MENU_ITEMS_PER_PAGE = 8;
  export interface PaginateItem { name: string; category: string | null; isActive: boolean; displayOrder: number }
  export interface PanelPage<T> { pageNo: number; category: string | null; items: T[] }
  export function paginateMenuItems<T extends PaginateItem>(items: T[], perPage?: number): PanelPage<T>[];
  ```

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/api-server/src/lib/panels/__tests__/paginate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MENU_ITEMS_PER_PAGE, paginateMenuItems } from "../paginate";

const item = (name: string, category: string | null, displayOrder: number) => ({
  name,
  category,
  isActive: true,
  displayOrder,
});

describe("paginateMenuItems", () => {
  it("painel sem item nenhum não gera página", () => {
    expect(paginateMenuItems([])).toEqual([]);
  });

  it("mantém uma categoria inteira numa página quando cabe", () => {
    const items = [item("Pão", "Padaria", 1), item("Bolo", "Padaria", 2)];
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(1);
    expect(pages[0].category).toBe("Padaria");
    expect(pages[0].items.map((i) => i.name)).toEqual(["Pão", "Bolo"]);
  });

  it("quebra a categoria que estoura em páginas da mesma categoria", () => {
    const items = Array.from({ length: 10 }, (_, i) => item(`Item ${i}`, "Lanches", i));
    const pages = paginateMenuItems(items, 4);
    expect(pages.map((p) => p.items.length)).toEqual([4, 4, 2]);
    expect(pages.every((p) => p.category === "Lanches")).toBe(true);
    expect(pages.map((p) => p.pageNo)).toEqual([1, 2, 3]);
  });

  it("categoria nova sempre começa em página nova", () => {
    const items = [item("Pão", "Padaria", 1), item("Café", "Bebidas", 2)];
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.category)).toEqual(["Padaria", "Bebidas"]);
  });

  it("exatamente perPage itens ocupam uma página só", () => {
    const items = Array.from({ length: MENU_ITEMS_PER_PAGE }, (_, i) => item(`I${i}`, "Doces", i));
    expect(paginateMenuItems(items)).toHaveLength(1);
  });

  it("ignora item inativo", () => {
    const items = [item("Pão", "Padaria", 1), { ...item("Sumiu", "Padaria", 2), isActive: false }];
    expect(paginateMenuItems(items)[0].items.map((i) => i.name)).toEqual(["Pão"]);
  });

  it("respeita displayOrder, não a ordem do array", () => {
    const items = [item("Segundo", "Padaria", 2), item("Primeiro", "Padaria", 1)];
    expect(paginateMenuItems(items)[0].items.map((i) => i.name)).toEqual(["Primeiro", "Segundo"]);
  });

  it("itens sem categoria ficam juntos num grupo sem título", () => {
    const items = [item("Avulso A", null, 1), item("Avulso B", null, 2)];
    const pages = paginateMenuItems(items);
    expect(pages).toHaveLength(1);
    expect(pages[0].category).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- paginate`
Expected: FAIL — `Cannot find module '../paginate'`.

- [ ] **Step 3: Implementar**

`artifacts/api-server/src/lib/panels/paginate.ts`:

```ts
/** Itens por tela no cardápio. Acima disso a fonte fica pequena para uma TV. */
export const MENU_ITEMS_PER_PAGE = 8;

export interface PaginateItem {
  name: string;
  category: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface PanelPage<T> {
  pageNo: number;
  category: string | null;
  items: T[];
}

/**
 * Quebra os itens em telas, uma categoria por tela.
 *
 * Categoria que não cabe vira várias telas da mesma categoria em vez de
 * misturar grupos: na TV, o título é o que orienta a leitura.
 */
export function paginateMenuItems<T extends PaginateItem>(
  items: T[],
  perPage: number = MENU_ITEMS_PER_PAGE,
): PanelPage<T>[] {
  const active = items.filter((i) => i.isActive).sort((a, b) => a.displayOrder - b.displayOrder);

  const groups: Array<{ category: string | null; items: T[] }> = [];
  for (const item of active) {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }

  const pages: PanelPage<T>[] = [];
  for (const group of groups) {
    for (let start = 0; start < group.items.length; start += perPage) {
      pages.push({
        pageNo: pages.length + 1,
        category: group.category,
        items: group.items.slice(start, start + perPage),
      });
    }
  }
  return pages;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- paginate`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/panels
git commit -m "feat(panels): paginação de itens do cardápio"
```

---

### Task 3: Formatação de preço e truncagem

**Files:**
- Create: `artifacts/api-server/src/lib/panels/format.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/format.test.ts`

**Interfaces:**
- Produces: `formatPriceBRL(cents: number): string`, `truncate(text: string, max: number): string`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { formatPriceBRL, truncate } from "../format";

describe("formatPriceBRL", () => {
  it("formata centavos em real", () => {
    expect(formatPriceBRL(1990)).toBe("R$ 19,90");
  });

  it("preenche o centavo à esquerda", () => {
    expect(formatPriceBRL(5)).toBe("R$ 0,05");
  });

  it("zero é preço válido (item de cortesia)", () => {
    expect(formatPriceBRL(0)).toBe("R$ 0,00");
  });

  it("usa ponto de milhar", () => {
    expect(formatPriceBRL(123456)).toBe("R$ 1.234,56");
  });
});

describe("truncate", () => {
  it("devolve o texto intacto quando cabe", () => {
    expect(truncate("Pão de queijo", 20)).toBe("Pão de queijo");
  });

  it("corta com reticência e respeita o limite", () => {
    const out = truncate("Pão de queijo mineiro artesanal", 15);
    expect(out).toBe("Pão de queijo …");
    expect(out.length).toBeLessThanOrEqual(15);
  });

  it("não deixa espaço antes da reticência", () => {
    expect(truncate("Coxinha de frango", 12)).toBe("Coxinha de…");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- format`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Centavos inteiros para o texto que vai à tela. Nunca receba float aqui. */
export function formatPriceBRL(cents: number): string {
  //   é o espaço que o Intl coloca depois de "R$"; a TV mostra igual, mas
  // um teste com espaço comum quebraria sem motivo.
  return BRL.format(cents / 100).replace(/ /g, " ");
}

/**
 * Corta texto que não cabe no quadro. O satori quebraria a linha e empurraria o
 * layout para fora dos 1080px; cortar mantém a página legível.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).trimEnd();
  return `${cut}…`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- format`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/panels
git commit -m "feat(panels): formatação de preço e truncagem de texto"
```

---

### Task 4: Renderização de página para PNG

**Files:**
- Create: `artifacts/api-server/src/lib/panels/templates.ts`, `artifacts/api-server/src/lib/panels/assets.ts`, `artifacts/api-server/src/lib/panels/render.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/render.test.ts`
- Modify: `artifacts/api-server/package.json` (dependências)

**Interfaces:**
- Consumes: `paginateMenuItems`, `PanelPage` (Task 2); `formatPriceBRL`, `truncate` (Task 3).
- Produces:
  ```ts
  // templates.ts
  export interface RenderItem { name: string; description: string | null; priceCents: number; oldPriceCents: number | null; imageUrl: string | null }
  export interface RenderPanel { kind: "menu" | "promo" | "notice"; headline: string | null; body: string | null }
  export function panelPageNode(panel: RenderPanel, page: { category: string | null; items: RenderItem[] }): unknown;

  // assets.ts
  export function panelFonts(): Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }>;
  export function resvgWasm(): ArrayBuffer;

  // render.ts
  export const PANEL_WIDTH = 1920;
  export const PANEL_HEIGHT = 1080;
  export async function renderPanelPage(panel: RenderPanel, page: { category: string | null; items: RenderItem[] }): Promise<Buffer>;
  ```

- [ ] **Step 1: Instalar as dependências e as fontes**

```bash
pnpm --filter @workspace/api-server add satori @resvg/resvg-wasm
mkdir -p artifacts/api-server/assets/fonts
```

Baixe **Inter Regular (400)** e **Inter Bold (700)** em `.ttf` para
`artifacts/api-server/assets/fonts/Inter-Regular.ttf` e `Inter-Bold.ttf`
(https://github.com/rsms/inter/releases — pasta `Inter Desktop`). Os arquivos
são versionados: o bundle os embute e não há download em runtime.

- [ ] **Step 2: Escrever o teste que falha**

`artifacts/api-server/src/lib/panels/__tests__/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PANEL_HEIGHT, PANEL_WIDTH, renderPanelPage } from "../render";

/** Lê largura e altura do cabeçalho IHDR de um PNG (bytes 16..24). */
function pngSize(buffer: Buffer): { width: number; height: number } {
  const signature = buffer.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const item = (name: string, priceCents: number) => ({
  name,
  description: null,
  priceCents,
  oldPriceCents: null,
  imageUrl: null,
});

describe("renderPanelPage", () => {
  it("cardápio vira PNG 1920x1080", async () => {
    const png = await renderPanelPage(
      { kind: "menu", headline: null, body: null },
      { category: "Lanches", items: [item("Coxinha", 750), item("Pastel", 900)] },
    );
    expect(pngSize(png)).toEqual({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  });

  it("promoção vira PNG 1920x1080", async () => {
    const png = await renderPanelPage(
      { kind: "promo", headline: "Oferta do dia", body: "Só hoje" },
      { category: null, items: [{ ...item("Pizza grande", 4990), oldPriceCents: 6990 }] },
    );
    expect(pngSize(png)).toEqual({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  });

  it("aviso sem item nenhum vira PNG 1920x1080", async () => {
    const png = await renderPanelPage(
      { kind: "notice", headline: "Aceitamos Pix", body: "Chave: o telefone da loja" },
      { category: null, items: [] },
    );
    expect(pngSize(png)).toEqual({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  });

  it("nome absurdamente longo não muda o tamanho do quadro", async () => {
    const png = await renderPanelPage(
      { kind: "menu", headline: null, body: null },
      { category: "Lanches", items: [item("X".repeat(500), 1000)] },
    );
    expect(pngSize(png)).toEqual({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- render`
Expected: FAIL — `Cannot find module '../render'`.

- [ ] **Step 4: Implementar `assets.ts`**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fontes e binário do resvg entram no bundle como bytes (ver os loaders em
 * build.mjs), então nada é lido do disco em produção — a função da Vercel é um
 * arquivo só, sem node_modules e sem a pasta assets.
 *
 * Sob vitest os imports binários não existem, então o fallback lê do disco.
 * O caminho é relativo a este arquivo, não ao cwd.
 */
const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../assets");

function load(relative: string): Buffer {
  return readFileSync(path.join(assetsDir, relative));
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export function panelFonts(): Array<{
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}> {
  return [
    { name: "Inter", data: toArrayBuffer(load("fonts/Inter-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Inter", data: toArrayBuffer(load("fonts/Inter-Bold.ttf")), weight: 700, style: "normal" },
  ];
}

export function resvgWasm(): ArrayBuffer {
  return toArrayBuffer(load("resvg.wasm"));
}
```

Copie o wasm para dentro de `assets/` (é dependência instalada, não baixada da
internet):

```bash
cp node_modules/@resvg/resvg-wasm/index_bg.wasm artifacts/api-server/assets/resvg.wasm
```

- [ ] **Step 5: Implementar `templates.ts`**

```ts
import { formatPriceBRL, truncate } from "./format";

export interface RenderItem {
  name: string;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  imageUrl: string | null;
}

export interface RenderPanel {
  kind: "menu" | "promo" | "notice";
  headline: string | null;
  body: string | null;
}

/** Limites de caractere por campo. Além disso, o texto some do quadro. */
const MAX_ITEM_NAME = 42;
const MAX_ITEM_DESCRIPTION = 64;
const MAX_HEADLINE = 40;
const MAX_BODY = 160;

const COLORS = {
  background: "#0B1120",
  surface: "#111C33",
  text: "#F8FAFC",
  muted: "#94A3B8",
  accent: "#FBBF24",
};

/** Nó satori: mesma forma de um elemento React, sem depender do React aqui. */
const node = (type: string, props: Record<string, unknown>) => ({ type, props });

function frame(children: unknown[]) {
  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "64px 80px",
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
    },
    children,
  });
}

function menuNode(page: { category: string | null; items: RenderItem[] }) {
  const rows = page.items.map((item) =>
    node("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "32px",
        padding: "18px 0",
        borderBottom: `2px solid ${COLORS.surface}`,
      },
      children: [
        node("div", {
          style: { display: "flex", flexDirection: "column", gap: "6px" },
          children: [
            node("div", {
              style: { fontSize: 46, fontWeight: 700 },
              children: truncate(item.name, MAX_ITEM_NAME),
            }),
            item.description
              ? node("div", {
                  style: { fontSize: 26, color: COLORS.muted },
                  children: truncate(item.description, MAX_ITEM_DESCRIPTION),
                })
              : null,
          ].filter(Boolean),
        }),
        node("div", {
          style: { fontSize: 48, fontWeight: 700, color: COLORS.accent },
          children: formatPriceBRL(item.priceCents),
        }),
      ],
    }),
  );

  return frame([
    page.category
      ? node("div", {
          style: { fontSize: 34, letterSpacing: "4px", color: COLORS.muted, marginBottom: "24px" },
          children: page.category.toUpperCase(),
        })
      : null,
    node("div", { style: { display: "flex", flexDirection: "column", flex: 1 }, children: rows }),
  ].filter(Boolean));
}

function promoNode(panel: RenderPanel, item: RenderItem | undefined) {
  return frame([
    node("div", {
      style: { fontSize: 40, letterSpacing: "4px", color: COLORS.accent },
      children: truncate(panel.headline ?? "PROMOÇÃO", MAX_HEADLINE).toUpperCase(),
    }),
    node("div", {
      style: {
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "space-between",
        gap: "64px",
      },
      children: [
        node("div", {
          style: { display: "flex", flexDirection: "column", gap: "24px", maxWidth: "900px" },
          children: [
            node("div", {
              style: { fontSize: 92, fontWeight: 700, lineHeight: 1.05 },
              children: truncate(item?.name ?? "", MAX_ITEM_NAME),
            }),
            panel.body
              ? node("div", {
                  style: { fontSize: 32, color: COLORS.muted },
                  children: truncate(panel.body, MAX_BODY),
                })
              : null,
            node("div", {
              style: { display: "flex", alignItems: "baseline", gap: "24px" },
              children: [
                item?.oldPriceCents
                  ? node("div", {
                      style: {
                        fontSize: 44,
                        color: COLORS.muted,
                        textDecoration: "line-through",
                      },
                      children: formatPriceBRL(item.oldPriceCents),
                    })
                  : null,
                node("div", {
                  style: { fontSize: 120, fontWeight: 700, color: COLORS.accent },
                  children: formatPriceBRL(item?.priceCents ?? 0),
                }),
              ].filter(Boolean),
            }),
          ].filter(Boolean),
        }),
        item?.imageUrl
          ? node("img", {
              src: item.imageUrl,
              style: { width: 640, height: 640, objectFit: "cover", borderRadius: "32px" },
            })
          : null,
      ].filter(Boolean),
    }),
  ]);
}

function noticeNode(panel: RenderPanel) {
  return frame([
    node("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: "32px",
      },
      children: [
        node("div", {
          style: { fontSize: 96, fontWeight: 700, lineHeight: 1.1 },
          children: truncate(panel.headline ?? "", MAX_HEADLINE),
        }),
        panel.body
          ? node("div", {
              style: { fontSize: 44, color: COLORS.muted },
              children: truncate(panel.body, MAX_BODY),
            })
          : null,
      ].filter(Boolean),
    }),
  ]);
}

/** Árvore satori de uma página já paginada. */
export function panelPageNode(
  panel: RenderPanel,
  page: { category: string | null; items: RenderItem[] },
): unknown {
  if (panel.kind === "promo") return promoNode(panel, page.items[0]);
  if (panel.kind === "notice") return noticeNode(panel);
  return menuNode(page);
}
```

- [ ] **Step 6: Implementar `render.ts`**

```ts
import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { panelFonts, resvgWasm } from "./assets";
import { panelPageNode, type RenderItem, type RenderPanel } from "./templates";

export const PANEL_WIDTH = 1920;
export const PANEL_HEIGHT = 1080;

// initWasm falha se chamado duas vezes; a promessa memoizada serve tanto o
// processo longo do Replit quanto a instância reaproveitada da Vercel.
let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(resvgWasm());
  return wasmReady;
}

export async function renderPanelPage(
  panel: RenderPanel,
  page: { category: string | null; items: RenderItem[] },
): Promise<Buffer> {
  const svg = await satori(panelPageNode(panel, page) as never, {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    fonts: panelFonts(),
  });

  await ensureWasm();
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: PANEL_WIDTH } });
  return Buffer.from(resvg.render().asPng());
}

export type { RenderItem, RenderPanel };
```

- [ ] **Step 7: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- render`
Expected: PASS, 4 testes. Se o teste da promo com `imageUrl` falhar por rede,
confirme que nenhum teste passa `imageUrl` (nenhum passa: satori baixaria a URL).

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src/lib/panels artifacts/api-server/assets artifacts/api-server/package.json ../../pnpm-lock.yaml
git commit -m "feat(panels): renderiza página de painel em PNG 1920x1080"
```

---

### Task 5: Embutir fontes e wasm no bundle

**Files:**
- Modify: `artifacts/api-server/build.mjs`, `artifacts/api-server/src/lib/panels/assets.ts`

**Interfaces:**
- Consumes: `assets.ts` (Task 4).
- Produces: as duas funções de `assets.ts` passam a ser assíncronas —
  `panelFonts(): Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }>>` e
  `resvgWasm(): Promise<ArrayBuffer>`. `render.ts` é ajustado no mesmo passo;
  nenhum outro módulo as consome.

Motivo: a Build Output API não faz tracing — o `.func` é o sistema de arquivos
inteiro da lambda e não tem `assets/` nem `node_modules`. Ler do disco em
produção quebraria no primeiro publish. Embutir como bytes resolve sem passo de
cópia em dois scripts de build.

- [ ] **Step 1: Adicionar os loaders binários em `build.mjs`**

Dentro da chamada `esbuild({...})`, junto de `sourcemap: "linked"`:

```js
    // As fontes e o resvg.wasm viram bytes dentro do bundle: a .func da Vercel
    // não tem sistema de arquivos além do próprio index.mjs.
    loader: { ".ttf": "binary", ".wasm": "binary" },
```

- [ ] **Step 2: Preferir os bytes embutidos em `assets.ts`**

Substitua o corpo de `assets.ts` pelas importações estáticas, mantendo o
fallback de disco para o vitest:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sob esbuild estes imports viram Uint8Array embutidos (loader "binary").
// Sob vitest eles falham, e o catch lê o mesmo arquivo do disco.
const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../assets");

async function bytes(bundled: () => Promise<{ default: Uint8Array }>, relative: string): Promise<Buffer> {
  try {
    const mod = await bundled();
    return Buffer.from(mod.default);
  } catch {
    return readFileSync(path.join(assetsDir, relative));
  }
}

export async function panelFonts(): Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }>> {
  const [regular, bold] = await Promise.all([
    bytes(() => import("../../../assets/fonts/Inter-Regular.ttf") as never, "fonts/Inter-Regular.ttf"),
    bytes(() => import("../../../assets/fonts/Inter-Bold.ttf") as never, "fonts/Inter-Bold.ttf"),
  ]);
  const toArrayBuffer = (b: Buffer): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return [
    { name: "Inter", data: toArrayBuffer(regular), weight: 400, style: "normal" },
    { name: "Inter", data: toArrayBuffer(bold), weight: 700, style: "normal" },
  ];
}

export async function resvgWasm(): Promise<ArrayBuffer> {
  const b = await bytes(() => import("../../../assets/resvg.wasm") as never, "resvg.wasm");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
```

Ajuste `render.ts` para o `await`:

```ts
  const svg = await satori(panelPageNode(panel, page) as never, {
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    fonts: await panelFonts(),
  });

  await ensureWasm();
```

e em `ensureWasm`:

```ts
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = resvgWasm().then((wasm) => initWasm(wasm));
  return wasmReady;
}
```

Declare os módulos binários para o TypeScript em
`artifacts/api-server/src/types/binary-assets.d.ts`:

```ts
declare module "*.ttf" {
  const bytes: Uint8Array;
  export default bytes;
}

declare module "*.wasm" {
  const bytes: Uint8Array;
  export default bytes;
}
```

- [ ] **Step 3: Rodar os testes de render de novo**

Run: `pnpm --filter @workspace/api-server run test -- render`
Expected: PASS — o fallback de disco cobre o vitest.

- [ ] **Step 4: Verificar os dois builds**

Run: `pnpm --filter @workspace/api-server run build`
Expected: sucesso.

Run: `pnpm --filter @workspace/api-server run build:vercel`
Expected: sucesso.

Run: `node -e "const s=require('node:fs').statSync('artifacts/api-server/dist-vercel/index.mjs'); console.log(Math.round(s.size/1024)+' KB')"`
Expected: o bundle cresce alguns MB (fontes + wasm embutidos). Se o tamanho não
mudou, os loaders não pegaram: confira o caminho relativo dos imports.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/build.mjs artifacts/api-server/src
git commit -m "build(api): embute fontes e resvg.wasm no bundle"
```

---

### Task 6: Regra de dono e camada de consulta

**Files:**
- Create: `artifacts/api-server/src/lib/panels/ownership.ts`, `artifacts/api-server/src/lib/panels/queries.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/ownership.test.ts`

**Interfaces:**
- Consumes: `panelsTable`, `panelItemsTable` (Task 1).
- Produces:
  ```ts
  // ownership.ts
  export interface PanelAuth { isAdmin: boolean; clientIds: number[] }
  export function canAccessPanel(auth: PanelAuth, panelClientId: number): boolean;
  export function resolveOwnerClientId(auth: PanelAuth, requested: number | undefined): number | null;

  // queries.ts
  export interface PanelItemInput { name: string; description: string | null; priceCents: number; oldPriceCents: number | null; category: string | null; imageUrl: string | null }
  export interface PanelWithItems extends Panel { items: PanelItem[] }
  export function listPanels(clientIds: number[]): Promise<PanelWithItems[]>;
  export function getPanel(id: number): Promise<PanelWithItems | null>;
  export function createPanel(input: { clientId: number; kind: PanelKind; name: string; template: string }): Promise<Panel>;
  export function updatePanel(id: number, patch: Partial<Pick<Panel, "name" | "template" | "duration" | "headline" | "body">>): Promise<Panel | null>;
  export function replaceItems(panelId: number, items: PanelItemInput[]): Promise<PanelItem[]>;
  export function deletePanel(id: number): Promise<void>;
  ```

- [ ] **Step 1: Escrever o teste de dono que falha**

```ts
import { describe, expect, it } from "vitest";
import { canAccessPanel, resolveOwnerClientId } from "../ownership";

const admin = { isAdmin: true, clientIds: [] };
const lojista = { isAdmin: false, clientIds: [7] };
const multi = { isAdmin: false, clientIds: [7, 9] };

describe("canAccessPanel", () => {
  it("admin acessa qualquer painel", () => {
    expect(canAccessPanel(admin, 123)).toBe(true);
  });

  it("cliente acessa o painel do próprio cliente", () => {
    expect(canAccessPanel(lojista, 7)).toBe(true);
  });

  it("cliente não acessa painel de outro cliente", () => {
    expect(canAccessPanel(lojista, 8)).toBe(false);
  });

  it("usuário com dois vínculos acessa os dois", () => {
    expect(canAccessPanel(multi, 9)).toBe(true);
  });
});

describe("resolveOwnerClientId", () => {
  it("cliente com um vínculo não precisa informar o cliente", () => {
    expect(resolveOwnerClientId(lojista, undefined)).toBe(7);
  });

  it("cliente com dois vínculos precisa informar qual", () => {
    expect(resolveOwnerClientId(multi, undefined)).toBeNull();
  });

  it("cliente não cria painel para cliente de fora", () => {
    expect(resolveOwnerClientId(lojista, 8)).toBeNull();
  });

  it("admin precisa informar o cliente explicitamente", () => {
    expect(resolveOwnerClientId(admin, undefined)).toBeNull();
    expect(resolveOwnerClientId(admin, 55)).toBe(55);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- ownership`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `ownership.ts`**

```ts
export interface PanelAuth {
  isAdmin: boolean;
  clientIds: number[];
}

/** Quem pode ler ou alterar um painel daquele cliente. */
export function canAccessPanel(auth: PanelAuth, panelClientId: number): boolean {
  if (auth.isAdmin) return true;
  return auth.clientIds.includes(panelClientId);
}

/**
 * Cliente dono do painel que está sendo criado, ou null quando a intenção é
 * ambígua ou proibida. Devolver null em vez de escolher um vínculo qualquer
 * evita criar o cardápio na loja errada de quem opera duas.
 */
export function resolveOwnerClientId(auth: PanelAuth, requested: number | undefined): number | null {
  if (requested !== undefined) {
    return canAccessPanel(auth, requested) ? requested : null;
  }
  if (auth.isAdmin) return null;
  return auth.clientIds.length === 1 ? auth.clientIds[0] : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- ownership`
Expected: PASS, 8 testes.

- [ ] **Step 5: Implementar `queries.ts`**

```ts
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  panelsTable,
  panelItemsTable,
  type Panel,
  type PanelItem,
  type PanelKind,
} from "@workspace/db";

export interface PanelItemInput {
  name: string;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  category: string | null;
  imageUrl: string | null;
}

export interface PanelWithItems extends Panel {
  items: PanelItem[];
}

async function itemsOf(panelIds: number[]): Promise<Map<number, PanelItem[]>> {
  const grouped = new Map<number, PanelItem[]>();
  if (panelIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(panelItemsTable)
    .where(inArray(panelItemsTable.panelId, panelIds))
    .orderBy(asc(panelItemsTable.displayOrder), asc(panelItemsTable.id));
  for (const row of rows) {
    const list = grouped.get(row.panelId);
    if (list) list.push(row);
    else grouped.set(row.panelId, [row]);
  }
  return grouped;
}

/** Painéis dos clientes informados. Lista vazia devolve lista vazia. */
export async function listPanels(clientIds: number[]): Promise<PanelWithItems[]> {
  if (clientIds.length === 0) return [];
  const panels = await db
    .select()
    .from(panelsTable)
    .where(inArray(panelsTable.clientId, clientIds))
    .orderBy(asc(panelsTable.id));
  const items = await itemsOf(panels.map((p) => p.id));
  return panels.map((panel) => ({ ...panel, items: items.get(panel.id) ?? [] }));
}

export async function getPanel(id: number): Promise<PanelWithItems | null> {
  const [panel] = await db.select().from(panelsTable).where(eq(panelsTable.id, id));
  if (!panel) return null;
  const items = await itemsOf([panel.id]);
  return { ...panel, items: items.get(panel.id) ?? [] };
}

export async function createPanel(input: {
  clientId: number;
  kind: PanelKind;
  name: string;
  template: string;
}): Promise<Panel> {
  const [panel] = await db.insert(panelsTable).values(input).returning();
  return panel;
}

export async function updatePanel(
  id: number,
  patch: Partial<Pick<Panel, "name" | "template" | "duration" | "headline" | "body">>,
): Promise<Panel | null> {
  const [panel] = await db
    .update(panelsTable)
    .set(patch)
    .where(eq(panelsTable.id, id))
    .returning();
  return panel ?? null;
}

/**
 * Troca a lista inteira de itens numa transação.
 *
 * O editor é uma tabela que o lojista mexe em várias linhas antes de salvar;
 * um POST por linha seria onde nasceria estado meio-salvo.
 */
export async function replaceItems(panelId: number, items: PanelItemInput[]): Promise<PanelItem[]> {
  return db.transaction(async (tx) => {
    await tx.delete(panelItemsTable).where(eq(panelItemsTable.panelId, panelId));
    if (items.length === 0) return [];
    return tx
      .insert(panelItemsTable)
      .values(items.map((item, index) => ({ ...item, panelId, displayOrder: index })))
      .returning();
  });
}

export async function deletePanel(id: number): Promise<void> {
  await db.delete(panelsTable).where(eq(panelsTable.id, id));
}

/** Usado pelas rotas para autorizar antes de qualquer escrita. */
export async function panelClientId(id: number): Promise<number | null> {
  const [row] = await db
    .select({ clientId: panelsTable.clientId })
    .from(panelsTable)
    .where(and(eq(panelsTable.id, id)));
  return row?.clientId ?? null;
}
```

- [ ] **Step 6: Verificar tipos**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/panels
git commit -m "feat(panels): regra de dono e camada de consulta"
```

---

### Task 7: Rotas de cadastro

**Files:**
- Create: `artifacts/api-server/src/routes/panels.ts`
- Test: `artifacts/api-server/src/routes/__tests__/panels-scope.test.ts`
- Modify: `artifacts/api-server/src/routes/portal.ts`

**Interfaces:**
- Consumes: `queries.ts` e `ownership.ts` (Task 6); `requireClient` (`lib/auth/middleware`).
- Produces: router default export montado em `/portal/client/panels`.

- [ ] **Step 1: Escrever o teste de escopo que falha**

`artifacts/api-server/src/routes/__tests__/panels-scope.test.ts`:

```ts
import type { Express } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../lib/auth/session";

const SECRET = "segredo-paineis";
const loadAuthContext = vi.fn();
const listPanels = vi.fn();
const getPanel = vi.fn();
const createPanel = vi.fn();
const updatePanel = vi.fn();
const replaceItems = vi.fn();
const deletePanel = vi.fn();
const panelClientId = vi.fn();

vi.mock("../../lib/auth/user-store", () => ({
  loadAuthContext: (...a: unknown[]) => loadAuthContext(...a),
}));
vi.mock("../../lib/panels/queries", () => ({
  listPanels: (...a: unknown[]) => listPanels(...a),
  getPanel: (...a: unknown[]) => getPanel(...a),
  createPanel: (...a: unknown[]) => createPanel(...a),
  updatePanel: (...a: unknown[]) => updatePanel(...a),
  replaceItems: (...a: unknown[]) => replaceItems(...a),
  deletePanel: (...a: unknown[]) => deletePanel(...a),
  panelClientId: (...a: unknown[]) => panelClientId(...a),
}));
// publish.ts puxa o renderizador e o MediaStore; este arquivo testa o cadastro.
vi.mock("../../lib/panels/publish", () => ({
  publishPanel: vi.fn(),
  unpublishPanel: vi.fn(),
}));

async function buildApp(): Promise<Express> {
  process.env.SESSION_SECRET = SECRET;
  const { default: express } = await import("express");
  const { default: cookieParser } = await import("cookie-parser");
  const { loadSession, requireUser } = await import("../../lib/auth/middleware");
  const { default: portalRouter } = await import("../portal");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(loadSession);
  app.use("/portal", requireUser, portalRouter);
  return app;
}

const ctx = {
  userId: 7,
  email: "lojista@example.com",
  isActive: true,
  mustChangePassword: false,
  clientIds: [7],
  advertiserIds: [],
};

async function agent() {
  const app = await buildApp();
  const { default: request } = await import("supertest");
  return { app, request, cookie: `sid=${createSession(SECRET, "7")}` };
}

describe("escopo das rotas de painéis", () => {
  beforeEach(() => {
    for (const fn of [loadAuthContext, listPanels, getPanel, createPanel, updatePanel, replaceItems, deletePanel, panelClientId]) {
      fn.mockReset();
    }
    loadAuthContext.mockResolvedValue(ctx);
  });

  it("lista apenas os painéis dos clientes do usuário", async () => {
    listPanels.mockResolvedValue([]);
    const { request, app, cookie } = await agent();
    const res = await request(app).get("/portal/client/panels").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(listPanels).toHaveBeenCalledWith([7]);
  });

  it("usuário sem vínculo de cliente recebe 403", async () => {
    loadAuthContext.mockResolvedValue({ ...ctx, clientIds: [] });
    const { request, app, cookie } = await agent();
    const res = await request(app).get("/portal/client/panels").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("PATCH em painel de outro cliente recebe 403 e não escreve", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .patch("/portal/client/panels/5")
      .set("Cookie", cookie)
      .send({ name: "Invadido" });
    expect(res.status).toBe(403);
    expect(updatePanel).not.toHaveBeenCalled();
  });

  it("PUT de itens em painel de outro cliente recebe 403 e não escreve", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .put("/portal/client/panels/5/items")
      .set("Cookie", cookie)
      .send({ items: [] });
    expect(res.status).toBe(403);
    expect(replaceItems).not.toHaveBeenCalled();
  });

  it("DELETE em painel de outro cliente recebe 403 e não apaga", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app).delete("/portal/client/panels/5").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(deletePanel).not.toHaveBeenCalled();
  });

  it("painel inexistente responde 404, não 403", async () => {
    panelClientId.mockResolvedValue(null);
    const { request, app, cookie } = await agent();
    const res = await request(app).delete("/portal/client/panels/5").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("cria painel no cliente do usuário sem ele informar o id", async () => {
    createPanel.mockResolvedValue({ id: 1 });
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels")
      .set("Cookie", cookie)
      .send({ kind: "menu", name: "Cardápio", template: "menu-basico" });
    expect(res.status).toBe(201);
    expect(createPanel).toHaveBeenCalledWith({
      clientId: 7,
      kind: "menu",
      name: "Cardápio",
      template: "menu-basico",
    });
  });

  it("recusa kind fora do enum", async () => {
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels")
      .set("Cookie", cookie)
      .send({ kind: "banner", name: "X", template: "menu-basico" });
    expect(res.status).toBe(400);
    expect(createPanel).not.toHaveBeenCalled();
  });

  it("recusa preço negativo na lista de itens", async () => {
    panelClientId.mockResolvedValue(7);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .put("/portal/client/panels/5/items")
      .set("Cookie", cookie)
      .send({ items: [{ name: "Erro", priceCents: -1 }] });
    expect(res.status).toBe(400);
    expect(replaceItems).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- panels-scope`
Expected: FAIL — `/portal/client/panels` responde 404.

- [ ] **Step 3: Implementar `routes/panels.ts`**

```ts
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod/v4";
import { requireClient } from "../lib/auth/middleware";
import { canAccessPanel, resolveOwnerClientId, type PanelAuth } from "../lib/panels/ownership";
import {
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  panelClientId,
  replaceItems,
  updatePanel,
} from "../lib/panels/queries";

const router: IRouter = Router();

const authOf = (req: Request): PanelAuth => ({
  isAdmin: req.auth?.isAdmin ?? false,
  clientIds: req.auth?.clientIds ?? [],
});

const createBody = z.object({
  kind: z.enum(["menu", "promo", "notice"]),
  name: z.string().trim().min(1).max(80),
  template: z.string().trim().min(1).max(40),
  clientId: z.number().int().positive().optional(),
});

const patchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  template: z.string().trim().min(1).max(40).optional(),
  duration: z.number().int().min(5).max(60).optional(),
  headline: z.string().trim().max(80).nullable().optional(),
  body: z.string().trim().max(300).nullable().optional(),
});

const itemsBody = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(200).nullable().default(null),
        // Centavos: inteiro não negativo. Item de cortesia vale 0.
        priceCents: z.number().int().min(0).max(100_000_000),
        oldPriceCents: z.number().int().min(0).max(100_000_000).nullable().default(null),
        category: z.string().trim().max(60).nullable().default(null),
        imageUrl: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .max(200),
});

/**
 * Carrega o painel do path e autoriza. Sem isto, trocar o id na URL alcança o
 * cardápio de outro cliente. Painel inexistente é 404 — 403 aqui contaria a
 * quem tentou que o id existe.
 */
async function requirePanelAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Identificador inválido." });
    return;
  }
  const clientId = await panelClientId(id);
  if (clientId === null) {
    res.status(404).json({ error: "Painel não encontrado." });
    return;
  }
  if (!canAccessPanel(authOf(req), clientId)) {
    res.status(403).json({ error: "Sem permissão." });
    return;
  }
  res.locals.panelId = id;
  next();
}

router.use("/client/panels", requireClient);

router.get("/client/panels", async (req, res) => {
  const auth = authOf(req);
  // Admin sem vínculo usa o painel de gestão; aqui a lista sai vazia.
  res.json(await listPanels(auth.clientIds));
});

router.post("/client/panels", async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos para criar o painel." });
    return;
  }
  const clientId = resolveOwnerClientId(authOf(req), parsed.data.clientId);
  if (clientId === null) {
    res.status(400).json({ error: "Informe a qual cliente o painel pertence." });
    return;
  }
  const panel = await createPanel({
    clientId,
    kind: parsed.data.kind,
    name: parsed.data.name,
    template: parsed.data.template,
  });
  res.status(201).json(panel);
});

router.get("/client/panels/:id", requirePanelAccess, async (_req, res) => {
  res.json(await getPanel(res.locals.panelId as number));
});

router.patch("/client/panels/:id", requirePanelAccess, async (req, res) => {
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos para atualizar o painel." });
    return;
  }
  res.json(await updatePanel(res.locals.panelId as number, parsed.data));
});

router.put("/client/panels/:id/items", requirePanelAccess, async (req, res) => {
  const parsed = itemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Lista de itens inválida." });
    return;
  }
  res.json(await replaceItems(res.locals.panelId as number, parsed.data.items));
});

router.delete("/client/panels/:id", requirePanelAccess, async (_req, res) => {
  await deletePanel(res.locals.panelId as number);
  res.status(204).end();
});

export default router;
export { requirePanelAccess, authOf };
```

- [ ] **Step 4: Montar no `routes/portal.ts`**

Adicione o import e o `use` no final, antes do `export default`:

```ts
import panelsRouter from "./panels";
```

```ts
router.use(panelsRouter);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- panels-scope`
Expected: PASS, 9 testes.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes
git commit -m "feat(panels): rotas de cadastro no portal do cliente"
```

---

### Task 8: Publicar e despublicar

**Files:**
- Create: `artifacts/api-server/src/lib/panels/publish.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/publish-plan.test.ts`
- Modify: `artifacts/api-server/src/routes/panels.ts`

**Interfaces:**
- Consumes: `paginateMenuItems` (Task 2), `renderPanelPage` (Task 4), `PanelWithItems` (Task 6), `mediaStore()` (`lib/storage`).
- Produces:
  ```ts
  export function panelPages(panel: PanelWithItems): PanelPage<PanelItem>[];
  export function publishPanel(panelId: number): Promise<{ pages: number }>;
  export function unpublishPanel(panelId: number): Promise<void>;
  export class PanelRenderError extends Error { readonly pageNo: number }
  ```

- [ ] **Step 1: Escrever o teste do plano de páginas**

`artifacts/api-server/src/lib/panels/__tests__/publish-plan.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

// publish.ts importa @workspace/db no topo; o teste só exercita panelPages,
// que é puro. Mockar o módulo evita exigir DATABASE_URL para importar.
vi.mock("@workspace/db", () => ({
  db: {},
  panelsTable: {},
  panelItemsTable: {},
  panelSlidesTable: {},
  announcementsTable: {},
}));

const { panelPages } = await import("../publish");

const base = {
  id: 1,
  clientId: 7,
  name: "Painel",
  template: "t",
  status: "draft" as const,
  duration: 10,
  headline: null,
  body: null,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const item = (name: string, order: number) => ({
  id: order,
  panelId: 1,
  name,
  description: null,
  priceCents: 100,
  oldPriceCents: null,
  category: "Lanches",
  imageUrl: null,
  displayOrder: order,
  isActive: true,
});

describe("panelPages", () => {
  it("aviso rende exatamente uma página, mesmo sem item", () => {
    const pages = panelPages({ ...base, kind: "notice", headline: "Oi", items: [] });
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toEqual([]);
  });

  it("promoção rende uma página só, com o primeiro item", () => {
    const pages = panelPages({
      ...base,
      kind: "promo",
      items: [item("Pizza", 1), item("Ignorado", 2)],
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].items.map((i) => i.name)).toEqual(["Pizza"]);
  });

  it("cardápio grande vira várias páginas", () => {
    const items = Array.from({ length: 17 }, (_, i) => item(`Item ${i}`, i));
    expect(panelPages({ ...base, kind: "menu", items })).toHaveLength(3);
  });

  it("cardápio sem item ativo não rende página nenhuma", () => {
    const items = [{ ...item("Fora", 1), isActive: false }];
    expect(panelPages({ ...base, kind: "menu", items })).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- publish-plan`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `publish.ts`**

```ts
import { eq, inArray } from "drizzle-orm";
import {
  db,
  announcementsTable,
  panelsTable,
  panelSlidesTable,
  type PanelItem,
} from "@workspace/db";
import { mediaStore } from "../storage";
import { paginateMenuItems, type PanelPage } from "./paginate";
import { renderPanelPage } from "./render";
import { getPanel, type PanelWithItems } from "./queries";

/** Falha de renderização de uma página específica; a rota vira isto em 422. */
export class PanelRenderError extends Error {
  constructor(
    message: string,
    readonly pageNo: number,
  ) {
    super(message);
    this.name = "PanelRenderError";
  }
}

/** Páginas que este painel produz. Promo e aviso são sempre uma. */
export function panelPages(panel: PanelWithItems): PanelPage<PanelItem>[] {
  if (panel.kind === "notice") {
    return [{ pageNo: 1, category: null, items: [] }];
  }
  if (panel.kind === "promo") {
    const first = panel.items.filter((i) => i.isActive).sort((a, b) => a.displayOrder - b.displayOrder)[0];
    return first ? [{ pageNo: 1, category: null, items: [first] }] : [];
  }
  return paginateMenuItems(panel.items);
}

/**
 * Renderiza, grava as imagens e troca a publicação numa transação.
 *
 * A ordem importa: tudo é renderizado e enviado ao MediaStore **antes** de
 * abrir a transação. Se a renderização falhar, a publicação anterior segue
 * intacta no ar — melhor cardápio velho que TV vazia.
 */
export async function publishPanel(panelId: number): Promise<{ pages: number }> {
  const panel = await getPanel(panelId);
  if (!panel) throw new PanelRenderError("Painel não encontrado.", 0);

  const pages = panelPages(panel);
  if (pages.length === 0) {
    throw new PanelRenderError("Painel sem conteúdo para publicar.", 0);
  }

  const store = mediaStore();
  const uploaded: Array<{ pageNo: number; imageUrl: string }> = [];
  try {
    for (const page of pages) {
      const png = await renderPanelPage(
        { kind: panel.kind as "menu" | "promo" | "notice", headline: panel.headline, body: panel.body },
        page,
      );
      const imageUrl = await store.put(png, "image/png", `panel-${panel.id}-p${page.pageNo}.png`);
      uploaded.push({ pageNo: page.pageNo, imageUrl });
    }
  } catch (error) {
    // Limpa o que já subiu: a publicação não vai acontecer.
    await Promise.allSettled(uploaded.map((u) => store.remove(u.imageUrl)));
    const pageNo = uploaded.length + 1;
    throw new PanelRenderError(
      `Falha ao gerar a página ${pageNo} do painel: ${(error as Error).message}`,
      pageNo,
    );
  }

  const previousImages = await db.transaction(async (tx) => {
    const old = await tx
      .select({ announcementId: panelSlidesTable.announcementId })
      .from(panelSlidesTable)
      .where(eq(panelSlidesTable.panelId, panel.id));
    const oldIds = old.map((row) => row.announcementId);

    let images: string[] = [];
    if (oldIds.length > 0) {
      const rows = await tx
        .select({ imageUrl: announcementsTable.imageUrl })
        .from(announcementsTable)
        .where(inArray(announcementsTable.id, oldIds));
      images = rows.map((r) => r.imageUrl).filter((url): url is string => !!url);
      // panel_slides cai por cascade junto das announcements.
      await tx.delete(announcementsTable).where(inArray(announcementsTable.id, oldIds));
    }

    for (const page of uploaded) {
      const [announcement] = await tx
        .insert(announcementsTable)
        .values({
          title: `${panel.name} — página ${page.pageNo}`,
          imageUrl: page.imageUrl,
          mediaKind: "image",
          source: "panel",
          duration: panel.duration,
          displayOrder: page.pageNo,
          isActive: true,
        })
        .returning();
      await tx.insert(panelSlidesTable).values({
        panelId: panel.id,
        pageNo: page.pageNo,
        announcementId: announcement.id,
      });
    }

    await tx
      .update(panelsTable)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(panelsTable.id, panel.id));

    return images;
  });

  // Depois do commit: remoção de arquivo não participa de rollback. Falha aqui
  // deixa lixo no storage, não uma publicação incoerente.
  await Promise.allSettled(previousImages.map((url) => mediaStore().remove(url)));

  return { pages: uploaded.length };
}

/** Tira do ar mantendo o cadastro. As imagens saem junto: nada as referencia. */
export async function unpublishPanel(panelId: number): Promise<void> {
  const images = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ announcementId: panelSlidesTable.announcementId })
      .from(panelSlidesTable)
      .where(eq(panelSlidesTable.panelId, panelId));
    const ids = rows.map((r) => r.announcementId);
    let urls: string[] = [];
    if (ids.length > 0) {
      const found = await tx
        .select({ imageUrl: announcementsTable.imageUrl })
        .from(announcementsTable)
        .where(inArray(announcementsTable.id, ids));
      urls = found.map((r) => r.imageUrl).filter((url): url is string => !!url);
      await tx.delete(announcementsTable).where(inArray(announcementsTable.id, ids));
    }
    await tx
      .update(panelsTable)
      .set({ status: "draft", publishedAt: null })
      .where(eq(panelsTable.id, panelId));
    return urls;
  });

  await Promise.allSettled(images.map((url) => mediaStore().remove(url)));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- publish-plan`
Expected: PASS, 4 testes.

- [ ] **Step 5: Adicionar as rotas em `routes/panels.ts`**

Imports:

```ts
import { PanelRenderError, publishPanel, unpublishPanel } from "../lib/panels/publish";
```

Antes do `export default`:

```ts
router.post("/client/panels/:id/publish", requirePanelAccess, async (_req, res) => {
  try {
    const result = await publishPanel(res.locals.panelId as number);
    res.json({ status: "published", pages: result.pages });
  } catch (error) {
    if (error instanceof PanelRenderError) {
      // 422: o pedido é válido, o conteúdo é que não virou imagem. A
      // publicação anterior continua no ar.
      res.status(422).json({ error: error.message, pageNo: error.pageNo });
      return;
    }
    throw error;
  }
});

router.post("/client/panels/:id/unpublish", requirePanelAccess, async (_req, res) => {
  await unpublishPanel(res.locals.panelId as number);
  res.json({ status: "draft" });
});
```

E em `deletePanel`, despublique antes de apagar (as imagens precisam sair do
storage; o cascade só apaga linhas):

```ts
router.delete("/client/panels/:id", requirePanelAccess, async (_req, res) => {
  const id = res.locals.panelId as number;
  await unpublishPanel(id);
  await deletePanel(id);
  res.status(204).end();
});
```

- [ ] **Step 6: Adicionar os testes de escopo do publish**

Em `panels-scope.test.ts`, troque o mock de `../../lib/panels/publish` por
funções observáveis e acrescente os casos:

```ts
const publishPanel = vi.fn();
const unpublishPanel = vi.fn();
vi.mock("../../lib/panels/publish", () => ({
  publishPanel: (...a: unknown[]) => publishPanel(...a),
  unpublishPanel: (...a: unknown[]) => unpublishPanel(...a),
  PanelRenderError: class extends Error {
    constructor(message: string, public pageNo: number) { super(message); }
  },
}));
```

```ts
  it("publicar painel de outro cliente recebe 403 e não renderiza", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app).post("/portal/client/panels/5/publish").set("Cookie", cookie);
    expect(res.status).toBe(403);
    expect(publishPanel).not.toHaveBeenCalled();
  });

  it("publica o painel do próprio cliente", async () => {
    panelClientId.mockResolvedValue(7);
    publishPanel.mockResolvedValue({ pages: 2 });
    const { request, app, cookie } = await agent();
    const res = await request(app).post("/portal/client/panels/5/publish").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "published", pages: 2 });
  });
```

Adicione `publishPanel` e `unpublishPanel` à lista de `mockReset` do `beforeEach`.

- [ ] **Step 7: Rodar a suíte inteira**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS, incluindo os 11 testes de `panels-scope`.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src
git commit -m "feat(panels): publicação renderiza, troca as peças e limpa as antigas"
```

---

### Task 9: Painéis na TV

**Files:**
- Create: `artifacts/api-server/src/lib/panels/device-slides.ts`
- Test: `artifacts/api-server/src/lib/panels/__tests__/device-slides.test.ts`
- Modify: `artifacts/api-server/src/routes/display.ts`

**Interfaces:**
- Consumes: `panelsTable`, `panelSlidesTable`, `announcementsTable`.
- Produces:
  ```ts
  export interface RawSlide { announcementId: number; [key: string]: unknown }
  export function composeDeviceSlides<T extends { announcementId: number }>(campaigns: T[], panels: T[], playlist: T[]): T[];
  export function panelSlidesForClient(clientId: number): Promise<Array<Record<string, unknown>>>;
  ```

- [ ] **Step 1: Escrever o teste de composição que falha**

```ts
import { describe, expect, it } from "vitest";
import { composeDeviceSlides } from "../device-slides";

const slide = (announcementId: number, label: string) => ({ announcementId, label });

describe("composeDeviceSlides", () => {
  it("campanhas vêm antes do conteúdo do lojista", () => {
    const out = composeDeviceSlides([slide(1, "campanha")], [slide(2, "painel")], [slide(3, "playlist")]);
    expect(out.map((s) => s.label)).toEqual(["campanha", "painel", "playlist"]);
  });

  it("mesma peça em duas fontes aparece uma vez, na primeira", () => {
    const out = composeDeviceSlides([slide(1, "campanha")], [slide(1, "painel")], []);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("campanha");
  });

  it("painel duplicado na playlist do device não repete", () => {
    const out = composeDeviceSlides([], [slide(4, "painel")], [slide(4, "playlist")]);
    expect(out.map((s) => s.label)).toEqual(["painel"]);
  });

  it("sem painel publicado o resultado é o de antes", () => {
    const out = composeDeviceSlides([slide(1, "c")], [], [slide(2, "p")]);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2]);
  });

  it("preserva a ordem de cada fonte", () => {
    const out = composeDeviceSlides([], [slide(1, "p1"), slide(2, "p2")], []);
    expect(out.map((s) => s.announcementId)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- device-slides`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `device-slides.ts`**

```ts
import { and, asc, eq, sql } from "drizzle-orm";
import { db, announcementsTable, panelsTable, panelSlidesTable } from "@workspace/db";

/**
 * Junta as três fontes de slides de um device na ordem de exibição, sem repetir
 * peça. Campanha primeiro (é o que foi vendido), depois o conteúdo do lojista.
 */
export function composeDeviceSlides<T extends { announcementId: number }>(
  campaigns: T[],
  panels: T[],
  playlist: T[],
): T[] {
  const seen = new Set<number>();
  return [...campaigns, ...panels, ...playlist].filter((slide) => {
    if (seen.has(slide.announcementId)) return false;
    seen.add(slide.announcementId);
    return true;
  });
}

/**
 * Slides dos painéis publicados do cliente dono da TV.
 *
 * O vínculo é cliente→TVs, não device_playlist: uma linha por device
 * congelaria quais TVs o cliente tinha no dia da publicação, e a TV comprada
 * depois ficaria sem cardápio.
 */
export async function panelSlidesForClient(clientId: number) {
  return db
    .select({
      announcementId: panelSlidesTable.announcementId,
      campaignId: sql<number | null>`NULL`,
      title: announcementsTable.title,
      displayText: announcementsTable.displayText,
      showText: announcementsTable.showText,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
      scanCode: sql<string | null>`NULL`,
      mediaKind: announcementsTable.mediaKind,
      youtubeId: announcementsTable.youtubeId,
      playbackMode: announcementsTable.playbackMode,
      audioMode: announcementsTable.audioMode,
    })
    .from(panelSlidesTable)
    .innerJoin(panelsTable, eq(panelsTable.id, panelSlidesTable.panelId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, panelSlidesTable.announcementId))
    .where(
      and(
        eq(panelsTable.clientId, clientId),
        eq(panelsTable.status, "published"),
        eq(announcementsTable.isActive, true),
      ),
    )
    .orderBy(asc(panelsTable.id), asc(panelSlidesTable.pageNo));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- device-slides`
Expected: PASS, 5 testes.

- [ ] **Step 5: Usar as duas funções em `routes/display.ts`**

Adicione o import:

```ts
import { composeDeviceSlides, panelSlidesForClient } from "../lib/panels/device-slides";
```

Depois de `eligibleCampaignSlides`, carregue os painéis e troque o bloco de
dedupe manual:

```ts
  // Terceira fonte: painéis que o próprio lojista publicou no portal.
  const panelSlides = await panelSlidesForClient(device.clientId);

  const deduped = composeDeviceSlides(eligibleCampaignSlides, panelSlides, playlistSlides);
```

Remova o `const seen = new Set<number>();` e o `.filter(...)` que ele servia.
As chaves extras que só as campanhas têm (`advertiserSegmentId`, `targetMode`,
`deviceIds`, `segmentIds`, `weekdays`) continuam sendo descartadas no `map`
seguinte — os slides de painel simplesmente não as têm, e o destructuring de
propriedade ausente devolve `undefined` sem erro.

- [ ] **Step 6: Verificar tipos e suíte**

Run: `pnpm --filter @workspace/api-server run typecheck`
Expected: sem erro. Se o TypeScript reclamar da união dos três arrays, tipe
`panelSlides` com as mesmas chaves opcionais no `composeDeviceSlides` — não
adicione as colunas de campanha à query de painel.

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 7: Verificar na TV de verdade**

Com `./dev.sh` rodando, crie um painel pelo banco ou pela API, publique e abra
`http://localhost:5173/display/DEVICE_KEY` (use uma `deviceKey` existente).
Expected: as páginas do painel entram na rotação, sem nenhuma alteração em
`display.tsx`.

- [ ] **Step 8: Commit**

```bash
git add artifacts/api-server/src
git commit -m "feat(display): painéis publicados entram nas TVs do cliente"
```

---

### Task 10: Upload da foto da promoção

**Files:**
- Modify: `artifacts/api-server/src/routes/panels.ts`
- Test: `artifacts/api-server/src/routes/__tests__/panels-scope.test.ts`

**Interfaces:**
- Consumes: `mediaStore()` (`lib/storage`), `maxUploadBytes`, `uploadTooLargeMessage` (`lib/upload-limit`).
- Produces: `POST /portal/client/panels/:id/image` → `{ imageUrl: string }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente em `panels-scope.test.ts` (e mocke o storage no topo do arquivo):

```ts
const put = vi.fn();
vi.mock("../../lib/storage", () => ({ mediaStore: () => ({ put, remove: vi.fn() }) }));
```

```ts
  it("upload em painel de outro cliente recebe 403", async () => {
    panelClientId.mockResolvedValue(99);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels/5/image")
      .set("Cookie", cookie)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "foto.png");
    expect(res.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("upload de imagem devolve a URL do storage", async () => {
    panelClientId.mockResolvedValue(7);
    put.mockResolvedValue("/api/uploads/foto.png");
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels/5/image")
      .set("Cookie", cookie)
      .attach("image", Buffer.from([0x89, 0x50, 0x4e, 0x47]), "foto.png");
    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBe("/api/uploads/foto.png");
  });

  it("recusa arquivo que não é imagem", async () => {
    panelClientId.mockResolvedValue(7);
    const { request, app, cookie } = await agent();
    const res = await request(app)
      .post("/portal/client/panels/5/image")
      .set("Cookie", cookie)
      .attach("image", Buffer.from("texto"), { filename: "nota.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });
```

Lembre de resetar `put` no `beforeEach`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/api-server run test -- panels-scope`
Expected: FAIL — rota devolve 404.

- [ ] **Step 3: Implementar a rota**

Em `routes/panels.ts`:

```ts
import multer from "multer";
import { mediaStore } from "../lib/storage";
import { maxUploadBytes, uploadTooLargeMessage } from "../lib/upload-limit";

class NotAnImageError extends Error {}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes() },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new NotAnImageError("Envie um arquivo de imagem."));
      return;
    }
    cb(null, true);
  },
});

/** Traduz os erros do multer em resposta HTTP, como em announcements.ts. */
function uploadImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (err: unknown) => {
    if (err instanceof NotAnImageError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: uploadTooLargeMessage(maxUploadBytes()) });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}
```

E a rota, antes do `export default` — a ordem importa: autoriza **antes** de
gastar banda e storage com o arquivo.

```ts
router.post("/client/panels/:id/image", requirePanelAccess, uploadImage, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Nenhuma imagem enviada." });
    return;
  }
  const imageUrl = await mediaStore().put(req.file.buffer, req.file.mimetype, req.file.originalname);
  res.status(201).json({ imageUrl });
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test -- panels-scope`
Expected: PASS, 14 testes.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes
git commit -m "feat(panels): upload da foto da promoção"
```

---

### Task 11: Contrato OpenAPI e cliente gerado

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Generated: `lib/api-zod/src/generated/*`, `lib/api-client-react/src/generated/*`

**Interfaces:**
- Produces: hooks e schemas gerados pelo orval para as rotas de painéis, usados nas Tasks 12 e 13.

- [ ] **Step 1: Descrever os schemas no `openapi.yaml`**

Em `components.schemas`, seguindo o estilo dos schemas existentes:

```yaml
    PanelItem:
      type: object
      required: [id, panelId, name, priceCents, displayOrder, isActive]
      properties:
        id: { type: integer }
        panelId: { type: integer }
        name: { type: string }
        description: { type: string, nullable: true }
        priceCents: { type: integer, minimum: 0 }
        oldPriceCents: { type: integer, minimum: 0, nullable: true }
        category: { type: string, nullable: true }
        imageUrl: { type: string, nullable: true }
        displayOrder: { type: integer }
        isActive: { type: boolean }

    PanelItemInput:
      type: object
      required: [name, priceCents]
      properties:
        name: { type: string, minLength: 1, maxLength: 120 }
        description: { type: string, nullable: true }
        priceCents: { type: integer, minimum: 0 }
        oldPriceCents: { type: integer, minimum: 0, nullable: true }
        category: { type: string, nullable: true }
        imageUrl: { type: string, nullable: true }

    Panel:
      type: object
      required: [id, clientId, kind, name, template, status, duration, items]
      properties:
        id: { type: integer }
        clientId: { type: integer }
        kind: { type: string, enum: [menu, promo, notice] }
        name: { type: string }
        template: { type: string }
        status: { type: string, enum: [draft, published] }
        duration: { type: integer }
        headline: { type: string, nullable: true }
        body: { type: string, nullable: true }
        publishedAt: { type: string, format: date-time, nullable: true }
        items:
          type: array
          items: { $ref: '#/components/schemas/PanelItem' }

    CreatePanelRequest:
      type: object
      required: [kind, name, template]
      properties:
        kind: { type: string, enum: [menu, promo, notice] }
        name: { type: string, minLength: 1, maxLength: 80 }
        template: { type: string }
        clientId: { type: integer }

    UpdatePanelRequest:
      type: object
      properties:
        name: { type: string, minLength: 1, maxLength: 80 }
        template: { type: string }
        duration: { type: integer, minimum: 5, maximum: 60 }
        headline: { type: string, nullable: true }
        body: { type: string, nullable: true }

    ReplacePanelItemsRequest:
      type: object
      required: [items]
      properties:
        items:
          type: array
          maxItems: 200
          items: { $ref: '#/components/schemas/PanelItemInput' }

    PublishPanelResponse:
      type: object
      required: [status]
      properties:
        status: { type: string, enum: [draft, published] }
        pages: { type: integer }
```

- [ ] **Step 2: Descrever os paths**

```yaml
  /portal/client/panels:
    get:
      operationId: listClientPanels
      summary: Painéis do cliente autenticado
      responses:
        '200':
          description: Lista de painéis
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Panel' }
    post:
      operationId: createClientPanel
      summary: Cria um painel em rascunho
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreatePanelRequest' }
      responses:
        '201':
          description: Painel criado
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Panel' }

  /portal/client/panels/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
    get:
      operationId: getClientPanel
      responses:
        '200':
          description: Painel
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Panel' }
    patch:
      operationId: updateClientPanel
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdatePanelRequest' }
      responses:
        '200':
          description: Painel atualizado
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Panel' }
    delete:
      operationId: deleteClientPanel
      responses:
        '204':
          description: Removido

  /portal/client/panels/{id}/items:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
    put:
      operationId: replaceClientPanelItems
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ReplacePanelItemsRequest' }
      responses:
        '200':
          description: Itens salvos
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/PanelItem' }

  /portal/client/panels/{id}/publish:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
    post:
      operationId: publishClientPanel
      responses:
        '200':
          description: Painel publicado
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PublishPanelResponse' }
        '422':
          description: Conteúdo não pôde ser renderizado

  /portal/client/panels/{id}/image:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
    post:
      operationId: uploadClientPanelImage
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [image]
              properties:
                image: { type: string, format: binary }
      responses:
        '201':
          description: Imagem armazenada
          content:
            application/json:
              schema:
                type: object
                required: [imageUrl]
                properties:
                  imageUrl: { type: string }
        '413':
          description: Imagem acima do limite

  /portal/client/panels/{id}/unpublish:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
    post:
      operationId: unpublishClientPanel
      responses:
        '200':
          description: Painel fora do ar
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PublishPanelResponse' }
```

- [ ] **Step 3: Gerar o cliente**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: arquivos regenerados em `lib/api-zod/src/generated` e
`lib/api-client-react/src/generated`, typecheck das libs sem erro.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): contrato das rotas de painéis do cliente"
```

---

### Task 12: Lista de painéis no portal

**Files:**
- Create: `artifacts/signage/src/pages/portal-panels.tsx`
- Test: `artifacts/signage/src/pages/__tests__/portal-panels.test.tsx`
- Modify: `artifacts/signage/src/App.tsx`

**Interfaces:**
- Consumes: hooks gerados na Task 11 (`useListClientPanels`, `useCreateClientPanel`, `usePublishClientPanel`, `useUnpublishClientPanel`, `useDeleteClientPanel`).
- Produces: `export default function PortalPanels({ onEdit }: { onEdit: (panelId: number) => void })`.

- [ ] **Step 1: Escrever o teste que falha**

`artifacts/signage/src/pages/__tests__/portal-panels.test.tsx`, no estilo de
`portal-client.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import PortalPanels from '../portal-panels';

const panels = [
  { id: 1, clientId: 7, kind: 'menu', name: 'Cardápio da semana', template: 'menu-basico', status: 'published', duration: 10, headline: null, body: null, publishedAt: '2026-09-01T12:00:00Z', items: [] },
  { id: 2, clientId: 7, kind: 'promo', name: 'Pizza em dobro', template: 'promo-foto', status: 'draft', duration: 10, headline: null, body: null, publishedAt: null, items: [] },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalPanels onEdit={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('PortalPanels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(panels), { headers: { 'Content-Type': 'application/json' } })));
  });

  it('mostra cada painel com o estado', async () => {
    renderPage();
    expect(await screen.findByText('Cardápio da semana')).toBeInTheDocument();
    expect(screen.getByText('Pizza em dobro')).toBeInTheDocument();
    expect(screen.getByText(/No ar/i)).toBeInTheDocument();
    expect(screen.getByText(/Rascunho/i)).toBeInTheDocument();
  });

  it('erro de rede não vira lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })));
    renderPage();
    await waitFor(() => expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument());
  });

  it('cliente sem painel vê o convite para criar o primeiro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
    renderPage();
    expect(await screen.findByText(/nenhum painel/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage run test -- portal-panels`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar a página**

Requisitos concretos, seguindo os componentes já usados no portal (`Card`,
`Button`, `Empty`, `Skeleton` de `@/components/ui/*`):

- Cabeçalho com título "Meus painéis" e botões "Novo cardápio", "Nova promoção"
  e "Novo aviso", cada um chamando `createClientPanel` com o `kind` e o
  `template` correspondentes (`menu-basico`, `promo-foto`, `aviso-simples`) e,
  ao concluir, `onEdit(novoPainel.id)`.
- Um card por painel com: nome, tipo por extenso (Cardápio / Promoção / Aviso),
  badge de estado — `No ar desde <data pt-BR>` quando `status === 'published'`,
  `Rascunho` caso contrário — e a contagem de itens.
- Ações por card: "Editar" (`onEdit(panel.id)`), "Publicar" ou "Tirar do ar"
  conforme o estado, e "Apagar" com `AlertDialog` de confirmação.
- Erro de qualquer query mostra o bloco `Empty` com o texto
  "Não foi possível carregar seus painéis" e um botão "Tentar de novo" que
  refaz a busca — a mesma regra já documentada em `portal-advertiser.tsx`:
  falha de rede não pode virar lista vazia.
- Lista vazia mostra `Empty` com "Você ainda não tem nenhum painel".
- Resposta 422 do publish exibe um toast com a mensagem que a API devolveu
  (`error`), sem trocar o estado local do painel.
- Cliente sem nenhuma TV vinculada: consulte
  `api/portal/client/devices?days=30` (a rota que `portal-client.tsx` já usa) e,
  quando a lista voltar vazia, mostre um aviso permanente no topo — "Você ainda
  não tem TV vinculada; o painel fica salvo e entra no ar assim que houver
  uma". O botão publicar continua habilitado: a publicação é válida, só não tem
  onde aparecer ainda.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage run test -- portal-panels`
Expected: PASS, 3 testes.

- [ ] **Step 5: Ligar as abas na área do cliente**

Em `artifacts/signage/src/App.tsx`, o portal não usa rotas — `PortalSwitch`
alterna por estado. Crie a área do cliente com duas abas, mantendo o padrão de
botão com borda inferior já usado ali:

```tsx
function ClientArea() {
  const [tab, setTab] = useState<'desempenho' | 'paineis'>('desempenho');
  const [editingPanelId, setEditingPanelId] = useState<number | null>(null);

  if (editingPanelId !== null) {
    return <PortalPanelEditor panelId={editingPanelId} onBack={() => setEditingPanelId(null)} />;
  }

  return (
    <>
      <div className="mb-4 flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setTab('desempenho')}
          className={`px-3 py-2 text-sm ${tab === 'desempenho' ? 'border-b-2 border-primary font-semibold text-primary' : 'text-muted-foreground'}`}
        >
          Desempenho
        </button>
        <button
          type="button"
          onClick={() => setTab('paineis')}
          className={`px-3 py-2 text-sm ${tab === 'paineis' ? 'border-b-2 border-primary font-semibold text-primary' : 'text-muted-foreground'}`}
        >
          Meus painéis
        </button>
      </div>
      {tab === 'desempenho' ? <PortalClient /> : <PortalPanels onEdit={setEditingPanelId} />}
    </>
  );
}
```

E em `PortalSwitch`, troque `<PortalClient />` por `<ClientArea />` na linha
`{view === 'client' && isClient ? ... : null}`. Importe `PortalPanels` e
`PortalPanelEditor` no topo do arquivo.

- [ ] **Step 6: Verificar tipos e suíte**

Run: `pnpm --filter @workspace/signage run typecheck && pnpm --filter @workspace/signage run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts/signage/src
git commit -m "feat(portal): lista de painéis do cliente"
```

---

### Task 13: Editor e pré-visualização

**Files:**
- Create: `artifacts/signage/src/pages/portal-panel-editor.tsx`, `artifacts/signage/src/components/portal/panel-preview.tsx`
- Test: `artifacts/signage/src/components/portal/__tests__/panel-preview.test.tsx`, `artifacts/signage/src/pages/__tests__/portal-panel-editor.test.tsx`

**Interfaces:**
- Consumes: hooks gerados (Task 11); `PortalPanels` chama `onEdit(panelId)` (Task 12).
- Produces: `export default function PortalPanelEditor({ panelId, onBack }: { panelId: number; onBack: () => void })` e
  `export function PanelPreview({ kind, headline, body, items, page }: PanelPreviewProps)`.

**Nota de escopo:** a pré-visualização é uma segunda implementação do visual,
assumida e limitada. Ela mostra quebra de página e o que não cabe. Não persiga
igualdade pixel a pixel com o PNG; o que vai ao ar é sempre o servidor.

- [ ] **Step 1: Escrever o teste da pré-visualização**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelPreview } from '../panel-preview';

const item = (name: string, priceCents: number) => ({
  name, description: null, priceCents, oldPriceCents: null, category: 'Lanches', imageUrl: null,
});

describe('PanelPreview', () => {
  it('mostra preço formatado em real', () => {
    render(<PanelPreview kind="menu" headline={null} body={null} items={[item('Coxinha', 750)]} page={1} />);
    expect(screen.getByText('R$ 7,50')).toBeInTheDocument();
  });

  it('mostra o preço antigo riscado na promoção', () => {
    render(
      <PanelPreview
        kind="promo"
        headline="Oferta"
        body={null}
        items={[{ ...item('Pizza', 4990), oldPriceCents: 6990 }]}
        page={1}
      />,
    );
    expect(screen.getByText('R$ 69,90')).toHaveClass('line-through');
  });

  it('aviso mostra headline e corpo, sem preço', () => {
    render(<PanelPreview kind="notice" headline="Aceitamos Pix" body="Chave no balcão" items={[]} page={1} />);
    expect(screen.getByText('Aceitamos Pix')).toBeInTheDocument();
    expect(screen.getByText('Chave no balcão')).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage run test -- panel-preview`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar `panel-preview.tsx`**

Requisitos concretos:

- Contêiner com `aspect-[16/9] w-full overflow-hidden rounded-lg` e as mesmas
  cores do template do servidor (fundo `#0B1120`, texto `#F8FAFC`, destaque
  `#FBBF24`).
- `menu`: título da categoria em caixa alta seguido das linhas nome/preço.
- `promo`: headline, nome grande, preço antigo com classe `line-through` quando
  houver `oldPriceCents`, preço atual em destaque, foto quando `imageUrl`.
- `notice`: headline grande e corpo abaixo.
- Preço formatado por uma função local
  `formatPriceBRL(cents: number)` usando
  `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)`
  com o espaço rígido trocado por espaço comum — mesma regra do servidor.

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage run test -- panel-preview`
Expected: PASS, 3 testes.

- [ ] **Step 5: Escrever o teste do editor**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortalPanelEditor from '../portal-panel-editor';

const panel = {
  id: 1, clientId: 7, kind: 'menu', name: 'Cardápio', template: 'menu-basico',
  status: 'draft', duration: 10, headline: null, body: null, publishedAt: null,
  items: [
    { id: 1, panelId: 1, name: 'Coxinha', description: null, priceCents: 750, oldPriceCents: null, category: 'Lanches', imageUrl: null, displayOrder: 0, isActive: true },
  ],
};

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalPanelEditor panelId={1} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('PortalPanelEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(panel), { headers: { 'Content-Type': 'application/json' } })));
  });

  it('carrega os itens existentes na tabela', async () => {
    renderEditor();
    expect(await screen.findByDisplayValue('Coxinha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7,50')).toBeInTheDocument();
  });

  it('adiciona uma linha vazia ao clicar em adicionar item', async () => {
    renderEditor();
    await screen.findByDisplayValue('Coxinha');
    await userEvent.click(screen.getByRole('button', { name: /adicionar item/i }));
    await waitFor(() => expect(screen.getAllByPlaceholderText(/nome do item/i)).toHaveLength(2));
  });

  it('preço digitado vira centavos no corpo enviado', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(panel), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    await screen.findByDisplayValue('Coxinha');
    await userEvent.clear(screen.getByDisplayValue('7,50'));
    await userEvent.type(screen.getByPlaceholderText(/pre[çc]o/i), '12,90');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse((put![1] as RequestInit).body as string).items[0].priceCents).toBe(1290);
    });
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `pnpm --filter @workspace/signage run test -- portal-panel-editor`
Expected: FAIL — módulo inexistente.

- [ ] **Step 7: Implementar o editor**

Requisitos concretos:

- Cabeçalho com botão "Voltar" (`onBack`), o nome do painel editável e o campo
  de duração (5 a 60 segundos).
- `kind === 'menu'`: tabela de linhas com campos nome (placeholder
  "Nome do item"), categoria, preço (placeholder "Preço", máscara pt-BR) e
  botões remover e reordenar; botão "Adicionar item" acrescenta linha vazia.
- `kind === 'promo'`: um bloco com nome, descrição, preço, preço antigo e
  upload de foto (`POST /portal/client/panels/:id/image`, campo `image`),
  mostrando a foto enviada.
- `kind === 'notice'`: campos headline e corpo.
- Botão "Salvar" envia `PATCH` (nome, duração, headline, corpo) e `PUT` dos
  itens. Preço digitado em texto pt-BR vira centavos com uma função local
  `parsePriceToCents(raw: string): number` que remove tudo que não é dígito e
  interpreta os dois últimos como centavos — `"12,90"` e `"1290"` viram `1290`.
- Botão "Publicar" chama a rota e, em 422, mostra a mensagem da API num toast.
- `PanelPreview` ao lado, alimentada pelo estado local do formulário, com
  navegação de página quando o cardápio gerar mais de uma.

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm --filter @workspace/signage run test -- portal-panel-editor`
Expected: PASS, 3 testes.

- [ ] **Step 9: Commit**

```bash
git add artifacts/signage/src
git commit -m "feat(portal): editor de painéis com pré-visualização"
```

---

### Task 14: Peça gerada não é editável no admin

**Files:**
- Modify: `artifacts/api-server/src/routes/announcements.ts`, `artifacts/signage/src/pages/admin.tsx`, `lib/api-spec/openapi.yaml`
- Test: `artifacts/api-server/src/routes/__tests__/panels-scope.test.ts` (novo arquivo `announcement-source.test.ts` se ficar mais claro)

**Interfaces:**
- Consumes: coluna `announcements.source` (Task 1).
- Produces: campo `source` no schema `Announcement` do OpenAPI e no JSON das
  rotas de listagem e detalhe.

- [ ] **Step 1: Expor `source` na API**

Em `routes/announcements.ts`, abra `GET /announcements` (linha 140) e
`GET /announcements/:id` (linha 243). Se o `select` lista colunas
explicitamente, acrescente `source: announcementsTable.source`; se usa
`db.select().from(announcementsTable)` sem projeção, a coluna já vem e não há o
que mudar. Acrescente `source` ao schema `Announcement` em `openapi.yaml`:

```yaml
        source:
          type: string
          enum: [admin, panel]
```

Regenere: `pnpm --filter @workspace/api-spec run codegen`.

- [ ] **Step 2: Escrever o teste que falha (bloqueio de edição)**

Crie `artifacts/api-server/src/routes/__tests__/announcement-source.test.ts`
mockando a camada de dados como em `panels-scope.test.ts` e cubra:

- `PATCH /announcements/:id` numa peça com `source: 'panel'` responde 409 com
  a mensagem "Peça gerada por painel do cliente. Edite o painel." e não escreve.
- `PATCH` numa peça com `source: 'admin'` continua funcionando (200).
- `DELETE` numa peça com `source: 'panel'` responde 409 e não apaga — apagar a
  peça sozinha deixaria `panel_slides` apontando para nada e o painel marcado
  como publicado.

Run: `pnpm --filter @workspace/api-server run test -- announcement-source`
Expected: FAIL.

- [ ] **Step 3: Implementar o bloqueio**

Nas rotas `PATCH /announcements/:id`, `PATCH /announcements/:id/toggle` e
`DELETE /announcements/:id`, carregue a peça antes e recuse quando
`source === 'panel'`:

```ts
    if (existing.source === "panel") {
      // Editar o PNG gerado quebraria a relação com o cadastro que o produziu.
      // A ação certa é despublicar o painel no portal do cliente.
      res.status(409).json({ error: "Peça gerada por painel do cliente. Edite o painel." });
      return;
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @workspace/api-server run test`
Expected: PASS.

- [ ] **Step 5: Marcar na tela do admin**

Em `artifacts/signage/src/pages/admin.tsx`, para cada peça com
`source === 'panel'`: mostre um badge "Painel do cliente" e desabilite os
botões de editar e apagar, com `title` explicando que a peça é gerada e sai
pelo portal do cliente.

- [ ] **Step 6: Verificar**

Run: `pnpm run typecheck`
Expected: sem erro.

Run: `pnpm --filter @workspace/signage run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add artifacts lib/api-spec lib/api-zod lib/api-client-react
git commit -m "feat(admin): peça gerada por painel não é editável"
```

---

### Task 15: Documentação e validação de ponta a ponta

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Documentar no README**

Em "Arquitetura funcional", acrescente:

```markdown
- **Painéis do cliente** são cardápios, promoções e avisos que o próprio
  lojista cadastra no portal. Publicar renderiza cada página no servidor
  (satori + resvg-wasm) como PNG 1920×1080, grava no App Storage e materializa
  uma peça com `source='panel'`. Os painéis publicados entram automaticamente
  em todas as TVs daquele cliente — o vínculo é `panels.client_id` =
  `devices.client_id`, não `device_playlist`, para que uma TV nova já nasça com
  o cardápio no ar.
- Peças com `source='panel'` não são editáveis no painel de gestão: a fonte da
  verdade é o cadastro do painel. Para tirar do ar, despublique o painel.
```

Em "Validação", acrescente:

```markdown
Testes do frontend (portal, pré-visualização e editor de painéis):

```bash
pnpm --filter @workspace/signage run test
```
```

- [ ] **Step 2: Validar o workspace inteiro**

Run: `pnpm run typecheck`
Expected: sem erro.

Run: `pnpm --filter @workspace/api-server run test && pnpm --filter @workspace/signage run test`
Expected: PASS nos dois.

Run: `PORT=8081 BASE_PATH=/ pnpm run build`
Expected: sucesso.

Run: `pnpm --filter @workspace/api-server run build:vercel`
Expected: sucesso, sem "unresolvable top-level imports".

- [ ] **Step 3: Passo manual de ponta a ponta**

Com `./dev.sh`:
1. Entre no portal com um usuário vinculado a um cliente que tenha TV.
2. Aba "Meus painéis" → "Novo cardápio" → adicione 10 itens em duas categorias.
3. Salve e publique. Confirme a mensagem de sucesso com o número de páginas.
4. Abra `/display/DEVICE_KEY` e confirme as páginas do cardápio na rotação.
5. Edite um preço, republique e confirme que a TV mostra o novo valor após o
   refetch de 60 s.
6. "Tirar do ar" e confirme que as páginas somem da rotação.
7. No admin, confirme que a peça aparece marcada como painel do cliente e com
   editar e apagar desabilitados.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: painéis do cliente no README"
```

- [ ] **Step 5: Deploy de preview antes de produção**

Run: `pnpm dlx vercel@latest deploy`
Verifique no preview: publicar um painel funciona (é onde fonte e wasm
embutidos são exercitados de verdade) e `/api/healthz` responde. Só então
promova para produção, lembrando de aplicar o schema:
`pnpm --filter @workspace/db run push` com a `DATABASE_URL` pooled de produção.
