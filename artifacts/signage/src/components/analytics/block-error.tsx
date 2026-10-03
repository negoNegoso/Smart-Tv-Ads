import { Button } from '@/components/ui/button';

/**
 * Erro de um bloco só. Cada bloco da Visão geral carrega sozinho: o ranking
 * fora do ar não pode apagar os gráficos.
 */
export function BlockError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <p className="text-sm text-muted-foreground">Não foi possível carregar</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
