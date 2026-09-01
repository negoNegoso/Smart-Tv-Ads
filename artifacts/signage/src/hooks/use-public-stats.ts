import { useQuery } from '@tanstack/react-query';

export interface PublicStats {
  plays30d: number;
  activeScreens: number;
  clients: number;
  segments: number;
}

/**
 * Números da faixa de prova da landing.
 *
 * Falha vira `null`, nunca erro na tela: uma página pública de captação não
 * pode contar ao visitante que a API caiu. Quem renderiza decide sumir com a
 * faixa.
 */
export function usePublicStats() {
  return useQuery<PublicStats | null>({
    queryKey: ['public-stats'],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/public/stats`);
        if (!res.ok) return null;
        return (await res.json()) as PublicStats;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
