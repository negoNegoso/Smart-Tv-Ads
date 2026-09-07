import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import PortalPanels from '../portal-panels';

const panels = [
  { id: 1, clientId: 7, kind: 'menu', name: 'Cardápio da semana', template: 'menu-basico', status: 'published', duration: 10, headline: null, body: null, publishedAt: '2026-09-01T12:00:00Z', items: [] },
  { id: 2, clientId: 7, kind: 'promo', name: 'Pizza em dobro', template: 'promo-foto', status: 'draft', duration: 10, headline: null, body: null, publishedAt: null, items: [] },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalPanels onEdit={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('PortalPanels', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(panels), { headers: { 'Content-Type': 'application/json' } })));
  });

  it('mostra cada painel com o estado', async () => {
    renderPage();
    expect(await screen.findByText('Cardápio da semana')).toBeInTheDocument();
    expect(screen.getByText('Pizza em dobro')).toBeInTheDocument();
    expect(screen.getByText(/No ar/i)).toBeInTheDocument();
    expect(screen.getByText(/Rascunho/i)).toBeInTheDocument();
  });

  it('erro de rede não vira lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 500 })));
    renderPage();
    await waitFor(() => expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument());
  });

  it('cliente sem painel vê o convite para criar o primeiro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
    renderPage();
    expect(await screen.findByText(/nenhum painel/i)).toBeInTheDocument();
  });
});
