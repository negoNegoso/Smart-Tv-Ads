import { useEffect, useState } from 'react';
import { QrCode, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import { LANDING } from '@/lib/landing-content';
import { mediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import { usePublicPieces, type PublicPiece } from '@/hooks/use-public-pieces';

type Orientation = PublicPiece['orientation'];

/** Tempo de cada peça na tela; mais curto que na TV, para quem só passa o olho. */
export const TV_MOCKUP_INTERVAL_MS = 5000;

const ORIENTATIONS: Array<{ id: Orientation; label: string; Icon: typeof RectangleHorizontal }> = [
  { id: 'landscape', label: LANDING.mockup.landscape, Icon: RectangleHorizontal },
  { id: 'portrait', label: LANDING.mockup.portrait, Icon: RectangleVertical },
];

/**
 * A TV rodando as peças que já estão no ar na rede, desenhada em CSS.
 *
 * Reproduz o que a tela realmente mostra: arte em `cover`, faixa de legenda e
 * a caixa branca do QR com o rótulo SAIBA +, os mesmos elementos de
 * pages/display.tsx. Medidas em `cqmin` (1% do lado curto da moldura), como
 * em piece-preview.tsx, para legenda e QR não mudarem de escala ao girar.
 *
 * Cada orientação só toca peça dela, como a TV de verdade. Sem peça na
 * orientação escolhida (ou API fora), fica o slide de exemplo.
 */
export function TvMockup() {
  const { data } = usePublicPieces();
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [index, setIndex] = useState(0);

  const pieces = (data ?? []).filter((p) => p.orientation === orientation);
  const count = pieces.length;

  // Girar a TV recomeça da primeira peça daquela orientação.
  useEffect(() => {
    setIndex(0);
  }, [orientation]);

  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), TV_MOCKUP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [count, orientation]);

  const current = count > 0 ? pieces[index % count] : null;
  const caption = current ? current.caption : LANDING.mockup.caption;
  const portrait = orientation === 'portrait';

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div
        role="group"
        aria-label={LANDING.mockup.orientationLabel}
        className="inline-flex rounded-md border border-border bg-card p-1"
      >
        {ORIENTATIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={orientation === id}
            onClick={() => setOrientation(id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
              orientation === id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className={cn('w-full', portrait && 'max-w-[15rem]')}>
        <div className="rounded-xl border-4 border-neutral-800 bg-neutral-800 shadow-lg">
          <div
            role="img"
            aria-label={LANDING.mockup.screenLabel}
            data-testid="tv-screen"
            data-orientation={orientation}
            className={cn(
              'relative overflow-hidden rounded-md bg-black',
              portrait ? 'aspect-[9/16]' : 'aspect-video',
              count === 0 &&
                'bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.55),transparent_60%)]',
            )}
            style={{ containerType: 'size' }}
          >
            {/* Todas empilhadas: a troca é só de opacidade, sem piscar esperando carregar. */}
            {pieces.map((piece, i) => (
              <img
                key={`${piece.imageUrl}-${i}`}
                src={mediaUrl(piece.imageUrl)}
                alt=""
                data-active={i === index % count}
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-700 motion-reduce:transition-none',
                  i === index % count ? 'opacity-100' : 'opacity-0',
                )}
              />
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
          </div>
        </div>
        <div className="mx-auto h-4 w-24 rounded-b-lg bg-neutral-800" />
      </div>
    </div>
  );
}
