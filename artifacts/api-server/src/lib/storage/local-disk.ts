import fs from "node:fs";
import path from "node:path";
import type { MediaStore } from "./types";

const URL_PREFIX = "/api/uploads/";

/**
 * Extensões conhecidas por mimetype. `put` deriva o nome do arquivo daqui,
 * não do nome original enviado pelo cliente: o nome de arquivo é texto
 * livre (poderia ser "evil.html") e `express.static` decide o Content-Type
 * de resposta pela extensão do arquivo em disco — se ela viesse do cliente,
 * um upload cujos bytes batem com uma assinatura de imagem conhecida, mas
 * cujo nome termina em ".html", seria servido de volta como text/html a
 * partir da própria origem do app (stored XSS). Mimetype desconhecido grava
 * sem extensão em vez de confiar no nome original.
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

/**
 * Development fallback used by dev.sh. Creates the uploads directory on first
 * write instead of at import time, so importing this module never touches a
 * read-only filesystem.
 */
export class LocalDiskStore implements MediaStore {
  private readonly dir: string;

  constructor(dir: string = path.resolve(process.cwd(), "uploads")) {
    this.dir = dir;
  }

  async put(buffer: Buffer, mimetype: string, _originalname: string): Promise<string> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    const ext = EXTENSION_BY_MIME_TYPE[mimetype] ?? "";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await fs.promises.writeFile(path.join(this.dir, filename), buffer);
    return `${URL_PREFIX}${filename}`;
  }

  async remove(imageUrl: string): Promise<void> {
    if (!imageUrl.startsWith(URL_PREFIX)) return;
    const filename = imageUrl.slice(URL_PREFIX.length);
    if (!filename || filename.includes("/")) return;
    await fs.promises.rm(path.join(this.dir, filename), { force: true });
  }

  async get(imageUrl: string): Promise<Buffer | null> {
    if (!imageUrl.startsWith(URL_PREFIX)) return null;
    const filename = imageUrl.slice(URL_PREFIX.length);
    if (!filename || filename.includes("/")) return null;
    try {
      return await fs.promises.readFile(path.join(this.dir, filename));
    } catch {
      return null;
    }
  }
}
