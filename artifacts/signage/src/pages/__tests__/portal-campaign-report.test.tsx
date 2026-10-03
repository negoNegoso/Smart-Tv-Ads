import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PortalCampaignReport from '../portal-campaign-report';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const REPORT = {
  campaign: { id: 4, name: 'Natal', startsAt: '2026-09-01T03:00:00.000Z', endsAt: '2026-10-01T02:59:59.000Z', isActive: true, status: 'encerrada' },
  period: { from: '2026-09-01', to: '2026-09-30' },
  totals: { plays: 9120, durationSeconds: 91200, devicesPlayed: 9, devicesTargeted: 12, stores: 6, scans: 81, uniqueVisitors: 60, scanRate: 0.0089 },
  series: [{ date: '2026-09-01', plays: 300, scans: 2 }],
  hours: Array.from({ length: 24 }, (_, hour) => ({ hour, plays: hour === 18 ? 50 : 1 })),
  devices: [{ deviceId: 2, storeName: 'Padaria Central', deviceName: 'Balcão', location: 'Entrada', plays: 1240, firstPlayedAt: '2026-09-01T11:02:00.000Z', lastPlayedAt: '2026-09-30T21:40:00.000Z' }],
  announcements: [{ announcementId: 9, title: 'Pão de mel', plays: 3001, scans: 41, scanRate: 0.0137 }],
};

function stub(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string) => json(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(id = 4) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalCampaignReport id={id} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Relatório da campanha', () => {
  it('busca o relatório da campanha pedida', async () => {
    const fetchMock = stub(REPORT);
    renderPage(4);
    await screen.findByRole('heading', { name: 'Natal', level: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toContain('api/portal/advertiser/campaigns/4/report');
  });

  it('campanha no período mas inativa aparece como pausada, não no ar', async () => {
    stub({
      ...REPORT,
      campaign: { ...REPORT.campaign, status: 'no_ar', isActive: false },
      period: { from: '2026-09-01', to: '2026-09-15' },
    });
    renderPage();
    expect(await screen.findByText('Pausada')).toBeInTheDocument();
    expect(screen.getByText('desde 01/09/2026 · pausada')).toBeInTheDocument();
    expect(screen.queryByText('No ar')).not.toBeInTheDocument();
  });

  it('mostra a prova de veiculação: período, cards e onde passou', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByText('01/09/2026 a 30/09/2026')).toBeInTheDocument();
    expect(screen.getByText('9.120')).toBeInTheDocument();
    expect(screen.getByText('9 de 12 no alvo')).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Padaria Central/ })).toHaveTextContent('1.240');
  });

  it('mostra o resultado: scans, peças e horário de pico', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByRole('row', { name: /Pão de mel/ })).toHaveTextContent('1,37%');
    expect(screen.getByText('Pico: 18h (50 exibições)')).toBeInTheDocument();
  });

  it('tem botão de impressão e cabeçalho do comprovante', async () => {
    stub(REPORT);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Imprimir / PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Período de 1 de setembro de 2026 a 30 de setembro de 2026/)).toBeInTheDocument();
  });

  it('campanha agendada diz quando começa', async () => {
    stub({ ...REPORT, campaign: { ...REPORT.campaign, status: 'agendada' }, period: { from: '2026-11-01', to: '2026-11-01' }, devices: [], announcements: [], series: [] });
    renderPage();
    expect(await screen.findByText('A campanha começa em 01/11/2026.')).toBeInTheDocument();
    expect(screen.queryByText('Onde passou')).toBeNull();
  });

  it('404 mostra campanha não encontrada com volta para a lista', async () => {
    stub({ error: 'Campaign not found' }, 404);
    renderPage();
    expect(await screen.findByText('Campanha não encontrada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para Desempenho/ })).toHaveAttribute('href', '/portal/anunciante');
  });

  it('erro de rede oferece tentar de novo', async () => {
    stub({}, 500);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
