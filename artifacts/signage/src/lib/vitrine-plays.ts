import type { DisplaySlide, VitrinePlaysInput } from '@workspace/api-client-react';

/** Mesmo teto do servidor (VitrinePlaysInput.maxItems). */
export const VITRINE_BATCH = 10;
/** Aba esquecida aberta sem rede não pode crescer a fila sem limite. */
export const VITRINE_QUEUE_MAX = 100;

type Item = { playId: string; announcementId: number; campaignId: number | null; durationSeconds: number; at: number };

export interface VitrinePlaysQueue {
  push(slide: DisplaySlide): void;
  /** Manda até 10; devolve os itens à fila se `send` falhar. */
  flush(): Promise<void>;
  /** No pagehide: sendBeacon com até 10, sem esperar resposta. */
  flushBeacon(): void;
  size(): number;
}

/** sendBeacon com JSON: sobrevive ao fechamento da aba, que o fetch comum não garante. */
export function beaconVitrinePlays(body: VitrinePlaysInput): boolean {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  return navigator.sendBeacon(`${import.meta.env.BASE_URL}api/public/vitrine/plays`, blob);
}

/**
 * Exibições que o visitante viu na TV da landing, esperando envio.
 *
 * Como a fila da TV (tv.html): cada exibição ganha um playId na hora, e a
 * idade vai em segundos em vez de data — o relógio do visitante pode estar
 * errado, a diferença não. Reenvio depois de falha usa o mesmo playId, e o
 * servidor deduplica.
 */
export function createVitrinePlaysQueue(opts: {
  orientation: 'landscape' | 'portrait';
  send: (body: VitrinePlaysInput) => Promise<unknown>;
  beacon?: (body: VitrinePlaysInput) => boolean;
  now?: () => number;
  newId?: () => string;
}): VitrinePlaysQueue {
  const now = opts.now ?? Date.now;
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const beacon = opts.beacon ?? beaconVitrinePlays;
  let items: Item[] = [];

  const body = (batch: Item[]): VitrinePlaysInput => ({
    orientation: opts.orientation,
    plays: batch.map((i) => ({
      playId: i.playId,
      announcementId: i.announcementId,
      campaignId: i.campaignId,
      durationSeconds: i.durationSeconds,
      ageSeconds: Math.max(0, Math.round((now() - i.at) / 1000)),
    })),
  });

  return {
    push(slide) {
      items.push({
        playId: newId(),
        announcementId: slide.announcementId,
        campaignId: slide.campaignId ?? null,
        durationSeconds: slide.duration,
        at: now(),
      });
      if (items.length > VITRINE_QUEUE_MAX) items = items.slice(-VITRINE_QUEUE_MAX);
    },
    async flush() {
      if (items.length === 0) return;
      const batch = items.slice(0, VITRINE_BATCH);
      items = items.slice(VITRINE_BATCH);
      try {
        await opts.send(body(batch));
      } catch {
        // Volta para a frente: a próxima rodada tenta de novo com o mesmo playId.
        items = [...batch, ...items].slice(0, VITRINE_QUEUE_MAX);
      }
    },
    flushBeacon() {
      if (items.length === 0) return;
      const batch = items.slice(0, VITRINE_BATCH);
      if (beacon(body(batch))) items = items.slice(VITRINE_BATCH);
    },
    size: () => items.length,
  };
}
