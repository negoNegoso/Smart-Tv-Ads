import { eq, inArray } from "drizzle-orm";
import {
  db,
  announcementsTable,
  panelsTable,
  panelSlidesTable,
  type PanelItem,
} from "@workspace/db";
import { mediaStore, type MediaStore } from "../storage";
import { paginateMenuItems, type PanelPage } from "./paginate";
import { fetchImageDataUri } from "./promo-image";
import { renderPanelPage } from "./render";
import { getPanel, type PanelWithItems } from "./queries";

/** Falha de renderização de uma página específica; a rota vira isto em 422. */
export class PanelRenderError extends Error {
  constructor(
    message: string,
    readonly pageNo: number,
  ) {
    super(message);
    this.name = "PanelRenderError";
  }
}

/** Páginas que este painel produz. Promo e aviso são sempre uma. */
export function panelPages(panel: PanelWithItems): PanelPage<PanelItem>[] {
  if (panel.kind === "notice") {
    return [{ pageNo: 1, category: null, items: [] }];
  }
  if (panel.kind === "promo") {
    const first = panel.items
      .filter((i) => i.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder)[0];
    return first ? [{ pageNo: 1, category: null, items: [first] }] : [];
  }
  return paginateMenuItems(panel.items);
}

/**
 * Página pronta para o satori: se for a promoção e o item tiver foto, a URL
 * cadastrada já virou `data:` URI (ou sumiu, se a busca falhou ou foi
 * recusada). O satori nunca vê a URL original — ver `promo-image.ts` para
 * o porquê (resolve pelo MediaStore quando é upload nosso, busca com
 * guarda de SSRF quando é URL externa colada pelo lojista).
 */
async function withResolvedImage(
  kind: string,
  page: PanelPage<PanelItem>,
  store: MediaStore,
): Promise<PanelPage<PanelItem>> {
  if (kind !== "promo") return page;
  const [item] = page.items;
  if (!item?.imageUrl) return page;
  const dataUri = await fetchImageDataUri(item.imageUrl, store);
  return { ...page, items: [{ ...item, imageUrl: dataUri }] };
}

/**
 * Renderiza, grava as imagens e troca a publicação numa transação.
 *
 * A ordem importa: tudo é renderizado e enviado ao MediaStore **antes** de
 * abrir a transação. Se a renderização falhar, a publicação anterior segue
 * intacta no ar — melhor cardápio velho que TV vazia.
 */
export async function publishPanel(panelId: number): Promise<{ pages: number }> {
  const panel = await getPanel(panelId);
  if (!panel) throw new PanelRenderError("Painel não encontrado.", 0);

  const pages = panelPages(panel);
  if (pages.length === 0) {
    throw new PanelRenderError("Painel sem conteúdo para publicar.", 0);
  }

  const store = mediaStore();
  const uploaded: Array<{ pageNo: number; imageUrl: string }> = [];
  try {
    for (const page of pages) {
      const renderPage = await withResolvedImage(panel.kind, page, store);
      const png = await renderPanelPage(
        { kind: panel.kind as "menu" | "promo" | "notice", headline: panel.headline, body: panel.body },
        renderPage,
      );
      const imageUrl = await store.put(png, "image/png", `panel-${panel.id}-p${page.pageNo}.png`);
      uploaded.push({ pageNo: page.pageNo, imageUrl });
    }
  } catch (error) {
    // Limpa o que já subiu: a publicação não vai acontecer.
    await Promise.allSettled(uploaded.map((u) => store.remove(u.imageUrl)));
    const pageNo = uploaded.length + 1;
    throw new PanelRenderError(
      `Falha ao gerar a página ${pageNo} do painel: ${(error as Error).message}`,
      pageNo,
    );
  }

  let previousImages: string[];
  try {
    previousImages = await db.transaction(async (tx) => {
      // Trava a linha do painel como primeira instrução: duas publicações
      // concorrentes do mesmo painel serializam aqui em vez de as duas
      // inserirem pageNo repetido e colidirem com
      // panel_slides_panel_page_unique. A segunda espera, vê o estado que a
      // primeira deixou, e troca por cima limpo.
      await tx.select({ id: panelsTable.id }).from(panelsTable).where(eq(panelsTable.id, panel.id)).for("update");

      const old = await tx
        .select({ announcementId: panelSlidesTable.announcementId })
        .from(panelSlidesTable)
        .where(eq(panelSlidesTable.panelId, panel.id));
      const oldIds = old.map((row) => row.announcementId);

      let images: string[] = [];
      if (oldIds.length > 0) {
        const rows = await tx
          .select({ imageUrl: announcementsTable.imageUrl })
          .from(announcementsTable)
          .where(inArray(announcementsTable.id, oldIds));
        images = rows.map((r) => r.imageUrl).filter((url): url is string => !!url);
        // panel_slides cai por cascade junto das announcements.
        await tx.delete(announcementsTable).where(inArray(announcementsTable.id, oldIds));
      }

      for (const page of uploaded) {
        const [announcement] = await tx
          .insert(announcementsTable)
          .values({
            title: `${panel.name} — página ${page.pageNo}`,
            imageUrl: page.imageUrl,
            mediaKind: "image",
            source: "panel",
            duration: panel.duration,
            displayOrder: page.pageNo,
            isActive: true,
          })
          .returning();
        await tx.insert(panelSlidesTable).values({
          panelId: panel.id,
          pageNo: page.pageNo,
          announcementId: announcement.id,
        });
      }

      await tx
        .update(panelsTable)
        .set({ status: "published", publishedAt: new Date() })
        .where(eq(panelsTable.id, panel.id));

      return images;
    });
  } catch (error) {
    // A transação não commitou: nada trocou no banco, mas as páginas já
    // subiram ao MediaStore antes de abrirmos a transação. Sem isto elas
    // ficam órfãs — não referenciadas por nenhuma announcement.
    await Promise.allSettled(uploaded.map((u) => store.remove(u.imageUrl)));
    throw error;
  }

  // Depois do commit: remoção de arquivo não participa de rollback. Falha aqui
  // deixa lixo no storage, não uma publicação incoerente.
  await Promise.allSettled(previousImages.map((url) => mediaStore().remove(url)));

  return { pages: uploaded.length };
}

/** Tira do ar mantendo o cadastro. As imagens saem junto: nada as referencia. */
export async function unpublishPanel(panelId: number): Promise<void> {
  const images = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ announcementId: panelSlidesTable.announcementId })
      .from(panelSlidesTable)
      .where(eq(panelSlidesTable.panelId, panelId));
    const ids = rows.map((r) => r.announcementId);
    let urls: string[] = [];
    if (ids.length > 0) {
      const found = await tx
        .select({ imageUrl: announcementsTable.imageUrl })
        .from(announcementsTable)
        .where(inArray(announcementsTable.id, ids));
      urls = found.map((r) => r.imageUrl).filter((url): url is string => !!url);
      await tx.delete(announcementsTable).where(inArray(announcementsTable.id, ids));
    }
    await tx
      .update(panelsTable)
      .set({ status: "draft", publishedAt: null })
      .where(eq(panelsTable.id, panelId));
    return urls;
  });

  await Promise.allSettled(images.map((url) => mediaStore().remove(url)));
}
