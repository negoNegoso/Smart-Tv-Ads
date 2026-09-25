import type { PanelItem } from "@workspace/db";
import { mediaStore } from "../storage";
import { fetchImageDataUri } from "./promo-image";
import { buildFlyerInput, loadFlyerContext, toFlyerItem, FlyerCampaignMismatchError, type FlyerContext } from "./flyer-context";
import { paginateFlyer, type FlyerOrientation } from "./flyer-paginate";
import { renderFlyerPage } from "./render";

export interface FlyerPreviewRequest {
  clientId: number;
  campaignId: number | null;
  headline: string | null;
  body: string | null;
  items: Array<Pick<PanelItem, "name" | "priceCents" | "oldPriceCents" | "imageUrl" | "unit" | "featured">>;
  identity?: { logoUrl?: string | null; openingHours?: string | null; brandColor?: string | null; brandAccentColor?: string | null };
  orientation: FlyerOrientation;
  page: number;
}

/**
 * Uma página do encarte a partir do estado do editor, sem salvar nada. Usa o
 * mesmo template da publicação: a prévia é o PNG que vai para a TV.
 * Página fora do intervalo cai na última, para a prévia não quebrar enquanto
 * o lojista apaga produtos.
 */
export async function renderFlyerPreview(req: FlyerPreviewRequest): Promise<Buffer> {
  const base = await loadFlyerContext({ clientId: req.clientId, campaignId: req.campaignId });
  const ctx: FlyerContext = { ...base, company: { ...base.company, ...req.identity } };
  const store = mediaStore();
  const items = req.items.map((item, index) => ({ ...item, id: index + 1, isActive: true, displayOrder: index })) as unknown as PanelItem[];
  const pages = paginateFlyer(items, req.orientation);
  const page = pages[Math.min(Math.max(req.page, 1), Math.max(pages.length, 1)) - 1] ?? { pageNo: 1, isCover: true, featured: [], grid: [] };
  const photos = await Promise.all(
    [...page.featured, ...page.grid].map(async (i) => [i.id, i.imageUrl ? await fetchImageDataUri(i.imageUrl, store) : null] as const),
  );
  const photoOf = new Map(photos);
  const logo = ctx.company.logoUrl ? await fetchImageDataUri(ctx.company.logoUrl, store) : null;
  return renderFlyerPage(
    buildFlyerInput(req, ctx, logo),
    { ...page, featured: page.featured.map((i) => toFlyerItem(i, photoOf.get(i.id) ?? null)), grid: page.grid.map((i) => toFlyerItem(i, photoOf.get(i.id) ?? null)) },
    Math.max(pages.length, 1),
    req.orientation,
  );
}

// Reexportado para a rota reconhecer o erro de campanha de outra empresa sem
// importar flyer-context.ts direto — este módulo já é o que os testes de
// rota mockam por inteiro, então a rota nunca puxa @workspace/db de verdade.
export { FlyerCampaignMismatchError };
