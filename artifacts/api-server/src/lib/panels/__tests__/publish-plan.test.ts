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
