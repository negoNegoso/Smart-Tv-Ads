import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FlyerEditor, { draftsToItems } from '../flyer-editor';

const panel = {
  id: 1, clientId: 7, kind: 'flyer', name: 'Encarte da semana', template: 'encarte-grade',
  status: 'draft', duration: 10, headline: null, body: null, publishedAt: null,
  campaignId: null, artOutdated: false, publishedCampaign: null,
  createdAt: '2026-09-24T00:00:00Z', updatedAt: '2026-09-24T00:00:00Z',
  items: [
    { id: 1, panelId: 1, name: 'Arroz 5kg', description: null, priceCents: 2199, oldPriceCents: null, category: null, imageUrl: null, displayOrder: 0, isActive: true, unit: 'PACOTE', featured: true },
  ],
};
const identity = { clientId: 7, companyName: 'Mercado', logoUrl: null, openingHours: null, brandColor: null, brandAccentColor: null, address: 'Rua A, 10' };

function mockFetch(overrides: { campaignOptions?: unknown[] } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    if (u.includes('/preview')) return new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
    if (u.includes('/campaign-options')) return json(overrides.campaignOptions ?? []);
    if (u.includes('/identity')) return json(identity);
    if (init?.method === 'PUT') return json(panel.items);
    return json(panel);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} }));
  return fetchMock;
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FlyerEditor panel={panel as never} onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('draftsToItems', () => {
  it('converte preço, unidade e destaque', () => {
    const r = draftsToItems([{ name: 'Arroz', price: '21,99', oldPrice: '', unit: 'kg', featured: true, imageUrl: null }]);
    expect(r).toEqual({ ok: true, items: [{ name: 'Arroz', description: null, category: null, priceCents: 2199, oldPriceCents: null, unit: 'kg', featured: true, imageUrl: null }] });
  });
  it('marca a linha com preço inválido', () => {
    const r = draftsToItems([{ name: 'Arroz', price: 'abc', oldPrice: '', unit: '', featured: false, imageUrl: null }]);
    expect(r.ok).toBe(false);
  });
});

describe('FlyerEditor', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('salvar envia unidade e destaque', async () => {
    const fetchMock = mockFetch();
    renderEditor();
    await screen.findByDisplayValue('Arroz 5kg');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(JSON.parse(String(put![1]!.body)).items[0]).toMatchObject({ unit: 'PACOTE', featured: true });
    });
  });

  it('avisa quando há mais de 3 destaques', async () => {
    mockFetch();
    renderEditor();
    await screen.findByDisplayValue('Arroz 5kg');
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: /adicionar produto/i }));
    const stars = screen.getAllByRole('checkbox', { name: /destaque/i });
    for (const star of stars.slice(1)) await userEvent.click(star);
    expect(await screen.findByText(/só os 3 primeiros vão para a faixa/i)).toBeInTheDocument();
  });

  it('destino campanha desabilitado sem campanha elegível', async () => {
    mockFetch({ campaignOptions: [] });
    renderEditor();
    expect(await screen.findByRole('radio', { name: /campanha/i })).toBeDisabled();
  });

  it('escolher campanha envia campaignId', async () => {
    const fetchMock = mockFetch({ campaignOptions: [{ id: 3, name: 'Semana do cliente', startsAt: '2026-09-20T03:00:00Z', endsAt: '2026-09-28T02:59:00Z' }] });
    renderEditor();
    await userEvent.click(await screen.findByRole('radio', { name: /campanha/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /campanha/i }), '3');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([u, init]) => init?.method === 'PATCH' && String(u).includes('/panels/1'));
      expect(JSON.parse(String(patch![1]!.body))).toMatchObject({ campaignId: 3 });
    });
  });

  it('prévia pede a orientação escolhida', async () => {
    const fetchMock = mockFetch();
    renderEditor();
    await userEvent.click(await screen.findByRole('tab', { name: /vertical/i }));
    await waitFor(() => {
      const previews = fetchMock.mock.calls.filter(([u]) => String(u).includes('/preview'));
      expect(JSON.parse(String(previews.at(-1)![1]!.body)).orientation).toBe('portrait');
    });
  });

  it('cor da loja salva na identidade', async () => {
    const fetchMock = mockFetch();
    renderEditor();
    await userEvent.click(await screen.findByRole('button', { name: /identidade da loja/i }));
    const hex = screen.getByLabelText(/cor de fundo \(hex\)/i);
    await userEvent.clear(hex);
    await userEvent.type(hex, '#112233');
    await userEvent.click(screen.getByRole('button', { name: /salvar identidade/i }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([u, init]) => init?.method === 'PATCH' && String(u).includes('/identity'));
      expect(JSON.parse(String(patch![1]!.body))).toMatchObject({ brandColor: '#112233' });
    });
  });
});
