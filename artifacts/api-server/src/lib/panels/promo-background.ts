/**
 * Desenho do slide de promoção que o satori não sabe fazer sozinho: corte
 * diagonal, enfeites geométricos e borda pontilhada. Tudo sai como string SVG
 * e entra no template como `data:` URI; o resvg desenha SVG nativo com
 * fidelidade. O portal (`artifacts/signage/src/lib/promo-visual.ts`) tem uma
 * cópia para a prévia — mudança aqui precisa ser espelhada lá.
 */

const WIDTH = 1920;
const HEIGHT = 1080;

/** x da diagonal no topo e na base do quadro. */
export const PROMO_SPLIT_TOP = 1120;
export const PROMO_SPLIT_BOTTOM = 960;
/** Onde a foto começa: um pouco antes da diagonal, para ela passar por trás. */
export const PROMO_PHOTO_LEFT = 860;

const BADGE_MAX_WIDTH = 800;
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
    `<path d="M880 50 l20 20 l-20 20 l20 20 l-20 20" stroke-width="7"/>` +
    `<path d="M930 110 h30 M945 95 v30" stroke-width="5"/>` +
    `</g>`;
  const dots =
    `<g fill="${ornament}" opacity="0.85">` +
    `<circle cx="530" cy="165" r="26"/>` +
    `<circle cx="890" cy="160" r="9"/>` +
    `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${shape}${strokes}${dots}</svg>`;
}

/**
 * Tamanho do selo. O satori não mede texto antes de desenhar, então a largura
 * é estimada pela contagem de caracteres; o teto evita invadir a foto.
 */
export function promoBadgeMetrics(text: string): { fontSize: number; width: number; height: number } {
  const length = text.length;
  const fontSize = length <= 10 ? 96 : length <= 16 ? 64 : 44;
  const width = Math.min(
    BADGE_MAX_WIDTH,
    Math.round(length * BADGE_CHAR_WIDTH * fontSize) + BADGE_HORIZONTAL_PADDING,
  );
  return { fontSize, width, height: Math.round(fontSize * BADGE_HEIGHT_RATIO) };
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
