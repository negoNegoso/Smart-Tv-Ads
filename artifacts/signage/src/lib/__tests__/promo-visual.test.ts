import { describe, expect, it } from 'vitest';
import {
  MAX_BODY,
  MAX_HEADLINE,
  MAX_PROMO_NAME,
  promoBadgeMetrics,
  promoPalette,
  resolvePromoStyle,
} from '../promo-visual';

describe('promo-visual (cópia do servidor)', () => {
  it('paleta do rosa padrão igual à do servidor', () => {
    expect(promoPalette(null)).toEqual({ panel: '#D63A6A', text: '#FFFFFF', price: '#3A2037' });
  });

  it('medidas do selo iguais às do servidor', () => {
    expect(promoBadgeMetrics('PROMOÇÃO')).toEqual({ fontSize: 79, width: 554, height: 150 });
  });

  it('selo longo encolhe a fonte como no servidor', () => {
    expect(promoBadgeMetrics('X'.repeat(40))).toEqual({ fontSize: 19, width: 644, height: 36 });
  });

  it('de 1 a 40 caracteres o texto estimado cabe na cápsula', () => {
    for (let length = 1; length <= 40; length += 1) {
      const m = promoBadgeMetrics('X'.repeat(length));
      expect(Math.round(length * 0.7 * m.fontSize) + 112, `${length} caracteres`).toBeLessThanOrEqual(m.width);
    }
  });

  it('limites de texto iguais aos do servidor', () => {
    expect([MAX_HEADLINE, MAX_PROMO_NAME, MAX_BODY]).toEqual([40, 20, 160]);
  });

  it('percent sem preço antigo cai para price', () => {
    expect(resolvePromoStyle('percent', { priceCents: 899, oldPriceCents: null })).toBe('price');
  });
});
