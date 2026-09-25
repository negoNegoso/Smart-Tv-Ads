import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, clientsTable: {}, companiesTable: {}, campaignsTable: {}, advertisersTable: {} }));
const { buildFlyerInput, toFlyerItem } = await import("../flyer-context");

const company = {
  name: "Mercado", logoUrl: "https://x/logo.png", openingHours: "8h às 20h",
  brandColor: "#112233", brandAccentColor: null,
  street: "Rua A", number: "10", district: null, city: "Taubaté", state: "SP",
};

describe("buildFlyerInput", () => {
  it("destino loja: sem validade", () => {
    const input = buildFlyerInput({ headline: "Semana", body: null }, { company, campaign: null }, null);
    expect(input.validity).toBeNull();
    expect(input.store).toMatchObject({ name: "Mercado", logoUrl: null, address: "Rua A, 10, Taubaté/SP", brandColor: "#112233" });
  });

  it("destino campanha: validade das datas da campanha", () => {
    const campaign = { id: 3, startsAt: new Date("2026-09-20T12:00:00Z"), endsAt: new Date("2026-09-27T12:00:00Z") };
    const input = buildFlyerInput({ headline: null, body: null }, { company, campaign }, "data:image/png;base64,AA");
    expect(input.validity).toBe("OFERTAS VÁLIDAS DE 20/09 A 27/09");
    expect(input.store.logoUrl).toBe("data:image/png;base64,AA");
  });
});

describe("toFlyerItem", () => {
  it("normaliza unidade e usa a foto resolvida", () => {
    const item = { id: 1, panelId: 1, name: "Arroz", description: null, priceCents: 2199, oldPriceCents: null, category: null, imageUrl: "https://x/a.png", displayOrder: 0, isActive: true, unit: " kg", featured: true };
    expect(toFlyerItem(item, null)).toEqual({ name: "Arroz", priceCents: 2199, oldPriceCents: null, unit: "KG", imageUrl: null });
  });
});
