import { describe, expect, it } from 'vitest';
import { avisosDaImagem, descreverProporcao, formatarBytes, proporcaoMaisProxima } from '../image-details';

describe('proporcaoMaisProxima', () => {
  it('reconhece os formatos padrão', () => {
    expect(proporcaoMaisProxima(1920, 1080).rotulo).toBe('16:9');
    expect(proporcaoMaisProxima(1024, 768).rotulo).toBe('4:3');
    expect(proporcaoMaisProxima(1080, 1080).rotulo).toBe('1:1');
    expect(proporcaoMaisProxima(768, 1024).rotulo).toBe('3:4');
    expect(proporcaoMaisProxima(1080, 1920).rotulo).toBe('9:16');
  });

  it('post de feed 4:5 cai no 3:4', () => {
    expect(proporcaoMaisProxima(1080, 1350).rotulo).toBe('3:4');
  });
});

describe('descreverProporcao', () => {
  it('formato padrão sai sozinho, inclusive com arredondamento de pixel', () => {
    expect(descreverProporcao(1920, 1080)).toBe('16:9');
    expect(descreverProporcao(1366, 768)).toBe('16:9');
  });

  it('fora do padrão mostra a real e a mais próxima', () => {
    expect(descreverProporcao(1080, 1350)).toBe('4:5 (mais próxima: 3:4)');
  });

  it('proporção real sem fração simples vira decimal', () => {
    expect(descreverProporcao(1000, 431)).toBe('2,32:1 (mais próxima: 16:9)');
  });
});

describe('formatarBytes', () => {
  it('usa B, KB e MB', () => {
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(862_208)).toBe('842 KB');
    expect(formatarBytes(2_621_440)).toBe('2,5 MB');
  });
});

describe('avisosDaImagem', () => {
  it('arte no formato da tela e grande: sem avisos', () => {
    expect(avisosDaImagem(1920, 1080, 'landscape')).toEqual([]);
    expect(avisosDaImagem(1080, 1920, 'portrait')).toEqual([]);
  });

  it('4:5 na TV vertical avisa da moldura desfocada', () => {
    expect(avisosDaImagem(1080, 1350, 'portrait')).toEqual([
      'Na TV vertical a arte aparece inteira, com fundo desfocado nas sobras.',
    ]);
  });

  it('arte pequena avisa da resolução baixa', () => {
    expect(avisosDaImagem(1200, 675, 'landscape')).toEqual([
      'Resolução baixa: pode ficar borrada na TV (ideal 1920×1080).',
    ]);
  });

  it('resolução ideal acompanha a orientação', () => {
    expect(avisosDaImagem(675, 1200, 'portrait')).toEqual([
      'Resolução baixa: pode ficar borrada na TV (ideal 1080×1920).',
    ]);
  });
});
