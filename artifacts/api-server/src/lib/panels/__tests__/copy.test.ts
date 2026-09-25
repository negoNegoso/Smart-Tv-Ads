import { describe, expect, it } from "vitest";
import type { Panel, PanelItem } from "@workspace/db";
import { itemCopyValues, panelCopyValues } from "../copy";

const basePanel: Panel = {
  id: 5,
  clientId: 7,
  kind: "promo",
  name: "Promoção de sexta",
  template: "promo-foto",
  status: "published",
  duration: 15,
  headline: "Só hoje",
  body: "Enquanto durar o estoque",
  accentColor: "#FF0000",
  promoStyle: "percent",
  photoOffset: 30,
  photoOffsetX: 70,
  campaignId: null,
  artOutdated: false,
  publishedAt: new Date("2026-09-01T12:00:00Z"),
  createdAt: new Date("2026-08-01T12:00:00Z"),
  updatedAt: new Date("2026-09-01T12:00:00Z"),
};

const published = basePanel;

const baseItem: PanelItem = {
  id: 90,
  panelId: 5,
  name: "Pizza",
  description: null,
  priceCents: 4990,
  oldPriceCents: 5990,
  category: "Salgadas",
  imageUrl: "/media/pizza.png",
  unit: null,
  featured: false,
  displayOrder: 2,
  isActive: true,
};

describe("panelCopyValues", () => {
  it("leva o conteúdo para a loja de destino", () => {
    expect(panelCopyValues(published, 8)).toEqual({
      clientId: 8,
      kind: "promo",
      name: "Promoção de sexta",
      template: "promo-foto",
      duration: 15,
      headline: "Só hoje",
      body: "Enquanto durar o estoque",
      accentColor: "#FF0000",
      promoStyle: "percent",
      photoOffset: 30,
      photoOffsetX: 70,
      campaignId: null,
      artOutdated: false,
    });
  });

  it("não leva id, status nem data de publicação: a cópia nasce rascunho", () => {
    const values = panelCopyValues(published, 8);
    expect(values).not.toHaveProperty("id");
    expect(values).not.toHaveProperty("status");
    expect(values).not.toHaveProperty("publishedAt");
  });

  it("encarte copiado não leva a campanha da loja de origem", () => {
    const source = { ...basePanel, kind: "flyer", campaignId: 3, artOutdated: true };
    const values = panelCopyValues(source as never, 42);
    expect(values.campaignId).toBeNull();
    expect(values.artOutdated).toBe(false);
  });
});

describe("itemCopyValues", () => {
  it("aponta os itens para o painel novo mantendo ordem, preço e foto", () => {
    const item: PanelItem = {
      id: 90,
      panelId: 5,
      name: "Pizza",
      description: null,
      priceCents: 4990,
      oldPriceCents: 5990,
      category: "Salgadas",
      imageUrl: "/media/pizza.png",
      unit: null,
      featured: false,
      displayOrder: 2,
      isActive: true,
    };
    expect(itemCopyValues([item], 20)).toEqual([
      {
        panelId: 20,
        name: "Pizza",
        description: null,
        priceCents: 4990,
        oldPriceCents: 5990,
        category: "Salgadas",
        imageUrl: "/media/pizza.png",
        unit: null,
        featured: false,
        displayOrder: 2,
        isActive: true,
      },
    ]);
  });

  it("itens copiados levam unidade e destaque", () => {
    const [item] = itemCopyValues([{ ...baseItem, unit: "KG", featured: true }] as never, 5);
    expect(item).toMatchObject({ unit: "KG", featured: true, panelId: 5 });
  });
});
