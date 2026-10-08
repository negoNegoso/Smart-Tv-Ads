import { logger } from "./logger";

/**
 * Última versão publicada do app da TV, lida do `update.json` que a pipeline de
 * release anexa junto do APK. O nome do arquivo carrega a versão
 * (`signage-tv-1.5.0.apk`), então não dá para apontar direto para ele: é
 * preciso perguntar ao GitHub qual é o da vez.
 *
 * O repositório é privado: o link público `releases/latest/download/` dá 404
 * sem login. Por isso a consulta passa pela API do GitHub com o token que só o
 * servidor tem (GITHUB_RELEASES_TOKEN), e as TVs baixam por aqui
 * (rotas em routes/tv-app.ts), nunca direto do GitHub. Sem o token a API ainda
 * funciona para repositório público, com o limite baixo de quem não se
 * identifica.
 */
const REPO = process.env.TV_APP_RELEASE_REPO ?? "negoNegoso/Smart-Tv-Ads";
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Teto da consulta feita pela página de download. */
const TIMEOUT_MS = 5000;
/** Teto da consulta feita pelo feed da TV: a rota mais chamada do sistema não
 *  pode ficar esperando o GitHub. */
const FEED_TIMEOUT_MS = 1500;
/** 1 minuto: o feed usa este valor para avisar as TVs de uma release nova, e
 *  o atraso do aviso é este cache mais os 60 s do próprio feed. Uma consulta
 *  por minuto por instância, bem abaixo das 5000/h do token. */
const CACHE_MS = 60 * 1000;

/** Nome que a pipeline gera. O nome vem de fora (update.json) e decide qual
 *  arquivo da release é entregue, então qualquer outra coisa é recusada. */
export const APK_NAME = /^signage-tv-\d+\.\d+\.\d+\.apk$/;

export interface TvAppRelease {
  versionName: string;
  versionCode: number;
  apk: string;
  sha256: string;
  /** Endereço do APK na API do GitHub. Só serve com o token: nunca sai do
   *  servidor; quem baixa recebe o link temporário de apkDownloadUrl(). */
  apkAssetUrl: string;
}

export class TvAppReleaseUnavailableError extends Error {}

let cache: { at: number; release: TvAppRelease } | null = null;
/** Consulta do feed em andamento, para as TVs que batem juntas não irem todas
 *  ao GitHub. Exclusiva do feed: a página do APK tem teto de 5 s, e se o feed
 *  entrasse nela esperaria mais que 1,5 s; se a página entrasse na do feed,
 *  falharia cedo demais. */
let inFlight: Promise<TvAppRelease> | null = null;
/** Quando o feed tentou pela última vez, tenha dado certo ou não. */
let feedAttemptAt = 0;

function githubHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_RELEASES_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

interface Asset {
  name: string;
  url: string;
}

function parseAssets(body: unknown): Asset[] {
  if (!body || typeof body !== "object") return [];
  const assets = (body as Record<string, unknown>).assets;
  if (!Array.isArray(assets)) return [];
  return assets.flatMap((a) => {
    if (!a || typeof a !== "object") return [];
    const { name, url } = a as Record<string, unknown>;
    return typeof name === "string" && typeof url === "string" ? [{ name, url }] : [];
  });
}

/**
 * Link temporário (alguns minutos) para baixar o arquivo sem token. O
 * redirecionamento é seguido à mão: o link assinado recusa a requisição se ela
 * ainda levar o Authorization do GitHub.
 */
async function signedAssetUrl(assetUrl: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(assetUrl, {
    headers: githubHeaders("application/octet-stream"),
    redirect: "manual",
    signal,
  });
  const location = res.headers.get("location");
  if (res.status < 300 || res.status >= 400 || !location) {
    throw new Error(`HTTP ${res.status} no arquivo da release`);
  }
  return location;
}

function parseManifest(body: unknown, assets: Asset[]): TvAppRelease | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const versionName = typeof raw.versionName === "string" ? raw.versionName : null;
  const versionCode = typeof raw.versionCode === "number" ? raw.versionCode : null;
  const apk = typeof raw.apk === "string" ? raw.apk : null;
  const sha256 = typeof raw.sha256 === "string" ? raw.sha256 : null;
  if (!versionName || versionCode === null || !apk || !sha256 || !APK_NAME.test(apk)) return null;
  const apkAsset = assets.find((a) => a.name === apk);
  if (!apkAsset) return null;
  return { versionName, versionCode, apk, sha256, apkAssetUrl: apkAsset.url };
}

/**
 * Só o resultado bom entra no cache: guardar falha faria uma queda passageira do
 * GitHub derrubar o download pelos minutos seguintes. O teto vale para a
 * consulta inteira (release + update.json), não para cada pedaço.
 */
async function fetchRelease(timeoutMs: number): Promise<TvAppRelease> {
  let body: unknown;
  let assets: Asset[];
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await fetch(LATEST_URL, { headers: githubHeaders("application/vnd.github+json"), signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} na última release`);
    assets = parseAssets(await res.json());
    const manifestAsset = assets.find((a) => a.name === "update.json");
    if (!manifestAsset) throw new Error("release sem update.json");
    const manifest = await fetch(await signedAssetUrl(manifestAsset.url, signal), { signal });
    if (!manifest.ok) throw new Error(`HTTP ${manifest.status} no update.json`);
    body = await manifest.json();
  } catch (err) {
    throw new TvAppReleaseUnavailableError(`Falha ao ler update.json: ${String(err)}`);
  }

  const release = parseManifest(body, assets);
  if (!release) throw new TvAppReleaseUnavailableError("update.json inválido");

  cache = { at: Date.now(), release };
  return release;
}

function refreshForFeed(): Promise<TvAppRelease> {
  if (!inFlight) {
    inFlight = fetchRelease(FEED_TIMEOUT_MS).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

function freshCache(): TvAppRelease | null {
  return cache && Date.now() - cache.at < CACHE_MS ? cache.release : null;
}

/** Página de download e redirect do APK: tenta agora, com a própria consulta e
 *  o próprio teto (sem compartilhar com o feed), e lança se não der. */
export async function latestTvAppRelease(): Promise<TvAppRelease> {
  return freshCache() ?? fetchRelease(TIMEOUT_MS);
}

/**
 * Link para baixar o APK sem token, gerado na hora: expira em minutos, então
 * nunca vai para cache.
 */
export async function apkDownloadUrl(release: TvAppRelease): Promise<string> {
  try {
    return await signedAssetUrl(release.apkAssetUrl, AbortSignal.timeout(TIMEOUT_MS));
  } catch (err) {
    throw new TvAppReleaseUnavailableError(`Falha ao gerar o link do APK: ${String(err)}`);
  }
}

/**
 * Para o feed da TV. Nunca lança e nunca segura o feed além do teto: com o
 * GitHub fora, devolve o último valor conhecido (mesmo vencido) ou null, e só
 * volta a tentar depois de 1 minuto — senão cada feed de cada TV esperaria o
 * teto inteiro enquanto durasse a queda.
 */
export async function latestTvAppReleaseForFeed(): Promise<TvAppRelease | null> {
  const fresh = freshCache();
  if (fresh) return fresh;

  const stale = cache?.release ?? null;
  if (!inFlight && Date.now() - feedAttemptAt < CACHE_MS) return stale;
  feedAttemptAt = Date.now();
  try {
    return await refreshForFeed();
  } catch (err) {
    // Sem este aviso, um GitHub inalcançável de forma persistente deixaria a
    // frota na checagem de 6 h sem ninguém saber. O freio de 1 tentativa por
    // minuto já limita a um log por minuto por instância.
    logger.warn(
      { err },
      "Consulta da última release pelo feed falhou; TVs sem aviso automático neste minuto",
    );
    return stale;
  }
}
