/** Espelha FLYER_ORIENTATIONS de @workspace/db; importar de lá puxa a conexão no teste. */
export type FlyerOrientation = "landscape" | "portrait";

export const MAX_FLYER_ITEMS = 60;
export const MAX_FEATURED = 3;

export interface FlyerPaginateItem {
  isActive: boolean;
  displayOrder: number;
  featured: boolean;
}

export interface FlyerPage<T> {
  pageNo: number;
  /** Primeira página: leva a faixa de destaques quando houver. */
  isCover: boolean;
  featured: T[];
  grid: T[];
}

/** Quantos cards de grade cabem na capa (com faixa) e numa página de miolo. */
export function flyerGridSizes(orientation: FlyerOrientation): { cover: number; page: number } {
  return orientation === "landscape" ? { cover: 4, page: 8 } : { cover: 6, page: 10 };
}

/**
 * Capa + miolo, como folheto de papel. Só os 3 primeiros destaques vão para a
 * faixa; os demais entram na grade na posição em que o lojista os deixou,
 * para marcar destaque a mais nunca sumir com produto.
 */
export function paginateFlyer<T extends FlyerPaginateItem>(items: T[], orientation: FlyerOrientation): FlyerPage<T>[] {
  const active = items.filter((i) => i.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  if (active.length === 0) return [];

  const featured = active.filter((i) => i.featured).slice(0, MAX_FEATURED);
  const grid = active.filter((i) => !featured.includes(i));
  const sizes = flyerGridSizes(orientation);
  // Sem faixa, a capa tem o espaço de uma página de miolo.
  const coverSize = featured.length > 0 ? sizes.cover : sizes.page;

  const pages: FlyerPage<T>[] = [{ pageNo: 1, isCover: true, featured, grid: grid.slice(0, coverSize) }];
  for (let start = coverSize; start < grid.length; start += sizes.page) {
    pages.push({ pageNo: pages.length + 1, isCover: false, featured: [], grid: grid.slice(start, start + sizes.page) });
  }
  return pages;
}
