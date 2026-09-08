import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortalPanelEditor, { parsePriceToCents } from '../portal-panel-editor';

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

  it('preço inválido bloqueia o salvar, marca a linha e não chama a API', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' || init?.method === 'PUT') {
        throw new Error('não deveria salvar com preço inválido');
      }
      return new Response(JSON.stringify(panel), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderEditor();
    await screen.findByDisplayValue('Coxinha');
    await userEvent.clear(screen.getByDisplayValue('7,50'));
    // Três casas decimais não é um preço válido — não pode virar 0 nem 1234
    // silenciosamente, tem que travar o salvar.
    await userEvent.type(screen.getByPlaceholderText(/pre[çc]o/i), '12,345');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText(/preço inválido/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'PATCH' || (init as RequestInit)?.method === 'PUT',
      ),
    ).toBe(false);
  });
});

describe('parsePriceToCents', () => {
  it('lê dígitos puros como centavos — os dois últimos dígitos são os centavos', () => {
    expect(parsePriceToCents('1290')).toEqual({ ok: true, cents: 1290 });
  });

  it('lê vírgula com duas casas como moeda brasileira', () => {
    expect(parsePriceToCents('12,90')).toEqual({ ok: true, cents: 1290 });
  });

  it('lê ponto como separador de milhar e vírgula como decimal', () => {
    expect(parsePriceToCents('1.234,56')).toEqual({ ok: true, cents: 123456 });
  });

  it('lê um único dígito decimal como décimos, não como centavos', () => {
    expect(parsePriceToCents('1,5')).toEqual({ ok: true, cents: 150 });
  });

  it('aceita "0,00" como item de cortesia deliberado', () => {
    expect(parsePriceToCents('0,00')).toEqual({ ok: true, cents: 0 });
  });

  it('rejeita três ou mais dígitos decimais em vez de embaralhar os centavos', () => {
    expect(parsePriceToCents('12,345').ok).toBe(false);
  });

  it('rejeita texto vazio em vez de virar 0 silenciosamente', () => {
    expect(parsePriceToCents('').ok).toBe(false);
  });

  it('rejeita texto não numérico em vez de virar 0 silenciosamente', () => {
    expect(parsePriceToCents('abc').ok).toBe(false);
  });
});
