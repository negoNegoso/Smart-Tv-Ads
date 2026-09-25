import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlyerPreview, type FlyerPreviewPayload } from '../flyer-preview';

function payload(headline: string): FlyerPreviewPayload {
  return { campaignId: null, headline, body: null, items: [] };
}

function pngResponse() {
  return new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
}

describe('FlyerPreview', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('payload muda com a requisição em voo: aborta a antiga e não cria URL para a resposta superada', async () => {
    // fetch nunca resolve sozinho aqui — cada chamada fica pendente até o
    // teste decidir resolvê-la, pra simular a resposta atrasada chegando
    // depois que o payload já mudou.
    const resolvers: Array<(r: Response) => void> = [];
    const signals: Array<AbortSignal | undefined> = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return new Promise<Response>((resolve) => resolvers.push(resolve));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<FlyerPreview panelId={1} payload={payload('A')} />);

    // Aguarda o debounce (600ms reais) disparar a primeira requisição.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 2000 });

    // Payload muda com a primeira ainda pendente — o efeito limpa antes do
    // debounce da segunda disparar.
    rerender(<FlyerPreview panelId={1} payload={payload('B')} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 2000 });

    // O cleanup do efeito da primeira requisição chamou controller.abort().
    expect(signals[0]?.aborted).toBe(true);

    // Resposta atrasada da primeira requisição (superada) chega agora.
    await act(async () => {
      resolvers[0]!(pngResponse());
      await Promise.resolve();
      await Promise.resolve();
    });

    // Não cria object URL para uma resposta que já foi superada.
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    // A segunda (válida) resolve normalmente e essa, sim, gera a prévia.
    await act(async () => {
      resolvers[1]!(pngResponse());
    });

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });
});
