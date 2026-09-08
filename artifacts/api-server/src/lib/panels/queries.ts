import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  panelsTable,
  panelItemsTable,
  type Panel,
  type PanelItem,
  type PanelKind,
} from "@workspace/db";

export interface PanelItemInput {
  name: string;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  category: string | null;
  imageUrl: string | null;
}

export interface PanelWithItems extends Panel {
  items: PanelItem[];
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

/** Painéis dos clientes informados. Lista vazia devolve lista vazia. */
export async function listPanels(clientIds: number[]): Promise<PanelWithItems[]> {
  if (clientIds.length === 0) return [];
  const panels = await db
    .select()
    .from(panelsTable)
    .where(inArray(panelsTable.clientId, clientIds))
    .orderBy(asc(panelsTable.id));
  const items = await itemsOf(panels.map((p) => p.id));
  return panels.map((panel) => ({ ...panel, items: items.get(panel.id) ?? [] }));
}

export async function getPanel(id: number): Promise<PanelWithItems | null> {
  const [panel] = await db.select().from(panelsTable).where(eq(panelsTable.id, id));
  if (!panel) return null;
  const items = await itemsOf([panel.id]);
  return { ...panel, items: items.get(panel.id) ?? [] };
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
  patch: Partial<Pick<Panel, "name" | "template" | "duration" | "headline" | "body">>,
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
