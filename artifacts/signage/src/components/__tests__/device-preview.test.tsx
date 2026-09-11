import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevicePreviewSlide } from '@workspace/api-client-react';
import { DevicePreview } from '../device-preview';

const slide = (overrides: Partial<DevicePreviewSlide>): DevicePreviewSlide => ({
  announcementId: 1,
  campaignId: null,
  title: 'Slide',
  displayText: null,
  imageUrl: '/api/uploads/slide.png',
  duration: 10,
  qrImageUrl: null,
  mediaKind: 'image',
  youtubeId: null,
  playbackMode: 'capped',
  audioMode: 'muted',
  videoIds: null,
  source: 'playlist',
  ...overrides,
});

const ROTATION: DevicePreviewSlide[] = [
  slide({ announcementId: 1, title: 'Pizzaria X', source: 'campaign', campaignId: 5, duration: 10 }),
  slide({ announcementId: 2, title: 'Cardápio p.1', source: 'panel', duration: 15 }),
  slide({ announcementId: 3, title: 'Aviso feriado', source: 'playlist', duration: 8 }),
];

function onStage(title: string) {
  return screen.getByAltText(title);
}

describe('DevicePreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('começa no primeiro slide da rotação', () => {
    render(<DevicePreview slides={ROTATION} />);
    expect(onStage('Pizzaria X')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('avança sozinho depois da duração do slide, como a TV', () => {
    render(<DevicePreview slides={ROTATION} />);

    act(() => {
      vi.advanceTimersByTime(9_900);
    });
    expect(screen.getByText('1/3')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(onStage('Cardápio p.1')).toBeInTheDocument();
  });

  it('volta ao primeiro depois do último', () => {
    render(<DevicePreview slides={ROTATION} />);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  // Aba em segundo plano: o Chrome segura o setInterval em ~1 disparo por
  // segundo. O tempo do slide tem de vir do relógio, não da soma de disparos,
  // senão a prévia anda mais devagar que a TV.
  it('segue o relógio mesmo quando o navegador atrasa o timer', () => {
    render(<DevicePreview slides={ROTATION} />);

    act(() => {
      vi.setSystemTime(Date.now() + 10_000);
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('pausar congela o slide atual', () => {
    render(<DevicePreview slides={ROTATION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('1/3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('botões de anterior e próximo trocam o slide, dando a volta nas pontas', () => {
    render(<DevicePreview slides={ROTATION} />);

    fireEvent.click(screen.getByRole('button', { name: 'Slide anterior' }));
    expect(screen.getByText('3/3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próximo slide' }));
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('trocar de slide na mão reinicia o tempo dele', () => {
    render(<DevicePreview slides={ROTATION} />);

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Próximo slide' }));
    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('clicar num item da lista leva o palco para ele', () => {
    render(<DevicePreview slides={ROTATION} />);

    const list = screen.getByRole('list', { name: 'Rotação da TV' });
    fireEvent.click(within(list).getByRole('button', { name: /Aviso feriado/ }));

    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(onStage('Aviso feriado')).toBeInTheDocument();
  });

  it('a lista diz de onde cada slide veio e marca o que está no palco', () => {
    render(<DevicePreview slides={ROTATION} />);

    const items = within(screen.getByRole('list', { name: 'Rotação da TV' })).getAllByRole('button');
    expect(items[0]).toHaveTextContent('Campanha');
    expect(items[0]).toHaveTextContent('10s');
    expect(items[1]).toHaveTextContent('Painel');
    expect(items[2]).toHaveTextContent('Playlist');
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(items[1]).not.toHaveAttribute('aria-current');
  });

  it('mostra legenda e QR do slide quando a TV mostraria', () => {
    render(
      <DevicePreview
        slides={[slide({ title: 'Promo', displayText: 'Só hoje', qrImageUrl: '/api/qr/abc.png' })]}
      />,
    );
    expect(screen.getByText('Só hoje')).toBeInTheDocument();
    expect(screen.getByText('SAIBA +')).toBeInTheDocument();
  });

  it('vídeo do YouTube aparece como capa, sem tocar', () => {
    render(
      <DevicePreview
        slides={[slide({ title: 'Vídeo', mediaKind: 'youtube_video', imageUrl: null, youtubeId: 'abc123' })]}
      />,
    );
    expect(onStage('Vídeo')).toHaveAttribute('src', 'https://img.youtube.com/vi/abc123/hqdefault.jpg');
    expect(document.querySelector('iframe')).toBeNull();
  });

  // Prévia não é exibição: contar play inflaria o relatório do anunciante.
  it('não registra exibição enquanto gira', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<DevicePreview slides={ROTATION} />);

    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sem slides, avisa que nada está no ar', () => {
    render(<DevicePreview slides={[]} />);
    expect(screen.getByText('Nada no ar nesta TV')).toBeInTheDocument();
  });
});
