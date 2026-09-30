import { describe, expect, it, vi } from 'vitest';
import type { DisplaySlide } from '@workspace/api-client-react';
import { createVitrinePlaysQueue, VITRINE_QUEUE_MAX } from '../vitrine-plays';

const SLIDE = { announcementId: 10, campaignId: 3, duration: 8 } as DisplaySlide;

function queue(send = vi.fn(async () => ({})), start = 1_000_000) {
  let t = start;
  let n = 0;
  const q = createVitrinePlaysQueue({
    orientation: 'portrait',
    send,
    beacon: vi.fn(() => true),
    now: () => t,
    newId: () => `play-id-${String(++n).padStart(4, '0')}`,
  });
  return { q, send, tick: (ms: number) => (t += ms) };
}

describe('fila de exibições da vitrine', () => {
  it('manda o lote com idade em segundos e playId único', async () => {
    const { q, send, tick } = queue();
    q.push(SLIDE);
    tick(4_000);
    await q.flush();
    expect(send).toHaveBeenCalledWith({
      orientation: 'portrait',
      plays: [{ playId: 'play-id-0001', announcementId: 10, campaignId: 3, durationSeconds: 8, ageSeconds: 4 }],
    });
    expect(q.size()).toBe(0);
  });

  it('no máximo 10 por envio', async () => {
    const { q, send } = queue();
    for (let i = 0; i < 12; i++) q.push(SLIDE);
    await q.flush();
    expect((send.mock.calls[0][0] as { plays: unknown[] }).plays).toHaveLength(10);
    expect(q.size()).toBe(2);
  });

  it('falha no envio devolve os itens com o mesmo playId', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue({});
    const { q } = queue(send);
    q.push(SLIDE);
    await q.flush();
    expect(q.size()).toBe(1);
    await q.flush();
    expect((send.mock.calls[1][0] as { plays: Array<{ playId: string }> }).plays[0].playId).toBe('play-id-0001');
  });

  it('fila vazia não chama a rede', async () => {
    const { q, send } = queue();
    await q.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('fila nunca passa do teto: descarta a mais antiga', () => {
    const { q } = queue();
    for (let i = 0; i < VITRINE_QUEUE_MAX + 5; i++) q.push(SLIDE);
    expect(q.size()).toBe(VITRINE_QUEUE_MAX);
  });

  it('flushBeacon manda até 10 e esvazia o que mandou', () => {
    const beacon = vi.fn(() => true);
    const q = createVitrinePlaysQueue({ orientation: 'landscape', send: vi.fn(), beacon, now: () => 0 });
    for (let i = 0; i < 3; i++) q.push(SLIDE);
    q.flushBeacon();
    expect((beacon.mock.calls[0][0] as { plays: unknown[] }).plays).toHaveLength(3);
    expect(q.size()).toBe(0);
  });
});
