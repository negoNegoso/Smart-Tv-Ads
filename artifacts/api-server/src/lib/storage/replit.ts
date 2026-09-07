import type { MediaStore } from "./types";

/**
 * Replit App Storage. `@google-cloud/storage` is loaded through a dynamic
 * import so that it can stay external in the Vercel bundle, where this
 * implementation is never selected and therefore never evaluated.
 */
export class ReplitObjectStore implements MediaStore {
  async put(buffer: Buffer, mimetype: string, _originalname: string): Promise<string> {
    const { ObjectStorageService } = await import("../objectStorage");
    const service = new ObjectStorageService();

    const uploadUrl = await service.getObjectEntityUploadURL();
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mimetype },
      body: buffer,
    });
    if (!uploaded.ok) {
      throw new Error(`Object storage upload failed: ${uploaded.status}`);
    }

    const objectPath = service.normalizeObjectEntityPath(uploadUrl);
    return `/api/storage/objects/${objectPath.replace(/^\/objects\//, "")}`;
  }

  /** Deliberate no-op: the previous implementation never deleted App Storage objects. */
  async remove(_imageUrl: string): Promise<void> {}

  async get(imageUrl: string): Promise<Buffer | null> {
    const prefix = "/api/storage/objects/";
    if (!imageUrl.startsWith(prefix)) return null;
    try {
      const { ObjectStorageService } = await import("../objectStorage");
      const service = new ObjectStorageService();
      const file = await service.getObjectEntityFile(`/objects/${imageUrl.slice(prefix.length)}`);
      const [buffer] = await file.download();
      return buffer;
    } catch {
      // Objeto inexistente, sidecar fora do ar, credencial expirada: tudo
      // vira "sem imagem" para quem chama, nunca uma exceção.
      return null;
    }
  }
}
