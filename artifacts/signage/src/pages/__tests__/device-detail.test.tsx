import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import DeviceDetail from '../device-detail';
import { Toaster } from '@/components/ui/toaster';

/**
 * O toast de adicionar à playlist afirmava uma causa: "Já está na playlist ou
 * falhou". Qualquer erro — inclusive 500 — virava acusação de duplicata, e quem
 * lia ia procurar o problema no lugar errado.
 *
 * O caso de 500 é o que importa aqui: é o que o dono do projeto encontrou.
 */
const DEVICE = {
  id: 1,
  clientId: 7,
  clientName: 'Padaria Central',
  name: 'TV do balcão',
  location: 'Balcão',
  deviceKey: 'chave-de-teste',
  lastSeenAt: null,
  createdAt: '2026-09-01T12:00:00Z',
};

const ANUNCIO = {
  id: 101,
  title: 'Cartaz da padaria',
  displayText: null,
  showText: false,
  imageUrl: '/api/uploads/cartaz.png',
  mediaKind: 'image',
  youtubeId: null,
  playbackMode: 'capped',
  audioMode: 'muted',
  isActive: true,
  displayOrder: 0,
  duration: 10,
  createdAt: '2026-09-01T12:00:00Z',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** O POST de adicionar falha com o status pedido; o resto da página responde normalmente. */
function stubApi(statusDoAdd: number, corpoDoAdd: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      if (url.includes('/playlist/add') || init?.method === 'POST') {
        return json(corpoDoAdd, statusDoAdd);
      }
      if (url.includes('/playlist')) return json([]);
      if (url.includes('/preview')) return json([]);
      if (url.includes('/announcements')) return json([ANUNCIO]);
      if (url.includes('/devices/1')) return json(DEVICE);
      return json([]);
    }),
  );
}

function renderPagina() {
  const { hook } = memoryLocation({ path: '/devices/1' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <DeviceDetail />
      </Router>
      <Toaster />
    </QueryClientProvider>,
  );
}

async function tentarAdicionar() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /Adicionar anúncio/i }));
  await user.click(await screen.findByRole('button', { name: /Cartaz da padaria/i }));
}

function textoNaTela(): string {
  return document.body.textContent ?? '';
}

afterEach(() => vi.unstubAllGlobals());

describe('DeviceDetail — adicionar à playlist', () => {
  it('não acusa duplicata quando o servidor falha', async () => {
    stubApi(500, { error: 'Internal error' });
    renderPagina();
    await tentarAdicionar();

    // Texto cru do body: o toast quebra o título entre elementos, e um
    // matcher por nó falharia mesmo com a frase na tela.
    await waitFor(() => expect(textoNaTela()).toContain('Não foi possível adicionar à playlist.'));
    expect(textoNaTela()).not.toContain('já está na playlist');
  });

  it('nomeia a duplicata quando é mesmo duplicata', async () => {
    stubApi(400, { error: 'Announcement already in playlist' });
    renderPagina();
    await tentarAdicionar();

    await waitFor(() => expect(textoNaTela()).toContain('Essa peça já está na playlist.'));
  });
});
