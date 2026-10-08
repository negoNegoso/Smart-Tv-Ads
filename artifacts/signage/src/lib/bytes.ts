const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "340 MB", "1,2 GB": o bastante para o admin ver se o box está apertado. */
export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(n / MB)} MB`;
}
