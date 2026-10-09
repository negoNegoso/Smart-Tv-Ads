import { pgTable, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Tabela de preço do admin: uma linha só (id = 1). Valores em centavos e
 * descontos em porcentagem inteira. Vazia = sem preço configurado, e o
 * sistema não mostra orçamento em lugar nenhum.
 */
export const pricingTable = pgTable(
  "pricing",
  {
    id: integer("id").primaryKey(),
    // Preço de 1 TV por mês com 1 inserção por volta.
    pricePerTvCents: integer("price_per_tv_cents").notNull(),
    // Piso por mês: venda de poucas TVs não sai barata demais. 0 = sem piso.
    minMonthlyCents: integer("min_monthly_cents").notNull().default(0),
    quarterlyDiscountPct: integer("quarterly_discount_pct").notNull().default(0),
    annualDiscountPct: integer("annual_discount_pct").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  // Linha única: a rota sempre grava id = 1, e o banco recusa outra.
  (t) => [check("pricing_single_row", sql`${t.id} = 1`)],
);
