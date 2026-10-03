import { sql } from "drizzle-orm";
import { BUSINESS_TIME_ZONE } from "../ad-eligibility";
import { businessDayKey } from "../portal/period";
import { nextDayKey } from "./availability";

/**
 * Começo do histórico de conexão: o dia SEGUINTE ao dia local da sessão mais
 * antiga. A gravação começou no meio desse dia, então ele é parcial e
 * mostraria uma queda falsa; é tratado como "sem dados", como os anteriores.
 * Compartilhado pela Visão geral do admin e pelo relatório da TV do cliente,
 * para os dois nunca divergirem.
 */
export function historyStartFrom(
  firstStartedAt: string | Date | null | undefined,
  timeZone: string = BUSINESS_TIME_ZONE,
): string | null {
  if (!firstStartedAt) return null;
  return nextDayKey(businessDayKey(new Date(firstStartedAt), timeZone));
}

export async function historyStartKey(): Promise<string | null> {
  // Import tardio: `@workspace/db` lança sem DATABASE_URL ao ser carregado, e
  // `historyStartFrom` (pura) precisa poder ser testada sem banco.
  const { db, deviceSessionsTable } = await import("@workspace/db");
  const [first] = await db
    .select({ startedAt: sql<string | Date | null>`MIN(${deviceSessionsTable.startedAt})` })
    .from(deviceSessionsTable);
  return historyStartFrom(first?.startedAt);
}
