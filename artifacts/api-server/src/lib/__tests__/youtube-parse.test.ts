import { describe, expect, it } from "vitest";
import { parseYouTubeUrl, youtubeThumbnailUrl } from "@workspace/db/youtube";

describe("parseYouTubeUrl", () => {
  it("reconhece watch?v=", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("reconhece youtu.be", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("reconhece playlist?list=", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/playlist?list=PL1234567890abc")).toEqual({
      kind: "youtube_playlist",
      id: "PL1234567890abc",
    });
  });

  it("prioriza playlist quando há v= e list= juntos", () => {
    expect(
      parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890abc"),
    ).toEqual({ kind: "youtube_playlist", id: "PL1234567890abc" });
  });

  it("retorna null para URL inválida", () => {
    expect(parseYouTubeUrl("https://example.com/video")).toBeNull();
    expect(parseYouTubeUrl("não é url")).toBeNull();
  });

  it("reconhece /embed/", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("reconhece /shorts/", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("reconhece m.youtube.com", () => {
    expect(parseYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "youtube_video",
      id: "dQw4w9WgXcQ",
    });
  });
});

describe("youtubeThumbnailUrl", () => {
  it("monta a URL da thumbnail hqdefault", () => {
    expect(youtubeThumbnailUrl("dQw4w9WgXcQ")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });
});
