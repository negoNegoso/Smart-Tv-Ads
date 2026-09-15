import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyDetailView } from '../company-detail';

const BASE = {
  id: 5, name: 'Padaria Central', email: null, phone: null, segmentId: null, status: 'active',
  notes: 'Pagamento todo dia 10', cep: '01310100', street: 'Avenida Paulista', number: '1000',
  complement: null, district: 'Bela Vista', city: 'São Paulo', state: 'SP', cityIbge: '3550308',
  lat: -23.56, lng: -46.65, clientId: 1, advertiserId: null, advertiserCompany: null,
  createdAt: '2026-09-15T00:00:00Z', updatedAt: '2026-09-15T00:00:00Z',
  dependencies: { devices: 0, panels: 0, campaigns: 0 },
};

function renderView(company: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = String(url).includes('/companies/5') ? company : [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CompanyDetailView companyId={5} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('CompanyDetailView', () => {
  it('mostra endereço, observações e só a aba de TVs para cliente', async () => {
    renderView(BASE);
    expect(await screen.findByRole('heading', { name: 'Padaria Central' })).toBeInTheDocument();
    expect(screen.getByText('Avenida Paulista, 1000 · Bela Vista · São Paulo/SP · CEP 01310-100')).toBeInTheDocument();
    expect(screen.getByText('Pagamento todo dia 10')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'TVs' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Campanhas' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Contas de acesso' })).toBeInTheDocument();
  });

  it('empresa só anunciante abre na aba de campanhas', async () => {
    renderView({ ...BASE, clientId: null, advertiserId: 2 });
    expect(await screen.findByRole('tab', { name: 'Campanhas' })).toHaveAttribute('data-state', 'active');
    expect(screen.queryByRole('tab', { name: 'TVs' })).not.toBeInTheDocument();
  });
});
