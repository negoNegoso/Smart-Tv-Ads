import { parseYouTubeUrl } from "@workspace/db/youtube";

/** O que o player de música do tv.html carrega. */
export type MusicRef = { kind: "youtube_video" | "youtube_playlist"; youtubeId: string };

/**
 * Link de música de fundo gravado na TV → referência para o player.
 *
 * Quase sempre é o que `parseYouTubeUrl` diz. A exceção são as listas que só
 * existem para quem está logado: o player embutido, sem login, não as carrega
 * e a loja ficaria em silêncio. Nesse caso vale o vídeo do link, em laço.
 */
export function musicRefFromUrl(url: string | null | undefined): MusicRef | null {
  if (!url || !url.trim()) return null;
  const ref = parseYouTubeUrl(url);
  if (!ref) return null;
  if (ref.kind === "youtube_playlist" && listaPessoal(ref.id)) {
    const video = videoDoLink(url);
    return video ? { kind: "youtube_video", youtubeId: video } : null;
  }
  return { kind: ref.kind, youtubeId: ref.id };
}

/**
 * Lista que depende de quem está logado:
 * - `RD…`: mix automático, o link que o YouTube dá ao clicar numa música.
 *   `RDCLAK…` fica de fora: é playlist pública montada pelo YouTube Music.
 * - `LL` (vídeos curtidos), `LM` (músicas curtidas no YouTube Music) e `WL`
 *   (assistir mais tarde).
 */
function listaPessoal(id: string): boolean {
  if (id === "LL" || id === "LM" || id === "WL") return true;
  return id.startsWith("RD") && !id.startsWith("RDCLAK");
}

function videoDoLink(url: string): string | null {
  try {
    return new URL(url.trim()).searchParams.get("v");
  } catch {
    return null;
  }
}
