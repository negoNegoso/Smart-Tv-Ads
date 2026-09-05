import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalClient from '../portal-client';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalClient />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalClient', () => {
  it('mostra estado de falha quando a API responde erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderPage();
    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma tv/i)).not.toBeInTheDocument();
  });

  it('mostra a TV e o total do período', async () => {
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
                    subjectName: null,
                    totals: { plays: 1234, devices: 1, devicesOnline: 1, previous: { plays: 1000 } },
                    series: [{ date: '2026-09-05', plays: 1234 }],
                  }
                : [
                    {
                      id: 1,
                      name: 'TV Recepção',
                      location: 'Entrada',
                      lastSeenAt: '2026-09-05T15:00:00.000Z',
                      totalPlays: 987,
                      isOnline: true,
                    },
                  ],
            ),
        }),
      ),
    );
    renderPage();
    expect(await screen.findByText('TV Recepção')).toBeInTheDocument();
    // KPI (total do período) e linha da TV têm valores distintos agora —
    // 1.234 e 987 —, então cada assert aponta para um elemento só, em vez de
    // aceitar "apareceu em algum lugar".
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('987')).toBeInTheDocument();
  });
});
