import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCampaignForm } from '../use-campaign-form';

afterEach(() => vi.unstubAllGlobals());

function okFetch() {
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('useCampaignForm — faixas de horário', () => {
  it('envia timeWindows no corpo, vazio quando não há faixa', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    await act(async () => { await result.current.submit(); });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).timeWindows).toEqual([]);
  });

  it('envia as faixas editadas', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.addWindow());
    act(() => result.current.updateWindow(0, { start: 420, end: 600 }));
    await act(async () => { await result.current.submit(); });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).timeWindows).toEqual([{ start: 420, end: 600 }]);
  });

  it('não passa de 4 faixas', () => {
    const { result } = renderHook(() => useCampaignForm());
    for (let i = 0; i < 6; i++) act(() => result.current.addWindow());
    expect(result.current.timeWindows).toHaveLength(4);
  });

  it('remove a faixa pelo índice', () => {
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.addWindow());
    act(() => result.current.addWindow());
    act(() => result.current.updateWindow(1, { start: 1080, end: 1320 }));
    act(() => result.current.removeWindow(0));
    expect(result.current.timeWindows).toEqual([{ start: 1080, end: 1320 }]);
  });

  it('faixa inválida: submit recusa sem chamar a API', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.addWindow());
    act(() => result.current.updateWindow(0, { start: 600, end: 420 }));
    expect(result.current.timeWindowsValid).toBe(false);
    let outcome!: { ok: boolean; error?: string };
    await act(async () => { outcome = await result.current.submit(); });
    expect(outcome).toEqual({ ok: false, error: 'Fim da faixa precisa ser depois do início' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reset carrega as faixas da campanha e volta a vazio na nova', () => {
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.reset({
      id: 1, advertiserId: 3, name: 'C', contractValue: 0, targetMode: 'all',
      startsAt: '2026-09-20T00:00:00.000Z', endsAt: '2026-09-27T00:00:00.000Z',
      timeWindows: [{ start: 420, end: 600 }],
    }));
    expect(result.current.timeWindows).toEqual([{ start: 420, end: 600 }]);
    act(() => result.current.reset(null));
    expect(result.current.timeWindows).toEqual([]);
  });
});

describe('useCampaignForm — inserções por volta', () => {
  it('envia 1 sem mexer e o valor escolhido depois', async () => {
    const fetchMock = okFetch();
    const { result } = renderHook(() => useCampaignForm());
    await act(async () => { await result.current.submit(); });
    act(() => result.current.setLoopInsertions(3));
    await act(async () => { await result.current.submit(); });
    const bodies = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(init.body as string));
    expect(bodies.map((body) => body.loopInsertions)).toEqual([1, 3]);
  });

  it('reset carrega as inserções da campanha e volta a 1 na nova', () => {
    const { result } = renderHook(() => useCampaignForm());
    act(() => result.current.reset({
      id: 1, advertiserId: 3, name: 'C', contractValue: 0, targetMode: 'all',
      startsAt: '2026-09-20T00:00:00.000Z', endsAt: '2026-09-27T00:00:00.000Z',
      loopInsertions: 4,
    }));
    expect(result.current.loopInsertions).toBe(4);
    act(() => result.current.reset(null));
    expect(result.current.loopInsertions).toBe(1);
  });
});
