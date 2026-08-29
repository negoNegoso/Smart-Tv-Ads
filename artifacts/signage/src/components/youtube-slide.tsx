import { useEffect, useRef } from 'react';

// Carrega a IFrame Player API do YouTube uma única vez.
let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

interface YouTubeSlideProps {
  slideKey: string | number;
  videoId: string;
  audioMode: 'muted' | 'sound';
  playbackMode: 'natural' | 'capped';
  /** Chamado quando o vídeo termina (natural) — o pai avança o slide. */
  onEnded: () => void;
  /** Chamado se o player não inicializa/erra — o pai mostra o fallback. */
  onUnplayable: () => void;
}

const INIT_TIMEOUT_MS = 4000;

export function YouTubeSlide({
  slideKey,
  videoId,
  audioMode,
  playbackMode,
  onEnded,
  onUnplayable,
}: YouTubeSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(onEnded);
  const unplayableRef = useRef(onUnplayable);
  endedRef.current = onEnded;
  unplayableRef.current = onUnplayable;

  useEffect(() => {
    let player: any = null;
    let cancelled = false;
    let started = false;
    const timeout = setTimeout(() => {
      if (!started) unplayableRef.current();
    }, INIT_TIMEOUT_MS);

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      const YT = (window as any).YT;
      player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          disablekb: 1,
          fs: 0,
        },
        events: {
          onReady: (e: any) => {
            started = true;
            clearTimeout(timeout);
            if (audioMode === 'sound') {
              e.target.unMute();
              e.target.setVolume(100);
            }
            e.target.playVideo();
          },
          onStateChange: (e: any) => {
            if (e.data === YT.PlayerState.ENDED && playbackMode === 'natural') {
              endedRef.current();
            }
          },
          onError: () => {
            clearTimeout(timeout);
            unplayableRef.current();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      try {
        player?.destroy();
      } catch {
        /* noop */
      }
    };
    // Recria o player a cada troca de slide/vídeo.
  }, [slideKey, videoId, audioMode, playbackMode]);

  return (
    <div className="absolute inset-0 z-0 bg-black">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
