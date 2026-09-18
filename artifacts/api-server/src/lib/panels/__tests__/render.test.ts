import zlib from "node:zlib";
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
  it("tabela de preços vira PNG 1920x1080", async () => {
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

  const PIXEL_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  /**
   * PNG 1x2 (vermelho em cima, azul embaixo): um pixel só não muda de
   * aparência com objectPosition nenhum, então o teste de enquadramento
   * precisa de uma imagem com o que recortar. Montada à mão porque o projeto
   * não tem uma lib de PNG entre as dependências.
   */
  function twoPixelPng(): string {
    function crc32(buf: Buffer): number {
      let c = 0xffffffff;
      for (const byte of buf) {
        c ^= byte;
        for (let i = 0; i < 8; i++) {
          c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
        }
      }
      return (c ^ 0xffffffff) >>> 0;
    }
    function chunk(type: string, data: Buffer): Buffer {
      const typeBuf = Buffer.from(type, "ascii");
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
      return Buffer.concat([len, typeBuf, data, crcBuf]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0); // width
    ihdr.writeUInt32BE(2, 4); // height
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: RGB
    const raw = Buffer.concat([
      Buffer.from([0, 255, 0, 0]), // filtro 0 + vermelho
      Buffer.from([0, 0, 0, 255]), // filtro 0 + azul
    ]);
    const idat = zlib.deflateSync(raw);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const png = Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
    return `data:image/png;base64,${png.toString("base64")}`;
  }

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

  it("photoOffset 0, 50 e 100 geram PNGs diferentes entre si", async () => {
    const photo = twoPixelPng();
    const renderWith = (photoOffset: number) =>
      renderPanelPage(
        { kind: "promo", headline: null, body: null, accentColor: "#D63A6A", promoStyle: "price", photoOffset },
        { category: null, items: [{ ...item("Cheesecake", 899), oldPriceCents: null, imageUrl: photo }] },
      );
    const [top, center, bottom] = await Promise.all([renderWith(0), renderWith(50), renderWith(100)]);
    expect(top.equals(center)).toBe(false);
    expect(center.equals(bottom)).toBe(false);
    expect(top.equals(bottom)).toBe(false);
  });

  /**
   * PNG 2x1 (vermelho à esquerda, azul à direita): mesma ideia de
   * `twoPixelPng`, só que a variação é horizontal, para testar photoOffsetX.
   */
  function twoPixelWidePng(): string {
    function crc32(buf: Buffer): number {
      let c = 0xffffffff;
      for (const byte of buf) {
        c ^= byte;
        for (let i = 0; i < 8; i++) {
          c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
        }
      }
      return (c ^ 0xffffffff) >>> 0;
    }
    function chunk(type: string, data: Buffer): Buffer {
      const typeBuf = Buffer.from(type, "ascii");
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const crcBuf = Buffer.alloc(4);
      crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
      return Buffer.concat([len, typeBuf, data, crcBuf]);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0); // width
    ihdr.writeUInt32BE(1, 4); // height
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: RGB
    const raw = Buffer.concat([
      Buffer.from([0, 255, 0, 0, 0, 0, 255]), // filtro 0 + vermelho + azul, uma linha só
    ]);
    const idat = zlib.deflateSync(raw);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const png = Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
    return `data:image/png;base64,${png.toString("base64")}`;
  }

  it("photoOffsetX 0, 50 e 100 geram PNGs diferentes entre si", async () => {
    const photo = twoPixelWidePng();
    const renderWith = (photoOffsetX: number) =>
      renderPanelPage(
        { kind: "promo", headline: null, body: null, accentColor: "#D63A6A", promoStyle: "price", photoOffsetX },
        { category: null, items: [{ ...item("Cheesecake", 899), oldPriceCents: null, imageUrl: photo }] },
      );
    const [left, center, right] = await Promise.all([renderWith(0), renderWith(50), renderWith(100)]);
    expect(left.equals(center)).toBe(false);
    expect(center.equals(right)).toBe(false);
    expect(left.equals(right)).toBe(false);
  });

  it.each([
    ["0", 0],
    ["100", 100],
  ])(
    "foto quadrada/vertical com photoOffsetX %s (sem sobra de cover no eixo X) ainda renderiza 1920x1080 sem lançar",
    async (_caso, photoOffsetX) => {
      // Imagem vertical (1x2): com object-fit cover numa área mais larga que
      // alta, o cover escala pela largura e sobra altura — o eixo X não tem
      // sobra nenhuma. Antes da translação, objectPosition nesse eixo não
      // movia nada; é exatamente o caso que a troca por translate corrige,
      // mesmo que o resultado passe a mostrar o fundo claro na faixa.
      const photo = twoPixelPng();
      const png = await renderPanelPage(
        { kind: "promo", headline: null, body: null, accentColor: "#D63A6A", promoStyle: "price", photoOffsetX },
        { category: null, items: [{ ...item("Cheesecake", 899), oldPriceCents: null, imageUrl: photo }] },
      );
      expect(pngSize(png)).toEqual({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
    },
  );

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

  it("smoke: tabela de preços com uma página cheia de itens descritos renderiza sem lançar", async () => {
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
