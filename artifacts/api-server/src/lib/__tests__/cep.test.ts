import { afterEach, describe, expect, it, vi } from "vitest";
import { CepInvalidError, CepNotFoundError, CepUnavailableError, lookupCep, normalizeCep } from "../cep";

const AWESOME_PAULISTA = {
  cep: "01310100", address: "Avenida Paulista", state: "SP", district: "Bela Vista",
  lat: "-23.5632188", lng: "-46.6542596", city: "São Paulo", city_ibge: "3550308",
};
const BRASIL_PAULISTA = {
  cep: "01310100", state: "SP", city: "São Paulo", neighborhood: "Bela Vista", street: "Avenida Paulista",
  ibge: { city: "3550308" }, location: { type: "Point", coordinates: { longitude: "-46.6553299", latitude: "-23.5617698" } },
};

function reply(status: number, body: unknown = {}) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
}

/** Responde por host: cada chave é um pedaço da URL. */
function stubFetch(routes: Record<string, () => Promise<unknown>>) {
  const fetchMock = vi.fn((url: string, options?: unknown) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    return key ? routes[key]() : Promise.reject(new Error(`URL inesperada: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeCep", () => {
  it("aceita máscara e devolve 8 dígitos", () => {
    expect(normalizeCep("01310-100")).toBe("01310100");
  });
  it("recusa tamanho errado", () => {
    expect(() => normalizeCep("1234")).toThrow(CepInvalidError);
  });
});

describe("lookupCep", () => {
  it("normaliza a resposta da AwesomeAPI", async () => {
    stubFetch({ "awesomeapi": () => reply(200, AWESOME_PAULISTA) });
    await expect(lookupCep("01310-100")).resolves.toEqual({
      cep: "01310100", street: "Avenida Paulista", district: "Bela Vista", city: "São Paulo",
      state: "SP", cityIbge: "3550308", lat: -23.5632188, lng: -46.6542596,
    });
  });

  it("cai para a BrasilAPI quando a AwesomeAPI falha", async () => {
    const fetchMock = stubFetch({
      "awesomeapi": () => Promise.reject(new Error("timeout")),
      "brasilapi": () => reply(200, BRASIL_PAULISTA),
    });
    const result = await lookupCep("01310100");
    expect(result).toMatchObject({ street: "Avenida Paulista", district: "Bela Vista", lat: -23.5617698, lng: -46.6553299 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("BrasilAPI sem coordenada devolve lat/lng nulos", async () => {
    stubFetch({
      "awesomeapi": () => reply(503),
      "brasilapi": () => reply(200, { ...BRASIL_PAULISTA, location: { type: "Point", coordinates: {} } }),
    });
    await expect(lookupCep("01310100")).resolves.toMatchObject({ lat: null, lng: null });
  });

  it("404 na AwesomeAPI é CEP inexistente, sem consultar a reserva", async () => {
    const fetchMock = stubFetch({ "awesomeapi": () => reply(404, { code: "not_found" }) });
    await expect(lookupCep("99999999")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("404 na reserva também é CEP inexistente", async () => {
    stubFetch({ "awesomeapi": () => reply(500), "brasilapi": () => reply(404) });
    await expect(lookupCep("99999999")).rejects.toBeInstanceOf(CepNotFoundError);
  });

  it("as duas fora é indisponível", async () => {
    stubFetch({
      "awesomeapi": () => Promise.reject(new Error("rede")),
      "brasilapi": () => reply(502),
    });
    await expect(lookupCep("01310100")).rejects.toBeInstanceOf(CepUnavailableError);
  });

  it("usa timeout de 5 s em cada chamada", async () => {
    const fetchMock = stubFetch({ "awesomeapi": () => reply(200, AWESOME_PAULISTA) });
    await lookupCep("01310100");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });
});
