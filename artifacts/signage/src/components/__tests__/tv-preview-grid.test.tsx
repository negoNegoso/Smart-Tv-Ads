import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DevicePreviewSlide } from '@workspace/api-client-react';
import { TvPreviewGrid } from '../tv-preview-grid';

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const slide = (title: string): DevicePreviewSlide => ({
  announcementId: 1,
  campaignId: null,
  title,
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
});

const TVS = [
  { id: 1, name: 'Sala' },
  { id: 2, name: 'Balcão' },
];

const queryKey = (id: number) => ['preview-test', id];

describe('TvPreviewGrid', () => {
  it('sem TVs não desenha nada', () => {
    const { container } = renderWithQuery(
      <TvPreviewGrid devices={[]} loadPreview={vi.fn()} queryKey={queryKey} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra um card por TV, cada um com a prévia daquela TV', async () => {
    const loadPreview = vi.fn(async (id: number) => [slide(`Arte da TV ${id}`)]);
    renderWithQuery(<TvPreviewGrid devices={TVS} loadPreview={loadPreview} queryKey={queryKey} />);

    expect(screen.getByText('Sala')).toBeInTheDocument();
    expect(screen.getByText('Balcão')).toBeInTheDocument();
    expect(await screen.findByAltText('Arte da TV 1')).toBeInTheDocument();
    expect(await screen.findByAltText('Arte da TV 2')).toBeInTheDocument();
    expect(loadPreview).toHaveBeenCalledWith(1);
    expect(loadPreview).toHaveBeenCalledWith(2);
  });

  it('as prévias da grade são compactas, sem a lista da rotação', async () => {
    renderWithQuery(
      <TvPreviewGrid devices={[TVS[0]]} loadPreview={async () => [slide('Arte')]} queryKey={queryKey} />,
    );
    await screen.findByAltText('Arte');
    expect(screen.queryByRole('list', { name: 'Rotação da TV' })).not.toBeInTheDocument();
  });

  it('falha ao carregar uma TV não derruba as outras', async () => {
    const loadPreview = vi.fn(async (id: number) => {
      if (id === 1) throw new Error('500');
      return [slide('Arte da TV 2')];
    });
    renderWithQuery(<TvPreviewGrid devices={TVS} loadPreview={loadPreview} queryKey={queryKey} />);

    expect(await screen.findByText('Não foi possível carregar a prévia.')).toBeInTheDocument();
    expect(await screen.findByAltText('Arte da TV 2')).toBeInTheDocument();
  });

  it('com hrefFor, o nome da TV leva para a página dela', () => {
    renderWithQuery(
      <TvPreviewGrid
        devices={TVS}
        loadPreview={async () => []}
        queryKey={queryKey}
        hrefFor={(id) => `/devices/${id}`}
      />,
    );
    expect(screen.getByRole('link', { name: 'Sala' })).toHaveAttribute('href', '/devices/1');
  });
});
