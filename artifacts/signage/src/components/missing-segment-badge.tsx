import { Badge } from '@/components/ui/badge';

/** Empresa de cadastro antigo, sem segmento: fora da regra do concorrente até alguém completar. */
export function MissingSegmentBadge() {
  return (
    <Badge variant="destructive" title="A regra do concorrente não vale para esta empresa.">
      Sem segmento
    </Badge>
  );
}
