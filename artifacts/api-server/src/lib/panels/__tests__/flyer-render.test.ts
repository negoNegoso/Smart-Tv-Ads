import { describe, expect, it } from "vitest";
import { renderFlyerPage } from "../render";

/** Lê largura e altura do cabeçalho IHDR de um PNG (bytes 16..24). */
function pngSize(buffer: Buffer): { width: number; height: number } {
  const signature = buffer.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const store = (over = {}) => ({
  name: "Mercado Bom Preço",
  logoUrl: null,
  openingHours: "Seg a sáb 8h às 20h30\nDom 8h às 13h",
  address: "Rua A, 10 - Centro, Taubaté/SP",
  brandColor: null,
  brandAccentColor: null,
  ...over,
});
const item = (i: number, over = {}) => ({
  name: `Produto número ${i}`,
  priceCents: 999,
  oldPriceCents: null,
  unit: "UNIDADE",
  imageUrl: null,
  ...over,
});
const input = (over = {}) => ({ headline: null, body: null, store: store(), validity: null, ...over });

describe("renderFlyerPage", () => {
  it("capa horizontal vira PNG 1920x1080", async () => {
    const page = { pageNo: 1, isCover: true, featured: [1, 2, 3].map((i) => item(i)), grid: [4, 5, 6, 7].map((i) => item(i)) };
    expect(pngSize(await renderFlyerPage(input(), page, 3, "landscape"))).toEqual({ width: 1920, height: 1080 });
  });

  it("capa vertical vira PNG 1080x1920", async () => {
    const page = { pageNo: 1, isCover: true, featured: [1, 2, 3].map((i) => item(i)), grid: [4, 5, 6, 7, 8, 9].map((i) => item(i)) };
    expect(pngSize(await renderFlyerPage(input(), page, 2, "portrait"))).toEqual({ width: 1080, height: 1920 });
  });

  it("miolo cheio nas duas orientações", async () => {
    const land = { pageNo: 2, isCover: false, featured: [], grid: Array.from({ length: 8 }, (_, i) => item(i)) };
    const port = { pageNo: 2, isCover: false, featured: [], grid: Array.from({ length: 10 }, (_, i) => item(i)) };
    expect(pngSize(await renderFlyerPage(input(), land, 2, "landscape")).width).toBe(1920);
    expect(pngSize(await renderFlyerPage(input(), port, 2, "portrait")).height).toBe(1920);
  });

  it("aguenta foto, logo, validade, preço de 7 dígitos, preço antigo e nome de 40+ caracteres", async () => {
    const page = {
      pageNo: 1,
      isCover: true,
      featured: [item(1, { imageUrl: PIXEL_PNG, priceCents: 123456789, oldPriceCents: 199999999, name: "X".repeat(60) })],
      grid: [item(2, { imageUrl: PIXEL_PNG, unit: null })],
    };
    const png = await renderFlyerPage(
      input({ headline: "Aqui sua satisfação é nossa prioridade!", validity: "OFERTAS VÁLIDAS DE 20/09 A 27/09", store: store({ logoUrl: PIXEL_PNG }) }),
      page,
      1,
      "landscape",
    );
    expect(pngSize(png)).toEqual({ width: 1920, height: 1080 });
  });

  it("sem horário, endereço e logo não lança", async () => {
    const page = { pageNo: 1, isCover: true, featured: [], grid: [item(1)] };
    const png = await renderFlyerPage(
      input({ store: store({ openingHours: null, address: null }) }),
      page,
      1,
      "portrait",
    );
    expect(pngSize(png).height).toBe(1920);
  });
});
