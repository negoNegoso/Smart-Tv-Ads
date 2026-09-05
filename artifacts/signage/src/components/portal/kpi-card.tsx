// artifacts/signage/src/components/portal/kpi-card.tsx
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Delta } from './delta';

const ARROW = { up: ArrowUp, down: ArrowDown, flat: ArrowRight } as const;
const TONE = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-muted-foreground',
} as const;

export function KpiCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  delta?: Delta | null;
  hint?: string;
}) {
  const Arrow = delta ? ARROW[delta.direction] : null;
  return (
    <Card className="break-inside-avoid">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
            {delta !== undefined && (
              <p className={cn('mt-1 flex items-center gap-1 text-xs', delta ? TONE[delta.direction] : 'text-muted-foreground')}>
                {Arrow ? <Arrow className="h-3 w-3" aria-hidden /> : null}
                <span>{delta ? delta.label : '—'}</span>
                {delta ? <span className="text-muted-foreground">vs. período anterior</span> : null}
              </p>
            )}
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
