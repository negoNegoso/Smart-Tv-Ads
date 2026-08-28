/**
 * Decide o texto que a TV mostra sobre a imagem do slide.
 *
 * O título da peça é um rótulo interno do painel; quem vai ao ar é o
 * `displayText`, e só quando `showText` está ligado.
 */
/**
 * Prepara o texto vindo do formulário para gravação: campo em branco vira
 * `null` no banco, campo ausente permanece `undefined` (não altera a coluna).
 */
export function normalizeDisplayText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const text = value?.trim();
  return text ? text : null;
}

export function resolveSlideCaption(input: {
  showText: boolean;
  displayText: string | null;
}): string | null {
  if (!input.showText) return null;
  const text = input.displayText?.trim();
  return text ? text : null;
}
