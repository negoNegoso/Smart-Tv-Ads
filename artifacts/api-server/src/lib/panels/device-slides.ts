import { and, asc, eq, sql } from "drizzle-orm";
import { db, announcementsTable, panelsTable, panelSlidesTable } from "@workspace/db";

/**
 * Junta as três fontes de slides de um device na ordem de exibição, sem repetir
 * peça. Campanha primeiro (é o que foi vendido), depois o conteúdo do lojista.
 */
export function composeDeviceSlides<T extends { announcementId: number }>(
  campaigns: T[],
  panels: T[],
  playlist: T[],
): T[] {
  const seen = new Set<number>();
  return [...campaigns, ...panels, ...playlist].filter((slide) => {
    if (seen.has(slide.announcementId)) return false;
    seen.add(slide.announcementId);
    return true;
  });
}

/**
 * Chaves que só as linhas de campanha carregam (alvo e agenda, usados por
 * `filterEligibleSlides`). Aqui ficam opcionais só para o TypeScript conseguir
 * unificar o tipo genérico de `composeDeviceSlides` entre as três fontes —
 * sem isso, a linha de painel (que não tem essas colunas) vira o tipo mais
 * estreito e o `.map` que desestrutura essas chaves no display.ts não
 * compila. A query de painel não ganha essas colunas: é só rótulo de tipo.
 */
type CampaignOnlyFields = {
  advertiserSegmentId?: number | null;
  advertiserClientId?: number | null;
  targetMode?: "all" | "devices" | "segments";
  deviceIds?: number[];
  segmentIds?: number[];
  weekdays?: number[];
};

/**
 * Slides dos painéis publicados do cliente dono da TV.
 *
 * O vínculo é cliente→TVs, não device_playlist: uma linha por device
 * congelaria quais TVs o cliente tinha no dia da publicação, e a TV comprada
 * depois ficaria sem cardápio.
 */
export async function panelSlidesForClient(clientId: number) {
  const rows = await db
    .select({
      announcementId: panelSlidesTable.announcementId,
      campaignId: sql<number | null>`NULL`,
      title: announcementsTable.title,
      displayText: announcementsTable.displayText,
      showText: announcementsTable.showText,
      imageUrl: announcementsTable.imageUrl,
      duration: announcementsTable.duration,
      scanCode: sql<string | null>`NULL`,
      mediaKind: announcementsTable.mediaKind,
      youtubeId: announcementsTable.youtubeId,
      playbackMode: announcementsTable.playbackMode,
      audioMode: announcementsTable.audioMode,
    })
    .from(panelSlidesTable)
    .innerJoin(panelsTable, eq(panelsTable.id, panelSlidesTable.panelId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, panelSlidesTable.announcementId))
    .where(
      and(
        eq(panelsTable.clientId, clientId),
        eq(panelsTable.status, "published"),
        eq(announcementsTable.isActive, true),
      ),
    )
    .orderBy(asc(panelsTable.id), asc(panelSlidesTable.pageNo));

  return rows as ((typeof rows)[number] & CampaignOnlyFields)[];
}
