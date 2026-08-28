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
}
