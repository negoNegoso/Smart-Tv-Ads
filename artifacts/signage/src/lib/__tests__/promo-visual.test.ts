import { describe, expect, it } from 'vitest';
import { promoBadgeMetrics, promoPalette, resolvePromoStyle } from '../promo-visual';

describe('promo-visual (cópia do servidor)', () => {
  it('paleta do rosa padrão igual à do servidor', () => {
    expect(promoPalette(null)).toEqual({ panel: '#D63A6A', text: '#FFFFFF', price: '#3A2037' });
  });

  it('medidas do selo iguais às do servidor', () => {
    expect(promoBadgeMetrics('PROMOÇÃO')).toEqual({ fontSize: 96, width: 650, height: 182 });
  });

  it('percent sem preço antigo cai para price', () => {
    expect(resolvePromoStyle('percent', { priceCents: 899, oldPriceCents: null })).toBe('price');
  });
});
