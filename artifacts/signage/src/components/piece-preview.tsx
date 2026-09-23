import { useState } from 'react';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

type Orientation = 'landscape' | 'portrait';

/**
 * Moldura de TV na proporção da orientação. Vertical tem largura máxima: 9:16
 * na largura toda do dialog ficaria mais alto que a tela.
 */
export function tvFrameClass(orientation: Orientation): string {
  return orientation === 'portrait'
    ? 'mx-auto aspect-[9/16] w-full max-w-[16rem]'
    : 'aspect-video w-full';
}

/**
 * Prévia da peça na biblioteca, antes de salvar: mesmo `cover` e mesma
 * legenda que a TV usa. Medidas em `cqmin` (1% do lado curto da moldura),
 * pelo mesmo motivo do `vh` no player: legenda e QR seguem o lado curto nas
 * duas orientações.
 */
export function PiecePreview({
  orientation,
  posterUrl,
  caption,
  videoId,
}: {
  orientation: Orientation;
  posterUrl: string | null;
  caption: string | null;
  videoId?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const showVideo = playing && !!videoId;

  return (
    <div
      data-testid="piece-frame"
      data-orientation={orientation}
      className={cn('relative overflow-hidden rounded-lg bg-black', tvFrameClass(orientation))}
      style={{ containerType: 'size' }}
    >
      {showVideo ? (
        <iframe
          title="Prévia do vídeo"
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&playsinline=1&rel=0`}
          allow="autoplay; encrypted-media"
        />
      ) : posterUrl ? (
        <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/60">
          Escolha uma imagem ou cole um link
        </p>
      )}

      {videoId && !showVideo ? (
        <button
          type="button"
          aria-label="Tocar prévia do vídeo"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 flex items-center justify-center bg-black/20 text-white hover:bg-black/30"
        >
          <Play className="h-[14cqmin] w-[14cqmin] fill-current" />
        </button>
      ) : null}

      {/* Espelho de components/slide-caption.tsx com cqmin no lugar de vh. */}
      {caption ? (
        <div className="pointer-events-none absolute bottom-[3cqmin] left-[3cqmin] right-[3cqmin] z-10">
          <span className="inline-block h-[14cqmin] max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[1cqmin] bg-black/55 px-[3cqmin] text-[5cqmin] font-medium leading-[14cqmin] tracking-tight text-white">
            {caption}
          </span>
        </div>
      ) : null}
    </div>
  );
}
