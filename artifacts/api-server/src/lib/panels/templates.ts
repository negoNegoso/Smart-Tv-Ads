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

function frame(children: unknown[]) {
  return node("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "64px 80px",
      backgroundColor: COLORS.background,
      color: COLORS.text,
      fontFamily: "Inter",
    },
    children,
  });
}

function menuNode(page: { category: string | null; items: RenderItem[] }) {
  const rows = page.items.map((item) =>
    node("div", {
      style: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: "32px",
        padding: "18px 0",
        borderBottom: `2px solid ${COLORS.surface}`,
      },
      children: [
        node("div", {
          style: { display: "flex", flexDirection: "column", gap: "6px" },
          children: [
            node("div", {
              style: { fontSize: 46, fontWeight: 700 },
              children: truncate(item.name, MAX_ITEM_NAME),
            }),
            item.description
              ? node("div", {
                  style: { fontSize: 26, color: COLORS.muted },
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
          style: { fontSize: 34, letterSpacing: "4px", color: COLORS.muted, marginBottom: "24px" },
          children: page.category.toUpperCase(),
        })
      : null,
    node("div", { style: { display: "flex", flexDirection: "column", flex: 1 }, children: rows }),
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
