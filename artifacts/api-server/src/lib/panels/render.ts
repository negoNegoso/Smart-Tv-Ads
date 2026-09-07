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
