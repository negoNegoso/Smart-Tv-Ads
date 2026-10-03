import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import CampaignDetail from '../campaign-detail';

const CAMPANHA = {
  id: 42,
  advertiserId: 9,
  companyId: 5,
  advertiserName: 'Padaria Central',
  company: 'Outro nome',
  name: 'Campanha de Natal',
  contractValue: 1000,
  startsAt: '2026-12-01T00:00:00Z',
  endsAt: '2026-12-31T00:00:00Z',
  targetMode: 'all',
  weekdays: [],
  segmentIds: [],
  segmentNames: [],
  isActive: true,
  plays: 0,
  scans: 0,
  totalDuration: 0,
  deviceIds: [],
  announcementIds: [],
  announcementTitles: [],
  announcementLinks: [],
  devices: [],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const chamadas: Array<{ url: string; method: string }> = [];

function renderPagina() {
  chamadas.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      chamadas.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/campaigns/42') && !init?.method) return json(CAMPANHA);
      if (init?.method === 'DELETE') return json({});
      return json([]);
    }),
  );
  const loc = memoryLocation({ path: '/campaigns/42', record: true });
  render(
    <Router hook={loc.hook}>
      <CampaignDetail />
    </Router>,
  );
  return loc;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CampaignDetail', () => {
  it('mostra o caminho Empresas › empresa › campanha', async () => {
    renderPagina();
    const nav = await screen.findByRole('navigation', { name: 'breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Empresas' })).toHaveAttribute('href', '/companies');
    expect(within(nav).getByRole('link', { name: 'Padaria Central' })).toHaveAttribute('href', '/companies/5');
    expect(within(nav).getByText('Campanha de Natal')).toBeInTheDocument();
  });

  it('excluir apaga a campanha e volta para a página da empresa', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    const loc = renderPagina();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Excluir/ }));
    await waitFor(() => expect(loc.history.at(-1)).toBe('/companies/5'));
    expect(chamadas.some((c) => c.method === 'DELETE' && c.url.endsWith('/campaigns/42'))).toBe(true);
  });
});
