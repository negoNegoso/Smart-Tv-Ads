import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Companies from '../companies';

function json(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

const PADARIA = {
  id: 5, name: 'Padaria Central', status: 'active', city: 'São Paulo', state: 'SP',
  clientId: 1, advertiserId: 2, advertiserCompany: null,
};
// Cidade diferente da PADARIA: evita colisão de texto "São Paulo/SP" no teste
// de listagem (o fixture do brief herdava a mesma cidade via spread).
const MERCADO = {
  ...PADARIA,
  id: 6,
  name: 'Mercado Bom',
  status: 'paused',
  city: 'Rio de Janeiro',
  state: 'RJ',
  clientId: null,
  advertiserId: 3,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Companies />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('Companies', () => {
  it('lista empresas com papéis, cidade e status', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => json(String(url).includes('/companies') ? [PADARIA, MERCADO] : [])));
    renderPage();
    expect(await screen.findByText('Padaria Central')).toBeInTheDocument();
    expect(screen.getByText('São Paulo/SP', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getAllByText('Cliente')).toHaveLength(1);
    expect(screen.getAllByText('Anunciante')).toHaveLength(2);
    expect(screen.getByText('Pausada', { selector: 'div' })).toBeInTheDocument();
  });

  it('filtra por papel pedindo à API', async () => {
    const fetchMock = vi.fn((_url: string) => json([]));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    await userEvent.selectOptions(screen.getByLabelText('Papel'), 'advertiser');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('api/companies?role=advertiser'), expect.anything()),
    );
  });
});
