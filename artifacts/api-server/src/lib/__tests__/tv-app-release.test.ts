import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UPDATE_JSON = {
  versionName: "1.16.0",
  versionCode: 1016000,
  apk: "signage-tv-1.16.0.apk",
  sha256: "a".repeat(64),
};

const LATEST = "https://api.github.com/repos/negoNegoso/Smart-Tv-Ads/releases/latest";

const fetchMock = vi.fn();
// O módulo é recarregado a cada teste (resetModules); o espião fica fora para
// sobreviver às recargas.
const warnMock = vi.fn();
vi.mock("../logger", () => ({ logger: { warn: warnMock } }));

/**
 * GitHub de mentira: a última release lista os arquivos; cada arquivo pedido
 * pela API redireciona para um link assinado; o link assinado do update.json
 * devolve o manifesto.
 */
function github(manifest: unknown = UPDATE_JSON) {
  const apk = (manifest as { apk?: string }).apk ?? "signage-tv-1.16.0.apk";
  return async (url: string): Promise<Response> => {
    if (url === LATEST) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          assets: [
            { name: "update.json", url: "https://api.github.com/assets/1" },
            { name: apk, url: "https://api.github.com/assets/2" },
          ],
        }),
      } as unknown as Response;
    }
    const asset = url.match(/^https:\/\/api\.github\.com\/assets\/(\d+)$/);
    if (asset) {
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: `https://assinado.example/${asset[1]}` }),
      } as unknown as Response;
    }
    if (url === "https://assinado.example/1") {
      return { ok: true, status: 200, json: async () => manifest } as unknown as Response;
    }
    throw new Error(`URL inesperada no teste: ${url}`);
  };
}

/** Consultas à última release; cada uma faz mais 2 pedidos (update.json). */
function consultas() {
  return fetchMock.mock.calls.filter(([url]) => url === LATEST).length;
}

const MINUTO = 60 * 1000;

async function carregar() {
  return import("../tv-app-release");
}

beforeEach(() => {
  // O cache vive no módulo: sem zerar, um teste herdaria a resposta do outro.
  vi.resetModules();
  fetchMock.mockReset();
  warnMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Só o relógio: o código usa Date.now() para a idade do cache.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T15:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("repositório privado", () => {
  it("consulta a API do GitHub com o token do servidor", async () => {
    vi.stubEnv("GITHUB_RELEASES_TOKEN", "tok-secreto");
    fetchMock.mockImplementation(github());
    const { latestTvAppRelease } = await carregar();
    await latestTvAppRelease();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === LATEST)!;
    expect(init.headers.Authorization).toBe("Bearer tok-secreto");
  });

  // O link assinado recusa a requisição que ainda leva o token, e o token não
  // tem por que sair para outro domínio.
  it("baixa o update.json pelo link assinado, sem o token", async () => {
    vi.stubEnv("GITHUB_RELEASES_TOKEN", "tok-secreto");
    fetchMock.mockImplementation(github());
    const { latestTvAppRelease } = await carregar();
    await latestTvAppRelease();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "https://assinado.example/1")!;
    expect(JSON.stringify(init)).not.toContain("tok-secreto");
  });

  it("sem token não manda Authorization", async () => {
    vi.stubEnv("GITHUB_RELEASES_TOKEN", "");
    fetchMock.mockImplementation(github());
    const { latestTvAppRelease } = await carregar();
    await latestTvAppRelease();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === LATEST)!;
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("devolve a versão e o versionCode que o app compara", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppRelease } = await carregar();
    const release = await latestTvAppRelease();
    expect(release).toMatchObject({ versionName: "1.16.0", versionCode: 1016000, apk: "signage-tv-1.16.0.apk" });
  });

  it("gera o link do APK na hora, a partir do arquivo da release", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppRelease, apkDownloadUrl } = await carregar();
    expect(await apkDownloadUrl(await latestTvAppRelease())).toBe("https://assinado.example/2");
  });

  it("link do APK indisponível lança o erro de indisponível", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppRelease, apkDownloadUrl, TvAppReleaseUnavailableError } = await carregar();
    const release = await latestTvAppRelease();
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: new Headers() } as unknown as Response);
    await expect(apkDownloadUrl(release)).rejects.toBeInstanceOf(TvAppReleaseUnavailableError);
  });

  it("release sem o APK citado no update.json é inválida", async () => {
    const semApk = github();
    fetchMock.mockImplementation(async (url: string) => {
      const res = await semApk(url);
      if (url !== LATEST) return res;
      return {
        ...res,
        json: async () => ({ assets: [{ name: "update.json", url: "https://api.github.com/assets/1" }] }),
      } as unknown as Response;
    });
    const { latestTvAppRelease, TvAppReleaseUnavailableError } = await carregar();
    await expect(latestTvAppRelease()).rejects.toBeInstanceOf(TvAppReleaseUnavailableError);
  });

  it("release sem update.json é indisponível", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ assets: [] }) } as unknown as Response);
    const { latestTvAppRelease, TvAppReleaseUnavailableError } = await carregar();
    await expect(latestTvAppRelease()).rejects.toBeInstanceOf(TvAppReleaseUnavailableError);
  });

  // Era o que acontecia com o repositório fechado e o link público.
  it("404 do GitHub (token sem acesso) é indisponível", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const { latestTvAppRelease, TvAppReleaseUnavailableError } = await carregar();
    await expect(latestTvAppRelease()).rejects.toBeInstanceOf(TvAppReleaseUnavailableError);
  });
});

describe("latestTvAppReleaseForFeed", () => {
  it("lê a release e devolve a versão", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppReleaseForFeed } = await carregar();
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
  });

  it("cache com menos de 1 minuto não consulta de novo", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    vi.setSystemTime(Date.now() + MINUTO - 1000);
    await latestTvAppReleaseForFeed();
    expect(consultas()).toBe(1);
  });

  it("cache vencido consulta de novo e pega a release nova", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + MINUTO + 1000);
    fetchMock.mockImplementation(github({ ...UPDATE_JSON, versionName: "1.17.0", apk: "signage-tv-1.17.0.apk" }));
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.17.0");
    expect(consultas()).toBe(2);
  });

  it("GitHub fora devolve o último valor conhecido, mesmo vencido", async () => {
    fetchMock.mockImplementation(github());
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
    fetchMock.mockImplementation(github());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();

    vi.setSystemTime(Date.now() + 2 * MINUTO);
    fetchMock.mockImplementation(github({ versionName: "x", apk: "../../evil.apk", sha256: "z" }));
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
    expect(consultas()).toBe(1);

    vi.setSystemTime(Date.now() + MINUTO);
    await latestTvAppReleaseForFeed();
    expect(consultas()).toBe(2);
  });

  // Sem o log, um GitHub inalcançável de forma persistente deixaria a frota sem
  // aviso automático sem ninguém saber.
  it("falha da consulta registra um aviso só, e o minuto de freio não registra outro", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0][0]).toHaveProperty("err");
    expect(warnMock.mock.calls[0][1]).toBe(
      "Consulta da última release pelo feed falhou; TVs sem aviso automático neste minuto",
    );

    vi.setSystemTime(Date.now() + 30 * 1000);
    await latestTvAppReleaseForFeed();
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it("consulta bem-sucedida não registra aviso", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppReleaseForFeed } = await carregar();
    await latestTvAppReleaseForFeed();
    expect(warnMock).not.toHaveBeenCalled();
  });

  // Várias TVs batem no mesmo instante com o cache vencido.
  it("chamadas simultâneas compartilham uma consulta só", async () => {
    let liberar: () => void = () => {};
    const portao = new Promise<void>((resolve) => { liberar = resolve; });
    const responder = github();
    fetchMock.mockImplementation(async (url: string) => {
      await portao;
      return responder(url);
    });
    const { latestTvAppReleaseForFeed } = await carregar();
    const a = latestTvAppReleaseForFeed();
    const b = latestTvAppReleaseForFeed();
    const c = latestTvAppReleaseForFeed();
    liberar();
    const versoes = (await Promise.all([a, b, c])).map((r) => r?.versionName);
    expect(versoes).toEqual(["1.16.0", "1.16.0", "1.16.0"]);
    expect(consultas()).toBe(1);
  });

  it("a consulta do feed usa o teto de 1,5 s e a da página, o de 5 s", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockImplementation(github());
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
    fetchMock.mockImplementation(github());
    expect((await latestTvAppReleaseForFeed())?.versionName).toBe("1.16.0");
    expect(consultas()).toBe(2);
  });

  // Se herdasse a consulta do feed, a página falharia em 1,5 s.
  it("página não herda o teto curto do feed", async () => {
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    const { latestTvAppRelease, latestTvAppReleaseForFeed } = await carregar();
    latestTvAppReleaseForFeed().catch(() => {});
    fetchMock.mockImplementation(github());
    expect((await latestTvAppRelease()).versionName).toBe("1.16.0");
    expect(consultas()).toBe(2);
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
    fetchMock.mockImplementation(github());
    expect((await latestTvAppRelease()).versionName).toBe("1.16.0");
  });

  it("o cache vale 1 minuto", async () => {
    fetchMock.mockImplementation(github());
    const { latestTvAppRelease } = await carregar();
    await latestTvAppRelease();
    vi.setSystemTime(Date.now() + MINUTO - 1000);
    await latestTvAppRelease();
    expect(consultas()).toBe(1);
    vi.setSystemTime(Date.now() + 2000);
    await latestTvAppRelease();
    expect(consultas()).toBe(2);
  });
});
