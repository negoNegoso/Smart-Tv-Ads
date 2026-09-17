import { formatPriceBRL, truncate } from "./format";
import { discountPercent, promoPalette, resolvePromoStyle } from "./promo-palette";
import {
  PROMO_PHOTO_LEFT,
  PROMO_SPLIT_BOTTOM,
  promoBackgroundSvg,
  promoBadgeMetrics,
  promoBadgeSvg,
} from "./promo-background";

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
  /** Só a promoção lê. Ausente ou inválida usa a cor padrão. */
  accentColor?: string | null;
  /** "price" | "percent". Só a promoção lê. */
  promoStyle?: string | null;
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
 * Orçamento vertical da tabela de preços.
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
const FRAME_WIDTH = 1920; // mesmo valor de PANEL_WIDTH (render.ts); mesma razão do FRAME_HEIGHT.

/** Altura útil do quadro da tabela de preços, já descontado o padding do frame. */
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

const PROMO_CONTENT_LEFT = 80;
/** Abaixo dos enfeites, que vão até y≈290 (`promo-background.ts`). */
const PROMO_CONTENT_TOP = 310;
/** Com foto, o conteúdo vai até a diagonal na base, com a mesma margem dos dois lados. */
const PROMO_CONTENT_WIDTH_WITH_PHOTO = PROMO_SPLIT_BOTTOM - 2 * PROMO_CONTENT_LEFT;
const PROMO_CONTENT_WIDTH_FULL = 1400;
/** Aparece só se a foto não cobrir a área dela. */
const PROMO_PHOTO_BACKDROP = "#F1F1F3";
const PROMO_DISCLAIMER_COLOR = "#3A2A4A";
/** 52px de Fredoka Bold em maiúsculas: ~32px por caractere, 24 cabem em 800px sem quebrar linha. */
const MAX_PROMO_NAME = 24;

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** "R$ 8,99" → ["R$", "8,99"]. `formatPriceBRL` sempre separa com espaço comum. */
function splitCurrency(formatted: string): [string, string] {
  const space = formatted.indexOf(" ");
  return [formatted.slice(0, space), formatted.slice(space + 1)];
}

function promoNode(panel: RenderPanel, item: RenderItem | undefined) {
  const palette = promoPalette(panel.accentColor);
  const style = resolvePromoStyle(panel.promoStyle, item);
  const photo = item?.imageUrl ?? null;
  const contentWidth = photo ? PROMO_CONTENT_WIDTH_WITH_PHOTO : PROMO_CONTENT_WIDTH_FULL;
  const bold = { fontWeight: 700 };

  const badgeText = truncate(panel.headline ?? "PROMOÇÃO", MAX_HEADLINE).toUpperCase();
  const badge = promoBadgeMetrics(badgeText);
  const badgeNode = node("div", {
    style: {
      display: "flex",
      position: "relative",
      width: badge.width,
      height: badge.height,
      alignItems: "center",
      justifyContent: "center",
    },
    children: [
      node("img", {
        src: svgDataUri(promoBadgeSvg({ width: badge.width, height: badge.height, stroke: palette.text })),
        width: badge.width,
        height: badge.height,
        style: { position: "absolute", left: 0, top: 0 },
      }),
      node("div", { style: { ...bold, fontSize: badge.fontSize }, children: badgeText }),
    ],
  });

  const nameNode = node("div", {
    style: { ...bold, fontSize: 52, marginTop: 24 },
    children: truncate((item?.name ?? "").toUpperCase(), MAX_PROMO_NAME),
  });

  const priceCents = item?.priceCents ?? 0;
  const oldPriceCents = item?.oldPriceCents ?? null;
  const [currency, amount] = splitCurrency(formatPriceBRL(priceCents));

  const priceNodes =
    style === "percent" && oldPriceCents !== null
      ? [
          node("div", {
            style: { display: "flex", alignItems: "baseline", color: palette.price, marginTop: 8 },
            children: [
              node("div", {
                style: { ...bold, fontSize: 200, lineHeight: 1 },
                children: `${discountPercent(oldPriceCents, priceCents)}%`,
              }),
              node("div", { style: { ...bold, fontSize: 72, marginLeft: 16 }, children: "OFF" }),
            ],
          }),
          node("div", {
            style: { ...bold, fontSize: 40 },
            children: `DE ${formatPriceBRL(oldPriceCents)} POR ${formatPriceBRL(priceCents)}`,
          }),
        ]
      : [
          // Preço antigo zerado ou sem desconto (a API não compara com o preço) não vira DE/POR.
          oldPriceCents !== null && oldPriceCents > priceCents
            ? node("div", {
                style: { display: "flex", alignItems: "baseline", marginTop: 24 },
                children: [
                  node("div", { style: { ...bold, fontSize: 36 }, children: "DE" }),
                  node("div", {
                    style: { ...bold, fontSize: 52, margin: "0 16px" },
                    children: splitCurrency(formatPriceBRL(oldPriceCents))[1],
                  }),
                  node("div", { style: { ...bold, fontSize: 36 }, children: "POR" }),
                ],
              })
            : null,
          node("div", {
            style: { display: "flex", alignItems: "baseline", color: palette.price },
            children: [
              node("div", { style: { ...bold, fontSize: 52, marginRight: 12 }, children: currency }),
              // "1.299,99" em 170px invadiria a foto; "1.000.000,00" (a API
              // aceita até 100.000.000 centavos) ainda estouraria em 130px.
              node("div", {
                style: {
                  ...bold,
                  fontSize: amount.length > 9 ? 100 : amount.length > 6 ? 130 : 170,
                  lineHeight: 1,
                },
                children: amount,
              }),
            ],
          }),
        ].filter(Boolean);

  const bodyNode = panel.body
    ? node("div", {
        style: { ...bold, display: "block", fontSize: 38, lineHeight: 1.2, lineClamp: 2, marginTop: 16, color: palette.price },
        children: truncate(panel.body, MAX_BODY),
      })
    : null;

  return node("div", {
    style: {
      display: "flex",
      position: "relative",
      width: "100%",
      height: "100%",
      backgroundColor: PROMO_PHOTO_BACKDROP,
      color: palette.text,
      fontFamily: "Fredoka",
      overflow: "hidden",
    },
    children: [
      photo
        ? node("img", {
            src: photo,
            width: FRAME_WIDTH - PROMO_PHOTO_LEFT,
            height: FRAME_HEIGHT,
            style: { position: "absolute", left: PROMO_PHOTO_LEFT, top: 0, objectFit: "cover" },
          })
        : null,
      node("img", {
        src: svgDataUri(promoBackgroundSvg({ color: palette.panel, ornament: palette.text, hasImage: Boolean(photo) })),
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        style: { position: "absolute", left: 0, top: 0 },
      }),
      node("div", {
        style: {
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          left: PROMO_CONTENT_LEFT,
          top: PROMO_CONTENT_TOP,
          width: contentWidth,
        },
        children: [badgeNode, nameNode, ...priceNodes, bodyNode].filter(Boolean),
      }),
      photo
        ? node("div", {
            style: { ...bold, position: "absolute", right: 80, bottom: 40, fontSize: 32, color: PROMO_DISCLAIMER_COLOR },
            children: "*imagens meramente ilustrativas",
          })
        : null,
    ].filter(Boolean),
  });
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
