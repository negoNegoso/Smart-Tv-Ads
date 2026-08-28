import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted é obrigatório: vi.mock é içada para o topo do arquivo, então uma
// fábrica que referencia `const` comum estoura ReferenceError.
const { getObjectEntityUploadURL, normalizeObjectEntityPath } = vi.hoisted(() => ({
  getObjectEntityUploadURL: vi.fn(),
  normalizeObjectEntityPath: vi.fn(),
}));

vi.mock("../../objectStorage", () => ({
  ObjectStorageService: class {
    getObjectEntityUploadURL = getObjectEntityUploadURL;
    normalizeObjectEntityPath = normalizeObjectEntityPath;
  },
}));

import { ReplitObjectStore } from "../replit";

describe("ReplitObjectStore", () => {
  beforeEach(() => {
    getObjectEntityUploadURL.mockReset();
    normalizeObjectEntityPath.mockReset();
    getObjectEntityUploadURL.mockResolvedValue("https://storage.googleapis.com/bucket/dir/uploads/abc");
    normalizeObjectEntityPath.mockReturnValue("/objects/uploads/abc");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  it("envia via PUT para a url assinada e devolve o caminho servido pela api", async () => {
    const store = new ReplitObjectStore();
    const buffer = Buffer.from("conteudo");

    const imageUrl = await store.put(buffer, "image/png", "foto.png");

    expect(imageUrl).toBe("/api/storage/objects/uploads/abc");
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe("https://storage.googleapis.com/bucket/dir/uploads/abc");
    expect(init).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/png" } });
  });

  it("lança erro quando o upload assinado é rejeitado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const store = new ReplitObjectStore();

    await expect(store.put(Buffer.from("x"), "image/png", "foto.png")).rejects.toThrow(
      "Object storage upload failed: 403",
    );
  });

  it("remove é no-op: o App Storage retém os objetos", async () => {
    const store = new ReplitObjectStore();

    await expect(store.remove("/api/storage/objects/uploads/abc")).resolves.toBeUndefined();
  });
});
