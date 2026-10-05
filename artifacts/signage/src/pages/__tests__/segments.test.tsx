import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Segments from '../segments';

// Response de verdade: o cliente gerado (useListSegments) lê text() e headers,
// e o request() das empresas lê json(). Cada chamada ganha um Response novo
// porque o corpo só pode ser lido uma vez.
function json(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

const PADARIA = { id: 1, slug: 'padaria', name: 'Padaria', companyCount: 3, campaignCount: 1 };
const PANIFICADORA = { id: 2, slug: 'panificadora', name: 'Panificadora', companyCount: 1, campaignCount: 0 };
const VAZIO = { id: 3, slug: 'otica', name: 'Ótica', companyCount: 0, campaignCount: 0 };

function stub(extra: (url: string, init?: RequestInit) => Promise<unknown> | undefined = () => undefined) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    const custom = extra(u, init);
    if (custom) return custom;
    if (u.includes('/companies')) return json(200, [{ id: 9, name: 'Antiga', segmentId: null }, { id: 8, name: 'Nova', segmentId: 1 }]);
    if (u.includes('/segments')) return json(200, [PADARIA, PANIFICADORA, VAZIO]);
    return json(404, { error: 'não mockado' });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Segments />
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

afterEach(() => vi.unstubAllGlobals());

describe('Segments', () => {
  it('lista com o uso e conta as empresas sem segmento', async () => {
    stub();
    renderPage();
    expect(await screen.findByText('Panificadora')).toBeInTheDocument();
    expect(within(row('Padaria')).getByText('3')).toBeInTheDocument();
    expect(await screen.findByText('1 empresa sem segmento')).toBeInTheDocument();
  });

  it('só deixa apagar segmento sem uso', async () => {
    stub();
    renderPage();
    await screen.findByText('Ótica');
    expect(within(row('Padaria')).getByRole('button', { name: 'Apagar' })).toBeDisabled();
    expect(within(row('Ótica')).getByRole('button', { name: 'Apagar' })).toBeEnabled();
  });

  it('renomeia mandando o nome novo', async () => {
    const fetchMock = stub((u, init) => (init?.method === 'PATCH' ? json(200, { ...PANIFICADORA, name: 'Panificação' }) : undefined));
    renderPage();
    await screen.findByText('Panificadora');
    await userEvent.click(within(row('Panificadora')).getByRole('button', { name: 'Renomear' }));
    const input = screen.getByLabelText('Novo nome');
    await userEvent.clear(input);
    await userEvent.type(input, 'Panificação');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/segments/2'), expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Panificação' }) })),
    );
  });

  it('mostra o 409 do renomear', async () => {
    stub((u, init) => (init?.method === 'PATCH' ? json(409, { error: 'Já existe o segmento Padaria — use mesclar' }) : undefined));
    renderPage();
    await screen.findByText('Panificadora');
    await userEvent.click(within(row('Panificadora')).getByRole('button', { name: 'Renomear' }));
    await userEvent.clear(screen.getByLabelText('Novo nome'));
    await userEvent.type(screen.getByLabelText('Novo nome'), 'padaria');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Já existe o segmento Padaria — use mesclar')).toBeInTheDocument();
  });

  it('mescla avisando que os ramos viram concorrentes', async () => {
    const fetchMock = stub((u, init) => (u.includes('/merge') ? json(200, { ...PADARIA, companyCount: 4 }) : undefined));
    renderPage();
    await screen.findByText('Panificadora');
    await userEvent.click(within(row('Panificadora')).getByRole('button', { name: 'Mesclar' }));
    expect(screen.getByText(/passam a ser concorrentes/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Mesclar em'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar mesclar' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/segments/2/merge'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ targetId: 1 }) })),
    );
  });
});
