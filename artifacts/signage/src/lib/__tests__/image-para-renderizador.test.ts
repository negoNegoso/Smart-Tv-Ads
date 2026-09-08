import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepararImagemParaUpload } from '../image-para-renderizador';

/**
 * O jsdom não desenha nada: não tem canvas de verdade nem decodifica imagem.
 * O que estes testes verificam é a REGRA — o que passa intacto, o que é
 * convertido e para qual formato —, não a fidelidade do pixel, que é
 * responsabilidade do navegador.
 */
function stubCanvas(tamanhos: { png: number; jpeg: number }) {
  const toBlob = vi.fn((cb: (blob: Blob | null) => void, tipo: string) => {
    const size = tipo === 'image/png' ? tamanhos.png : tamanhos.jpeg;
    cb(new Blob([new Uint8Array(size)], { type: tipo }));
  });
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    return { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob } as unknown as HTMLElement;
  }) as typeof document.createElement);
  return { toBlob };
}

function stubImagemQueCarrega() {
  vi.stubGlobal('Image', class {
    naturalWidth = 100;
    naturalHeight = 80;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  });
}

const webp = () => new File([new Uint8Array([1, 2, 3])], 'foto.webp', { type: 'image/webp' });

beforeEach(() => {
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
  stubImagemQueCarrega();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('prepararImagemParaUpload', () => {
  it('deixa PNG, JPEG e GIF passarem intactos', async () => {
    const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    const jpeg = new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' });
    const gif = new File([new Uint8Array([1])], 'a.gif', { type: 'image/gif' });
    expect(await prepararImagemParaUpload(png)).toBe(png);
    expect(await prepararImagemParaUpload(jpeg)).toBe(jpeg);
    expect(await prepararImagemParaUpload(gif)).toBe(gif);
  });

  it('converte WebP para PNG, trocando a extensão do nome', async () => {
    stubCanvas({ png: 1000, jpeg: 500 });
    const saida = await prepararImagemParaUpload(webp(), 4_000_000);
    expect(saida.type).toBe('image/png');
    expect(saida.name).toBe('foto.png');
  });

  it('cai para JPEG quando o PNG passa do limite de upload', async () => {
    // Foto de celular em PNG estoura fácil os 4 MB da Vercel; recusar aí seria
    // trocar um erro por outro.
    stubCanvas({ png: 9_000_000, jpeg: 800_000 });
    const saida = await prepararImagemParaUpload(webp(), 4_000_000);
    expect(saida.type).toBe('image/jpeg');
    expect(saida.name).toBe('foto.jpg');
  });

  it('avisa quando o navegador não consegue ler a imagem', async () => {
    vi.stubGlobal('Image', class {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    });
    await expect(prepararImagemParaUpload(webp())).rejects.toThrow(/não foi possível ler a imagem/i);
  });
});
