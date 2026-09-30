import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { ArtLayers } from '../art-layers';

/**
 * jsdom não faz layout (offsetWidth 0) nem carrega imagem: o teste fixa o
 * tamanho da caixa e controla quando a arte "carrega" e com que medidas.
 */
interface FakeImage {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  onload: (() => void) | null;
}
let imagens: FakeImage[] = [];
let caixa = { w: 90, h: 160 };

beforeEach(() => {
  imagens = [];
  caixa = { w: 90, h: 160 };
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      constructor() {
        imagens.push(this as unknown as FakeImage);
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => caixa.w);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => caixa.h);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function carregar(w: number, h: number) {
  act(() => {
    for (const img of imagens) {
      img.naturalWidth = w;
      img.naturalHeight = h;
      img.onload?.();
    }
  });
}

const fundo = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-art-fundo]');
const arte = (c: HTMLElement) => c.querySelector('img')!;

describe('ArtLayers', () => {
  it('post de feed 4:5 numa caixa 9:16 aparece inteiro com fundo desfocado', () => {
    const { container } = render(<ArtLayers url="/a.png" alt="Arte" />);
    carregar(1080, 1350);

    expect(arte(container).className).toContain('object-contain');
    expect(fundo(container)!.style.backgroundImage).toContain('/a.png');
    // Desfoque de 4% do lado curto: o mesmo 4vh da TV, na escala da caixa.
    expect(fundo(container)!.style.filter).toBe('blur(3.6px)');
  });

  it('story 9:16 numa caixa 9:16 ocupa a caixa, sem fundo', () => {
    const { container } = render(<ArtLayers url="/a.png" alt="Arte" />);
    carregar(1080, 1920);

    expect(arte(container).className).toContain('object-cover');
    expect(fundo(container)).toBeNull();
  });

  it('antes de a arte carregar fica em cover (como a TV antes da medida)', () => {
    const { container } = render(<ArtLayers url="/a.png" alt="Arte" />);
    expect(arte(container).className).toContain('object-cover');
    expect(fundo(container)).toBeNull();
  });

  it('allowFrame falso (capa do YouTube) nunca ganha moldura', () => {
    const { container } = render(<ArtLayers url="/yt.jpg" alt="Arte" allowFrame={false} />);
    carregar(480, 360);
    expect(arte(container).className).toContain('object-cover');
    expect(fundo(container)).toBeNull();
  });

  it('troca de arte recalcula a moldura', () => {
    const { container, rerender } = render(<ArtLayers url="/feed.png" alt="Arte" />);
    carregar(1080, 1350);
    expect(fundo(container)).not.toBeNull();

    rerender(<ArtLayers url="/story.png" alt="Arte" />);
    carregar(1080, 1920);
    expect(fundo(container)).toBeNull();
  });

  it('mantém o alt na arte da frente', () => {
    const { getByAltText } = render(<ArtLayers url="/a.png" alt="Oferta" />);
    expect(getByAltText('Oferta').getAttribute('src')).toBe('/a.png');
  });
});
