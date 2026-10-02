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
  orientation: 'landscape',
  showcase: false,
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
  orientation: 'landscape',
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

const VERTICAL = { ...ANUNCIO, id: 102, title: 'Short da padaria', orientation: 'portrait' };

/** API normal, com a TV e as peças escolhidas; guarda os PATCH enviados. */
function stubTv(device: typeof DEVICE, anuncios: unknown[], patches: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body));
        patches.push(body);
        return json({ ...device, ...body });
      }
      if (url.includes('/playlist')) return json([]);
      if (url.includes('/preview')) return json([]);
      if (url.includes('/announcements')) return json(anuncios);
      if (url.includes('/devices/1')) return json(device);
      return json([]);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('orientação da TV', () => {
  it('trocar para retrato envia o PATCH com a orientação', async () => {
    const patches: unknown[] = [];
    stubTv(DEVICE, [ANUNCIO], patches);
    renderPagina();

    const select = await screen.findByLabelText('Orientação da TV');
    await userEvent.selectOptions(select, 'portrait_right');

    await waitFor(() => expect(patches).toEqual([{ orientation: 'portrait_right' }]));
  });

  it('mostra no toast o conflito de vitrine ao trocar a orientação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        if (init?.method === 'PATCH') {
          return json({ error: 'Já existe uma vitrine vertical: Vitrine V' }, 409);
        }
        if (url.includes('/playlist')) return json([]);
        if (url.includes('/preview')) return json([]);
        if (url.includes('/announcements')) return json([ANUNCIO]);
        if (url.includes('/devices/1')) return json(DEVICE);
        return json([]);
      }),
    );
    renderPagina();

    await userEvent.selectOptions(await screen.findByLabelText('Orientação da TV'), 'portrait_right');

    await waitFor(() => expect(textoNaTela()).toContain('Já existe uma vitrine vertical: Vitrine V'));
  });

  it('TV retrato só oferece peças verticais na playlist', async () => {
    stubTv({ ...DEVICE, orientation: 'portrait_left' }, [ANUNCIO, VERTICAL]);
    renderPagina();

    await userEvent.click(await screen.findByRole('button', { name: /Adicionar anúncio/ }));
    expect(await screen.findByText('Short da padaria')).toBeInTheDocument();
    expect(screen.queryByText('Cartaz da padaria')).toBeNull();
  });

  it('sem peça compatível, diz qual formato falta', async () => {
    stubTv({ ...DEVICE, orientation: 'portrait_right' }, [ANUNCIO]);
    renderPagina();

    await userEvent.click(await screen.findByRole('button', { name: /Adicionar anúncio/ }));
    expect(await screen.findByText('Nenhuma peça vertical disponível para esta TV.')).toBeInTheDocument();
  });
});

describe('playlist com item fora da orientação da TV', () => {
  it('avisa o item que não toca nesta TV', async () => {
    const device = { ...DEVICE, orientation: 'portrait_right' };
    const itemFadado = {
      id: 1,
      deviceId: 1,
      announcementId: 101,
      displayOrder: 0,
      isActive: true,
      title: 'Cartaz da padaria',
      imageUrl: '/api/uploads/cartaz.png',
      duration: 10,
      orientation: 'landscape',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        if (url.includes('/playlist')) return json([itemFadado]);
        if (url.includes('/preview')) return json([]);
        if (url.includes('/announcements')) return json([]);
        if (url.includes('/devices/1')) return json(device);
        return json([]);
      }),
    );
    renderPagina();

    expect(await screen.findByText('Cartaz da padaria')).toBeInTheDocument();
    expect(await screen.findByText('Não toca nesta orientação')).toBeInTheDocument();
  });
});

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

describe('vitrine da landing', () => {
  it('liga a vitrine pelo switch e manda showcase no PATCH', async () => {
    const patches: unknown[] = [];
    stubTv(DEVICE, [ANUNCIO], patches);
    renderPagina();

    await userEvent.click(await screen.findByRole('switch', { name: 'Vitrine da landing' }));

    await waitFor(() => expect(patches).toEqual([{ showcase: true }]));
  });

  it('mostra no toast o conflito com a outra vitrine', async () => {
    // Como stubTv, mas o PATCH responde 409 com o erro em português do servidor.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        if (init?.method === 'PATCH') {
          return json({ error: 'Já existe uma vitrine horizontal: Vitrine H' }, 409);
        }
        if (url.includes('/playlist')) return json([]);
        if (url.includes('/preview')) return json([]);
        if (url.includes('/announcements')) return json([ANUNCIO]);
        if (url.includes('/devices/1')) return json(DEVICE);
        return json([]);
      }),
    );
    renderPagina();

    await userEvent.click(await screen.findByRole('switch', { name: 'Vitrine da landing' }));

    await waitFor(() => expect(textoNaTela()).toContain('Já existe uma vitrine horizontal: Vitrine H'));
  });
});

describe('música de fundo', () => {
  const LINK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  it('salvar manda o link no PATCH e confirma', async () => {
    const patches: unknown[] = [];
    stubTv(DEVICE, [ANUNCIO], patches);
    renderPagina();

    await userEvent.type(await screen.findByLabelText('Música de fundo (YouTube)'), LINK);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(patches).toEqual([{ musicUrl: LINK }]));
    await waitFor(() => expect(textoNaTela()).toContain('Música de fundo salva.'));
  });

  it('mostra o link gravado e remover manda null', async () => {
    const patches: unknown[] = [];
    stubTv({ ...DEVICE, musicUrl: LINK } as typeof DEVICE, [ANUNCIO], patches);
    renderPagina();

    const campo = (await screen.findByLabelText('Música de fundo (YouTube)')) as HTMLInputElement;
    await waitFor(() => expect(campo.value).toBe(LINK));
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(patches).toEqual([{ musicUrl: null }]));
    await waitFor(() => expect(textoNaTela()).toContain('Música de fundo removida.'));
  });

  it('TV sem música não oferece remover, e salvar fica desligado com o campo vazio', async () => {
    stubTv(DEVICE, [ANUNCIO]);
    renderPagina();

    await screen.findByLabelText('Música de fundo (YouTube)');
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('link recusado pelo servidor aparece no toast e o campo mantém o digitado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        if (init?.method === 'PATCH') return json({ error: 'Link do YouTube inválido' }, 400);
        if (url.includes('/playlist')) return json([]);
        if (url.includes('/preview')) return json([]);
        if (url.includes('/announcements')) return json([ANUNCIO]);
        if (url.includes('/devices/1')) return json(DEVICE);
        return json([]);
      }),
    );
    renderPagina();

    const campo = (await screen.findByLabelText('Música de fundo (YouTube)')) as HTMLInputElement;
    await userEvent.type(campo, 'https://exemplo.com/musica');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(textoNaTela()).toContain('Link do YouTube inválido'));
    expect(campo.value).toBe('https://exemplo.com/musica');
  });
});

describe('histórico de conexão', () => {
  it('a página da TV mostra a linha do tempo de conexão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
        // Antes de '/devices/1': a URL das sessões também contém esse trecho.
        if (url.includes('/sessions')) {
          return json({
            isOnline: false,
            sessions: [{ startedAt: '2026-10-01T08:00:00.000Z', lastSeenAt: '2026-10-01T22:00:00.000Z' }],
          });
        }
        if (url.includes('/playlist')) return json([]);
        if (url.includes('/preview')) return json([]);
        if (url.includes('/announcements')) return json([]);
        if (url.includes('/devices/1')) return json(DEVICE);
        return json([]);
      }),
    );
    renderPagina();

    expect(await screen.findByText('Histórico de conexão')).toBeInTheDocument();
    expect(await screen.findByText('No ar')).toBeInTheDocument();
    expect(screen.getByText('Fora do ar')).toBeInTheDocument();
  });
});
