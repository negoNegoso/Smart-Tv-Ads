import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageDetails } from '../image-details';
import { dimensoesDaImagem } from '@/lib/image-para-renderizador';

vi.mock('@/lib/image-para-renderizador', () => ({
  dimensoesDaImagem: vi.fn(),
}));

const arquivo = () => new File([new Uint8Array(862_208)], 'post.png', { type: 'image/png' });

describe('ImageDetails', () => {
  it('post 4:5 na TV vertical: destaca 3:4, mostra dados e avisa da moldura', async () => {
    vi.mocked(dimensoesDaImagem).mockResolvedValue({ largura: 1080, altura: 1350 });
    render(<ImageDetails file={arquivo()} orientation="portrait" />);

    expect(await screen.findByText('1080 × 1350 px · 842 KB · vertical')).toBeInTheDocument();
    expect(screen.getByText('4:5 (mais próxima: 3:4)')).toBeInTheDocument();
    expect(screen.getByTestId('proporcao-3:4').dataset.ativa).toBe('true');
    expect(screen.getByTestId('proporcao-16:9').dataset.ativa).toBe('false');
    expect(screen.getByText(/fundo desfocado/)).toBeInTheDocument();
  });

  it('arte no formato certo não mostra avisos', async () => {
    vi.mocked(dimensoesDaImagem).mockResolvedValue({ largura: 1920, altura: 1080 });
    render(<ImageDetails file={arquivo()} orientation="landscape" />);

    expect(await screen.findByText('1920 × 1080 px · 842 KB · horizontal')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Avisos da imagem' })).toBeNull();
  });

  it('arquivo ilegível não mostra nada', async () => {
    vi.mocked(dimensoesDaImagem).mockResolvedValue(null);
    const { container } = render(<ImageDetails file={arquivo()} orientation="landscape" />);
    await vi.waitFor(() => expect(dimensoesDaImagem).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
