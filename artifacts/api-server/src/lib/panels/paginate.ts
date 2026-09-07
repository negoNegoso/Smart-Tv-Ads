/** Itens por tela no cardápio. Acima disso a fonte fica pequena para uma TV. */
export const MENU_ITEMS_PER_PAGE = 8;

export interface PaginateItem {
  name: string;
  category: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface PanelPage<T> {
  pageNo: number;
  category: string | null;
  items: T[];
}

/**
 * Quebra os itens em telas, uma categoria por tela.
 *
 * Categoria que não cabe vira várias telas da mesma categoria em vez de
 * misturar grupos: na TV, o título é o que orienta a leitura.
 */
export function paginateMenuItems<T extends PaginateItem>(
  items: T[],
  perPage: number = MENU_ITEMS_PER_PAGE,
): PanelPage<T>[] {
  const active = items.filter((i) => i.isActive).sort((a, b) => a.displayOrder - b.displayOrder);

  const groups: Array<{ category: string | null; items: T[] }> = [];
  for (const item of active) {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }

  const pages: PanelPage<T>[] = [];
  for (const group of groups) {
    for (let start = 0; start < group.items.length; start += perPage) {
      pages.push({
        pageNo: pages.length + 1,
        category: group.category,
        items: group.items.slice(start, start + perPage),
      });
    }
  }
  return pages;
}
