const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Centavos inteiros para o texto que vai à tela. Nunca receba float aqui. */
export function formatPriceBRL(cents: number): string {
  // Intl emite U+00A0 (NO-BREAK SPACE) entre "R$" e os dígitos.
  // Normalizamos para espaço comum (U+0020) para testes e exibição.
  return BRL.format(cents / 100).replace(/ /g, " ");
}

/**
 * Corta texto que não cabe no quadro. O satori quebraria a linha e empurraria o
 * layout para fora dos 1080px; cortar mantém a página legível.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).trimEnd();
  if (cut.length + 2 === max && cut.length > 10) {
    return `${cut} …`;
  }
  return `${cut}…`;
}
