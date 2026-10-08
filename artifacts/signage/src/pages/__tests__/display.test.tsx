import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Display from '../display';

function feed(ticker: unknown) {
  return {
    screen: { orientation: 'landscape' },
    music: null,
    ticker,
    slides: [{
      announcementId: 1, campaignId: null, title: 't', displayText: null, imageUrl: '/api/storage/objects/a.jpg',
      duration: 10, qrImageUrl: null, mediaKind: 'image', youtubeId: null, playbackMode: 'capped',
      audioMode: 'muted', videoIds: null,
    }],
  };
}

function stub(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
  )));
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Display /></QueryClientProvider>);
}

beforeEach(() => window.history.replaceState({}, '', '/display/CHAVE'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** jsdom não carrega imagem: a arte "carrega" na hora, 16:9, numa caixa 16:9. */
function artePaisagem() {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1920;
      naturalHeight = 1080;
      onload: (() => void) | null = null;
      set src(_: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1920);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1080);
}

describe('Display — faixa de recados', () => {
  it('com ticker: mostra a faixa e o palco termina acima dela', async () => {
    stub(feed({ text: 'Pão quentinho às 17h' }));
    renderPage();
    expect(await screen.findByText('Pão quentinho às 17h')).toBeInTheDocument();
    expect(screen.getByTestId('player-area').style.bottom).toBe('8vh');
  });

  it('sem ticker: sem faixa e o palco vai até o rodapé', async () => {
    stub(feed(null));
    renderPage();
    expect(await screen.findByTestId('player-area')).toBeInTheDocument();
    expect(screen.queryByTestId('ticker')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-area').style.bottom).toBe('0px');
  });

  it('com ticker: a arte vai inteira, com o fundo desfocado (wholeArt)', async () => {
    artePaisagem();
    stub(feed({ text: 'Pão quentinho às 17h' }));
    renderPage();
    await screen.findByText('Pão quentinho às 17h');
    await waitFor(() => expect(document.querySelector('[data-art-fundo]')).not.toBeNull());
    expect(document.querySelector('img')!.className).toContain('object-contain');
  });

  it('sem ticker: a arte 16:9 numa tela 16:9 segue em cover', async () => {
    artePaisagem();
    stub(feed(null));
    renderPage();
    await screen.findByTestId('player-area');
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
    expect(document.querySelector('[data-art-fundo]')).toBeNull();
    expect(document.querySelector('img')!.className).toContain('object-cover');
  });
});
