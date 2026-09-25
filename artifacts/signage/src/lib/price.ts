export interface PriceParseResult {
  ok: boolean;
  cents: number;
}

/**
 * Preço digitado vira centavos inteiros, ou falha — nunca em silêncio. Um
 * preço na parede não pode nascer de uma coerção que ninguém vê.
 *
 * Duas leituras, dependendo do que foi digitado:
 *
 *  - Só dígitos ("1290"): atalho sem separador — os dois últimos dígitos
 *    são os centavos. "1290" -> 1290 (R$ 12,90).
 *  - Com separador decimal ("," ou "."): lido como moeda brasileira. Quando
 *    os dois aparecem, "." é separador de milhar e "," é o decimal
 *    ("1.234,56" -> 123456). Com um só, ele é o decimal — um único dígito
 *    decimal é lido como décimos ("1,5" -> 150, R$ 1,50). Três ou mais
 *    dígitos decimais não é um preço válido ("12,345" falha).
 *
 * Vazio, só letras, ou com decimais demais: `ok: false`. Um item de
 * cortesia deliberado é digitado "0,00", que é válido e vale 0 — bem
 * diferente de um campo vazio, que não é um preço.
 */
export function parsePriceToCents(raw: string): PriceParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, cents: 0 };

  const hasComma = trimmed.includes(',');
  const hasDot = trimmed.includes('.');

  if (!hasComma && !hasDot) {
    if (!/^\d+$/.test(trimmed)) return { ok: false, cents: 0 };
    return { ok: true, cents: parseInt(trimmed, 10) };
  }

  // "," manda quando os dois aparecem (ela é sempre o decimal em pt-BR); só
  // sobra "." como decimal quando "," não apareceu.
  const decimalSep = hasComma ? ',' : '.';
  const lastIndex = trimmed.lastIndexOf(decimalSep);
  const integerRaw = trimmed.slice(0, lastIndex);
  const decimalRaw = trimmed.slice(lastIndex + 1);

  const decimalDigits = decimalRaw.replace(/\D/g, '');
  if (decimalRaw !== decimalDigits || decimalDigits.length === 0 || decimalDigits.length > 2) {
    return { ok: false, cents: 0 };
  }

  // A parte inteira pode conter o outro separador como milhar (ex.: "1.234"
  // antes de ","), mas nenhum outro caractere — letra ali é erro de digitação.
  if (integerRaw !== '' && !/^[\d.,]*$/.test(integerRaw)) return { ok: false, cents: 0 };
  const integerDigits = integerRaw.replace(/\D/g, '');

  const reais = integerDigits === '' ? 0 : parseInt(integerDigits, 10);
  const cents = decimalDigits.length === 1 ? Number(decimalDigits) * 10 : Number(decimalDigits);
  return { ok: true, cents: reais * 100 + cents };
}
