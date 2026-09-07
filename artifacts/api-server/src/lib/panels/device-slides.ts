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

/** Formato de uma linha de slide de painel, já com as chaves de campanha opcionais. */
type PanelSlideRow = {
  announcementId: number;
  campaignId: number | null;
  title: string;
  displayText: string | null;
  showText: boolean;
  imageUrl: string | null;
  duration: number;
  scanCode: string | null;
  mediaKind: string;
  youtubeId: string | null;
  playbackMode: string;
  audioMode: string;
} & CampaignOnlyFields;

/**
 * Monta (sem executar) a consulta dos slides dos painéis publicados do
 * cliente dono da TV. Separada de `panelSlidesForClient` para o teste
 * inspecionar o SQL gerado via `.toSQL()` — sem banco e sem rede — e
 * confirmar o escopo por cliente, os filtros de `published`/`isActive` e a
 * ordenação, que decidem o que aparece na TV de um restaurante.
 *
 * O vínculo é cliente→TVs, não device_playlist: uma linha por device
 * congelaria quais TVs o cliente tinha no dia da publicação, e a TV comprada
 * depois ficaria sem cardápio.
 */
export function buildPanelSlidesQuery(clientId: number) {
  return db
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
}

/** Slides dos painéis publicados do cliente dono da TV. */
export async function panelSlidesForClient(clientId: number): Promise<PanelSlideRow[]> {
  return buildPanelSlidesQuery(clientId);
}
