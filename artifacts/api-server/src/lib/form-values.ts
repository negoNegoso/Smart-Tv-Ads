/**
 * FormData envia todos os campos como string — converte os valores booleanos
 * antes da validação Zod. Devolve `undefined` quando o campo não foi enviado.
 */
export function parseFormBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "off" || value === "0") return false;
  return undefined;
}
