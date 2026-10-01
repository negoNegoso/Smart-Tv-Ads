import { parseYouTubeUrl } from "@workspace/db/youtube";

/** O que o player de música do tv.html carrega. */
export type MusicRef = { kind: "youtube_video" | "youtube_playlist"; youtubeId: string };

/**
 * Link de música de fundo gravado na TV → referência para o player.
 *
 * Quase sempre é o que `parseYouTubeUrl` diz. A exceção é o mix automático:
 * clicar numa música no YouTube leva a `watch?v=X&list=RD…`, uma lista gerada
 * na hora para quem está logado. O player embutido não a carrega e a loja
 * ficaria em silêncio; nesse caso vale o vídeo do link, em laço.
 */
export function musicRefFromUrl(url: string | null | undefined): MusicRef | null {
  if (!url || !url.trim()) return null;
  const ref = parseYouTubeUrl(url);
  if (!ref) return null;
  if (ref.kind === "youtube_playlist" && ref.id.startsWith("RD")) {
    const video = videoDoLink(url);
    return video ? { kind: "youtube_video", youtubeId: video } : null;
  }
  return { kind: ref.kind, youtubeId: ref.id };
}

function videoDoLink(url: string): string | null {
  try {
    return new URL(url.trim()).searchParams.get("v");
  } catch {
    return null;
  }
}
