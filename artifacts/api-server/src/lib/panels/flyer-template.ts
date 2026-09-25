import { truncate } from "./format";
import { flyerPriceParts } from "./flyer-format";
import type { FlyerOrientation, FlyerPage } from "./flyer-paginate";
import { flyerPalette, type FlyerPalette } from "./flyer-palette";

export interface FlyerRenderItem {
  name: string;
  priceCents: number;
  oldPriceCents: number | null;
  unit: string | null;
  imageUrl: string | null;
}

export interface FlyerStore {
  name: string;
  logoUrl: string | null;
  openingHours: string | null;
  address: string | null;
  brandColor: string | null;
  brandAccentColor: string | null;
}

export interface FlyerRenderInput {
  headline: string | null;
  body: string | null;
  store: FlyerStore;
  validity: string | null;
}

export const DEFAULT_FLYER_HEADLINE = "OFERTAS";
export const DEFAULT_FLYER_BODY = "Ofertas válidas enquanto durarem os estoques.";
const MAX_HEADLINE = 40;
const MAX_BODY = 160;
const MAX_NAME = 40;
const FONT = "Barlow Condensed";

const node = (type: string, props: Record<string, unknown>) => ({ type, props });
const text = (value: string, style: Record<string, unknown>) => node("div", { style: { display: "flex", ...style }, children: value });

/**
 * Medidas por orientação. Os números saem da referência (folheto vertical
 * 1080×1920) e da adaptação horizontal aprovada no spec: faixa de destaques
 * em cima, grade embaixo. Ajuste olhando o PNG, não por fórmula.
 */
interface Layout {
  width: number;
  height: number;
  padding: number;
  gap: number;
  headerHeight: number;
  footerHeight: number;
  bandHeight: number;
  gridColumns: number;
  logoWidth: number;
  headlineSizes: [number, number, number];
  featuredPhoto: number;
  featuredName: number;
  featuredPrice: number;
  gridName: number;
  gridPrice: number;
  footerText: number;
}

const LAYOUTS: Record<FlyerOrientation, Layout> = {
  landscape: {
    width: 1920, height: 1080, padding: 36, gap: 20,
    // headerHeight -10, footerHeight +36, bandHeight +40 e featuredPhoto -60
    // em relação à primeira versão: a foto do destaque + nome de 2 linhas +
    // preço com unidade estourava a faixa (392px de área útil < ~437px
    // necessários) e o rodapé não comportava horário de 2 linhas + aviso.
    // Achado da revisão 1 (fix1.md #1 e #2).
    headerHeight: 140, footerHeight: 130, bandHeight: 480, gridColumns: 4,
    logoWidth: 340, headlineSizes: [96, 72, 52],
    featuredPhoto: 150, featuredName: 34, featuredPrice: 104,
    gridName: 28, gridPrice: 64, footerText: 26,
  },
  portrait: {
    width: 1080, height: 1920, padding: 36, gap: 20,
    headerHeight: 280, footerHeight: 150, bandHeight: 620, gridColumns: 2,
    logoWidth: 330, headlineSizes: [104, 80, 58],
    featuredPhoto: 290, featuredName: 32, featuredPrice: 92,
    gridName: 32, gridPrice: 84, footerText: 26,
  },
};

export function flyerSize(o: FlyerOrientation): { width: number; height: number } {
  return { width: LAYOUTS[o].width, height: LAYOUTS[o].height };
}

/** Preço longo encolhe em degraus, como na promoção, para não invadir o card vizinho. */
function priceScale(integer: string): number {
  if (integer.length <= 3) return 1;
  if (integer.length <= 6) return 0.75;
  return 0.55;
}

function headlineSize(l: Layout, headline: string): number {
  if (headline.length <= 14) return l.headlineSizes[0];
  if (headline.length <= 24) return l.headlineSizes[1];
  return l.headlineSizes[2];
}

// flexShrink 1 só na foto do destaque (via `shrink`): se algum combo de
// texto ainda não couber na faixa, é a imagem que cede espaço primeiro,
// nunca o nome ou o preço (fix1.md #1).
function photo(url: string | null, size: number, shrink = false) {
  if (!url) return null;
  return node("img", {
    src: url,
    width: size,
    height: size,
    style: { width: size, height: size, objectFit: "contain", flexShrink: shrink ? 1 : 0 },
  });
}

function price(item: FlyerRenderItem, base: number, color: string, muted: string, align: "center" | "flex-start") {
  const { integer, decimals } = flyerPriceParts(item.priceCents);
  const size = Math.round(base * priceScale(integer));
  const hasOld = item.oldPriceCents !== null && item.oldPriceCents > item.priceCents;
  const old = hasOld ? flyerPriceParts(item.oldPriceCents!) : null;
  return node("div", {
    // flexShrink 0: preço nunca encolhe (encolher espremeria os dígitos).
    style: { display: "flex", flexDirection: "column", alignItems: align, flexShrink: 0 },
    children: [
      old ? text(`DE R$ ${old.integer}${old.decimals}`, { fontSize: Math.round(base * 0.26), color: muted, fontWeight: 700 }) : null,
      node("div", {
        style: { display: "flex", alignItems: "flex-start", color, fontWeight: 800, lineHeight: 1 },
        children: [
          text("R$", { fontSize: Math.round(size * 0.32), marginTop: Math.round(size * 0.12), marginRight: 6 }),
          text(integer, { fontSize: size }),
          text(decimals, { fontSize: Math.round(size * 0.55), marginTop: Math.round(size * 0.06) }),
        ],
      }),
      item.unit ? text(item.unit, { fontSize: Math.round(base * 0.28), color, fontWeight: 800 }) : null,
    ].filter(Boolean),
  });
}

function featuredCard(l: Layout, p: FlyerPalette, item: FlyerRenderItem, width: number) {
  return node("div", {
    style: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width, height: "100%", gap: 8 },
    children: [
      photo(item.imageUrl, l.featuredPhoto, true),
      // display "block" + lineClamp: o satori corta na 2ª linha e já desenha
      // as reticências no ponto certo, em vez do maxHeight+overflow antigo,
      // que escondia o "…" do truncate() no meio da palavra (fix1.md #3).
      // wordBreak "break-word" (não "break-all"): quebra só a palavra que não
      // cabe sozinha na linha — "break-all" quebrava toda palavra no meio,
      // mesmo cabendo inteira (achado da revisão 2). No código-fonte do
      // satori instalado (Ts()/gc() em dist/index.js), "break-all" trata cada
      // caractere como unidade de quebra (grapheme), enquanto "break-word"
      // cai no quebra-linha padrão por palavra e só força quebra no meio
      // quando uma palavra sozinha estoura a linha — exatamente o caso do
      // nome de 60 caracteres sem espaço.
      text(truncate(item.name.toUpperCase(), MAX_NAME), {
        display: "block", fontSize: l.featuredName, fontWeight: 700, color: p.textOnBand, textAlign: "center",
        lineHeight: 1.1, lineClamp: 2, flexShrink: 0, wordBreak: "break-word",
      }),
      price(item, l.featuredPrice, p.priceOnBand, p.textOnBand, "center"),
    ].filter(Boolean),
  });
}

function gridCard(l: Layout, p: FlyerPalette, item: FlyerRenderItem, width: number, height: number) {
  const photoSize = Math.min(height - 16, Math.round(width * 0.42));
  const hasPhoto = !!item.imageUrl;
  return node("div", {
    style: {
      display: "flex", alignItems: "center", justifyContent: hasPhoto ? "flex-start" : "center",
      width, height, gap: 16, overflow: "hidden",
    },
    children: [
      photo(item.imageUrl, photoSize),
      node("div", {
        style: { display: "flex", flexDirection: "column", alignItems: hasPhoto ? "flex-start" : "center", flex: 1, gap: 6 },
        children: [
          // Mesma técnica de lineClamp e wordBreak do destaque (fix1.md #3,
          // revisão 2): 2 linhas no máximo, reticências visíveis se cortar, e
          // quebra no meio da palavra só quando ela sozinha não cabe na linha.
          text(truncate(item.name.toUpperCase(), MAX_NAME), {
            display: "block", fontSize: l.gridName, fontWeight: 700, color: p.textOnBackground, lineHeight: 1.1,
            lineClamp: 2, textAlign: hasPhoto ? "left" : "center", flexShrink: 0, wordBreak: "break-word",
          }),
          price(item, l.gridPrice, p.priceOnBackground, p.textOnBackground, hasPhoto ? "flex-start" : "center"),
        ],
      }),
    ].filter(Boolean),
  });
}

function header(l: Layout, p: FlyerPalette, input: FlyerRenderInput) {
  const headline = truncate((input.headline?.trim() || DEFAULT_FLYER_HEADLINE).toUpperCase(), MAX_HEADLINE);
  const logoHeight = l.headerHeight - (l.width > l.height ? 30 : 110);
  const logo = input.store.logoUrl
    ? node("img", { src: input.store.logoUrl, width: l.logoWidth, height: logoHeight, style: { objectFit: "contain" } })
    : text(truncate(input.store.name.toUpperCase(), 24), {
        width: l.logoWidth, height: logoHeight, alignItems: "center", justifyContent: "center",
        fontSize: 40, fontWeight: 800, color: p.textOnBackground, border: `3px solid ${p.textOnBackground}`, borderRadius: 16,
      });
  return node("div", {
    style: { display: "flex", flexDirection: "column", height: l.headerHeight, gap: 10 },
    children: [
      node("div", {
        style: { display: "flex", alignItems: "center", gap: 32, flex: 1 },
        children: [
          logo,
          text(headline, {
            flex: 1, fontSize: headlineSize(l, headline), fontWeight: 800, color: p.band,
            lineHeight: 1, justifyContent: "center", textAlign: "center",
          }),
        ],
      }),
      input.validity
        ? text(input.validity, { fontSize: l.width > l.height ? 30 : 40, fontWeight: 800, color: p.band, justifyContent: "center" })
        : null,
    ].filter(Boolean),
  });
}

const CLOCK = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`)}`;
const PIN = (color: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.4"><path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>`)}`;

function footer(l: Layout, p: FlyerPalette, input: FlyerRenderInput, pageNo: number, pageCount: number) {
  const iconSize = Math.round(l.footerText * 1.6);
  const block = (icon: string, value: string) =>
    node("div", {
      style: { display: "flex", alignItems: "center", gap: 12, flex: 1 },
      children: [
        node("img", { src: icon, width: iconSize, height: iconSize }),
        // lineClamp trava em 2 linhas: um horário de até 120 caracteres com
        // várias quebras não empurra mais o aviso/paginação para cima da
        // grade em nenhuma orientação (fix1.md #2).
        text(value, {
          display: "block", fontSize: l.footerText, fontWeight: 700, color: p.textOnBackground,
          lineHeight: 1.15, whiteSpace: "pre-line", lineClamp: 2,
        }),
      ],
    });
  const body = truncate(input.body?.trim() || DEFAULT_FLYER_BODY, MAX_BODY);
  return node("div", {
    style: {
      display: "flex", flexDirection: "column", height: l.footerHeight, gap: 8, padding: "12px 20px",
      borderRadius: 20, backgroundColor: "rgba(0,0,0,0.18)",
    },
    children: [
      node("div", {
        style: { display: "flex", gap: 24, flex: 1 },
        children: [
          input.store.openingHours ? block(CLOCK(p.textOnBackground), input.store.openingHours) : null,
          input.store.address ? block(PIN(p.textOnBackground), input.store.address) : null,
        ].filter(Boolean),
      }),
      node("div", {
        style: { display: "flex", justifyContent: "space-between", fontSize: Math.round(l.footerText * 0.85), color: p.textOnBackground },
        children: [text(body, {}), pageCount > 1 ? text(`${pageNo}/${pageCount}`, { fontWeight: 700 }) : null].filter(Boolean),
      }),
    ],
  });
}

/** Página do encarte como árvore de nós do satori. */
export function flyerNode(
  input: FlyerRenderInput,
  page: FlyerPage<FlyerRenderItem>,
  pageCount: number,
  orientation: FlyerOrientation,
) {
  const l = LAYOUTS[orientation];
  const p = flyerPalette(input.store.brandColor, input.store.brandAccentColor);
  const innerWidth = l.width - 2 * l.padding;
  const hasBand = page.isCover && page.featured.length > 0;
  const gridTop = l.headerHeight + (hasBand ? l.bandHeight + l.gap : 0) + l.gap;
  const gridHeight = l.height - 2 * l.padding - gridTop - l.footerHeight - l.gap;
  const rows = Math.max(1, Math.ceil(page.grid.length / l.gridColumns));
  const cardWidth = Math.floor((innerWidth - (l.gridColumns - 1) * l.gap) / l.gridColumns);
  // Altura da linha pela capacidade da página, não pelo que sobrou nela:
  // a última página com 2 produtos usa cards do mesmo tamanho das outras.
  const capacityRows = hasBand ? (orientation === "landscape" ? 1 : 3) : orientation === "landscape" ? 2 : 5;
  const cardHeight = Math.floor((gridHeight - (Math.max(rows, capacityRows) - 1) * l.gap) / Math.max(rows, capacityRows));
  const featuredWidth = Math.floor((innerWidth - 80 - 2 * l.gap) / 3);

  return node("div", {
    style: {
      display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: l.padding, gap: l.gap,
      backgroundColor: p.background, fontFamily: FONT, overflow: "hidden",
    },
    children: [
      header(l, p, input),
      hasBand
        ? node("div", {
            style: {
              display: "flex", justifyContent: "center", gap: l.gap, height: l.bandHeight, padding: "24px 40px",
              backgroundColor: p.band, borderRadius: 32,
            },
            children: page.featured.map((item) => featuredCard(l, p, item, featuredWidth)),
          })
        : null,
      node("div", {
        style: { display: "flex", flexWrap: "wrap", gap: l.gap, flex: 1, alignContent: "flex-start" },
        children: page.grid.map((item) => gridCard(l, p, item, cardWidth, cardHeight)),
      }),
      footer(l, p, input, page.pageNo, pageCount),
    ].filter(Boolean),
  });
}
