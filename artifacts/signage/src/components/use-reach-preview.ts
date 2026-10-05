import { useEffect, useState } from "react";
import type { CampaignTargetMode } from "@/components/use-campaign-form";

const api = (path: string) => `${import.meta.env.BASE_URL}api${path}`;

export type ReachPreview = {
  reachedCount: number;
  totalDevices: number;
  competitorDeviceIds: number[];
  advertiserSegmentId: number | null;
  advertiserHasSegment: boolean;
  advertiserCompanyId: number | null;
};

/** Espera o admin parar de clicar antes de perguntar à API. */
export const REACH_PREVIEW_DEBOUNCE_MS = 300;

/**
 * Prévia de alcance do alvo escolhido, calculada pela API com a mesma regra
 * da TV. Cada mudança cancela a pergunta anterior: sem isso, a resposta de um
 * alvo antigo podia chegar depois e mostrar a conta errada. Qualquer falha
 * vira null — a prévia ajuda, nunca impede salvar.
 */
export function useReachPreview(
  input: { advertiserId: number | null; targetMode: CampaignTargetMode; deviceIds: number[]; segmentIds: number[] },
  enabled: boolean,
): ReachPreview | null {
  const [preview, setPreview] = useState<ReachPreview | null>(null);
  const body = JSON.stringify(input);

  useEffect(() => {
    if (!enabled || input.advertiserId === null) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(api("/campaigns/reach-preview"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        const data = res.ok ? await res.json() : null;
        if (!controller.signal.aborted) setPreview(data && typeof data.reachedCount === "number" ? data : null);
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
