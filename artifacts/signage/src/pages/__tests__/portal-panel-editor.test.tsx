import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortalPanelEditor from '../portal-panel-editor';

const panel = {
  id: 1, clientId: 7, kind: 'menu', name: 'Cardápio', template: 'menu-basico',
  status: 'draft', duration: 10, headline: null, body: null, publishedAt: null,
  items: [
    { id: 1, panelId: 1, name: 'Coxinha', description: null, priceCents: 750, oldPriceCents: null, category: 'Lanches', imageUrl: null, displayOrder: 0, isActive: true },
  ],
};

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalPanelEditor panelId={1} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('PortalPanelEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(panel), { headers: { 'Content-Type': 'application/json' } })));
  });

  it('carrega os itens existentes na tabela', async () => {
    renderEditor();
    expect(await screen.findByDisplayValue('Coxinha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7,50')).toBeInTheDocument();
  });

  it('adiciona uma linha vazia ao clicar em adicionar item', async () => {
    renderEditor();
    await screen.findByDisplayValue('Coxinha');
    await userEvent.click(screen.getByRole('button', { name: /adicionar item/i }));
    await waitFor(() => expect(screen.getAllByPlaceholderText(/nome do item/i)).toHaveLength(2));
  });

  it('preço digitado vira centavos no corpo enviado', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(panel), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    await screen.findByDisplayValue('Coxinha');
    await userEvent.clear(screen.getByDisplayValue('7,50'));
    await userEvent.type(screen.getByPlaceholderText(/pre[çc]o/i), '12,90');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse((put![1] as RequestInit).body as string).items[0].priceCents).toBe(1290);
    });
  });
});
