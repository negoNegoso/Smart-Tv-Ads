import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DisplaySlide } from '@workspace/api-client-react';
import { PlayerStage } from '../player-stage';

const youtubeProps = vi.fn();
// A legenda troca com AnimatePresence mode="wait": o texto novo só entra
// depois que a saída do antigo anima em quadros reais, que os timers falsos
// não adiantam. O dublê mostra o texto na hora; o teste mede o rodízio.
vi.mock('../slide-caption', () => ({
  SlideCaption: ({ text }: { text: string | null }) => (text ? <h2>{text}</h2> : null),
}));

vi.mock('../youtube-slide', () => ({
  YouTubeSlide: (props: Record<string, unknown>) => {
    youtubeProps(props);
    return <div data-testid="youtube" />;
  },
}));

function slide(over: Partial<DisplaySlide>): DisplaySlide {
  return {
    announcementId: 1,
    campaignId: null,
    title: 't',
    displayText: null,
    imageUrl: '/api/storage/objects/a.jpg',
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

const A = slide({ announcementId: 1, displayText: 'Pão quente', campaignId: 7 });
const B = slide({ announcementId: 2, displayText: 'Farmácia 24h' });

beforeEach(() => {
  vi.useFakeTimers();
  youtubeProps.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('PlayerStage', () => {
  it('avança pela duração e conta uma exibição por slide', () => {
    const onPlay = vi.fn();
    render(<PlayerStage slides={[A, B]} onPlay={onPlay} />);
    expect(screen.getByText('Pão quente')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(A);
    expect(screen.getByText('Farmácia 24h')).toBeInTheDocument();
  });

  it('com uma peça só, conta toda exibição', () => {
    // Vitrine com um anúncio é caso real: o índice não muda ao avançar
    // (0 → 0), mas cada volta é uma exibição nova.
    const onPlay = vi.fn();
    render(<PlayerStage slides={[A]} onPlay={onPlay} />);
    // Dois act de 2 s (4 s no total): o React só re-renderiza ao sair do act,
    // como o navegador faria entre um tique e outro do timer.
    act(() => vi.advanceTimersByTime(2000));
    act(() => vi.advanceTimersByTime(2000));
    expect(onPlay).toHaveBeenCalledTimes(2);
  });

  it('pausado não avança nem conta; ao voltar, termina o tempo que faltava', () => {
    const onPlay = vi.fn();
    const { rerender } = render(<PlayerStage slides={[A, B]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(1500));
    rerender(<PlayerStage slides={[A, B]} onPlay={onPlay} paused />);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onPlay).not.toHaveBeenCalled();

    rerender(<PlayerStage slides={[A, B]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(500));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('lista reordenada no meio do slide não herda o tempo do anterior', () => {
    const onPlay = vi.fn();
    const { rerender } = render(<PlayerStage slides={[A, B]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(1500));
    // Refetch trouxe a lista em outra ordem: o índice 0 agora é o B.
    rerender(<PlayerStage slides={[B, A]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(500));
    expect(onPlay).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1500));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith(B);
  });

  it('muted força o YouTube mudo mesmo com peça de som', () => {
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', audioMode: 'sound' });
    render(<PlayerStage slides={[video]} muted />);
    expect(youtubeProps).toHaveBeenLastCalledWith(expect.objectContaining({ audioMode: 'muted' }));
  });

  it('sem muted, respeita o som da peça (TV)', () => {
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', audioMode: 'sound' });
    render(<PlayerStage slides={[video]} />);
    expect(youtubeProps).toHaveBeenLastCalledWith(expect.objectContaining({ audioMode: 'sound' }));
  });

  it('pausado mostra o pôster no lugar do vídeo', () => {
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', imageUrl: null });
    render(<PlayerStage slides={[video]} paused />);
    expect(screen.queryByTestId('youtube')).not.toBeInTheDocument();
  });

  it('vídeo natural avança e conta no fim, não pelo timer', () => {
    const onPlay = vi.fn();
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', playbackMode: 'natural' });
    render(<PlayerStage slides={[video, B]} onPlay={onPlay} />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(onPlay).not.toHaveBeenCalled();

    act(() => (youtubeProps.mock.lastCall![0] as { onEnded: () => void }).onEnded());
    expect(onPlay).toHaveBeenCalledWith(video);
    expect(screen.getByText('Farmácia 24h')).toBeInTheDocument();
  });

  it('vídeo natural pausado sai da tela e não conta exibição', () => {
    const onPlay = vi.fn();
    const video = slide({ announcementId: 3, mediaKind: 'youtube_video', youtubeId: 'abc', playbackMode: 'natural' });
    const { rerender } = render(<PlayerStage slides={[video, B]} onPlay={onPlay} />);
    expect(screen.getByTestId('youtube')).toBeInTheDocument();
    // Pausado, o YouTubeSlide desmonta (o player é destruído no cleanup dele),
    // então não sobra vídeo tocando que dispare onEnded sem ninguém ver.
    rerender(<PlayerStage slides={[video, B]} onPlay={onPlay} paused />);
    expect(screen.queryByTestId('youtube')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('avisa o slide na tela', () => {
    const onSlideChange = vi.fn();
    render(<PlayerStage slides={[A, B]} onSlideChange={onSlideChange} />);
    expect(onSlideChange).toHaveBeenLastCalledWith(A);
    act(() => vi.advanceTimersByTime(2000));
    expect(onSlideChange).toHaveBeenLastCalledWith(B);
  });

  it('QR real da peça com o rótulo SAIBA +', () => {
    render(<PlayerStage slides={[slide({ qrImageUrl: '/api/qr/xyz.png' })]} />);
    expect(screen.getByText('SAIBA +')).toBeInTheDocument();
    expect(document.querySelector('img[src$="api/qr/xyz.png"]')).not.toBeNull();
  });
});
