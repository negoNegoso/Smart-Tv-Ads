import { and, asc, eq, gt, inArray } from "drizzle-orm";
import {
  db,
  advertisersTable,
  campaignAnnouncementsTable,
  campaignsTable,
  clientsTable,
  panelsTable,
  panelItemsTable,
  panelSlidesTable,
  type Panel,
  type PanelItem,
  type PanelKind,
} from "@workspace/db";
import { itemCopyValues, panelCopyValues } from "./copy";

export interface PanelItemInput {
  name: string;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  category: string | null;
  imageUrl: string | null;
  unit: string | null;
  featured: boolean;
}

/** Campanha em que o painel está no ar agora — ver `publishedCampaigns`. */
export interface PublishedCampaign {
  id: number;
  name: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

export interface PanelWithItems extends Panel {
  items: PanelItem[];
  publishedCampaign: PublishedCampaign | null;
}

async function itemsOf(panelIds: number[]): Promise<Map<number, PanelItem[]>> {
  const grouped = new Map<number, PanelItem[]>();
  if (panelIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(panelItemsTable)
    .where(inArray(panelItemsTable.panelId, panelIds))
    .orderBy(asc(panelItemsTable.displayOrder), asc(panelItemsTable.id));
  for (const row of rows) {
    const list = grouped.get(row.panelId);
    if (list) list.push(row);
    else grouped.set(row.panelId, [row]);
  }
  return grouped;
}

/**
 * Campanha em que cada painel está no ar, pela última publicação (peças em
 * campaign_announcements). É o que o portal usa para "agendado / no ar /
 * encerrado"; panels.campaign_id é só o destino pedido no editor.
 */
async function publishedCampaigns(panelIds: number[]): Promise<Map<number, PublishedCampaign>> {
  const found = new Map<number, PublishedCampaign>();
  if (panelIds.length === 0) return found;
  const rows = await db
    .selectDistinct({
      panelId: panelSlidesTable.panelId,
      id: campaignsTable.id,
      name: campaignsTable.name,
      startsAt: campaignsTable.startsAt,
      endsAt: campaignsTable.endsAt,
      isActive: campaignsTable.isActive,
    })
    .from(panelSlidesTable)
    .innerJoin(campaignAnnouncementsTable, eq(campaignAnnouncementsTable.announcementId, panelSlidesTable.announcementId))
    .innerJoin(campaignsTable, eq(campaignsTable.id, campaignAnnouncementsTable.campaignId))
    .where(inArray(panelSlidesTable.panelId, panelIds));
  for (const { panelId, ...campaign } of rows) found.set(panelId, campaign);
  return found;
}

/** Painéis dos clientes informados. Lista vazia devolve lista vazia. */
export async function listPanels(clientIds: number[]): Promise<PanelWithItems[]> {
  if (clientIds.length === 0) return [];
  const panels = await db
    .select()
    .from(panelsTable)
    .where(inArray(panelsTable.clientId, clientIds))
    .orderBy(asc(panelsTable.id));
  const items = await itemsOf(panels.map((p) => p.id));
  const campaigns = await publishedCampaigns(panels.map((p) => p.id));
  return panels.map((panel) => ({
    ...panel,
    items: items.get(panel.id) ?? [],
    publishedCampaign: campaigns.get(panel.id) ?? null,
  }));
}

/**
 * Painéis de todas as lojas. Só o admin chega aqui: é a visão da plataforma,
 * que precisa enxergar a loja de quem pediu ajuda sem ter vínculo com ela.
 */
export async function listAllPanels(): Promise<PanelWithItems[]> {
  const panels = await db.select().from(panelsTable).orderBy(asc(panelsTable.id));
  const items = await itemsOf(panels.map((p) => p.id));
  const campaigns = await publishedCampaigns(panels.map((p) => p.id));
  return panels.map((panel) => ({
    ...panel,
    items: items.get(panel.id) ?? [],
    publishedCampaign: campaigns.get(panel.id) ?? null,
  }));
}

export async function getPanel(id: number): Promise<PanelWithItems | null> {
  const [panel] = await db.select().from(panelsTable).where(eq(panelsTable.id, id));
  if (!panel) return null;
  const items = await itemsOf([panel.id]);
  const campaigns = await publishedCampaigns([panel.id]);
  return { ...panel, items: items.get(panel.id) ?? [], publishedCampaign: campaigns.get(panel.id) ?? null };
}

export async function createPanel(input: {
  clientId: number;
  kind: PanelKind;
  name: string;
  template: string;
}): Promise<Panel> {
  const [panel] = await db.insert(panelsTable).values(input).returning();
  return panel;
}

export async function updatePanel(
  id: number,
  patch: Partial<
    Pick<
      Panel,
      | "name"
      | "template"
      | "duration"
      | "headline"
      | "body"
      | "accentColor"
      | "promoStyle"
      | "photoOffset"
      | "photoOffsetX"
      | "campaignId"
    >
  >,
): Promise<Panel | null> {
  const [panel] = await db
    .update(panelsTable)
    .set(patch)
    .where(eq(panelsTable.id, id))
    .returning();
  return panel ?? null;
}

/**
 * Troca a lista inteira de itens numa transação.
 *
 * O editor é uma tabela que o lojista mexe em várias linhas antes de salvar;
 * um POST por linha seria onde nasceria estado meio-salvo.
 */
export async function replaceItems(panelId: number, items: PanelItemInput[]): Promise<PanelItem[]> {
  return db.transaction(async (tx) => {
    await tx.delete(panelItemsTable).where(eq(panelItemsTable.panelId, panelId));
    if (items.length === 0) return [];
    return tx
      .insert(panelItemsTable)
      .values(items.map((item, index) => ({ ...item, panelId, displayOrder: index })))
      .returning();
  });
}

/**
 * Copia o painel, com os itens, para cada loja informada. Tudo numa
 * transação: uma loja inexistente no meio da lista não pode deixar cópias
 * pela metade nas outras.
 *
 * As fotos dos itens apontam para a mesma URL do original: apagar um painel
 * não remove essas imagens do storage, então compartilhar é seguro e evita
 * duplicar arquivo. Ver copy.ts para o que a cópia leva e o que não leva.
 *
 * Devolve null quando o painel de origem sumiu entre a autorização e a cópia.
 */
export async function copyPanel(sourceId: number, clientIds: number[]): Promise<PanelWithItems[] | null> {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(panelsTable).where(eq(panelsTable.id, sourceId));
    if (!source) return null;
    const sourceItems = await tx
      .select()
      .from(panelItemsTable)
      .where(eq(panelItemsTable.panelId, sourceId))
      .orderBy(asc(panelItemsTable.displayOrder), asc(panelItemsTable.id));

    const copies: PanelWithItems[] = [];
    for (const clientId of clientIds) {
      const [panel] = await tx.insert(panelsTable).values(panelCopyValues(source, clientId)).returning();
      const items =
        sourceItems.length === 0
          ? []
          : await tx.insert(panelItemsTable).values(itemCopyValues(sourceItems, panel.id)).returning();
      // Cópia nasce rascunho: nunca publicada, então não há campanha no ar ainda.
      copies.push({ ...panel, items, publishedCampaign: null });
    }
    return copies;
  });
}

export async function deletePanel(id: number): Promise<void> {
  await db.delete(panelsTable).where(eq(panelsTable.id, id));
}

/** Usado pelas rotas para autorizar antes de qualquer escrita. */
export async function panelClientId(id: number): Promise<number | null> {
  const [row] = await db
    .select({ clientId: panelsTable.clientId })
    .from(panelsTable)
    .where(and(eq(panelsTable.id, id)));
  return row?.clientId ?? null;
}

/**
 * Campanhas de anunciante da mesma empresa da loja, ativas e ainda não
 * encerradas — o que o seletor de destino do encarte oferece. Campanha
 * desativada pelo admin não toca em TV nenhuma, então não é destino.
 * Separada para o teste inspecionar o SQL via `.toSQL()` sem banco.
 */
export function buildCampaignOptionsQuery(clientId: number, now: Date) {
  return db
    .select({ id: campaignsTable.id, name: campaignsTable.name, startsAt: campaignsTable.startsAt, endsAt: campaignsTable.endsAt })
    .from(clientsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.companyId, clientsTable.companyId))
    .innerJoin(campaignsTable, eq(campaignsTable.advertiserId, advertisersTable.id))
    .where(and(eq(clientsTable.id, clientId), gt(campaignsTable.endsAt, now), eq(campaignsTable.isActive, true)))
    .orderBy(asc(campaignsTable.startsAt));
}

export async function campaignOptionsForClient(
  clientId: number,
  now: Date,
): Promise<Array<{ id: number; name: string; startsAt: Date; endsAt: Date }>> {
  return buildCampaignOptionsQuery(clientId, now);
}

/** Campanha de anunciante da mesma empresa da loja: a única que o encarte aceita. */
export async function campaignBelongsToClient(campaignId: number, clientId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .innerJoin(advertisersTable, eq(advertisersTable.id, campaignsTable.advertiserId))
    .innerJoin(clientsTable, eq(clientsTable.companyId, advertisersTable.companyId))
    .where(and(eq(campaignsTable.id, campaignId), eq(clientsTable.id, clientId)));
  return !!row;
}
