import { contrastRatio, normalizeHex, readableTextOn } from "./color-contrast";

export const DEFAULT_FLYER_BACKGROUND = "#0B6B3A";
export const DEFAULT_FLYER_BAND = "#FFC20E";
/** WCAG para texto grande: o preço do encarte passa de 60px. */
const PRICE_MIN_CONTRAST = 3;

export interface FlyerPalette {
  background: string;
  band: string;
  textOnBackground: string;
  textOnBand: string;
  priceOnBackground: string;
  priceOnBand: string;
}

/**
 * Cores do encarte a partir das duas cores da marca. Como na referência
 * (fundo verde, faixa amarela), o preço de uma superfície usa a cor da outra
 * — desde que dê para ler; senão cai para a cor do texto.
 */
export function flyerPalette(brand: string | null | undefined, accent: string | null | undefined): FlyerPalette {
  const background = normalizeHex(brand, DEFAULT_FLYER_BACKGROUND);
  const band = normalizeHex(accent, DEFAULT_FLYER_BAND);
  const textOnBackground = readableTextOn(background);
  const textOnBand = readableTextOn(band);
  const readable = contrastRatio(background, band) >= PRICE_MIN_CONTRAST;
  return {
    background,
    band,
    textOnBackground,
    textOnBand,
    priceOnBackground: readable ? band : textOnBackground,
    priceOnBand: readable ? background : textOnBand,
  };
}
