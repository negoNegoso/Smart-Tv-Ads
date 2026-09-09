import { formatPriceBRL, truncate } from "./format";

export interface RenderItem {
  name: string;
  description: string | null;
  priceCents: number;
  oldPriceCents: number | null;
  imageUrl: string | null;
}

export interface RenderPanel {
  kind: "menu" | "promo" | "notice";
  headline: string | null;
  body: string | null;
}

/** Limites de caractere por campo. Além disso, o texto some do quadro. */
const MAX_ITEM_NAME = 42;
const MAX_ITEM_DESCRIPTION = 64;
const MAX_HEADLINE = 40;
const MAX_BODY = 160;

const COLORS = {
  background: "#0B1120",
  surface: "#111C33",
  text: "#F8FAFC",
  muted: "#94A3B8",
  accent: "#FBBF24",
};

/** Nó satori: mesma forma de um elemento React, sem depender do React aqui. */
const node = (type: string, props: Record<string, unknown>) => ({ type, props });

const FRAME_PADDING_VERTICAL = 64; // topo e base do frame
const FRAME_PADDING_HORIZONTAL = 80; // esquerda e direita do frame

function frame(children: unknown[]) {
  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: `${FRAME_PADDING_VERTICAL}px ${FRAME_PADDING_HORIZONTAL}px`,
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
      // Último recurso: se a aritmética de alguma página furar o orçamento
      // vertical, corta em vez de deixar conteúdo pendurado fora do raster.
      overflow: "hidden",
    },
    children,
  });
}

/*
 * Orçamento vertical do cardápio.
 *
 * As alturas abaixo NÃO são estimadas por fórmula: são medidas do satori
 * renderizando este mesmo template (`__tests__/menu-layout.test.ts` mede de
 * novo a cada execução e falha se divergirem). A versão anterior estimava a
 * linha por `fontSize * 1.2` e errava ~10px por linha — com 8 linhas o erro
 * acumulado empurrava a última para fora do quadro, onde o `overflow: hidden`
 * do frame a cortava sem que ninguém criasse página nova.
 *
 * `paginate.ts` usa estes números como orçamento: enche a página até acabar o
 * espaço, em vez de contar itens.
 */

const FRAME_HEIGHT = 1080; // mesmo valor de PANEL_HEIGHT (render.ts); duplicado aqui para não
// criar import circular (render.ts importa templates.ts, não o contrário).

/** Altura útil do quadro do cardápio, já descontado o padding do frame. */
export const MENU_CONTENT_HEIGHT = FRAME_HEIGHT - 2 * FRAME_PADDING_VERTICAL;

const MENU_ROW_NAME_FONT_SIZE = 40;
const MENU_ROW_DESCRIPTION_FONT_SIZE = 22;
const MENU_ROW_PADDING_VERTICAL = 14; // topo e base da linha
const MENU_ROW_GAP = 6; // entre nome e descrição
const MENU_ROW_BORDER = 2; // borda inferior da linha
const MENU_ROW_PADDING = `${MENU_ROW_PADDING_VERTICAL}px 0`;

/** Altura real de uma linha com nome e descrição (medida no satori). */
export const MENU_ROW_HEIGHT_WITH_DESCRIPTION = 121;

/** Altura real de uma linha só com o nome (medida no satori). */
export const MENU_ROW_HEIGHT_PLAIN = 88;

/** Altura real do cabeçalho de categoria, com a margem inferior (medida no satori). */
export const MENU_CATEGORY_HEADER_HEIGHT = 65;

/** Altura que uma linha ocupa, conforme tenha ou não descrição. */
export function menuRowHeight(hasDescription: boolean): number {
  return hasDescription ? MENU_ROW_HEIGHT_WITH_DESCRIPTION : MENU_ROW_HEIGHT_PLAIN;
}

const MENU_CATEGORY_FONT_SIZE = 34;
const MENU_CATEGORY_MARGIN_BOTTOM = 24;

function menuNode(page: { category: string | null; items: RenderItem[] }) {
  const rows = page.items.map((item) =>
    node("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "32px",
        padding: MENU_ROW_PADDING,
        borderBottom: `${MENU_ROW_BORDER}px solid ${COLORS.surface}`,
      },
      children: [
        node("div", {
          style: { display: "flex", flexDirection: "column", gap: `${MENU_ROW_GAP}px` },
          children: [
            node("div", {
              style: { fontSize: MENU_ROW_NAME_FONT_SIZE, fontWeight: 700 },
              children: truncate(item.name, MAX_ITEM_NAME),
            }),
            item.description
              ? node("div", {
                  style: { fontSize: MENU_ROW_DESCRIPTION_FONT_SIZE, color: COLORS.muted },
                  children: truncate(item.description, MAX_ITEM_DESCRIPTION),
                })
              : null,
          ].filter(Boolean),
        }),
        node("div", {
          style: { fontSize: 48, fontWeight: 700, color: COLORS.accent },
          children: formatPriceBRL(item.priceCents),
        }),
      ],
    }),
  );

  return frame([
    page.category
      ? node("div", {
          style: {
            fontSize: MENU_CATEGORY_FONT_SIZE,
            letterSpacing: "4px",
            color: COLORS.muted,
            marginBottom: `${MENU_CATEGORY_MARGIN_BOTTOM}px`,
          },
          children: page.category.toUpperCase(),
        })
      : null,
    // Centrado: a paginação por orçamento raramente enche a página exata, e
    // sobra sempre um resto de altura. Centrado, a sobra vira margem simétrica
    // em vez de um vazio pendurado embaixo do último item.
    node("div", {
      style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" },
      children: rows,
    }),
  ].filter(Boolean));
}

function promoNode(panel: RenderPanel, item: RenderItem | undefined) {
  return frame([
    node("div", {
      style: { fontSize: 40, letterSpacing: "4px", color: COLORS.accent },
      children: truncate(panel.headline ?? "PROMOÇÃO", MAX_HEADLINE).toUpperCase(),
    }),
    node("div", {
      style: {
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "space-between",
        gap: "64px",
      },
      children: [
        node("div", {
          style: { display: "flex", flexDirection: "column", gap: "24px", maxWidth: "900px" },
          children: [
            node("div", {
              style: { fontSize: 92, fontWeight: 700, lineHeight: 1.05 },
              children: truncate(item?.name ?? "", MAX_ITEM_NAME),
            }),
            panel.body
              ? node("div", {
                  style: { fontSize: 32, color: COLORS.muted },
                  children: truncate(panel.body, MAX_BODY),
                })
              : null,
            node("div", {
              style: { display: "flex", alignItems: "baseline", gap: "24px" },
              children: [
                item?.oldPriceCents
                  ? node("div", {
                      style: {
                        fontSize: 44,
                        color: COLORS.muted,
                        textDecoration: "line-through",
                      },
                      children: formatPriceBRL(item.oldPriceCents),
                    })
                  : null,
                node("div", {
                  style: { fontSize: 120, fontWeight: 700, color: COLORS.accent },
                  children: formatPriceBRL(item?.priceCents ?? 0),
                }),
              ].filter(Boolean),
            }),
          ].filter(Boolean),
        }),
        item?.imageUrl
          ? node("img", {
              src: item.imageUrl,
              style: { width: 640, height: 640, objectFit: "cover", borderRadius: "32px" },
            })
          : null,
      ].filter(Boolean),
    }),
  ]);
}

function noticeNode(panel: RenderPanel) {
  return frame([
    node("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: "32px",
      },
      children: [
        node("div", {
          style: { fontSize: 96, fontWeight: 700, lineHeight: 1.1 },
          children: truncate(panel.headline ?? "", MAX_HEADLINE),
        }),
        panel.body
          ? node("div", {
              style: { fontSize: 44, color: COLORS.muted },
              children: truncate(panel.body, MAX_BODY),
            })
          : null,
      ].filter(Boolean),
    }),
  ]);
}

/** Árvore satori de uma página já paginada. */
export function panelPageNode(
  panel: RenderPanel,
  page: { category: string | null; items: RenderItem[] },
): unknown {
  if (panel.kind === "promo") return promoNode(panel, page.items[0]);
  if (panel.kind === "notice") return noticeNode(panel);
  return menuNode(page);
}
