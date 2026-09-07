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
