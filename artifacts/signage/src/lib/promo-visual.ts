/**
 * Cópia para a prévia de `artifacts/api-server/src/lib/panels/promo-palette.ts`
 * e `promo-background.ts`. O signage não depende do pacote do servidor (mesma
 * razão das constantes de paginação em `portal-panel-editor.tsx`); os testes
 * em `__tests__/promo-visual.test.ts` repetem valores do servidor para acusar
 * deriva. Quem decide o visual de verdade é o PNG do servidor.
 */

/** Mesmo limite de `MAX_HEADLINE` em `artifacts/api-server/src/lib/panels/templates.ts`. */
export const MAX_HEADLINE = 40;
/** Mesmo limite de `MAX_PROMO_NAME`: 52px de Fredoka Bold, 20 maiúsculas cabem em 670px. */
export const MAX_PROMO_NAME = 20;
/** Mesmo limite de `MAX_BODY`. */
export const MAX_BODY = 160;

/**
 * Corta texto que não cabe no quadro, mesma regra de
 * `artifacts/api-server/src/lib/panels/format.ts`: o selo da promoção usa
 * `MAX_HEADLINE` para não estourar a cápsula.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // slice(0, max - 1) com max <= 0 cria um índice negativo, fazendo JavaScript
  // contar a partir do fim da string. Isto violaria o contrato: nunca exceder max.
  if (max <= 0) return '';
  const cut = text.slice(0, max - 1).trimEnd();
  return `${cut}…`;
}

export const DEFAULT_ACCENT_COLOR = '#D63A6A';
const LIGHT_TEXT = '#FFFFFF';
const DARK_TEXT = '#1F1B2E';
/** Quanto do tom escuro entra na cor para desenhar o preço (roxo da referência). */
const PRICE_DARKEN = 0.85;
/** WCAG para texto grande: o preço tem 170px, 3:1 basta. */
const PRICE_MIN_CONTRAST = 3;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export type PromoStyle = 'price' | 'percent';

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
    .map((c, i) => Math.round(c * (1 - amount) + target[i]! * amount).toString(16).padStart(2, '0'))
    .join('');
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
  if (style !== 'percent' || !item) return 'price';
  const { priceCents, oldPriceCents } = item;
  if (oldPriceCents === null || priceCents <= 0 || oldPriceCents <= priceCents) return 'price';
  return discountPercent(oldPriceCents, priceCents) >= 1 ? 'percent' : 'price';
}

const WIDTH = 1920;
const HEIGHT = 1080;

/** x da diagonal no topo e na base do quadro. */
export const PROMO_SPLIT_TOP = 980;
export const PROMO_SPLIT_BOTTOM = 830;
/** Onde a foto começa: um pouco antes da diagonal, para ela passar por trás. */
export const PROMO_PHOTO_LEFT = 730;

/**
 * Tamanho que a foto ocupa no slide. Abaixo disto a TV mostra a imagem
 * esticada, então o editor avisa — sem bloquear, porque quem manda no
 * recorte é o `objectFit: cover` do renderizador, não a resolução.
 */
export const PROMO_PHOTO_WIDTH = WIDTH - PROMO_PHOTO_LEFT;
export const PROMO_PHOTO_HEIGHT = HEIGHT;

/** Cabe exatamente na coluna de conteúdo com foto (`PROMO_SPLIT_BOTTOM - 160` em `panel-preview.tsx`). */
const BADGE_MAX_WIDTH = 670;
const BADGE_HORIZONTAL_PADDING = 112;
/** Largura média de um caractere maiúsculo da Fredoka Bold, em frações da fonte. */
const BADGE_CHAR_WIDTH = 0.7;
const BADGE_HEIGHT_RATIO = 1.9;
const BADGE_INSET = 6;

export function promoBackgroundSvg(opts: { color: string; ornament: string; hasImage: boolean }): string {
  const { color, ornament, hasImage } = opts;
  const shape = hasImage
    ? `<polygon points="0,0 ${PROMO_SPLIT_TOP},0 ${PROMO_SPLIT_BOTTOM},${HEIGHT} 0,${HEIGHT}" fill="${color}"/>`
    : `<rect width="${WIDTH}" height="${HEIGHT}" fill="${color}"/>`;
  // Enfeites no alto do painel, acima de y=290 — o conteúdo começa em 310.
  const strokes =
    `<g fill="none" stroke="${ornament}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">` +
    `<path d="M80 230 q30 -34 60 0 t60 0 t60 0 t60 0" stroke-width="14"/>` +
    `<path d="M360 150 h90" stroke-width="12"/>` +
    `<circle cx="430" cy="245" r="34" stroke-width="8"/>` +
    `<path d="M490 245 h30 M505 230 v30" stroke-width="5"/>` +
    `<path d="M740 50 l20 20 l-20 20 l20 20 l-20 20" stroke-width="7"/>` +
    `<path d="M790 110 h30 M805 95 v30" stroke-width="5"/>` +
    `</g>`;
  const dots =
    `<g fill="${ornament}" opacity="0.85">` +
    `<circle cx="530" cy="165" r="26"/>` +
    `<circle cx="750" cy="160" r="9"/>` +
    `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${shape}${strokes}${dots}</svg>`;
}

/**
 * Tamanho do selo. O satori não mede texto antes de desenhar, então a largura
 * é estimada pela contagem de caracteres; o teto evita invadir a foto.
 *
 * Os degraus de fonte descem o suficiente para a estimativa
 * `length × BADGE_CHAR_WIDTH × fontSize + BADGE_HORIZONTAL_PADDING` caber em
 * BADGE_MAX_WIDTH até o limite de 40 caracteres (`MAX_HEADLINE`). Sem isso o
 * satori quebraria o texto em duas linhas dentro de um selo de altura fixa e a
 * segunda linha sairia por cima da borda pontilhada.
 */
export function promoBadgeMetrics(text: string): { fontSize: number; width: number; height: number } {
  const length = text.length;
  const fontSize =
    length <= 10 ? 79 : length <= 15 ? 53 : length <= 21 ? 37 : length <= 28 ? 28 : 19;
  const width = Math.min(
    BADGE_MAX_WIDTH,
    Math.round(length * BADGE_CHAR_WIDTH * fontSize) + BADGE_HORIZONTAL_PADDING,
  );
  return { fontSize, width, height: Math.round(fontSize * BADGE_HEIGHT_RATIO) };
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

/** Cápsula de pontos: traço de comprimento 0 com ponta redonda vira ponto. */
export function promoBadgeSvg(opts: { width: number; height: number; stroke: string }): string {
  const { width, height, stroke } = opts;
  const innerWidth = width - BADGE_INSET * 2;
  const innerHeight = height - BADGE_INSET * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect x="${BADGE_INSET}" y="${BADGE_INSET}" width="${innerWidth}" height="${innerHeight}" rx="${innerHeight / 2}" ` +
    `fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-dasharray="0 22"/>` +
    `</svg>`
  );
}
