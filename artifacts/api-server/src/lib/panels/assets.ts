import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Sob esbuild estes imports viram Uint8Array embutidos (loader "binary").
// Sob vitest eles falham, e o catch lê o mesmo arquivo do disco.
const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../assets");

async function bytes(bundled: () => Promise<{ default: Uint8Array }>, relative: string): Promise<Buffer> {
  try {
    const mod = await bundled();
    // Sob esbuild o loader "binary" resolve para um Uint8Array de verdade.
    // Sob vitest (Vite por baixo) uma extensão desconhecida não lança: ela
    // resolve para uma string de URL do asset. Tratamos qualquer coisa que
    // não seja Uint8Array como "não embutido" e caímos no disco.
    if (!(mod.default instanceof Uint8Array)) throw new Error("asset não embutido");
    return Buffer.from(mod.default);
  } catch {
    return readFileSync(path.join(assetsDir, relative));
  }
}

export async function panelFonts(): Promise<
  Array<{
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
  }>
> {
  const [regular, bold] = await Promise.all([
    bytes(() => import("../../../assets/fonts/Inter-Regular.ttf") as never, "fonts/Inter-Regular.ttf"),
    bytes(() => import("../../../assets/fonts/Inter-Bold.ttf") as never, "fonts/Inter-Bold.ttf"),
  ]);
  const toArrayBuffer = (b: Buffer): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return [
    { name: "Inter", data: toArrayBuffer(regular), weight: 400, style: "normal" },
    { name: "Inter", data: toArrayBuffer(bold), weight: 700, style: "normal" },
  ];
}

export async function resvgWasm(): Promise<ArrayBuffer> {
  const b = await bytes(() => import("../../../assets/resvg.wasm") as never, "resvg.wasm");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
