/**
 * Peças que o próprio sistema gera: a arte do aviso urgente ("alert") e o
 * slide de clima e hora ("editorial"). Não são anúncio — não contam
 * exibição, não aparecem na biblioteca e não se escolhem nem se editam à mão.
 */
export const SYSTEM_SOURCES = ["alert", "editorial"] as const;

export function isSystemSource(source: string | null | undefined): boolean {
  return source != null && (SYSTEM_SOURCES as readonly string[]).includes(source);
}
