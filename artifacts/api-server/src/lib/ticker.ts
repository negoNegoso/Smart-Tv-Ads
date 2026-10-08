/** Limites da faixa de recados: o que cabe ler passando na frente da TV. */
export const MAX_TICKER_MESSAGES = 5;
export const MAX_TICKER_LENGTH = 80;

export type TickerNormalization = { ok: true; messages: string[] } | { ok: false; error: string };

/**
 * Lista que o admin mandou → lista gravada. Espaços das pontas saem e recado
 * vazio é descartado antes de contar o limite: campo deixado em branco no
 * formulário não pode virar " ·  · " na TV nem estourar os 5.
 */
export function normalizeTickerMessages(input: unknown): TickerNormalization {
  if (!Array.isArray(input) || input.some((message) => typeof message !== "string")) {
    return { ok: false, error: "Recados inválidos." };
  }
  const messages = (input as string[]).map((message) => message.trim()).filter((message) => message.length > 0);
  if (messages.length > MAX_TICKER_MESSAGES) return { ok: false, error: "Até 5 recados." };
  if (messages.some((message) => message.length > MAX_TICKER_LENGTH)) {
    return { ok: false, error: "Cada recado tem até 80 caracteres." };
  }
  return { ok: true, messages };
}

/** Texto que corre na faixa. O servidor junta para os dois players mostrarem igual. */
export function tickerText(messages: string[]): string | null {
  return messages.length > 0 ? messages.join(" · ") : null;
}
