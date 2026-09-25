import { eq } from "drizzle-orm";
import { db, campaignAnnouncementsTable, panelSlidesTable, panelsTable } from "@workspace/db";
import { logger } from "../logger";
import { publishPanel, unpublishPanel } from "./publish";

/**
 * Acesso ao banco agrupado num objeto para o teste trocar por espiões sem
 * montar um drizzle falso.
 */
export const deps = {
  /** Painéis cujas peças publicadas estão nesta campanha. */
  async flyerPanelIdsInCampaign(campaignId: number): Promise<number[]> {
    const rows = await db
      .selectDistinct({ panelId: panelSlidesTable.panelId })
      .from(panelSlidesTable)
      .innerJoin(campaignAnnouncementsTable, eq(campaignAnnouncementsTable.announcementId, panelSlidesTable.announcementId))
      .where(eq(campaignAnnouncementsTable.campaignId, campaignId));
    return rows.map((r) => r.panelId);
  },
  async markArtOutdated(panelId: number): Promise<void> {
    await db.update(panelsTable).set({ artOutdated: true }).where(eq(panelsTable.id, panelId));
  },
};

/**
 * A arte do encarte traz as datas da campanha; mudou a data, a arte precisa
 * ser refeita. Falha aqui não pode desfazer a edição da campanha: marca a
 * arte como desatualizada e o portal avisa o lojista.
 */
export async function republishCampaignFlyers(campaignId: number): Promise<{ republished: number[]; failed: number[] }> {
  const ids = await deps.flyerPanelIdsInCampaign(campaignId);
  const republished: number[] = [];
  const failed: number[] = [];
  for (const id of ids) {
    try {
      await publishPanel(id);
      republished.push(id);
    } catch (err) {
      logger.error({ err, panelId: id, campaignId }, "Falha ao republicar encarte da campanha");
      await deps.markArtOutdated(id);
      failed.push(id);
    }
  }
  return { republished, failed };
}

/**
 * Antes de apagar a campanha. Sem isto, o cascade tira as linhas de
 * campaign_announcements e as peças do encarte passam a tocar de repente nas
 * TVs da loja, que só excluem peça que está em campanha.
 */
export async function unpublishCampaignFlyers(campaignId: number): Promise<number[]> {
  const ids = await deps.flyerPanelIdsInCampaign(campaignId);
  for (const id of ids) await unpublishPanel(id);
  return ids;
}
