const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos inteiros → "R$ 1.234,56". */
export function formatCents(cents: number): string {
  return reais.format(cents / 100);
}

// Milhar com ponto opcional, vírgula decimal com 1 ou 2 casas.
const REAIS = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

/**
 * Texto em reais digitado pelo admin → centavos. Aceita "15", "15,5",
 * "1234,56" e "1.234,56"; qualquer outra coisa é null (o formulário não
 * envia). Conta em inteiros para não perder centavo com ponto flutuante.
 */
export function parseReais(texto: string): number | null {
  const limpo = texto.trim();
  if (!REAIS.test(limpo)) return null;
  const [inteiro, decimal = ''] = limpo.replace(/\./g, '').split(',');
  return Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
}
