import { eq } from "drizzle-orm";
import { db, advertisersTable, companiesTable } from "@workspace/db";

/** Empresa e segmento do anunciante: os dois lados que a regra do concorrente compara. */
export async function loadAdvertiserIdentity(
  advertiserId: number,
): Promise<{ companyId: number | null; segmentId: number | null } | null> {
  const [row] = await db
    .select({ companyId: advertisersTable.companyId, segmentId: companiesTable.segmentId })
    .from(advertisersTable)
    .innerJoin(companiesTable, eq(companiesTable.id, advertisersTable.companyId))
    .where(eq(advertisersTable.id, advertiserId));
  return row ?? null;
}
