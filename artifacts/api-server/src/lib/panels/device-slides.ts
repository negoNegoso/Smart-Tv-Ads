import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, announcementsTable, panelsTable, panelSlidesTable, campaignAnnouncementsTable } from "@workspace/db";
import { buildLoop, type LoopBlock } from "../loop-schedule";

/** Campos que a montagem da volta lê. Ausente vale peso 1 e bloco próprio. */
export type LoopSlide = {
  announcementId: number;
  campaignId?: number | null;
  panelId?: number | null;
  loopInsertions?: number;
};

/**
 * Monta a volta da TV a partir das três fontes. Peça repetida entre fontes
 * fica só na primeira (campanha > painel > playlist): repetição só vem das
 * inserções compradas. Cada campanha vira um bloco com suas peças em ordem e
 * peso = inserções por volta; cada painel do lojista (todas as páginas) e
 * cada item da playlist pesam 1. Com tudo em 1× a volta é campanhas, painéis
 * e playlist, como antes da frequência existir.
 */
export function composeDeviceLoop<T extends LoopSlide>(campaigns: T[], panels: T[], playlist: T[]): T[] {
  const seen = new Set<number>();
  const firstTime = (rows: T[]) =>
    rows.filter((slide) => {
      if (seen.has(slide.announcementId)) return false;
      seen.add(slide.announcementId);
      return true;
    });
  // Ordem importa: a dedupe dá preferência a quem é filtrado primeiro.
  const campaignRows = firstTime(campaigns);
  const panelRows = firstTime(panels);
  const playlistRows = firstTime(playlist);
  return buildLoop([
    ...groupConsecutive(campaignRows, (slide) => slide.campaignId, (slide) => slide.loopInsertions ?? 1),
    ...groupConsecutive(panelRows, (slide) => slide.panelId, () => 1),
    ...playlistRows.map((slide) => ({ weight: 1, slides: [slide] })),
  ]);
}

/**
 * Junta linhas seguidas com a mesma chave num bloco (as queries já devolvem
 * campanha por campanha e painel por painel). Chave nula ou ausente não junta:
 * cada linha vira um bloco.
 */
function groupConsecutive<T>(
  rows: T[],
  keyOf: (row: T) => number | null | undefined,
  weightOf: (row: T) => number,
): LoopBlock<T>[] {
  const blocks: LoopBlock<T>[] = [];
  let previousKey: number | null | undefined;
  for (const row of rows) {
    const key = keyOf(row);
    const last = blocks[blocks.length - 1];
    if (last && key != null && key === previousKey) {
      last.slides.push(row);
    } else {
      blocks.push({ weight: weightOf(row), slides: [row] });
    }
    previousKey = key;
  }
  return blocks;
}

/**
 * Chaves que só as linhas de campanha carregam (alvo e agenda, usados por
 * `filterEligibleSlides`). Aqui ficam opcionais só para o TypeScript conseguir
 * unificar o tipo genérico de `composeDeviceLoop` entre as três fontes —
 * sem isso, a linha de painel (que não tem essas colunas) vira o tipo mais
 * estreito e o `.map` que desestrutura essas chaves no display.ts não
 * compila. A query de painel não ganha essas colunas: é só rótulo de tipo.
 */
type CampaignOnlyFields = {
  advertiserSegmentId?: number | null;
  advertiserCompanyId?: number | null;
  targetMode?: "all" | "devices" | "segments";
  deviceIds?: number[];
  segmentIds?: number[];
  weekdays?: number[];
  timeWindows?: Array<{ start: number; end: number }>;
  loopInsertions?: number;
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
  orientation: string;
  // Agrupa as páginas de um painel num bloco só da volta.
  panelId: number | null;
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
 * depois ficaria sem tabela de preços.
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
      orientation: announcementsTable.orientation,
      panelId: panelSlidesTable.panelId,
      loopInsertions: sql<number>`1`,
    })
    .from(panelSlidesTable)
    .innerJoin(panelsTable, eq(panelsTable.id, panelSlidesTable.panelId))
    .innerJoin(announcementsTable, eq(announcementsTable.id, panelSlidesTable.announcementId))
    .leftJoin(campaignAnnouncementsTable, eq(campaignAnnouncementsTable.announcementId, panelSlidesTable.announcementId))
    .where(
      and(
        eq(panelsTable.clientId, clientId),
        eq(panelsTable.status, "published"),
        eq(announcementsTable.isActive, true),
        // Encarte publicado dentro de campanha é entregue pela campanha (datas,
        // dias, alvo). Olhar a peça, e não panels.campaign_id, faz valer o destino
        // da última publicação: mudar o destino sem republicar não muda a TV.
        isNull(campaignAnnouncementsTable.id),
      ),
    )
    .orderBy(asc(panelsTable.id), asc(panelSlidesTable.pageNo));
}

/** Slides dos painéis publicados do cliente dono da TV. */
export async function panelSlidesForClient(clientId: number): Promise<PanelSlideRow[]> {
  return buildPanelSlidesQuery(clientId);
}
