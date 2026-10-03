import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Analytics from '../analytics';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PERIOD = { days: 30, from: '2026-09-10', to: '2026-09-11' };
const OVERVIEW = {
  period: PERIOD,
  totals: {
    plays: 48210, durationSeconds: 7200, scans: 391, uniqueVisitors: 274, scanRate: 0.0081,
    previous: { plays: 43044, durationSeconds: 7000, scans: 376, uniqueVisitors: 280, scanRate: 0.0087 },
  },
  now: { devices: 14, devicesOnline: 12, clients: 6 },
  series: [
    { date: '2026-09-10', plays: 1610, scans: 12, activeDevices: null, totalDevices: 13 },
    { date: '2026-09-11', plays: 1702, scans: 15, activeDevices: 12, totalDevices: 14 },
  ],
};
const HOURLY = { period: PERIOD, hours: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: hour === 19 ? 40 : 1 })) };
const RANKINGS = {
  period: PERIOD,
  campaigns: [{ campaignId: 4, name: 'Natal', advertiserName: 'Padaria Central', plays: 9120 }],
  devices: [{ deviceId: 2, name: 'TV do balcão', clientName: 'Padaria Central', plays: 6011 }],
  announcements: [{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137, durationSeconds: 3900 }],
};

function stubApi({ rankingsStatus = 200 }: { rankingsStatus?: number } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/analytics/overview')) return json(OVERVIEW);
    if (url.includes('/analytics/hourly')) return json(HOURLY);
    if (url.includes('/analytics/rankings')) return rankingsStatus === 200 ? json(RANKINGS) : json({}, rankingsStatus);
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Analytics />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Visão geral', () => {
  it('mostra os cards do período com a variação e os de agora', async () => {
    stubApi();
    renderPage();
    expect(await screen.findByText('48.210')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getByText('12 de 14')).toBeInTheDocument();
  });

  it('mostra os quatro blocos', async () => {
    stubApi();
    renderPage();
    expect(await screen.findByText('Exibições e scans por dia')).toBeInTheDocument();
    expect(screen.getByText('TVs que funcionaram por dia')).toBeInTheDocument();
    expect(screen.getByText('Exibições por horário')).toBeInTheDocument();
    expect(await screen.findByText('Pico: 19h (40 exibições)')).toBeInTheDocument();
    expect(await screen.findByText(/sem dados/i)).toBeInTheDocument();
  });

  it('rankings levam para a campanha e para a TV', async () => {
    stubApi();
    renderPage();
    expect(await screen.findByRole('link', { name: /Natal/ })).toHaveAttribute('href', '/campaigns/4');
    expect(screen.getByRole('link', { name: /TV do balcão/ })).toHaveAttribute('href', '/devices/2');
    expect(screen.getByRole('row', { name: /Pão de mel/ })).toBeInTheDocument();
  });

  it('ranking fora do ar não derruba os gráficos', async () => {
    stubApi({ rankingsStatus: 500 });
    renderPage();
    // Campanhas, TVs e Peças vêm da mesma consulta: os três blocos mostram o erro.
    expect(await screen.findAllByText('Não foi possível carregar')).toHaveLength(3);
    expect(screen.getByText('48.210')).toBeInTheDocument();
    expect(screen.getByText('Pico: 19h (40 exibições)')).toBeInTheDocument();
  });

  it('trocar o período refaz as três consultas com o novo days', async () => {
    const fetchMock = stubApi();
    renderPage();
    await screen.findByText('48.210');
    await userEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: '7 dias' }));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes('/analytics/overview?days=7'))).toBe(true);
      expect(urls.some((u) => u.includes('/analytics/hourly?days=7'))).toBe(true);
      expect(urls.some((u) => u.includes('/analytics/rankings?days=7'))).toBe(true);
    });
  });
});
