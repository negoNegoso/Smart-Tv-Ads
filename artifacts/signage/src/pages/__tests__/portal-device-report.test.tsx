import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalDeviceReport from '../portal-device-report';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const REPORT = {
  device: { id: 2, name: 'Balcão', location: 'Entrada', isOnline: true },
  period: { days: 30, from: '2026-09-04', to: '2026-10-03' },
  totals: { plays: 6011, durationSeconds: 60110, daysOnline: 28, daysWithHistory: 30, previous: { plays: 5800 } },
  series: [
    { date: '2026-10-01', plays: 200, online: null },
    { date: '2026-10-02', plays: 210, online: false },
    { date: '2026-10-03', plays: 50, online: true },
  ],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: hour === 12 ? 30 : 1 })),
  campaigns: [
    { campaignId: 4, campaignName: 'Natal', advertiserName: 'Padaria Central', plays: 900 },
    { campaignId: null, campaignName: null, advertiserName: null, plays: 300 },
  ],
};

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string) => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(id = 2) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalDeviceReport id={id} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Relatório da TV', () => {
  it('mostra os cards com dias em que funcionou e a variação de exibições', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Balcão', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('6.011')).toBeInTheDocument();
    expect(screen.getByText('+4%')).toBeInTheDocument();
    expect(screen.getByText('28 de 30')).toBeInTheDocument();
    expect(screen.getByText('Online agora')).toBeInTheDocument();
  });

  it('faixa de dias com "sem dados" e o que passou, com o conteúdo da loja', async () => {
    stub(REPORT);
    renderPage();
    const faixa = await screen.findByRole('list', { name: 'Dias no ar' });
    expect(within(faixa).getAllByRole('listitem')[0]).toHaveAttribute('aria-label', '01/10: sem dados');
    expect(screen.getByRole('row', { name: /Natal/ })).toHaveTextContent('Padaria Central');
    expect(screen.getByRole('row', { name: /Conteúdo da loja/ })).toHaveTextContent('300');
    expect(screen.getByText('Pico: 12h (30 exibições)')).toBeInTheDocument();
  });

  it('trocar o período refaz a consulta com o novo days', async () => {
    const fetchMock = stub(REPORT);
    renderPage(2);
    await screen.findByText('6.011');
    expect(String(fetchMock.mock.calls[0][0])).toContain('api/portal/client/devices/2/report?days=30');
    await userEvent.click(within(screen.getByRole('group', { name: 'Período' })).getByRole('button', { name: '7 dias' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('api/portal/client/devices/2/report?days=7'))).toBe(true),
    );
  });

  it('404 mostra TV não encontrada com volta para a lista', async () => {
    stub({ error: 'Device not found' }, 404);
    renderPage();
    expect(await screen.findByText('TV não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Minhas TVs/ })).toHaveAttribute('href', '/portal/tvs');
  });

  it('erro de rede oferece tentar de novo', async () => {
    stub({}, 500);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
