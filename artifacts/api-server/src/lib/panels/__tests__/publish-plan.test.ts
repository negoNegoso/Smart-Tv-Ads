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
    const pages = panelPages({ ...base, kind: "menu", items });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.items)).toHaveLength(17);
  });

  it("linha com descrição é mais alta, então o mesmo cardápio rende mais páginas", () => {
    // O corte é por altura: descrever os itens engorda cada linha e o mesmo
    // número de itens deixa de caber nas mesmas telas.
    const items = Array.from({ length: 17 }, (_, i) => item(`Item ${i}`, i));
    const descritos = items.map((i) => ({ ...i, description: "Descrição do item" }));
    expect(panelPages({ ...base, kind: "menu", items: descritos }).length).toBeGreaterThan(
      panelPages({ ...base, kind: "menu", items }).length,
    );
  });

  it("cardápio sem item ativo não rende página nenhuma", () => {
    const items = [{ ...item("Fora", 1), isActive: false }];
    expect(panelPages({ ...base, kind: "menu", items })).toEqual([]);
  });
});
