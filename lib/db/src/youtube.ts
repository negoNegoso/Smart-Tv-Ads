export type YouTubeRef =
  | { kind: "youtube_video"; id: string }
  | { kind: "youtube_playlist"; id: string };

/**
 * Extrai o ID de vídeo ou de playlist de uma URL do YouTube.
 * Playlist tem prioridade: um link "watch?v=...&list=..." é tratado como playlist.
 * Retorna null quando a URL não é reconhecida.
 */
export function parseYouTubeUrl(input: string): YouTubeRef | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube = host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  if (!isYouTube) return null;

  const list = url.searchParams.get("list");
  if (list) return { kind: "youtube_playlist", id: list };

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? { kind: "youtube_video", id } : null;
  }

  const v = url.searchParams.get("v");
  if (v) return { kind: "youtube_video", id: v };

  const m = url.pathname.match(/^\/(embed|shorts)\/([^/?]+)/);
  if (m) return { kind: "youtube_video", id: m[2] };

  return null;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
