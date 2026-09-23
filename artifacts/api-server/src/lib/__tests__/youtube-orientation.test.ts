import { afterEach, describe, expect, it, vi } from "vitest";
import { detectYouTubeMeta } from "../youtube/orientation";

// Sondagem do oEmbed (ver corpo do commit): tanto um Short público quanto um
// vídeo comum vieram com proporção "deitada" (largura > altura), então o
// oEmbed não serve pra decidir orientação. Só o link `/shorts/` marca
// vertical; o resto é landscape e o operador corrige no seletor manual.
describe("detectYouTubeMeta", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("link /shorts/ é vertical sem consultar a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const meta = await detectYouTubeMeta("https://www.youtube.com/shorts/abc123def45");
    expect(meta).toEqual({ kind: "youtube_video", id: "abc123def45", orientation: "portrait" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("playlist é horizontal sem consultar a rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const meta = await detectYouTubeMeta("https://www.youtube.com/playlist?list=PL1234567890abc");
    expect(meta).toEqual({ kind: "youtube_playlist", id: "PL1234567890abc", orientation: "landscape" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("link comum (watch?v=) é horizontal: sem oEmbed, sem consulta de rede", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("timeout");
    });
    vi.stubGlobal("fetch", fetchMock);
    const meta = await detectYouTubeMeta("https://www.youtube.com/watch?v=abc123def45");
    expect(meta).toEqual({ kind: "youtube_video", id: "abc123def45", orientation: "landscape" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("link que não é do YouTube é null", async () => {
    expect(await detectYouTubeMeta("https://vimeo.com/123")).toBeNull();
  });
});
