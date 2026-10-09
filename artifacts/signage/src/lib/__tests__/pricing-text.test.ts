import { describe, expect, it } from 'vitest';
import { quote, type Pricing } from '../pricing';
import { contaDoValor, descontoDoPeriodo } from '../pricing-text';

const tabela: Pricing = { pricePerTvCents: 1500, minMonthlyCents: 5000, quarterlyDiscountPct: 10, annualDiscountPct: 20 };

// Intl põe espaço não separável depois de "R$"; os testes comparam normalizado.
const norm = (s: string | null) => (s ?? '').replace(/\s/g, ' ');

describe('contaDoValor', () => {
  it('mostra preço × TVs × inserções e o bruto', () => {
    const q = quote(tabela, { tvs: 10, loopInsertions: 2, period: 'monthly' });
    expect(norm(contaDoValor(q))).toBe('R$ 15,00 × 10 TVs × 2 inserções = R$ 300,00 por mês');
  });

  it('singular para 1 TV e 1 inserção', () => {
    const q = quote({ ...tabela, minMonthlyCents: 0 }, { tvs: 1, loopInsertions: 1, period: 'monthly' });
    expect(norm(contaDoValor(q))).toBe('R$ 15,00 × 1 TV × 1 inserção = R$ 15,00 por mês');
  });

  it('abaixo do mínimo avisa que vale o mínimo', () => {
    const q = quote(tabela, { tvs: 2, loopInsertions: 1, period: 'monthly' });
    expect(norm(contaDoValor(q))).toBe('R$ 15,00 × 2 TVs × 1 inserção = R$ 30,00 → vale o mínimo de R$ 50,00 por mês');
  });
});

describe('descontoDoPeriodo', () => {
  it('anual com desconto', () => {
    const q = quote(tabela, { tvs: 10, loopInsertions: 2, period: 'annual' });
    expect(norm(descontoDoPeriodo(q))).toBe('−20% (anual) = R$ 240,00 por mês · R$ 2.880,00 no ano');
  });

  it('trimestral com desconto', () => {
    const q = quote(tabela, { tvs: 10, loopInsertions: 1, period: 'quarterly' });
    expect(norm(descontoDoPeriodo(q))).toBe('−10% (trimestral) = R$ 135,00 por mês · R$ 405,00 no trimestre');
  });

  it('mensal ou desconto zero não tem linha de desconto', () => {
    expect(descontoDoPeriodo(quote(tabela, { tvs: 10, loopInsertions: 1, period: 'monthly' }))).toBeNull();
    expect(norm(descontoDoPeriodo(quote({ ...tabela, annualDiscountPct: 0 }, { tvs: 10, loopInsertions: 1, period: 'annual' })))).toBe(
      'Sem desconto (anual) = R$ 150,00 por mês · R$ 1.800,00 no ano',
    );
  });
});
