import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PiecePreview } from '../piece-preview';

describe('PiecePreview', () => {
  it('moldura deitada para peça horizontal', () => {
    render(<PiecePreview orientation="landscape" posterUrl="/a.png" caption={null} />);
    const frame = screen.getByTestId('piece-frame');
    expect(frame.dataset.orientation).toBe('landscape');
    expect(frame.className).toContain('aspect-video');
  });

  it('moldura em pé para peça vertical', () => {
    render(<PiecePreview orientation="portrait" posterUrl="/a.png" caption={null} />);
    const frame = screen.getByTestId('piece-frame');
    expect(frame.dataset.orientation).toBe('portrait');
    expect(frame.className).toContain('aspect-[9/16]');
  });

  it('mostra a legenda por cima quando há texto', () => {
    render(<PiecePreview orientation="portrait" posterUrl="/a.png" caption="Pão quente às 17h" />);
    expect(screen.getByText('Pão quente às 17h')).toBeInTheDocument();
  });

  it('sem mídia mostra o aviso em vez de moldura vazia', () => {
    render(<PiecePreview orientation="landscape" posterUrl={null} caption={null} />);
    expect(screen.getByText('Escolha uma imagem ou cole um link')).toBeInTheDocument();
  });

  it('vídeo começa na capa e toca o embed mudo no clique', async () => {
    render(<PiecePreview orientation="portrait" posterUrl="/capa.jpg" caption={null} videoId="abc123def45" />);
    expect(document.querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tocar prévia do vídeo' }));
    const iframe = document.querySelector('iframe')!;
    expect(iframe.src).toContain('https://www.youtube.com/embed/abc123def45');
    expect(iframe.src).toContain('mute=1');
  });
});
