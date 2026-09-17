/**
 * Cores e regra de desconto do slide de promoção. Funções puras: o portal
 * (`artifacts/signage/src/lib/promo-visual.ts`) tem uma cópia para a prévia,
 * então qualquer mudança aqui precisa ser espelhada lá.
 */

export const DEFAULT_ACCENT_COLOR = "#D63A6A";
const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#1F1B2E";
/** Quanto do tom escuro entra na cor para desenhar o preço (roxo da referência). */
const PRICE_DARKEN = 0.85;
/** WCAG para texto grande: o preço tem 170px, 3:1 basta. */
const PRICE_MIN_CONTRAST = 3;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export type PromoStyle = "price" | "percent";

export interface PromoPalette {
  panel: string;
  text: string;
  price: string;
}

/** Cor válida em maiúsculas; qualquer outra coisa vira a cor padrão. */
export function normalizeAccentColor(color: string | null | undefined): string {
  return color && HEX_COLOR.test(color) ? color.toUpperCase() : DEFAULT_ACCENT_COLOR;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

function mix(from: string, to: string, amount: number): string {
  const target = channels(to);
  const hex = channels(from)
    .map((c, i) => Math.round(c * (1 - amount) + target[i]! * amount).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`.toUpperCase();
}

export function promoPalette(color: string | null | undefined): PromoPalette {
  const panel = normalizeAccentColor(color);
  const text = contrastRatio(panel, LIGHT_TEXT) >= contrastRatio(panel, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
  const darkened = mix(panel, DARK_TEXT, PRICE_DARKEN);
  const price = contrastRatio(darkened, panel) >= PRICE_MIN_CONTRAST ? darkened : text;
  return { panel, text, price };
}

export function discountPercent(oldPriceCents: number, priceCents: number): number {
  return Math.round(((oldPriceCents - priceCents) / oldPriceCents) * 100);
}

/**
 * Estilo que o slide realmente usa. Porcentagem sem desconto de verdade
 * (sem preço antigo, antigo não maior, 0%) cai para DE/POR em vez de lançar:
 * a publicação segue, como na foto que falha em `promo-image.ts`.
 */
export function resolvePromoStyle(
  style: string | null | undefined,
  item: { priceCents: number; oldPriceCents: number | null } | undefined,
): PromoStyle {
  if (style !== "percent" || !item) return "price";
  const { priceCents, oldPriceCents } = item;
  if (oldPriceCents === null || priceCents <= 0 || oldPriceCents <= priceCents) return "price";
  return discountPercent(oldPriceCents, priceCents) >= 1 ? "percent" : "price";
}

/** Centro da foto: o que o slide fazia antes de existir enquadramento. */
const DEFAULT_PHOTO_OFFSET = 50;

/**
 * Enquadramento vertical da foto da promoção, em porcentagem (0 = topo da
 * foto, 100 = rodapé). Nulo, fora do intervalo [0, 100] ou não inteiro vira
 * o centro em vez de lançar — mesma filosofia de `normalizeAccentColor`.
 * O portal (arrastar na prévia) copia esta função, então ela fica
 * autocontida, sem depender de nada deste módulo além do que está aqui.
 */
export function normalizePhotoOffset(value: number | null | undefined): number {
  if (value === null || value === undefined) return DEFAULT_PHOTO_OFFSET;
  if (!Number.isInteger(value)) return DEFAULT_PHOTO_OFFSET;
  if (value < 0 || value > 100) return DEFAULT_PHOTO_OFFSET;
  return value;
}
