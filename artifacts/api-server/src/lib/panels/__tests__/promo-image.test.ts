import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchImageDataUri } from "../promo-image";

/**
 * satori busca `item.imageUrl` sem timeout nem limite de tamanho — este
 * módulo é o guarda-chuva que a rota de publicação usa antes de entregar a
 * URL ao renderizador. Nenhum teste aqui toca a rede: `fetch` é mockado.
 */

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

describe("fetchImageDataUri", () => {
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

    const result = await fetchImageDataUri("https://cdn.example.com/pizza.png");

    expect(result).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example.com/pizza.png",
      expect.objectContaining({ signal: expect.anything() }),
    );
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

    const pending = fetchImageDataUri("https://cdn.example.com/lenta.png");
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

    const result = await fetchImageDataUri("https://cdn.example.com/gigante.jpg");

    expect(result).toBeNull();
  });

  it("retorna null quando os bytes recebidos excedem 5MB mesmo sem content-length confiável", async () => {
    const chunk = new Uint8Array(1024 * 1024); // 1MB por pedaço
    const chunks = Array.from({ length: 6 }, () => chunk); // 6MB no total
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ contentType: "image/jpeg", chunks }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/mentiroso.jpg");

    expect(result).toBeNull();
  });

  it("retorna null quando a resposta não é 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchImageDataUri("https://cdn.example.com/sumiu.png");

    expect(result).toBeNull();
  });

  it("URL vazia ou nula não chama fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchImageDataUri(null)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
