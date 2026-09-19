const PG_UNIQUE_VIOLATION = "23505";

function pgCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  return (err as { code?: string }).code;
}

/**
 * drizzle-orm 0.45.2 embrulha o erro do driver `pg` em `DrizzleQueryError`
 * (`node_modules/drizzle-orm/pg-core/session.js`, `queryWithCache`): o `catch`
 * ali relança um erro novo com a causa original em `.cause`, então o código do
 * pg (ex.: `23505` de violação de unicidade) só está em `err.cause.code` — o
 * `err.code` do erro relançado é `undefined`. Checa os dois lugares para
 * cobrir essa versão e qualquer driver que ainda repasse o erro cru.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (pgCode(err) === PG_UNIQUE_VIOLATION) return true;
  if (typeof err !== "object" || err === null) return false;
  const cause = (err as { cause?: unknown }).cause;
  return pgCode(cause) === PG_UNIQUE_VIOLATION;
}
