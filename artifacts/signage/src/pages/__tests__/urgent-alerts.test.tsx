import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toaster';
import UrgentAlerts from '../urgent-alerts';

function json(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

const PADARIA = { id: 1, slug: 'padaria', name: 'Padaria' };
const NO_AR = {
  id: 7,
  title: 'Hoje fechamos às 18h',
  body: null,
  targetMode: 'all',
  segmentIds: [],
  companyIds: [],
  startsAt: '2026-10-07T17:00:00.000Z',
  endsAt: '2026-10-07T21:00:00.000Z',
  endedAt: null,
  status: 'active',
  reachedDevices: 42,
  landscapeImageUrl: '/api/uploads/d.png',
  portraitImageUrl: '/api/uploads/e.png',
};

function stub(alerts: unknown[] = []) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/urgent-alerts') && init?.method === 'POST') return json(201, NO_AR);
    if (u.includes('/urgent-alerts')) return json(200, alerts);
    if (u.includes('/segments')) return json(200, [PADARIA]);
    if (u.includes('/companies')) return json(200, [{ id: 9, name: 'Mercado Bom', segmentId: 1 }]);
    return json(404, { error: 'não mockado' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UrgentAlerts />
      <Toaster />
    </QueryClientProvider>,
  );
}

const posts = (fetchMock: ReturnType<typeof stub>) =>
  (fetchMock.mock.calls as unknown as [string, RequestInit | undefined][]).filter(([, init]) => init?.method === 'POST');

afterEach(() => vi.unstubAllGlobals());

describe('UrgentAlerts', () => {
  it('publica só depois de confirmar, com o corpo certo', async () => {
    const fetchMock = stub();
    renderPage();
    await userEvent.type(screen.getByLabelText('Título'), 'Hoje fechamos às 18h');
    await userEvent.click(screen.getByLabelText('Por segmento'));
    await userEvent.click(await screen.findByLabelText('Padaria'));
    await userEvent.selectOptions(screen.getByLabelText('Duração'), '120');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Campanhas ficam pausadas nelas/)).toBeInTheDocument();
    expect(posts(fetchMock)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar agora' }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(posts(fetchMock)[0][1]!.body as string)).toEqual({
      title: 'Hoje fechamos às 18h',
      body: '',
      targetMode: 'segments',
      segmentIds: [1],
      companyIds: [],
      durationMinutes: 120,
    });
  });

  it('publicar fica desabilitado sem título', async () => {
    stub();
    renderPage();
    expect(screen.getByRole('button', { name: 'Publicar aviso' })).toBeDisabled();
  });

  it('mostra o aviso no ar e encerra depois de confirmar', async () => {
    const fetchMock = stub([NO_AR]);
    renderPage();
    expect(await screen.findByText(/No ar em 42 TVs até 18:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Encerrar agora' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(posts(fetchMock).map(([url]) => String(url))).toEqual([expect.stringContaining('/urgent-alerts/7/end')]));
  });
});
