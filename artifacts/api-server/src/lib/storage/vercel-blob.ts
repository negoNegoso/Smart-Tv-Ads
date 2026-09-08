import { randomUUID } from "node:crypto";
import path from "node:path";
import { put as putBlob, del as delBlob } from "@vercel/blob";
import type { MediaStore } from "./types";

/**
 * Production implementation on Vercel. Reads BLOB_READ_WRITE_TOKEN from the
 * environment through the SDK, so no explicit credential is passed here.
 */
export class VercelBlobStore implements MediaStore {
  async put(buffer: Buffer, mimetype: string, originalname: string): Promise<string> {
    const ext = path.extname(originalname);
    const result = await putBlob(`announcements/${randomUUID()}${ext}`, buffer, {
      access: "public",
      contentType: mimetype,
      addRandomSuffix: false,
    });
    return result.url;
  }

  async remove(imageUrl: string): Promise<void> {
    if (!imageUrl.startsWith("https://")) return;
    await delBlob(imageUrl);
  }

  async get(imageUrl: string): Promise<Buffer | null> {
    // A URL já é a nossa própria — gerada por `put` acima —, não entrada de
    // terceiro: buscá-la diretamente não é o mesmo risco de SSRF que buscar
    // uma URL que o lojista colou (ver promo-image.ts).
    if (!imageUrl.startsWith("https://")) return null;
    try {
      const res = await fetch(imageUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
}
