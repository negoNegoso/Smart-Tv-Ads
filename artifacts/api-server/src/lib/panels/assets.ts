import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger";

// Sob esbuild estes imports viram Uint8Array embutidos (loader "binary").
// Sob vitest eles falham, e o catch lê o mesmo arquivo do disco.
//
// São dois layouts possíveis, e o fallback precisa achar os dois. Rodando do
// código-fonte (vitest), este arquivo está em src/lib/panels e os assets ficam
// três níveis acima. Rodando do bundle, o `__dirname` é o diretório do próprio
// index.mjs e o build copia os assets para lá. Antes daqui só o primeiro caso
// era considerado, e em produção o caminho virava `/assets/...` na raiz do
// sistema — um ENOENT que não dizia nada a quem lia.
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIRS = [path.join(moduleDir, "assets"), path.resolve(moduleDir, "../../../assets")];

function readFromDisk(relative: string): Buffer {
  let lastError: unknown;
  for (const dir of ASSET_DIRS) {
    try {
      return readFileSync(path.join(dir, relative));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function bytes(bundled: () => Promise<{ default: Uint8Array }>, relative: string): Promise<Buffer> {
  try {
    const mod = await bundled();
    // Sob esbuild o loader "binary" resolve para um Uint8Array de verdade.
    // Sob vitest (Vite por baixo) uma extensão desconhecida não lança: ela
    // resolve para uma string de URL do asset. Tratamos qualquer coisa que
    // não seja Uint8Array como "não embutido" e caímos no disco.
    if (!(mod.default instanceof Uint8Array)) throw new Error("asset não embutido");
    return Buffer.from(mod.default);
  } catch (embeddedError) {
    // Sob vitest isto é o caminho esperado (ver comentário acima) e a leitura
    // em disco sempre resolve — sem log, para não treinar quem lê os testes a
    // ignorar erro. Sob esbuild não deveria acontecer nunca; se acontecer E a
    // leitura em disco também falhar, aí sim é uma regressão de bundling de
    // verdade (o asset não está embutido nem existe no disco do ambiente de
    // produção) e precisa aparecer alto, não como mais um fallback silencioso.
    try {
      return readFromDisk(relative);
    } catch (diskError) {
      logger.error(
        { err: diskError, embeddedError, relative, dirs: ASSET_DIRS },
        "Asset não está embutido nem foi encontrado em disco",
      );
      throw diskError;
    }
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
