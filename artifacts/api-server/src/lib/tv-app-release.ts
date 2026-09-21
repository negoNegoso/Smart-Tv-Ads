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

const TIMEOUT_MS = 5000;
/** O instalador costuma abrir a página várias vezes seguidas; 5 min já evita
 *  bater no GitHub a cada visita sem atrasar uma release nova de forma sentida. */
const CACHE_MS = 5 * 60 * 1000;

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
export async function latestTvAppRelease(): Promise<TvAppRelease> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.release;

  let body: unknown;
  try {
    const res = await fetch(`${BASE_URL}update.json`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
