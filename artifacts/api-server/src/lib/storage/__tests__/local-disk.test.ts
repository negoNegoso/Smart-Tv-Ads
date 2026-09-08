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

  it("lê de volta o arquivo gravado como Buffer", async () => {
    const store = new LocalDiskStore(dir);
    const imageUrl = await store.put(Buffer.from("conteudo"), "image/png", "foto.png");

    const buffer = await store.get(imageUrl);

    expect(buffer).toEqual(Buffer.from("conteudo"));
  });

  it("get devolve null para url de outro backend, sem lançar", async () => {
    const store = new LocalDiskStore(dir);

    await expect(
      store.get("https://exemplo.public.blob.vercel-storage.com/a.png"),
    ).resolves.toBeNull();
  });

  it("get devolve null quando o arquivo não existe, sem lançar", async () => {
    const store = new LocalDiskStore(dir);

    await expect(store.get("/api/uploads/nao-existe.png")).resolves.toBeNull();
  });

  it("ignora a extensão do nome original e usa a do mimetype (nome polyglota .html)", async () => {
    const store = new LocalDiskStore(dir);
    // Bytes que passam pelo sniff de PNG, mas o nome original diz .html —
    // se a extensão em disco viesse do nome, express.static serviria isto
    // de volta como text/html a partir da própria origem do app.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

    const imageUrl = await store.put(png, "image/png", "evil.html");

    expect(imageUrl).not.toMatch(/\.html$/);
    expect(imageUrl).toMatch(/^\/api\/uploads\/.+\.png$/);
    const buffer = await store.get(imageUrl);
    expect(buffer).toEqual(png);
  });

  it("grava sem extensão quando o mimetype não é reconhecido", async () => {
    const store = new LocalDiskStore(dir);

    const imageUrl = await store.put(Buffer.from("conteudo"), "application/octet-stream", "arquivo.bin");

    expect(imageUrl).toMatch(/^\/api\/uploads\/[^./]+$/);
    const buffer = await store.get(imageUrl);
    expect(buffer).toEqual(Buffer.from("conteudo"));
  });
});
