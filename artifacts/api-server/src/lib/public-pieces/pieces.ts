import { resolveSlideCaption } from "../slide-caption";

/** Uma peça na TV de demonstração da landing. */
export interface PublicPiece {
  imageUrl: string;
  caption: string | null;
  orientation: "landscape" | "portrait";
  kind: PublicPieceKind;
}

export type PublicPieceKind = "image" | "video" | "flyer";

/** O que a consulta traz de cada peça no ar. */
export interface PublicPieceRow {
  id: number;
  imageUrl: string | null;
  mediaKind: string;
  youtubeId: string | null;
  showText: boolean;
  displayText: string | null;
  orientation: string;
  source: string;
}

/**
 * Encarte primeiro: página de encarte é imagem, mas quem vê reconhece como
 * encarte de ofertas. Playlist conta como vídeo (só chega aqui com imagem
 * própria).
 */
export function pieceKind(row: Pick<PublicPieceRow, "mediaKind" | "source">): PublicPieceKind {
  if (row.source === "panel") return "flyer";
  if (row.mediaKind === "youtube_video" || row.mediaKind === "youtube_playlist") return "video";
  return "image";
}

/**
 * Teto por orientação: a landing mostra uma peça por vez e não precisa da
 * biblioteca inteira, e a resposta pública fica pequena.
 */
export const PUBLIC_PIECES_PER_ORIENTATION = 12;

/**
 * Converte as linhas no que a landing consome.
 *
 * Puro de propósito: é aqui que se decide o que sai para quem não tem login.
 * Só imagem, legenda e orientação — título interno, anunciante e QR ficam de
 * fora. A legenda segue a mesma regra da TV (`resolveSlideCaption`), então a
 * landing nunca mostra um texto que a TV esconderia.
 *
 * Vídeo do YouTube sem imagem própria usa a thumbnail do vídeo, como a prévia
 * do admin. Playlist sem imagem não tem thumbnail estável e sai.
 */
export function publicPiecesFromRows(
  rows: PublicPieceRow[],
  perOrientation: number = PUBLIC_PIECES_PER_ORIENTATION,
): PublicPiece[] {
  const seen = new Set<number>();
  const count = { landscape: 0, portrait: 0 };
  const pieces: PublicPiece[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);

    const imageUrl =
      row.imageUrl ??
      (row.mediaKind === "youtube_video" && row.youtubeId
        ? `https://img.youtube.com/vi/${row.youtubeId}/hqdefault.jpg`
        : null);
    if (!imageUrl) continue;

    const orientation = row.orientation === "portrait" ? "portrait" : "landscape";
    if (count[orientation] >= perOrientation) continue;
    count[orientation] += 1;

    pieces.push({
      imageUrl,
      caption: resolveSlideCaption({ showText: row.showText, displayText: row.displayText }),
      orientation,
      kind: pieceKind(row),
    });
  }

  return pieces;
}
