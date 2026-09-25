import satori from "satori";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { panelFonts, resvgWasm } from "./assets";
import { panelPageNode, type RenderItem, type RenderPanel } from "./templates";
import { flyerNode, flyerSize, type FlyerRenderInput, type FlyerRenderItem } from "./flyer-template";
import type { FlyerOrientation, FlyerPage } from "./flyer-paginate";

export const PANEL_WIDTH = 1920;
export const PANEL_HEIGHT = 1080;

// initWasm falha se chamado duas vezes; a promessa memoizada serve tanto o
// processo longo do Replit quanto a instância reaproveitada da Vercel.
let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) {
    wasmReady = resvgWasm()
      .then((wasm) => initWasm(wasm))
      .catch((err) => {
        // Se resvgWasm ou initWasm falhar (ex.: hiccup transitório no cold
        // start), o resvg fica com `initialized = false` internamente —
        // então limpamos o memo para a próxima chamada tentar de novo, em
        // vez de todo render futuro nesse processo falhar para sempre.
        wasmReady = null;
        throw err;
      });
  }
  return wasmReady;
}

async function rasterize(tree: unknown, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as never, { width, height, fonts: await panelFonts() });
  await ensureWasm();
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return Buffer.from(resvg.render().asPng());
}

export async function renderPanelPage(
  panel: RenderPanel,
  page: { category: string | null; items: RenderItem[] },
): Promise<Buffer> {
  return rasterize(panelPageNode(panel, page), PANEL_WIDTH, PANEL_HEIGHT);
}

/** Página do encarte: 1920×1080 deitada ou 1080×1920 em pé. */
export async function renderFlyerPage(
  input: FlyerRenderInput,
  page: FlyerPage<FlyerRenderItem>,
  pageCount: number,
  orientation: FlyerOrientation,
): Promise<Buffer> {
  const { width, height } = flyerSize(orientation);
  return rasterize(flyerNode(input, page, pageCount, orientation), width, height);
}

export type { RenderItem, RenderPanel, FlyerRenderInput, FlyerRenderItem };
