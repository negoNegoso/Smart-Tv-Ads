import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { DevicePreviewSlide } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
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
 * ordem e duração. O palco imita o `public/tv.html` trocando `vh` por `cqh` —
 * na TV 100vh é a tela inteira, aqui 100cqh é o palco inteiro, então legenda
 * e QR saem na mesma proporção.
 *
 * Diferente do player, não conta exibição (inflaria o relatório do
 * anunciante) e não toca vídeo: YouTube aparece como capa, sem som no admin.
 */
export function DevicePreview({ slides }: { slides: DevicePreviewSlide[] }) {
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

  useEffect(() => {
    if (paused || count === 0) return;
    const timer = setInterval(() => setElapsedMs((ms) => ms + TICK_MS), TICK_MS);
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
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg bg-black px-6 text-center text-white">
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
        className="relative aspect-video w-full overflow-hidden rounded-lg bg-black select-none"
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
          <span className="absolute left-[3cqh] top-[3cqh] z-20 flex items-center gap-[1cqh] rounded-[1cqh] bg-black/70 px-[2cqh] py-[1cqh] text-[4cqh] font-medium text-white">
            <Play className="h-[4cqh] w-[4cqh] fill-current" />
            Vídeo
          </span>
        ) : null}

        {/* Espelho de components/slide-caption.tsx com cqh no lugar de vh. */}
        {slide.displayText ? (
          <div className="absolute bottom-[3cqh] left-[3cqh] right-[20cqh] z-10">
            <span className="inline-block h-[14cqh] max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-[1cqh] bg-black/55 px-[3cqh] text-[5cqh] font-medium leading-[14cqh] tracking-tight text-white">
              {slide.displayText}
            </span>
          </div>
        ) : null}

        {/* Espelho do QR de pages/display.tsx com cqh no lugar de vh. */}
        {slide.qrImageUrl ? (
          <div className="absolute bottom-[3cqh] right-[3cqh] z-30 rounded-[1cqh] bg-white p-[1cqh]">
            <span className="mb-[0.5cqh] block w-[12cqh] text-center text-[1.8cqh] font-semibold leading-[2.4cqh] tracking-[0.12em] text-black [text-indent:0.12em]">
              SAIBA +
            </span>
            <img
              src={`${import.meta.env.BASE_URL}${slide.qrImageUrl.replace(/^\//, '')}`}
              alt=""
              className="block h-[12cqh] w-[12cqh]"
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
    </div>
  );
}
