import { useEffect } from 'react';
import { useRoute } from 'wouter';
import {
  useGetDisplayFeed,
  getGetDisplayFeedQueryKey,
  type DisplaySlide,
} from '@workspace/api-client-react';
import { FullscreenHint } from '@/components/fullscreen-hint';
import { PlayerStage } from '@/components/player-stage';
import { stageStyle } from '@/lib/stage-rotation';

// Referência estável: `[]` novo a cada render reiniciaria o timer do slide.
const NO_SLIDES: never[] = [];

export default function Display() {
  const [, params] = useRoute('/display/:deviceKey');
  const deviceKey = params?.deviceKey ?? '';

  const { data: feed, isLoading, isError } = useGetDisplayFeed(deviceKey, {
    query: {
      enabled: !!deviceKey,
      queryKey: getGetDisplayFeedQueryKey(deviceKey),
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
    },
  });
  const slides = feed?.slides ?? NO_SLIDES;
  const orientation = feed?.screen.orientation;

  // Prova de exibição da TV: a key identifica o device.
  const sendPlay = (slide: DisplaySlide) => {
    fetch(`${import.meta.env.BASE_URL}api/telemetry/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceKey,
        announcementId: slide.announcementId,
        campaignId: slide.campaignId ?? null,
        durationSeconds: slide.duration,
      }),
    }).catch(() => {});
  };

  // Fullscreen TV presentation
  useEffect(() => {
    document.body.style.cursor = 'none';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.cursor = 'auto';
      document.body.style.overflow = 'auto';
    };
  }, []);

  if (!deviceKey) {
    return (
      <EmptyState
        title="Dispositivo não configurado"
        subtitle="Abra o painel admin para obter a URL de exibição desta TV."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="relative h-[100dvh] w-screen bg-black">
        <FullscreenHint />
      </div>
    );
  }

  if (isError || slides.length === 0) {
    return (
      <EmptyState
        title="Nenhum slide configurado para esta tela"
        subtitle="Acesse as configurações da TV e adicione anúncios à playlist."
        orientation={orientation}
      />
    );
  }

  return (
    <div className="relative h-[100dvh] w-screen bg-black overflow-hidden select-none">
      <div style={stageStyle(orientation)}>
        {/* key: girou a TV, recomeça do primeiro slide no formato novo (mesma regra do tv.html). */}
        {/* Passar pelo estado de erro/vazio desmonta o palco: ao voltar, o rodízio recomeça sem cursor de playlist nem posição de vídeo — aceito. */}
        <PlayerStage key={orientation} slides={slides} onPlay={sendPlay} />
      </div>
      <FullscreenHint />
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  orientation,
}: {
  title: string;
  subtitle: string;
  orientation?: string;
}) {
  return (
    <div className="relative h-[100dvh] w-screen bg-black text-white">
      <FullscreenHint />
      <div style={stageStyle(orientation)} className="flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-6 h-24 w-24 rounded-full bg-white/5 p-6 shadow-[0_0_40px_rgba(255,255,255,0.1)]">
            <svg className="h-full w-full text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-light tracking-tight text-white/60">{title}</h1>
          <p className="mt-2 text-sm text-white/40">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
