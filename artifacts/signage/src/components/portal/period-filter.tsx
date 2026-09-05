// artifacts/signage/src/components/portal/period-filter.tsx
import { Button } from '@/components/ui/button';

export type PortalDays = 7 | 30 | 90;
export const PORTAL_DAYS: readonly PortalDays[] = [7, 30, 90];

/**
 * O período escolhido governa a página inteira — cards, gráfico e tabela.
 * Um gráfico de 30 dias ao lado de uma tabela acumulada daria dois números
 * diferentes para a mesma pergunta na mesma tela.
 */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: PortalDays;
  onChange: (days: PortalDays) => void;
}) {
  return (
    <div className="flex gap-1 print:hidden" role="group" aria-label="Período">
      {PORTAL_DAYS.map((days) => (
        <Button
          key={days}
          type="button"
          size="sm"
          variant={days === value ? 'default' : 'outline'}
          aria-pressed={days === value}
          onClick={() => onChange(days)}
        >
          {days} dias
        </Button>
      ))}
    </div>
  );
}
