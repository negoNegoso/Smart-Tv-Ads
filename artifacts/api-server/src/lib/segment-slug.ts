/**
 * Converte o nome do segmento na chave estável usada no banco. O slug é o que
 * torna "Farmácia" e "farmacia" o mesmo ramo — sem isso, a regra de
 * concorrência deixaria passar anúncio de concorrente por erro de digitação.
 */
export function toSegmentSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
