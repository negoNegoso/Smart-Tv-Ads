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

  it("smoke: cardápio com uma página cheia de itens descritos renderiza sem lançar", async () => {
    // Isto NÃO é uma guarda de overflow: satori recebe width/height fixos e o
    // resvg rasteriza com fitTo de largura fixa, então o PNG sai 1920x1080
    // mesmo que o conteúdo estoure o quadro. Este teste só garante que o
    // caminho de itens descritos não lança exceção (ex.: nó satori
    // malformado). A guarda de overflow de verdade está em
    // `menu-layout.test.ts`, que mede as caixas que o satori desenhou.
    const items = Array.from({ length: 8 }, (_, i) => ({
      name: `Item ${i + 1}`,
      description: "Descrição curta do item para preencher a segunda linha",
      priceCents: 1000 + i * 100,
      oldPriceCents: null,
      imageUrl: null,
    }));
    const png = await renderPanelPage(
      { kind: "menu", headline: null, body: null },
      { category: "Lanches", items },
    );
    expect(pngSize(png)).toEqual({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
  });
});
