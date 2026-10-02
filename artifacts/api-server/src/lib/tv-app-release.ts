/**
 * Última versão publicada do app da TV, lida do `update.json` que a pipeline de
 * release anexa junto do APK. O nome do arquivo carrega a versão
 * (`signage-tv-1.5.0.apk`), então não dá para apontar direto para ele: é
 * preciso perguntar ao GitHub qual é o da vez.
 *
 * Mesma origem que o app Android usa para se atualizar
 * (artifacts/android-tv/app/build.gradle.kts).
 */
const BASE_URL =
  process.env.TV_APP_RELEASE_BASE_URL ??
  "https://github.com/negoNegoso/Smart-Tv-Ads/releases/latest/download/";

/** Teto da consulta feita pela página de download. */
const TIMEOUT_MS = 5000;
/** Teto da consulta feita pelo feed da TV: a rota mais chamada do sistema não
 *  pode ficar esperando o GitHub. */
const FEED_TIMEOUT_MS = 1500;
/** 1 minuto: o feed usa este valor para avisar as TVs de uma release nova, e
 *  o atraso do aviso é este cache mais os 60 s do próprio feed. Uma consulta
 *  por minuto por instância ao link de download (sem limite de API). */
const CACHE_MS = 60 * 1000;

/** Nome que a pipeline gera. Como o destino do redirect é montado com um campo
 *  vindo de fora, qualquer outra coisa é recusada — senão o `update.json` viraria
 *  um redirecionamento aberto. */
const APK_NAME = /^signage-tv-\d+\.\d+\.\d+\.apk$/;

export interface TvAppRelease {
  versionName: string;
  apk: string;
  sha256: string;
  /** URL absoluta do APK, pronta para o redirect. */
  url: string;
}

export class TvAppReleaseUnavailableError extends Error {}

let cache: { at: number; release: TvAppRelease } | null = null;
/** Consulta em andamento, para chamadas simultâneas não irem todas ao GitHub. */
let inFlight: Promise<TvAppRelease> | null = null;
/** Quando o feed tentou pela última vez, tenha dado certo ou não. */
let feedAttemptAt = 0;

function parse(body: unknown): TvAppRelease | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const versionName = typeof raw.versionName === "string" ? raw.versionName : null;
  const apk = typeof raw.apk === "string" ? raw.apk : null;
  const sha256 = typeof raw.sha256 === "string" ? raw.sha256 : null;
  if (!versionName || !apk || !sha256 || !APK_NAME.test(apk)) return null;
  return { versionName, apk, sha256, url: BASE_URL + apk };
}

/**
 * Só o resultado bom entra no cache: guardar falha faria uma queda passageira do
 * GitHub derrubar o download pelos minutos seguintes.
 */
async function fetchRelease(timeoutMs: number): Promise<TvAppRelease> {
  let body: unknown;
  try {
    const res = await fetch(`${BASE_URL}update.json`, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    throw new TvAppReleaseUnavailableError(`Falha ao ler update.json: ${String(err)}`);
  }

  const release = parse(body);
  if (!release) throw new TvAppReleaseUnavailableError("update.json inválido");

  cache = { at: Date.now(), release };
  return release;
}

function refresh(timeoutMs: number): Promise<TvAppRelease> {
  if (!inFlight) {
    inFlight = fetchRelease(timeoutMs).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

function freshCache(): TvAppRelease | null {
  return cache && Date.now() - cache.at < CACHE_MS ? cache.release : null;
}

/** Página de download e redirect do APK: tenta agora e lança se não der. */
export async function latestTvAppRelease(): Promise<TvAppRelease> {
  return freshCache() ?? refresh(TIMEOUT_MS);
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
    return await refresh(FEED_TIMEOUT_MS);
  } catch {
    return stale;
  }
}
