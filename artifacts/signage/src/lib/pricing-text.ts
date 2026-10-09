import { formatCents } from '@/lib/money';
import type { Quote } from '@/lib/pricing';

/**
 * A conta do orçamento escrita por extenso, para o admin entender de onde o
 * valor sai sem saber a fórmula: preço por TV × TVs × inserções e, quando for
 * o caso, o mínimo e o desconto do período. Mesmo texto na página Preços e no
 * formulário de campanha.
 */

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "R$ 15,00 × 10 TVs × 2 inserções = R$ 300,00 por mês" (avisa quando vale o mínimo). */
export function contaDoValor(q: Quote): string {
  const conta = `${formatCents(q.pricePerTvCents)} × ${plural(q.tvs, 'TV', 'TVs')} × ${plural(q.loopInsertions, 'inserção', 'inserções')} = ${formatCents(q.grossCents)}`;
  return q.minimumApplied
    ? `${conta} → vale o mínimo de ${formatCents(q.monthlyListCents)} por mês`
    : `${conta} por mês`;
}

const NOME_DO_PERIODO = { monthly: 'mensal', quarterly: 'trimestral', annual: 'anual' } as const;
const NO_PERIODO = { monthly: 'no mês', quarterly: 'no trimestre', annual: 'no ano' } as const;

/** Linha do desconto do período ("−20% (anual) = R$ 240,00 por mês · R$ 2.880,00 no ano"); mensal não tem. */
export function descontoDoPeriodo(q: Quote): string | null {
  if (q.period === 'monthly') return null;
  const desconto = q.discountPct > 0 ? `−${q.discountPct}%` : 'Sem desconto';
  return `${desconto} (${NOME_DO_PERIODO[q.period]}) = ${formatCents(q.monthlyCents)} por mês · ${formatCents(q.totalCents)} ${NO_PERIODO[q.period]}`;
}
