import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import PortalPanels from '../portal-panels';
import { Toaster } from '@/components/ui/toaster';

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

/** Com o Toaster montado — só o necessário para o teste de publicação ler o toast na tela. */
function renderPageWithToaster() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PortalPanels onEdit={vi.fn()} />
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('PortalPanels', () => {
  beforeEach(() => {
    // /clients responde uma loja só: é o caso comum, e sem essa distinção
    // o stub devolveria a lista de painéis também para esse endpoint.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/clients')
          ? new Response(JSON.stringify([{ id: 7, name: 'Padaria Central' }]), {
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(JSON.stringify(panels), { headers: { 'Content-Type': 'application/json' } }),
      ),
    );
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

  /**
   * Publicar que falha (422) não pode parecer que deu certo: a TV continua
   * mostrando o que já estava no ar antes. O toast precisa levar a mensagem
   * da API até o lojista, e o botão precisa continuar "Publicar" — nunca
   * "Tirar do ar" — porque nada foi ao ar.
   */
  it('publicar com 422 mostra a mensagem da API e mantém "Publicar"', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (init?.method === 'POST' && href.includes('/publish')) {
        return new Response(JSON.stringify({ error: 'Painel sem conteúdo para publicar.', pageNo: 0 }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href.includes('devices')) {
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(panels), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPageWithToaster();

    // Só o painel em rascunho ("Pizza em dobro") tem botão "Publicar" — o outro
    // já está no ar e mostra "Tirar do ar", então o seletor é único mesmo com
    // dois painéis na tela.
    const publishButton = await screen.findByRole('button', { name: 'Publicar' });
    await userEvent.click(publishButton);

    expect(await screen.findByText('Painel sem conteúdo para publicar.')).toBeInTheDocument();
    // Continua existindo um botão "Publicar": se a publicação tivesse "vingado"
    // apesar do erro, o painel teria virado "Tirar do ar" e este seletor
    // deixaria de encontrar nada.
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
  });

  it('com duas lojas, criar exige escolher a loja e envia o clientId', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (String(url).includes('/clients')) {
          return new Response(
            JSON.stringify([
              { id: 7, name: 'Padaria Central' },
              { id: 12, name: 'Padaria da Praça' },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ ...panels[1], id: 3, clientId: 12 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(panels), { headers: { 'Content-Type': 'application/json' } });
      }),
    );

    renderPage();
    await screen.findByText('Cardápio da semana');

    // Sem loja escolhida o botão não deixa criar: o servidor recusaria, e um
    // 400 depois do clique é pior que um botão que se explica antes.
    const criar = await screen.findByRole('button', { name: 'Novo cardápio' });
    expect(criar).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole('combobox'), '12');
    await waitFor(() => expect(criar).toBeEnabled());
    await userEvent.click(criar);

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(post!.init!.body as string).clientId).toBe(12);
    });
  });

  it('com uma loja só, não mostra seletor e ainda manda o clientId', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (String(url).includes('/clients')) {
          return new Response(JSON.stringify([{ id: 7, name: 'Padaria Central' }]), {
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({ ...panels[1], id: 3 }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(panels), { headers: { 'Content-Type': 'application/json' } });
      }),
    );

    renderPage();
    const criar = await screen.findByRole('button', { name: 'Novo cardápio' });
    await waitFor(() => expect(criar).toBeEnabled());
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await userEvent.click(criar);
    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(JSON.parse(post!.init!.body as string).clientId).toBe(7);
    });
  });
});
