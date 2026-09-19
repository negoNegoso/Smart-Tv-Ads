/** Mesmo formato que `POST /devices` gera: 16 hex maiúsculos. */
export const DEVICE_KEY_PATTERN = /^[0-9A-F]{16}$/;

/**
 * A TV mostra a key em blocos (`A1B2-C3D4-…`) e quem digita à mão pode usar
 * minúsculas: tudo isso é a mesma key.
 */
export function normalizeDeviceKey(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function parseDeviceKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = normalizeDeviceKey(raw);
  return DEVICE_KEY_PATTERN.test(key) ? key : null;
}
