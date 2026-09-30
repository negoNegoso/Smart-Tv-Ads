import { useEffect, useRef, useState } from 'react';
import type { DisplaySlide } from '@workspace/api-client-react';
import { AnimatePresence, motion } from 'framer-motion';
import { mediaUrl } from '@/lib/media-url';
import { SlideCaption } from '@/components/slide-caption';
import { YouTubeSlide } from '@/components/youtube-slide';
import { ArtLayers } from '@/components/art-layers';

export interface PlayerStageProps {
  slides: DisplaySlide[];
  /** Força vídeo mudo (landing: navegador bloqueia autoplay com som). */
  muted?: boolean;
  /** Congela rodízio e contagem; vídeo vira pôster até voltar. */
  paused?: boolean;
  /** Uma vez por exibição concluída — quem chama decide para onde mandar. */
  onPlay?: (slide: DisplaySlide) => void;
  /** Slide na tela mudou (null = lista vazia). */
  onSlideChange?: (slide: DisplaySlide | null) => void;
}

/**
 * O que a TV mostra, sem a TV: rodízio, vídeo, legenda, QR e barra de
 * progresso. Usado pela TV (`pages/display.tsx`, em tela cheia) e pela
 * landing (`TvMockup`, dentro da moldura) — os dois não podem divergir no
 * que vai ao ar.
 *
 * Ocupa a caixa pai e mede tudo em `var(--u)`: `cqmin` (1% do lado curto do
 * palco) onde há container queries, com `vh` de reserva nos motores antigos
 * das TVs (ver `.player-stage` em index.css). Com cqmin escala da TV de 55" à moldura de 28rem sem mudar proporção. Não gira:
 * girar a TV em pé é assunto da casca do display.
 */
export function PlayerStage({ slides, muted = false, paused = false, onPlay, onSlideChange }: PlayerStageProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const playSent = useRef(false);
  const playlistCursor = useRef<Record<number, number>>({});
  const videoPositions = useRef<Record<string, number>>({});
  const [fallbackIds, setFallbackIds] = useState<Set<string>>(new Set());
  // Tempo já exibido do slide atual: sobrevive à pausa para, ao voltar,
  // terminar só o que faltava em vez de recomeçar a contagem.
  const elapsedRef = useRef(0);
  // De quem é o tempo em elapsedRef. O tempo só deve sobreviver à pausa: se o
  // refetch reordena a lista e o mesmo índice passa a apontar outro anúncio,
  // ou se o vídeo falha e vira pôster, a contagem recomeça. Sem isso, um
  // anúncio que ficou 50 ms na tela herdaria o tempo do anterior e geraria
  // prova de exibição falsa.
  const elapsedOwner = useRef<string | null>(null);

  // Callbacks em ref: o pai trocar de função (nova a cada render) não pode
  // reiniciar o timer do slide.
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const onSlideChangeRef = useRef(onSlideChange);
  onSlideChangeRef.current = onSlideChange;

  // Resolve o vídeo atual de um slide (mesma regra usada na renderização e no
  // efeito de auto-advance) para não divergirem.
  const videoIdFor = (slide: DisplaySlide): string | null => {
    if (slide.mediaKind === 'youtube_playlist' && slide.videoIds && slide.videoIds.length > 0) {
      const cursor = playlistCursor.current[slide.announcementId] ?? 0;
      return slide.videoIds[cursor % slide.videoIds.length];
    }
    if (slide.mediaKind === 'youtube_video') {
      return slide.youtubeId ?? null;
    }
    return null;
  };

  // Chave de fallback por vídeo específico: um vídeo ruim numa playlist só
  // pula a si mesmo, sem matar a playlist inteira (igual ao tv.html).
  const fbKeyFor = (announcementId: number, videoId: string | null): string =>
    `${announcementId}-${videoId ?? 'novideo'}`;

  // Ao trocar o conjunto de slides, zera os fallbacks para reavaliar a
  // reprodução (evita marcar um anúncio como não-tocável para sempre).
  const slidesSig = slides.map((s) => s.announcementId).join(',');
  useEffect(() => {
    setFallbackIds(new Set());
  }, [slidesSig]);

  // Quem está de fora (landing) precisa saber o que está no ar.
  useEffect(() => {
    onSlideChangeRef.current?.(slides[currentIndex] ?? null);
  }, [slides, currentIndex]);

  // Auto-advance + contagem de exibição
  useEffect(() => {
    if (slides.length === 0) return;

    const slide = slides[currentIndex];
    if (!slide) {
      elapsedRef.current = 0;
      setCurrentIndex(0);
      return;
    }

    // Pausado: nada corre; o tempo já exibido fica guardado em elapsedRef.
    if (paused) return;

    const vid = videoIdFor(slide);
    const isYouTube =
      slide.mediaKind !== 'image' && !!vid && !fallbackIds.has(fbKeyFor(slide.announcementId, vid));
    const owner = `${slide.announcementId}|${vid}|${isYouTube}`;
    if (elapsedOwner.current !== owner) {
      elapsedOwner.current = owner;
      elapsedRef.current = 0;
    }
    const naturalVideo = isYouTube && slide.playbackMode === 'natural';
    // Vídeo "natural" que toca: o componente avança via onEnded, não o timer.
    if (naturalVideo) {
      playSent.current = false;
      return;
    }

    const durationMs = slide.duration * 1000;
    const intervalMs = 50;
    let elapsed = elapsedRef.current;
    playSent.current = false;

    const timer = setInterval(() => {
      elapsed += intervalMs;
      elapsedRef.current = elapsed;
      setProgress((elapsed / durationMs) * 100);

      if (elapsed >= durationMs) {
        const isCappedVideo = isYouTube && slide.playbackMode !== 'natural';
        if (isCappedVideo) {
          // Corte: a posição já foi salva via onProgress. Cede a tela sem
          // contar play nem avançar o cursor da playlist (retoma depois).
          elapsedRef.current = 0;
          setCurrentIndex((prev) => (prev + 1) % slides.length);
          setProgress(0);
        } else {
          // Imagem ou fallback: comportamento atual (1 play por exibição).
          if (!playSent.current) {
            playSent.current = true;
            onPlayRef.current?.(slide);
          }
          if (
            slide.mediaKind === 'youtube_playlist' &&
            slide.videoIds &&
            slide.videoIds.length > 0
          ) {
            const cur = playlistCursor.current[slide.announcementId] ?? 0;
            playlistCursor.current[slide.announcementId] =
              (cur + 1) % slide.videoIds.length;
          }
          elapsedRef.current = 0;
          setCurrentIndex((prev) => (prev + 1) % slides.length);
          setProgress(0);
        }
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [currentIndex, slides, fallbackIds, paused]);

  // Lista vazia: a casca decide o estado vazio.
  if (slides.length === 0) return null;

  const slide = slides[currentIndex];
  if (!slide) return null;

  const videoId = videoIdFor(slide);
  const fbKey = fbKeyFor(slide.announcementId, videoId);
  const useFallback = fallbackIds.has(fbKey);
  // Só é YouTube tocável quando há um vídeo resolvido e ele não falhou antes.
  // Playlist sem videoIds (sem API key etc.) cai direto no poster. Pausado
  // também mostra o pôster: o vídeo não pode seguir tocando com o rodízio parado.
  const isYouTube = slide.mediaKind !== 'image' && !!videoId && !useFallback && !paused;

  const posterUrl =
    slide.imageUrl != null
      ? mediaUrl(slide.imageUrl)
      : slide.youtubeId
        ? `https://img.youtube.com/vi/${slide.youtubeId}/hqdefault.jpg`
        : '';

  const advance = () => {
    delete videoPositions.current[`${slide.announcementId}-${videoId}`];
    if (slide.mediaKind === 'youtube_playlist' && slide.videoIds && slide.videoIds.length > 0) {
      const cur = playlistCursor.current[slide.announcementId] ?? 0;
      playlistCursor.current[slide.announcementId] = (cur + 1) % slide.videoIds.length;
    }
    if (!playSent.current) {
      playSent.current = true;
      onPlayRef.current?.(slide);
    }
    elapsedRef.current = 0;
    setCurrentIndex((prev) => (prev + 1) % slides.length);
    setProgress(0);
  };

  return (
    <div className="player-stage absolute inset-0 overflow-hidden bg-black select-none" style={{ containerType: 'size' }}>
      {isYouTube && videoId ? (
        <YouTubeSlide
          slideKey={`${slide.announcementId}-${videoId}`}
          videoId={videoId}
          audioMode={muted ? 'muted' : slide.audioMode === 'sound' ? 'sound' : 'muted'}
          playbackMode={slide.playbackMode === 'natural' ? 'natural' : 'capped'}
          initialPosition={videoPositions.current[`${slide.announcementId}-${videoId}`] ?? 0}
          onProgress={(sec) => {
            videoPositions.current[`${slide.announcementId}-${videoId}`] = sec;
          }}
          onEnded={advance}
          onUnplayable={() =>
            setFallbackIds((prev) => new Set(prev).add(fbKey))
          }
        />
      ) : (
        <AnimatePresence initial={false}>
          <motion.div
            key={slide.announcementId}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
            className="absolute inset-0 z-0 overflow-hidden"
          >
            {/* Só slide de imagem ganha moldura: a miniatura de reserva do
                YouTube tem faixas pretas embutidas. */}
            <ArtLayers url={posterUrl} alt="" allowFrame={!slide.mediaKind || slide.mediaKind === 'image'} />
          </motion.div>
        </AnimatePresence>
      )}

      <SlideCaption text={slide.displayText ?? null} slideKey={slide.announcementId} />

      {slide.qrImageUrl && (
        <div className="absolute bottom-[calc(3*var(--u))] right-[calc(3*var(--u))] z-30 rounded-[calc(1*var(--u))] bg-white p-[calc(1*var(--u))]">
          {/* `artifacts/signage/public/tv.html` espelha este rotulo em ES5 (#qr-label) — mudou aqui, mude la. */}
          {/* Caixa alta literal, nao text-transform: um `uppercase` a menos para
              o espelho ES5 depender nas TVs. O text-indent compensa o
              letter-spacing que sobra depois do ultimo caractere. */}
          <span className="mb-[calc(0.5*var(--u))] block w-[calc(12*var(--u))] text-center text-[length:calc(1.8*var(--u))] font-semibold leading-[calc(2.4*var(--u))] tracking-[0.12em] text-black [text-indent:0.12em]">
            SAIBA +
          </span>
          <img
            src={`${import.meta.env.BASE_URL}${slide.qrImageUrl.replace(/^\//, "")}`}
            alt=""
            className="block h-[calc(12*var(--u))] w-[calc(12*var(--u))]"
          />
        </div>
      )}

      <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10 z-20">
        <div
          className="h-full bg-primary transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
