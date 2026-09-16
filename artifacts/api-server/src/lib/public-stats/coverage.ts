import { VALE_DO_RIBEIRA_IBGE } from "@workspace/db/vale-do-ribeira";

/** Uma cidade acesa no mapa da landing. Só código e contagem: nome de empresa nunca sai daqui. */
export interface CityCoverage {
  ibge: string;
  companies: number;
}

const DENTRO_DO_VALE = new Set(VALE_DO_RIBEIRA_IBGE);

/**
 * Converte o resultado do GROUP BY no que a landing consome.
 *
 * Puro de propósito: é a regra que erra em silêncio. Cidade fora do recorte,
 * empresa sem CEP consultado (ibge nulo) e contagem zero saem aqui, não no SQL,
 * para que o teste possa provar cada descarte sem banco.
 *
 * Ordem por contagem desc (o front seleciona o primeiro), empate pelo código
 * para o render ser determinístico.
 */
export function coverageFromRows(
  rows: { ibge: string | null; companies: number }[],
): CityCoverage[] {
  return rows
    .filter((row): row is { ibge: string; companies: number } =>
      row.ibge !== null && DENTRO_DO_VALE.has(row.ibge) && row.companies > 0,
    )
    .map((row) => ({ ibge: row.ibge, companies: row.companies }))
    .sort((a, b) => b.companies - a.companies || a.ibge.localeCompare(b.ibge));
}
