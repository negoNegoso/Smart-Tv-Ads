const BYTES_PER_MB = 1024 * 1024;

export const DEFAULT_MAX_UPLOAD_BYTES = 20 * BYTES_PER_MB;

export function maxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAX_UPLOAD_BYTES;
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_UPLOAD_BYTES;
  return Math.floor(parsed);
}

export function uploadTooLargeMessage(bytes: number): string {
  return `Imagem acima do limite de ${Math.round(bytes / BYTES_PER_MB)} MB.`;
}
