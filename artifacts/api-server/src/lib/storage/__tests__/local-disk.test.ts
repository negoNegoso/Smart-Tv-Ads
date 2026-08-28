import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStore } from "../local-disk";

describe("LocalDiskStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = path.join(mkdtempSync(path.join(tmpdir(), "signage-")), "uploads");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("cria o diretório apenas na primeira escrita, não na construção", async () => {
    const store = new LocalDiskStore(dir);
    expect(existsSync(dir)).toBe(false);

    await store.put(Buffer.from("conteudo"), "image/png", "foto.png");

    expect(existsSync(dir)).toBe(true);
  });

  it("grava o arquivo e devolve um caminho servível pela API", async () => {
    const store = new LocalDiskStore(dir);

    const imageUrl = await store.put(Buffer.from("conteudo"), "image/png", "foto.png");

    expect(imageUrl).toMatch(/^\/api\/uploads\/.+\.png$/);
    const filename = imageUrl.split("/").pop()!;
    expect(readFileSync(path.join(dir, filename), "utf8")).toBe("conteudo");
  });

  it("apaga o arquivo apontado pela url", async () => {
    const store = new LocalDiskStore(dir);
    const imageUrl = await store.put(Buffer.from("conteudo"), "image/png", "foto.png");
    const filename = imageUrl.split("/").pop()!;

    await store.remove(imageUrl);

    expect(existsSync(path.join(dir, filename))).toBe(false);
  });

  it("ignora url de outro backend sem lançar erro", async () => {
    const store = new LocalDiskStore(dir);

    await expect(
      store.remove("https://exemplo.public.blob.vercel-storage.com/a.png"),
    ).resolves.toBeUndefined();
  });

  it("ignora arquivo já inexistente sem lançar erro", async () => {
    const store = new LocalDiskStore(dir);

    await expect(store.remove("/api/uploads/nao-existe.png")).resolves.toBeUndefined();
  });
});
