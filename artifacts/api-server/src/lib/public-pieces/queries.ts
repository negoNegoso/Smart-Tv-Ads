import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import {
  db,
  announcementsTable,
  campaignsTable,
  campaignAnnouncementsTable,
  devicePlaylistTable,
} from "@workspace/db";
import { publicPiecesFromRows, type PublicPiece } from "./pieces";

/**
 * Peças que já estão no ar em alguma TV: de campanha ativa dentro do período
 * ou da playlist ativa de algum device.
 *
 * "Já no ar" é o critério porque esta rota responde sem sessão: peça
 * cadastrada para uma campanha que ainda não começou é do anunciante até a
 * data de estreia, e não pode aparecer antes na página pública.
 *
 * Separada para o teste inspecionar o SQL via `.toSQL()` sem banco.
 */
export function buildPublicPiecesQuery(now: Date) {
  const onAirCampaigns = db
    .select({ id: campaignAnnouncementsTable.announcementId })
    .from(campaignAnnouncementsTable)
    .innerJoin(campaignsTable, eq(campaignsTable.id, campaignAnnouncementsTable.campaignId))
    .where(
      and(
        eq(campaignsTable.isActive, true),
        lte(campaignsTable.startsAt, now),
        gte(campaignsTable.endsAt, now),
      ),
    );

  const onAirPlaylists = db
    .select({ id: devicePlaylistTable.announcementId })
    .from(devicePlaylistTable)
    .where(eq(devicePlaylistTable.isActive, true));

  return db
    .select({
      id: announcementsTable.id,
      imageUrl: announcementsTable.imageUrl,
      mediaKind: announcementsTable.mediaKind,
      youtubeId: announcementsTable.youtubeId,
      showText: announcementsTable.showText,
      displayText: announcementsTable.displayText,
      orientation: announcementsTable.orientation,
      source: announcementsTable.source,
    })
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.isActive, true),
        or(
          inArray(announcementsTable.id, onAirCampaigns),
          inArray(announcementsTable.id, onAirPlaylists),
        ),
      ),
    )
    // Mais recente primeiro: a landing mostra o que a rede tem de novo.
    .orderBy(desc(announcementsTable.updatedAt), desc(announcementsTable.id));
}

export async function publicPieces(now: Date = new Date()): Promise<PublicPiece[]> {
  return publicPiecesFromRows(await buildPublicPiecesQuery(now));
}
