import { and, eq, inArray } from "drizzle-orm";
import { db, devicesTable, clientsTable, companiesTable } from "@workspace/db";
import type { AnnouncementOrientation } from "@workspace/db/orientation";
import type { FeedDevice } from "./device-feed";

/** Valores brutos de devices.orientation que dão cada formato de tela. */
const RAW_ORIENTATIONS: Record<AnnouncementOrientation, string[]> = {
  landscape: ["landscape"],
  portrait: ["portrait_right", "portrait_left"],
};

/**
 * A vitrine que a landing espelha naquele formato de tela. O PATCH garante
 * no máximo uma por formato; se ainda assim houver duas (gravação
 * concorrente), vale a de menor id, para a resposta ser estável.
 */
export async function findShowcaseDevice(
  orientation: AnnouncementOrientation,
): Promise<(FeedDevice & { showcase: true }) | null> {
  const [row] = await db
    .select({
      id: devicesTable.id,
      clientId: devicesTable.clientId,
      companyId: clientsTable.companyId,
      segmentId: companiesTable.segmentId,
      orientation: devicesTable.orientation,
    })
    .from(devicesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, devicesTable.clientId))
    .innerJoin(companiesTable, eq(companiesTable.id, clientsTable.companyId))
    .where(and(eq(devicesTable.showcase, true), inArray(devicesTable.orientation, RAW_ORIENTATIONS[orientation])))
    .orderBy(devicesTable.id)
    .limit(1);
  return row ? { ...row, showcase: true } : null;
}

/** Chave "peça:campanha" — a mesma peça pode estar no ar por campanha e pela playlist. */
export function playKey(announcementId: number, campaignId: number | null | undefined): string {
  return `${announcementId}:${campaignId ?? ""}`;
}

/**
 * O que pode virar exibição agora: exatamente o que o feed da vitrine manda.
 * A rota de plays é pública, então só aceita peça que um visitante de fato
 * poderia estar vendo — play de peça fora do ar ou com campanha trocada é
 * descartado, e não pesa no relatório de ninguém.
 */
export function onAirKeys(slides: Array<{ announcementId: number; campaignId?: number | null }>): Set<string> {
  return new Set(slides.map((s) => playKey(s.announcementId, s.campaignId)));
}

/**
 * Teto de idade de uma exibição da vitrine. A landing descarrega a fila a
 * cada 15 s, então um play real tem segundos de vida; a rota é pública e não
 * pode aceitar data retroativa (o teto de 7 dias do buildPlayRows serve à
 * fila offline da TV e deixaria forjar exibição em períodos de relatório
 * anteriores).
 */
export const VITRINE_MAX_PLAY_AGE_SECONDS = 5 * 60;
