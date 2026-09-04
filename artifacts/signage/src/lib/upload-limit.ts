import { useQueryClient } from '@tanstack/react-query';

export const BYTES_PER_MB = 1024 * 1024;

/**
 * Espelha DEFAULT_MAX_UPLOAD_BYTES do servidor. É só o fallback: o limite real
 * vem em GET /api/auth/me e pode ser trocado por MAX_UPLOAD_BYTES sem tocar no
 * cliente.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 20 * BYTES_PER_MB;

/**
 * Lê do cache em vez de assinar a query: nenhuma tela do painel monta antes de
 * ['auth'] resolver (o RoleRouter segura), então o valor já está lá e não há
 * requisição extra nem re-render a esperar.
 */
export function useMaxUploadBytes(): number {
  const queryClient = useQueryClient();
  const me = queryClient.getQueryData<{ maxUploadBytes?: number }>(['auth']);
  const limit = me?.maxUploadBytes;
  return typeof limit === 'number' && limit > 0 ? limit : DEFAULT_MAX_UPLOAD_BYTES;
}

export function formatUploadLimit(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MB)}MB`;
}
