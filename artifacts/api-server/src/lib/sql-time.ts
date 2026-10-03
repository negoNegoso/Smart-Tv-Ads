import { sql, type AnyColumn } from "drizzle-orm";
import { BUSINESS_TIME_ZONE } from "./ad-eligibility";

/**
 * Dia e hora locais do negócio dentro do SQL. O fuso entra por `sql.raw`, e
 * não como parâmetro: assim o SELECT e o GROUP BY saem com o mesmo texto e o
 * Postgres aceita o agrupamento. Use só no SELECT/GROUP BY — o WHERE filtra
 * pelo timestamp cru para usar os índices por `created_at`.
 */
const ZONE = sql.raw(`'${BUSINESS_TIME_ZONE}'`);

export function dayKeySql(column: AnyColumn) {
  return sql<string>`to_char((${column} AT TIME ZONE ${ZONE})::date, 'YYYY-MM-DD')`;
}

export function hourOfDaySql(column: AnyColumn) {
  return sql<number>`EXTRACT(HOUR FROM (${column} AT TIME ZONE ${ZONE}))::int`;
}
