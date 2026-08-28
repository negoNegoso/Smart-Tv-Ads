import fs from "node:fs";
import path from "node:path";
import type { MediaStore } from "./types";

const URL_PREFIX = "/api/uploads/";

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

  async put(buffer: Buffer, _mimetype: string, originalname: string): Promise<string> {
    await fs.promises.mkdir(this.dir, { recursive: true });
    const ext = path.extname(originalname);
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
}
