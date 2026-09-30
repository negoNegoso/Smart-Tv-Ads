import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LANDING } from '@/lib/landing-content';
import { TvMockup, TV_MOCKUP_INTERVAL_MS } from '../tv-mockup';

const PIECES = [
  { imageUrl: '/api/storage/objects/h1.jpg', caption: 'Pão quente', orientation: 'landscape', kind: 'image' },
  { imageUrl: '/api/storage/objects/h2.jpg', caption: 'Farmácia 24h', orientation: 'landscape', kind: 'video' },
  { imageUrl: '/api/storage/objects/v1.jpg', caption: 'Açaí', orientation: 'portrait', kind: 'flyer' },
];

function stubPieces(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) })),
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('TvMockup', () => {
  it('toca as peças horizontais em rodízio', async () => {
    // shouldAdvanceTime: o findBy e o react-query ainda precisam do relógio andando.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubPieces({ pieces: PIECES });
    renderTv();
    expect(await screen.findByText('Pão quente')).toBeInTheDocument();
    expect(screen.getByTestId('tv-screen')).toHaveAttribute('data-orientation', 'landscape');

    act(() => {
      vi.advanceTimersByTime(TV_MOCKUP_INTERVAL_MS);
    });
    expect(screen.getByTestId('tv-caption')).toHaveTextContent('Farmácia 24h');
    expect(screen.getByTestId('tv-kind')).toHaveTextContent(LANDING.mockup.kinds.video);
  });

  it('vertical mostra só as peças verticais', async () => {
    stubPieces({ pieces: PIECES });
    renderTv();
    await screen.findByText('Pão quente');

    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.portrait }));
    expect(screen.getByRole('button', { name: LANDING.mockup.portrait })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('tv-screen')).toHaveAttribute('data-orientation', 'portrait');
    expect(screen.getByTestId('tv-caption')).toHaveTextContent('Açaí');
    expect(screen.getByTestId('tv-kind')).toHaveTextContent(LANDING.mockup.kinds.flyer);
    expect(screen.getByTestId('tv-screen').querySelectorAll('img')).toHaveLength(1);
  });

  it('sem peça, mostra o slide de exemplo', async () => {
    stubPieces({}, false);
    renderTv();
    expect(await screen.findByText(LANDING.mockup.caption)).toBeInTheDocument();
    expect(screen.getByTestId('tv-screen').querySelectorAll('img')).toHaveLength(0);
    expect(screen.queryByTestId('tv-kind')).not.toBeInTheDocument();
  });

  it('orientação sem peça também cai no slide de exemplo', async () => {
    stubPieces({ pieces: PIECES.slice(0, 2) });
    renderTv();
    await screen.findByText('Pão quente');
    await userEvent.click(screen.getByRole('button', { name: LANDING.mockup.portrait }));
    expect(screen.getByTestId('tv-caption')).toHaveTextContent(LANDING.mockup.caption);
  });

  it('arte fora da proporção vai inteira com fundo desfocado, como na TV', async () => {
    // jsdom não faz layout nem carrega imagem: fixa a tela 16:9 e uma arte 4:5.
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 1080;
        naturalHeight = 1350;
        onload: (() => void) | null = null;
        set src(_v: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => 160);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 90);
    stubPieces({ pieces: PIECES.slice(0, 1) });
    renderTv();
    await screen.findByText('Pão quente');

    const tela = screen.getByTestId('tv-screen');
    await vi.waitFor(() => expect(tela.querySelector('[data-art-fundo]')).not.toBeNull());
    expect(tela.querySelector('img')).toHaveClass('object-contain');
    vi.restoreAllMocks();
  });
});
