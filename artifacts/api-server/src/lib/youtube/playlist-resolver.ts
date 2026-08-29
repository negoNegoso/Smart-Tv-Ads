type CacheEntry = { ids: string[]; expiresAt: number };

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_ITEMS = 200; // teto defensivo p/ playlists gigantes
const cache = new Map<string, CacheEntry>();

/** Apenas para testes: limpa o cache em memória. */
export function __clearPlaylistCache(): void {
  cache.clear();
}

interface PlaylistItemsResponse {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
  nextPageToken?: string;
}

/**
 * Resolve o ID de uma playlist do YouTube para a lista ordenada de videoIds.
 * Sem YOUTUBE_API_KEY, retorna [] (o chamador degrada para o fallback da peça).
 * Erros de rede/API também retornam [] — o display nunca deve travar por isso.
 * Resultado é cacheado em memória por CACHE_TTL_MS.
 */
export async function resolvePlaylistVideoIds(playlistId: string): Promise<string[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const cached = cache.get(playlistId);
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  try {
    const ids: string[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "contentDetails");
      url.searchParams.set("maxResults", "50");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("key", key);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString());
      if (!res.ok) return [];

      const data = (await res.json()) as PlaylistItemsResponse;
      for (const item of data.items ?? []) {
        const id = item.contentDetails?.videoId;
        if (id) ids.push(id);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < MAX_ITEMS);

    const capped = ids.slice(0, MAX_ITEMS);
    cache.set(playlistId, { ids: capped, expiresAt: Date.now() + CACHE_TTL_MS });
    return capped;
  } catch {
    return [];
  }
}
