import { describe, expect, it } from "vitest";
import { musicRefFromUrl } from "../music";

describe("musicRefFromUrl", () => {
  it("vídeo vira youtube_video", () => {
    expect(musicRefFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      youtubeId: "dQw4w9WgXcQ",
    });
  });

  it("playlist vira youtube_playlist", () => {
    expect(musicRefFromUrl("https://www.youtube.com/playlist?list=PL1234567890abc")).toEqual({
      kind: "youtube_playlist",
      youtubeId: "PL1234567890abc",
    });
  });

  it("vídeo dentro de playlist vira a playlist", () => {
    expect(musicRefFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abc")).toEqual({
      kind: "youtube_playlist",
      youtubeId: "PL1234567890abc",
    });
  });

  // Review Focus 1: clicar numa música no YouTube dá um link com list=RD…
  // (mix automático). O player embutido não carrega essa lista.
  it("mix automático (list=RD…) toca o vídeo do link, não a lista", () => {
    expect(musicRefFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&start_radio=1")).toEqual({
      kind: "youtube_video",
      youtubeId: "dQw4w9WgXcQ",
    });
  });

  it("mix automático sem vídeo no link não serve", () => {
    expect(musicRefFromUrl("https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ")).toBeNull();
  });

  // Listas que só existem para quem está logado: curtidos (LL), curtidos do
  // YouTube Music (LM) e "assistir mais tarde" (WL). O player embutido, sem
  // login, não as carrega.
  it.each(["LL", "LM", "WL"])("lista pessoal (%s) toca o vídeo do link, não a lista", (lista) => {
    expect(musicRefFromUrl(`https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=${lista}`)).toEqual({
      kind: "youtube_video",
      youtubeId: "dQw4w9WgXcQ",
    });
  });

  it("lista pessoal sem vídeo no link não serve", () => {
    expect(musicRefFromUrl("https://www.youtube.com/playlist?list=LL")).toBeNull();
  });

  it("playlist pública do YouTube Music (RDCLAK…) é playlist de verdade, não mix", () => {
    expect(musicRefFromUrl("https://music.youtube.com/playlist?list=RDCLAK5uy_abc123")).toEqual({
      kind: "youtube_playlist",
      youtubeId: "RDCLAK5uy_abc123",
    });
  });

  it("nulo, vazio e link de outro site dão null", () => {
    expect(musicRefFromUrl(null)).toBeNull();
    expect(musicRefFromUrl(undefined)).toBeNull();
    expect(musicRefFromUrl("   ")).toBeNull();
    expect(musicRefFromUrl("https://open.spotify.com/playlist/abc")).toBeNull();
    expect(musicRefFromUrl("lofi para estudar")).toBeNull();
  });
});
