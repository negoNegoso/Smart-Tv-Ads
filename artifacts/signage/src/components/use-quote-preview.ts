import { useEffect, useState } from 'react';
import type { CampaignTargetMode } from '@/components/use-campaign-form';
import { REACH_PREVIEW_DEBOUNCE_MS } from '@/components/use-reach-preview';
import { previewQuote, type QuotePreview } from '@/lib/pricing-api';

type Disponivel = Extract<QuotePreview, { available: true }>;

/**
 * Valor de tabela da campanha que o admin está montando, calculado pela API
 * com o preço configurado. Mesmo cuidado da prévia de alcance: espera o admin
 * parar de mexer, cancela a pergunta anterior e qualquer falha (ou resposta
 * fora do formato) vira null — o valor ajuda a vender, nunca impede salvar.
 */
export function useQuotePreview(
  input: { advertiserId: number | null; targetMode: CampaignTargetMode; deviceIds: number[]; segmentIds: number[]; loopInsertions: number },
  enabled: boolean,
): Disponivel | null {
  const [preview, setPreview] = useState<Disponivel | null>(null);
  const body = JSON.stringify(input);

  useEffect(() => {
    if (!enabled || input.advertiserId === null) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await previewQuote(
          {
            targetMode: input.targetMode,
            deviceIds: input.deviceIds,
            segmentIds: input.segmentIds,
            advertiserId: input.advertiserId!,
            loopInsertions: input.loopInsertions,
            period: 'monthly',
          },
          controller.signal,
        );
        const ok = data && (data as Disponivel).available === true && typeof (data as Disponivel).quote?.monthlyCents === 'number';
        if (!controller.signal.aborted) setPreview(ok ? (data as Disponivel) : null);
      } catch {
        if (!controller.signal.aborted) setPreview(null);
      }
    }, REACH_PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `body` já carrega todo o `input`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, enabled]);

  return preview;
}
