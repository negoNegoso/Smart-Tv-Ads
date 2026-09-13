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
    stubPortalFetch([TV_RECEPCAO]);
    renderPage();
    // A TV aparece também no card de prévia: o nome é procurado na tabela.
    expect(await screen.findByRole('cell', { name: 'TV Recepção' })).toBeInTheDocument();
    // KPI (total do período) e linha da TV têm valores distintos agora —
    // 1.234 e 987 —, então cada assert aponta para um elemento só, em vez de
    // aceitar "apareceu em algum lugar".
    expect(screen.getByText('1.234')).toBeInTheDocument();
    expect(screen.getByText('987')).toBeInTheDocument();
  });

  it('com TV, mostra a prévia dela buscada na rota do portal', async () => {
    const fetchMock = stubPortalFetch([TV_RECEPCAO]);
    renderPage();
    expect(await screen.findByText('Prévias das TVs')).toBeInTheDocument();
    expect(await screen.findByText('Nada no ar nesta TV')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/portal/client/devices/1/preview'));
  });

  it('sem TV, não mostra a seção de prévias', async () => {
    stubPortalFetch([]);
    renderPage();
    expect(await screen.findByText('Nenhuma TV encontrada')).toBeInTheDocument();
    expect(screen.queryByText('Prévias das TVs')).not.toBeInTheDocument();
  });
});

const TV_RECEPCAO = {
  id: 1,
  name: 'TV Recepção',
  location: 'Entrada',
  lastSeenAt: '2026-09-05T15:00:00.000Z',
  totalPlays: 987,
  isOnline: true,
};

/** Responde overview, lista de TVs e prévia (rotação vazia) pela URL pedida. */
function stubPortalFetch(devices: Array<typeof TV_RECEPCAO>) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const path = String(url);
    const body = path.includes('/preview')
      ? []
      : path.includes('/overview')
        ? {
            period: { days: 30, from: '2026-08-07', to: '2026-09-05' },
            subjectName: null,
            totals: { plays: 1234, devices: devices.length, devicesOnline: 1, previous: { plays: 1000 } },
            series: [{ date: '2026-09-05', plays: 1234 }],
          }
        : devices;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
