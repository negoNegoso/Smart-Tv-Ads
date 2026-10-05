import { inArray } from "drizzle-orm";
import { db, segmentsTable } from "@workspace/db";

/**
 * Ids de segmento que não existem mais. O formulário da campanha pode ter
 * carregado a lista antes de um segmento ser mesclado ou apagado; checar antes
 * de gravar evita violar a FK depois de a campanha já ter sido escrita.
 */
export async function missingSegmentIds(ids: number[]): Promise<number[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db.select({ id: segmentsTable.id }).from(segmentsTable).where(inArray(segmentsTable.id, unique));
  const found = new Set(rows.map((r) => r.id));
  return unique.filter((id) => !found.has(id));
}
