/**
 * Próxima versão da release (major.minor.patch) a partir da última tag vX.Y.Z
 * e do título do PR mesclado, que segue o padrão de commits do repo:
 *
 *   feat(...)            -> minor
 *   tipo! / linha "BREAKING CHANGE:" no corpo -> major
 *   qualquer outro       -> patch
 *
 * Uso no CI: PR_TITLE, PR_BODY e TAGS (uma por linha) no ambiente; imprime a
 * versão sem o "v".
 */
import { pathToFileURL } from "node:url";

const SEMVER_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

export function bumpFor(title, body) {
  const head = /^(\w+)(\([^)]*\))?(!)?:/.exec(title.trim());
  // Rodapé de commit convencional: só vale no início da linha. Texto que cita
  // a regra no meio da descrição não é quebra de compatibilidade.
  if (head?.[3] || /^BREAKING[ -]CHANGE:/m.test(body ?? "")) return "major";
  if (head?.[1] === "feat") return "minor";
  return "patch";
}

export function nextVersion(current, bump) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** Maior tag vX.Y.Z; tags fora do padrão (pre-release, prefixos) ficam de fora. */
export function latestVersion(tags) {
  const versions = tags
    .map((tag) => SEMVER_TAG.exec(tag.trim()))
    .filter(Boolean)
    .map((m) => m.slice(1, 4).map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const last = versions.at(-1);
  return last ? last.join(".") : "1.0.0";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tags = (process.env.TAGS ?? "").split("\n").filter(Boolean);
  const bump = bumpFor(process.env.PR_TITLE ?? "", process.env.PR_BODY ?? "");
  console.log(nextVersion(latestVersion(tags), bump));
}
