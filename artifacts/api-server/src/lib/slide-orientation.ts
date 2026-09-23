import { pieceOrientationOf, type AnnouncementOrientation } from "@workspace/db/orientation";

/**
 * A TV só toca peça da orientação dela: horizontal numa TV em pé sairia
 * minúscula ou cortada. Mantém a ordem da rotação.
 */
export function filterByOrientation<T extends { orientation: string | null }>(
  slides: T[],
  screen: AnnouncementOrientation,
): T[] {
  return slides.filter((slide) => pieceOrientationOf(slide.orientation) === screen);
}
