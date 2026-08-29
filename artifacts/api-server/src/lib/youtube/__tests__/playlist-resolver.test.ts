import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlaylistVideoIds, __clearPlaylistCache } from "../playlist-resolver";

function mockPlaylistPage(videoIds: string[], nextPageToken?: string) {
  return {
    ok: true,
    json: async () => ({
      items: videoIds.map((id) => ({ contentDetails: { videoId: id } })),
      nextPageToken,
    }),
  } as Response;
}

describe("resolvePlaylistVideoIds", () => {
  beforeEach(() => {
    __clearPlaylistCache();
    process.env.YOUTUBE_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.YOUTUBE_API_KEY;
  });

  it("retorna [] e não chama a API quando falta YOUTUBE_API_KEY", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolve os videoIds de uma página", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockPlaylistPage(["a", "b", "c"]));
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("pagina com nextPageToken", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockPlaylistPage(["a", "b"], "TOKEN2"))
      .mockResolvedValueOnce(mockPlaylistPage(["c"]));
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("usa cache: a segunda chamada não refaz fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(mockPlaylistPage(["a"]));
    await resolvePlaylistVideoIds("PLabc");
    await resolvePlaylistVideoIds("PLabc");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("retorna [] quando a API responde erro", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: false, status: 403 } as Response);
    const ids = await resolvePlaylistVideoIds("PLabc");
    expect(ids).toEqual([]);
  });
});
