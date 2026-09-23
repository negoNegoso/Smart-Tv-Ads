import { useEffect, useRef, useState } from 'react';
import { getYouTubeMeta } from '@workspace/api-client-react';
import { parseYouTubeUrl, youtubeThumbnailUrl } from '@workspace/db/youtube';
import { PiecePreview } from '@/components/piece-preview';
import { imageOrientation } from '@/lib/piece-orientation';
import { cn } from '@/lib/utils';

type Orientation = 'landscape' | 'portrait';
type MediaKind = 'image' | 'youtube_video' | 'youtube_playlist';

const DEBOUNCE_MS = 500;

const OPTIONS: Array<{ value: Orientation; label: string }> = [
  { value: 'landscape', label: 'Horizontal' },
  { value: 'portrait', label: 'Vertical' },
];

/**
 * Preview da peça e o seletor de orientação, no formulário da biblioteca.
 * Detecta sozinho quando o operador escolhe outro arquivo ou cola outro link;
 * o que já veio salvo (edição) não é redetectado, para não desfazer uma
 * correção manual.
 */
export function PieceOrientationField({
  mediaKind,
  youtubeUrl,
  files,
  fallbackPoster,
  caption,
  value,
  onChange,
}: {
  mediaKind: MediaKind;
  youtubeUrl: string;
  files: FileList | undefined;
  /** Arte já salva (edição), mostrada enquanto nenhum arquivo novo é escolhido. */
  fallbackPoster: string | null;
  caption: string | null;
  value: Orientation;
  onChange: (value: Orientation) => void;
}) {
  const file = files && files.length > 0 ? files[0] : undefined;
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const initialUrl = useRef(youtubeUrl);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Arte local para o preview; liberada ao trocar de arquivo ou fechar o dialog.
  useEffect(() => {
    if (!file) {
      setLocalUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Arquivo novo: a orientação vem das dimensões da imagem. Em peça de
  // YouTube o arquivo é só a capa de fallback e não decide nada.
  useEffect(() => {
    if (!file || mediaKind !== 'image') return;
    let cancelled = false;
    imageOrientation(file).then((o) => {
      if (!cancelled) onChangeRef.current(o);
    });
    return () => {
      cancelled = true;
    };
  }, [file, mediaKind]);

  // Link novo: pergunta ao servidor. Ele reconhece Short pelo link /shorts/;
  // link comum (watch?v=, playlist) vale horizontal e o operador corrige no
  // seletor manual abaixo se for o caso.
  useEffect(() => {
    if (mediaKind === 'image' || youtubeUrl === initialUrl.current || !parseYouTubeUrl(youtubeUrl)) {
      setDetecting(false);
      return;
    }
    let cancelled = false;
    setDetecting(true);
    const timer = setTimeout(() => {
      getYouTubeMeta({ url: youtubeUrl })
        .then((meta) => {
          if (!cancelled) onChangeRef.current(meta.orientation);
        })
        .catch(() => {
          // Sem resposta: fica o que está marcado; o operador decide.
        })
        .finally(() => {
          if (!cancelled) setDetecting(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mediaKind, youtubeUrl]);

  const ref = mediaKind === 'image' ? null : parseYouTubeUrl(youtubeUrl);
  const videoId = ref?.kind === 'youtube_video' ? ref.id : null;
  const poster = localUrl ?? (videoId ? youtubeThumbnailUrl(videoId) : fallbackPoster);

  return (
    <div className="space-y-3">
      <PiecePreview key={videoId ?? 'sem-video'} orientation={value} posterUrl={poster} caption={caption} videoId={videoId} />
      <div className="flex items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Orientação da peça" className="inline-flex rounded-md border p-0.5">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors',
                value === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {detecting ? <span className="text-xs text-muted-foreground">Detectando formato…</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {value === 'portrait' ? 'Toca só nas TVs em modo retrato.' : 'Toca só nas TVs deitadas.'}
      </p>
    </div>
  );
}
