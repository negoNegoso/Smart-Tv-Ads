import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Fontes e binário do resvg entram no bundle como bytes (ver os loaders em
 * build.mjs), então nada é lido do disco em produção — a função da Vercel é um
 * arquivo só, sem node_modules e sem a pasta assets.
 *
 * Sob vitest os imports binários não existem, então o fallback lê do disco.
 * O caminho é relativo a este arquivo, não ao cwd.
 */
const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../assets");

function load(relative: string): Buffer {
  return readFileSync(path.join(assetsDir, relative));
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export function panelFonts(): Array<{
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}> {
  return [
    { name: "Inter", data: toArrayBuffer(load("fonts/Inter-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Inter", data: toArrayBuffer(load("fonts/Inter-Bold.ttf")), weight: 700, style: "normal" },
  ];
}

export function resvgWasm(): ArrayBuffer {
  return toArrayBuffer(load("resvg.wasm"));
}
