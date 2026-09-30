import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  PlayCircle,
  QrCode,
  RectangleHorizontal,
  RectangleVertical,
} from "lucide-react";
import {
  getGetVitrineFeedQueryKey,
  recordVitrinePlays,
  useGetVitrineFeed,
  type DisplaySlide,
} from "@workspace/api-client-react";
import { PlayerStage } from "@/components/player-stage";
import { useSeen } from "@/hooks/use-seen";
import { LANDING } from "@/lib/landing-content";
import { createVitrinePlaysQueue } from "@/lib/vitrine-plays";
import { cn } from "@/lib/utils";

type Orientation = "landscape" | "portrait";

/** Mesmo ritmo da TV: a rotação é buscada a cada minuto. */
const FEED_REFETCH_MS = 60_000;
/** Exibições vão em lote; no pagehide vai o resto por sendBeacon. */
const PLAYS_FLUSH_MS = 15_000;

const ORIENTATIONS: Array<{
  id: Orientation;
  label: string;
  Icon: typeof RectangleHorizontal;
}> = [
  {
    id: "landscape",
    label: LANDING.mockup.landscape,
    Icon: RectangleHorizontal,
  },
  { id: "portrait", label: LANDING.mockup.portrait, Icon: RectangleVertical },
];

/**
 * A TV do hero: o player real espelhando a TV vitrine da Smart Vale naquela
 * orientação. Mesmo `PlayerStage` da TV (vídeo, legenda, QR escaneável,
 * tempo de cada peça), sempre mudo — navegador bloqueia autoplay com som.
 *
 * Cada exibição conta no relatório do anunciante, por isso a TV para quando
 * ninguém pode vê-la (aba escondida ou fora da tela). Sem vitrine ou sem
 * peça, fica o slide de exemplo desenhado em CSS.
 */
export function TvMockup() {
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [current, setCurrent] = useState<DisplaySlide | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const seen = useSeen(screenRef);

  const feed = useGetVitrineFeed(orientation, {
    query: {
      queryKey: getGetVitrineFeedQueryKey(orientation),
      retry: false,
      refetchInterval: FEED_REFETCH_MS,
      refetchOnWindowFocus: false,
    },
  });
  const slides = feed.data?.slides ?? [];
  const live = slides.length > 0;

  // Uma fila por orientação: o lote diz de qual vitrine são as exibições.
  const queue = useMemo(
    () =>
      createVitrinePlaysQueue({
        orientation,
        send: (body) => recordVitrinePlays(body),
      }),
    [orientation],
  );
  useEffect(() => {
    const id = window.setInterval(() => void queue.flush(), PLAYS_FLUSH_MS);
    const onHide = () => queue.flushBeacon();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", onHide);
      // Trocou de orientação ou saiu da página: o que sobrou vai agora.
      queue.flushBeacon();
    };
  }, [queue]);

  // Girou a TV: o badge espera o player novo dizer o que está no ar.
  useEffect(() => setCurrent(null), [orientation]);

  const portrait = orientation === "portrait";
  const kind = current
    ? current.mediaKind === "image"
      ? "image"
      : "video"
    : null;
  const KindIcon = kind === "video" ? PlayCircle : Image;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <div className="flex w-full flex-wrap items-center justify-center gap-3">
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
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                orientation === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {/* Acompanha a peça da tela: muda junto no rodízio. Sem peça real, some. */}
        {live && kind ? (
          <span
            data-testid="tv-kind"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground"
          >
            <span className="sr-only">{LANDING.mockup.kindLabel}: </span>
            <KindIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            {LANDING.mockup.kinds[kind]}
          </span>
        ) : null}
      </div>

      <div className={cn("w-full", portrait && "max-w-[15rem]")}>
        <div className="rounded-xl border-4 border-neutral-800 bg-neutral-800 shadow-lg">
          <div
            ref={screenRef}
            role="img"
            aria-label={LANDING.mockup.screenLabel}
            data-testid="tv-screen"
            data-orientation={orientation}
            className={cn(
              "relative overflow-hidden rounded-md bg-black",
              portrait ? "aspect-[9/16]" : "aspect-video",
              !live &&
                "bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.55),transparent_60%)]",
            )}
            style={{ containerType: "size" }}
          >
            {live ? (
              <PlayerStage
                key={orientation}
                slides={slides}
                muted
                paused={!seen}
                onPlay={(s) => queue.push(s)}
                onSlideChange={setCurrent}
              />
            ) : (
              <>
                <div className="absolute bottom-[3cqmin] left-[3cqmin] right-[26cqmin] z-10">
                  <span
                    data-testid="tv-caption"
                    className="block truncate rounded-[1cqmin] bg-black/55 px-[3cqmin] py-[2cqmin] text-[5cqmin] font-medium text-white"
                  >
                    {LANDING.mockup.caption}
                  </span>
                </div>

                {/* Branco do QR real da TV, não do tema. */}
                <div className="absolute bottom-[3cqmin] right-[3cqmin] z-10 rounded-[1cqmin] bg-[#fff] p-[1.5cqmin] text-center">
                  <span className="block text-[3cqmin] font-semibold tracking-[0.12em] text-black">
                    {LANDING.mockup.qrLabel}
                  </span>
                  <QrCode className="mx-auto mt-[0.5cqmin] h-[14cqmin] w-[14cqmin] text-black" />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mx-auto h-4 w-24 rounded-b-lg bg-neutral-800" />
      </div>
    </div>
  );
}
