import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PieceOrientationField } from '../piece-orientation-field';

vi.mock('@/lib/piece-orientation', () => ({
  imageOrientation: vi.fn(async () => 'portrait'),
}));

function fileList(file: File): FileList {
  return { 0: file, length: 1, item: () => file } as unknown as FileList;
}

const base = {
  mediaKind: 'image' as const,
  youtubeUrl: '',
  files: undefined as FileList | undefined,
  fallbackPoster: null,
  caption: null,
  value: 'landscape' as const,
};

beforeEach(() => {
  // Só os dois métodos que o jsdom não tem; o `new URL` do parseYouTubeUrl segue real.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:arte', configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PieceOrientationField', () => {
  it('imagem escolhida: detecta vertical e mostra a arte local', async () => {
    const onChange = vi.fn();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    render(<PieceOrientationField {...base} files={fileList(file)} onChange={onChange} />);

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('portrait'));
    expect(screen.getByTestId('piece-frame').querySelector('img')!.getAttribute('src')).toBe('blob:arte');
  });

  it('link de Short: mostra "Detectando formato…" e aplica a resposta do servidor', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let responder!: (r: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (responder = r))));
    const onChange = vi.fn();

    // Simula o fluxo real de criação: o campo já está montado com o link
    // vazio (mediaKind escolhido, nada colado ainda) e só depois recebe o
    // link colado — igual ao `form.watch('youtubeUrl')` mudando a cada
    // digitação/colagem no mesmo componente. Montar direto já com o link (um
    // único `render`) é indistinguível, pela ref de baseline, do caso de
    // edição (link já salvo) logo abaixo.
    const { rerender } = render(
      <PieceOrientationField {...base} mediaKind="youtube_video" youtubeUrl="" onChange={onChange} />,
    );
    rerender(
      <PieceOrientationField
        {...base}
        mediaKind="youtube_video"
        youtubeUrl="https://www.youtube.com/shorts/abc123def45"
        onChange={onChange}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('Detectando formato…')).toBeInTheDocument();

    await act(async () => {
      responder(
        new Response(JSON.stringify({ kind: 'youtube_video', id: 'abc123def45', orientation: 'portrait' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith('portrait'));
    expect(screen.queryByText('Detectando formato…')).toBeNull();
  });

  it('edição: link já salvo não é redetectado (mantém a escolha manual)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PieceOrientationField
        {...base}
        mediaKind="youtube_video"
        youtubeUrl="https://www.youtube.com/watch?v=abc123def45"
        value="portrait"
        onChange={vi.fn()}
      />,
    );
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('seletor troca a orientação e a moldura segue o valor', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PieceOrientationField {...base} onChange={onChange} />);
    expect(screen.getByTestId('piece-frame').dataset.orientation).toBe('landscape');

    await userEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    expect(onChange).toHaveBeenCalledWith('portrait');

    rerender(<PieceOrientationField {...base} value="portrait" onChange={onChange} />);
    expect(screen.getByTestId('piece-frame').dataset.orientation).toBe('portrait');
  });
});
