import { describe, expect, it } from "vitest";
import { publicPiecesFromRows, type PublicPieceRow } from "../pieces";

function row(over: Partial<PublicPieceRow> = {}): PublicPieceRow {
  return {
    id: 1,
    imageUrl: "/api/storage/objects/a.jpg",
    mediaKind: "image",
    youtubeId: null,
    showText: true,
    displayText: "Promoção de pão",
    orientation: "landscape",
    ...over,
  };
}

describe("publicPiecesFromRows", () => {
  it("expõe só imagem, legenda e orientação", () => {
    const [piece] = publicPiecesFromRows([row()]);
    expect(piece).toEqual({
      imageUrl: "/api/storage/objects/a.jpg",
      caption: "Promoção de pão",
      orientation: "landscape",
    });
  });

  it("esconde a legenda que a TV também esconde", () => {
    const [piece] = publicPiecesFromRows([row({ showText: false })]);
    expect(piece?.caption).toBeNull();
  });

  it("usa a thumbnail do vídeo do YouTube sem imagem própria", () => {
    const [piece] = publicPiecesFromRows([
      row({ imageUrl: null, mediaKind: "youtube_video", youtubeId: "abc123" }),
    ]);
    expect(piece?.imageUrl).toBe("https://img.youtube.com/vi/abc123/hqdefault.jpg");
  });

  it("descarta playlist sem imagem própria", () => {
    const pieces = publicPiecesFromRows([
      row({ imageUrl: null, mediaKind: "youtube_playlist", youtubeId: "PL1" }),
    ]);
    expect(pieces).toEqual([]);
  });

  it("não repete peça que está em campanha e em playlist", () => {
    expect(publicPiecesFromRows([row({ id: 7 }), row({ id: 7 })])).toHaveLength(1);
  });

  it("orientação desconhecida conta como horizontal", () => {
    const [piece] = publicPiecesFromRows([row({ orientation: "square" })]);
    expect(piece?.orientation).toBe("landscape");
  });

  it("limita cada orientação separadamente", () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2 }),
      row({ id: 3 }),
      row({ id: 4, orientation: "portrait" }),
    ];
    const pieces = publicPiecesFromRows(rows, 2);
    expect(pieces.filter((p) => p.orientation === "landscape")).toHaveLength(2);
    expect(pieces.filter((p) => p.orientation === "portrait")).toHaveLength(1);
  });
});
