import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortalPanels from '../portal-panels';

const panels = [
  { id: 1, clientId: 7, kind: 'menu', name: 'Cardápio da semana', template: 'menu-basico', status: 'published', duration: 10, headline: null, body: null, publishedAt: '2026-09-01T12:00:00Z', artOutdated: false, campaignId: null, publishedCampaign: null, items: [] },
  { id: 2, clientId: 12, kind: 'promo', name: 'Pizza em dobro', template: 'promo-foto', status: 'draft', duration: 10, headline: null, body: null, publishedAt: null, artOutdated: false, campaignId: null, publishedCampaign: null, items: [] },
];

// O admin descobre as lojas pelo cadastro de empresas: só as que têm cliente.
const companies = [
  { id: 1, name: 'Padaria Central', clientId: 7, advertiserId: null },
  { id: 2, name: 'Pizzaria da Praça', clientId: 12, advertiserId: null },
  { id: 3, name: 'Mercado Bom Preço', clientId: 15, advertiserId: 4 },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let calls: Array<{ url: string; init?: RequestInit }>;

function renderAdmin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalPanels variant="admin" onEdit={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('Painéis no admin', () => {
  beforeEach(() => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const href = String(url);
        calls.push({ url: href, init });
        if (href.includes('/companies')) return json(companies);
        if (href.endsWith('/copy')) return json([{ ...panels[0], id: 30, clientId: 12, status: 'draft' }], 201);
        if (init?.method === 'POST') return json({ ...panels[1], id: 3, clientId: 12 }, 201);
        if (href.includes('clientId=12')) return json([panels[1]]);
        return json(panels);
      }),
    );
  });

  it('lista os painéis de todas as lojas com o nome da loja', async () => {
    renderAdmin();
    expect(await screen.findByText('Cardápio da semana')).toBeInTheDocument();
    // O nome da loja também está no seletor; aqui interessa o do card.
    expect(await screen.findByText(/Padaria Central/, { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Pizzaria da Praça/, { selector: 'p' })).toBeInTheDocument();
    // O admin não tem TV própria: o aviso de "sem TV vinculada" é do lojista.
    expect(calls.some((c) => c.url.includes('/devices'))).toBe(false);
    expect(screen.queryByText(/não tem TV vinculada/i)).not.toBeInTheDocument();
  });

  it('em "Todas as lojas" não deixa criar; escolher a loja filtra e cria nela', async () => {
    renderAdmin();
    await screen.findByText('Cardápio da semana');
    const criar = screen.getByRole('button', { name: 'Nova promoção' });
    expect(criar).toBeDisabled();

    await userEvent.selectOptions(await screen.findByRole('combobox'), '12');
    await waitFor(() => expect(screen.queryByText('Cardápio da semana')).not.toBeInTheDocument());
    expect(calls.some((c) => c.url.includes('clientId=12'))).toBe(true);

    await waitFor(() => expect(criar).toBeEnabled());
    await userEvent.click(criar);
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(JSON.parse(post!.init!.body as string).clientId).toBe(12);
    });
  });

  it('copia um painel para outras lojas, sem oferecer a loja de origem', async () => {
    renderAdmin();
    await screen.findByText('Cardápio da semana');
    const card = screen.getByText('Cardápio da semana').closest('[class*="rounded"]') as HTMLElement;
    await userEvent.click(within(card).getByRole('button', { name: /Copiar para/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Padaria Central')).not.toBeInTheDocument();
    const copiar = within(dialog).getByRole('button', { name: 'Copiar' });
    expect(copiar).toBeDisabled();

    await userEvent.click(within(dialog).getByLabelText('Pizzaria da Praça'));
    await userEvent.click(within(dialog).getByLabelText('Mercado Bom Preço'));
    await userEvent.click(copiar);

    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/panels/1/copy'));
      expect(post).toBeDefined();
      expect(JSON.parse(post!.init!.body as string)).toEqual({ clientIds: [12, 15] });
    });
  });
});
