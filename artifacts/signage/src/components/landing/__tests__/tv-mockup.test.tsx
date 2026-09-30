import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANDING } from '@/lib/landing-content';
import { TvMockup } from '../tv-mockup';

vi.mock('@/components/youtube-slide', () => ({ YouTubeSlide: () => <div data-testid="youtube" /> }));

function slide(id: number, text: string, over: Record<string, unknown> = {}) {
  return {
    announcementId: id,
    campaignId: 3,
    title: text,
    displayText: text,
    imageUrl: `/api/storage/objects/${id}.jpg`,
    duration: 2,
    qrImageUrl: null,
    mediaKind: 'image',
    youtubeId: null,
    playbackMode: 'capped',
    audioMode: 'muted',
    videoIds: null,
    ...over,
  };
}

const FEEDS: Record<string, unknown> = {
  landscape: { screen: { orientation: 'landscape' }, slides: [slide(1, 'Pão quente'), slide(2, 'Farmácia 24h', { mediaKind: 'youtube_video', youtubeId: 'abc' })] },
  portrait: { screen: { orientation: 'portrait_right' }, slides: [slide(5, 'Açaí')] },
};

let posts: Array<{ orientation: string; plays: unknown[] }> = [];

function stubApi(feeds: Record<string, unknown> = FEEDS) {
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === 'string' ? input : (input as Request).url ?? input);
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ accepted: 1, duplicates: 0, discarded: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const m = url.match(/vitrine\/(landscape|portrait)\/feed/);
      const feed = m ? feeds[m[1]] : undefined;
      return feed
        ? new Response(JSON.stringify(feed), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ error: 'Showcase not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

function renderTv() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TvMockup />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('TvMockup', () => {
  it('toca o feed da vitrine horizontal e conta a exibição', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi();
    renderTv();
    expect(await screen.findByText('Pão quente')).toBeInTheDocument();
    expect(screen.getByTestId('tv-kind')).toHaveTextContent(LANDING.mockup.kinds.image);

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByTestId('tv-kind')).toHaveTextContent(LANDING.mockup.kinds.video);

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await waitFor(() => expect(posts.length).toBeGreaterThan(0));
    expect(posts[0].orientation).toBe('landscape');
    expect(posts[0].plays[0]).toMatchObject({ announcementId: 1, campaignId: 3 });
  });

  it('vertical troca para a vitrine vertical, em pé e sem girar', async () => {
    stubApi();
    renderTv();
    await screen.findByText('Pão quente');
    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.portrait }));
    expect(await screen.findByText('Açaí')).toBeInTheDocument();
    expect(screen.getByTestId('tv-screen')).toHaveAttribute('data-orientation', 'portrait');
  });

  it('etiqueta volta ao retornar para a orientação já carregada', async () => {
    stubApi();
    renderTv();
    await screen.findByText('Pão quente');
    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.portrait }));
    await screen.findByText('Açaí');
    // Horizontal já está no cache: o player monta com o feed na hora.
    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.landscape }));
    await screen.findByText('Pão quente');
    expect(screen.getByTestId('tv-kind')).toHaveTextContent(LANDING.mockup.kinds.image);
  });

  it('sem vitrine (404), mostra o slide de exemplo', async () => {
    stubApi({});
    renderTv();
    expect(await screen.findByText(LANDING.mockup.caption)).toBeInTheDocument();
    expect(screen.queryByTestId('tv-kind')).not.toBeInTheDocument();
  });

  it('vitrine sem peça também cai no exemplo', async () => {
    stubApi({ landscape: { screen: { orientation: 'landscape' }, slides: [] } });
    renderTv();
    expect(await screen.findByText(LANDING.mockup.caption)).toBeInTheDocument();
  });

  it('aba escondida não avança nem conta exibição', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubApi();
    renderTv();
    await screen.findByText('Pão quente');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('Pão quente')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('TV fora da tela não avança', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let callback: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    stubApi();
    renderTv();
    await screen.findByText('Pão quente');
    act(() => callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText('Pão quente')).toBeInTheDocument();
  });
});
