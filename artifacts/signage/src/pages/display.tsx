import { useEffect, useState, useRef } from 'react';
import { useRoute } from 'wouter';
import { useGetDeviceSlides, getGetDeviceSlidesQueryKey } from '@workspace/api-client-react';
import { AnimatePresence, motion } from 'framer-motion';
import { mediaUrl } from '@/lib/media-url';
import { SlideCaption } from '@/components/slide-caption';

export default function Display() {
  const [, params] = useRoute('/display/:deviceKey');
  const deviceKey = params?.deviceKey ?? '';

  const { data: slides = [], isLoading, isError } = useGetDeviceSlides(deviceKey, {
    query: {
      enabled: !!deviceKey,
      queryKey: getGetDeviceSlidesQueryKey(deviceKey),
      refetchInterval: 60000,
      refetchOnWindowFocus: false,
    },
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const playSent = useRef(false);

  // Auto-advance + play tracking
  useEffect(() => {
    if (slides.length === 0) return;

    const slide = slides[currentIndex];
    if (!slide) {
      setCurrentIndex(0);
      return;
    }

    const durationMs = slide.duration * 1000;
    const intervalMs = 50;
    let elapsed = 0;
    playSent.current = false;

    const timer = setInterval(() => {
      elapsed += intervalMs;
      setProgress((elapsed / durationMs) * 100);

      if (elapsed >= durationMs) {
        // Record play fire-and-forget
        if (!playSent.current && deviceKey) {
          playSent.current = true;
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
        }
        setCurrentIndex((prev) => (prev + 1) % slides.length);
        setProgress(0);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [currentIndex, slides, deviceKey]);

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
    return <div className="h-[100dvh] w-screen bg-black" />;
  }

  if (isError || slides.length === 0) {
    return (
      <EmptyState
        title="Nenhum slide configurado para esta tela"
        subtitle="Acesse as configurações da TV e adicione anúncios à playlist."
      />
    );
  }

  const slide = slides[currentIndex];
  if (!slide) return null;

  const imgUrl = mediaUrl(slide.imageUrl);

  return (
    <div className="relative flex h-[100dvh] w-screen items-center justify-center bg-black overflow-hidden select-none">
      <AnimatePresence initial={false}>
        <motion.div
          key={slide.announcementId}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${imgUrl})` }}
        />
      </AnimatePresence>

      <SlideCaption text={slide.displayText ?? null} slideKey={slide.announcementId} />

      {slide.qrImageUrl && (
        <div className="absolute bottom-[3vh] right-[3vh] z-30 rounded-[1vh] bg-white p-[1vh]">
          <img
            src={`${import.meta.env.BASE_URL}${slide.qrImageUrl.replace(/^\//, "")}`}
            alt=""
            className="block h-[12vh] w-[12vh]"
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

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-[100dvh] w-screen flex-col items-center justify-center bg-black text-white">
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
  );
}
