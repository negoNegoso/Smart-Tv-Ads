import { useEffect, useState } from 'react';

export type FlyerOrientation = 'landscape' | 'portrait';

export interface FlyerPreviewPayload {
  campaignId: number | null;
  headline: string | null;
  body: string | null;
  items: Array<{ name: string; priceCents: number; oldPriceCents: number | null; imageUrl: string | null; unit: string | null; featured: boolean }>;
  identity?: { logoUrl?: string | null; openingHours?: string | null; brandColor?: string | null; brandAccentColor?: string | null };
}

const DEBOUNCE_MS = 600;

/** Quantas páginas cada orientação terá; espelha paginateFlyer do servidor só para o seletor. */
export function flyerPageCount(items: Array<{ featured: boolean }>, orientation: FlyerOrientation): number {
  if (items.length === 0) return 1;
  const featured = Math.min(3, items.filter((i) => i.featured).length);
  const sizes = orientation === 'landscape' ? { cover: 4, page: 8 } : { cover: 6, page: 10 };
  const cover = featured > 0 ? sizes.cover : sizes.page;
  const rest = Math.max(0, items.length - featured - cover);
  return 1 + Math.ceil(rest / sizes.page);
}

/**
 * Prévia = o PNG que vai para a TV, renderizado no servidor pelo mesmo
 * template da publicação. Debounce para não renderizar a cada tecla.
 */
export function FlyerPreview({ panelId, payload }: { panelId: number; payload: FlyerPreviewPayload }) {
  const [orientation, setOrientation] = useState<FlyerOrientation>('landscape');
  const [page, setPage] = useState(1);
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const pageCount = flyerPageCount(payload.items, orientation);
  const body = JSON.stringify({ ...payload, orientation, page: Math.min(page, pageCount) });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState('loading');
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/portal/client/panels/${panelId}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        // O payload pode ter mudado (e o efeito já ter limpado) entre o
        // fetch começar e a resposta chegar — mesmo com o abort acima, uma
        // resposta em voo pode terminar antes de o abort surtir efeito. Sem
        // este `if`, o createObjectURL de uma resposta já superada nunca é
        // revogado (o cleanup já rodou e não roda de novo): um vazamento a
        // cada troca de payload no meio de uma requisição.
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setState('idle');
      } catch (erro) {
        const abortado = erro instanceof DOMException && erro.name === 'AbortError';
        if (!cancelled && !abortado) setState('error');
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [panelId, body]);

  return (
    <div className="space-y-2">
      <div role="tablist" className="flex gap-2">
        {(['landscape', 'portrait'] as const).map((o) => (
          <button
            key={o}
            role="tab"
            type="button"
            aria-selected={orientation === o}
            className={`rounded px-3 py-1 text-sm ${orientation === o ? 'bg-primary text-primary-foreground' : 'border'}`}
            onClick={() => { setOrientation(o); setPage(1); }}
          >
            {o === 'landscape' ? 'Horizontal' : 'Vertical'}
          </button>
        ))}
        <select aria-label="Página da prévia" className="ml-auto rounded border px-2 text-sm" value={Math.min(page, pageCount)} onChange={(e) => setPage(Number(e.target.value))}>
          {Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>{`Página ${i + 1} de ${pageCount}`}</option>)}
        </select>
      </div>
      <div className={`relative mx-auto overflow-hidden rounded border bg-muted ${orientation === 'landscape' ? 'aspect-video w-full' : 'aspect-[9/16] w-1/2'}`}>
        {src ? <img src={src} alt="Prévia do encarte" className="h-full w-full object-contain" /> : null}
        {state === 'loading' ? <span className="absolute right-2 top-2 rounded bg-background/80 px-2 text-xs">Atualizando…</span> : null}
        {state === 'error' ? <span className="absolute inset-0 flex items-center justify-center text-sm text-destructive">Não foi possível gerar a prévia.</span> : null}
      </div>
    </div>
  );
}
