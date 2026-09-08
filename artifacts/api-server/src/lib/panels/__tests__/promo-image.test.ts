import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * satori busca `item.imageUrl` sem timeout nem limite de tamanho, e o
 * lojista digita essa URL livremente — este módulo é o guarda-chuva que a
 * rota de publicação usa antes de entregar qualquer coisa ao renderizador.
 * Nenhum teste aqui toca a rede de verdade: `fetch` e `node:dns/promises`
 * são mockados, e o MediaStore é um dublê em memória.
 */

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup }));

const { fetchImageDataUri } = await import("../promo-image");

function fakeReader(chunks: Uint8Array[]) {
  let i = 0;
  return {
    async read() {
      if (i < chunks.length) {
        const value = chunks[i++];
        return { done: false, value };
      }
      return { done: true, value: undefined };
    },
    async cancel() {
      i = chunks.length;
    },
  };
}

function fakeResponse(opts: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  contentLength?: string;
  chunks?: Uint8Array[];
}) {
  const headers = new Map<string, string>();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  if (opts.contentLength) headers.set("content-length", opts.contentLength);
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    body: { getReader: () => fakeReader(opts.chunks ?? []) },
  };
}

/** Dublê de MediaStore: só o `get` importa aqui. */
function fakeStore(get: (url: string) => Promise<Buffer | null>) {
  return { get: vi.fn(get) };
}

const PUBLIC_IP = "93.184.216.34";

describe("fetchImageDataUri — URL absoluta (rede, com guardas)", () => {
  beforeEach(() => {
    lookup.mockReset();
    lookup.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("converte uma imagem pequena em data URI", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ contentType: "image/png", contentLength: String(bytes.length), chunks: [bytes] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/pizza.png", fakeStore(async () => null));

    expect(result).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({ signal: expect.anything(), redirect: "manual" });
  });

  it("recusa esquema http (exige https)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("http://cdn.example.com/pizza.png", fakeStore(async () => null));

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa host que resolve para IP privado (SSRF)", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://interno.example.com/x.png", fakeStore(async () => null));

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa IP literal de metadados de nuvem (link-local) sem precisar de DNS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://169.254.169.254/latest/meta-data", fakeStore(async () => null));

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("recusa IP literal de loopback", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://127.0.0.1/x.png", fakeStore(async () => null));

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa quando a resolução de DNS falha", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://nao-existe.example.com/x.png", fakeStore(async () => null));

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa e não segue redirecionamento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ status: 302, ok: false }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/pizza.png", fakeStore(async () => null));

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recusa content-type que não é image/* (ex.: página de erro/login)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ contentType: "text/html", chunks: [new Uint8Array([60, 104, 116, 109, 108])] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/login", fakeStore(async () => null));

    expect(result).toBeNull();
  });

  // O resvg 2.6.2 (o wasm que rasteriza os slides) não decodifica webp — só
  // aceitar png/jpeg/gif aqui evita publicar "com sucesso" uma foto que a TV
  // mostra como um buraco vazio.
  it("recusa content-type image/webp (resvg não decodifica)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ contentType: "image/webp", chunks: [new Uint8Array([1, 2, 3])] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/pizza.webp", fakeStore(async () => null));

    expect(result).toBeNull();
  });

  it("retorna null quando o fetch estoura o timeout de 5s", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchImageDataUri("https://cdn.example.com/lenta.png", fakeStore(async () => null));
    await vi.advanceTimersByTimeAsync(5000);
    const result = await pending;

    expect(result).toBeNull();
  });

  it("retorna null quando o content-length declarado excede 5MB", async () => {
    const tooBig = String(5 * 1024 * 1024 + 1);
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ contentType: "image/jpeg", contentLength: tooBig, chunks: [new Uint8Array(10)] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/gigante.jpg", fakeStore(async () => null));

    expect(result).toBeNull();
  });

  it("retorna null quando os bytes recebidos excedem 5MB mesmo sem content-length confiável", async () => {
    const chunk = new Uint8Array(1024 * 1024); // 1MB por pedaço
    const chunks = Array.from({ length: 6 }, () => chunk); // 6MB no total
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contentType: "image/jpeg", chunks }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/mentiroso.jpg", fakeStore(async () => null));

    expect(result).toBeNull();
  });

  it("retorna null quando a resposta não é 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/sumiu.png", fakeStore(async () => null));

    expect(result).toBeNull();
  });

  it("URL vazia ou nula não chama fetch nem o store", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const store = fakeStore(async () => null);

    expect(await fetchImageDataUri(null, store)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
  });
});

describe("fetchImageDataUri — caminho relativo (resolve pelo MediaStore, sem rede)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lê a imagem do MediaStore e converte para data URI (sniff pelos bytes mágicos)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const store = fakeStore(async (url) => (url === "/api/uploads/foto.png" ? png : null));

    const result = await fetchImageDataUri("/api/uploads/foto.png", store);

    expect(result).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(store.get).toHaveBeenCalledWith("/api/uploads/foto.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("devolve null quando o MediaStore não tem o objeto", async () => {
    const store = fakeStore(async () => null);

    const result = await fetchImageDataUri("/api/storage/objects/sumiu", store);

    expect(result).toBeNull();
  });

  it("devolve null quando os bytes do MediaStore não parecem uma imagem conhecida", async () => {
    const store = fakeStore(async () => Buffer.from("isso não é uma imagem"));

    const result = await fetchImageDataUri("/api/uploads/nao-e-imagem.bin", store);

    expect(result).toBeNull();
  });
});
