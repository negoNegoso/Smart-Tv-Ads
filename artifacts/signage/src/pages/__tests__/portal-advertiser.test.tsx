import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalAdvertiser from '../portal-advertiser';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalAdvertiser />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalAdvertiser', () => {
  // A regressão que este teste tranca: com `if (!res.ok) return []`, API fora
  // do ar era indistinguível de anunciante sem campanha.
  it('mostra estado de falha quando a API responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderPage();
    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma campanha/i)).not.toBeInTheDocument();
  });

  it('mostra o vazio de verdade quando a API responde sem campanhas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              String(url).includes('/overview')
                ? {
                    period: { days: 30, from: '2026-08-07', to: '2026-09-05' },
                    totals: {
                      plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0,
                      activeCampaigns: 0, reachedDevices: 0,
                      previous: { plays: 0, scans: 0, uniqueVisitors: 0, scanRate: 0 },
                    },
                    series: [{ date: '2026-09-05', plays: 0, scans: 0, uniqueVisitors: 0 }],
                  }
                : [],
            ),
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText(/nenhuma campanha/i)).toBeInTheDocument();
  });
});
