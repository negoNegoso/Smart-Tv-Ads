import { eq, inArray } from "drizzle-orm";
import {
  db,
  announcementsTable,
  campaignAnnouncementsTable,
  panelsTable,
  panelSlidesTable,
  type PanelItem,
} from "@workspace/db";
import { mediaStore, type MediaStore } from "../storage";
import { paginateMenuItems, type PanelPage } from "./paginate";
import { paginateFlyer, MAX_FLYER_ITEMS, type FlyerOrientation } from "./flyer-paginate";
import { fetchImageDataUri } from "./promo-image";
import { renderPanelPage, renderFlyerPage } from "./render";
import { getPanel, type PanelWithItems } from "./queries";
import {
  loadFlyerContext,
  buildFlyerInput,
  toFlyerItem,
  FlyerCampaignMismatchError,
  type FlyerContext,
} from "./flyer-context";

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
  // Encarte não usa panelPages para publicar (ver renderFlyerSlides), mas
  // quem só conta páginas (ex.: listagem) precisa de um número plausível —
  // a orientação horizontal serve de referência.
  if (panel.kind === "flyer") {
    return paginateFlyer(panel.items, "landscape").map((p) => ({
      pageNo: p.pageNo,
      category: null,
      items: [...p.featured, ...p.grid],
    }));
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

export interface RenderedSlide {
  pageNo: number;
  orientation: FlyerOrientation;
  png: Buffer;
}

const FLYER_ORIENTATIONS: FlyerOrientation[] = ["landscape", "portrait"];

/**
 * Todas as páginas do encarte nas duas orientações. Cada foto é buscada uma
 * vez só: a mesma imagem aparece no jogo deitado e no em pé, e buscar duas
 * vezes dobraria o tempo da função e as chamadas a URL externa.
 */
export async function renderFlyerSlides(panel: PanelWithItems, ctx: FlyerContext, store: MediaStore): Promise<RenderedSlide[]> {
  const active = panel.items.filter((i) => i.isActive);
  const photos = new Map<number, string | null>();
  await Promise.all(
    active.map(async (item) => {
      photos.set(item.id, item.imageUrl ? await fetchImageDataUri(item.imageUrl, store) : null);
    }),
  );
  const logo = ctx.company.logoUrl ? await fetchImageDataUri(ctx.company.logoUrl, store) : null;
  const input = buildFlyerInput(panel, ctx, logo);
  const toItem = (item: PanelItem) => toFlyerItem(item, photos.get(item.id) ?? null);

  const slides: RenderedSlide[] = [];
  for (const orientation of FLYER_ORIENTATIONS) {
    const pages = paginateFlyer(panel.items, orientation);
    for (const page of pages) {
      const png = await renderFlyerPage(
        input,
        { ...page, featured: page.featured.map(toItem), grid: page.grid.map(toItem) },
        pages.length,
        orientation,
      );
      slides.push({ pageNo: page.pageNo, orientation, png });
    }
  }
  return slides;
}

/**
 * Renderiza, grava as imagens e troca a publicação numa transação.
 *
 * A ordem importa: tudo é renderizado e enviado ao MediaStore **antes** de
 * abrir a transação. Se a renderização falhar, a publicação anterior segue
 * intacta no ar — melhor tabela de preços velha que TV vazia.
 */
export async function publishPanel(panelId: number): Promise<{ pages: number }> {
  const panel = await getPanel(panelId);
  if (!panel) throw new PanelRenderError("Painel não encontrado.", 0);

  const isFlyer = panel.kind === "flyer";
  let ctx: FlyerContext | null = null;
  if (isFlyer) {
    const activeCount = panel.items.filter((i) => i.isActive).length;
    if (activeCount === 0) throw new PanelRenderError("Encarte sem produtos para publicar.", 0);
    if (activeCount > MAX_FLYER_ITEMS) {
      throw new PanelRenderError(`O encarte passa de ${MAX_FLYER_ITEMS} produtos ativos.`, 0);
    }
    try {
      ctx = await loadFlyerContext(panel);
    } catch (error) {
      if (error instanceof FlyerCampaignMismatchError) throw new PanelRenderError(error.message, 0);
      throw error;
    }
  }

  const pages = isFlyer ? [] : panelPages(panel);
  if (!isFlyer && pages.length === 0) {
    throw new PanelRenderError("Painel sem conteúdo para publicar.", 0);
  }

  const store = mediaStore();
  const uploaded: Array<{ pageNo: number; orientation: FlyerOrientation; imageUrl: string }> = [];
  try {
    if (isFlyer) {
      // O encarte renderiza tudo (as duas orientações) antes de subir
      // qualquer PNG: renderFlyerSlides já busca a foto uma vez só para as
      // duas, então não há como intercalar render e upload por página aqui.
      const rendered = await renderFlyerSlides(panel, ctx!, store);
      for (const slide of rendered) {
        const name = `panel-${panel.id}-${slide.orientation}-p${slide.pageNo}.png`;
        const imageUrl = await store.put(slide.png, "image/png", name);
        uploaded.push({ pageNo: slide.pageNo, orientation: slide.orientation, imageUrl });
      }
    } else {
      // Render e upload intercalados, como antes: se a página 2 falhar ao
      // renderizar, a página 1 já subiu e só ela é limpa no catch abaixo —
      // publish.test.ts confere esse comportamento.
      for (const page of pages) {
        const renderPage = await withResolvedImage(panel.kind, page, store);
        const png = await renderPanelPage(
          {
            kind: panel.kind as "menu" | "promo" | "notice",
            headline: panel.headline,
            body: panel.body,
            accentColor: panel.accentColor,
            promoStyle: panel.promoStyle,
            photoOffset: panel.photoOffset,
            photoOffsetX: panel.photoOffsetX,
          },
          renderPage,
        );
        const imageUrl = await store.put(png, "image/png", `panel-${panel.id}-p${page.pageNo}.png`);
        uploaded.push({ pageNo: page.pageNo, orientation: "landscape", imageUrl });
      }
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
            title: `${panel.name} — página ${page.pageNo}${isFlyer ? (page.orientation === "portrait" ? " (vertical)" : " (horizontal)") : ""}`,
            imageUrl: page.imageUrl,
            mediaKind: "image",
            source: "panel",
            orientation: page.orientation,
            duration: panel.duration,
            // Horizontal primeiro, vertical depois: a TV só vê uma das duas.
            displayOrder: page.pageNo,
            isActive: true,
          })
          .returning();
        await tx.insert(panelSlidesTable).values({
          panelId: panel.id,
          pageNo: page.pageNo,
          orientation: page.orientation,
          announcementId: announcement.id,
        });
        if (ctx?.campaign) {
          // Sem scanCode/destinationUrl: encarte não tem QR. A campanha passa
          // a entregar esta peça com as datas, dias e alvo dela.
          await tx.insert(campaignAnnouncementsTable).values({
            campaignId: ctx.campaign.id,
            announcementId: announcement.id,
            scanCode: null,
          });
        }
      }

      await tx
        .update(panelsTable)
        .set({ status: "published", publishedAt: new Date(), artOutdated: false })
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
