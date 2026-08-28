import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted é obrigatório: vi.mock é içada para o topo do arquivo, então uma
// fábrica que referencia `const` comum estoura ReferenceError.
const { put, del } = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));

vi.mock("@vercel/blob", () => ({ put, del }));

import { VercelBlobStore } from "../vercel-blob";

describe("VercelBlobStore", () => {
  beforeEach(() => {
    put.mockReset();
    del.mockReset();
    put.mockResolvedValue({ url: "https://exemplo.public.blob.vercel-storage.com/announcements/abc.png" });
  });

  it("envia o buffer como público e devolve a url absoluta", async () => {
    const store = new VercelBlobStore();
    const buffer = Buffer.from("conteudo");

    const imageUrl = await store.put(buffer, "image/png", "foto.png");

    expect(imageUrl).toBe("https://exemplo.public.blob.vercel-storage.com/announcements/abc.png");
    const [pathname, body, options] = put.mock.calls[0]!;
    expect(pathname).toMatch(/^announcements\/.+\.png$/);
    expect(body).toBe(buffer);
    expect(options).toMatchObject({ access: "public", contentType: "image/png" });
  });

  it("preserva a extensão do arquivo original", async () => {
    const store = new VercelBlobStore();

    await store.put(Buffer.from("x"), "image/jpeg", "banner.JPG");

    expect(put.mock.calls[0]![0]).toMatch(/\.JPG$/);
  });

  it("apaga pelo url absoluto", async () => {
    const store = new VercelBlobStore();

    await store.remove("https://exemplo.public.blob.vercel-storage.com/announcements/abc.png");

    expect(del).toHaveBeenCalledWith("https://exemplo.public.blob.vercel-storage.com/announcements/abc.png");
  });

  it("ignora url de outro backend sem chamar o blob", async () => {
    const store = new VercelBlobStore();

    await store.remove("/api/uploads/antigo.png");

    expect(del).not.toHaveBeenCalled();
  });
});
