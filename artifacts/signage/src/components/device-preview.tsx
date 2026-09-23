import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { DevicePreviewSlide } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { tvFrameClass } from '@/components/piece-preview';
import { mediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';

const TICK_MS = 100;

const SOURCE_LABEL: Record<DevicePreviewSlide['source'], string> = {
  campaign: 'Campanha',
  panel: 'Painel',
  playlist: 'Playlist',
};

/** Mesma regra de capa do display.tsx: arte do slide, senão a capa do YouTube. */
function posterFor(slide: DevicePreviewSlide): string {
  if (slide.imageUrl) return mediaUrl(slide.imageUrl);
  if (slide.youtubeId) return `https://img.youtube.com/vi/${slide.youtubeId}/hqdefault.jpg`;
  return '';
}

/**
 * Espelho da TV no admin: gira a mesma rotação que o player recebe, na mesma
 * ordem e duração. O palco imita o `public/tv.html` trocando `vh` por `cqmin` —
 * na TV 100vh é a tela inteira, aqui 100cqmin é o palco inteiro, então legenda
 * e QR saem na mesma proporção. `cqmin` é 1% do lado curto do palco: igual a
 * `cqh` na moldura deitada, e certo também na moldura em pé.
 *
 * Diferente do player, não conta exibição (inflaria o relatório do
 * anunciante) e não toca vídeo: YouTube aparece como capa, sem som no admin.
 *
 * `compact` tira a lista da rotação — para grades com várias TVs lado a lado.
 */
export function DevicePreview({
  slides,
  compact = false,
  orientation = 'landscape',
}: {
  slides: DevicePreviewSlide[];
  compact?: boolean;
  orientation?: 'landscape' | 'portrait';
}) {
  const [index, setIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = slides.length;
  // A lista pode encolher num refetch; o palco volta ao início em vez de
  // apontar para um slide que saiu da rotação.
  const current = index < count ? index : 0;
  const slide = slides[current];
  // Duração 0 viraria avanço a cada render.
  const durationMs = Math.max(slide?.duration ?? 0, 1) * 1000;

  function goTo(next: number) {
    setIndex(((next % count) + count) % count);
    setElapsedMs(0);
  }

  // Soma o tempo de relógio entre disparos, não TICK_MS fixo: em aba de fundo
  // o navegador atrasa o setInterval e a prévia andaria mais devagar que a TV.
  useEffect(() => {
    if (paused || count === 0) return;
    let last = Date.now();
    const timer = setInterval(() => {
      // Delta calculado aqui, não dentro do updater: o React roda o updater
      // depois, quando `last` já avançou, e o delta viraria zero.
      const now = Date.now();
      const delta = now - last;
      last = now;
      setElapsedMs((ms) => ms + delta);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [paused, count]);

  useEffect(() => {
    if (count > 0 && elapsedMs >= durationMs) {
      setIndex((current + 1) % count);
      setElapsedMs(0);
    }
  }, [elapsedMs, durationMs, count, current]);

  if (!slide) {
    return (
      <div
        data-testid="tv-frame"
        data-orientation={orientation}
        className={cn('flex flex-col items-center justify-center rounded-lg bg-black px-6 text-center text-white', tvFrameClass(orientation))}
      >
        <p className="text-lg font-light text-white/70">Nada no ar nesta TV</p>
        <p className="mt-1 text-sm text-white/40">
          Adicione anúncios à playlist ou publique um painel do cliente para aparecer aqui.
        </p>
      </div>
    );
  }

  const poster = posterFor(slide);
  const progress = Math.min((elapsedMs / durationMs) * 100, 100);

  return (
    <div className="space-y-3">
      <div
        data-testid="tv-frame"
        data-orientation={orientation}
        className={cn('relative overflow-hidden rounded-lg bg-black select-none', tvFrameClass(orientation))}
        style={{ containerType: 'size' }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={`${current}-${slide.announcementId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            {poster ? (
              <img src={poster} alt={slide.title} className="h-full w-full object-cover" />
            ) : null}
          </motion.div>
        </AnimatePresence>

        {slide.mediaKind !== 'image' ? (
          <span className="absolute left-[3cqmin] top-[3cqmin] z-20 flex items-center gap-[1cqmin] rounded-[1cqmin] bg-black/70 px-[2cqmin] py-[1cqmin] text-[4cqmin] font-medium text-white">
            <Play className="h-[4cqmin] w-[4cqmin] fill-current" />
            Vídeo
          </span>
        ) : null}

        {/* Espelho de components/slide-caption.tsx com cqmin no lugar de vh. */}
        {slide.displayText ? (
          <div className="absolute bottom-[3cqmin] left-[3cqmin] right-[20cqmin] z-10">
            <span className="inline-block h-[14cqmin] max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[1cqmin] bg-black/55 px-[3cqmin] text-[5cqmin] font-medium leading-[14cqmin] tracking-tight text-white">
              {slide.displayText}
            </span>
          </div>
        ) : null}

        {/* Espelho do QR de pages/display.tsx com cqmin no lugar de vh. */}
        {slide.qrImageUrl ? (
          <div className="absolute bottom-[3cqmin] right-[3cqmin] z-30 rounded-[1cqmin] bg-white p-[1cqmin]">
            <span className="mb-[0.5cqmin] block w-[12cqmin] text-center text-[1.8cqmin] font-semibold leading-[2.4cqmin] tracking-[0.12em] text-black [text-indent:0.12em]">
              SAIBA +
            </span>
            <img
              src={`${import.meta.env.BASE_URL}${slide.qrImageUrl.replace(/^\//, '')}`}
              alt=""
              className="block h-[12cqmin] w-[12cqmin]"
            />
          </div>
        ) : null}

        <div className="absolute bottom-0 left-0 z-20 h-1 w-full bg-white/10">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Slide anterior" onClick={() => goTo(current - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          aria-label={paused ? 'Continuar' : 'Pausar'}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Próximo slide" onClick={() => goTo(current + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">{`${current + 1}/${count}`}</span>
        <span className="min-w-0 truncate text-sm">{slide.title}</span>
      </div>

      {compact ? null : (
      <ol aria-label="Rotação da TV" className="max-h-64 space-y-1 overflow-y-auto">
        {slides.map((item, i) => (
          <li key={`${i}-${item.announcementId}`}>
            <button
              type="button"
              aria-current={i === current ? 'true' : undefined}
              onClick={() => goTo(i)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                i === current && 'bg-accent font-medium',
              )}
            >
              <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span className="w-20 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-xs text-muted-foreground">
                {SOURCE_LABEL[item.source]}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.duration}s</span>
            </button>
          </li>
        ))}
      </ol>
      )}
    </div>
  );
}
