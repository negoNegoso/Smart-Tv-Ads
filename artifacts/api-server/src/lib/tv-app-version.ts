/**
 * Versão do app Android da TV. O app anexa `SignageApp/<versionName>` ao
 * User-Agent do WebView (TvWebViewConfig.kt), então toda requisição da TV já
 * diz que versão ela roda — inclusive as TVs instaladas antes desta mudança.
 */

// A rota do feed é pública: o que casar aqui vai para o banco e para a tela
// do admin. Por isso só letras, números, ponto e hífen, até 32 caracteres, e o
// marcador tem de ser uma palavra inteira (não o fim de outro produto).
const MARKER = /(?:^|\s)SignageApp\/([0-9A-Za-z.-]{1,32})(?=\s|$)/;

export function tvAppVersionFromUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return MARKER.exec(userAgent)?.[1] ?? null;
}

const RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;

function releaseParts(version: string | null): [number, number, number] | null {
  const match = version ? RELEASE.exec(version) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * Só afirma "desatualizada" quando dá para comparar: as duas versões no
 * padrão X.Y.Z da pipeline de release. Build de teste (`-rc`), TV sem app e
 * GitHub fora do ar ficam sem selo — melhor não marcar do que marcar errado.
 */
export function isOutdatedTvApp(appVersion: string | null, latestVersion: string | null): boolean {
  const current = releaseParts(appVersion);
  const latest = releaseParts(latestVersion);
  if (!current || !latest) return false;
  for (let i = 0; i < 3; i += 1) {
    if (current[i] !== latest[i]) return current[i] < latest[i];
  }
  return false;
}
