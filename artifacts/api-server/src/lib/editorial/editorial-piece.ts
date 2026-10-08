import { eq } from "drizzle-orm";
import { db, announcementsTable } from "@workspace/db";

let cachedId: number | null = null;

/** Só para testes. */
export function resetEditorialPieceCache(): void {
  cachedId = null;
}

/**
 * Id da peça de sistema do slide de clima (criada pela migração). Guardado
 * depois de achado: a peça nunca muda. Ausente devolve null e tenta de novo
 * na próxima busca — a TV fica sem o slide, nunca sem a volta.
 */
export async function editorialPieceId(): Promise<number | null> {
  if (cachedId !== null) return cachedId;
  const rows =
    (await db
      .select({ id: announcementsTable.id })
      .from(announcementsTable)
      .where(eq(announcementsTable.source, "editorial"))) ?? [];
  cachedId = rows[0]?.id ?? null;
  return cachedId;
}

/** O minuto na URL faz a TV (e a CDN) pegarem a imagem nova a cada minuto. */
export function weatherImageUrl(companyId: number, screen: "landscape" | "portrait", now: Date): string {
  return `/api/editorial/weather.png?company=${companyId}&o=${screen}&m=${Math.floor(now.getTime() / 60_000)}`;
}
