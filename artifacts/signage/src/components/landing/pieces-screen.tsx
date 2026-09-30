import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { ArtLayers } from "@/components/art-layers";
import { usePublicPieces } from "@/hooks/use-public-pieces";
import { LANDING } from "@/lib/landing-content";
import { mediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";

/** Tempo de cada peça na tela; mais curto que na TV, para quem só passa o olho. */
export const TV_PIECES_INTERVAL_MS = 5000;

/**
 * O que a TV da landing mostra enquanto não há TV vitrine (ou ela está sem
 * peça): as peças no ar na rede, em rodízio, como a landing fazia antes da
 * vitrine existir. Sem isso, o intervalo entre o deploy e o cadastro da
 * vitrine deixaria a landing só com o slide de exemplo.
 *
 * Não é o player: só a arte de cada peça, e nenhuma exibição vai para o
 * relatório de anunciante — não há TV por trás. Sem peça na orientação,
 * fica o slide de exemplo desenhado em CSS.
 *
 * Ocupa a tela da moldura (`tv-screen`), que declara `container-type: size`:
 * medidas em `cqmin` para legenda e QR não mudarem de escala ao girar.
 */
export function PiecesScreen({ orientation }: { orientation: "landscape" | "portrait" }) {
  const { data } = usePublicPieces();
  const [index, setIndex] = useState(0);

  const pieces = (data ?? []).filter((p) => p.orientation === orientation);
  const count = pieces.length;

  // Girar a TV recomeça da primeira peça daquela orientação.
  useEffect(() => {
    setIndex(0);
  }, [orientation]);

  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), TV_PIECES_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, orientation]);

  const current = count > 0 ? pieces[index % count] : null;
  const caption = current ? current.caption : LANDING.mockup.caption;

  return (
    <>
      {/* Todas empilhadas: a troca é só de opacidade, sem piscar esperando carregar. */}
      {pieces.map((piece, i) => (
        <div
          key={`${piece.imageUrl}-${i}`}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none",
            i === index % count ? "opacity-100" : "opacity-0",
          )}
        >
          <ArtLayers url={mediaUrl(piece.imageUrl)} alt="" />
        </div>
      ))}

      {caption ? (
        <div className="absolute bottom-[3cqmin] left-[3cqmin] right-[26cqmin] z-10">
          <span
            data-testid="tv-caption"
            className="block truncate rounded-[1cqmin] bg-black/55 px-[3cqmin] py-[2cqmin] text-[5cqmin] font-medium text-white"
          >
            {caption}
          </span>
        </div>
      ) : null}

      {/* Branco do QR real da TV, não do tema. */}
      <div className="absolute bottom-[3cqmin] right-[3cqmin] z-10 rounded-[1cqmin] bg-[#fff] p-[1.5cqmin] text-center">
        <span className="block text-[3cqmin] font-semibold tracking-[0.12em] text-black">
          {LANDING.mockup.qrLabel}
        </span>
        <QrCode className="mx-auto mt-[0.5cqmin] h-[14cqmin] w-[14cqmin] text-black" />
      </div>
    </>
  );
}
