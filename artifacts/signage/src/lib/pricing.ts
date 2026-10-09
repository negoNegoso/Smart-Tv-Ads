/**
 * Espelho de artifacts/api-server/src/lib/pricing/quote.ts — mudou lá, mude
 * aqui. O exemplo ao vivo da página Preços usa esta conta; os testes dos dois
 * lados são os mesmos casos.
 */
export type Pricing = {
  pricePerTvCents: number;
  minMonthlyCents: number;
  quarterlyDiscountPct: number;
  annualDiscountPct: number;
};

export type QuotePeriod = "monthly" | "quarterly" | "annual";

export const QUOTE_PERIODS: readonly QuotePeriod[] = ["monthly", "quarterly", "annual"];

export const PERIOD_MONTHS: Record<QuotePeriod, number> = { monthly: 1, quarterly: 3, annual: 12 };

export type Quote = {
  tvs: number;
  loopInsertions: number;
  period: QuotePeriod;
  months: number;
  /** Preço por TV usado na conta (o admin vê a conta inteira na tela). */
  pricePerTvCents: number;
  /** Preço por TV × TVs × inserções, antes do mínimo e do desconto. */
  grossCents: number;
  /** Mensal antes do desconto, já com o mínimo. */
  monthlyListCents: number;
  discountPct: number;
  /** Mensal com o desconto do período. */
  monthlyCents: number;
  totalCents: number;
  savingsCents: number;
  minimumApplied: boolean;
};

function discountFor(pricing: Pricing, period: QuotePeriod): number {
  if (period === "quarterly") return pricing.quarterlyDiscountPct;
  if (period === "annual") return pricing.annualDiscountPct;
  return 0;
}

export function quote(pricing: Pricing, input: { tvs: number; loopInsertions: number; period: QuotePeriod }): Quote {
  const months = PERIOD_MONTHS[input.period];
  const discountPct = discountFor(pricing, input.period);
  const bruto = pricing.pricePerTvCents * input.tvs * input.loopInsertions;
  // Alvo sem TV nenhuma não cobra mínimo: não há o que vender.
  const minimumApplied = input.tvs > 0 && bruto < pricing.minMonthlyCents;
  const monthlyListCents = input.tvs > 0 ? Math.max(pricing.minMonthlyCents, bruto) : 0;
  const monthlyCents = Math.round((monthlyListCents * (100 - discountPct)) / 100);
  return {
    tvs: input.tvs,
    loopInsertions: input.loopInsertions,
    period: input.period,
    months,
    pricePerTvCents: pricing.pricePerTvCents,
    grossCents: bruto,
    monthlyListCents,
    discountPct,
    monthlyCents,
    totalCents: monthlyCents * months,
    savingsCents: (monthlyListCents - monthlyCents) * months,
    minimumApplied,
  };
}
