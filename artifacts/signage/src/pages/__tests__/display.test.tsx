import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
afterEach(() => vi.unstubAllGlobals());

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
});
