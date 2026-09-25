/**
 * Contraste WCAG usado pela promoção e pelo encarte. Separado para as duas
 * paletas decidirem cor de texto pela mesma conta. O portal tem cópia da
 * parte da promoção em `signage/src/lib/promo-visual.ts`.
 */

export const LIGHT_TEXT = "#FFFFFF";
export const DARK_TEXT = "#1F1B2E";
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Cor válida em maiúsculas; qualquer outra coisa vira `fallback`. */
export function normalizeHex(color: string | null | undefined, fallback: string): string {
  return color && HEX_COLOR.test(color) ? color.toUpperCase() : fallback;
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

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Branco ou quase-preto, o que tiver maior contraste com `bg`. */
export function readableTextOn(bg: string): typeof LIGHT_TEXT | typeof DARK_TEXT {
  return contrastRatio(bg, LIGHT_TEXT) >= contrastRatio(bg, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

export function mix(from: string, to: string, amount: number): string {
  const target = channels(to);
  const hex = channels(from)
    .map((c, i) => Math.round(c * (1 - amount) + target[i]! * amount).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`.toUpperCase();
}
