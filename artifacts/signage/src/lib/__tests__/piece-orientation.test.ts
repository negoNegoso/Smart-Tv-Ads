import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageOrientation } from '../piece-orientation';

function stubImage(width: number, height: number, falha = false) {
  class ImageStub {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      queueMicrotask(() => (falha ? this.onerror?.() : this.onload?.()));
    }
  }
  vi.stubGlobal('Image', ImageStub);
  // jsdom não tem createObjectURL. Troca só os dois métodos: substituir o
  // `URL` inteiro quebraria o `new URL(...)` de quem vier depois.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:x', configurable: true, writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
}

afterEach(() => vi.unstubAllGlobals());

const arquivo = new File(['x'], 'arte.png', { type: 'image/png' });

describe('imageOrientation', () => {
  it('mais alta que larga é vertical', async () => {
    stubImage(1080, 1920);
    await expect(imageOrientation(arquivo)).resolves.toBe('portrait');
  });
  it('deitada é horizontal', async () => {
    stubImage(1920, 1080);
    await expect(imageOrientation(arquivo)).resolves.toBe('landscape');
  });
  it('quadrada é horizontal', async () => {
    stubImage(1000, 1000);
    await expect(imageOrientation(arquivo)).resolves.toBe('landscape');
  });
  it('arquivo ilegível é horizontal (o seletor corrige)', async () => {
    stubImage(0, 0, true);
    await expect(imageOrientation(arquivo)).resolves.toBe('landscape');
  });
});
