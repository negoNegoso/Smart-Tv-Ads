import {
  MENU_CATEGORY_HEADER_HEIGHT,
  MENU_CONTENT_HEIGHT,
  menuRowHeight,
} from "./templates";

export interface PaginateItem {
  name: string;
  description?: string | null;
  category: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface PanelPage<T> {
  pageNo: number;
  category: string | null;
  items: T[];
}

/** Altura que o item ocupa na tela: linha com descrição é bem mais alta que linha só com nome. */
function itemHeight(item: PaginateItem): number {
  const description = item.description?.trim();
  return menuRowHeight(!!description);
}

/**
 * Enche páginas até o orçamento acabar. Devolve o número mínimo de páginas
 * que o grupo precisa — item que sozinho estoura o orçamento fica numa página
 * só dele (será cortado no render, mas não trava a paginação num laço).
 */
function greedyPages<T extends PaginateItem>(items: T[], budget: number): T[][] {
  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const item of items) {
    const height = itemHeight(item);
    if (current.length > 0 && used + height > budget) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += height;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

/**
 * Reparte os mesmos itens em `pageCount` páginas de tamanho parecido.
 *
 * Sem isto, 8 itens descritos viram 7 + 1: uma tela cheia e outra quase vazia
 * na TV. Devolve `null` quando o corte equilibrado não cabe no orçamento
 * (itens de alturas muito diferentes), e aí vale o corte guloso.
 */
function balancedPages<T extends PaginateItem>(
  items: T[],
  pageCount: number,
  budget: number,
): T[][] | null {
  const base = Math.floor(items.length / pageCount);
  const extra = items.length % pageCount;
  const pages: T[][] = [];
  let index = 0;
  for (let page = 0; page < pageCount; page += 1) {
    const size = base + (page < extra ? 1 : 0);
    const slice = items.slice(index, index + size);
    index += size;
    if (slice.length > 1 && slice.reduce((sum, i) => sum + itemHeight(i), 0) > budget) return null;
    pages.push(slice);
  }
  return pages;
}

/**
 * Quebra os itens em telas, uma categoria por tela.
 *
 * Categoria que não cabe vira várias telas da mesma categoria em vez de
 * misturar grupos: na TV, o título é o que orienta a leitura.
 *
 * O corte é por altura, não por contagem: uma linha com descrição ocupa 121px
 * e uma linha só com nome ocupa 88px, então "quantos itens cabem" muda de
 * página para página. Contar itens (o que esta função fazia antes) deixava a
 * última linha estourar o quadro, onde o `overflow: hidden` do template a
 * cortava — a página nova nunca era criada porque a conta dizia que cabia.
 */
export function paginateMenuItems<T extends PaginateItem>(
  items: T[],
  contentHeight: number = MENU_CONTENT_HEIGHT,
): PanelPage<T>[] {
  // Configuração inválida não deve tirar o cardápio do ar: usar o padrão em vez de travar.
  if (!Number.isFinite(contentHeight) || contentHeight < 1) {
    contentHeight = MENU_CONTENT_HEIGHT;
  }

  const active = items.filter((i) => i.isActive).sort((a, b) => a.displayOrder - b.displayOrder);

  const groups: Array<{ category: string | null; items: T[] }> = [];
  for (const item of active) {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) last.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }

  const pages: PanelPage<T>[] = [];
  for (const group of groups) {
    // O cabeçalho da categoria se repete em toda página do grupo, então sai do
    // orçamento de todas elas, não só da primeira.
    const budget =
      group.category === null ? contentHeight : contentHeight - MENU_CATEGORY_HEADER_HEIGHT;
    const greedy = greedyPages(group.items, Math.max(1, budget));
    const split =
      greedy.length > 1
        ? (balancedPages(group.items, greedy.length, Math.max(1, budget)) ?? greedy)
        : greedy;
    for (const items of split) {
      pages.push({ pageNo: pages.length + 1, category: group.category, items });
    }
  }
  return pages;
}
