const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

function pgCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  return (err as { code?: string }).code;
}

/** Código do pg no erro cru ou na causa embrulhada pelo drizzle (ver abaixo). */
function hasPgCode(err: unknown, code: string): boolean {
  if (pgCode(err) === code) return true;
  if (typeof err !== "object" || err === null) return false;
  return pgCode((err as { cause?: unknown }).cause) === code;
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
  return hasPgCode(err, PG_UNIQUE_VIOLATION);
}

/** Chave estrangeira apontando para linha que não existe (ex.: segmento apagado). */
export function isForeignKeyViolation(err: unknown): boolean {
  return hasPgCode(err, PG_FOREIGN_KEY_VIOLATION);
}
