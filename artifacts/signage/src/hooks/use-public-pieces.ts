import { useQuery } from '@tanstack/react-query';

export interface PublicPiece {
  imageUrl: string;
  caption: string | null;
  orientation: 'landscape' | 'portrait';
  kind: 'image' | 'video' | 'flyer';
}

/**
 * Peças no ar para a TV da landing.
 *
 * Mesma regra de `usePublicStats`: falha vira lista vazia, nunca erro na
 * tela. Sem peça, a TV mostra o slide de exemplo desenhado em CSS.
 */
export function usePublicPieces() {
  return useQuery<PublicPiece[]>({
    queryKey: ['public-pieces'],
    queryFn: async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/public/pieces`);
        if (!res.ok) return [];
        const body = (await res.json()) as { pieces?: PublicPiece[] };
        return body.pieces ?? [];
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
