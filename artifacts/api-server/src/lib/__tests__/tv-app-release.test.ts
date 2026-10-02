import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UPDATE_JSON = {
  versionName: "1.16.0",
  versionCode: 1016000,
  apk: "signage-tv-1.16.0.apk",
  sha256: "a".repeat(64),
};

const fetchMock = vi.fn();

function ok(body: unknown = UPDATE_JSON) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const MINUTO = 60 * 1000;

async function carregar() {
  return import("../tv-app-release");
}

beforeEach(() => {
  // O cache vive no módulo: sem zerar, um teste herdaria a resposta do outro.
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Só o relógio: o código usa Date.now() para a idade do cache.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("latestTvAppReleaseForFeed", () => {
  it("lê a release e devolve a versão", async () => {
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
  });

  it("cache com menos de 1 minuto não consulta de novo", async () => {
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    vi.setSystemTime(Date.now() + MINUTO - 1000);
    await latestTvAppReleaseForFeed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache vencido consulta de novo e pega a release nova", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + MINUTO + 1000);
    fetchMock.mockResolvedValueOnce(ok({ ...UPDATE_JSON, versionName: "1.17.0", apk: "signage-tv-1.17.0.apk" }));
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.17.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("GitHub fora devolve o último valor conhecido, mesmo vencido", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + 10 * MINUTO);
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
  });

  it("sem nenhum valor conhecido e GitHub fora devolve null, sem lançar", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { latestTvAppReleaseForFeed } = await carregar();
    await expect(latestTvAppReleaseForFeed()).resolves.toBeNull();
  });

  it("update.json inválido devolve o último valor conhecido", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + 2 * MINUTO);
    fetchMock.mockResolvedValueOnce(ok({ versionName: "x", apk: "../../evil.apk", sha256: "z" }));
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
  });

  // GitHub fora por minutos: sem isto, cada feed de cada TV esperaria o teto
  // de 1,5 s. Uma tentativa por minuto; as outras respondem na hora.
  it("depois de uma falha, não tenta de novo antes de 1 minuto", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    await latestTvAppReleaseForFeed();
    vi.setSystemTime(Date.now() + 30 * 1000);
    await latestTvAppReleaseForFeed();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + MINUTO);
    await latestTvAppReleaseForFeed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Várias TVs batem no mesmo instante com o cache vencido.
  it("chamadas simultâneas compartilham uma consulta só", async () => {
    let liberar: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { liberar = resolve; }));
    const { latestTvAppReleaseForFeed } = await carregar();
    const a = latestTvAppReleaseForFeed();
    const b = latestTvAppReleaseForFeed();
    const c = latestTvAppReleaseForFeed();
    liberar(ok());
    const versoes = (await Promise.all([a, b, c])).map((r) => r?.versionName);
    expect(versoes).toEqual(["1.16.0", "1.16.0", "1.16.0"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a consulta do feed usa o teto de 1,5 s e a da página, o de 5 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppRelease, latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    expect(timeout).toHaveBeenLastCalledWith(1500);

    vi.setSystemTime(Date.now() + 2 * MINUTO);
    await latestTvAppRelease();
    expect(timeout).toHaveBeenLastCalledWith(5000);
  });

  // A consulta da página tem teto de 5 s; o feed não pode entrar nela.
  it("feed não espera uma consulta lenta da página", async () => {
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { latestTvAppRelease, latestTvAppReleaseForFeed } = await carregar();
    latestTvAppRelease().catch(() => {});
    fetchMock.mockResolvedValueOnce(ok());
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // Se herdasse a consulta do feed, a página falharia em 1,5 s.
  it("página não herda o teto curto do feed", async () => {
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { latestTvAppRelease, latestTvAppReleaseForFeed } = await carregar();
    latestTvAppReleaseForFeed().catch(() => {});
    fetchMock.mockResolvedValueOnce(ok());
    expect((await latestTvAppRelease()).versionName).toBe("1.16.0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("latestTvAppRelease (página do APK)", () => {
  it("segue lançando quando o GitHub está fora", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { latestTvAppRelease, TvAppReleaseUnavailableError } = await carregar();
    await expect(latestTvAppRelease()).rejects.toBeInstanceOf(TvAppReleaseUnavailableError);
  });

  // A página de download não herda a espera de 1 minuto do feed: quem está
  // instalando uma box precisa da tentativa agora.
  it("tenta de novo logo depois de uma falha do feed", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const { latestTvAppRelease, latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    fetchMock.mockResolvedValueOnce(ok());
    expect((await latestTvAppRelease()).versionName).toBe("1.16.0");
  });

  it("o cache vale 1 minuto", async () => {
    fetchMock.mockResolvedValue(ok());
    const { latestTvAppRelease } = await carregar();
    await latestTvAppRelease();
    vi.setSystemTime(Date.now() + MINUTO - 1000);
    await latestTvAppRelease();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2000);
    await latestTvAppRelease();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
