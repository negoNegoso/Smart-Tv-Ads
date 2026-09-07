const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Centavos inteiros para o texto que vai à tela. Nunca receba float aqui. */
export function formatPriceBRL(cents: number): string {
  // Intl emite U+00A0 (NO-BREAK SPACE) ou U+202F (NARROW NO-BREAK SPACE) entre "R$"
  // e os dígitos conforme a versão do Node/ICU. Normalizamos para espaço comum
  // (U+0020) para testes e exibição consistente.
  return BRL.format(cents / 100).replace(/[  ]/g, " ");
}

/**
 * Corta texto que não cabe no quadro. O satori quebraria a linha e empurraria o
 * layout para fora dos 1080px; cortar mantém a página legível.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  // slice(0, max - 1) com max <= 0 cria um índice negativo, fazendo JavaScript
  // contar a partir do fim da string. Isto violaria o contrato: nunca exceder max.
  if (max <= 0) return "";
  const cut = text.slice(0, max - 1).trimEnd();
  return `${cut}…`;
}
