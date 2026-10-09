import { eq } from "drizzle-orm";
import { db, pricingTable, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import type { NetworkDevice } from "../ad-eligibility";
import type { Pricing } from "./quote";

const LINHA = 1;

export type PricingRow = Pricing & { updatedAt: Date };

export async function loadPricing(): Promise<PricingRow | null> {
  const [row] = await db
    .select({
      pricePerTvCents: pricingTable.pricePerTvCents,
      minMonthlyCents: pricingTable.minMonthlyCents,
      quarterlyDiscountPct: pricingTable.quarterlyDiscountPct,
      annualDiscountPct: pricingTable.annualDiscountPct,
      updatedAt: pricingTable.updatedAt,
    })
    .from(pricingTable)
    .where(eq(pricingTable.id, LINHA));
  return row ?? null;
}

/** Cria ou atualiza a linha única. */
export async function savePricing(p: Pricing): Promise<PricingRow> {
  const [row] = await db
    .insert(pricingTable)
    .values({ id: LINHA, ...p })
    .onConflictDoUpdate({ target: pricingTable.id, set: { ...p, updatedAt: new Date() } })
    .returning({
      pricePerTvCents: pricingTable.pricePerTvCents,
      minMonthlyCents: pricingTable.minMonthlyCents,
      quarterlyDiscountPct: pricingTable.quarterlyDiscountPct,
      annualDiscountPct: pricingTable.annualDiscountPct,
      updatedAt: pricingTable.updatedAt,
    });
  return row!;
}

/**
 * TVs que entram na conta do orçamento: a rede sem a vitrine. A vitrine é
 * espelhada na landing, não é tela de loja — vender espaço nela seria cobrar
 * por uma TV que não existe na parede de ninguém.
 */
export function buildQuoteNetworkQuery() {
  return db
    .select({ id: devicesTable.id, companyId: clientsTable.companyId, segmentId: companiesTable.segmentId })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(eq(devicesTable.showcase, false));
}

export async function loadQuoteNetwork(): Promise<NetworkDevice[]> {
  return buildQuoteNetworkQuery();
}
