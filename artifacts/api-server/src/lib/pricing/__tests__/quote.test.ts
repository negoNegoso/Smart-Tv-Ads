import { describe, expect, it } from "vitest";
import { PERIOD_MONTHS, quote, type Pricing } from "../quote";

const tabela: Pricing = { pricePerTvCents: 1500, minMonthlyCents: 5000, quarterlyDiscountPct: 10, annualDiscountPct: 20 };

describe("quote", () => {
  it("preço por TV × TVs × inserções, mensal sem desconto", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 1, period: "monthly" })).toEqual({
      tvs: 10,
      loopInsertions: 1,
      period: "monthly",
      months: 1,
      pricePerTvCents: 1500,
      grossCents: 15000,
      monthlyListCents: 15000,
      discountPct: 0,
      monthlyCents: 15000,
      totalCents: 15000,
      savingsCents: 0,
      minimumApplied: false,
    });
  });

  it("inserções multiplicam", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 3, period: "monthly" }).monthlyCents).toBe(45000);
  });

  it("abaixo do mínimo cobra o mínimo e avisa", () => {
    const q = quote(tabela, { tvs: 2, loopInsertions: 1, period: "monthly" });
    expect(q.monthlyListCents).toBe(5000);
    expect(q.minimumApplied).toBe(true);
  });

  it("traz o preço por TV e o bruto antes do mínimo (para mostrar a conta)", () => {
    const q = quote(tabela, { tvs: 2, loopInsertions: 1, period: "monthly" });
    expect(q.pricePerTvCents).toBe(1500);
    expect(q.grossCents).toBe(3000);
    expect(q.monthlyListCents).toBe(5000);
  });

  it("exatamente no mínimo não conta como mínimo aplicado", () => {
    const q = quote({ ...tabela, minMonthlyCents: 3000 }, { tvs: 2, loopInsertions: 1, period: "monthly" });
    expect(q.monthlyListCents).toBe(3000);
    expect(q.minimumApplied).toBe(false);
  });

  it("nenhuma TV no alvo: tudo zero, sem mínimo", () => {
    const q = quote(tabela, { tvs: 0, loopInsertions: 2, period: "annual" });
    expect(q).toMatchObject({ monthlyListCents: 0, monthlyCents: 0, totalCents: 0, savingsCents: 0, minimumApplied: false });
  });

  it("trimestral aplica o desconto trimestral em 3 meses", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 1, period: "quarterly" })).toMatchObject({
      months: 3,
      discountPct: 10,
      monthlyListCents: 15000,
      monthlyCents: 13500,
      totalCents: 40500,
      savingsCents: 4500,
    });
  });

  it("anual aplica o desconto anual em 12 meses", () => {
    expect(quote(tabela, { tvs: 10, loopInsertions: 1, period: "annual" })).toMatchObject({
      months: 12,
      discountPct: 20,
      monthlyCents: 12000,
      totalCents: 144000,
      savingsCents: 36000,
    });
  });

  it("desconto arredonda ao centavo (3333 com 15% = 2833)", () => {
    const q = quote({ pricePerTvCents: 3333, minMonthlyCents: 0, quarterlyDiscountPct: 15, annualDiscountPct: 0 }, { tvs: 1, loopInsertions: 1, period: "quarterly" });
    expect(q.monthlyCents).toBe(2833);
    expect(q.totalCents).toBe(8499);
    expect(q.savingsCents).toBe(1500);
  });

  it("meses por período", () => {
    expect(PERIOD_MONTHS).toEqual({ monthly: 1, quarterly: 3, annual: 12 });
  });
});
